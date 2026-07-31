import assert from "node:assert/strict";
import {
  activeExtractionParseCache,
  computeExtractionParseKey,
  createExtractionParseCache,
  fingerprintExtractionMaterials,
  hashExtractionModelCall,
  resolveExtractionPinningEnv,
  runWithExtractionParseCache,
} from "@/lib/extraction/extraction-pinning";
import { resolveExtractionSamplingParams } from "@/lib/ai/openai";

// Arc E extraction pinning: model calls are memoized at the OpenAI client
// boundary; the pin key is material fingerprints + model + sampling params.
// All machinery is env-gated OFF and fail-soft (RW-OPS-001).

export default async function run() {
  const { test } = await import("node:test");

  await test("pinning: call hashes are stable, order-independent for object keys, and input-sensitive", () => {
    const a = hashExtractionModelCall({ input: "x", model: "m", system: "s" });
    const b = hashExtractionModelCall({ system: "s", model: "m", input: "x" });
    const c = hashExtractionModelCall({ input: "y", model: "m", system: "s" });
    assert.equal(a, b, "key order never changes the hash");
    assert.notEqual(a, c, "input changes the hash");
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  await test("pinning: parse key covers materials, model, and sampling params", () => {
    const materials = [{ filename: "czech.pdf", text: "day one" }];
    const fingerprints = fingerprintExtractionMaterials(materials);
    const base = computeExtractionParseKey({
      materialFingerprints: fingerprints,
      model: "gpt-5.4-mini",
      samplingParams: {},
    });
    assert.equal(
      base,
      computeExtractionParseKey({
        materialFingerprints: fingerprintExtractionMaterials(materials),
        model: "gpt-5.4-mini",
        samplingParams: {},
      }),
      "same inputs, same key"
    );
    assert.notEqual(
      base,
      computeExtractionParseKey({
        materialFingerprints: fingerprints,
        model: "gpt-5.4-mini",
        samplingParams: { temperature: 0 },
      }),
      "sampling params change the key"
    );
    assert.notEqual(
      base,
      computeExtractionParseKey({
        materialFingerprints: fingerprintExtractionMaterials([
          { filename: "czech.pdf", text: "day one EDITED" },
        ]),
        model: "gpt-5.4-mini",
        samplingParams: {},
      }),
      "material content changes the key"
    );
  });

  await test("pinning: the cache is only visible inside its async scope and replays seeded calls", async () => {
    assert.equal(activeExtractionParseCache(), null, "no ambient cache");
    const seeded = createExtractionParseCache([
      { h: "abc", v: { json: { ok: true } } },
    ]);
    assert.equal(seeded.seededEntryCount, 1);
    await runWithExtractionParseCache(seeded, async () => {
      const cache = activeExtractionParseCache();
      assert.ok(cache, "cache active inside the scope");
      assert.deepEqual(cache?.entries.get("abc"), { json: { ok: true } });
    });
    assert.equal(activeExtractionParseCache(), null, "scope ended");
  });

  await test("pinning env + sampling env parse strictly and default OFF/UNSET", () => {
    const savedEnv = { ...process.env };
    try {
      delete process.env.EXTRACTION_PIN_WRITE;
      delete process.env.EXTRACTION_PIN_REUSE;
      delete process.env.OPENAI_EXTRACTION_TEMPERATURE;
      delete process.env.OPENAI_EXTRACTION_SEED;
      assert.deepEqual(resolveExtractionPinningEnv(), {
        reuse: false,
        write: false,
      });
      assert.deepEqual(resolveExtractionSamplingParams(), {});

      process.env.EXTRACTION_PIN_WRITE = "1";
      process.env.EXTRACTION_PIN_REUSE = "true";
      process.env.OPENAI_EXTRACTION_TEMPERATURE = "0";
      process.env.OPENAI_EXTRACTION_SEED = "42";
      assert.deepEqual(resolveExtractionPinningEnv(), {
        reuse: true,
        write: true,
      });
      assert.deepEqual(resolveExtractionSamplingParams(), {
        seed: 42,
        temperature: 0,
      });

      process.env.OPENAI_EXTRACTION_TEMPERATURE = "not-a-number";
      process.env.OPENAI_EXTRACTION_SEED = " ";
      assert.deepEqual(
        resolveExtractionSamplingParams(),
        {},
        "invalid values are ignored, never sent"
      );
    } finally {
      process.env = savedEnv;
    }
  });

  await test("pinning: a MISS that then throws is still counted (replay integrity)", async () => {
    // The regression this guards (2026-07-25): the miss counter used to
    // increment only AFTER a successful network call, so a call that missed
    // the pin and then threw was never counted. In offline replay that is
    // every miss by construction (the harness sets a sentinel API key so a
    // miss cannot spend tokens), which made the replay harness's only
    // integrity check — `if (cache.misses > 0) fail(...)` — unreachable in
    // exactly the situation it exists for. A degraded replay printed
    // "misses=0" and "BAR PASSED" while running with stages MISSING.
    const { createOpenAIStructuredResponse } = await import("@/lib/ai/openai");
    const savedEnv = process.env;
    process.env = {
      ...savedEnv,
      OPENAI_API_KEY: "sentinel-must-not-work",
      ROAMWOVEN_ENABLE_AI_EXTRACTION: "true",
    };
    try {
      const cache = createExtractionParseCache([]);
      await runWithExtractionParseCache(cache, async () => {
        await assert.rejects(
          () =>
            createOpenAIStructuredResponse({
              input: "unpinned input",
              schema: { type: "object", properties: {} },
              schemaName: "test_schema",
              system: "system",
            }),
          "a sentinel key must make the call fail loudly, never silently"
        );
      });
      assert.equal(
        cache.misses,
        1,
        "the miss is counted at lookup time, so a throwing call still reports"
      );
      assert.equal(cache.hits, 0);
      assert.deepEqual(
        cache.missedCalls.map((call) => call.schemaName),
        ["test_schema"],
        "and it names the stage, so a miss is actionable"
      );
    } finally {
      process.env = savedEnv;
    }
  });

  // Run-2 handoff §6 / work-order Task 1. The three tests below close the gap
  // that let a production env change be a NO-OP: every existing assertion
  // stopped at `resolveExtractionSamplingParams()`, so nothing checked that
  // the resolved value reached the REQUEST. It did not — all call sites
  // omitted the argument, `requestStructuredResponse` spread `{}`, and the
  // only observable effect of setting OPENAI_EXTRACTION_SEED was that every
  // stored pin was invalidated.
  const withStubbedOpenAI = async (
    handlers: Array<
      () => { body: unknown; ok: boolean; status?: number }
    >,
    fn: () => Promise<unknown>
  ) => {
    const originalFetch = globalThis.fetch;
    const savedEnv = process.env;
    const sent: Array<Record<string, unknown>> = [];
    let call = 0;
    process.env = {
      ...savedEnv,
      OPENAI_API_KEY: "test-key",
      OPENAI_EXTRACTION_SEED: "7",
      OPENAI_EXTRACTION_TEMPERATURE: "0",
      ROAMWOVEN_ENABLE_AI_EXTRACTION: "true",
    };
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent.push(
        JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      );
      const handler = handlers[Math.min(call, handlers.length - 1)];
      call += 1;
      const response = handler();
      return {
        json: async () => response.body,
        ok: response.ok,
        status: response.status ?? (response.ok ? 200 : 400),
      } as Response;
    }) as typeof fetch;
    try {
      const result = await fn();
      return { result, sent };
    } finally {
      globalThis.fetch = originalFetch;
      process.env = savedEnv;
    }
  };

  const okBody = { output_text: JSON.stringify({ ok: true }), usage: null };
  const structuredCall = {
    input: "day one",
    schema: { type: "object", properties: {} },
    schemaName: "test_schema",
    system: "system",
  };

  await test("sampling params reach the REQUEST BODY, not just the resolver", async () => {
    const { createOpenAIStructuredResponse } = await import("@/lib/ai/openai");
    const { result, sent } = await withStubbedOpenAI(
      [() => ({ body: okBody, ok: true })],
      () => createOpenAIStructuredResponse(structuredCall)
    );

    assert.equal(sent.length, 1);
    assert.equal(sent[0].seed, 7, "seed is on the wire");
    assert.equal(sent[0].temperature, 0, "temperature is on the wire");
    assert.deepEqual(
      (result as { sentSamplingParams: unknown }).sentSamplingParams,
      { seed: 7, temperature: 0 },
      "and the result reports what was SENT, which is the only honest telemetry"
    );
  });

  await test("a rejected sampling param costs one call and is reported as NOT sent", async () => {
    const { createOpenAIStructuredResponse } = await import("@/lib/ai/openai");
    const { result, sent } = await withStubbedOpenAI(
      [
        () => ({
          body: { error: { message: "Unsupported parameter: 'temperature'." } },
          ok: false,
          status: 400,
        }),
        () => ({ body: okBody, ok: true }),
      ],
      () => createOpenAIStructuredResponse(structuredCall)
    );

    assert.equal(
      sent.length,
      2,
      "the strip-retry fires — one extra call, never the run"
    );
    assert.equal(sent[0].seed, 7);
    assert.equal(
      sent[1].seed,
      undefined,
      "the retry carries no sampling params"
    );
    assert.deepEqual(
      (result as { sentSamplingParams: unknown }).sentSamplingParams,
      {},
      "reporting the RESOLVED value here would claim seed 7 on a call that never carried it"
    );
  });

  await test("a pin HIT reports null, because no request was made at all", async () => {
    const { createOpenAIStructuredResponse } = await import("@/lib/ai/openai");
    const cache = createExtractionParseCache([]);
    const { sent } = await withStubbedOpenAI(
      [() => ({ body: okBody, ok: true })],
      () =>
        runWithExtractionParseCache(cache, async () => {
          const first = await createOpenAIStructuredResponse(structuredCall);
          assert.deepEqual(first.sentSamplingParams, {
            seed: 7,
            temperature: 0,
          });
          const replayed = await createOpenAIStructuredResponse(structuredCall);
          assert.equal(
            replayed.sentSamplingParams,
            null,
            "ABSENT IS NOT ZERO: a replay must not inherit the recording run's sent params"
          );
          return null;
        })
    );

    assert.equal(sent.length, 1, "the second call was served from the pin");
    assert.equal(cache.hits, 1);
  });
}
