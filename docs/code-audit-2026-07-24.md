# Codebase audit — rule conflicts, overlapping policies, dead gates (2026-07-24)

Successor to `code-audit-2026-07-18.md`, commissioned by Eli after live run
7.25.0. Three parallel audit passes against the Arc F.2 build (`2e498f7`,
pipeline code at `0457f0c`): (1) gate/sweep lane-coverage inventory, (2)
grouping/dedup mechanism trace, (3) question lifecycle. The highest-impact
claims were independently re-verified in source before publication (marked ✓v).

Run 7.25.0's defects are the evidence, but this document is about the code.

## Verdict: the defect source has moved again

The 07-18 audit found the defect source had shifted from *missing rules* to
*rule interactions*. It has shifted once more, and the new source is narrower
and more fixable: **shared predicates were built for some concerns and not
others, and every unshared concern has since produced a defect.**

`isPlanningCostMaterial` (`source-coverage.ts:128`) is the control group. It is
the one predicate genuinely shared across three consumers (recovery batching,
piece candidacy, audit detector). It is also the one protective concern that
has not recurred across four runs. Everything the codebase kept private has
recurred: identity shapes recurred until they were shared, and code shapes,
entity identity, document-artifact shapes and question hygiene are all still
private.

The 07-18 remediation plan was right and was **half-executed**. Phase 1
delivered the winner ladder and left the identity predicate — the harder and
more load-bearing half — unbuilt. That single omission is the direct cause of
run 7.25.0's chain B.

## A. Coverage is lane-shaped, not concern-shaped

A matrix of protective concerns × record lanes over the current gates scores
**15 of 54 applicable cells COVERED, 14 PARTIAL, 25 NOT COVERED**. The only
concern covered in ≥3 lanes is identity values, i.e. the one that was
refactored into a shared module.

- **A1 (HIGH, ✓v) There is no shared public-field registry.** The list of
  public text fields is an inline literal at `evidence-clustering.ts:4563`,
  with divergent variants at `:4587` and `:4596`, and re-implemented a fourth
  time in the detector at `trip-extraction-audit-diagnostics.ts:910`.
  `scrubProtectedValuesFromPublicProse` (`:4452`) is four hand-written
  `if (piece.kind === …)` branches — transport `:4472`, stay `:4501`,
  activity+note `:4535` — and **`place` falls off the end**, so leg records are
  walked by no sweep and by no detector.
- **A2 (HIGH) The three F.2 gates are unreusable by construction.** The
  transport candidacy floor (`:2033-2053`) is inline arithmetic never extracted
  into a named predicate. `classifyCityNoteSegmentSafety` (`:5223`) — which
  unions costs, lodging costs, credentials, access shapes and ticket-OCR
  boilerplate, and is **the most complete concern-union in the codebase** — is a
  non-`export` function with two call sites, both inside note rendering.
  `isDocumentArtifactShapedStayName` (`:4712`) has exactly one call site,
  inside `applyStayCandidacyGate` (`:4717`), whose iterator is
  `piece.kind === "stay"` (✓v).
- **A3 (HIGH) `placeholder` is not a lane, and inherits nothing deliberately.**
  There are 7 `EvidenceKind` values; placeholder is `kind:"activity"` with
  `itemType:"placeholder"`. Every gate discriminates on `kind`, none on
  `itemType`. Worse, `repairDayTitleCard` **explicitly returns early for
  placeholders** (`parser-artifact-normalization.ts:321-323`), and
  recovery-minted placeholders are created at `:10918`, *after* the planning-cost
  candidacy loop at `:10870` — so they bypass candidacy by ordering alone.
- **A4 (MED/HIGH) The retry lane runs a strict subset of the gates.**
  `reapplyCanonicalOutputInvariants` (`:9017-9060`) re-runs five passes and
  **only** `scrubProtectedValuesFromPublicProse` from the protective set. The
  stay gate, transport floor, planning-cost loop and note-safety render are not
  re-run, so the repair corridor's rebuild emits records that passed fewer
  checks than the main path. F.2's C4 fixed exactly one lane of this;
  the general property remains.
