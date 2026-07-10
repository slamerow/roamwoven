import { getOpenAIConfig } from "@/lib/env";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MIN_STRUCTURED_OUTPUT_TOKENS = 12000;
const OCR_MAX_ATTEMPTS = 2;
const RETRY_STRUCTURED_OUTPUT_TOKENS = 20000;
const TRANSIENT_OPENAI_STATUS_CODES = new Set([
  408,
  409,
  429,
  500,
  502,
  503,
  504,
]);

type OpenAIConfig = ReturnType<typeof getOpenAIConfig>;

export class OpenAIExtractionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIExtractionConfigError";
  }
}

export class OpenAIExtractionRequestError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
    public details: unknown = null
  ) {
    super(message);
    this.name = "OpenAIExtractionRequestError";
  }
}

type OpenAIResponseContent = {
  text?: unknown;
  type?: unknown;
};

type OpenAIResponseOutput = {
  content?: unknown;
};

type OpenAIResponseBody = {
  error?: {
    message?: string;
  };
  incomplete_details?: {
    reason?: string;
  };
  output?: unknown;
  output_text?: unknown;
  status?: unknown;
  usage?: unknown;
};

export type OpenAIStructuredResponseResult = {
  json: unknown;
  model: string;
  rawText: string;
  usage: unknown;
};

export type OpenAIOcrInput = {
  base64: string;
  filename: string;
  mimeType: string;
};

export type OpenAIOcrResult = {
  model: string;
  pageNumbers: number[];
  text: string;
  usage: unknown;
};

export type OpenAIOcrOptions = {
  maxOutputTokens?: number;
  originalPageNumbers?: number[];
};

function getResponseText(body: OpenAIResponseBody) {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  if (!Array.isArray(body.output)) {
    return null;
  }

  const parts: string[] = [];

  for (const output of body.output as OpenAIResponseOutput[]) {
    if (!Array.isArray(output.content)) {
      continue;
    }

    for (const content of output.content as OpenAIResponseContent[]) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("").trim() || null;
}

function isLikelyIncompleteJsonParseError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown JSON parse error.";

  return (
    message.includes("Unterminated string") ||
    message.includes("Unexpected end")
  );
}

async function requestStructuredResponse({
  apiKey,
  input,
  maxInputChars,
  maxOutputTokens,
  model,
  schema,
  schemaName,
  system,
}: {
  apiKey: string;
  input: string;
  maxInputChars: number;
  maxOutputTokens: number;
  model: string;
  schema: Record<string, unknown>;
  schemaName: string;
  system: string;
}) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: [
        {
          content: system,
          role: "system",
        },
        {
          content: input.slice(0, maxInputChars),
          role: "user",
        },
      ],
      max_output_tokens: maxOutputTokens,
      model,
      service_tier: "default",
      store: false,
      text: {
        format: {
          name: schemaName,
          schema,
          strict: true,
          type: "json_schema",
        },
      },
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | OpenAIResponseBody
    | null;

  if (!response.ok) {
    throw new OpenAIExtractionRequestError(
      body?.error?.message ?? `OpenAI request failed with ${response.status}.`,
      response.status
    );
  }

  if (!body) {
    throw new OpenAIExtractionRequestError(
      "OpenAI returned an empty or unreadable response."
    );
  }

  return body;
}

function getPartialOutputDetails(rawText: string | null) {
  return {
    partialOutputCharCount: rawText?.length ?? 0,
    partialOutputPreview: rawText ? rawText.slice(0, 2000) : null,
  };
}

