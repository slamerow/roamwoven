# Arc E paper plan — 2026-07-22 (pre-code, no code written)

Planned against: `docs/next-session.md` top entry (2026-07-22), AGENTS.md
§Operating discipline (binding), `docs/assembly-defect-docket-2026-07-21-run8.md`,
`docs/product-contracts.md` ledger v17. Repo verified at `3498f7b`
(handoff commit on top of f1b8ab1).

## Product-contract preflight callout

Locked contracts this arc touches: **RW-CAN-001** (repeat/fold rule — the
fold guard narrows its supersession clause), **RW-CLS-001** (own-text
stamping from the verbatim `evidence` excerpt — injection feeds it),
**RW-ASM-001** (one home per entity — card/note reconciliation path),
**RW-EVD-001** (dispositions; injection annotates, never creates
observations), **RW-GRP-001** (geocode lane fail-soft semantics),
**RW-AUD-001** (verbatim-compliance must stay auditable; injected vs
model-provided evidence must be distinguishable), **RW-OPS-001** (every new
path below names its dark-factory outcome), **RW-QA-001** (fail-soft
posture throughout). No `OPEN` ledger item is touched. One contract text
change is required: a v18 refinement of RW-CAN-001's
repeated-but-never-committed clause (workstream 1) — drafted below,
shipped in the same commit as the behavior per AGENTS.md rule 5,
**pending your explicit approval** (it narrows a LOCKED clause).

## What I verified in source before planning (receipts, not memory)

1. **The fold rule is real and has three kill paths**, all in
   `lib/extraction/evidence-clustering.ts`:
   - Group fold (~L6558–6592): uncommitted repeat group keeps the card only
     when **exactly one** copy passes `isDeliberateDayPlanMention`; zero
     *or two-plus* deliberate copies → all copies fold and demote to one
     City Note.
   - Cross-date single-piece demotion (~L6598–6612): one merged piece with
     ≥2 mention dates, none committed → City Note.
   - Card-vs-note reconciliation (~L6653–6680): an uncommitted card whose
     title also sits in a same-leg note list yields to the note copy unless
     it is "deliberate" AND the note copy came from a different section.
   - `isDeliberateDayPlanMention` (L6418) requires a day-plan section label
     **and** no price marker, no hedge, no availability marker. A day-plan
     copy that carries prices/hours text (exactly what this PDF's day
     sections do) flunks "deliberate" — so a twice-listed, this-parse-undated
     Schoenbrunn had zero deliberate copies and died in path 1. Mechanism
     confirmed; which sub-path fired should be pinned from the 7.22.4
     bundle lineage when building fixtures (bundle not in repo — refetch
     via `/data/audit/qa-bundle?includePrivate=1`).
2. **Evidence retention is model refusal, not a visibility bug.** The
   prompt demands verbatim evidence (openai-trip-parser.ts L399), the
   schema requires the field (L115/163), and Arc D put `evidence` into
   lineage serialization (trip-extraction-audit-lineage.ts L411–413). Run
   7.22.4 still shows zero evidence → gpt-5.4-mini nulls a schema-required
   field. A prompt-only fix is not credible; deterministic injection is.
3. **Chunk calls are already 3-wide**, not serial:
   `ACTIVITY_EXTRACTION_CONCURRENCY = 3` via `mapWithConcurrency`
   (openai-trip-parser.ts L53, L1275). The perf item is a bump 3→5, not a
   serialization rewrite. **Geocode lookups ARE strictly serial** (`for` +
   `await fetch`, geocode-verification.ts L211–223) — with 50 lookups this
   is the bigger latency win.
4. **Pinning is greenfield.** No `temperature`/`seed` anywhere in
   `lib/ai/openai.ts` or lib/extraction; no parse persistence; `db/` is
   hand-run production SQL files. One skeptical correction to the handoff:
   we call OpenAI's **Responses API** (`max_output_tokens` shape), which
   does **not** support `seed`, and gpt-5-family reasoning models commonly
   reject `temperature`. Sampling-param control is therefore *best-effort
   and may be a no-op*; the reliable determinism lever is **persist +
   reuse** of parses. Plan treats params as optional plumbing (fail-soft:
   omit on API rejection), and persistence as the core deliverable.

## Workstream 1 — Repeat-fold day-plan guard (the Schoenbrunn killer)

**Rule (proposed RW-CAN-001 v18 refinement):** a copy whose own observation
sits inside a **dated day-plan section** is a PLAN copy; only copies from
notes-blob / reference-list sections are reference copies. An uncommitted
repeat may demote to a City Note only when **no copy is a plan copy**. A
plan copy never folds away merely because its twin elsewhere is
uncommitted. A plan copy that itself carries a hedge/doubt marker still
demotes (RW-CLS-001 doubt markers stay authoritative). Prices/opening-hours
text on a plan copy no longer disqualifies it from being the surviving card
(that text is what poisoned `isDeliberateDayPlanMention`).

