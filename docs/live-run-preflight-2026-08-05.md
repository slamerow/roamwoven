# Live-run preflight — assembly phase 1

Date: 2026-08-05  
Run budget: **one** fresh paid extraction. Publishing and password-mode checks
reuse that extraction and do not spend another model run.

## Purpose

Prove the current assembly, review-anchor, publishing, and password-off serving
paths on one fresh production parse of `USE FOR TESTING CZECH.pdf`. This is the
return condition still named by RW-GRP-001 and RW-ORD-001; the pinned replay is
strong deterministic evidence but cannot prove a future provider response.

## Deployment gate

- Production is still on the July 31 line: remote `main` resolves to
  `80e2b38`. The repaired code is local on `assembly-restructure-phase-1` at
  `9ce3683` plus the completed release package.
- Therefore no live run is valid until the release package is committed,
  pushed, deployed, and a fresh browser tab is opened. Running against the
  existing deployment would spend the run on stale assembly code.
- No hosted environment variable, model, schema, or runtime limit is changed by
  this release. One prompt sentence is corrected: the stale
  `Mumok or Natural History Museum` example is replaced by a synthetic
  explicit-`or` example, and the prompt now forbids inferring `or` from
  adjacent source lines, proximity, or venue knowledge.

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
| Publish/privacy browser check fails | No extra extraction cost | Keep the QA link undistributed and roll production back to the previous Vercel deployment while the failed layer is repaired. |

## Execution order

1. **Complete:** run the bounded prompt smoke described above. Both controls
   and the structured output shape passed.
2. Commit the complete release package, push it, deploy the final revision,
   and open a fresh browser tab.
3. Inventory hosted env names/scopes without changing values. The run itself,
   not the console, will verify resolved models and sampling.
4. Create one new QA trip, complete the normal Stripe test checkout with the
   `QA100` promotion, and upload the known Central Europe source PDF.
5. Trigger **Build parsed draft** once. Preserve its processing run, events,
   audit payload, QA bundle, parse pin, and geocode replay snapshot.
6. Score what actually shipped and replay the exact saved provider artifacts
   through the current code. Do not substitute one surface for the other.
7. Inspect the fresh source/model output before attributing any mismatch to
   assembly.
8. Verify the live contract bar, including:
   - Mumok and Natural History as separate Vienna City Note ideas, with no
     fabricated `or`, Activity, or Question;
   - no unsupported same-site children or retry-derived containment;
   - every maker-facing Question/Call anchored and every open Question bound
     to a surviving subject;
   - no public protected travel description or universal secret.
9. Publish first with password ON and observe locked follower mode plus valid
   unlock. Then turn password OFF, republish, and observe immediate traveler
   mode with every `traveler_password` detail visible and no `maker_only`
   detail served.
10. Record the final deployed revision, run id, trip id, parse key, resolved
   model telemetry, scorecard result, and browser observations in the handoff.

Two consecutive live failures without new information remain a hard stop. This
work order authorizes only the first run.
