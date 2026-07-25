import assert from "node:assert/strict";
import {
  getOpenAIConfig,
  OCR_TEXT_ONLY_MODELS,
  OCR_VISION_CAPABLE_MODELS,
} from "@/lib/env";

// Model-default tripwire. REWRITTEN 2026-07-25 after the version of this file
// written hours earlier asserted the OPPOSITE and would have blocked the fix.
//
// THE INCIDENT. The OCR default was changed from "gpt-5.6-luna" to
// "gpt-5.4-mini" on the reasoning that commit 1d862ec had swapped it
// mini -> luna and never reverted it, so luna looked like an unreverted
// accident. The git facts were correct and the interpretation was backwards:
// 1d862ec is the commit that BUILT image/PDF OCR (it created ocr-batches.ts,
// pdf-page-batches.ts, openai-ocr.test.ts and added 439 lines to
// ocr-processor.ts) and it set luna because luna can read a document. The
// "gpt-5.4-mini" value it replaced was a placeholder from 639247e, three weeks
// before OCR sent an image to anything.
//
// Cost: one live run. OCR extracted nothing, "USE FOR TESTING CZECH.pdf" was
// receipted as not included, only the pdf.js text layer reached the parser, and
// the run produced 6 transport / 4 activities instead of 8 / ~40.
//
// THE TEST THAT MADE IT WORSE. The first version asserted
// `ocrModel === extractionModel` — "no env vars set is the SAFE state" — which
// encoded the wrong assumption as an invariant. It passed on the broken
// config and would have failed on the correct one. A test that enforces a
// mistaken belief is worse than no test: it converts a bug into a rule.
//
// WHAT THIS FILE ASSERTS NOW, and why each line exists:
//  - OCR must use a VISION-CAPABLE model, because the lane sends
//    `input_image` / `input_file` content (lib/ai/openai.ts getOcrContent).
//  - OCR and extraction are EXPECTED to differ. Extraction reads text; OCR
//    reads pixels. Their agreement is not a safety property.
//  - A known text-only model must never be the OCR default.
//
// If this test fails, a model default moved. That is allowed, but it is a
// MIGRATION (AGENTS.md discipline 1): run `scripts/ocr-smoke-test.mjs` against
// one real page FIRST and read the character count, do the latency x
// call-count arithmetic against maxDuration with >= 40% headroom, write the
// expected failure modes, change exactly one variable per run, and update this
// test in the same commit. An allowlist entry added without the smoke test
// repeats the incident.

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const MODEL_ENV_VARS = [
  "OPENAI_EXTRACTION_MODEL",
  "OPENAI_OCR_MODEL",
  "OPENAI_RECOVERY_MODEL",
] as const;

function withoutModelEnv<T>(fn: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const name of MODEL_ENV_VARS) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  try {
    return fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

export default async function run() {
  test("the OCR default is a VISION-CAPABLE model (the lane sends images)", () => {
    const config = withoutModelEnv(() => getOpenAIConfig());
    assert.ok(
      (OCR_VISION_CAPABLE_MODELS as readonly string[]).includes(config.ocrModel),
      `ocrModel must read images — got "${config.ocrModel}", allowed: ` +
        `${OCR_VISION_CAPABLE_MODELS.join(", ")}. A text-only model returns ` +
        `nothing and the source file is receipted as "not included" (the ` +
        `2026-07-25 incident cost one live run).`
    );
  });

  test("a known TEXT-ONLY model can never be the OCR default", () => {
    const config = withoutModelEnv(() => getOpenAIConfig());
    for (const textOnly of OCR_TEXT_ONLY_MODELS) {
      assert.notEqual(
        config.ocrModel,
        textOnly,
        `${textOnly} cannot do OCR — this exact value broke the 2026-07-25 run`
      );
    }
    // And the two lists must not overlap, or the guard above is vacuous.
    for (const visionModel of OCR_VISION_CAPABLE_MODELS) {
      assert.equal(
        (OCR_TEXT_ONLY_MODELS as readonly string[]).includes(visionModel),
        false,
        "a model cannot be both vision-capable and text-only"
      );
    }
  });

  test("OCR and extraction defaults are ALLOWED to differ (they read different things)", () => {
    const config = withoutModelEnv(() => getOpenAIConfig());
    assert.equal(
      config.extractionModel,
      "gpt-5.4-mini",
      "the pipeline is shape-calibrated to this extraction model"
    );
    // Explicitly asserted so nobody "fixes" the asymmetry again: the previous
    // version of this test demanded these be equal, which is what broke OCR.
    assert.notEqual(
      config.ocrModel,
      config.extractionModel,
      "extraction reads TEXT and OCR reads PIXELS — a split here is correct, " +
        "not a defect. Do not re-add an equality assertion."
    );
  });

  test("an explicit env var still overrides, so a deliberate experiment is possible", () => {
    // The default is durable, NOT locked: a future migration can opt in
    // explicitly, which is the auditable way to change a model — after the
    // smoke test.
    const saved = process.env.OPENAI_OCR_MODEL;
    try {
      process.env.OPENAI_OCR_MODEL = "some-future-vision-model";
      assert.equal(getOpenAIConfig().ocrModel, "some-future-vision-model");
    } finally {
      if (saved === undefined) delete process.env.OPENAI_OCR_MODEL;
      else process.env.OPENAI_OCR_MODEL = saved;
    }
  });
}
