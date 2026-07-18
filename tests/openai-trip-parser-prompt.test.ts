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

test("wave-2 prompt hardening: geo fields, line coverage, and artifact rules are demanded", () => {
  assert.match(parserSource, /Geo fields are REQUIRED output/i);
  assert.match(parserSource, /Line-coverage rule:/);
  assert.match(parserSource, /go to koscom/i);
  assert.match(parserSource, /maybe communism museum/i);
  assert.match(parserSource, /Tour Rome/);
  assert.match(parserSource, /Day-title rule:/);
  assert.match(parserSource, /We Explore Budapest/);
  assert.match(parserSource, /Reference-list rule:/);
  assert.match(parserSource, /Ticket-page rule:/);
  assert.match(parserSource, /never date ticket content by page position/i);
  assert.match(parserSource, /Disjunction rule:/);
  assert.match(parserSource, /exactly ONE activity card whose title or description carries the 'X or Y' choice/);
  assert.match(parserSource, /Cost-line rule:/);
  assert.match(parserSource, /Time-field rule:/);
  assert.match(parserSource, /Never set endTime equal to startTime/);
  assert.match(parserSource, /Provider rule:/);
  assert.match(
    parserSource,
    /fill approxLatitude\/approxLongitude for every named landmark/i
  );
});
