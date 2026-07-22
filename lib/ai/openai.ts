import { getOpenAIConfig } from "@/lib/env";
import {
  activeExtractionParseCache,
  hashExtractionModelCall,
} from "@/lib/extraction/extraction-pinning";

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
  action?: unknown;
  content?: unknown;
  type?: unknown;
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
  sources: Array<{ title: string | null; url: string }>;
  usage: unknown;
};

export type OpenAIStructuredWebSearchOptions = {
  maxToolCalls?: number;
  searchContextSize?: "low" | "medium";
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
  focus?: "transport";
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

function getWebSearchSources(body: OpenAIResponseBody) {
  if (!Array.isArray(body.output)) {
    return [];
  }

  const sources = (body.output as OpenAIResponseOutput[]).flatMap((output) => {
    if (output.type !== "web_search_call") {
      return [];
    }

    const action =
      output.action && typeof output.action === "object" && !Array.isArray(output.action)
        ? (output.action as { sources?: unknown })
        : null;

    return Array.isArray(action?.sources)
      ? action.sources.flatMap((source) => {
          if (!source || typeof source !== "object" || Array.isArray(source)) {
            return [];
          }

          const record = source as { title?: unknown; url?: unknown };
          return typeof record.url === "string"
            ? [{
                title: typeof record.title === "string" ? record.title : null,
                url: record.url,
              }]
            : [];
        })
      : [];
  });

  return Array.from(new Map(sources.map((source) => [source.url, source])).values());
}

function isLikelyIncompleteJsonParseError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown JSON parse error.";

  return (
    message.includes("Unterminated string") ||
    message.includes("Unexpected end")
  );
}

// Arc E extraction pinning: env-keyed sampling params (default UNSET — no
// behavior change until flipped; flipping is a migration per AGENTS.md).
// The Responses API may reject temperature/seed for reasoning models —
// requestStructuredResponse strips them fail-soft on a 400 and retries
// once, so a rejected param costs one call, never the run.
export function resolveExtractionSamplingParams(): Record<string, number> {
  const params: Record<string, number> = {};
  const temperature = process.env.OPENAI_EXTRACTION_TEMPERATURE;
  if (temperature !== undefined && temperature.trim() !== "") {
    const value = Number(temperature);
    if (Number.isFinite(value)) params.temperature = value;
  }
  const seed = process.env.OPENAI_EXTRACTION_SEED;
  if (seed !== undefined && seed.trim() !== "") {
    const value = Number.parseInt(seed, 10);
    if (Number.isFinite(value)) params.seed = value;
  }
  return params;
}

