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
}
