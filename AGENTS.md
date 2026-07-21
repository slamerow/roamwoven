# Roamwoven repository instructions

These instructions apply to the entire repository.

## Product-contract preflight

Before proposing or making changes to ingestion, extraction, canonicalization,
assembly, privacy, review Calls or Questions, or publishing:

1. Read `docs/product-contracts.md` completely.
2. State the applicable locked contract IDs in the pre-code callout.
3. Ask only about decisions marked `OPEN`, or about a genuine conflict between a
   newer explicit user decision and a locked contract.
4. Do not reopen a `LOCKED` decision merely because another implementation would
   be conventional or technically convenient.
5. When a newer explicit user decision changes a contract, update the ledger,
   its decision date, its supersession note, and its coverage mapping in the same
   change.

## Authority and conflicts

- The newest explicit user-approved decision wins.
- Otherwise, `LOCKED` entries in `docs/product-contracts.md` override older
  architecture notes, backlogs, handoffs, current code behavior, and tests.
- Code and tests describe the implementation; they do not silently redefine the
  product contract.
- If implementation and contract disagree, preserve the contract and mark or
  close the implementation gap explicitly.

## Coverage honesty

- `ENFORCED` requires meaningful behavioral coverage.
- `PARTIAL` means some layers are covered but an important path is not.
- `KNOWN_GAP` means current behavior is known to violate the contract.
- Do not use skipped tests or idealized unit fixtures to describe a live pipeline
  contract as fully enforced.
- Runtime fixes should close the relevant gaps and update the coverage state.

## Dark-factory deployment readiness

- A new validator, invariant, `throw`, retry, or quarantine path is not
  push-ready until its actual route-level outcome is traced and tested.
- Every such path must terminate in one of: bounded deterministic repair,
  retained last-good state, usable evidence-preserving fallback, or a named
  technical recovery state when no valid draft can exist.
- Once the parser has returned a usable draft plus evidence pieces, canonical
  identity, manifest, or disposition defects are internal recovery work and may
  not terminate in a technical recovery state.
- A processing stage may be recorded as completed only after its output passes
  the validation required by the next persisted boundary.
- Successful internal repair belongs in support telemetry and audit tooling, not
  in maker Questions or customer-facing extraction mechanics.
- Final handoffs must distinguish a committed checkpoint from code that is safe
  to push or deploy.

## Collaboration boundary

For customer-visible or product-sensitive behavior, provide Assumptions before
code and wait for explicit approval when an `OPEN` decision materially changes
the experience. Technical implementation choices that preserve all locked
contracts do not require reopening those decisions.

## Operating discipline (added 2026-07-22 after a costly day — binding on every session)

Derived from real failures: a model swap that broke every downstream
calibration, a predictable timeout that was not arithmetic-checked, an env
cleanup that silently broke OCR, and two wasted runs on a stale deployment.

1. MODEL/INFRA CHANGES ARE MIGRATIONS, NOT SETTINGS. Changing any model
   (extraction, OCR, recovery), prompt contract, or runtime limit requires,
   BEFORE the live run: (a) the arithmetic — expected latency × call count
   vs maxDuration, with ≥40% headroom; (b) a written list of expected
   failure modes and what each costs; (c) a single-chunk smoke test of the
   new model's output SHAPE against current fixtures where feasible;
   (d) exactly one variable changed per run. The pipeline is
   SHAPE-CALIBRATED to the current extraction model — prompts, artifact
   families, classifier vocabulary, and fixtures encode its idiosyncrasies.
   "Fixture-green" is necessary, never sufficient, across models.
2. ENV-VAR SURGERY PROTOCOL. Before touching hosted env vars: inventory
   every variable name + scope and record it in the session notes. Change
   one variable at a time. Verification is run telemetry (the model/values
   the run actually used), never the console UI. Every change states its
   undo in the same breath.
3. PRE-FLIGHT BEFORE EVERY LIVE RUN: deploy green, fresh browser tab
   (deploys invalidate open tabs), env verified from the PREVIOUS run's
   telemetry, duration headroom re-checked if anything got slower.
4. PREDICTION DISCIPLINE. Recommendations that touch live systems carry an
   explicit confidence level, the cost if wrong, and the rollback. "I
   expect X" without those three is not advice.
5. RUN BUDGET. State the expected number of live runs before starting an
   arc. Two consecutive runs that fail without producing NEW information
   is a hard stop: re-plan on paper before spending a third.
6. OPS INSTRUCTIONS ARE CODE. Steps a human executes in a console get the
   same rigor as a commit: numbered, with a verification step and an undo
   step, and an "inventory first" rule when state is unknown.