async function requestStructuredResponse({
  apiKey,
  input,
  maxInputChars,
  maxOutputTokens,
  model,
  samplingParams = {},
  schema,
  schemaName,
  system,
  webSearch,
}: {
  apiKey: string;
  input: string;
  maxInputChars: number;
  maxOutputTokens: number;
  model: string;
  samplingParams?: Record<string, number>;
  schema: Record<string, unknown>;
  schemaName: string;
  system: string;
  webSearch?: OpenAIStructuredWebSearchOptions;
}) {
  const webSearchRequest = webSearch
    ? {
        include: ["web_search_call.action.sources"],
        max_tool_calls: Math.max(1, Math.min(webSearch.maxToolCalls ?? 3, 3)),
        tool_choice: "auto",
        tools: [{
          search_context_size: webSearch.searchContextSize ?? "low",
          type: "web_search",
        }],
      }
    : {};
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
      ...samplingParams,
      text: {
        format: {
          name: schemaName,
          schema,
          strict: true,
          type: "json_schema",
        },
      },
      ...webSearchRequest,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | OpenAIResponseBody
    | null;

  if (!response.ok) {
    // Fail-soft sampling-param strip (Arc E): a 400 that names the param is
    // retried once WITHOUT temperature/seed and the strip is logged — a
    // rejected param must cost one call, never the run.
    if (
      response.status === 400 &&
      Object.keys(samplingParams).length > 0 &&
      /temperature|seed|unsupported|unknown parameter/i.test(
        body?.error?.message ?? ""
      )
    ) {
      console.warn("trip_extraction_sampling_params_stripped", {
        message: body?.error?.message ?? null,
        model,
        samplingParams,
      });
      return requestStructuredResponse({
        apiKey,
        input,
        maxInputChars,
        maxOutputTokens,
        model,
        samplingParams: {},
        schema,
        schemaName,
        system,
        webSearch,
      });
    }
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
  maxInputChars,
  maxOutputTokens,
  model,
  retryOnIncompleteOutput = true,
  schema,
  schemaName,
  system,
  webSearch,
}: {
  input: string;
  maxInputChars?: number;
  // Hard output cap override (RW-EVD-001 bounded recovery call): when set,
  // it is used as-is — no minimum floor, no incomplete-output retry bump.
  maxOutputTokens?: number;
  // Model override (OPENAI_RECOVERY_MODEL lane); defaults to the configured
  // extraction model.
  model?: string;
  // The bounded recovery call never retries itself; everything else keeps
  // the one incomplete-output retry.
  retryOnIncompleteOutput?: boolean;
  schema: Record<string, unknown>;
  schemaName: string;
  system: string;
  webSearch?: OpenAIStructuredWebSearchOptions;
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

  const requestModel = model ?? config.extractionModel;
  // An explicit maxOutputTokens is a HARD cap (bounded recovery lane): no
  // minimum floor, and maxInputChars is honored as a hard input cap too.
  const hardCaps = maxOutputTokens !== undefined;
  const initialMaxOutputTokens =
    maxOutputTokens ??
    Math.max(config.maxOutputTokens, MIN_STRUCTURED_OUTPUT_TOKENS);
  const effectiveMaxInputChars = hardCaps
    ? Math.min(maxInputChars ?? config.maxInputChars, 120000)
    : Math.max(
        config.maxInputChars,
        Math.min(maxInputChars ?? config.maxInputChars, 120000)
      );

  // Arc E extraction pinning: when a parse cache is active for this run,
  // structured calls are memoized by request content. Web-search calls are
  // never pinned (external content is not replay-safe). Clones on both
  // sides keep downstream payload mutation out of the stored pin.
  const samplingParams = resolveExtractionSamplingParams();
  const parseCache = webSearch ? null : activeExtractionParseCache();
  const callHash = parseCache
    ? hashExtractionModelCall({
        input: input.slice(0, effectiveMaxInputChars),
        model: requestModel,
        samplingParams,
        schema,
        schemaName,
        system,
        version: 1,
      })
    : null;
  if (parseCache && callHash && parseCache.entries.has(callHash)) {
    parseCache.hits += 1;
    return structuredClone(
      parseCache.entries.get(callHash)
    ) as OpenAIStructuredResponseResult;
  }

  const firstBody = await requestStructuredResponse({
    apiKey: config.apiKey,
    input,
    maxInputChars: effectiveMaxInputChars,
    maxOutputTokens: initialMaxOutputTokens,
    model: requestModel,
    schema,
    schemaName,
    system,
    webSearch,
  });

  let body = firstBody;
  let parsed: ReturnType<typeof parseStructuredResponseBody>;

  try {
    parsed = parseStructuredResponseBody(firstBody);
  } catch (error) {
    if (
      retryOnIncompleteOutput &&
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
        maxInputChars: effectiveMaxInputChars,
        maxOutputTokens: RETRY_STRUCTURED_OUTPUT_TOKENS,
        model: requestModel,
        schema,
        schemaName,
        system,
        webSearch,
      });
      parsed = parseStructuredResponseBody(body);
    } else {
      throw error;
    }
  }

  const result: OpenAIStructuredResponseResult = {
    json: parsed.json,
    model: requestModel,
    rawText: parsed.rawText,
    sources: getWebSearchSources(body),
    usage: body.usage ?? null,
  };
  if (parseCache && callHash) {
    parseCache.misses += 1;
    const stored = structuredClone(result);
    parseCache.entries.set(callHash, stored);
    parseCache.recorded.push({ h: callHash, v: stored });
  }
  return result;
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
  const focusedInstruction = options.focus === "transport"
    ? [
        "This is a bounded verification pass for a page whose first OCR pass found incomplete transport evidence.",
        "Return only visible flight, train, bus, ferry, or transfer timeline text, while keeping the required page headers.",
        "For each visible transport card preserve exact route direction, origin, destination, departure time, arrival time, station or airport, operator, number, duration, and booking code.",
        "Do not infer a missing value and do not rewrite station names. Use [not visible] when a field is not readable.",
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
                focusedInstruction,
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
