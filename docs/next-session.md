# Next Session Notes

> Chronological handoff context. Current locked product behavior lives in
> `docs/product-contracts.md`. Newer explicit user decisions and the locked
> ledger supersede older entries when they conflict.

## Current State

### 2026-07-18 — ARC B IMPLEMENTED: privacy wave + per-clause coverage + unified classifier + geocoding lane + riders (Claude/Cowork cloud session)

Read first: `docs/product-contracts.md` (ledger v16),
`docs/assembly-defect-docket-2026-07-18-run6.md` (§Arc B fix status).

- ARC B LANDED per the run6 docket order, 5 commits, prefix-green
  (suite 52 test files green + typecheck clean at every prefix):
  (1) privacy wave P0 — identity scrub fixed (phrasing evasion: colon-less
  "Customer <Name>" blocks, postal addresses, mid-segment phones; shared
  `identity-prose.ts` predicates), FR8331 transport-shadow gate (flight
  codes + shared confirmations + post-date re-run), travel-confirmation
  scrub on transport-shaped activities, ticket-page ACTIVITY family, NEW
  identity_value_in_public_prose P0 detector on UNREDACTED prose;
  (2) PB-3 per-clause coverage (v3) — recovery trigger integrity restored;
  (3) UNIFIED classifier (`lib/extraction/activity-classifier.ts`) — all
  six run6 acceptance criteria fixture-proven (idea lists, site↔component,
  own-text doubt, explicit-commitment repeat survival, "if you want",
  recovered-line classification) + resolver B1 closed;
  (4) geocoding verification lane (env-keyed GEOCODE_VERIFICATION_API_KEY,
  budgeted, fail-soft, proximity-only, usage-JSON only);
  (5) riders — provider-field repairs + P1 detector, recovery date bounds,
  St. Stephen's fold, cost-note currency gap, baths slot override,
  collision auto-suppression. Ledger v16.
- IMMEDIATE NEXT STEP: Eli pushes (locks already cleared to _to_delete),
  optionally sets GEOCODE_VERIFICATION_API_KEY in Vercel (lane is
  disabled without it — no behavior change), creates a fresh QA100 trip
  with the Czech PDF, runs ONE extraction ("7.18.4"), BLIND-FIRST audit
  (standing protocol) against the ship-bar floor: castle + Schönbrunn
  CORRECT (survive AND group), zero wrong groups, zero identity/booking
  values in public prose, idea lists stay notes, question mix sane
  (castle ticket + baths present), wave wins hold. Model A/B stays HELD
  unless 7.18.4 still shows parser-drop dominance.
- THEN: extraction pinning IMMEDIATELY after 7.18.4 validates (own push,
  Supabase SQL BEFORE deploy) → generalization round (5-10 diverse
  itineraries, answer-key-lite) → Phases 3-4.

### 2026-07-18 — 7.18.3 audited (Arc A validation): recovery lane works, privacy P0 resurfaced, classification is now THE bottleneck (same cloud session)

