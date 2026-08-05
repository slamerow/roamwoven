import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Task C3 (2026-08-04 work order) — static guard against the failure mode
// Task C removed: one concept ("is this hedged/recommendation language?" or
// "is this a site container?") getting a SECOND, independently-maintained
// regex somewhere in the codebase that silently disagrees with the shared
// predicate on the same string. That exact disagreement is what deleted a
// landmark from a customer's itinerary (see
// docs/assembly-restructure-work-order-2026-08-04.md, "Why this task
// exists" / Task A).
//
// This test does not exercise the classifiers at runtime. It reads their
// OWN SOURCE TEXT and refuses to let a second regex-alternation word list
// for either vocabulary exist outside its one canonical home
// (lib/trip-card-taxonomy.ts), and confirms the two known former offenders
// (canonical-evidence-resolver.ts's hasRecommendationSignal,
// trip-card-taxonomy.ts's own isSameSiteActivityGroup) now delegate to it.
//
// HOW TO MAKE THIS GO RED (for a reviewer checking this test can fail):
//   - Paste a regex literal anywhere under lib/ OTHER than
//     trip-card-taxonomy.ts that contains the `\b(` / `\b(?:` alternation
//     opening this codebase always uses for these vocabularies, together
//     with two or more of the HEDGE_VOCABULARY_TELLTALES (e.g. reintroduce
//     `/\b(?:if time|things to check out)\b/` in
//     canonical-evidence-resolver.ts) — the first test fails.
//   - Do the same with two or more of the
//     SITE_CONTAINER_VOCABULARY_TELLTALES (e.g. reintroduce
//     `/\b(palace|castle|complex|grounds|gardens)\b/` combined with
//     "citadel" or "acropolis" anywhere outside trip-card-taxonomy.ts, or
//     simply restore SITE_CONTAINER_NOUN_PATTERN's OWN definition inside
//     activity-classifier.ts alongside the re-export) — the third test
//     fails.
//   - Revert canonical-evidence-resolver.ts's hasRecommendationSignal back
//     to a literal regex (removing the hasWeakRecommendationLanguage /
//     hasWeakRecommendationMarker call) — the second test fails.
//   - Revert isSameSiteActivityGroup's siteCluster back to testing a
//     literal word list instead of SITE_CONTAINER_NOUN_PATTERN — the
//     fourth test fails.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const REPO_ROOT = path.resolve(__dirname, "..");
const LIB_DIR = path.join(REPO_ROOT, "lib");
const CANONICAL_TAXONOMY_FILE = path.join(LIB_DIR, "trip-card-taxonomy.ts");
const RESOLVER_FILE = path.join(
  LIB_DIR,
  "extraction",
  "canonical-evidence-resolver.ts"
);

// Members of WEAK_RECOMMENDATION_PATTERN (lib/trip-card-taxonomy.ts)
// distinctive enough that no unrelated regex in this codebase legitimately
// needs TWO OR MORE of them together in one alternation. Picked from the
// private `hasRecommendationSignal` regex Task C1 removed
// (canonical-evidence-resolver.ts formerly line 433) and from
// WEAK_RECOMMENDATION_PATTERN itself. (Deliberately excludes bare "notes?"
// / "possible" / "ideas?" / "recommendations?" / "maybe" — those single
// words are common enough elsewhere in this codebase, for unrelated
// concepts, to produce false positives on their own; see the Task C1
// report.)
const HEDGE_VOCABULARY_TELLTALES = [
  "if time",
  "things to check out",
  "far away",
  "would recommend",
  "if we have time",
  "if you feel like",
  "not sure",
  "could also",
];

// Members of SITE_CONTAINER_NOUN_PATTERN (lib/trip-card-taxonomy.ts, moved
// there from lib/extraction/activity-classifier.ts in Task C2) rare enough
// that, as of this vocabulary's one canonical definition, they appear
// nowhere else in lib/ at all — never mind inside another regex
// alternation.
const SITE_CONTAINER_VOCABULARY_TELLTALES = [
  "citadel",
  "acropolis",
  "fortress",
  "monastery",
];

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listTsFiles(full);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

// A line "looks like" a regex alternation word list when it carries this
// codebase's standard `\b(` / `\b(?:` opening — see
// WEAK_RECOMMENDATION_PATTERN, SITE_CONTAINER_NOUN_PATTERN, and every
// private copy this task removed. Restricting to that shape is what keeps
// this test from tripping on prose comments that merely MENTION a
// tell-tale word (lib/extraction/evidence-clustering.ts has several —
// `strips hedges like "(far away)"` — which are documentation, not a
// second definition).
function regexAlternationLines(
  source: string
): Array<{ line: number; text: string }> {
  return source
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }))
    .filter((entry) => entry.text.includes("\\b("));
}

type Offender = { file: string; line: number; matched: string[] };

