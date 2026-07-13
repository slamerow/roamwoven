import assert from "node:assert/strict";
import { createOpenAIOcrText } from "@/lib/ai/openai";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

export default async function run() {
  await test("OpenAI OCR sends image inputs through Responses API without storage", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalEnabled = process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION;
    const originalDetail = process.env.OPENAI_OCR_IMAGE_DETAIL;
    const originalMaxOutputTokens = process.env.OPENAI_OCR_MAX_OUTPUT_TOKENS;
    let requestBody: Record<string, unknown> | null = null;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_OCR_IMAGE_DETAIL = "high";
    process.env.OPENAI_OCR_MAX_OUTPUT_TOKENS = "14000";
    process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;

      return {
        json: async () => ({
          output_text: "Flight BA 123 departs at 7 PM.",
          usage: { input_tokens: 123, output_tokens: 12 },
        }),
        ok: true,
      } as Response;
    }) as typeof fetch;

    try {
      const result = await createOpenAIOcrText(
        {
          base64: Buffer.from("fake image").toString("base64"),
          filename: "ticket.png",
          mimeType: "image/png",
        },
        { focus: "transport" }
      );

      assert.equal(result.text, "Flight BA 123 departs at 7 PM.");
      const capturedRequest = requestBody as Record<string, unknown> | null;
      assert.equal(capturedRequest?.store, false);
      assert.equal(capturedRequest?.service_tier, "default");
      const input = capturedRequest?.input as Array<Record<string, unknown>>;
      const content = input[0]?.content as Array<Record<string, unknown>>;
      assert.equal(content[0]?.type, "input_image");
      assert.equal(
        String(content[0]?.image_url).startsWith("data:image/png;base64,"),
        true
      );
      assert.equal(content[0]?.detail, "high");
      assert.equal(content[1]?.type, "input_text");
      assert.match(String(content[1]?.text), /bounded verification pass/i);
      assert.equal(capturedRequest?.max_output_tokens, 14000);
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv("OPENAI_API_KEY", originalApiKey);
      restoreEnv("OPENAI_OCR_IMAGE_DETAIL", originalDetail);
      restoreEnv("OPENAI_OCR_MAX_OUTPUT_TOKENS", originalMaxOutputTokens);
      restoreEnv("ROAMWOVEN_ENABLE_AI_EXTRACTION", originalEnabled);
    }
  });

  await test("OpenAI OCR retries transient provider failures", async () => {
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalEnabled = process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION;
    let requestCount = 0;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
    console.warn = () => {};
    globalThis.fetch = (async () => {
      requestCount += 1;

      if (requestCount === 1) {
        return {
          json: async () => ({
            error: { message: "Temporary provider overload." },
          }),
          ok: false,
          status: 503,
        } as Response;
      }

      return {
        json: async () => ({
          output_text: "Train to Vienna departs 09:20.",
          usage: { input_tokens: 456, output_tokens: 18 },
        }),
        ok: true,
        status: 200,
      } as Response;
    }) as typeof fetch;

    try {
      const result = await createOpenAIOcrText({
        base64: Buffer.from("fake image").toString("base64"),
        filename: "ticket.png",
        mimeType: "image/png",
      });

      assert.equal(result.text, "Train to Vienna departs 09:20.");
      assert.equal(requestCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
      console.warn = originalWarn;
      restoreEnv("OPENAI_API_KEY", originalApiKey);
      restoreEnv("ROAMWOVEN_ENABLE_AI_EXTRACTION", originalEnabled);
    }
  });

  await test("OpenAI OCR rejects token-capped partial text", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalEnabled = process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION;

    process.env.OPENAI_API_KEY = "test-key";
    process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
    globalThis.fetch = (async () =>
      ({
        json: async () => ({
          incomplete_details: { reason: "max_output_tokens" },
          output_text: "=== Page 1 ===\nPartial train details",
          status: "incomplete",
          usage: { output_tokens: 12000 },
        }),
        ok: true,
        status: 200,
      }) as Response) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          createOpenAIOcrText(
            {
              base64: Buffer.from("fake pdf").toString("base64"),
              filename: "itinerary-pages-1-4.pdf",
              mimeType: "application/pdf",
            },
            { originalPageNumbers: [1, 2, 3, 4] }
          ),
        (error: unknown) => {
          assert.equal(error instanceof Error, true);
          assert.match((error as Error).message, /incomplete response/i);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnv("OPENAI_API_KEY", originalApiKey);
      restoreEnv("ROAMWOVEN_ENABLE_AI_EXTRACTION", originalEnabled);
    }
  });
}
