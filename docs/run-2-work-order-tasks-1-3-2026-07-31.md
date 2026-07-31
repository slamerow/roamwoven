# Run-2 work order — Tasks 1, 2, 3, 3b, 4 and 5 landed

Session date 2026-07-31. Input: `docs/run-2-audit-handoff-2026-07-28.md` §7.
Per AGENTS.md rule 7(c) every claim below is VERIFIED (with its artifact) or
labelled HYPOTHESIS.

**Nothing here has been deployed and NO live run was spent.** Committed
checkpoint, not a push-ready deploy claim (§Dark-factory: those are different
statements).

Locked contracts touched: **RW-OPS-001** (Task 1), **RW-PLC-001** and
**RW-GRP-001** (Task 2), **RW-TRV-001** (Task 3) — evidence only, no contract
TEXT changed.

**Ledger bumped to v24** for one COVERAGE change: **RW-GRP-001 `KNOWN_GAP` →
`PARTIAL`**, on Eli's explicit decision 2026-07-31, on run-2 evidence (2
grouped stops, both correct, ZERO wrong). `KNOWN_GAP` asserts current behavior
VIOLATES the contract, and that is no longer true. The uncovered path is named
in the entry rather than hidden by the label: the TARGET has not grouped live.
**RW-PLC-001 deliberately STAYS `KNOWN_GAP`** — its defect is fixed in code and
unproven by a run, and fixture-green is never sufficient (§Coverage honesty).

---

## 0. Status

| | |
|---|---|
| Task 1 — send + record sampling params | **LANDED**, tests green |
| Task 2 — Prague Castle container | **LANDED.** Root cause found in the pinned parse; it is neither (A1) nor (B). Tests green. |
| Task 3 — collapse the duplicate generic stay | **LANDED**, tests green |
| Task 4 — amend the misleading docket §A.4b | **LANDED** (docs only) |
| Task 3b — pinning as the iteration loop | **LANDED** — env was already on; one code trap fixed (§7) |
| Task 5 — make the verified-coordinate bar item checkable | **LANDED**, and the premise was subtler than written |
| Suite | 79 test files, 0 failures, `tsc --noEmit` clean |

---

## 1. Task 1 — the sampling params now actually reach the API

§6's finding is confirmed by reading the three call sites. Both real ones
(`lib/ai/openai.ts` first call and incomplete-output retry) omitted
`samplingParams`; the strip-and-retry branch guarded on
`Object.keys(samplingParams).length > 0` and was therefore **dead code**, never
once reachable.

What changed:

1. Both call sites pass `samplingParams`. The strip-retry path is reachable for
   the first time and is now covered by a test that drives a 400 naming
   `temperature`.
2. `requestStructuredResponse` returns `{ body, sentSamplingParams }` —
   reported from INSIDE the request, so a stripped retry reports `{}` rather
   than what the caller hoped for.
3. `OpenAIStructuredResponseResult.sentSamplingParams` has three values and
   they mean three different things:
   - `{seed, temperature}` — a live request carried them
   - `{}` — a live request carried none (env unset, or stripped after a 400)
   - `null` — **no request was made**, a pin replay served this result. The
     hit path overwrites the stored value explicitly; replaying the recording
     run's params would be §6's dishonesty pointed the other way.
4. `usage.openai.extractionSampling` = `{resolved, sent, liveCallCount,
   replayedCallCount, strippedCallCount}`, aggregated over the spine call plus
   every activity chunk call — the calls that make the parse. The resolver and
   recovery lanes keep their own usage.
5. It is on the **audit-snapshot whitelist in the same change**
   (`createExtractionSummary`) and in
   `TripExtractionAuditReport["extraction"]`. That whitelist is the thing that
   silently ate `formattedAddressCount` and `excludedPlanningCostLineCount`;
   adding the producer without adding the projection is the defect, not the
   fix.

Tests: `tests/extraction-pinning.test.ts` (request body carries seed 7 /
temperature 0; strip-retry reports not-sent; pin hit reports `null`) and
`tests/arc-f-telemetry.test.ts` 8.4/8.5 (whitelist survival; a
resolved-but-stripped run reports `resolved` WITHOUT `sent`).