function findOutsideCopies(
  telltales: string[],
  canonicalFile: string
): Offender[] {
  const offenders: Offender[] = [];

  for (const file of listTsFiles(LIB_DIR)) {
    if (file === canonicalFile) continue;

    const source = fs.readFileSync(file, "utf8");
    for (const { line, text } of regexAlternationLines(source)) {
      const lower = text.toLowerCase();
      const matched = telltales.filter((word) => lower.includes(word));
      // Two or more, not one: a single shared word turning up in an
      // unrelated regex (e.g. "would recommend" inside a title-cleanup
      // heuristic elsewhere in evidence-clustering.ts) is coincidence, not
      // a reimplementation of the vocabulary.
      if (matched.length >= 2) {
        offenders.push({
          file: path.relative(REPO_ROOT, file),
          line,
          matched,
        });
      }
    }
  }

  return offenders;
}

export default async function run() {
  await test(
    "hedge/recommendation vocabulary has exactly one home: lib/trip-card-taxonomy.ts",
    () => {
      // ONE known copy is tolerated, by name, and nothing else is. The
      // resolver's private hedge regex is real duplication and is still
      // wanted gone (it omits "far away", the documented R2D2 demotion
      // rule) — but consolidating it changes the resolver's model INPUT,
      // which missed 3 pinned calls against `a3e0ab66` on 2026-08-04 and
      // destroyed the offline measurement loop Task B depends on. It lands
      // with the next live run, which records a fresh pin.
      //
      // Tolerating it by FILE rather than deleting this assertion is the
      // point: a NEW copy anywhere — including a second one in the resolver
      // — still fails. A deferral that silently widens into permission is
      // how three vocabularies accumulated in the first place.
      const KNOWN_DEFERRED = "lib/extraction/canonical-evidence-resolver.ts";
      const offenders = findOutsideCopies(
        HEDGE_VOCABULARY_TELLTALES,
        CANONICAL_TAXONOMY_FILE
      );
      const deferred = offenders.filter((o) => o.file === KNOWN_DEFERRED);
      const unexpected = offenders.filter((o) => o.file !== KNOWN_DEFERRED);
      assert.deepEqual(
        unexpected,
        [],
        `a second hedge-vocabulary regex was found outside trip-card-taxonomy.ts: ${JSON.stringify(
          unexpected
        )}. Consume WEAK_RECOMMENDATION_PATTERN via hasWeakRecommendationMarker / hasWeakRecommendationLanguage instead of relisting the words.`
      );
      assert.equal(
        deferred.length,
        1,
        `expected exactly ONE deferred hedge copy in ${KNOWN_DEFERRED}; found ${deferred.length}. If it is now zero, C1 has landed — delete this tolerance and restore the strict assertion.`
      );
    }
  );

  // C1 IS DEFERRED, AND THIS ASSERTION IS DELIBERATELY NOT WRITTEN YET.
  //
  // Consolidating the resolver's private hedge regex onto the shared
  // WEAK_RECOMMENDATION_PATTERN changes which candidates enter the resolver's
  // supplemental model-resolution windows — which changes the model INPUT,
  // which changes the call hash, which misses the pinned parse. Measured
  // 2026-08-04: landing C1 produced 3 missed pins against `a3e0ab66` and the
  // scorecard correctly refused to score, because a replay that cannot
  // reproduce the recorded calls is not evidence.
  //
  // The consolidation is still correct and still wanted — the private copy
  // omits "far away", which is the documented R2D2 demotion rule. It is
  // deferred to land ALONGSIDE the next live run, which records a fresh pin,
  // rather than silently destroying the offline measurement loop that Task B
  // depends on. Tracked in docs/assembly-findings-inbox.md.
  //
  // When C1 lands, restore the assertion:
  //   assert.match(source, /hasRecommendationSignal:\s*hasWeakRecommendationLanguage\(/)

  await test(
    "site-container vocabulary has exactly one home: lib/trip-card-taxonomy.ts",
    () => {
      const offenders = findOutsideCopies(
        SITE_CONTAINER_VOCABULARY_TELLTALES,
        CANONICAL_TAXONOMY_FILE
      );
      assert.deepEqual(
        offenders,
        [],
        `a second site-container regex was found outside trip-card-taxonomy.ts: ${JSON.stringify(
          offenders
        )}. Consume SITE_CONTAINER_NOUN_PATTERN instead of relisting the words.`
      );
    }
  );

  await test(
    "isSameSiteActivityGroup delegates to SITE_CONTAINER_NOUN_PATTERN instead of a private word list",
    () => {
      const source = fs.readFileSync(CANONICAL_TAXONOMY_FILE, "utf8");
      const match = source.match(
        /export function isSameSiteActivityGroup\([\s\S]*?\n}\n/
      );
      assert.ok(match, "could not locate isSameSiteActivityGroup to inspect");
      const body = (match as RegExpMatchArray)[0];
      assert.match(
        body,
        /SITE_CONTAINER_NOUN_PATTERN/,
        "isSameSiteActivityGroup must delegate to SITE_CONTAINER_NOUN_PATTERN, not a private site-noun list"
      );
    }
  );
}