**Implementation sketch (surgical, one module):**
- New predicate `isDayPlanCopy` (day-plan section label + dated section),
  deliberately *without* the price/availability disqualifiers; hedge check
  stays separate.
- Path 1: if ≥1 plan copy and none committed → strongest plan copy keeps
  the card, others fold into it; demotion only when zero plan copies. The
  `deliberate.length === 1` exact-match becomes "pick the strongest plan
  copy" (existing winner ladder, RW-CAN-001 Arc A).
- Path 2: skip demotion when the piece's own observation labels include a
  day-plan section.
- Path 3: a plan copy never yields to a notes-blob copy;
  `notesShareSourceSection` (same-section reference listing) keeps its
  current veto.

**Non-goals / blast-radius control:** does NOT touch the idea-list unit
demotion (RW-CLS-001 Arc B) — Jan-19/Jan-21 idea dumps must still demote;
the guard applies only to the repeat-fold family. Regression fixtures that
must stay green: St. Stephen's cross-day dedup (ground truth v2), Konyv
Bar/Mazel Tov note-copy wins (7.17.2), Pinball never-committed kill
(RW-CAN-001 supersession), Vienna-leg shared-section veto (run4). New
fixtures from 7.22.4 lineage: Schoenbrunn + components + the castle,
exact live payload shapes.

## Workstream 2 — Deterministic evidence injection (no model cooperation)

**Chosen option:** intake-time line matching. At chunk-result intake (where
the observation still knows its chunk `sourceText` and
`sourceSectionLabel`), for every untimed, unbooked activity observation
whose `evidence` is null or non-verbatim (not a substring of the chunk
source after whitespace fold): line-match the title's distinctive tokens
against the chunk's own source lines — **scoped to the observation's own
source section** — and inject the matched line(s) verbatim, stamped with
provenance (`evidenceProvenance: "line_match_injected"` vs `"model"`).
Reuse the per-clause matching machinery in
`lib/extraction/source-coverage.ts` (coverage v3) rather than writing a
second matcher.

**Precision guard (this matters because of workstream 1):** a twice-listed
venue has a day-plan line and a notes-blob line, and injecting the wrong
one would stamp the wrong hedge/price signal. Inject only when the
observation's own section yields a match; if only *foreign-section* lines
match, inject nothing.

**Dark-factory outcome (RW-OPS-001):** no match → no injection → own-text
stamping falls back to prose exactly as today. Injection never creates
observations, never changes dispositions (RW-EVD-001), never retries.
Audit rider: the verbatim-compliance view reports model-provided vs
injected vs absent counts (RW-AUD-001), so the next bundle tells us
whether mini ever complies on its own.

**Rejected alternative:** validation-retry of low-evidence chunks — adds
latency and cost, adds a *new source of parse variance* (the exact product
risk this arc attacks), and contradicts the never-self-retry posture.
Falls back on the table only if injection under-delivers on a real bundle.

## Workstream 3 — Extraction pinning (CEO-queued, urgent)

Two halves with different risk profiles:

**(a) Persist + reuse parses — the real lever.** New Supabase table
(`extraction_parses` or similar): key = trip + material fingerprint
(existing content hashes) + extraction model + prompt-contract hash +
sampling params; value = the raw per-chunk parser outputs + spine +
recovery output + usage. Rebuild/re-extract paths consume a matching pinned
parse instead of re-calling the model (env-gated,
`EXTRACTION_PIN_REUSE=1`). Any prompt or model change invalidates the key
by construction — that is correct behavior, not a bug: pins protect
*rebuilds of the same trip on the same build*, they do not and cannot fix
first-parse variance across builds. SQL file in `db/`, run in Supabase
**BEFORE** deploy (standing decision), additive-only (no existing-table
alteration), safe when the code isn't deployed yet.

**(b) Sampling params — best-effort.** `OPENAI_EXTRACTION_TEMPERATURE` /
`OPENAI_EXTRACTION_SEED` env vars, DEFAULT UNSET (no behavior change at
push). Plumbed fail-soft: if the API rejects the param (400), retry once
without it and record which params the call actually used in usage
telemetry (env-surgery protocol: verification is run telemetry, never the
console). Flipping them on is a **migration** per AGENTS.md discipline #1
— it happens as its own env change after the arc's baseline run, preceded
by a single-chunk smoke test of output shape.

## Workstream 4 — Parallelization (one commit)

- `ACTIVITY_EXTRACTION_CONCURRENCY` 3 → 5.
- Geocode lookups: batch 8-wide. Keep the contract's fail-soft semantics
  exactly: any transport error still ends the lane and the draft survives
  on parser coordinates (RW-GRP-001 evidence wording) — parallelism changes
  latency only, in-flight results from the failing batch are kept, no new
  per-candidate retry policy smuggled in.
- Geocode budget raise (50 → ~150, `GEOCODE_VERIFICATION_MAX_LOOKUPS`) is
  an ENV change, not code: env-surgery protocol, one variable, decided
  after R1 telemetry shows the post-Arc-D candidate ranking's real demand.
