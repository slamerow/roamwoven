# Work order — source-bounded container geocode retries (2026-08-05)

## Measured starting point

Pinned run 8.1.0 currently scores **FAIL 2 · NOT CHECKABLE 0 · NOT BUILT 2 ·
PASS 27**. The only failure that does not require a product decision is
`GRP-2`, the geocoder echo family.

The saved replay contains eight normalized-title coordinate collisions, but
the old assertion overstates the defect. Six are canonical aliases or
intentionally co-located evidence: meal-title aliases, spelling/language
variants, a generic slot attached to its selected venue, two source fragments
for the same street instruction, and true same-site components. Exact shared
coordinates are expected when the geocoder resolves an estate component to
the estate address.

The actual unsafe family is narrower and worse: a standalone lookup returns a
locality, G4.3 appends the day's container name, and the provider returns the
container itself even when the source never placed the candidate inside it.
Pinned examples:

- `Trdelník for breakfast, Prague Castle` → Prague Castle;
- `Museum of Illusions, Schönbrunn Palace` → Schönbrunn Palace;
- `Ring Tram Tour, Schönbrunn Palace` → Schönbrunn Palace.

True recoveries use the same mechanism: Changing of the Guard, Apple Strudel
Show, and Panorama Train are named in their container's own description. A
distance-only or “not equal to the container point” rule would delete those
valid recoveries.

## Contract

A container-context retry is permitted only when the candidate is named by the
single same-day container's own description. Matching is accent/case
insensitive. One long-token insertion, deletion, or substitution is allowed
only when the remaining meaningful title tokens agree; this covers source
spelling drift such as `Studel` / `Strudel` without fuzzy venue search.

An unlisted candidate may still use a missing city as ordinary query context;
it may not borrow the container. Rejection is fail-soft: no verified point is
attached, no maker Question is created, and the parser result survives outside
grouping proximity.

The candidate ledger must expose the stable candidate id, container title, and
source-support verdict. `GRP-2` will read that causal surface: every actual
container retry must be source-supported. It will no longer call legitimate
aliases or true same-site components defects merely because the provider
returns the same point.

## Replay rule

The cache contains provider results accepted under the old policy. Replay must
reattach the saved provider output at the original candidate boundary and then
apply the current acceptance policy. Saved unlisted container retries are
matched (so pin drift still fails closed) but rejected before their coordinates
reach assembly. Replay telemetry records those policy rejections and adjusts
the accepted/resolved counters.

## Required regressions

1. A source-listed component retries once and resolves.
2. A source-unlisted same-day venue never sends a container retry and receives
   no verified coordinate.
3. `Apple Studel Show` is source-supported by a container description naming
   `Apple Strudel Show`; short neighboring venue names do not gain fuzzy
   containment.
4. A saved replay attachment from an unlisted container retry is rejected with
   no network call; a listed attachment still reattaches.
5. Candidate telemetry survives the audit whitelist and the scorecard reads
   it rather than raw coordinate collisions.

## Scope boundary

Do not change intent classification, grouping radii, provider, lookup budget,
model prompts, City Note taxonomy, privacy, or the Mumok/Natural History
decision. Do not hard-code any city, container, or venue name.

After tests and pinned replay, update the handoff, findings inbox, and
RW-GRP-001 evidence, then stop and re-rank the remaining work.

## Result

**Complete 2026-08-05.** The saved replay accepts four source-supported
container retries and refuses five source-unlisted retries. `GRP-2` and all
Schönbrunn membership assertions PASS. Score movement: **FAIL 2 · NOT
CHECKABLE 0 · NOT BUILT 2 · PASS 27** → **FAIL 1 · NOT CHECKABLE 0 · NOT BUILT
2 · PASS 28**. Full suite (81 files / 43 Node tests), typecheck, scorecard
dry-run, and pinned replay pass. RW-GRP-001 remains `KNOWN_GAP` pending the
separately authorized fresh live run required by its 2026-08-03 return
condition.