function parseStructuredResponseBody(body: OpenAIResponseBody) {
  const rawText = getResponseText(body);

  if (body.status === "incomplete") {
    throw new OpenAIExtractionRequestError(
      `OpenAI returned an incomplete structured response${
        body.incomplete_details?.reason
          ? `: ${body.incomplete_details.reason}`
          : ""
      }.`,
      null,
      {
        incompleteReason: body.incomplete_details?.reason ?? null,
        ...getPartialOutputDetails(rawText),
      }
    );
  }

  if (!rawText) {
    throw new OpenAIExtractionRequestError(
      "OpenAI response did not include structured output text."
    );
  }

  try {
    return {
      json: JSON.parse(rawText) as unknown,
      rawText,
    };
  } catch (error) {
    if (isLikelyIncompleteJsonParseError(error)) {
      throw new OpenAIExtractionRequestError(
        "OpenAI returned an incomplete structured response before the trip draft could be saved.",
        null,
        getPartialOutputDetails(rawText)
      );
    }

    throw new OpenAIExtractionRequestError(
      `OpenAI returned structured output that could not be parsed as JSON: ${
        error instanceof Error ? error.message : "Unknown JSON parse error."
      }`
    );
  }
}

export async function createOpenAIStructuredResponse({
  input,
  schema,
  schemaName,
  system,
}: {
  input: string;
  schema: Record<string, unknown>;
  schemaName: string;
  system: string;
}): Promise<OpenAIStructuredResponseResult> {
  const config = getOpenAIConfig();

  if (!config.extractionEnabled) {
    throw new OpenAIExtractionConfigError(
      "AI extraction is disabled. Set ROAMWOVEN_ENABLE_AI_EXTRACTION=true to allow paid extraction calls."
    );
  }

  if (!config.apiKey) {
    throw new OpenAIExtractionConfigError(
      "OPENAI_API_KEY is missing. Add a server-side OpenAI API key before running extraction."
    );
  }

  const initialMaxOutputTokens = Math.max(
    config.maxOutputTokens,
    MIN_STRUCTURED_OUTPUT_TOKENS
  );
  const firstBody = await requestStructuredResponse({
    apiKey: config.apiKey,
    input,
    maxInputChars: config.maxInputChars,
    maxOutputTokens: initialMaxOutputTokens,
    model: config.extractionModel,
    schema,
    schemaName,
    system,
  });

  let body = firstBody;
  let parsed: ReturnType<typeof parseStructuredResponseBody>;

  try {
    parsed = parseStructuredResponseBody(firstBody);
  } catch (error) {
    if (
      error instanceof OpenAIExtractionRequestError &&
      error.message.includes("incomplete structured response")
    ) {
      console.warn("trip_extraction_retrying_incomplete_output", {
        initialMaxOutputTokens,
        retryMaxOutputTokens: RETRY_STRUCTURED_OUTPUT_TOKENS,
      });
      body = await requestStructuredResponse({
        apiKey: config.apiKey,
        input,
        maxInputChars: config.maxInputChars,
        maxOutputTokens: RETRY_STRUCTURED_OUTPUT_TOKENS,
        model: config.extractionModel,
        schema,
        schemaName,
        system,
      });
      parsed = parseStructuredResponseBody(body);
    } else {
      throw error;
    }
  }

  return {
    json: parsed.json,
    model: config.extractionModel,
    rawText: parsed.rawText,
    usage: body.usage ?? null,
  };
}