- **A5 (MED) Threshold gaps inside covered lanes.**
  `findProtectedCodeShapedTokens` (`identity-prose.ts:145`) requires ≥7 digits
  or a **≥5-character** alnum token. Seat codes (2–3 chars) are invisible to it
  while sitting in transport prose the pass already walks — run 7.25.0 chain A.
  Coverage-by-lane would not have caught this; only coverage-by-shape does.

## B. Entity identity: six definitions, one ladder, no arbiter

- **B1 (HIGH, ✓v) `sameEntity` was never built.** No such function exists in
  `lib/`; the only occurrence is a local `const` private to
  `collapseSlotCollisions` (`:6853`). Six triggers still carry six similarity
  definitions with mutually incompatible thresholds: intake identity (Jaccard
  ≥0.8 / containment, `:726`), location-fragment absorption (date+time+generic
  tokens, `:6599`), slot collisions (date+time+category, `:6784`), alternative
  slots (description Jaccard ≥0.9, `:6708`), title containment (whole phrase,
  `:6989`), repeat mentions (**exact** string equality, `:7436`). `Borkonyha
  Wine Kitchen` vs `Borkonyha for dinner, Comme Chez Soi` fails all six (Jaccard
  ≈0.17, no containment, no shared time). **No rule anywhere uses partial
  title-token overlap for same-day activity identity.**
