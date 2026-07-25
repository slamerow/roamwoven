import assert from "node:assert/strict";
import { getOpenAIConfig } from "@/lib/env";

// Model-default tripwire (2026-07-25). AGENTS.md §Operating discipline 1:
// "MODEL/INFRA CHANGES ARE MIGRATIONS, NOT SETTINGS ... The pipeline is
// SHAPE-CALIBRATED to the current extraction model — prompts, artifact
// families, classifier vocabulary, and fixtures encode its idiosyncrasies."
//
// Nothing enforced that. Commit 1d862ec (2026-07-10) changed the OCR model
// DEFAULT from "gpt-5.4-mini" to "gpt-5.6-luna" as a one-line edit;
// `git log --all -S'gpt-5.6-luna' -- lib/env.ts` returns that single commit,
// so it was never reverted. Fifteen days later run 7.25.0's telemetry read
// exactly as the resulting asymmetry predicts: all 5 OCR batches / 19 pages /
// 31,173 chars on gpt-5.6-luna while extraction and sourceRecovery ran
// gpt-5.4-mini — because extractionModel defaulted to mini and ocrModel
// defaulted to luna. That confounded every content number in the run and
// voided it as an Arc G content baseline (the audit quarantined the 77-vs-40
// card count, four missing ground-truth stops, and the "Josefov" ->
// "Joselov" misread as luna artifacts rather than pipeline defects).
//
// The rollback Eli approved lived only in a hosted env var, which means
// DELETING that var — the most natural way to undo a model change — silently
// restored luna. This test makes the two defaults' agreement a property the
// suite owns, so the next such edit cannot pass unnoticed.
//
// If this test fails, a model default moved. That is allowed, but it is a
// MIGRATION: do the latency x call-count arithmetic against maxDuration with
// >= 40% headroom, write the expected failure modes, smoke-test the new
// model's output SHAPE against current fixtures, change exactly one variable
// for the run, and update this test in the same commit.

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
  test("the OCR default matches the extraction default with no env vars set", () => {
    const config = withoutModelEnv(() => getOpenAIConfig());
    assert.equal(
      config.extractionModel,
      "gpt-5.4-mini",
      "the pipeline is shape-calibrated to this extraction model"
    );
    assert.equal(
      config.ocrModel,
      "gpt-5.4-mini",
      "OCR must default to the SAME model as extraction — a luna/mini split " +
        "confounded every content number in run 7.25.0"
    );
    assert.equal(
      config.ocrModel,
      config.extractionModel,
      "the two defaults agree, so 'no env vars set' is the SAFE state rather " +
        "than a silent model split"
    );
  });

  test("gpt-5.6-luna is never a default (it is opt-in only, via env var)", () => {
    const config = withoutModelEnv(() => getOpenAIConfig());
    for (const [field, value] of Object.entries(config)) {
      if (typeof value !== "string") continue;
      assert.equal(
        /luna/i.test(value),
        false,
        `${field} must not default to a luna-family model (Eli 2026-07-24: it ` +
          `"really sucked"; the rollback is now durable in code, not just in a ` +
          `hosted env var that deleting would undo)`
      );
    }
  });

  test("an explicit env var still overrides, so a deliberate experiment is possible", () => {
    // The rollback is durable, NOT locked: a future migration can still opt
    // in explicitly, which is the auditable way to change a model.
    const saved = process.env.OPENAI_OCR_MODEL;
    try {
      process.env.OPENAI_OCR_MODEL = "gpt-5.6-luna";
      assert.equal(getOpenAIConfig().ocrModel, "gpt-5.6-luna");
    } finally {
      if (saved === undefined) delete process.env.OPENAI_OCR_MODEL;
      else process.env.OPENAI_OCR_MODEL = saved;
    }
  });
}