Read first: `docs/product-contracts.md` (ledger v15),
`docs/assembly-defect-docket-2026-07-18-run6.md` (the 7.18.3 audit — blind
audit + Eli's blind pass reconciled, audit-gap entries, Arc B order).

- Live run 7.18.3 (trip `3cf92459-edf5-4a7c-a285-246d286b62cc`, ran on
  290df39; bundle `run-7.18.3-qa-bundle.json` sha256 `ffc0d28c…9bb9`, in
  Eli's Downloads — move to repo root, gitignored). BLIND-FIRST audit
  protocol (keep it): Claude audited cold, Eli's blind list diffed after —
  Eli caught the P0 privacy leak, corrupted provider FIELDS, and the full
  Jan-21 idea-list promotion; each miss is an RW-AUD-001 audit-gap entry in
  the run6 docket.
- HEADLINES: RW-EVD-001 recovery lane WORKED end-to-end first live firing
  (60 lines batched, 53 recovered, separate usage, fail-soft) and coverage
  noise fell 121→9 — but per-line cross-stage matching MASKED koscom and
  Szechenyi (multi-entity lines; PB-3, must fix before 7.18.4). P0 PRIVACY
  RESURFACED: rental-car card ships name+home address+phone in prose (the
  7.17.2 defect back — scrub did not fire), Ryanair FR8331 duplicate
  activity carries its confirmation code, Skip-the-Line ticket-page
  activity carries a ticket number; NO audit detector covers identity-
  shaped values in prose (gap). Schönbrunn died via a NEW chain
  (site↔component fusion + title-containment after title drift — the
  heading-fragment kill itself is dead ✓). Castle hedge-demoted on
  ABSORBED sibling text. Jan 21 idea list promoted to 8 cards (A-6
  verbatim). Providers corrupted in the provider FIELD ("PM Delta",
  "Home Delta", "Za Wizz Air", "D 143"). 0 wrong groups (run5 calibration
  held) but 0 groups at all. 3 questions, 0 bogus dates (Phase 2 held).
  5 stays / 8 transport / 0 false P0 (4th run) / counts unified (84+8=92).
- CEO decisions (Eli, this session): privacy P0 fixes ship INSIDE the Arc
  B push, FIRST in commit order (no separate hotfix run); stronger-model
  chunk A/B HELD unless 7.18.4 still shows parser-drop dominance;
  blind-first audit protocol is standing; train-code sighting declassified
  (protected fields on their designed maker transport surface, not a
  leak). Extraction pinning moves to IMMEDIATELY after 7.18.4 validates —
  parser variance is a first-order drag (koscom dropped 5 straight runs, a
  materially different parse per run).
- IMMEDIATE NEXT STEP — ARC B SESSION (fresh session, one push, one
  extraction "7.18.4"), commit order per the run6 docket §Arc B order:
  (1) privacy wave (P0): identity-scrub trace+fix, travel-confirmation
  scrub + FR8331 shadow suppression, ticket-page ACTIVITY family, NEW
  identity-leak P0 detector, unredacted-prose audit procedure;
  (2) PB-3 per-clause coverage matching (recovery trigger integrity);
  (3) unified classifier (CEO-approved centerpiece) — acceptance
  criteria: Jan-21/A-6 idea list demoted, site↔component never merges,
  doubt demotion on OWN text only, explicit-commitment-only repeat
  survival (kills Pinball per RW-CAN-001 supersession), "if you want"
  hedges, recovered-line classification; (4) geocoding verification lane
  (standing decision); (5) riders: provider-field repairs, recovery date
  bounds, St. Stephen's cross-day fold, cost-note demotion, baths slot
  override, collision auto-suppression. Fixtures from 7.18.3 lineage
  shapes in the same commits. 7.18.4 validation floor (Eli's ship bar):
  castle + Schönbrunn CORRECT (survive AND group), zero wrong groups,
  zero identity/booking values in public prose, idea lists stay notes,
  question mix sane, wave wins hold. Then: extraction pinning (own push,
  Supabase SQL BEFORE deploy) → generalization round (5-10 diverse
  itineraries, answer-key-lite) → Phases 3-4.

### 2026-07-18 — ARC A IMPLEMENTED: recovery call + Phase 1 predicates/winner ladder + geo calibration + cron hardening (Claude/Cowork cloud session)

Read first: `docs/product-contracts.md` (ledger v15),
`docs/assembly-defect-docket-2026-07-18-run5.md` (Arc A fix status appended),
`docs/code-audit-2026-07-18.md` (§E: Phases 0+1+2 now done + the RW-EVD-001
recovery call).

- ARC A LANDED, per the split plan below (4 commits, prefix-green order):
  (1) Phase 1 shared predicates — one comparable fold + tokenizer in
  `traveler-text.ts` (parser-artifact/source-coverage/extraction-qa/
  boundary-policy forks retired), one day-heading detector (chunking's
  byte-duplicate retired, bullet prefixes stripped), shared date parser
  (slash day-first "16/1/2026" + 2-digit years), shared time parser
  (dot-times "14.30"), ONE price detector (£ + Ft + Kc gaps closed), and
  the ONE sameEntity/winner module `lib/extraction/entity-winner.ts`:
  eligibility (overview/day-arc/heading-fragment cards can NEVER win a
  merge) > or-copy > booking > named-venue tokens > commitment >
  specificity > length — wired into all six collapse rules. Heading-
  fragment demotion at the parser-artifact layer (card's OWN heading, works
  cross-day; "Prague Castle"/"Tour Rome" survive). Run5 geo calibration:
  ≥3-decimal coordinate precision for radius rules (prompt demands it too),
  passing-mention containers banned, timed geo-children require the
  container's category (locked guard-changing child preserved — this is the
  reconciliation of the docket's "timed stops never join" with RW-GRP-001's
  timed-child rule; flag if you want it stricter), walk areas must be
  source-supported per piece, geo/area in bundle lineage. Audit detectors
  import pipeline predicates (B4). Researched-list excludes "X at Site".
  Slot-collision retitle considers only actually-merged copies (A2-lite).
  (2) RW-EVD-001 bounded recovery call `lib/extraction/source-recovery.ts`
  off the (now-calibrated, v2) coverage diagnostic: one excerpt-only
  batched call per build, hard caps (OPENAI_RECOVERY_* env vars, in
  .env.example), model env-overridable, never self-retries, separate
  usage.sourceRecovery, recovered observations enter as a normal late stage
  and are source-truth verified against the excerpt batch, residual drops
  stay P2-flagged, failure = draft survives + ONE sourceRecovery Question.
  Coverage v2: page-marker/boilerplate excluded, cross-stage union matching
  (kills the 121/393 noise), full uncovered list + recovery telemetry in
  the QA bundle.
  (3) Cron hardening: timing-safe CRON_SECRET digest compare +
  cron_cleanup_unauthorized_attempt logging.
  NEW tests: `entity-winner.test.ts`, `assembly-ground-truth-run5.test.ts`,
  `source-recovery.test.ts`, plus coverage/cron/prompt fixture updates.
  Suite at final state: 49 test files green, typecheck clean, build clean.
  Ledger v15 (RW-CAN/GRP/CLS/EVD/AUD/OPS-001 evidence updated).
- IMMEDIATE NEXT STEP: Eli pushes (clear `.git/*.lock` first), creates a
  fresh QA100 trip with the Czech PDF, runs ONE extraction ("7.18.3"),
  Claude audits. ARC A VALIDATION TARGETS: koscom/Szechenyi recovered by
  the recovery call (usage.sourceRecovery.outcome "recovered") or precisely
  flagged (residual P2 with excerpts); Schönbrunn survives AND groups; zero
  wrong groups (no Gresham-style container, no timed grab, no wrong-area
  walk members); question count sane (no component leak, no bogus date
  questions — Phase 2 gate holds); wave-1/2 wins hold (5 stays, 0
  credential leaks, 0 false P0, counts consistent).
- THEN ARC B (next session after 7.18.3 validates): unified
  activity-vs-city-note classifier (A-6 acceptance) + geocoding
  verification lane (env-keyed, budgeted, fail-soft, proximity-only, no new
  DB tables in v1) → "7.18.4" → generalization round → Phases 3-4 +
  extraction pinning (Supabase SQL before deploy). Carried-forward small
  items: PB-1 Rome-note stay-fragment scrub, PB-6 baths slot override, PB-7
  collision auto-suppression (5th run), Old Town Square absorption, Pinball
  duplicate, car pickup/return alias dedupe.

### 2026-07-18 — Handoff for the NEXT ARC: recovery call + Phase 1 + geocoding (fresh session)

Read first: `docs/product-contracts.md` (ledger v14),
`docs/code-audit-2026-07-18.md` (audit + phased plan; Phases 0+2 are DONE),
`docs/assembly-defect-docket-2026-07-18-run5.md` (7.18.2 defects still open).

CEO decisions recorded this session (Eli, end of session):
- GEOCODING LANE: build NOW, in this arc — stop waiting on model-emitted
  coordinates (4 runs of failure). Real geocoding lookup behind an env key,
  hard per-trip budget, fail-soft, results attached as VERIFIED coords with
  provenance, used ONLY to verify grouping proximity (RW-EVD-001: lookups
  never change intent/date/city). V1: no new DB table — results ride in the
  run's usage JSON (no Supabase SQL, no deploy sequencing trap); durable
  caching is a later additive migration alongside pinning.
- NO BESPOKE BACKSTOPS (A-6): rejected the shape-based demotion backstop as
  un-scalable. The fix is Phase 1's UNIFIED classifier: ONE
  activity-vs-city-note / commitment module (source structure + list shape
  + commitment language, never venue knowledge) that the parser-output
  layer, demotion rules, and audit detectors all import — replacing the 4
  divergent implementations the audit found (B1/B4/1.5). A-6 (gypsy music /
  Konyv Bar / Children's train promotions) is an ACCEPTANCE CRITERION of
  that module, not a special case.
- Ship-bar grouping floor: source-authored groups (castle, Schönbrunn) must
  be correct with honest calls and NOTHING may group wrongly; the Lesser
  Town discovered walk forms when verified coordinates support it (which
  the geocoding lane should now make reliable).
- Generalization round (the queued 5-10 diverse itineraries + friends'
  docs, answer-key-lite) is scheduled RIGHT AFTER this arc's validation
  run — it is the unified classifier's real exam, not the Czech PDF.

THE WORK IS SPLIT INTO TWO ARCS (CEO decision: proactive split to protect
session quality; restores the one-push-one-extraction cadence). Each arc is
one session, one push, ONE fresh extraction, audited before the next starts.

ARC A — "stop the bleeding at the source" (next session):
1. RW-EVD-001 bounded recovery call: coverage diagnostic's uncovered
   day-section lines -> ONE excerpt-only batched re-ask (hard input/output
   caps, separate usage recording, never retries itself, one per build);
   recovered observations enter assembly as a normal late stage; on failure
   the draft survives and at most one precise maker question per RW-EVD-001.
   Model = extraction model, env-overridable (OPENAI_RECOVERY_MODEL).
2. Phase 1 shared predicates (audit §E): one text-normalization module, one
   day-heading detector, one date/time/price set, ONE sameEntity/winner
   module (booking > named-venue tokens > commitment > specificity >
   length; overview/day-arc/heading-fragment cards INELIGIBLE to win any
   merge — the Schönbrunn killer), audit detectors import pipeline
   predicates. Includes run5 geo calibration: real-site containers only
   (no "quick look" cards), timed stops never join, walk members must match
   the area label, model coords below precision are ineligible for the
   300 m rule.
3. Cron hardening: timing-safe CRON_SECRET compare + log rejected attempts.
Then Eli pushes, fresh extraction "7.18.3", audit. Arc A validation
targets: koscom/Szechenyi recovered (or precisely flagged) by the recovery
call; Schönbrunn survives and groups; zero wrong groups; question count
sane; wave-1/2 wins hold.

ARC B — "make classification scale" (session after 7.18.3 validates):
4. Unified activity-vs-city-note classifier (CEO decision above) replacing
   the 4 divergent implementations; A-6 promotions are its acceptance
   criterion; fixtures BOTH directions drawn from all four QA bundles.
5. Geocoding verification lane (CEO decision above; env-keyed, budgeted,
   fail-soft, grouping-proximity only, no new DB tables in v1).
Then push, fresh extraction "7.18.4", audit against Eli's ship-bar floor
(castle + Schönbrunn correct, nothing groups wrongly, Lesser Town walk when
verified coords support it). After Arc B validates: the generalization
round (5-10 diverse itineraries, answer-key-lite), then Phases 3-4 +
extraction pinning (Supabase SQL before deploy).

Status of this session's work: Phases 0+2 committed (b0818af, ad01d85,
131d774) and PUSHED by Eli; CRON_SECRET configured in Vercel Production and
redeployed — the nightly cleanup cron is live pending its first 3 AM run
(check function logs for unpaid_starter_material_cleanup_completed).
Suite at HEAD: 46 test files green, typecheck + build clean.
Open small items carried forward: coverage-diagnostic calibration (cross-
stage corpus, boilerplate/page-marker exclusion, full uncovered list in the
QA bundle, geo fields in bundle lineage), Rome-note stay-fragment scrub
(run5 PB-1), baths day-title slot override (PB-6), collision
auto-suppression (PB-7 — 4 runs), Old Town Square absorption, Pinball
duplicate. These fold into Phase 1 or ride with Phase 3.

### 2026-07-18 — Remediation Phases 0+2 implemented (same session)

Read first: `docs/product-contracts.md` (ledger v14),
`docs/code-audit-2026-07-18.md` (the audit these phases execute).

- PHASE 0 LANDED: deleted verified-dead code — lib/trip-schema.ts (+ the
  `zod` dependency), `@stripe/stripe-js` dependency,
  components/structured-review-panel.tsx, lib/supabase/client.ts, and ~18
  dead symbols across lib/ (audit §D list); fixed the never-matching
  commitment-pattern contractions (audit B1) with fixtures; removed the
  dead branches inside live rules (identical ternary arms, no-op guard,
  dead alternative_slot read); wired cleanupAbandonedUnpaidStarterMaterials
  to a Vercel Cron route (app/api/cron/cleanup-unpaid-materials, GET,
  Bearer CRON_SECRET, named RW-OPS-001 outcomes, vercel.json schedule
  0 3 * * * daily) — Eli must add CRON_SECRET in Vercel before it runs;
  added OPENAI_OCR_IMAGE_DETAIL + CRON_SECRET to .env.example.
- PHASE 2 LANDED (the question gate, audit §C): subject resolution now runs
  BEFORE the reconciliation filters; new final gate on FINAL subjects and
  values (guess-equals-state kill, firm-value kill, represented-chain
  reconciliation, stale-call drop with source-update exemption); wave-1
  transport reconciliation learned `date` (guess-aware — genuine
  disagreements still ship, fixture-guarded); ticket consolidation
  container preference implemented + undated same-venue roots fold into
  dated containers (kills the 7.18.2 double castle question); date-target
  questions always render date controls. NEW
  `tests/question-reconciliation-gate.test.ts` (5 checks from 7.18.2
  shapes). Suite: 46 test files green; typecheck + build clean.
- NEXT: recovery call (RW-EVD-001 bounded excerpt-only re-ask, approved to
  follow Phase 2) → Phase 1 (shared predicates + sameEntity/winner ladder;
  enforces Eli's system-grouped ship-bar floor + run5 geo calibration) →
  fresh extraction → Phases 3-4 (+ extraction pinning, Supabase SQL first).
  Eli pushes; no DB changes in Phases 0+2.

### 2026-07-18 — CEO decisions on the remediation plan (same session)

- Phase order 0 → 2 → 1 → fresh extraction → 3 → 4 APPROVED (Eli: "aligned").
- Ship bar (Eli): "I'll know it when I see it" — but the floor is: stop the
  bleeding (P0 classes stay dead), CORRECT system-grouped activities, and
  all fundamentals right (stays/transport/counts/questions sane). The full
  answer key remains the internal QA target, not the release gate.
- Bounded RW-EVD-001 recovery call: build RIGHT AFTER PHASE 2 (approved).
  Stronger-model A/B only if recovery underperforms.
- QA cost: not a concern — keep paying per validation run; dev re-extract
  lane stays backlog (not pulled forward).
- cleanupAbandonedUnpaidStarterMaterials: WIRE IT on a schedule (approved)
  — needs a cron-invoked route + Vercel cron config; include in Phase 0/1
  work with its own route-level coverage per RW-OPS-001.

### 2026-07-18 — Full codebase audit (same session, after the 7.18.2 audit)

Read first: `docs/code-audit-2026-07-18.md` (rule-conflict, question-
lifecycle, cross-module, and dead-code audit; four parallel passes, key
claims re-verified in source).

- Headline verified findings: commitment pattern contraction branches have
  NEVER matched (tested against apostrophe-stripped text); the castle
  question-consolidation container preference is a dead ternary
  (`rootIsContainer ? rootId : rootId`); merge-winner scoring is title
  LENGTH + or-marker, letting day-arc cards beat named venues (the
  Schönbrunn killer); question filters run before question subjects are
  final (the date-question escape, structural); six duplicate rules with
  six similarity definitions; 13 stopword sets, 5 day-heading detectors,
  4 date parsers; audit detectors re-implement pipeline predicates with
  diverged vocabularies; stay-content routing has a three-layer gap (the
  Rome-note mechanism); dead: lib/trip-schema.ts (+zod), @stripe/stripe-js,
  structured-review-panel.tsx, supabase/client.ts, ~15 symbols; unwired:
  cleanupAbandonedUnpaidStarterMaterials has no caller.
- Remediation phases proposed (see report §E): 0 prune + dead-branch fixes,
  1 shared predicates + one sameEntity/winner module, 2 single final
  question-reconciliation gate, 3 ordering/claims/stable ids, 4 stage split
  of evidence-clustering + interaction test suite + extraction pinning.
  Wave-2.1 docket items fold into Phases 0-2.
- IMMEDIATE NEXT STEP: Eli approves the phase order, then implementation
  starts at Phase 0+2 (biggest defect-per-effort), fixtures in the same
  commits, one fresh extraction after Phases 0-2 land.

### 2026-07-18 — 7.18.2 audit (wave-2 validation run; same session as wave 2)

Read first: `docs/product-contracts.md` (ledger v13),
`docs/assembly-defect-docket-2026-07-18-run5.md` (7.18.2 audit + wave-2.1
fix list).

- Live run 7.18.2 (trip `51d3bc5f-db85-4b03-8441-9faa26da5a9d`, first
  wave-2 build run; bundle saved as `run-7.18.2-qa-bundle.json`, sha256
  `63a17212…f3d8`, currently in Eli's Downloads — move to repo root,
  gitignored). Wave-2 WINS: geo fields EMITTED for the first time (both
  grouping rules fired), no provider bleed, transport ticket re-emissions
  silently absorbed, disjunction singletons, Tour Rome recovered, 0 false
  P0, 0 credential leaks, 5 stays clean, coverage diagnostic fired as
  designed (121/393 lines, noisy).
- Still no-ship. NEW defect mix (see run5 docket): 2 parser-minted
  FALSE-CONFLICT date questions (both cited dates AGREE; guessedValue equals
  final state — reconciliation gap), Schönbrunn destroyed by the
  near-identical collapse letting the "Explore Vienna" heading-fragment card
  win over the named venue (all 4 Schönbrunn pieces suppressed → components
  leaked into a bogus researched-list question), geo grouping membership
  broken now that coords exist (a "Quick look inside Gresham Palace" card
  owns half of central Pest incl. a timed bridge; 2-decimal coords ≈ 1.1 km
  quantization defeats the 300 m rule), castle question duplicated, baths
  question missing (doubt demotion starves the day-title slot rule), stay
  check-in fragment (#743, 45.75 EUR) fused into the Rome shopping note,
  collision auto-suppression still absent (4th run), cost cards multiplied,
  koscom + Szechenyi Baths dropped by the parser AGAIN (4th run — the
  line-coverage prompt did not fix drops; the diagnostic caught the class,
  strengthening the case for the RW-EVD-001 bounded recovery call and/or a
  chunk-stage model A/B).
- IMMEDIATE NEXT STEP: WAVE 2.1 per the run5 docket order (question
  hygiene, collapse winner rule + heading fragments, geo calibration,
  castle consolidation, note-scrub/slot-override/auto-suppression, cost
  demotion + coverage calibration), fixtures in the same commits, Eli
  pushes, one fresh extraction. Then extraction pinning (Supabase SQL
  before deploy).

### 2026-07-18 — WAVE 2 parser pass (Claude/Cowork session, fresh session)

Read first: `docs/product-contracts.md` (ledger v13),
`docs/assembly-defect-docket-2026-07-18-run4.md` (wave-2 fix status at the
bottom).

- WAVE 2 IMPLEMENTED per the 2026-07-17 plan (44 test files green incl. NEW
  `tests/parser-artifact-normalization.test.ts` + `tests/source-coverage.test.ts`;
  typecheck + build clean; ledger v13). Two layers:
  (1) parser prompt hardening — geo coordinates demanded for every named
  landmark card (system prompt + per-chunk reminder), line-coverage rule
  naming the dropped shapes (koscom, "maybe communism museum", Tour Rome,
  Szechenyi/Gellert options), day-title / reference-list / ticket-page /
  disjunction / cost-line / time-field / provider rules;
  (2) NEW deterministic layers — `lib/extraction/parser-artifact-normalization.ts`
  runs before clustering and silently repairs the observed artifact families
  (degenerate/opening-hours times, provider text-bleed + source-unsupported
  carrier scrub incl. "Delta flight FR8331", day-title cards with a guard so
  bare "Prague Castle" under a multi-part heading survives, cost-line cards,
  split "X or Y" disjunctions when no or-copy exists, ticket-page
  re-emissions -> accessory), all repairs recorded in usage
  (`parserArtifactRepairs`) and counted in the audit canonicalization
  summary; `lib/extraction/source-coverage.ts` proves which meaningful
  day-section lines produced zero output and raises quiet P2
  `day_section_source_line_unextracted` with bounded excerpts (counts in the
  audit extraction summary + QA bundle; candidate finding only, never a
  mutation/Question). The RW-EVD-001 bounded recovery call is NOT built yet —
  the coverage diagnostic is its deterministic trigger evidence.
- Prompt-only fixes (geo emission, reference-list, section classification)
  are only verifiable on a fresh extraction; the deterministic layers are
  fixture-proven against the live 7.18.0/7.18.1 shapes either way.
- IMMEDIATE NEXT STEP: Eli pushes (terminal block below), creates a fresh
  QA100 trip with the Czech PDF, runs ONE extraction ("7.18.2"), Claude
  audits against ground truth v2 + Δ2. WAVE-2 targets on that run: geo
  fields present for named sights (unblocks the Lesser Town walk rule), no
  day-title cards, no cost cards, one card per "X or Y" slot, no re-dated
  ticket cards, no "Delta" on FR8331, degenerate times gone, koscom /
  "maybe communism museum" / Tour Rome / Szechenyi Baths present OR flagged
  by the new coverage P2 (the diagnostic makes any remaining drop visible
  instead of silent). Wave-1/1.1 targets must hold (5 stays, 0 credential
  leaks, 0 false P0, count definition, Vienna leg intact).
- THEN: extraction pinning by material content hash — own push, Eli runs the
  additive Supabase SQL BEFORE deploy (unchanged plan). Also still open:
  A-6 recommendation-promotion backstop (needs Eli's call), RW-EVD-001
  recovery-call lane, diagnostics->review-surface plumbing, audit redactor.
- Push block (from the repo root; clear stranded git locks first):

```bash
rm -f "/Users/eli/Claude - Roamwoven/.git/"*.lock
# then push the three commits (already ordered so each prefix is green)
# via GitHub Desktop, or:
git -C "/Users/eli/Claude - Roamwoven" push
```

### 2026-07-18 — 7.18.1 audit + wave-1.1 precision pass (Claude/Cowork session, same session as wave 1)

Read first: `docs/product-contracts.md` (ledger v12),
`docs/assembly-defect-docket-2026-07-18-run4.md` (7.18.1 audit + wave-1.1
fix status).

- Live run 7.18.1 (trip `5fc3223b-f31f-4d85-b287-e80dbb388f9a`, first
  wave-1 build run) VALIDATED every wave-1 target: 5 stays (Prague Jan
  14–18, clean name), zero credentials/booking codes in public prose (live
  DOM checked), zero false P0s (budget anchor never minted; coverage P2
  correctly flags unanchored FR8331), transport question leaks gone, baths
  options folded into one card, Schönbrunn 5/5 with honest call, 77 Plans =
  69 cards + 8 travel consistent, hard warnings 3→1. Bundle saved locally
  as `run-7.18.1-qa-bundle.json` (gitignored, sha256-verified).
- Still no-ship: parser variance now dominates (third materially different
  parse of the same PDF on the same model) — dropped the Jan 20 Vienna list
  into a reference blob, dropped Watches in Rome / Tour Rome / Rome note /
  koscom / Szechenyi Baths / 2 of 3 trio venues, emitted day-title cards
  ("We Explore Budapest"), exploded a lunch choice into 4 cards + question,
  minted a $72 cost card, killed Prague Castle via a bled 12:00 slot
  collision, mislabeled Ryanair as "Delta flight FR8331".
- WAVE 1.1 IMPLEMENTED same session (42 test files green incl. NEW
  `tests/assembly-ground-truth-run4.test.ts`, 6 checks from 7.18.1 shapes;
  typecheck + build clean; ledger v12): day-plan-scoped note-copy veto
  (un-guts the Vienna leg), site-vs-event slot-collision guard (restores
  Prague Castle the card; the castle GROUP still needs wave-2 geo/shapes),
  component-list-shaped source-listing membership + "A to B" = route (kills
  the Fisherman's Bastion overgroup), alternative-slot collapse (one lunch
  card, choice in description, "which was chosen" question suppressed) with
  the or-carrying copy always winning merges, day-slot alias dedupe (no
  venue question under two distinct venues — Gellert), note-content
  promotion questions suppressed (beer spots), title-gate vocabulary
  (tour/spend/land — "Drop bags and tour Rome" folds), audit structured
  count joined RW-CNT-001.
- IMMEDIATE NEXT STEP: Eli pushes wave 1.1 (terminal block provided), then
  WAVE 2 parser pass in a FRESH session per the 2026-07-17 entry below
  (geo fields, section classification, no day-title cards, disjunction
  singletons, no cost cards, provider/title bleed, keep dropped lines,
  source-coverage diagnostic), then extraction pinning (Supabase SQL before
  deploy). Wave 1.1 needs no dedicated extraction — the wave-2 run
  validates both.

### 2026-07-17 night — wave-1 fix pass for the 7.18.0 audit (Claude/Cowork session)

Read first: `docs/product-contracts.md` (ledger v11: RW-CNT-001 added;
RW-PRI/ASM/TRV/CLS/QUE/AUD/GRP-001 evidence updated),
`docs/assembly-defect-docket-2026-07-17-run3.md` (7.18.0 audit + cross-audit
addendum + wave-1 fix status).

- Live run 7.18.0 (trip `e0b06255-ea20-42fa-b3bf-106681db3d49`, ran on
  a4c4fa2, extraction model gpt-5.4-mini) audited from the QA bundle + live
  pages; raw JSON saved locally as `run-7.18.0-qa-bundle.json` (gitignored,
  byte-exact sha256-verified). Headlines: 3 Prague stays (one public, minted
  from a Costs line), stay Wi-Fi password + door code + address cleartext in
  a public "Check in to AirBNB" card, two mis-dated ticket re-emissions
  carrying train booking codes on Jan 24, Albertina destroyed by the
  check-in router, Jan 20 St. Stephen's killed by note-copy precedence
  inversion, false transport P0 from a Costs-section anchor with a
  fabricated date (third consecutive false-P0 class), all 3 groups
  defective (castle+Lesser Town mega-container, fabricated "300 m" Royal
  Palace claim with zero coords in the payload, Schoenbrunn 2/5), 6
  questions (3 legit + castle/KGB misfire + 2 parser chunk leaks whose
  answers sat in final rows), note-collection content loss, counters
  65/67/72 across surfaces. Verified against lineage/source-anchor evidence;
  koscom + "maybe communism museum" provably in source text but never
  emitted (parser miss, same model as 7.17.2 which parsed them); Szechenyi
  Baths never observed in EITHER run; Ryanair FR8331 has no source anchor.
- CEO decisions this session (Eli): fixes ship in TWO waves (wave 1
  assembly-only, wave 2 parser), one fresh paid extraction after each; one
  count definition — travel cards are a subset of activity cards, Plans =
  top-level activity-umbrella cards incl. admin + travel, Transport is a
  drill-down subset (RW-CNT-001); pending planned-or-ideas candidates hold
  as city ideas and promote on answer, slot-committed questions keep ONE
  flexible card with options folded into its description; duplicate-fold
  suppressions are silent but each cross-date ticket fold gets one
  statement-style call; hard warnings render on the review page too;
  extraction pinning stays OUT of wave 1 (own push, Eli runs the Supabase
  SQL first); Lennon Wall / KGB / Kafka are discrete, never castle children.
- WAVE 1 IMPLEMENTED in this session (workspace copy: 41 test files green,
  typecheck clean, build clean — includes NEW
  `tests/assembly-ground-truth-run3.test.ts`, 16 checks mirroring the live
  7.18.0 shapes): output-boundary protected-value scrub; date-agnostic
  ticket-copy transport shadows + fold calls; stay identity venue+leg with
  leg-boundary checkout reconciliation + costs-fragment absorption;
  check-in router title gate (Albertina) + credential override + alias
  stopwords (Vitae); planned-day-plan-beats-note-copy (St. Stephen's);
  Costs excluded from anchor minting, no fabricated anchor dates, weak
  anchors capped at P2, anchor-coverage notice; source-obvious transport
  question reconciliation; researched-list hold-as-ideas + memberSnapshots
  + end-to-end promote handler in the decisions layer; day-slot option
  folding; same-site grouping verification (multi-site container rejection,
  geo-or-source-listing membership, honest claims); note-collection
  integrity restore + abbreviation-safe segmentation + cross-city tips
  guard; one count definition everywhere + review-page hard warnings.
- Fixture-caught regression worth remembering: demoting researched-list
  members while their question pointed at a member's canonical id violated
  the identity manifest at finalization — question subject is now the trip,
  members ride as typed snapshots.
- IMMEDIATE NEXT STEP: Eli commits/pushes via the provided terminal block
  (per-family commits, already ordered so each prefix is green), creates a
  fresh QA100 trip with the Czech PDF, runs extraction, Claude audits
  against the key + Δ2. WAVE-1 targets: 5 stays (Prague Jan 14–18, clean
  name), 0 credential/booking strings in any card prose, 0 false P0, 3
  questions (trio held as ideas; baths ONE card + question; castle ticket),
  collisions auto-folded with 2 calls, Plans = top-level cards + travel
  everywhere, hard warnings visible on /data. Expect Jan 16 to UNGROUP
  (castle mega-container rejected; Lesser Town walk still blocked on geo) —
  honest regression until wave 2.
- WAVE 2 (parser, next session after wave-1 run validates): emit
  approxLatitude/approxLongitude/area (confirmed absent — blocks the walk
  rule), stop re-emitting ticket pages as new-dated activities, keep
  koscom/'maybe' mentions/Tour Rome/Szechenyi Baths, one card for "X or Y"
  disjunctions, provider text-bleed ("PM Delta"), degenerate time pairs
  (Borkonyha 20:00–20:00, opening-hours endTimes), plus a source-coverage
  diagnostic (day-section lines with zero observations). Then extraction
  pinning (Supabase SQL before deploy).

### 2026-07-17 evening — 7.17.2 audit + full defect pass (Claude/Cowork session)

Read first: `docs/product-contracts.md` (updated: RW-PRI-001 scope narrowed,
RW-QUE-001 castle fold + day-slot rule, RW-CLS-001 commitment/sections,
RW-EVD-001 structural placement, RW-GRP-001 hierarchy membership, RW-ASM-001
shadow guard, RW-AUD-001 anchor validity),
`docs/assembly-defect-docket-2026-07-17-run2.md` (7.17.2 audit — includes
Eli's recorded decisions and per-fix status), and the Δ2 amendments in
`docs/assembly-ground-truth-central-europe.md`.

- Live run 7.17.2 (trip `629d9b33-9f9e-4280-8a5c-90cacf684dc6`, ran on
  86ea837) audited from the QA bundle + live summary page; raw JSON saved
  locally as `run-7.17.2-qa-bundle.json` (gitignored). Scorecard: 82 activity
  cards (target ~49), 1 group (Schönbrunn, 3/5 stops), 5 questions (2 legit +
  3 fabricated date questions), transport/stays/times all correct. Root
  causes found IN CODE and fixed same-day, each with a ground-truth fixture:
  castle killed by "castle" being a `SOURCE_SUPPORT_STOPWORDS` entry (bare
  stay-shadow reduced "Prague Castle" to "prague" ⊂ "Prague Airbnb");
  Kutná Hora items stranded undated by parser "unknown" section typing and
  placed by leg-guess; commitment pattern counted bare "visit" as intent;
  the July-3 one-note-per-city rule mashed city notes and let a budget line
  through; the ÖBB ticket's German marketing text minted a false
  missing-transport P0 anchor (`…-bitte-…`); the rental-car card carried
  Eli's name/home address/email/phone in cleartext (audit redactor caught
  only some of it — the LIVE summary page is the stronger privacy surface
  to check in audits).
- IMPORTANT audit correction: the "parser emits no geo fields" finding from
  the bundle was an audit artifact — `summarizeActivity` allowlisted them
  away. Audit views now expose approxLatitude/approxLongitude/area; whether
  the live parser actually emitted coords for the Lesser Town sights is
  unknown until 7.17.3.
- This session's changes (workspace copy tested: 40 test files green,
  typecheck clean, build clean): evidence-clustering fixes above, NEW
  `lib/extraction/canonical-placement-policy.ts` (extracted placement stage
  + `tests/canonical-placement-policy.test.ts`), anchor validity in
  `source-transport-anchors.ts`, reconcile-before-P0 in
  `trip-extraction-audit-diagnostics.ts`, geo fields in audit
  snapshot/lineage/types, qa-bundle count split (top-level vs grouped-stop
  vs placeholder), summary Days counter excludes "Needs placement", parser
  prompt hardening (day-section membership, access-instruction attachment,
  same-site component listing, arrival-day recommendation rule), city-note
  sections + Costs scrub, card/note reconciliation, ticket-question
  consolidation (castle/St. Vitus fold), day-title slot question (baths),
  meal-prefix aliasing, Chain Bridge containment, place-fragment
  absorption, drop-bags arrival-time fold, PII/echo scrub.
  14 new ground-truth checks added to
  `tests/fixtures/central-europe-ground-truth.ts` — fixture now mirrors the
  LIVE 7.17.2 parser shapes (undated Kutná Hora lines, bare castle +
  separate components, Budapest promotions, access-instruction cards).
- IMMEDIATE NEXT STEP: Eli pushes (clear `.git/*.lock` first), then fresh
  extraction 7.17.3 on a new QA100 trip, audit against the answer key +
  Δ2 amendments. Expect: ~49-55 activity cards, 3 groups (castle visit,
  Schönbrunn 5 stops, Lesser Town walk IF parser emits area/coords — now
  observable in the audit), exactly 3 questions (castle ticket incl. St.
  Vitus, Vienna trio, baths), 0 date questions, sectioned city notes with
  no budget line, no PII in any card description, no false transport P0.
- Deferred (backlog): diagnostics→review-surface plumbing, audit redactor
  fixes, remaining counter unification, summary-page UX (collapsed
  sections, "Mark checked" semantics), leg-scoped privacy-label
  presentation, shadow-suppression stage extraction, extraction pinning DB
  migration (unchanged from previous entry).

### 2026-07-17 Assembly ground truth + live-run defect fixes (Claude/Cowork session)

Read first: `docs/product-contracts.md` (ledger v10),
`docs/assembly-defect-docket-2026-07-17.md`,
`docs/assembly-ground-truth-central-europe.md` (approved answer key v2).

- Commits this session (all pushed): `b53c135` ground truth v2 + commitment
  rule + first geo grouping; `147789b` defect docket; `86ea837` source-truth
  verification + docket fixes 1-7. Suite 39 files green, typecheck clean.
- Live QA runs: 7.17.0 (`c7b6ab75-...`, ran on PRE-b53c135 build — ignore),
  7.17.1 (`b480e3f7-1fbe-482f-8eeb-77a5125b394f`, ran on b53c135, fully
  audited — every defect is in the docket). Raw audit JSONs live locally as
  `run-7.17.1-{payload,qa-bundle}.json` (gitignored, real trip data).
- IMMEDIATE NEXT STEP: fresh extraction "7.17.2" on a new paid trip (QA100
  promo) with the Czech PDF, then audit the QA bundle
  (`/maker/trips/<id>/data/audit/qa-bundle`, browser access works) against
  the answer key. Scorecard to beat from 7.17.1: 98 activity cards (expect a
  big drop), 8 groups (expect ~3: Prague Castle visit, Schönbrunn visit,
  Lesser Town walk), 5 questions (expect ~3: castle ticket, Vienna trio
  planned-or-ideas, baths), 0 flight/stay shadow duplicates, Delta 5925 =
  17:00->18:41, no Colosseum/barcode text in Prague notes, calls stating the
  actual rule that fired. Note: coordinates/area hints only exist on fresh
  extractions (new parser schema fields approxLatitude/approxLongitude/area).
- Key rules shipped (tests in tests/evidence-clustering.test.ts,
  tests/source-transport-anchors.test.ts, tests/assembly-ground-truth.test.ts):
  commitment rule of evidence, slot-collision collapse, title-containment
  aliases, shadow suppression, source-support suppression + code scrub,
  grouping doctrine v3 (same-site ~300 m / walk ~1.8 km + crowded >6 +
  unsequenced <3 timed + source-named + one walk/day), cross-city note
  reroute, ticket-question consolidation, anchor semantic fallback +
  time-disagreement tripwire.
- CEO decisions recorded: merge-bias (prefer rare silent fusions over
  duplicates; keep lineage), hallucination suppression silent, no publish
  blocking (supersedes 2026-07-02 hard publish-blocking; suppression +
  visible warnings instead), disjunction slots get no auto question,
  St. Vitus folds into ONE castle ticket question, one-commit-one-extraction
  cadence, extraction pinning approved.
- PENDING WORK, in order: (1) run + audit 7.17.2; (2) extraction pinning by
  material content hash — needs an additive DB migration run in Supabase
  BEFORE deploy (deliberately deferred out of 86ea837); (3) review-page
  visibility for confirmed hard warnings; (4) the 5-10 diverse itineraries +
  1-2 friends' docs Eli has queued for generalization testing (answer-key-
  lite: he marks defects on the summary page); (5) dev-only re-extract lane
  to cut QA cost; (6) medium-term: split evidence-clustering.ts (~6k lines)
  into ordered, individually tested policy stages.
- Session workflow that works: Claude commits (never pushes; no credentials),
  Eli pushes via GitHub Desktop. Every Claude commit strands
  `.git/*.lock` files on the mount — Eli clears with
  `rm "/Users/eli/Claude - Roamwoven/.git/"*.lock` before Desktop will
  behave. Sandbox test copy lives at `~/rw` (rsync from mount, npm install
  there; local node_modules on the Mac is missing dev deps).

### 2026-07-10 Central Europe P0 foundation

- Production run `6cd3ed95-09c7-49de-97dd-0089ba97dc1e` for trip `65d45385-806d-4ba9-b4eb-b5ea4146eb77` proved two upstream truncations plus a missing evidence-identity boundary.
- OCR now treats `status: incomplete` as failure, uses `gpt-5.6-luna` by default with a minimum 12k output budget, and processes PDFs in ordered four-page batches. Incomplete batches split down to single pages; a repeatedly incomplete page blocks the whole material.
- Durable OCR attempts live in `trip_material_ocr_batches`. Completed child batches can be reused after retries/restarts, and the upload-level checkpoint becomes `text_ready` only after complete page coverage.
- Material checkpoints no longer head/tail-truncate complete extracted text. The two-million-character safety limit fails closed instead of saving partial source content.
- Every source section now extracts all evidence types, not activities alone. Any unrecovered evidence chunk blocks assembly rather than becoming a maker question.
- `lib/extraction/evidence-clustering.ts` creates auditable observations and canonical Lego pieces before assembly. Three sightings of one reservation/activity become one piece; distinct same-site stops remain distinct pieces for assembly to group.
- Source transport anchors now enter as evidence observations. Strong unmatched route evidence can form a canonical transport piece, weak budget-like anchors cannot manufacture rows, and no anchor mutates traveler records after assembly.
- Legacy saved drafts without `_evidence.version = 1` keep the old anchor adapter so existing paid drafts do not silently lose repaired records. The new boundary applies to fresh extractions; this Central Europe trip must be freshly extracted after deployment.
- Broad source containers whose descriptions are covered by concrete children become context observations, not traveler cards. Review questions already answered by canonical facts are removed before assembly/review policy.
- Flight/train enrichment no longer absorbs lodging directions, addresses, food, or sightseeing text.
- Product sketch contract: a trip contains legs and days; concrete activities may be timed or clearly planned but untimed; travel has its own traveler-row treatment; loose city information becomes City Notes. “System grouped” is an assembly decision over multiple distinct pieces, not evidence deduplication.
- Additive production SQL: `db/production-sql-2026-07-10-ocr-evidence-foundations.sql`. Run it before deploying the matching application code, then set `OPENAI_OCR_MODEL=gpt-5.6-luna`, `OPENAI_OCR_MAX_OUTPUT_TOKENS=16000`, and `OPENAI_OCR_PDF_BATCH_PAGES=4` in Vercel.
- Do not test production until the SQL and environment changes are applied. The code intentionally fails closed if the durable tables are missing.

Roamwoven has a static beta flow plus the first backend-ready trip lifecycle:

`/maker` -> `/maker/trips/demo-trip` -> upload -> review -> style -> draft review -> summary -> publish -> `/t/demo`

The app uses the Asia workbook as seed data:

- 25 trip legs.
- 313 activity/cards.
- Real seed file: `data/asia-trip-seed.json`.
- Importer: `scripts/import-asia-workbook.py`.

Interactive local-only UI exists for:

- Upload intake.
- Review questions.
- Style settings.
- Publish actions.

Backend-ready pieces now exist:

- `db/schema.sql` includes V1 trip fields for payment status, theme pack, password flags, photo metrics, and sensitive-field visibility.
- `db/schema.sql` also includes owner-scoped RLS policies and owner/trip/date indexes for scale.
- Magic-link auth scaffold exists at `/login`, `/auth/magic-link`, `/auth/callback`, and `/auth/sign-out`.
- Maker pages require auth when Supabase env vars are configured.
- `lib/trips.ts` lists, loads, and creates trips through Supabase when env vars are configured.
- Real trip queries and inserts are scoped by `owner_user_id`.
- `lib/uploads.ts` stores paid-trip materials in Supabase Storage and creates owner-scoped `trip_uploads` rows.
- The upload page now posts real multipart uploads, shows saved materials after refresh, and keeps upload processing gated behind payment.
- Saved materials can be deleted before generation/processing starts, so bad test inputs can be removed and replaced. Material edits should lock once parsing/generation begins; future revisions should use a revision flow instead of mutating source inputs in place.
- Source-material abuse caps are enforced in the app: 25 MB per file, 20 files per upload request, 100 saved materials per trip, 500 MB total source-material bytes per trip, and 250 KB pasted notes per upload.
- Duplicate source-material uploads are now blocked before save using SHA-256 content hashes, with filename/size as a fallback signal. `trip_uploads.content_sha256` has a per-trip unique index, so concurrent duplicate uploads should fail even if two requests race.
- Production sequencing: before deploying code that reads/writes upload hashes, run the additive SQL for `trip_uploads.content_sha256`, `trip_uploads.source_kind`, `trip_processing_runs.idempotency_key`, `trip_processing_runs.source_upload_ids`, and the two unique indexes in `db/schema.sql`.
- Without Supabase env vars, the maker flow falls back to the Wren's Adventure demo trip.
- Real trip upload is gated behind payment status.
- Stripe Checkout scaffolding exists with promotion-code support and env placeholders.
- The Stripe webhook route can mark trips paid after `checkout.session.completed` through a narrow service-role backend path.
- Checkout sessions now include signed-in user metadata, prefill customer email when available, and return with `session_id` so the workspace can verify a completed payment immediately if the webhook is still catching up.
- Stripe setup checklist lives in `docs/stripe-setup.md`.
- Stripe test checkout has been verified end to end. A test payment redirected back to Roamwoven, and after adding `service_role` grants in Supabase the trip moved to paid, showed `Step 2 of 5 complete`, and unlocked upload.
- The paid checkout workspace state is now designed as a collapsed green `Checkout complete` bar with `Continue to upload`.
- Production upload setup has now been verified on the Stripe-paid trip `e50f7e93-b2e9-4b8c-9097-92fce402d885`.
  - The first upload-page refresh failed because production was missing `trip_uploads.file_size_bytes`.
  - The corrected storage migration was run in Supabase using `trips.owner_user_id` and the `userId/tripId/...` storage path shape.
  - `https://roamwoven.com/maker/trips/e50f7e93-b2e9-4b8c-9097-92fce402d885/upload` now loads.
  - A notes-only intake item saved successfully and persisted after refresh as a real `trip_uploads` row.
- The review step now uses the actual trip and saved upload state. Step 4 lets the maker choose optional app sections, confirm skipped modules stay hidden, and continue to the mocked clean-data step only after confirmation.
- Step 4 build choices now persist to `trip_build_settings` before moving to clean data. The table is owner-scoped through the parent trip, and the clean-data screen can show selected modules.
- The maker flow is now intended as four screens after upload: content scope -> design -> draft review -> trip summary. Design choices persist to `trip_style_settings`; the draft review screen keeps uncertain/private items in a focused review queue, and the trip summary is the "does this look right?" gate before publish.
- The clean-data step now names the actual trip and shows saved source materials, while still using reference structured data for demo trips until extraction is connected.
- The draft review / structured data screen has been simplified:
  - Demo trips show a compact scan summary and focused review queue instead of all extracted records.
  - Real paid trips do not show fake parsed review cards. They show a parse action, a scan summary after parsing, and only missing/sensitive details that need a decision.
  - Confident records should not be surfaced line-by-line in V1 review unless there is a meaningful question.
  - Sensitive details are represented as card-detail protection candidates; the privacy model still needs refinement before launch.
- The design picker keeps dropdowns for secondary/accent/soft colors and now also lets makers click the visible swatches.
- OpenAI extraction setup scaffolding exists and is connected to a guarded maker action:
  - `lib/ai/openai.ts` wraps the Responses API behind `OPENAI_API_KEY` and `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`.
  - `lib/extraction/openai-trip-parser.ts` defines the first trip-draft structured output schema and prompt.
  - `.env.example` includes OpenAI extraction env vars with extraction disabled by default.
  - Setup and cost guardrails are documented in `docs/openai-extraction-setup.md`.
- The first explicit paid `Build parsed draft` action now exists for pasted notes, small `.txt` uploads, and readable text-based PDFs:
  - Route: `app/maker/trips/[tripId]/data/extract/route.ts`.
  - It requires a paid trip, OpenAI config, `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`, and at least one parseable material.
  - It extracts normal PDF text locally before the OpenAI call and routes scanned/image-heavy PDFs through OCR before draft extraction.
  - It checkpoints each uploaded material in `trip_material_extractions` before the model call as text-ready, OCR-needed, unsupported, or failed. This is internal only; the maker still sees one build action.
  - The OCR lane uses OpenAI Responses for OCR-needed images/PDFs. `OPENAI_OCR_MAX_FILES_PER_RUN` is a batch size; the route should not silently skip remaining OCR-needed materials, and it blocks draft extraction if OCR is still pending or failed.
  - It now normalizes and caps extracted materials before the OpenAI call so ugly documents cannot make model input scale linearly with document mess. Raw-vs-submitted character counts, estimated input tokens, and trimmed material count are stored internally in `trip_processing_runs.openai_usage.materialBudget`.
  - Material-budget telemetry is for future admin/support observability only; do not surface it to maker or traveler UI.
  - It logs `trip_processing_runs`, stores raw JSON in `trip_draft_snapshots`, and updates `trips.processing_status`.
  - The additive DB SQL for `trip_material_extractions` has been run successfully in Supabase. Patch file: `db/production-sql-2026-06-19-material-extraction-checkpoints.sql`. Verification returned `found_count = 13`, `expected_count = 13`, and no missing table/column/index objects.
- Important deployment sequencing rule: when code starts reading or writing a new Supabase table, run the matching production SQL/grants/RLS before asking the user to push/test the deployed app. Otherwise the UI can ship before the database contract exists and fail for non-technical testers.
- The trip workspace now resumes from the next incomplete step instead of always sending paid trips back to upload:
  - no uploads -> upload
  - uploads saved but no content settings -> content scope
  - content settings saved but no design settings -> design
  - design settings saved -> draft review
  - parsed draft reviewed -> trip summary before publish
- The Step 4 content-scope progress bar should stay fixed while the maker checks confirmations. Checkboxes can unlock the "Continue to design" action, but should not mark the top step track complete before the settings save succeeds.
- Maker progress is now a shared seven-step component shown across the workspace, upload, app sections, design, process/review, summary, and publish pages: Start trip -> Add materials -> App sections -> Design -> Process -> Review -> Publish. Checkout/payment should not be presented as one of the traveler-app build steps.
- Later maker pages now provide direct navigation back to app setup and design, so Draft Review is not a one-way funnel.
- Every maker step should include a dashboard/workspace navigation path. The shared progress component now includes Dashboard and Trip workspace links.
- The design page must preview the actual Wren-style traveler app architecture, not generic sample cards. The Wren-style shell is the source of truth for generated app structure.
- The whimsical/fantasy preview had a contrast bug where light text could sit on a light hero background. Keep theme previews accessible regardless of primary/accent color choices.
- Quiet luxury is the shared baseline for every design direction, not a fourth theme. Modern/Futuristic, Rustic/Adventure, and Whimsical/Fantasy should differ by atmosphere while staying premium, readable, and restrained.
- Trip names can be edited from the trip workspace header with the pencil affordance. The Design page's app name field controls the traveler-facing app title.
- Document-update rule: before the first build, the maker can add/delete source materials freely. After the trip spine exists, late documents should be treated as limited app updates that append/modify structured trip records, not a full rebuild. V1 can frame this as a small update lane, such as up to 3 simple late docs.
- Do not rebuild a trip from scratch after the core/spine is built. Updates should patch the existing structured trip data and refresh the app snapshot. If source materials are not enough to build the V1 trip spine, do not produce a thin app; stop and ask for the missing basics such as dates, destinations, stays, transport, or anchor plans.
- The initial parse route now refuses to run if the trip is already processing or a draft/spine already exists. The first parsed draft is validated for V1 spine basics before a snapshot is saved.
- The draft-review screen now derives its first review surface from the generated trip model instead of a flat parser queue. The review contract lives in `lib/generated-trip-review.ts`. When a parsed draft exists, it says what Roamwoven found in human terms, such as legs across days plus flights/stays/activities, and shows the number of things the maker needs to confirm before the traveler app is assembled.
- The model-backed draft-review sections are Places, Stays, Transport, Cards, Private details, and Questions. Confident records stay summarized; only records/questions marked for review expand into confirmation cards.
- Draft day generation in `lib/extraction/draft-to-structured-trip.ts` treats intermediate leg leave dates as overlap boundaries, but includes the final leg leave date as the travel-home day. A Sep 1 to Sep 3 final leg creates Sep 1, Sep 2, and Sep 3 as trip days; intermediate leg leave dates are still covered by the next leg's arrive date or dated transport records.
- The generated-trip review decision contract now exists in `lib/generated-trip-decisions.ts`. Decisions are confirm, edit, protect, delete/ignore, combine, and answer-question. Delete/ignore marks records as `ignored`; protect changes visibility; answer-question records the answer and should resolve into one of the other structured operations.
- Review-decision persistence now exists in `db/schema.sql` and `lib/review-decisions.ts`. The table is `trip_review_decisions`, with action/subject columns plus `payload_json` for action-specific fields. The additive production SQL in `db/production-sql-2026-06-18-review-decisions-and-snapshots.sql` has been run successfully in Supabase.
- The structured draft-review cards now write decisions through `app/maker/trips/[tripId]/data/decisions/route.ts`. Confirm, Protect, Ignore, Mark answered, record-specific Edit forms, and item Combine persist to `trip_review_decisions`; the page reloads from structured records plus applied saved decisions so resolved items leave the queue.
- The trip summary page now reads from applied structured records rather than raw `draft_json` arrays. `lib/generated-trip-summary.ts` produces the title, destination/date range, active record counts, and unresolved-review status after saved review decisions are applied.
- Published traveler snapshots now have a first backend contract: `published_trip_snapshots` in `db/schema.sql`, `lib/published-snapshots.ts`, `app/maker/trips/[tripId]/publish/snapshot/route.ts`, and token rendering in `app/t/[token]/page.tsx`. `SUPABASE_SERVICE_ROLE_KEY` is configured in Vercel for Production and Preview; `/t/demo` remains the local fallback.
- Production QA validation passed on a disposable trip `82e1834c-efaf-4409-929e-542aa881c24e`: Confirm, Protect, Mark answered, summary update, publish snapshot creation, and real `/t/[token]` rendering all worked. The disposable trip was deleted afterward, and its generated token returned 404 after cleanup.
- OpenAI extraction is now ready for a controlled first production test once Vercel env vars are added:
  - `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS` gates extraction to selected trip IDs when set.
  - The server POST route rejects non-allowlisted trips even if someone bypasses the disabled button.
  - The draft-review page checks trip-specific extraction eligibility before enabling `Build parsed draft`.
  - Use the paid Central Europe trip `e50f7e93-b2e9-4b8c-9097-92fce402d885` as the first allowlisted trip.
  - Vercel now has `OPENAI_EXTRACTION_MODEL`, `OPENAI_EXTRACTION_MAX_INPUT_CHARS`, `OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS`, `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`, and `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS=e50f7e93-b2e9-4b8c-9097-92fce402d885`.
  - Vercel still does not have `OPENAI_API_KEY`. Do not add the key until the allowlist code is pushed and deployed.
- Extraction gate decision for repeated paid QA: during active beta testing, it is reasonable to remove/blank `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS` so every paid trip can run the first extraction. This is not fully broad public extraction because the route still requires paid checkout, `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`, an OpenAI key, parseable materials, and the idempotent one-build guard. After changing Vercel env vars, redeploy before testing.
- First extraction QA on the paid Andalucia dummy trip `bc773119-703b-4292-8fe1-fa7dbe46de0f` found PDF ingestion issues before any OpenAI call:
  - The first deployed attempt failed with `DOMMatrix is not defined`; this was fixed by adding a minimal server-side `DOMMatrix` shim before loading PDF tooling.
  - The next deployed attempt failed with `Cannot find module '/var/task/.next/server/chunks/pdf.worker.mjs'` while trying to read the uploaded PDF; this was a PDF worker/bundling problem, not a storage or OpenAI problem.
  - The extraction material reader now uses `pdfjs-dist/legacy/build/pdf.mjs` directly for text-only PDF extraction and removes the unused `pdf-parse` dependency. This should be deployed before asking the user to click `Build parsed draft` again.
- Cost-control guardrail: the initial parse button is now framed as a one-time build for the saved material set. The client disables the submit button while the form is pending, and the server/database idempotency key blocks repeated AI calls for the same trip/material set before `extractTripDraftWithOpenAI` can run.
- First real-draft review feedback from the Andalucía extraction exposed a real data-contract issue, not a copy bug: dining reservations were flowing through the generic `activities` draft bucket without Wren-style category organization. The extraction schema now requires every activity to have a Wren-style `category`, dining language backfills to `categoryId = food_dining`, and the review cards label section totals as `Found` separately from records that need confirmation. Do not introduce `itemType = restaurant`; dining reservations are activities with a food/dining category.
- First draft-review UX feedback also shifted the page away from internal parser language: headline is now `Check the draft`, technical model/input-character metadata and the `Parsed draft saved` banner are hidden, dates are spelled out in long form, style direction/colors are shown in the review header, `What we found` is collapsible and includes app categories, sections collapse, empty states say `No ... decisions needed`, and review progress is visible. Generated questions now have answer fields, but this is still only a persisted answer decision; the proper next contract is hypothesis-style questions with guessed value, field target, evidence, confidence, and a resolver that applies the answer to structured records.
- The hypothesis-question contract now exists for new extractions: `missingDetails` can include `subjectType`, `targetField`, `guessedValue`, `evidence`, `answerType`, and `confidence`. The adapter links questions back to matching records by `relatedTitle`; the review UI shows the guess/evidence and offers `Yes, use this`; answering a targeted question applies the answer to a whitelisted structured record field and marks the record confirmed. Next improvement is richer matching/resolution for duplicate records and non-text/vision-derived evidence.
- Andalucía extraction QA/product feedback:
  - Avoid dumb questions. If a night outbound flight clearly starts the trip, use that as the trip start; do not ask whether the first hotel date is the start. If needed, ask a targeted confirmation that the first night is on the plane.
  - Non-blocking uncertainty should not block app creation. Users can answer “not sure yet,” and Roamwoven should still create a TBD card or placeholder when the missing detail is not core route/dates/lodging/transport.
  - Privacy review should be dialed back in the happy path. Group recommended privacy into a few confirmations such as stay addresses, confirmation/booking codes, access codes, and personal/private notes, with optional drill-down into specifics.
  - Activities by category are the right direction; categories should expand accordion-style to show titles, but not descriptions by default.
  - Extraction progress should steadily advance and rotate through meaningful checks instead of resetting through 1-5 repeatedly; copy should underpromise that the build can take up to 2-3 minutes.
  - Review dates should use friendlier compact display such as `Jan. 10-14` instead of raw ISO dates in summary/dropdown contexts.
  - Traveler shell still needs Wren-parity polish later: category emojis, leg grouping/color by country/region, blocked calendar areas, homepage lower-half spacing, and copy.
- Central Europe extraction QA improved enough that lodging dates were correct on the first encouraging pass. Current review calibration:
  - `Calls we made` should be non-blocking and lightweight, with evidence hidden behind a dropdown and an edit escape hatch when the call maps to a structured record.
  - A roughly week-long trip should average a small handful of meaningful questions and calls when extraction is well tuned. Do not hard-code a target count: 3, 7, or 9 can all be fine depending on the materials. Accuracy is still more important than minimizing review.
  - Review principle: Questions are for decisions the app cannot confidently resolve and where the answer changes the traveler experience.
  - If answering the first review queue unlocks genuine new ambiguity, the preferred UX is a tiny second review round of 1-3 follow-up questions, not dumping all hypothetical follow-ups into the first pass. This needs a deliberate resolver/generation pass later.
  - Facts should not be surfaced as calls. Calls are non-obvious decisions that a human trip-planner could confidently infer, such as "no hotel night 1 because you're on an overnight flight." Calls should be statements, not questions.
  - Optional missing-detail rule: if a time-bound reservation, pickup, tour, or appointment has a usable anchor such as a name, address/location, provider, route, confirmation, or enough descriptive context, make the card and usually omit missing nice-to-have fields from review. If it only has a generic type plus time, ask a targeted question because the card is not identifiable enough.
  - Explicit source to-do rule: if the itinerary itself says something like `Need to decide`, `pick a time`, `which ticket`, `book later`, or `TBD` tied to a ticket/time/booking decision, create the activity card and keep that unresolved detail as an open targeted question. Do not turn it into a `Calls we made` note, and do not block publishing if the maker leaves it as a reminder.
  - Medium-confidence contextual guesses that would move stays, transport, or dated cards should remain Questions only when two answers are genuinely plausible. Strong contextual evidence is enough for `Calls we made` when a reasonable human trip-planner would confidently make the same call from ordering, arrival/departure sequence, bag-drop/check-in flow, or surrounding itinerary context.
  - Commercial/public venue addresses such as hotels, hostels, shops, restaurants, museums, or activity locations should not be treated as private details just because they are exact street addresses. Private homes, rentals/Airbnb, apartments, access codes, booking controls, and personal notes remain protected.
  - Readable PDFs with large embedded images now stay in the OCR lane until screenshot/image text is backfilled. If OCR is pending, fails, or returns no new image text for an image-rich PDF, the build blocks instead of generating a draft from partial PDF text.
- Future calibration loop: Roamwoven should learn from aggregate user behavior, but not by silently self-modifying rules in V1. Store structured signals for review items and later manual edits: shown as call/question/privacy, subject type, target field, confidence, evidence category, accepted/ignored/edited, edit delta, follow-up answers, and final-review edits. Use internal reports to find noisy questions, often-edited calls, privacy recommendations users undo, and fields users commonly add later. Convert strong patterns into prompt/adapter rules and regression tests first; only later consider adaptive scoring/classification once the behavior is well understood.
- Current Central Europe checkpoint before fresh chat:
  - Latest pushed extraction/review tuning made the Central Europe PDF produce few/no calls and questions. That is acceptable for this relatively explicit PDF if the trip summary/app preview proves the spine is correct; do not force calls/questions just to hit a count.
  - Review rules now established: calls are non-obvious statements only, not copied facts and not questions; explicit stay-night facts such as Vienna 3 nights should disappear from review; hotel/hostel/public venue addresses stay public while reservation numbers, room/access details, Wi-Fi passwords, booking controls, and private rental/home details stay protected; privacy defaults should be handled by the single Privacy recommendation, not Questions.
  - User hit the trip summary page and could not inspect specifics because it showed only counts. Product decision: the summary page should become a compact pre-publish QA surface with expandable specifics for trip spine, stays, transport, privacy, and a grouped/truncated activity sample. It should not require publishing the app just to check whether the extraction got basic records right.
  - Date formatting bug on summary page: `2019-01-12 to 2019-01-25` is not acceptable. Use friendly month-spelled date ranges, consistent with legs/stays/transport review formatting.
  - The summary-specifics implementation is now wired: `lib/generated-trip-summary.ts` produces friendly date ranges and section rows, and `app/maker/trips/[tripId]/summary/page.tsx` renders expandable Legs, Transport, Stays, Activities, Protected details, and Review items. Activities are category-grouped and truncated to a pre-publish sample; the page was checked locally on desktop and mobile for overflow.
  - Follow-up summary QA fixed the demo adapter where `seedTrip.dateRange` was incorrectly stored as `destinationSummary`, and fixed the traveler view model where `trip.dateRange` was incorrectly derived from `destinationSummary`. The demo summary now shows `June 27 - November 8, 2026` as the structured date range and destination cities underneath. Protected-detail summary counts now exclude public/hidden detail records, and Review items now include privacy/record-review buckets as well as open questions.
  - Summary page direction shifted from abstract buckets to a day-by-day pre-publish review: Day N + date/location, stay/travel rows first, then activities with collapsed descriptions. This is the surface for evaluating whether extraction got activity count, titles, descriptions, and placement right without bloating the short review-prompt page. The summary header now lightly reflects saved design choices with theme name and color swatches; privacy remains a quiet protected-details note, not a dominant review section.
  - Trip assembly correction pass: broad parent/child suppression and city-note merges now create statement-style Calls and persist `_assembly.debug` on the draft for internal audit. Summary rows can save structured edits, remove records, move activity cards to city tips, and mark warnings checked through the existing review-decision table. Ordinary synthetic check-in cards were removed; normal check-in/drop-bags context should live on the Stay row unless the source gives a separate traveler movement. Summary now flags 7+ visible activity days and critical flight/train records missing route/time/location details.
  - Trip Assembly Provenance + Timeline Ordering pass (2026-07-03): stay/drop-bags flow is folded into Stay rows unless it is a separate early luggage movement; rental car pickup activities merge into Travel rows with time/address/confirmation details; train/flight departure times can be promoted from descriptions; day overview cards are suppressed before maker/traveler surfaces; loose notes now consolidate to one city note per city; loose city-note moves are silent; same-site grouping preserves child names/times in the surviving card and creates one statement-style Call; explicit wrong-city conflicts move loose mentions to the named city note or become a placement review item; Summary ordering now uses departure/explicit times first and invisible day-part fallback second; missing arrival time alone is no longer a hard transport warning; Review copy no longer says "Nothing needs confirmation" when Summary has hard health warnings. Verified with `npm test`, `npm run build`, and `npm run typecheck` after build.
- Maker trips now have an app-level soft-delete path. The trip workspace shows a Danger Zone delete button for real trips; paid trips get an explicit warning that deletion removes the trip from the app and requires contacting support for restore. `listMakerTrips` and `getMakerTrip` hide `status = deleted`, and published traveler snapshot tokens return 404 while the parent trip is deleted. This is intentionally not a hard database delete; backend records remain recoverable by the superadmin.
- CTO durability pass started before new product work:
  - Published traveler snapshots now redact protected addresses and sensitive card details before JSON is shipped to `/t/[token]`. This is intentionally conservative: client-only traveler mode cannot reveal those secrets until a server-verified unlock path exists.
  - `/t/[token]` only renders the trip's active `published_snapshot_id`; older share tokens stop resolving after a republish/token rotation.
  - Stripe checkout now writes durable `trip_payment_events`, verifies the checkout owner, expected Stripe price, expected amount, expected currency, payment status, and deleted-trip state before marking a trip paid.
  - Soft delete now writes `deleted_at`, `deleted_by_user_id`, and `deletion_reason`; late payment webhooks cannot resurrect deleted trips.
  - Review decisions now use a stable `decision_key` and `upsert`, so repeated Confirm/Edit/Protect/etc. clicks update the current decision instead of appending duplicate conflicting rows.
  - Traveler privacy now has a server-side unlock foundation: protected detail values publish into `published_trip_private_details`, and `/t/[token]/unlock` verifies the active token and traveler password before returning those values.
  - CTO risk register added at `docs/cto-risk-register.md`.
  - New additive SQL: `db/production-sql-2026-06-18-durability-foundations.sql`. Run this before deploying the matching app code.
- Checkout sessions now pass `receipt_email` to Stripe using the signed-in user's email. This is the quick checkout-email path; a branded Roamwoven post-purchase email still needs a real email provider later.
- Stripe sandbox promo code `QA100` is active for Roamwoven test builds. It is 100% off once, valid, capped at 10 total redemptions, and currently showed 1 out of 10 redemptions used in the Stripe dashboard, so there are 9 remaining test uses before another code is needed.
- Promo-code checkout verification fix: Stripe discounts can make `checkout.session.amount_total` lower than the configured trip price, including `0` for `QA100`. Payment verification now compares `amount_subtotal` to the expected trip price while recording the actual discounted `amount_total`, so valid promo-code checkouts can mark trips paid without weakening price/currency/owner checks.

Live Supabase dev setup is partially complete:

- Supabase project created: `roamwoven-dev`.
- Project ref: `zijriyeydlupaqpxhiyb`.
- Project URL: `https://zijriyeydlupaqpxhiyb.supabase.co`.
- Local `.env.local` exists and is gitignored.
- `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is still blank because clipboard access from the Codex browser was blocked; it is only needed for trusted backend jobs like the Stripe webhook payment update.
- `NEXT_PUBLIC_APP_URL` is set to `http://localhost:3000` because the current local dev server is running on port 3000.
- `db/schema.sql` was pasted and run successfully in Supabase SQL editor.
- `db/schema.sql` now includes the `trip-materials` private storage bucket, storage object policies, and `trip_uploads.file_size_bytes`.
- `db/schema.sql` now includes `trip_build_settings`; the production table/grants/RLS patch was run successfully in Supabase after the deployed review save failed.
- `db/schema.sql` now includes `trip_style_settings`; the production table/grants/RLS patch was run successfully in Supabase with the same settings-table patch.
- `trip_style_settings` production columns `secondary_color`, `accent_color`, and `soft_color` were added successfully in Supabase after the style picker began persisting companion colors.
- If production shows `Build choices could not be saved`, `Content choices could not be saved`, or `App sections could not be saved`, first verify `trip_build_settings` exists with grants and the owner-scoped RLS policy. If design choices fail next, verify `trip_style_settings` the same way.
- Important storage policy detail: uploaded files use `userId/tripId/uploadId/filename`, so storage policies should check `split_part(storage.objects.name, '/', 1) = auth.uid()::text` and match `trips.id::text = split_part(storage.objects.name, '/', 2)` with `trips.owner_user_id = auth.uid()`.
- On 2026-06-16, PDF upload failed with Supabase Storage RLS error `new row violates row-level security policy`. The storage policies were rerun in production using the explicit `split_part(...)` checks above and Supabase returned `Success. No rows returned`.
- The later table grants have now run successfully in Supabase.
- Vercel project is created from `slamerow/roamwoven` on `main`.
- Production deployment URL: `https://roamwoven.vercel.app`.
- Vercel env vars set for Production and Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL=https://roamwoven.com`.
- `roamwoven.com` has been purchased through Porkbun.
- Vercel has been upgraded to Pro and `roamwoven.com` has been added to the Roamwoven project.
- Porkbun DNS now points the apex domain at Vercel:
  - A record: `roamwoven.com` -> `216.150.1.1`
  - External DNS check returned `216.150.1.1`.
  - `https://roamwoven.com` returns HTTP 200 from Vercel.
  - `http://roamwoven.com` redirects to HTTPS.
- The Porkbun email-forwarding MX/TXT records were left in place. The old root ALIAS to Porkbun parking was removed.
- Supabase Auth URL configuration is updated:
  - Site URL: `https://roamwoven.com`
  - Redirect URL allow-list: `https://roamwoven.vercel.app/auth/callback`
  - Redirect URL allow-list: `https://roamwoven.com/auth/callback`
- Vercel was redeployed after the `NEXT_PUBLIC_APP_URL` change. Deployment `3zmfrE3f5` is Ready, Current, and assigned to `roamwoven.com`.
- `https://roamwoven.com/login?next=%2Fmaker` returns HTTP 200 and is open in the Codex browser for testing.
- Magic-link email was received at `ekamerow@gmail.com`, and clicking it reached the app callback.
- After callback, `/maker` hit `permission denied for table trips`, meaning auth worked but table grants were still insufficient.
- A first grant patch was run, but `/maker` still showed permission denied.
- A second grant patch was attempted but pasted onto old SQL text and failed with syntax error near `usage`.
- On 2026-06-16, a new magic-link request from the local app reached Supabase but failed because the local sandbox had no network access. Retrying with network access confirmed Supabase is reachable but currently returning `over_email_send_rate_limit` / HTTP 429 for `ekamerow@gmail.com`.
- On 2026-06-16, the deployed Vercel app loaded at `https://roamwoven.vercel.app/login?next=%2Fmaker`, but requesting a magic link still returned `send-failed`. A direct Supabase OTP request using the Vercel callback URL confirmed the underlying cause is still `over_email_send_rate_limit` / HTTP 429 for `ekamerow@gmail.com`.
- `app/auth/magic-link/route.ts` now logs non-secret Supabase error metadata on magic-link send failure so the next failure cause is visible in the dev server log.
- On 2026-06-16, a magic-link email sent successfully from `https://roamwoven.com`, but clicking it landed on `/login?error=auth-failed`. Magic links are now treated as fallback instead of the primary beta testing path.
- `app/auth/callback/route.ts` now supports both Supabase `code` and `token_hash` callback shapes and logs non-secret callback failure metadata.
- `app/auth/password/route.ts` adds Supabase email/password sign-in and account creation so beta testing is not blocked by magic-link delivery/callback fragility.
- Password reset scaffold now exists at `/reset-password` and `/reset-password/update`, with Supabase recovery email and password update routes.
- Localhost testing from Codex is proving unreliable: the Next dev server can be listening while the in-app browser or shell cannot reach the local port. A Vercel preview deployment is likely the easiest way for the user to test auth and trip creation directly.

Supabase grants that should be present:

```sql
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on trips to anon, authenticated;
grant select, insert, update, delete on trip_uploads to anon, authenticated;
grant select, insert, update, delete on trip_legs to anon, authenticated;
grant select, insert, update, delete on trip_items to anon, authenticated;

grant usage on schema public to service_role;

grant select, insert, update, delete on trips to service_role;
grant select, insert, update, delete on trip_uploads to service_role;
grant select, insert, update, delete on trip_legs to service_role;
grant select, insert, update, delete on trip_items to service_role;
```

The grants have now been run successfully. If the schema is recreated, rerun this block in a clean SQL editor. The `service_role` grants are required for Stripe webhooks and Checkout-return verification to mark trips paid.

## Important Product Decisions

- Collaboration rule: operate like a founding CTO, not a purely obedient implementation assistant. When feedback points to a deeper dependency, likely rework, or a missing architecture decision, pause and name that issue before patching the surface. Separate interim polish from foundational work, label interim fixes clearly, and push back when the requested path is likely to waste time.
- Current design-preview decision: put a pin in further Design page tuning until the generated traveler-app data contract, adapter/view-model layer, and shared traveler component architecture are stable. Wren's Adventure is the UX/layout/interaction architecture reference, not a visual skin to copy wholesale. Roamwoven design packs should theme the shared architecture once it exists.
- Generated trip data-model decision: use the uploaded Asia/Wren workbook as the concrete structural reference for pieces and columns, but do not make a spreadsheet the final Roamwoven source of truth. The sheet/editor shape should be a human-readable staging/editing surface; durable scale comes from database records plus published traveler snapshots and a traveler-app view model. See `docs/generated-trip-data-model.md`.
- Beta should use real Stripe Checkout with promo codes/discounts for test users.
- Public launch and beta should charge or explicitly discount before expensive AI extraction.
- Maker app is the user-facing source of truth.
- Database will be the technical source of truth.
- Traveler app should be one hosted template backed by trip snapshots.
- Photos are part of V1, with count/size/retention limits and no video.
- Wren's Adventure remains the user's real trip app and the reference UX for legs, categories, calendar/day views, search, phrases, maps, and mobile cards.
- Generated apps should not force travel modules. If a customer does not include flights, the traveler app should not show a flight placeholder just to fill a template.
- Historical/sample itineraries are valid beta inputs. Do not require old docs to be rewritten with future dates. If dates do not line up with the current day, the traveler app should anchor "Today" to the first trip day, like the Wren's Adventure behavior.
- Activity extraction should preserve the traveler's mental model, not maximize card count. Broad day arcs such as "Road to Hana" can be anchor activities. Named stops such as "Wai'anapanapa State Park" can become child stops or separate cards when they have permits, time windows, map importance, or enough standalone detail. Ambiguous cases should generate review questions.
- Review needs both generated questions and manual additions. Before the initial app build, users can add/delete source docs and manually add legs, flights, stays, activities, restaurants, notes, or placeholders. After the app build starts, manual edits should update structured data cheaply, while adding new docs should be an explicit revision/reprocess path with cost controls.
- Product framing should avoid "passes." There is one initial app build from confirmed materials. Adding activities, legs, flights, stays, or corrections later is an app update, not another pass.
- Sharing/privacy model should be maker-controlled and flexible, not rigidly "maker-only by default." The maker can publish without a password, protect the whole traveler app with one catchall password, password-protect the photo section separately, or protect sensitive card details only. The elegant default for sensitive material is card-detail protection: the card can still appear in the traveler app, while exact private addresses, door codes, confirmations, or personal notes can sit behind a password when the maker chooses.
- Updated traveler-app access decision: V1 should use one trip password, not separate traveler/photo passwords. The default unlocked-by-link experience is follower/photo-forward mode. Entering the trip password unlocks traveler mode, which reveals sensitive details and enables photo upload affordances.
- Sensitive details should be locked by default when they identify private access, private contact, private residences, booking control, payment/identity, or personal safety context. Usually public: city/country, public venues, hotel names without room/access details, activity names, restaurants, day summaries, and shared photos.
- Roamwoven is deployed on Vercel Pro and the custom domain is live at `https://roamwoven.com`.
- The landing page should be the public product homepage, not a login-first surface. It should explain what Roamwoven does, use real/generated traveler-app screenshots as the money piece, and can later include clickable demos or embedded previews. Login should be a clear action from the homepage, not the homepage itself.
- The public demo should use the Wren's Adventure traveler-app shell and interaction model as the reference, not a separate Roamwoven-specific traveler UI. The current `/t/demo` now uses a Wren-style framed shell, sticky tool header, tabbed bottom nav, photo-forward follower mode, Today cards, search/map/phrase surfaces, and traveler-password unlock scaffold. Remaining work is to more directly port/adapt Wren's mature `TripApp`, `PhotoGallery`, and map/photo upload internals onto generated trip snapshots.
- Landing page direction: tagline is "The superapp for your next adventure." Add a "Perfect for" section, and later show both finished app screenshots and shots of the prompt/building phase.
- Likely early buyer profile: affluent/HENRY millennial travelers, often couples or young families, household income roughly $250k-$300k+, taking one or two higher-end trips per year and willing to pay for calm logistics.
- Future spinout idea after Roamwoven is solid: clone the core builder/template architecture into a separate bachelor/bachelorette party app with different marketing, custom UI, bill-splitting features, and likely higher pricing. Keep Roamwoven fully built first so this can be launched as a vertical clone rather than a distraction.
- First app creation flow should feel like: trip name, short description, dump files/notes, visible queued uploads, "Make app," lightweight simulated processing/progress, then secure payment. Real expensive processing must still stay behind checkout.
- Payment should be as frictionless as possible once Stripe is configured: cards plus express wallet-style checkout where available. Research PayPal support separately before promising it in-product.

## Recommended Next Task

Continue the generated-trip foundation before returning to Design page iteration:

1. Read `docs/generated-trip-data-model.md`.
2. Continue from the new record/view-model foundation:
   - `lib/generated-trip-model.ts`
   - `lib/traveler-view-model.ts`
   - `lib/extraction/draft-to-structured-trip.ts`
   - `components/traveler-app-shell.tsx`
   - `app/t/[token]/page.tsx`
3. Keep adapter fixture tests passing with `npm test`; coverage starts in `tests/generated-trip-model.test.ts`.
4. Decide whether to turn on OpenAI extraction now. The backend write/publish path is validated, so extraction is now worth enabling once the OpenAI key/model/cost guardrails are confirmed.
5. Push/deploy the allowlist code, add `OPENAI_API_KEY` in Vercel, redeploy if Vercel requires it, and test extraction on the real paid Central Europe upload.
6. Decide whether to persist applied structured records before summary/publish, or keep decisions as the first durable edit layer a little longer.
7. Return to Design preview only after it can render the real shared traveler architecture.

Latest checks run after the model-backed draft-review update:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the review-decision persistence layer:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after wiring simple review-card decisions:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after wiring edit forms and item combine:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after structured summary model:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after published snapshot foundation:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the OpenAI extraction allowlist guardrail:

- `npm test`
- `npm run build`
- `npm run typecheck` after build regenerated `.next/types`

Latest checks after the Andalucía dining-card/count-contract fix:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the draft-review UX and final-travel-day fix:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the maker trip soft-delete and published-token guard:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the CTO durability foundation pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after Andalucía review UX/product-contract pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after Eastern Europe review-friction and bounded-inference pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after Central Europe review-feedback pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after trip-summary pre-publish QA surface:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after day-by-day trip-summary review:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after explicit source TODO extraction rule:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after trip assembly correction pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after canonical record identity cleanup:

- `npm test`
- `npm run typecheck`
- `npm run build`

Canonical identity QA decisions from the July 2 Czech/Central Europe run:

- Obvious duplicate/composite cleanup belongs in internal assembly debug, not maker-facing Calls. Calls should only explain non-obvious app-shaping choices.
- Normal check-in/drop-bags flow should fold into the Stay row when it is same-day/same-place as the stay. Separate luggage storage or a separate traveler movement can remain as an activity.
- If a Travel row already covers rental-car pickup or another movement, the duplicate Activity disappears and useful time/location/details merge into the Travel row.
- Separate booking/ticket/provider/time wins over grouping. Example: the 9:00 AM Old Town/Jewish Quarter walking tour and 2:30 PM Klementinum ticket are two separate activities; the invented `Prague walking tour and Klementinum` parent should be suppressed.
- City tips use bullet-level filtering. If scheduled activity bullets are removed but loose bullets remain, keep the city note. Generic `Notes & Tips` wording is not identity evidence across cities.
- Summary now treats structural duplicate/stay/transport collisions as hard publish-blocking health warnings. Bloat (`7+ visible activity cards`) remains a quiet warning and does not block publish by itself.

Maker UX note:

- App setup now has one required pre-build confirmation: core materials are included. Empty-section handling and recommended privacy language moved into the section/module copy and review behavior instead of separate friction checks.
- Draft processing copy now sets the expectation at up to 5 minutes and cycles through concrete work labels such as flights/trains, hotels, dinner reservations, museums/tours, and other activities.
- Structured draft review now separates `What we found` from `Needs review`. Found groups summarize extracted legs, stays, transport, activities, and privacy groups; the decision queue should only contain records/questions that actually need maker action.
- Leg and stay review summaries should use human date ranges such as `January 1-3, 2019`, not raw ISO dates.
- The create-trip screen previously showed a local-only file/notes dropzone, but `app/maker/trips/create/route.ts` only persisted trip name/description. This made testers think materials vanished. Updated product decision: keep the creation dropzone because it is a useful mini-commitment moment, but actually persist those starter materials to `trip_uploads` during trip creation. AI extraction/processing stays gated until checkout. The upload screen remains useful as the place to review saved materials, add/delete more after checkout, and continue to app setup.
- Starter materials on unpaid trips should not live forever. Beta retention target is 14 days for abandoned unpaid starter materials. `lib/uploads.ts` now has a service-role cleanup helper, `cleanupAbandonedUnpaidStarterMaterials`, which finds unpaid/not-started uploads older than the cutoff, removes storage objects, and deletes `trip_uploads` rows. It defaults to dry-run; wire it to a cron/admin trigger only after deciding the operational trigger and monitoring.
- Found-group cards should show counts while collapsed, such as `5 legs` or `3 stays`.
- Activity combine controls should not appear on every activity. Only show them for plausible duplicates, and explain that the cards share date/category/title language.

Extraction inference note:

- Avoid dumb questions, but do not hallucinate. The parser may infer stay checkout dates only from explicit source evidence such as a visible first night/check-in date plus a stated nights count. Do not infer lodging dates from nearby itinerary context alone; leave uncertain fields null and ask only when the ambiguity materially affects the traveler app.
- Review questions should be rare. High-confidence confirmations, trip-level start/end calls, and privacy-default calls should move into a non-action `Calls we made` section instead of the decision queue. Clearly sensitive details should default to privacy handling instead of asking yes/no privacy questions.
- Stay-date extraction must understand explicit first-night plus nights-count language. Example: if source text says Friday sleep at Wombats and 3 nights, this should produce check-in Friday and checkout Monday, not a missing-date review item. The OpenAI stay schema now captures `firstNightDate` and `nights`; the structured adapter computes checkout from those fields when `checkOut` is absent.
- Central Europe PDF QA found two more lodging calibration rules: if a stay has `checkOut` plus explicit `nights`, compute check-in by subtracting nights; if a lodging-title question has a strong guessed value such as `The Yellow Hostel`, apply it as the stay name and move the question to `Calls we made` instead of `Needs review`. The stay schema now includes check-in/check-out times so `Check in: 2:30 PM` has a real field.

After that foundation is moving, continue hardening the post-payment maker flow:

1. Test the newly scaffolded draft-review screen on the paid trip and the demo trip.
2. Re-test the paid trip on `https://roamwoven.com`:
   - Checkout box is collapsed green after payment.
   - Upload page loads.
   - Notes save and persist.
   - Review page shows the saved materials and module toggles.
   - Design choices save and the swatches are clickable.
   - Draft review loads after design and shows the structured review sections.
3. Add a real file-upload smoke test with a small PDF or text file from the browser.
4. Test the local draft-review controls and decide which actions should persist first: item status, edits, deletion, or manual additions.
5. Add a real persisted review/intake answer model so choices survive refresh and can drive generated app modules.
6. Start shaping the simulated first-pass output into the eventual structured data records.
7. Verify a logged-in user only sees their own trips; direct RLS two-user testing can wait until a second test account exists.

Keep extraction mocked until payment, owner-scoped trip persistence, and upload storage are stable.

Promo-code beta should exercise the same paid-trip lifecycle as normal checkout. Keep expensive extraction mocked until payment and owner-scoped trip persistence are both working.

Small scaffold already exists:

- `lib/env.ts`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `db/schema.sql`
- `db/README.md`
- `lib/billing/stripe.ts`
- `app/maker/trips/[tripId]/checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `docs/stripe-setup.md`
- `lib/auth.ts`
- `app/login/page.tsx`