- **B2 (HIGH, ✓v) Two stopword sets 25 lines apart deliberately disagree about
  `castle`.** `SOURCE_SUPPORT_STOPWORDS` (`:6472`) includes castle/cathedral/
  museum/visit/tour; `STAY_ALIAS_STRUCTURAL_STOPWORDS` (`:6497`) excludes them
  by design ("venue-type words stay MEANINGFUL here … dropping venue words
  caused the 7.17.2 Prague Castle suppression"). A third opinion lives in the
  detectors: `normalizeDuplicateTitle` (`generated-trip-summary.ts:346`) and
  `normalizeAuditIdentity` (`trip-extraction-audit-utils.ts:61`) both strip
  `visit`. **The pipeline is forbidden from merging the pair its own two
  detectors define as identical** — that is run 7.25.0's duplicate castle,
  detected twice and unrepairable.
- **B3 (HIGH) The winner ladder shipped but private scorers survive.**
  `entity-winner.ts` (`classifyMergeEligibility:185`, `chooseMergeWinner:248`)
  is consumed by four collapse rules — A1 from the 07-18 audit is genuinely
  fixed. But `titleQuality` (`:1156`) and `isGenericTitle` (`:1166`) remain live
  duplicates of `entity-winner.ts:221-229`, still used at `:1287`, `:1388-1389`,
  `:9599` for field-rank selection, which never joined the ladder.
- **B4 (HIGH) A5 is still unfixed** (✓v). `mergeCanonicalPieceInto`
  (`:2236-2314`) merges observationIds, mergeReasons, actions, fieldSources and
  conflicts, plus exactly two flags (`_ownTextHedge`,
  `_ownTextFixedCommitment`) — **zero payload fields**. Every absorbing merge
  still silently deletes the loser's address, endTime or description. The
  07-18 audit called this out; it has survived two arcs.
- **B5 (MED) Text normalization is still not shared.** Live and mutually
  inconsistent: `foldForSourceSupport` (`:6479`), `normalizedComparable`
  (`:529`), `mentionComparableTitle` (`:537`), `identityTokens` (`:633`),
  `distinctiveTitleTokens` (`:6487`), `stayAliasTitleTokens` (`:6507`),
  `titleContentTokens` (`entity-winner.ts:106`), `normalizeAuditIdentity`,
  `normalizeDuplicateTitle`, `wordsForHealth`. Three day-heading detectors
  remain (`activity-classifier.ts:175`, `evidence-clustering.ts:7251`,
  `parser-artifact-normalization.ts:89`).

## C. Grouping has no claim protocol (Phase 3, unimplemented)

- **C1 (HIGH) Three parent/child authorities, no arbitration.** The LLM
  resolver (`canonical-evidence-resolver.ts:851-970`), the deterministic creator
  (`:8102`, itself two internal lanes), and the executor (`:5758`) each carry a
  *different* eligibility set. The executor re-verifies same-site membership
  with a **fourth, drifted copy** of the creator's predicate — creator uses
  `radiusCoordinates` (verified-only), executor uses raw
  `precisePieceCoordinates` with no verified filter (`:5870/5886/5896`), so the
  executor can admit a child on fabricated coordinates the creator rejects.
- **C2 (HIGH) `pieceIsClaimed` is a one-way vacuum.** `:8159` permanently
  removes any resolver-claimed piece from the deterministic lane; the executor
  can then reject that same decision at ~9 separate `continue` gates
  (`:5783-5945`), and **nothing returns the piece**. A claimed-then-rejected
  piece can join no group and ships standalone. This is the claim-ledger gap the
  07-18 audit named in Phase 3.
- **C3 (HIGH) Same-site beats walk by statement order.** Both lanes share one
  `grouped` set; the walk lane opens with `if (grouped.has(piece)) return false`
  (`:8326`). `SAME_SITE_RADIUS_KM` 0.3 (`:7931`) fires inside the envelope of
  `WALK_RADIUS_KM` 1.8 (`:7935`) — the latter annotated "calibrated to the
  approved Malá Strana ruling", i.e. the group it now cannot form. No score, no
  contest, no tie-break.
- **C4 (MED/HIGH) Grouping membership reads post-merge residue.**
  `containerListsComponent` (`:7950`) tests `container.payload.description` —
  the merged payload — so absorbed description fragments make any nearby stop
  an exact segment match. Its sibling guard `pieceHasHedgeMarker` (`:7057`) was
  hardened to judge own-observation text only; the same hardening was never
  applied here. Same defect class, fixed on one consumer.
- **C5 (MED) The code's membership doctrine contradicts the answer key in
  writing.** The doc-comment at `:7947-7949` cites "KGB museum for 1 hour" as a
  *legitimate* castle component; `assembly-ground-truth-central-europe.md:129`
  rules KGB Museum standalone.
- **C6 (MED) A10 unfixed:** every dedup/demotion pass still runs before grouping
  executes (`:10953-10970`), and `demoteCanonicalPieceToCityNote`
  (`:7159-7174`) **nulls `date`/`startTime`/`endTime`**, destroying the key
  grouping is about to use. Irreversible; nothing restores it.

## D. The question surface has no contract enforcement

- **D1 (CRITICAL, ✓v) The question gate is dead in production.**
  `gateOffContractQuestions` (`:1746`) filters to
  `_canonicalReviewDisposition === "question"` (`:1750-1755`). That field is
  first assigned inside `canonicalizeCanonicalReviewDetails` (`:10420-10433`),
  called at `:11043` — **one line after** the gate at `:11042`. Parser
  `missingDetails` carry no disposition (parser schema is
  `additionalProperties:false`, `openai-trip-parser.ts:182`), so **all 7
  dismissal rules never see the single largest question source.** It is green in
  tests only because fixtures hand-seed the field
  (`tests/assembly-ground-truth-run7.test.ts:729+`) onto a shape production
  cannot emit. This is the same false-confidence class as the vacuous test
  runner (`37dd672`).
- **D2 (CRITICAL, ✓v) No identity predicate is applied to any question field.**
  The complete consumer set of `identity-prose.ts` is five call sites in
  `evidence-clustering.ts` (`:4463`, `:4598`, `:4620`, `:5019`) plus the audit
  detector (`:943`) — **every one operates on `piece.payload`**. Nothing tests
  `prompt`, `reason`, `targetField`, `relatedTitle` or `guessedValue`. The
  system scrubs an identity block out of card prose and then asks the maker to
  type it back in (run 7.25.0 shipped `customer` and `reserved_by_created`
  questions).
- **D3 (HIGH, ✓v) The review path keeps an un-migrated private identity copy
  with the exact bug the shared module was built to kill.**
  `scrubReviewEvidence` (`:10201-10204`) uses
  `/\b(?:customer|traveler|guest)\s*:\s*…/gi` — colon-required — which
  `identity-prose.ts:9-11` documents verbatim as the 7.18.3 PB-1 leak. It also
  matches bare `guest`, which the shared module deliberately excludes
  ("Guest House Prague" is a venue). Detector drift (B4 in the 07-18 audit)
  re-grown inside the review path.
- **D4 (HIGH) The recovery path mints cards from unvalidated question
  subjects.** `recoverMissingNamedEvidence` (`:9192`) creates an
  output-eligible piece from a question's `relatedTitle` (`:9260`,
  `itemType:"placeholder"` `:9254`), guarded by a `$`-anchored non-entity regex
  (`:9213`) that a trailing clock time defeats — and the identical regex is
  duplicated verbatim at `:9359`, so the drop filter fails the same way. It runs
  at `:10918`, before `createCanonicalOwnedQuestions` (`:11005`), which mints a
  `date` question for any dateless activity **with no entity-shape test**
  (`:10074-10093`). One junk question becomes a junk card becomes another junk
  question.
