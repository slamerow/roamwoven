# Work order — production-shaped Question gate (2026-08-05)

## Problem

`gateOffContractQuestions` contains the deterministic rules that keep
source-obvious, privacy-default, receipt-fragment, OCR-fragment, and duplicate
venue-complex questions away from the maker. It filters for
`_canonicalReviewDisposition: "question"`, but production parser details do
not have that internal field until `canonicalizeCanonicalReviewDetails` runs.
The gate currently runs immediately before canonicalization, so it sees no
production parser questions. Seeded fixtures pass only because they inject a
field the parser schema forbids.

Moving the call alone is insufficient. The settled-date family is currently
removed later by reconciliation, which reaches the correct maker-facing
verdict but deletes the record and its reason. RW-OPS-001 requires a named,
auditable terminal outcome.

## Applicable locked contracts

- RW-QUE-001: only unresolved material decisions become typed Questions.
- RW-REV-001: source-obvious facts and presentation mechanics are not Questions.
- RW-PRI-001: automatic privacy protection is never a maker Question.
- RW-ORD-001: review identity is resolved before a later policy stage acts.
- RW-AUD-001: dismissal evidence must describe the real production path.
- RW-OPS-001: every handled question terminates in a named retained outcome.

## Contract for this repair

1. Canonical subject and disposition assignment runs before the Question gate.
2. The gate runs inside `canonicalizeCanonicalReviewDetails`, the boundary used
   by initial assembly and rebuilds.
3. Gated questions are retained as `dismissed` with
   `_canonicalQuestionGate`; they are not silently filtered out.
4. Parser-shaped and pre-seeded equivalent inputs converge on the same terminal
   state and reason.
5. Open material questions, Calls, source-update Calls, and identity-forwarding
   behavior are unchanged.
6. The repair changes review policy only. It does not change model input,
   canonical candidacy, item type, dates, grouping, or traveler records.

## Regression matrix

- A parser-shaped mode/type curiosity is retained dismissed with its reason.
- A parser-shaped settled-date question is retained dismissed rather than
  disappearing in final reconciliation.
- Seeded and parser-shaped twins produce the same terminal state.
- Automatic privacy, truncated OCR, receipt-title, and same-section
  venue-complex families run on parser-shaped inputs.
- A real material question remains open.
- Identity questions still use the shared identity gate and remain auditable.
- Subject-id forwarding and dead-subject fail-soft behavior remain green.
- Redacted QA/audit projection retains dismissal status and reason.
- Full suite, typecheck, optimized build, scorecard dry-run, and pinned replay
  do not regress.

## Acceptance

- No production-path assertion describes the gate as dead.
- Every off-contract family has a production-shaped positive and a nearby
  negative control where applicable.
- The current pinned assembly result does not lose any intended Question or
  Call.
- Coverage is not upgraded beyond the evidence actually gathered.

## Result

Completed 2026-08-05. Canonical subject/disposition assignment now precedes
the gate inside `canonicalizeCanonicalReviewDetails`; the obsolete pre-boundary
call was removed. Every production-shaped off-contract family in the matrix is
retained `dismissed` with its reason through structured projection. The nearby
material-question, identity, subject-forwarding, and dead-subject controls stay
green. The pinned replay preserves all 8/8 maker-facing anchors and, after the
separate source-ground-truth correction, scores 31/31 PASS. Full suite:
83 files / 43 Node cases; typecheck and optimized build pass.
