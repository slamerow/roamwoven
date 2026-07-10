import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const parserSource = readFileSync(
  join(process.cwd(), "lib", "extraction", "openai-trip-parser.ts"),
  "utf8"
);

test("extraction prompt reserves missingDetails for maker decisions, not model calls", () => {
  assert.match(
    parserSource,
    /Create missingDetails only for unresolved maker decisions/i
  );
  assert.match(
    parserSource,
    /Do not create model-generated FYI Calls in missingDetails/i
  );
  assert.match(
    parserSource,
    /Presentation Calls, when needed, are created later by assembly\/review policy/i
  );

  assert.doesNotMatch(parserSource, /Calls we made/i);
  assert.doesNotMatch(parserSource, /non-obvious calls worth surfacing/i);
  assert.doesNotMatch(
    parserSource,
    /include it as a missingDetails entry with a statement-style prompt/i
  );
});