- **D5 (HIGH) Question subjects immunise their own cards from demotion.** Nine
  demotion sites skip any piece whose title matches a question subject
  (`:7457, 7524, 7569, 7616, 7728, 7844, 7901, 8357, 8470`) — applied *before*
  any question is validated. A junk question protects the card that mints the
  next one.
- **D6 (MED) Entity-shape predicates exist and are never imported by the
  question path.** `isDayArcTitle`, `isHeadingFragmentTitle`,
  `classifyMergeEligibility` (`entity-winner.ts:121/163/185`) are consumed only
  by merge adapters, pre-clustering normalization and the detector.
- **D7 (MED) Unbound questions are an explicit pass** — `if (!piece) { return
  true; }` (`:9556-9558`) — and "a question cannot outlive its subject" only
  applies to questions that *had* a subject id (`:10459-10460`).
- **D8 (MED) `targetField` is an unconstrained free string**
  (`openai-trip-parser.ts:217`), so no filter branch can be exhaustive by
  construction.
- **D9 (LOW/MED) The highest-volume dismissal path produces an unquotable
  reason.** The internal-trace branch (`:10412-10422`) matches 11 alternations
  against the concatenation of five free-text fields and is the **only**
  dismissal producer that never writes `_canonicalQuestionGate`, so it falls
  back to "dismissed during canonical assembly"
  (`review-question-policy.ts:169`). It has no allow-list: a legitimate question
  whose evidence quotes "OCR" or "lineage" is silently dismissed. This is why
  7.25.0's dismissal reason is generic while 7.24.1's was specific — not a
  regression, a different path.
- **D10** Of the 07-18 design's R1–R7: **R2, R4, R7 landed**; R3 landed
  elsewhere (`:1634-1678`); **R1 is partial** (gated to
  `/date|checkin|checkout|time|confirmation/`, and its `_representedByPieceId`
  chain at `:10296-10302` is **unreachable** because `pieceForMissingDetail`
  filters `outputEligible` on every return path); **R5 partial** — the audit's
  flagged `pieceId`-in-dedupe-key is unchanged (`:10616-10620`); **R6 is
  drop-only**, retarget is the dead code above. `unresolvedMissingDetails` still
  carries all 16 branches — the pass subsumed nothing.

## E. Remediation cannot repair content defects

- **E1 (HIGH) `conservative_fallback_preserved_for_review` is the only terminal
  state a content defect can reach.** The route's sole remediation is
  `reapplyCanonicalOutputInvariants` (`extract/route.ts:570-604`), whose five
  passes include **no dedup, no grouping, no demotion reversal**. Then
  `createTripQualityOutcomes` (`trip-quality-outcomes.ts:174-188`) offers two
  branches — `existing_precise_maker_question` (exact subjectId+subjectType
  match) or the conservative fallback. There is no third. The dark-factory
  clause "every rule terminates in a tested outcome" is satisfied by a constant.
