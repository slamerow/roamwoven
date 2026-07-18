# Codebase audit — rule conflicts, overlapping policies, dead code (2026-07-18)

Commissioned by Eli after live run 7.18.2 showed defects caused by our own
rules interacting (Schönbrunn deleted by a merge-winner rule; question
filters running before question subjects were final). Four parallel audit
passes: (1) full rule inventory of `evidence-clustering.ts`, (2) cross-module
policy overlap, (3) question/call lifecycle trace, (4) dead code & hygiene.
The highest-impact claims below were independently re-verified in source
before publication (marked ✓v).

## Verdict on the dark-factory approach

The dark-factory mandate worked as specified and still failed to prevent
this. It guarantees each rule terminates in a tested outcome (repair,
fallback, recovery); it never tests rules AGAINST each other. Our defect
source has shifted accordingly: early runs failed on missing rules; the last
two runs failed on rule interactions — different similarity definitions
picking different winners, demotions starving downstream question creators,
filters keyed on fields that a later stage rewrites. The fix is not more
rules; it is shared predicates, an explicit stage order with claims, and one
final reconciliation gate. The dark-factory principle should be extended:
a rule is not push-ready until its interaction with the rules that share its
candidate pool is specified (who wins, who yields, in what order).

## A. Pipeline interaction defects (evidence-clustering.ts)

The pipeline is ~56 sequential passes. Six merge/dedup rules, five demotion
paths, and eleven question filters share candidate pools with no shared
definitions and no claim ledger. Ranked findings:

- **A1 (HIGH, ✓v) Merge-winner scoring lets a day-arc card beat a named
  venue.** `collapseAlternativeSlotCards` picks winners by
  `slotScore` = +10 for any "or" in the description, +2 for a time, plus
  `titleQuality` — which is raw title LENGTH with a generic penalty covering
  only 7 exact words (`activity|stay|transport|travel|train|flight|note`,
  line ~1123). "Explore Vienna" pays no penalty; a day-arc whose description
  mentions alternatives outranks "Schonbrunn Palace". `mergeCanonicalPieceInto`
  copies NO payload fields (A5), so the venue is deleted, not folded — and
  `enforceCanonicalOutputActivityRoles` may then suppress the day-arc winner
  too, emptying the day. This is the exact 7.18.2 Schönbrunn mechanism.
- **A2 (HIGH) Slot-collision guard bypassed by its own retitle step.** The
  site-vs-event guard vetoes only the cross-reference branch; bare token
  overlap ≥1 (city tokens count) still merges, and `crossReferencedTitle` is
  computed over the whole slot BEFORE the guard and applied unconditionally —
  an event can be retitled to the site's name (with a title lock) even when
  the site card was excluded, after which repeat-resolution folds the real
  site into the mislabeled event. The 7.17.x castle deletion can recur
  through this path despite the wave-1.1 guard.
- **A3 (HIGH, ✓v) Question filters run before question identity is final.**
  `unresolvedMissingDetails` (11+ branches keyed on raw subjectType/
  targetField) runs BEFORE `canonicalizeCanonicalReviewDetails` rewrites
  subjects from resolved pieces (falling back to "trip"), and before the
  review projection rewrites them again. The wave-1 transport reconciliation
  regex covers `departuretime|arrivaltime|confirmation|time` — not `date`.
  guessedValue is compared to canonical state in exactly ONE branch (stay
  nights). Full gap list in section C. This is the 7.18.2 false-conflict
  date-question mechanism, and it is structural, not a missed regex.
- **A4 (HIGH) Six duplicate/alias rules, six similarity definitions, six
  winner policies; first-to-run wins.** Intake identity (Jaccard ≥0.8 /
  containment), generic-placeholder attachment (concept lexicon+time),
  location-fragment absorption (slot), slot collisions (slot+category,
  overlap ≥1), alternative-slot collapse (description Jaccard ≥0.9,
  or-marker winner), title containment (longer phrase wins), repeat
  mentions (committed copy wins). A pair matching several definitions is
  decided by pass order, and the winner policies disagree.
