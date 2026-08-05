# Work order — stable maker-decision anchors (2026-08-05)

## Problem

RW-ORD-001 records that a canonical piece id is not durable:
`mergeCanonicalPieceInto` refreshes it as evidence merges. Saved maker decisions
currently persist only structured ids derived from that piece id. The current
build can apply them, but a future rebuild has no independent handle with which
to re-find the same subject. The pinned scorecard therefore marks `ORD-4` NOT
BUILT.

Re-processing is explicitly out of scope. This work records and serves the
anchor now, supplies a bounded unique-match resolver, and leaves all decision
semantics trip-local.

## Contract

1. Every newly projected maker-facing Question or Call carries a versioned
   `decisionAnchor` in addition to its current subject ids.
2. A record anchor carries subject type, leg key, date, and normalized title.
   Nullable fields remain explicit; a source-derived Question reference is
   included when a record triple is unavailable or when the decision itself is
   the Question.
3. Every decision written through the maker route persists its primary anchor
   inside `payload_json`. Compound decisions may carry related anchors for
   source records or a target leg.
4. Serialization and normalization round-trip anchors. Rows written before the
   field existed remain valid and keep their direct-id behavior.
5. Applying a decision uses the direct id first. If that id no longer exists,
   its anchor may rebind only when exactly one compatible record matches.
   Ambiguous or absent matches fail soft and mutate nothing.
6. Anchors locate records only. They never encode an answer, edit, deletion,
   preference, or any feedback into future Roamwoven behavior.
7. The extraction fingerprint and QA bundle expose every maker-facing anchor,
   making missing/dead fields measurable from the served audit surface.

## Regression matrix

- Open Prague Castle ticket Question carries leg/date/title plus a stable
  Question source reference.
- A delete decision with a stale item id re-finds exactly one item from its
  anchor and applies to that refreshed id.
- Two matching records make anchor resolution ambiguous; neither is changed.
- A compound combine with one resolvable source and one ambiguous source is
  atomic; no partial combine is applied.
- A legacy decision with no anchor still applies by its existing id.
- Anchored persistence payloads round-trip without changing old unanchored
  payload shapes.
- The pinned QA/fingerprint surface reports one valid anchor for every open
  Question and Call.

## Acceptance

- Full suite and typecheck pass.
- Scorecard dry-run is clean.
- Offline pinned scorecard changes `ORD-4` from NOT BUILT to PASS without
  regressing another assertion.
- Product contract, handoff, and findings inbox record the implementation and
  measured result.

## Result

Completed 2026-08-05. Structured Questions and Calls now receive versioned
anchors from `lib/review-decision-anchor.ts`. The maker decision route derives
the trusted primary and related anchors from the current applied records, the
persistence codec round-trips them without changing legacy row shapes, and
decision application uses direct ids first with a unique-match-only anchor
fallback. The regression matrix proves both stale-id rebinding and the
ambiguity refusal path. Compound combines are all-or-nothing: one unresolved,
ambiguous, duplicate, or target-equal source refuses the entire mutation rather
than partially applying it.

Fingerprint version 3 and the redacted QA bundle both serve the anchors. The
QA-bundle regression asserts the actual exposed object, so a computed but dead
field cannot satisfy the gate. `ORD-4` also validates the served status,
version, subject type, and normalized source-reference shape rather than
counting nonempty strings as valid. Full verification passes: 81 test files, 43
Node cases, typecheck, optimized production build, diff hygiene, scorecard
syntax, and pinned replay. The score is now **FAIL 1 · NOT CHECKABLE 0 · NOT
BUILT 0 · PASS 30**; `ORD-4` is PASS with 8/8 maker-facing anchors valid and no
other assertion regressed.

A fresh production extraction was deliberately not started by this work
order. Pinned replay proves deterministic assembly behavior against the saved
provider result; it does not satisfy the separate live-run return condition.

Release-package route audit addendum: bulk confirm/protect/delete actions now
resolve every requested subject anchor before starting any persistence call.
The prior `Promise.all(subjectIds.map(save...))` shape could launch earlier
writes before a later stale subject threw. The route-shaped regression proves
that a mixed valid/stale request returns the named save failure with **zero**
writes, while a fully anchored request saves every subject. The integrated
suite is now 84 test files / 43 Node cases.