function isSupportedOcrMimeType(mimeType: string) {
  return (
    mimeType === "application/pdf" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}

function getOcrContent(
  input: OpenAIOcrInput,
  detail: OpenAIConfig["ocrImageDetail"]
) {
  const dataUrl = `data:${input.mimeType};base64,${input.base64}`;

  if (input.mimeType === "application/pdf") {
    return {
      file_data: dataUrl,
      filename: input.filename,
      type: "input_file",
    };
  }

  const content = {
    image_url: dataUrl,
    type: "input_image",
  };

  return detail ? { ...content, detail } : content;
}

async function requestOcrText({
  config,
  input,
  options,
}: {
  config: OpenAIConfig;
  input: OpenAIOcrInput;
  options: OpenAIOcrOptions;
}) {
  const pageNumbers = options.originalPageNumbers ?? [];
  const pageCoverageInstruction = pageNumbers.length
    ? [
        `This PDF batch contains original document pages ${pageNumbers.join(", ")}.`,
        "Return one section for every supplied page, in source order, using exactly this header format: === Page N ===.",
        "Use the original page number for N. If a page has no readable text, still include its header followed by [no readable text].",
      ].join(" ")
    : "";
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: [
        {
          content: [
            getOcrContent(input, config.ocrImageDetail),
            {
              text: [
                "Extract all readable travel-planning text from this uploaded material.",
                "Preserve confirmation codes, dates, times, airport/station names, hotel names, addresses, passenger/traveler names, reservation numbers, and cancellation/check-in instructions when visible.",
                "Pay special attention to transport timeline cards and screenshot blocks: preserve route direction, departure and arrival stations or airports, train/flight numbers, operators, dates, durations, and departure/arrival times.",
                pageCoverageInstruction,
                "Return plain text only. If a section is illegible, write [illegible] briefly rather than guessing.",
              ].filter(Boolean).join(" "),
              type: "input_text",
            },
          ],
          role: "user",
        },
      ],
      max_output_tokens:
        options.maxOutputTokens ?? config.ocrMaxOutputTokens,
      model: config.ocrModel,
      service_tier: "default",
      store: false,
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | OpenAIResponseBody
    | null;

  if (!response.ok) {
    throw new OpenAIExtractionRequestError(
      body?.error?.message ?? `OpenAI OCR request failed with ${response.status}.`,
      response.status,
      body ?? null
    );
  }

  if (!body) {
    throw new OpenAIExtractionRequestError(
      "OpenAI OCR returned an empty or unreadable response."
    );
  }

  if (body.status === "incomplete") {
    throw new OpenAIExtractionRequestError(
      `OpenAI OCR returned an incomplete response${
        body.incomplete_details?.reason
          ? `: ${body.incomplete_details.reason}`
          : ""
      }.`,
      null,
      {
        failureClass: "ocr_incomplete_response",
        incompleteReason: body.incomplete_details?.reason ?? null,
        ...getPartialOutputDetails(getResponseText(body)),
      }
    );
  }

  const text = getResponseText(body);

  if (!text) {
    throw new OpenAIExtractionRequestError(
      "OpenAI OCR response did not include extracted text."
    );
  }

  return {
    body,
    text,
  };
}

function shouldRetryOcrRequest(error: unknown) {
  if (error instanceof OpenAIExtractionRequestError) {
    return (
      typeof error.status === "number" &&
      TRANSIENT_OPENAI_STATUS_CODES.has(error.status)
    );
  }

  return error instanceof TypeError;
}

export async function createOpenAIOcrText(
  input: OpenAIOcrInput,
  options: OpenAIOcrOptions = {}
): Promise<OpenAIOcrResult> {
  const config = getOpenAIConfig();

  if (!config.extractionEnabled) {
    throw new OpenAIExtractionConfigError(
      "AI extraction is disabled. Set ROAMWOVEN_ENABLE_AI_EXTRACTION=true to allow OCR calls."
    );
  }

  if (!config.apiKey) {
    throw new OpenAIExtractionConfigError(
      "OPENAI_API_KEY is missing. Add a server-side OpenAI API key before running OCR."
    );
  }

  if (!isSupportedOcrMimeType(input.mimeType)) {
    throw new OpenAIExtractionRequestError(
      `OCR does not support ${input.mimeType || "unknown file type"} yet.`
    );
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await requestOcrText({ config, input, options });

      return {
        model: config.ocrModel,
        pageNumbers: options.originalPageNumbers ?? [],
        text: result.text,
        usage: result.body.usage ?? null,
      };
    } catch (error) {
      lastError = error;

      if (attempt >= OCR_MAX_ATTEMPTS || !shouldRetryOcrRequest(error)) {
        throw error;
      }

      console.warn("openai_ocr_retrying_transient_failure", {
        attempt,
        maxAttempts: OCR_MAX_ATTEMPTS,
        status:
          error instanceof OpenAIExtractionRequestError ? error.status : null,
      });
    }
  }

  throw lastError;
}