- **A5 (MED, ✓v) `mergeCanonicalPieceInto` discards the loser's payload.**
  Merges observationIds/actions/conflicts but no fields; most collapse
  callers copy nothing. Any merge where the loser held the only address,
  endTime, or description loses it silently. Amplifies A1/A2.
- **A6 (HIGH) Demotion paths starve question creators.** The day-title slot
  rule (baths) needs uncommitted activity options, but four earlier passes
  (hedge demotion, repeat-mention demotion, note reconciliation,
  researched-list hold — bath options always carry prices) consume exactly
  that pool first. The 7.18.2 missing baths question is this. No shared
  claim: nothing lets a day-title slot "reserve" its candidate venues.
- **A7 (MED) Piece ids are re-keyed on every merge**, but
  `relatedCanonicalPieceId` and `_representedByPieceId` are written
  mid-pipeline; later merges invalidate them and lookups fall back to fuzzy
  matching (wrong piece) or fail silently (dropped fold calls).
- **A8 (MED) `reconcileCardsAgainstCityNotes` runs twice** with mutated
  inputs between runs — cards can win run 1 and demote in run 2.
- **A9 (MED) Provisional dates feed date-keyed collapse passes** — invented
  dates make genuinely different undated mentions "same-day" and merge them
  permanently.
- **A10 (MED) Duplicate collapse runs before grouping decisions execute** —
  a decision child merged away aborts the whole approved grouping silently.
- **A11 (LOW/MED)** Transport-shadow suppression runs before dates are
  final; two access-instruction rules compete first-write-wins for
  credentials; cancellation detection runs before text merges; checkout has
  three writers with different policies.
- **Dead branches inside live rules (✓v):** `rootIsContainer ? rootId :
  rootId` (~8123) — the "prefer the container as question root" intent is
  UNIMPLEMENTED, which is half of the double castle-question defect;
  `mergedAway ? "superseded_or_duplicate" : "superseded_or_duplicate"`;
  a no-op single-choice guard (`if (…) return true; return true;`);
  `_canonicalQuestionKind === "alternative_slot"` read but never written.

## B. Cross-module policy conflicts

- **B1 (HIGH, ✓v) Commitment detection is contraction-blind.**
  `PLANNED_ACTIVITY_PATTERN` includes `we'll|we're|we'd like` but is tested
  against `normalizeText()` output, which strips apostrophes — those
  branches have NEVER matched. Meanwhile the LLM resolver's `hasPlanSignal`
  tests raw text and counts bare sight verbs as plan signals — the exact
  verbs the taxonomy comment says are parser phrasing. The two commitment
  authorities disagree on the same string, and the lexical one (which wins
  demotions) is partially dead. RW-CLS-001's enforcement is weaker than the
  ledger believes.
- **B2 (HIGH) The LLM resolver runs on PRE-normalization stages.** Resolver
  role decisions are made on raw parser output; `normalizeParserStageArtifacts`
  then demotes/rewrites the same cards afterwards. Two authorities, opposite
  outcomes, decided by ordering. Fix: normalize before the resolver (and
  feed source coverage the normalized stages).
- **B3 (HIGH) Stay-content routing has a three-layer gap — the Rome-note
  mechanism.** Accessory routing strips lodging segments only when exactly
  ONE compatible stay exists; the protected-value scrub removes only
  addresses/confirmations/credential sentences (not check-in cost prose);
  city-note sectioning then classifies the leftover by the note's CATEGORY
  as fallback — `shopping_tailor` → "Shopping". Each layer assumes another
  owns stay content; no layer's vocabulary is a superset. (Fourth variant:
  the maker-side "move to city tip" feature uses a DIFFERENT section
  taxonomy than the pipeline's city-note sections.)
