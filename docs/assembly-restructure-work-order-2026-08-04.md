# Work order — assembly restructure, phase 1 (2026-08-04)

Written BEFORE any code, because the recurring failure mode is not a bad plan —
it is a good plan abandoned mid-way when something interesting turns up. Every
task below names what it changes, how we know it fired, what must not break, and
what to do if something else surfaces.

**Target: the 10–12 scorecard failures caused by structure.** The other 6–8 are
judgement and geocoder problems and are explicitly OUT of scope (§6).

Baseline: `docs/assembly-scorecard-2026-08-04-run-8.1.0-payload.md` —
FAIL 18 · NOT CHECKABLE 4 · NOT BUILT 2 · PASS 7.

---

## 0. Standing rules for every task

1. **No live extraction runs.** Everything here is validated by replay against
   pin `a3e0ab66` and by re-scoring. A live run is a separate decision.
2. **Every change must move a named scorecard assertion.** State which one
   before writing code. If a change moves nothing, it was not needed.
3. **Out-of-scope defects are RECORDED, NOT FIXED.** Append to
   `docs/assembly-findings-inbox.md` with file:line and one sentence. Do not
   chase. This rule is the entire point of this document.
4. **If a task's blast radius turns out larger than stated here, STOP and
   report.** Do not expand scope to make a task work.
5. **Prove guards both directions.** A new guard must be shown to fail when
   disabled. A test that cannot fail is not coverage (§Coverage honesty).
6. **One task per agent, clean context.** Agents do not read this whole
   conversation.

---

## Task 0 — make the measurement loop self-serve (BLOCKS EVERYTHING)

**Problem.** Re-scoring after a code change needs a replay, the replay needs the
database, and the database is only reachable from Eli's own machine. That puts a
human in the loop on every iteration — which is exactly how a week-long task
becomes a month-long one.

**Change.** Add to `scripts/scorecard.mjs` (and reuse in
`scripts/replay-pinned-parse.mjs`):
- `--export <dir>` — write the pinned parse row and the rebuilt materials to
  disk as JSON.
- `--from-cache <dir>` — run the full replay from that directory, no network.

**Eli does once:** `node scripts/scorecard.mjs --export .assembly-cache`
(needs his terminal, ~1 minute). After that every agent measures without him.

**Tell it fired:** `--from-cache` produces the same parse key and the same
assertion results as a live replay.

**Risk:** the cache goes stale if the uploads change. Mitigate by storing the
parse key in the cache and refusing to run if a rebuild disagrees — the same
check the replay already does.

---

## Task A — stop the collapse eating site containers

**Fixes:** `GT-0116-1`, `GT-0116-2`, `ORD-2`, `ORD-3`, and 2 of the 4 records
under `PLC-1`/`PLC-3`.

**Root cause, verified.** Three collapse passes run back to back
(`evidence-clustering.ts` 11617–11619), each with a different same-entity test:

| Pass | checks `SAME_SITE_CONTAINER_PATTERN` | checks `isSiteComponentTitlePair` |
|---|---|---|
| `collapseSlotCollisions` (6977) | yes | no |
| `collapseAlternativeSlotCards` (6867) | **NO** | yes |
| `collapseTitleContainmentAliases` (7119) | yes | yes |

`collapseAlternativeSlotCards` recognises a component ONLY by the
`"<X> at <Site>"` title shape. `Changing of the Guard` has no `at <site>` tail,
so nothing stops the merge. It runs BEFORE the pass that has the complete guard.

**Change.** In `collapseAlternativeSlotCards` Pass 1, refuse a pair where one
side matches `SAME_SITE_CONTAINER_PATTERN` and carries a real date and the other
is a same-day piece. Use the SAME import the other two passes use — do not
re-implement, do not widen `isSiteComponentTitlePair` (the bug is that the
container is a container, not that the sibling is a component).

**Fix the fixture in the same change.**
`tests/site-container-survives-rejected-grouping.test.ts` gives its
`Changing of the Guard` sibling a title and a `startTime` and **no description**,
so Pass 1 bails at `if (leftDesc.length < 4 || rightDesc.length < 4) continue`
and the lane that actually killed the card is never reached. Give it a real
description. With the new guard disabled, the fixture MUST fail.

**Must not break:** `tests/assembly-ground-truth-run6.test.ts:368` (the 7.18.1
four-cards-for-one-lunch defect), `tests/generic-placeholder-stay.test.ts`, the
question-gate fixtures. Pass 2 depends on Pass 1's survivors.

**Tell it fired:** a dated Jan-16 `Prague Castle` card in the draft, and the four
assertions above flip to PASS.

---

## Task C — one definition per concept (do BEFORE Task B)

**Fixes:** nothing on today's scorecard. This is prevention — it removes the
mechanism that produced Task A's bug, so it does not recur while we are editing
the same lanes. Cheap, hours.

- **C1.** `canonical-evidence-resolver.ts:433` carries a private hedge regex
  that omits `far away`, while the shared `WEAK_RECOMMENDATION_PATTERN`
  (`trip-card-taxonomy.ts:55`) includes it. This is the exact rule R2D2 depends
  on. Import the shared predicate. The same divergence was found and fixed twice
  before (audit findings B1, B4) and never applied here.
