# Assembly restructure — survey and sizing (2026-08-04)

Mechanical survey of `lib/` to size the RW-ORD-001 restructure. Four independent
passes, each with clean context, each answering one question. Counts are read
from source, not estimated.

---

## 1. The shape of the problem, in numbers

| Measure | Value |
|---|---|
| Total lines in `lib/` | 44,086 |
| Lines in `evidence-clustering.ts` | 11,788 (27% of all logic) |
| Pass invocations in one orchestrator (`clusterExtractedEvidence`, 11298–11788) | **72** |
| Distinct pass functions | 54 (4 run twice, because a later pass changed state they needed) |
| Passes that MUTATE the shared `pieces` array | **~50 of 72** |
| Passes doing more than one stage's job (MIXED) | **~22** |
| Call sites that can REMOVE a record | **54** |
| Ordering violations (delete/reclassify after group or after question) | **5** |

The orchestrator is a straight-line sequence of 72 steps over one shared mutable
array. There is no gate between steps and no enforced invariant.

---

## 2. The 54 removal sites, classified

The question that sizes Invariant A ("no later stage deletes a record an earlier
stage justified") is: how many removals already name a surviving record?

| Class | Count | Meaning |
|---|---:|---|
| NAMES_SURVIVOR | 31 | A concrete surviving piece is recorded. Gating these is a signature change. |
| NAMES_DESTINATION_ONLY | 8 | The reason string names a destination ("city note collection", "canonical transport") but no concrete surviving id. |
| MIXED | 2 | Branches to both at one call site. |
| NO_SURVIVOR | 13 | The record simply stops being eligible. |

Mechanism: `mergeCanonicalPieceInto` (26 sites, always carries a target →
always names a survivor) · `suppressCanonicalPiece` (23 sites, takes NO target
parameter) · direct `piece.outputEligible = false` (5 sites, bypasses both).

**The root asymmetry: the merge primitive requires a destination; the suppress
primitive does not.** That single API difference is what makes silent deletion
possible.

### Sizing the gate

- **31 trivial.** The survivor object is already in scope at the call site; it
  just is not passed to the primitive.
- **10 need thought.** Several suppress against a *set* of candidates rather
  than one, so someone must decide whether the gate accepts a list. Two
  (2155, 3615) run the removal unconditionally with the survivor lookup bolted
  on afterwards, and need the decision itself restructured.
- **13 are a policy decision, not a code change.** Costs-section material,
  explicit cancellations, stays with no night evidence, unsupported model
  inventions. The gate needs an explicit, labelled "terminal disposal" escape
  hatch — and each of the 13 audited to confirm it genuinely has no absorbing
  record. At least one (the id-collision drop in
  `canonical-trip-assembly.ts:406`) plausibly should be a merge.

### Riskiest sites

1. `suppressRepresentedTravelAndStayActivities` (3060/3178/3312) — runs **twice**,
   the second time after provisional dates are finalised, so it can retroactively
   suppress a card that intervening passes already enriched. Names a destination
   class, never a concrete id.
2. `suppressRouteLessTransportFragments` (2155) — deletion runs unconditionally;
   the host that would justify it is looked up afterwards and only conditionally
   recorded.
3. `enforceCanonicalOutputActivityRoles` (6629) — runs immediately after grouping
   executes, and can suppress a piece grouping just structured. Zero survivor
   reference.
4. Costs candidacy gate (11548) — fires before ~40 later passes, NO_SURVIVOR.
5. `resolveUncommittedRepeatMentions` (7841/7848/7856) vs `mergeCanonicalCityNotes`
   — two passes making independent survivor judgements about overlapping
   material, neither recording the other's decision.

---

## 3. The five ordering violations

RW-ORD-001 requires classify → containment → identity → group → question →
publish. What actually runs:

1. `enforceCanonicalOutputActivityRoles` (11639) deletes "day overview" pieces
   **after** grouping executed (11634).
2. `suppressIsolatedUntimedGenericMeals` / `suppressUnresolvedIsolatedTerms`
   (11652–3) delete pieces **after** questions were created (11643–51). A
   question can be left pointing at a record these passes then remove.
3. `rerouteCrossCityNoteContent` / `mergeCanonicalCityNotes` (11654–5) perform
   identity merges **after** the question stage.
4. `reconcileCanonicalConflicts` (11657) and `applyCanonicalTransportFieldRepair`
   (11663) are identity work stranded **after** a publish-stage pass. A comment
   at 11658 openly documents the ordering as hand-tuned to stop one clobbering
   the other — the code admitting the problem in a comment rather than a rule.
5. `createResearchedListQuestions` / `createDayLabelSlotQuestions` perform
   classify mutations *inside* question creation, fusing two stages in one call.

Also structural: ~8 mid-pipeline passes READ question state to decide
classification, so the question stage's output already leaks backward into
classification.

---

## 4. Identity churn

Ids are content-derived from provenance:

```ts
piece.id = `piece_${stableHash({ kind: piece.kind,
                                 observations: [...piece.observationIds].sort() })}`;
```

Because `observationIds` grows on every absorb, and `refreshCanonicalPieceId`
runs after every absorb, **reassignment is structurally inevitable, not
incidental.** It is the default for any record corroborated by more than one
document. ~27 call sites; only one opts out via `preserveTargetIdentity: true`.

**A stable handle already exists.** The birth id (`createPiece`, 2196) is keyed
only on the founding observation and would never need to change. Freezing is
mostly "stop overwriting it".

**What freezing buys.** The codebase has grown a compensating layer purely to
survive churn — `_canonicalPriorPieceIds` forwarding, a "dead-target sweep", a
prior-id fallback search, and a *semantic similarity matcher* in audit lineage
that exists because exact id joins fail. Most of that can be deleted. It also
removes a latent live bug: `_canonicalParentPieceId` and `_representedByPieceId`
are raw point-in-time snapshots of `.id` that go stale if a later merge refreshes
the target, tripping the hard invariant `item … targets missing parent …`.

Verdict: **medium.** Contained core change, then a mechanical cleanup of the
now-dead compensating machinery. Does not cascade into a rewrite.

---

## 5. Duplicated definitions — where the castle actually dies

Three collapse passes run back to back (11617–11619), each with a **different**
"is this the same thing" test:

| Pass | Checks `SAME_SITE_CONTAINER_PATTERN`? | Checks `isSiteComponentTitlePair`? |
|---|---|---|
| `collapseSlotCollisions` (6977) | **yes** | no |
| `collapseAlternativeSlotCards` (6867) | **NO** | yes |
| `collapseTitleContainmentAliases` (7119) | yes | yes |

`collapseAlternativeSlotCards` is the pass that ate Prague Castle. It recognises
a component ONLY by the `"<X> at <Site>"` title shape. `Changing of the Guard`
has no `at <site>` tail, so nothing stopped the merge — and the guard that would
have stopped it is sitting one function away in the same file.

The incomplete passes run BEFORE the one with the complete guard.

Other duplications, ranked:

2. `canonical-evidence-resolver.ts:433` carries a **private hedge regex** that
   omits `far away` — while `trip-card-taxonomy.ts`'s shared
   `WEAK_RECOMMENDATION_PATTERN` includes it. The same divergence was already
   found and fixed twice elsewhere (audit findings B1, B4) and never applied
   here. `"Prague Castle (far away, maybe skip)"` is read as hedged by one lane
   and not by the other.
3. Three independently-worded "site container" vocabularies
   (`SITE_CONTAINER_NOUN_PATTERN`, `isSiteComponentTitlePair`,
   `isSameSiteActivityGroup` in `trip-card-taxonomy.ts:118`). `monastery` is in
   the first and not the third.
4. `normalizeDuplicateTitle` (`generated-trip-summary.ts:346`) is a fourth
   "same title" comparator, warning-only.

Commitment language and title normalisation ARE properly single-sourced — the
codebase has done this consolidation before and it worked. That is the precedent
for doing it again.

---

## 6. Recommended sequence

**A. The container guard (hours).** Add the `SAME_SITE_CONTAINER_PATTERN` check
to `collapseAlternativeSlotCards`. This is docket Task A, now located exactly.
Replay-validatable against pin `a3e0ab66`; costs no live run.

**B. The removal gate (about a week).** One chokepoint every removal goes
through, refusing any that cannot name a survivor, with an explicit labelled
terminal-disposal category for the 13. 31 sites are mechanical; 10 need thought;
13 need a policy call first. This is the change that makes Invariant A
structural rather than remembered — and it would have caught both the castle
deletion AND the City Notes silently shipping empty.

**C. Freeze ids (1–2 weeks).** Stop overwriting the birth id; record absorption
in the existing actions ledger. Then delete the compensating machinery.

**D. Split the file (weeks).** The 22 MIXED passes are the cost. Hardest three:
`mergeObservationIntoPiece` (210 lines doing field-winner ranking, conflict
recording and eligibility promotion at once), `reconcileCardsAgainstCityNotes`
(invoked twice with different surrounding state), and the
`reconcileCanonicalConflicts` / `applyCanonicalTransportFieldRepair` pair (their
ordering is intentionally circular).

Re-run `scripts/scorecard.mjs` after each. If the number does not move, the step
was wrong.
