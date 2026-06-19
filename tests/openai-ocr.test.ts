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

export default async function run() {
  await test("OpenAI OCR sends image inputs through Responses API without storage", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalEnabled = process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION;
    let requestBody: Record<string, unknown> | null = null;

    process.env.OPENAI_API_KEY = "test-key";
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
      const result = await createOpenAIOcrText({
        base64: Buffer.from("fake image").toString("base64"),
        filename: "ticket.png",
        mimeType: "image/png",
      });

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
      assert.equal(content[1]?.type, "input_text");
    } finally {
      globalThis.fetch = originalFetch;
      process.env.OPENAI_API_KEY = originalApiKey;
      process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = originalEnabled;
    }
  });
}