- **C2.** `isSameSiteActivityGroup` (`trip-card-taxonomy.ts:118`) carries a third
  independent site-container word list — has `gardens`/`campus`/`estate`, missing
  `monastery`/`citadel`/`fortress`/`abbey`/`acropolis`. Consume
  `SITE_CONTAINER_NOUN_PATTERN`.
- **C3.** A test that FAILS if a new private copy of either vocabulary appears.
  Without it this regresses the next time someone is in a hurry.

**Must not break:** any test that depends on the resolver's narrower hedge
vocabulary. If widening the hedge set changes classification anywhere, that is a
REAL behaviour change — report it, do not absorb it silently.

---

## Task B — the removal gate

**Fixes:** `ORD-1`, `GT-0116-5`, `GT-0120-3`, the "reached neither a card nor
the note" half of `GT-0119-3`, and the remaining 2 records under
`PLC-1`/`PLC-3`.

**Root cause, verified.** There are 54 places that can remove a record.
`mergeCanonicalPieceInto` (26 sites) REQUIRES a destination. `suppressCanonicalPiece`
(23 sites) takes no target parameter at all. 5 more sites set
`piece.outputEligible = false` directly, bypassing both. That API asymmetry is
what makes silent deletion possible.

**Eli's decision, 2026-08-04:** deleting outright with nothing carrying it
forward is ALWAYS ALLOWED and ALWAYS LABELLED, so it appears in the scorecard
instead of being invisible.

**Sub-tasks, in order:**

- **B1.** Define the disposition type. Every removal supplies either
  `{ survivor: <piece> }` or `{ terminal: <reason code> }` from a closed
  vocabulary. Reason codes come from the 13 real terminal cases, named — not a
  free-text string.
- **B2.** Change the `suppressCanonicalPiece` signature to require it. This
  breaks all 23 call sites at compile time, which is the point: the compiler
  enumerates the work instead of a human remembering.
- **B3.** Route the **31 sites that already know their survivor** — the object
  is in scope, just not passed. Mechanical.
- **B4.** Route the **13 terminal sites** with named reason codes. Audit each
  one to confirm it genuinely has no absorbing record. At least one — the
  id-collision drop at `canonical-trip-assembly.ts:406` — plausibly should be a
  merge; if so, RECORD it and leave it terminal for now (rule 3).
- **B5.** The **10 that need thought** (8 destination-only + 2 mixed). Several
  suppress against a *set* of candidates, so decide whether the gate accepts a
  list. Two (`2155`, `3615`) run the removal unconditionally and look up the
  justifying record afterwards — those need the decision itself restructured so
  removal is conditioned on finding a survivor.
- **B6.** Route the **5 direct `outputEligible = false`** assignments through
  the same gate, so nothing bypasses it.
- **B7 — the one that catches the City Notes bug.** A final check: for every
  removal whose survivor is a City Note collection, assert the note that shipped
  actually CONTAINS it. Today three records were filed into notes that do not
  contain them, and nothing noticed. This is the check that makes "filed" mean
  filed.

**Tell it fired:** a disposal count by reason code, reaching a **served
surface** — the audit payload, not `usage`. Per AGENTS.md rule 8(b), absent
reads as zero and a change you cannot observe is not finished.

**Known consequence, accept in advance.** When the gate refuses a removal, the
record has to go somewhere. Some of today's silent losses will become visibly
wrong cards. That is expected and is an improvement — a wrong card can be seen
and fixed; a missing one cannot. Do not "fix" it by loosening the gate.

---

## 5. Sequence and stopping points

| Step | Effort | Re-score after? | Expected movement |
|---|---|---|---|
| Task 0 | hours | n/a | none — unblocks the loop |
| Task A | hours | yes | 4 flip to PASS, placeholders 4 → 2 |
| Task C | hours | yes | 0 flip; **no regressions** is the pass condition |
| Task B | ~1 week | yes | 4–5 flip, placeholders 2 → 0 |

**Then STOP.** Re-read the scorecard and decide freezing IDs and splitting the
file on the new numbers, not on today's. Those are the next two items and they
are NOT authorised by this document.

---

## 6. Explicitly OUT of scope — do not start these

Listed so that finding them is not a reason to chase them.

- **The geocoder loop** (retry injects the container name → geocoder returns the
  container → that address is read as the source placing the child inside it).
  Owns `GRP-2`, `GRP-4`, `GT-0119-1`, `GT-0119-2`. NOT replayable — the lane is
  not pinned. It needs the live run and is a separate work order.
- **Classification judgement** — seven Vienna ideas shipping as plans, the five
  `activity_bloat` warnings, `GT-0119-4` (Mumok/Natural History), `GT-0120-1`.
  This is block typing, which is NOT BUILT. Separate arc.
- **`GT-0116-3`** — Trdelník shipping twice with two spellings.
- **Freezing canonical ids.** Sized as medium in
  `docs/assembly-restructure-survey-2026-08-04.md`. After this phase.
- **Splitting `evidence-clustering.ts` into the six stages.** Weeks. The 22
  MIXED passes are the cost. After this phase.
- **The 5 ordering violations.** Real, recorded, and NOT fixed here — moving a
  pass is a behaviour change that deserves its own measurement.
