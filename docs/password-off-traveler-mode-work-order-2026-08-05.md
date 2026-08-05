# Work order — password-off traveler mode (2026-08-05)

Status update 2026-08-06: backend behavior and route coverage remain intact,
but the maker-facing password configuration UI does not exist. Eli deferred
that UI and password-mode browser QA until after extraction and assembly are
stable. Their absence does not fail the current fresh-run audit. The later UI
component is bounded to protected/blurred travel-card descriptions and the
photo-mode interface/affordances. The authoritative fresh-run audit is now
complete and assembly is not beta-ready, so this work order remains deferred
until `docs/assembly-beta-candidate-work-order-2026-08-06.md` and subsequent
cross-itinerary validation close.

## Decision and problem

Eli's 2026-08-05 ruling closes RW-PRI-001 Δ4's final product question:
traveler-password configuration is optional. When the maker turns it off,
follower mode collapses and every valid share-link holder is in traveler mode
with all `traveler_password` details visible. When it is on, the existing
locked follower state remains until one correct password unlocks the session.

The pre-ruling implementation returned `unlocked: true` but an empty detail
array when password protection was disabled, while the page always initialized
locked. That combination contradicted itself and made protected travel and stay
details unreachable.

## Applicable locked contracts

- RW-PRI-001 Δ4: one password unlocks all traveler-visible private details;
  follower is a viewer state, not a persisted role.
- RW-PUB-001: immutable published snapshots are never rewritten.
- RW-OPS-001: enabled, disabled, invalid, revoked, and missing states each have
  a named terminal outcome.
- Dark-factory constraint: public `snapshot_json` remains secret-free in every
  mode; password-off changes serving authorization, not storage classification.

## Contract and blast radius

1. Password OFF starts the server-rendered traveler shell with
   `initialUnlocked: true` and every snapshot-scoped `traveler_password` row.
2. Password ON starts locked and reads zero private rows until valid
   authentication.
3. The unlock endpoint returns every protected detail when password protection
   is disabled, returns them once for a valid enabled password, and returns none
   for an invalid password.
4. The private-detail read revalidates the current published snapshot. A
   deletion or republish between access-state and detail reads fails closed.
5. The shell indexes the server-provided details immediately and renders the
   full unlocked set in Trip details; card-linked details use the same index.
6. `maker_only` values remain maker-only. No role table, second link, cookie,
   snapshot mutation, extraction change, or assembly change is introduced.

## Regression matrix and result

- password off → initial traveler mode + one complete private-row read;
- password on → initial locked mode + zero private-row reads;
- revoked password-off snapshot → not found/fail closed;
- disabled unlock route → full details;
- valid enabled password → full details;
- invalid enabled password → 401 + zero private-row reads;
- public snapshot privacy and transactional publish tests remain green;
- full suite: 83 files / 43 Node cases; typecheck passes.

The remaining proof is one fresh production publish and browser observation in
both the public snapshot payload and traveler page. That run is authorized and
belongs to the final integrated validation, not this deterministic repair.
