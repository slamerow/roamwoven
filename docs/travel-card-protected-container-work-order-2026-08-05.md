# Work order — generated travel cards and protected descriptions (2026-08-05)

## Problem

RW-PRI-001 Δ4 is a locked contract and an explicit `KNOWN_GAP`. Generated
transport records do not reach the traveler app at all: the demo seed has
`transport: []`, and `createTravelerAppViewModel` maps only activity items.
The public snapshot also has no `descriptionVisibility`; it conditionally
redacts only descriptions a content classifier recognizes. A benign-looking
transport description can therefore remain in the public snapshot, while a
traveler cannot see any generated travel card.

This arc closes that serving defect. It does not change extraction,
transport candidacy, source precedence, grouping, dates, or the still-open
product choice for a trip with no configured traveler password.

## Applicable locked contracts

- RW-PRI-001 Δ4: the entire transport description is one protected container;
  the face is composed only from public structured fields.
- RW-TRV-001: every inter-city segment is one traveler travel card.
- RW-CNT-001: travel cards participate in the Plans/card count without being
  duplicated as activity shadows.
- RW-PUB-001: an existing published snapshot is immutable; new behavior applies
  only when a new snapshot is created.
- RW-AUD-001: a protected description is not audited as public prose, while the
  actually public structured face remains auditable.
- RW-OPS-001: masking, persistence, and unlock outcomes require route-level
  proof before the arc is push-ready.

## Contract

1. Every newly projected transport record has effective
   `descriptionVisibility: "traveler_password"`. Legacy records without the
   field are treated as protected.
2. Every active transport record becomes exactly one traveler card. Its public
   face uses only `routeLabel`, endpoints, departure/arrival times, date,
   provider, and transport type. Raw `description`, confirmation, and booking
   URL never enter `snapshot_json`.
3. A nonempty transport description becomes a deterministic derived private
   detail tied to that transport card. It is written transactionally beside the
   immutable snapshot and referenced by id from the public traveler model.
4. The redacted QA bundle exposes visibility and a redaction marker, never the
   protected description. Explicit private-debug mode may retain it.
5. The public-field audit excludes protected transport descriptions and keeps
   evaluating the structured card face and other public record fields.
6. A correct password returns the derived description through the existing
   unlock route; an invalid password returns no private details. One successful
   unlock populates the existing shell-wide session state for every card.
7. The current no-password-configured branches are unchanged pending Eli's
   explicit decision. This arc must fail closed and must not make a description
   public merely because password configuration is absent.
8. The existing assembly prose sweep remains in force for this arc. Restoring
   content it previously removed is a separate measured variable after the
   protected serving path is proven.

## Regression matrix

- Structured projection stamps the protected visibility default.
- One transport row becomes one traveler card on its date and leg; no duplicate
  activity is created.
- The raw description is absent from the public snapshot even when it contains
  no token a privacy classifier would flag.
- Route, endpoints, times, provider, and type remain visible on the card face.
- The transactional publish RPC receives the derived protected description.
- Valid unlock returns it; invalid unlock never calls the private-detail read.
- Legacy transport rows with no visibility field fail closed.
- Redacted QA shows the field and hides the value; private-debug QA may show it.
- Full suite, typecheck, optimized build, and pinned assembly scorecard do not
  regress.

## Acceptance

- Every matrix item passes on the real projection/publish/unlock paths.
- No raw transport description is present in a public snapshot.
- Existing snapshot schema remains readable and no historical snapshot is
  rewritten.
- The ledger and beta-readiness handoff record the measured enforcement state.

## Measured result

Completed in the 2026-08-05 deterministic serving arc. All regression-matrix
items pass on the projection, public snapshot, transactional RPC payload,
unlock route, QA bundle, and audit paths. Legacy missing visibility fails
closed; a description that exactly repeats an allowed public provider does not
create a false publication block. No existing snapshot is rewritten, and the
prose-side assembly sweep remains unchanged.

Gates: 82 test files / 43 Node cases pass; typecheck passes; optimized Next.js
build passes including `/t/[token]` and `/t/[token]/unlock`; scorecard dry-run
passes; pinned replay remains **FAIL 1 · NOT CHECKABLE 0 · NOT BUILT 0 ·
PASS 30** with only the pre-existing Mumok/Natural-History evidence conflict.

Coverage is `PARTIAL`, not overclaimed as `ENFORCED`: the no-password viewer
behavior is still an explicit CEO decision, and a fresh production
publish/browser observation has not yet been authorized or run.

## 2026-08-05 supersession

Eli has now decided the no-password behavior and authorized the integrated live
validation. Password OFF means every share-link holder starts fully unlocked in
traveler mode; password ON retains the locked follower state until one correct
password. Implementation and regressions are recorded in
`docs/password-off-traveler-mode-work-order-2026-08-05.md`. This addendum
supersedes only the two open-choice sentences above; it preserves this work
order as the measured history of the protected-container arc.