**Rule 1 arithmetic and failure modes, for the run that ships this.** This is a
migration: it changes what the model call carries. Expected failure mode is
unchanged from §6 — the Responses API may reject `temperature`/`seed` for
reasoning models. Cost if it fires: **one extra HTTP call per structured call
that gets a 400**, never the run, and it is now visible as
`strippedCallCount > 0` instead of being invisible. Undo: revert this commit,
or delete the two env vars (which returns the system to today's behavior
exactly, since today they do nothing). Confidence that determinism improves:
**LOW-to-MODERATE, and deliberately unscored this run** — OCR is a separate
model call and is not seeded, so the input document still varies. Per §6, do
not try to score the seed change on one run; measuring variance reduction
needs the same input parsed twice.

**Run ordering — Eli's decision 2026-07-31, FINAL: the next live run carries
EVERYTHING (Tasks 1-5). The sampling params stay ON.**

Two earlier positions were considered and dropped, recorded so nobody re-opens
them: "Task 1 alone" was chosen before Task 2 turned out to be fixable, and a
run that cannot move the bar is an expensive way to learn whether an API
accepts a parameter; "hold Task 1" was then proposed to keep the model call
byte-identical, and dropped because holding it also holds the pin corpus empty
for another run, which is the methodology blocker §5 names.

Rule 1(d) is satisfied on its own terms. Task 1 is the only model/infra change
in the set, §6 already rules out SCORING it on a single run (OCR is a separate
unseeded model call, so the input document varies regardless), and it is not
being scored on this one. Everything else is assembly-side and cannot alter the
model call. What makes one run legitimate rather than merely convenient is that
each change has its own unambiguous tell:

| change | what proves it fired |
|---|---|
| Task 1 | `extraction.extractionSampling.sent` = `{seed: 7, temperature: 0}` |
| Task 2 | a DATED Jan-16 Prague Castle card, and it is grouping-container ELIGIBLE |
| Task 3 | `stays` back to 5, and no stay with `checkInDate 2019-01-12` |
| Task 5 | `audit.lineage.rows[].observations[].verifiedLatitude` non-null |

`strippedCallCount > 0` means the model rejected the params and the fail-soft
strip-retry fired — one extra call, never the run, and now visible instead of
invisible.

Pre-flight (rule 3): deploy green, fresh browser tab, and confirm from run 2's
telemetry that `EXTRACTION_PIN_WRITE` and `EXTRACTION_PIN_REUSE` are both on
before starting.

Expect NO pin cache hit on this run — §6 emptied the corpus. This run writes
the first valid pin. From the run after, assembly changes replay for free
(Task 3b below), with one permanent exception: a replay can never answer a
geocode question, because `replay-pinned-parse.mjs:14` disables that lane.

---

## 2. Task 2 — root cause found. It was neither the model nor the geocoder.

**VERIFIED, artifact 1: the source document.** `USE FOR TESTING CZECH.pdf`,
text layer via `pdftotext -layout`, lines 100–113:

```
Wednesday, January 16th
Lesser Town & Prague Castle          <- the day heading names it

Trdlnik for breakfast
KGB museum
R2D2 (far away)
Kafka statue

Prague castle (2 hours)              <- a dated day-section line
   ● Changing of the Guard -12:00 PM
   ● Need to decide which ticket to get
```

**VERIFIED, artifact 2: run 2's pinned parse.** `trip_extraction_parses`,
parse key `5d2ad2d66cba52f5…` (60 calls, `gpt-5.4-mini`, `sampling_params {}`,
2026-07-28 11:59:30Z), read via the Supabase SQL editor:

| title | date | evidenceRole | itemType | sourceSectionType | sourceSectionLabel |
|---|---|---|---|---|---|
| Prague Castle visit | 2019-01-16 | `grouping_proposal` | activity | `dated_itinerary` | Wednesday, January 16th |
| Prague castle | 2019-01-16 | `grouping_proposal` | activity | `dated_itinerary` | Wednesday, January 16th |

**The model was right.** It emitted a dated day-section activity and proposed it
as a grouping parent — exactly what the parser prompt's own grouping-proposal
rule asks for.

**§4's fork is resolved, and BOTH of its branches are dead.** Not (B): the
castle is not notes-only, so do NOT patch `recoverMissingNamedEvidence` to
inherit `date`/`city`. Not the model-side reading of (A) either: the
`"…CZECH.pdf notes"` `sourceLabel` in the lineage was the CHUNK name, not the
section — the section is `dated_itinerary`. The demotion is **pipeline-side**.

