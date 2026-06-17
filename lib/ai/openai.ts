import { getOpenAIConfig } from "@/lib/env";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export class OpenAIExtractionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIExtractionConfigError";
  }
}

export class OpenAIExtractionRequestError extends Error {
  constructor(
    message: string,
    public status: number | null = null
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
  output?: unknown;
  output_text?: unknown;
  usage?: unknown;
};

export type OpenAIStructuredResponseResult = {
  json: unknown;
  model: string;
  rawText: string;
  usage: unknown;
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

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: [
        {
          content: system,
          role: "system",
        },
        {
          content: input.slice(0, config.maxInputChars),
          role: "user",
        },
      ],
      max_output_tokens: config.maxOutputTokens,
      model: config.extractionModel,
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

  const rawText = getResponseText(body);

  if (!rawText) {
    throw new OpenAIExtractionRequestError(
      "OpenAI response did not include structured output text."
    );
  }

  return {
    json: JSON.parse(rawText) as unknown,
    model: config.extractionModel,
    rawText,
    usage: body.usage ?? null,
  };
}
