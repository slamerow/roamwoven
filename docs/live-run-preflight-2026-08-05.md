# Live-run preflight — assembly phase 1

Date: 2026-08-05; scope updated 2026-08-06
Run budget: **one** fresh paid extraction. This work order stops after capture,
replay, and the extraction/assembly audit. Password UI and password-mode
publish/browser QA are a separate later component.

## Purpose

Prove the current extraction, assembly, and review-anchor paths on one fresh
production parse of `USE FOR TESTING CZECH.pdf`. This is the return condition
still named by RW-GRP-001 and RW-ORD-001; the pinned replay is strong
deterministic evidence but cannot prove a future provider response. The maker
app has no password configuration UI. Per Eli's 2026-08-06 ruling, that UI and
password-mode browser QA do not gate this run.

## Deployment gate

- **Completed 2026-08-06:** the release package and report-output cleanup were
  merged to `main` and deployed at revision `2e056d6`. Eli confirmed deployment
  before starting the single fresh extraction.
- No hosted environment variable, model, schema, or runtime limit is changed by
  this release. One prompt sentence is corrected: the stale
  `Mumok or Natural History Museum` example is replaced by a synthetic
  explicit-`or` example, and the prompt now forbids inferring `or` from
  adjacent source lines, proximity, or venue knowledge.

## Live execution record — 2026-08-06

- **Completed once:** the fresh production extraction reached
  `completed-with-review` without a rerun loop on deployed revision `2e056d6`.
- Production trip id: `6e200576-b6d5-4a6d-afd3-7beaec001f1c`.
- Maker result:
  `https://roamwoven.com/maker/trips/6e200576-b6d5-4a6d-afd3-7beaec001f1c/data?extraction=completed-with-review`.
- Source shown in the maker result: `USE FOR TESTING CZECH.pdf`.
- The one-run budget is consumed. **Do not trigger a second extraction.**
- A read-only browser spot-check observed 5 legs over 14 days, 5 stays, 8
  transport records, 64 Activities, 3 City Notes, and 6 open Questions. It
  made no maker decision and did not edit, remove, publish, or retry anything.
- Visible contract pass: Mumok and Natural History remain separate Vienna City
  Note statements, with no synthesized `or`, Activity, or Question.
- **Audit completed:** run `314c87b9-e014-4811-9d0f-bda60a263ac2`, snapshot
  `8d57e788-0bf7-4dd3-8648-85a8753c4e59`, replacement pin
  `d786e9e4a20d11b2476bc60951b07d45b6fe418881a40e788dc2d9282b882c94`.
  The run events, processing row, raw calls, source materials, audit payload,
  exact persisted QA bundle, pin, and geocode provider snapshot were preserved
  before code changes. Production and replay were scored separately.
- Runtime: about 225.8 seconds; unchanged `gpt-5.4-mini`; 30/30 primary chunks;
  zero rescues/failures. Source recovery ran once over 45 lines, recovered 29,
  and left 56 meaningful residual uncovered lines. The earlier “no source
  recovery” reading was false.
- **Verdict: not beta-ready.** Only 3/14 day sections are clean, 0/3 City Notes
  are clean, and 1/4 expected groups is complete. Six Questions shipped versus
  three expected. Two Calls shipped versus three expected, and the Schönbrunn
  Call's source claim is false relative to its membership record.
- Raw calls prove the two fabricated disjunctions are deterministic parser
  normalization defects, not model titles. `30-minute walk`, `Payment due`,
  `Wi-Fi`, and `Return` are downstream role/candidacy failures. Pinball,
  basilica identity, card/note winner selection, note conservation, review
  budget, and final-projection privacy also fail on persisted output.
- The corrected assembly-only next pass is
  `docs/assembly-beta-candidate-work-order-2026-08-06.md`. No second extraction
  is authorized.

## Green package evidence

- Full suite: 84 test files plus 43 Node cases, zero failures/skips.
- Typecheck: clean.
- Optimized production build: clean, including `/t/[token]` and its unlock
  route.
- Last strict assembly checkpoint before the prompt correction: FAIL 0 · NOT
  CHECKABLE 0 · NOT BUILT 0 · PASS 31. The old extraction pin now correctly
  misses because the prompt is part of the request identity; it is historical
  assembly evidence, not a current-prompt replay. The smoke and fresh run must
  create the replacement pin before strict replay can be called current.
- Diff hygiene: clean.
- Commit boundary excludes `.assembly-cache/`, the source PDF, environment
  files, and run payloads. Scorecard reports no longer copy protected
  answer-key lines.

## Capacity arithmetic