### The line

`reclassifySourceContainers`, `lib/extraction/evidence-clustering.ts`:

> a `grouping_proposal` whose grouping decision was never approved becomes
> `kind/role: context`.

No group formed around Prague Castle in run 2, because its children were the
stops the geocode lane could not place. So the container was converted to
context — silently, and bypassing the `SAME_SITE_CONTAINER_PATTERN` guard that
the very next block in the same function already honors for generic containers.

**One line, four symptoms**, all of them things earlier sessions attributed
elsewhere:

1. the dated Jan-16 castle card disappeared;
2. `recoverMissingNamedEvidence` found no live piece for the ticket question
   and synthesized the UNDATED `placeholder` — §4's "single highest-value
   finding" is a SYMPTOM two steps downstream, exactly as §4 suspected;
3. Jan 16 then held zero dated containers, so `retryQueryFor` returned null for
   every Jan-16 card — that is the **entirety** of `retryCount: 0`, and the
   reason G4.3 was never exercised. G4.3 remains UNTESTED, not broken, and
   nothing in the geocode lane needs changing;
4. grouping had no container either — the missed TARGET.

### The fix

Per Eli's 2026-07-28 decision, unchanged: a named site container carrying an
unresolved decision survives as a DATED CARD **and** raises the question.

A rejected grouping proposal that is a NAMED SITE container with a real date is
rescued to `atomic_candidate` rather than demoted. Everything else about the
branch is untouched, because it is load-bearing: it is what keeps "Explore
Vienna" and bare day/route headings off the traveler's day (RW-ASM-001).

Two gates, both deliberate:

- the SHARED `SAME_SITE_CONTAINER_PATTERN` (castle / palace / complex /
  grounds / citadel / fortress / acropolis / abbey / monastery) — the same
  predicate grouping itself uses, so the container definition cannot diverge
  between the two lanes, and the same one the generic-container demotion below
  already honors;
- a real date, since an undated survivor is the defect being fixed rather than
  the fix.

Heading fragments are already demoted upstream by parser-artifact normalization
(`heading_fragment_card`), so this does not re-judge them.

Enforced by `tests/site-container-survives-rejected-grouping.test.ts`: the live
parse shape verbatim, plus negative controls for a day-heading proposal and for
an undated site container. Proven both directions — with the rescue disabled
the positive case fails and both controls still pass. The full suite (79 files,
including every grouping and ground-truth file) is green.

**Coverage stays `KNOWN_GAP`.** No live run has shipped a dated Jan-16 castle
card yet, and fixture-green is never sufficient (§Coverage honesty). Restoring
it is a decision on the next run's evidence.

**For the next run's audit, in order.** §10 item 1 still stands and is still the
run's whole question — but ask it as ELIGIBILITY, not date: a dated card that is
not a valid grouping container has fixed one symptom and not the target. Then
`retryCount`: if it is still 0 with a dated Jan-16 container present, the
container-map keying is a second, independent defect. Then `groupedStops`.

### Deferred, deliberately

Nothing was done about the SECOND Prague Castle piece. The model emitted two
(`Prague Castle visit` and `Prague castle`, same date, same section), and the
existing near-identical-collapse ladder should merge them now that both survive
as real candidates rather than both being context. If the next run ships two
castle cards, that is the collapse ladder to look at — not this lane.

## 3. Task 3 — the 6th stay collapses, and does not fabricate a Jan-12 night

The reconciler was not wrong to decline. Pass 1 merges on VENUE identity and
`Rome Stay` / `The Yellow` share no token; Pass 2 requires a fragment with no
checkout and `Rome Stay` carries one. Both correctly refused.

The discriminator that separates the live pair from every negative control:
**a placeholder's only surviving identity token is its own CITY token.**
`finalizeCanonicalStayFields` has already rewritten every unnamed stay to
`<City> <Type>` by the time the reconciler runs, so the city token is all a
placeholder has left — and a city token names the LEG, never the venue.

Pass 3 runs LAST, so Pass 1 and Pass 2 get first refusal. Guards, each pinned
by a negative control in `tests/generic-placeholder-stay.test.ts`:

- an **anchored** placeholder (address or booking code) is real lodging —
  survives
- an **ambiguous** placeholder with two named same-city venues in range stays
  put — guessing is a wrong merge, and per Eli's standing geocoder ruling a
  wrong merge is worse than a duplicate