- **E2 (HIGH, ✓v) A structural warning is reported to the maker as a *privacy*
  warning.** `countOpenPublishWarnings` (`trip-publish-policy.ts:84-122`) counts
  any `warning:`-prefixed finding (minus `activity_bloat`) into
  `openHardWarningCount`, and `assessTripPublishReadinessCopy` sums it with
  privacy P0s into `privacyWarningCount` → "Ready with N privacy warnings"
  (`:140-147`). Run 7.25.0's duplicate-title warning therefore renders as a
  privacy warning with zero privacy content — and corrupts the "target N=0"
  tripwire, since a real P0 is now indistinguishable in the headline.
- **E3 (MED) The diagnostics lane remains inert.** 1 P1 + 4 P2 fired this run
  and gated nothing — the same observation as 7.24.1. Detection without
  disposition is a standing property, not a per-run finding.

## F. Recommended remediation (revised from 07-18 Phases 1–4)

Phase 0 items from the 07-18 audit are done or superseded. The rest reorders:

- **Phase 1 (do first — closes A1–A5, and is the prerequisite for everything
  else): three registries and one pass.**
  1. `lib/extraction/record-field-walk.ts` — one exported
     `PUBLIC_TEXT_FIELDS: Record<Lane, string[]>` + `walkPublicText()`,
     populated from the inline lists at `:4563/:4587/:4596/:4473/:4503`, adding
     `place`. Rewrite `scrubProtectedValuesFromPublicProse` as one loop over it,
     and have the detector import the same registry so field parity is
     structural.
  2. `lib/extraction/record-shape-predicates.ts` — export and unify
     `isDocumentArtifactShapedStayName`, `isPersonNameShapedStayName`,
     `isDayHeadingLine`, the rental/ticket title families, and the `:9214`
     literal set behind one `classifyRecordTitleShape()`. Note the vocabularies
     must be *unioned*, not just re-scoped: generalising the stay pattern alone
     would still miss `"15.01.2019 14:30"`, which only `isDayHeadingLine`
     recognises.
  3. `export` `classifyCityNoteSegmentSafety` and apply it to every prose-
     bearing lane — it already unions costs, access, credentials and ticket OCR.
  4. One `applyCanonicalCandidacyGates()` with a declarative table whose entries
     declare `lanes: "all" | Lane[]`, replacing the three lane-specific entry
     points; **bind the retry lane to the same pass** (A4), and run it again
     after `:10918` so recovery-minted pieces cannot bypass candidacy.
- **Phase 2 — `sameEntity(a,b) → {isSame, winner}`.** The unbuilt half of the
  07-18 Phase 1. One identity predicate, one stopword policy, consumed by all
  six collapse triggers **and by both detectors**, so pipeline and audit can
  never again disagree about whether two cards are the same venue. Resolve the
  `castle` contradiction explicitly (venue nouns are structure-bearing for
  *grouping* and stopwords for *aliasing* — that distinction needs to be a
  parameter, not two divergent Sets). Fix B4 in the same change: fold payload
  fields on merge.
- **Phase 3 — question surface.** Move `gateOffContractQuestions` after
  canonicalization (or make its filter disposition-independent) — D1 is a
  one-line-class fix with outsized return; apply the identity predicates to
  question fields at mint and at projection; constrain `targetField` to an enum;
  stop `recoverMissingNamedEvidence` minting output-eligible cards from
  unvalidated subjects; deduplicate the `:9213`/`:9359` regex.
- **Phase 4 — claims and ordering.** A grouping claim ledger (C2), scored
  arbitration between same-site and walk lanes (C3), one membership predicate
  shared by creator and executor (C1), grouping before demotion or a demotion
  that is reversible (C6).
- **Phase 5 — remediation honesty.** Either give the corridor real repair
  passes for content defects or stop classifying them as "preserved for review"
  as though a choice was made (E1); split privacy from structural in the publish
  copy (E2).

**Sequencing note.** Phase 1 is the one that changes the *shape* of the
codebase; Phases 2–5 are large but conventional. If only one lands before the
next live run, it should be Phase 1 plus D1, because between them they convert
the two failure classes that have produced every recurrence — unshared coverage
and a gate that silently never runs.