The most recent comparable production run (`2a2ae39d-c419-4bd6-87a1-3851b6d0afce`)
completed in 411.837 seconds against `maxDuration = 800` seconds. Remaining
headroom was 388.163 seconds, or **48.5%**, above the required 40% preflight
margin.

Its served telemetry recorded:

- extraction/recovery model: `gpt-5.4-mini`;
- OCR model: `gpt-5.6-luna`;
- 32 activity chunks;
- geocoding completed with 131 lookups, 9 retries, 0 failures, concurrency 8.

This release adds no model call or lookup wave. The geocoder containment change
refuses five unsupported retries before lookup, so it should not increase
latency.

## Prompt-migration gate

The corrected sentence does not change the schema, model, request count,
output-token cap, or concurrency. Its intended behavioral delta is exactly
one boundary: explicit source `X or Y` remains one flexible card; adjacent
source lines with no `or` remain separate evidence.

Failure modes are: the model still invents a disjunction despite the negative
instruction; the model stops respecting genuine explicit alternatives; or an
unrelated output field changes shape. Synthetic positive and negative controls
cover the deterministic normalizer and the prompt source is pinned against the
disproved museum phrase. Before the full live run, one bounded local
single-chunk provider smoke must exercise both an adjacent-lines negative
control and an explicit-`or` positive control against the unchanged
`gpt-5.4-mini` model. Preserve the JSON shape and usage, then make no further
prompt/model/env change before the production extraction.
`scripts/smoke-disjunction-source-boundary.mjs` is fail-closed and networkless
by default; `--live` runs the real spine plus one activity chunk on synthetic
text only (two expected primary requests, with no database write or geocoder).

**PASS 2026-08-05.** The live smoke used `gpt-5.4-mini`, made exactly 2 live
calls, processed 1 activity chunk (1 succeeded, 0 failed, 0 rescued), produced
3 model-chunk observations, and required no source-recovery call. The adjacent
museum lines remained separate and the explicit café `or` remained one
observation. No model, prompt, env, or runtime change is permitted between this
checkpoint and the full extraction.

## Prediction, cost, and rollback

Confidence is **high** that the deterministic assembly changes hold on the
saved parse and **medium** that a fresh nondeterministic parse presents every
same evidence shape. A mismatch is the information this one run is intended
to reveal.

| Failure | Cost if wrong | Response / rollback |
|---|---|---|
| Stale deployment | Wastes the only run and proves nothing | Verify the final deployed revision first; do not click Build otherwise. |
| Checkout, auth, or extraction gate rejects before processing | No model run; setup time only | Correct the fresh QA trip or allowlist through the inventory-first env protocol. Do not bypass payment. |
| Provider/OCR transient failure | May spend the one run | Inspect processing events; do not change models. Stop and re-plan before any second run. |
| Fresh parse exposes a new assembly defect | One useful run | Preserve payload, pin, and geocode artifacts; do not patch from the symptom before reading the parser output below assembly. |

## Execution order

1. **Complete:** run the bounded prompt smoke described above. Both controls
   and the structured output shape passed.
2. **Complete:** commit the complete release package, push it, deploy final
   revision `2e056d6`, and open a fresh browser tab.
3. Inventory hosted env names/scopes without changing values. The run itself,
   not the console, will verify resolved models and sampling.
4. **Complete:** create one new QA trip and upload the known Central Europe
   source PDF. The resulting production trip id is recorded above.
5. **Complete:** **Build parsed draft** was triggered exactly once and reached
   Review. Its processing run, events, audit payload, QA bundle, parse pin, and
   geocode replay snapshot were preserved before code changes.
6. **Complete:** score what actually shipped and replay the exact saved provider
   artifacts through the current code. The persisted record surface remains
   authoritative where replay diverges.
7. **Complete:** inspect fresh source/model output before attributing each
   mismatch. The resulting layer attribution is recorded in the handoff and
   assembly work order.
8. **Complete and failed as a beta gate:** verify the live contract bar:
   - Mumok and Natural History as separate Vienna City Note ideas, with no
     fabricated `or`, Activity, or Question;
   - no unsupported same-site children or retry-derived containment;
   - every maker-facing Question/Call anchored and every open Question bound
     to a surviving subject;
   - no public protected travel description or universal secret.
9. **Complete:** stop after the extraction/assembly audit. Do not score the absent maker
   password controls as a defect and do not improvise a password-mode browser
   test. The later password component will cover protected/blurred travel-card
   descriptions and the photo-mode UI/affordances while preserving the existing
   backend privacy boundary.
10. **Complete:** record the deployed revision, run id, trip id, parse key,
   resolved model telemetry, scorecard result, and assembly observations in the
   handoff.

Two consecutive live failures without new information remain a hard stop. This
work order authorizes only the first run.