- a **non-overlapping** placeholder survives — absorbing it would delete real
  night coverage
- two independently named stays can never see each other here (neither is a
  placeholder), which is what protects `Hotel Central` / `Hotel Plaza`

**The named venue's dates ALWAYS win (Eli, 2026-07-31).** This is load-bearing,
not a detail. A range union would give `The Yellow` a 2019-01-12 check-in —
precisely the fabricated transit-night stay RW-TRV-001 forbids and that
`tests/assembly-ground-truth.test.ts` already fails on ("no fabricated stay for
the overnight-flight night"). The Jan-12 night is covered by the overnight
Delta 444 arrival. The absorbed placeholder's range is recorded on the merge
action so the dropped coverage claim is auditable rather than silent.

Known limit, recorded rather than fixed: if a generic placeholder ever covered
a real night nothing else covers, absorbing it loses that night silently at
this layer. Accepted on Eli's decision; the `same_leg_stay_night_overlap`
advisory and the ground-truth night-coverage check are the backstop.

Proven both directions: with Pass 3 neutralised, the positive test fails and
the four negative controls still pass.

---

## 4. Blast radius (rule 8(a))

Task 2 changes the VALUE DOMAIN of `evidenceRole`/`kind` for one narrow class
of observation — a classification gate, which rule 8(a) names as the third trap
and which rule 1 therefore treats as a real variable, not a cosmetic edit. It is
scoped by two predicates and pinned by two negative controls, and the whole
suite (79 files, every grouping and ground-truth file included) is green
unchanged, which is the evidence that the rescue does not widen.

`scripts/blast-radius.sh sentSamplingParams` — 11 references, all inside the
two files that produce it, no truthiness checks, no map keys, no classification
gates. `extractionSampling` is additive to `usage` and to the audit extraction
summary; `TripExtractionAuditReport["extraction"]` gained a non-optional key,
which broke exactly one hand-built literal
(`tests/trip-quality-outcomes.test.ts`) — updated. Task 3 changes no field
value or domain; it suppresses one stay piece through the existing
`mergeCanonicalPieceInto` path, which does not copy payload fields, so no
target date can move.

---

## 5. Tasks 4 and 5

**Task 4 — docs only.** `docs/assembly-defect-docket-2026-07-28-run-7.28.0.md`
§A.4b now carries an amendment box at the top, and its heading changed from
"could not have grouped Schönbrunn at all" to "ON THIS PARSE". The proof below
it is untouched and still correct for the 7.28.0 parse; only the generalisation
is withdrawn. Its load-bearing premise — "the model emitted two Schönbrunn
pieces total" — is a fact about one parse, not about the code, and run 2's parse
emitted the extra piece and grouped. The §7 prediction that cited it
("Schönbrunn groups: <2/10, and steps 1–4 cannot change that") is marked
RESOLVED-WRONG in place, with the reason: a confidence stated over a variable
input has to name the input as the variable.

**Task 5 — the premise was subtler than the work order says, and the fix moved.**
The task read "add `verifiedLatitude`/`verifiedLongitude` to the served draft
snapshot". They are ALREADY there — `summarizeActivity` in
`trip-extraction-audit-snapshot.ts` has carried them since Arc B, and
`canonicalPiecePublicPayload` deliberately does not strip them. The real gap is
one layer later: `createAuditSummary` in `trip-extraction-qa-bundle.ts`
re-projects each lineage observation through a hand-written field list, and that
list dropped ALL FIVE geo fields — `approxLatitude`, `approxLongitude`,
`verifiedLatitude`, `verifiedLongitude`, `area`.

That matters beyond one bar item: RW-GRP-001's Arc A run5 entry states in these
words that geo/area fields "ride on QA bundle lineage observations so radius
claims are verifiable from the bundle." **That sentence has been false since it
was written.** Every radius claim scored off a bundle was scored off absent
data, and run 2's MUST-IMPROVE item "no two venues sharing a verified
coordinate" was recorded NOT CHECKABLE for exactly this reason. Fourth instance
of the whitelist-drop class in this document, after `formattedAddressCount`,
`excludedPlanningCostLineCount` and `extractionSampling`.

These are AUDIT coordinates. Nothing moves into the persisted draft or the
traveler projection, and the geocode lane's proximity-only posture is untouched.

Observability (rule 8(b)) — the field and value that will prove it fired:
`audit.lineage.rows[].observations[].verifiedLatitude` non-null on the next
run's bundle for Schönbrunn and Gloriette. NOT unit-tested: the qa-bundle test
fixture carries `report: null`, so it has no lineage rows to project, and
building a full report fixture was not worth doing between a fix and a run. The
field names are typechecked against the lineage row type, so the failure mode
is "always null", which the next bundle answers directly. Recorded rather than
papered over.

---

## 6. The castle question — half fixed, and the other half is now precisely located

Eli's 2026-07-28 ruling was "survives as a DATED CARD **and** raises the
question — not one or the other." Task 2 delivered the card. The question half
is NOT closed, and the reason is not what §4 implied.

VERIFIED 2026-07-31 by running the run-2 shape through the real cluster path:
with the container dated again, RW-QUE-001's one-venue-one-decision
consolidation IS reached — the `if (!rootDate) continue` bail that blocked it in
run 2 no longer fires — but it still does not consolidate, because the two
sub-stop questions come out of subject resolution with
`relatedCanonicalPieceId: null`, and the consolidation keys on that id. The
container's own question keeps its subject; its children lose theirs.

**So run 2's three castle questions were TWO independent defects stacked, not
one.** That is worth saying plainly, because the 7.28.0 docket treated chains A
and D as "one wound".

Deliberately NOT fixed here: it is its own change, it belongs with the F.3
convergence work RW-QUE-001 already tracks, and shipping it unexamined beside a
classification change would be a second variable in one run (rule 1(d)).
Pinned as a characterisation assertion in
`tests/site-container-survives-rejected-grouping.test.ts` — asserting THREE
questions, current production truth, with a note that the assertion is expected
to fail when sub-stop subject resolution is fixed and must then be updated to
`1` rather than deleted. Same posture as
`tests/question-gate-production-shape.test.ts`.

---

## 7. Task 3b — the replay loop, and the trap that would have broken it

`EXTRACTION_PIN_WRITE` and `EXTRACTION_PIN_REUSE` are both already ON in
production (Eli, 2026-07-28), so the loop needs no env change. It needed one
code fix, found by reading `replay-pinned-parse.mjs` against Task 1.

The replay rebuilds the parse key to prove the materials reconstruct
byte-identically, and it took the sampling params for that rebuild from
`resolveExtractionSamplingParams()` — i.e. from whatever `.env.local` holds on
the machine running the replay. Production sets `OPENAI_EXTRACTION_SEED` and
`_TEMPERATURE`; `.env.local` does not. So the FIRST run that records a pin
under a seeded key would have made every local replay of it die on
`parse key mismatch (materials or sampling params differ)` — a message pointing
at the materials, which are fine. The loop would have broken at the exact
moment it became useful, and the error would have sent the next session hunting
the wrong layer.

Fixed: the rebuild now takes the sampling params from the STORED ROW, which is
the only correct value for reproducing the recording run's key. Local env is
still read, but only to warn when it diverges (worth knowing — it means a fresh
live run from that machine would write under a different key) and never
fatally. The mismatch message now says plainly that sampling params came from
the pin, so a mismatch IS a materials difference.

The loop, once this run writes a pin:

```
node scripts/replay-pinned-parse.mjs <parseKeyPrefix>
```

Keep reuse ON for assembly work, OFF when testing extraction itself. A replay
cannot answer a geocode question (`replay-pinned-parse.mjs:14`); for those,
spend a live run.

---

## 8. What is NOT done

- **Sub-stop question subject resolution** — §6. The single highest-value item
  left, and now precisely located.
- **RW-PLC-001 coverage** — stays `KNOWN_GAP`. Its defect (the duplicate +
  dateless castle) is fixed in code and unproven by a run. RW-GRP-001 moved to
  `PARTIAL` this date on Eli's explicit decision; ledger is now v24.
- **RW-GRP-001 coverage** — §9 of the run-2 handoff says whether run 2's
  2-correct/0-wrong groups earn `PARTIAL` is Eli's explicit call. Deferred to
  the next run's evidence, so it stays `KNOWN_GAP`.
- **The second Prague Castle piece** — the model emitted two. Both now survive
  as real candidates rather than as context, so the existing near-identical
  collapse ladder should merge them. If the next run ships two castle cards,
  that ladder is where to look, not the reclassification lane.