- **B4 (MED/HIGH) Detector drift.** Audit detectors re-implement pipeline
  predicates with diverged vocabularies: hedge markers (audit misses 5
  phrases the pipeline demotes on → false P1s), high-intent signals,
  loose-tip detection without the pipeline's booking guard, day-overview
  detection blind to heading-remainder titles (the "Explore Vienna" family
  is invisible to the P0 detector), transport-represented checks accepting a
  single shared token, strict `===` date compares instead of
  `tripDatesMatch`, and a parallel identity normalizer (no plural stemming,
  different stopwords) that produces phantom duplicate/missing findings.
- **B5 (MED) Concept fragmentation, counted:** 7 text normalizers (NFD vs
  NFKD, `&`→"and" vs not), 13 stopword sets, 5 day-heading detectors (with
  real divergence: bullet-prefixed and starred headings split chunking vs
  coverage vs repair differently), 9 title-match definitions, 4 date parsers
  (`16/1/2026` is a day heading nobody can date; anchors parse it,
  activities can't → manufactured date disagreements), 4 time normalizers
  (dot-times "14.30" count as transport time EVIDENCE but parse nowhere →
  manufactured missing-time P0s), 4 price/cost regexes (£ missing from the
  researched-list marker; Ft missing from the cost pattern).
- **B6 (MED) Boundary contradictions:** travel-boundary policy converts
  non-critical transport to an activity card, then transport-shadow
  suppression deletes that card as "represented" (transfer kind matches ANY
  same-date transport) — the two passes encode opposite answers and the
  second always wins. Summary warns only on unconfirmed transport rows;
  the audit raises P0s on confirmed ones — an un-clearable needs_review.

## C. Question lifecycle — complete escape map

Creation sites: parser missingDetails (free-string targetField, no piece
link), 8 synthesized families in clustering (calls ×3, conflict questions —
which SET guessedValue to the current value by design — owned questions,
researched-list, day-label slot, spine), recovery placeholders, plus
mid-pipeline guess consumption. Filters: parser prose rules → piece-guarded
demotions (questions protect pieces here) → `unresolvedMissingDetails` (the
wave-1 gate; raw subjects) → `canonicalizeCanonicalReviewDetails`
(subject rewrite + ticket consolidation + dedupe) → identity manifest →
review projection (subject rewritten AGAIN, no content filtering) → UI
(renders every open question).

Escape shapes (all verified against the run-7.18.2 defects):
`date`-target questions of any subject (wave-1 regex misses `date`);
questions whose subject shape changes after filtering (rewrite-to-trip);
guessedValue == final state (checked only for stay nights); duplicate
questions per venue complex (consolidation date-gated on both sides + dead
container ternary + dedupe key includes pieceId so same-target different-
piece never collapses); calls exempt from every check (early return);
researched-list questions with null pieceId holding demoted members
hostage; free-text targetFields (`sourceRecovery`, `tripSpine`,
`source_update`, `lodging`, `presentation`) matched by no filter; questions
minted before late piece mutation; wrong-piece fuzzy binding; suppressed/
accessory subjects unreachable by reconciliation.

**Recommended design (wave-2.1 centerpiece): ONE post-canonicalization
reconciliation pass** inside `canonicalizeCanonicalReviewDetails`, after
subject re-resolution, before dedupe (so assembly-recovery re-runs it):
R1 answered-by-canon for ALL fields/kinds (generalize wave-1, follow
`_representedByPieceId` chains); R2 guess-equals-state kill (normalized
compare — this alone kills both 7.18.2 date questions); R3 false-conflict
collapse (cited values normalize equal → drop); R4 re-run subject-keyed
filters on FINAL subjects; R5 one-decision-per-complex via semantic target +
venue identity with undated subjects folding into dated container roots;
R6 suppressed-subject retarget-or-drop; R7 stale-call validation. Plus:
`targetField: date` coerces to a date control at projection. This pass
subsumes and retires ~8 of the 11 scattered filters.

## D. Dead code & hygiene (verified by import-graph + per-symbol grep)

Certain, delete now: `lib/trip-schema.ts` (+ its `zod` dependency — the
repo's only zod import) (✓v); `@stripe/stripe-js` dependency (zero imports,
checkout is a server redirect) (✓v); `components/structured-review-panel.tsx`
(superseded by review-flow-panel); `lib/supabase/client.ts` +
`hasSupabaseBrowserConfig`; ~15 dead symbols incl. `isCriticalTransportType`,
`isSeparateLocalMovementCandidate` (superseded boundary policy that
CONTRADICTS the live B6 behavior), `getDraftActivityGroupingKind`,
`isMakerVisibleGroupingKinds` lane, `formatReadableIsoDate`,
`applySavedTripReviewDecisions`, the `get*ExtractionMaterials` family.

Needs-a-decision: `cleanupAbandonedUnpaidStarterMaterials` is a fully
implemented retention job with NO caller anywhere (unwired plumbing — wire
it to a schedule or delete it); `lib/extraction/extraction-qa.ts` is
test-only but lives in lib/; `/maker/audit` page has no inbound link;
three pre-07-08 SQL patch files are superseded and untested (README
documents them as ordered migrations — keep until a real migration tool).
Add `OPENAI_OCR_IMAGE_DETAIL` to `.env.example` (read but undocumented).

Test-only exports (34 symbols) are listed in the audit working notes;
they are legitimate seams but two (`isTravelActionCandidate`,
`isRedundantLocalAirportTransferCandidate`) keep green tests for
prior-generation logic that no longer ships — false confidence.

Coverage holes among the 15 largest files: `data/page.tsx` (1,920 lines),
`traveler-app-shell.tsx` (1,385), `generated-trip-summary.ts` (1,263),
`generated-trip-decisions.ts` (959), `draft-to-structured-trip.ts` (944),
`trip-extraction-audit-diagnostics.ts` (858) have no dedicated test files.

## E. Remediation plan (proposed order)

- **Phase 0 — prune (small, zero-risk):** delete the certain-dead list,
  drop `zod` + `@stripe/stripe-js`, fix the dead branches inside live rules
  (the container-root ternary is a live defect, not hygiene), fix the
  contraction-blind commitment pattern, document the env var.
- **Phase 1 — shared predicates:** one text-normalization module (one
  folding, one tokenization), one stopword strategy, one day-heading
  detector, one date/time parser set, one price detector, and ONE
  `sameEntity(a,b) → {isSame, winner}` module with a single winner ladder
  (booking > named-venue distinctive tokens > commitment > specificity >
  length; overview/day-arc/heading-fragment cards ineligible to win any
  merge). All six collapse rules keep their triggers, lose their private
  winner logic. Audit detectors import pipeline predicates instead of
  re-implementing them.
- **Phase 2 — question gate:** the single final reconciliation pass
  (C above), retiring the scattered filters it subsumes. This is the
  highest defect-per-effort item and directly kills the 7.18.2 question
  regressions.
- **Phase 3 — order & claims:** normalize before the resolver; stable piece
  ids (alias map instead of re-keying); claim ledger (slot-holds, grouping
  claims, question subjects) computed BEFORE the demotion family and
  honored by every demotion/collapse; payload folding in
  `mergeCanonicalPieceInto`.
- **Phase 4 — stage split:** extract evidence-clustering into ordered,
  individually-tested policy stages with typed inputs/outputs and a
  pipeline-level interaction test suite (fixtures that assert END-TO-END
  survival of named venues, question counts, and one-home invariants under
  permuted inputs). The 7.18.2 bundle becomes the first frozen interaction
  fixture. Extraction pinning lands here or earlier so interaction tests run
  against a stable parse.

Wave-2.1's docket items map onto Phases 0-2 almost one-to-one; the geo
calibration items (run5 docket PB-4) ride along in Phase 1's sameEntity/
grouping-eligibility work.