- Rate-limit exposure is the real risk (5-wide mini chunks; 8-wide
  geocode QPS). Rollback for both is a one-line constant/env revert.

## Commit order (prefix-green at every step, one push at the end)

1. Fold guard + 7.22.4 fixtures (Schoenbrunn/castle live shapes) +
   regression fixtures + **ledger v18** (RW-CAN-001 refinement + coverage
   mapping) — the arc's P0.
2. Evidence injection + provenance + audit rider + fixtures (R2D2
   "(far away)" shape, koscom-class multi-entity lines, foreign-section
   no-inject negative control).
3. Parallelization (chunk 5-wide + geocode 8-wide), no behavior change to
   outcomes, telemetry proves widths used.
4. Pinning, ISOLATED commit (SQL file + persistence/reuse env-gated off +
   sampling-param plumbing default-unset + .env.example). Nothing in this
   commit changes a live run until envs flip.

Ops sequencing for the push (numbered, verify + undo per AGENTS.md #6):
(1) run the pinning SQL in Supabase — verify: table exists, select works;
undo: `DROP TABLE` (additive, no data yet). (2) Eli pushes; verify deploy
green. (3) NO env changes at push time — inventory current Vercel env vars
into session notes first (protocol), confirm `OPENAI_OCR_MODEL` still
unset-or-luna and extraction model is mini **from run telemetry of 7.22.4**,
not the console. (4) Fresh browser tab before the run (deploys invalidate
open tabs).

## Live-run plan, arithmetic, and run budget

**Pre-run arithmetic (required, discipline #1a):** from 7.22.4 telemetry
pull chunk count and p95 per-call latency; wall-time ≈ ceil(chunks/5) ×
p95 + spine + recovery + OCR + geocode (~150 lookups/8-wide ≈ 19 serial
slots × per-call latency) + assembly. Must fit **≤ 480s (800 × 0.6, i.e.
≥40% headroom)**. If it doesn't fit, drop the concurrency bump from the
run, not the headroom.

**Run budget: 3 live runs, hard stop after 2 uninformative failures.**
- **R1 — arc validation** (sampling params UNSET, pin reuse OFF): the only
  live variables are deterministic assembly/intake changes + concurrency.
  Ship-bar floor: castle + Schoenbrunn **survive AND group**; zero wrong
  groups; Jan-19/Jan-21 idea lists stay notes; zero identity/booking
  values in public prose; no lost Delta legs / no "Home" location-date
  corruption (Arc D twin-fold regression watch); evidence populated on
  untimed/unbooked cards in lineage with provenance counts; no which-day
  questions minted from undated repeat copies; Jan-21 day not empty.
- **R2 — pinning determinism pair** (flip pin-write + params if the smoke
  test passed; one env change, telemetry-verified): extract, then
  re-extract the same trip on the same build — pinned reuse must be
  byte-identical and near-zero-cost; if params landed, compare the pair's
  parse variance vs today's baseline (4 mini runs = 4 different parses).
- R3 reserved for one repair-and-confirm cycle.

**Blind-first audit** stays standing for R1, against the floor above plus
run8's open watch items (via-station "Train ticket 21.01" shape, junk-card
families, geocode budget exhaustion telemetry).

## Predictions (confidence / cost-if-wrong / rollback)

| Change | Confidence it helps | Cost if wrong | Rollback |
|---|---|---|---|
| Fold guard | High (root cause traced in lineage) | A true reference-only repeat ships as a card (P2-class, not P0) | Revert commit 1; fixtures pin old behavior paths |
| Evidence injection | High for coverage; Medium that stamps improve classification (hedges may genuinely be absent from source) | Wrong-line injection misclassifies a card — mitigated by own-section scoping + no-inject default | Env-less, deterministic; revert commit 2 |
| Concurrency 5 / geocode 8 | Medium-High (wall-time), Low risk to output | 429s slow the run or end the geocode lane early (draft still survives) | One-line revert / env |
| Pin persistence + reuse | High (mechanical) | Stale pin served after prompt change — prevented by prompt-hash key | Env off |
| Temperature/seed | **Low-Medium — may be API-unsupported** | Param rejected → fail-soft strip; worst case one wasted smoke call | Env unset |

## OPEN decisions for Eli (only these block coding)

1. **Ledger v18 wording** for the fold guard (narrows LOCKED RW-CAN-001's
   never-committed clause as drafted in workstream 1) — approve/edit?
2. **Pinning rides in this one push** (env-gated off, flipped after R1)
   rather than its own later push — the older "own push" note vs the new
   "ONE push, ONE run" handoff line. I recommend in-push/env-gated: one
   deploy, zero live-behavior change until you flip, and R2 measures it in
   isolation.
3. **Run budget of 3** (R1 validation + R2 determinism pair) — approved?
4. **Geocode budget → ~150** now via env after R1, or leave 50 until
   telemetry says otherwise?
