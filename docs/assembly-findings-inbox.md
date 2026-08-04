# Findings inbox

Out-of-scope defects noticed while executing the tasks in
`docs/assembly-restructure-work-order-2026-08-04.md`. Recorded per Standing
rule 3 — not fixed here.

## Task C

- `lib/extraction/canonical-evidence-resolver.ts:233` and `:259`
  (`sourceTextHasGroupingRelationship` / its sibling check) carry their own
  "same-site / grouping relationship" word list
  (`complex|grounds|campus|estate|...`) that is adjacent to, but
  independently maintained from, both `SITE_CONTAINER_NOUN_PATTERN`
  (`lib/trip-card-taxonomy.ts`) and `isSameSiteActivityGroup`'s
  `explicitSameVisit` clause (`lib/trip-card-taxonomy.ts`, same file, still a
  separate regex). Not named in Task C2, so not touched — but it is the same
  class of risk (one concept, several private word lists) and worth a look
  next time this lane is edited.

## Task B — the removal gate (Step 1: disposition typing, not restructuring)

Step 1's mandate was behaviour-neutral labelling only — no control-flow
changes. These are the places where the CURRENT (unchanged) control flow
still throws away information the gate would ideally use, or plausibly
deserves different treatment. Recorded, not fixed, per Standing rule 3.

- `lib/extraction/evidence-clustering.ts`, `suppressRouteLessTransportFragments`
  (the loop around the `host` lookup, originally cited at survey line
  ~2155). The removal runs unconditionally; `host` is only looked up
  afterward to choose the label. Work order Task B5 names this one
  explicitly as "do not restructure in this step." The disposition routed
  here (`{ survivor: host }` or `{ terminal:
  ROUTE_LESS_TRANSPORT_FRAGMENT_NO_HOST }`) is the most accurate label the
  CURRENT control flow supports. A later step should condition the removal
  itself on `host` (or on the broader question of whether a route-less,
  time-less fragment with no host should survive as its own record) so the
  gate can refuse cleanly instead of only labelling after the fact.

- `lib/extraction/evidence-clustering.ts`, `applyAccessTaskPolicy`, the
  `matchingPrivateStay` branch (originally cited at survey line ~3615, work
  order Task B5's second named site). Same shape as above: the label
  already branches on `matchingPrivateStay`, but the removal itself is not
  conditioned on it (`!matchingPrivateStay || !explicitSeparateAction`
  triggers suppression either way). Routed with `{ survivor:
  matchingPrivateStay }` or `{ terminal:
  PRIVATE_STAY_ACCESS_NO_COMPATIBLE_STAY }` per the existing branch: not
  restructured.

- `lib/extraction/evidence-clustering.ts`, `applyAccessTaskPolicy`, the
  `cityStay` branch (a few lines above the `matchingPrivateStay` one above,
  survey line ~3472 in this file's current numbering — NOT one of the two
  sites the work order named, but the same shape: the `suppressCanonicalPiece`
  call for the activity fires unconditionally, and `cityStay`/`instructions`
  only decide whether the *stay* records an absorption, not whether the
  *activity* is removed. This is a third unconditional-removal-with-
  after-the-fact-lookup site that the survey's "2 MIXED" count did not
  separately list. Routed the same way as the other two (survivor when
  `cityStay && instructions`, otherwise `{ terminal:
  ACCESS_MATERIAL_NO_OWNING_STAY }`) and left unrestructured for the same
  reason — flagging it here so the later restructuring step covers all
  three sites, not just the two the survey named.

- `lib/extraction/canonical-accessory-routing.ts`, `routeDatedNoteEvidence`
  (the `actions.suppressPiece(note, "note evidence routed to canonical
  stay, activity, or travel records")` call). This is the 23rd
  `suppressCanonicalPiece` call site (reached through the injected
  `RoutingActions.suppressPiece`, not a literal call in
  `evidence-clustering.ts`) and the survey's reason-string example of
  NAMES_DESTINATION_ONLY ("names a destination... but no concrete
  surviving id"). Several segment-matching branches in the loop above it
  (`stayMention`, `uniqueLodgingContext`, `transportMention`,
  `uniqueMovementContext`) drop a note segment as "already represented"
  without ever recording which piece absorbed it — only two branches
  (`attachActivityDetail`, the direction-target attach) call `addAction`
  on a concrete target. Routed as `{ terminal:
  NOTE_CONTENT_REDISTRIBUTED_NO_SINGLE_SURVIVOR }` because no reliable
  concrete id or list is available without restructuring the segment loop
  to track absorbers per-segment — out of scope for Step 1. A later step
  could thread a `Set<CanonicalEvidencePiece>` of touched targets through
  that loop and turn this into a `{ survivors }` disposition instead.

- `lib/extraction/canonical-trip-assembly.ts:406` (now inside the
  `disposeCanonicalPiece(piece, { kind: "terminal", code:
  "PIECE_IDENTITY_COLLISION_REPAIR" })` call). Confirmed per work order
  Task B4: the survey already flagged this as "plausibly should be a
  merge" — `keeper.piece` is right there as the chosen survivor, but the
  code only marks the loser `outputEligible = false` and never transfers
  its `fieldSources`/`conflicts`/`observationIds` onto `keeper.piece` the
  way `mergeCanonicalPieceInto` would. Left terminal for this step per the
  work order's explicit instruction ("if so, RECORD it and leave it
  terminal for now").

- `lib/extraction/evidence-clustering.ts`, `suppressRepresentedTravelAndStayActivities`,
  the same-day-transport-match branch (`matches.length >= 1`, near the top
  of the function). `matches` can hold more than one transport row and the
  existing comment explicitly treats multiple matches as stronger evidence,
  not a tie — so this went through the new `{ kind: "survivors" }` list
  disposition rather than picking `matches[0]`. Noted here (not a defect,
  a design note) in case a future step wants a canonical rule for when a
  list disposition vs. a forced single winner is appropriate; this file now
  has three such sites (this one, `suppressRedundantTransportParents`, and
  the note-copy branch in `resolveUncommittedRepeatMentions`) and they were
  each decided independently rather than against a shared rule.

## Task B, Step 2 — B7 city-note content-loss fix (2026-08-04)

- `lib/extraction/evidence-clustering.ts`, `reconcileCardsAgainstCityNotes`'s
  `mergeCanonicalPieceInto({ source: piece, target: matchingNote })` branch
  (fires when an uncommitted repeat card matches an already-outputEligible
  note by title substring). `mergeCanonicalPieceInto` only merges
  bookkeeping (`observationIds`/`actions`/`fieldSources`/`conflicts`) —
  never a source's own `title`/`description` prose — onto the target. The
  merge only ever fires because the target note's OWN text already contains
  the card's title (that is the match condition), so today this does not
  lose content, but it also means any EXTRA detail the card's own
  description carried beyond the bare name is silently dropped at the
  merge, not copied and not excluded-with-disposition. Distinct from the
  defect fixed in this step (which was about the record vanishing
  entirely, not about an under-detailed survivor) — recorded per Standing
  rule 3, not fixed, since fixing it would mean teaching
  `mergeCanonicalPieceInto` to append prose for note targets specifically,
  a broader change than this step's scope.
- `lib/extraction/evidence-clustering.ts`, `canonicalCityForDate` /
  `canonicalCitiesForDate` (and now `rawCityForDate`, added this step) all
  resolve a place's date range from `arriveDate`/`leaveDate` ONLY —
  no fallback to `arrivalDate`/`departureDate`, unlike
  `mergeCanonicalCityNotes`'s own `places` construction three lines away
  (`arriveDate ?? arrivalDate`, `leaveDate ?? departureDate`) and unlike
  the `places` filter in `mergeCanonicalCityNotes` itself. If a source ever
  populates a place with only `arrivalDate`/`departureDate`, a demoted
  piece landing on such a leg still resolves no city even after this
  step's fix, and falls back to shipping as an orphaned standalone note
  (its own title, not folded into the city collection) rather than
  vanishing outright — visible but wrong, not silent. Left alone rather
  than widening `canonicalCityForDate`'s/`canonicalCitiesForDate`'s field
  fallback, since that changes behavior at their other call sites
  (`rerouteCrossCityNoteContent`, `resolveUncommittedRepeatMentions`,
  `createResearchedListQuestions`) beyond this step's stated blast radius.

## Task B, Step 2 (continued) — B7.1, the R2D2 restore-loop gap (2026-08-04)

- **The Step 2 fix above did not move R2D2.** The measured pinned-parse R2D2
  record carries an explicit `city: "Prague"` from the model, so
  `demoteCanonicalPieceToCityNote`'s "no city" branch never runs for it —
  this was the FIRST wrong guess this bug attracted (the B7 test's own
  "negative control" case already confirmed the explicit-city shape
  "already worked" before B7.1 existed). The real gap: the integrity
  check's restore loop in `mergeCanonicalCityNotes` only records a rescue
  when a note's description-derived candidate matches "already rendered",
  "already excluded with a disposition", or gets freshly restored. A note
  whose OWN description sanitizes/splits down to nothing (verified
  mechanism: `sanitizeCityNoteText` strips an 8+ digit run to empty; the
  live trigger on the actual pinned R2D2 record was not independently
  reproduced from this trimmed working copy — several files upstream of
  `evidence-clustering.ts`, e.g. `lib/trip-categories.ts`, do not exist
  here) never produces a candidate the classifier sees at all, so it
  carries neither content nor a disposition. Fixed by adding a title
  fallback to the SAME loop (never a parallel check) — see
  `lib/extraction/evidence-clustering.ts`, the "B7.1" comment above
  `mergeCanonicalCityNotes`'s restore loop, and
  `tests/city-note-demotion-preserves-city.test.ts`'s third case.
- **Recorded, not fixed:** the front-door render (`cityNoteCollectionSections`)
  and the restore loop now implement the SAME safety/section classification
  twice — once via `routeEntry` (front door, with its own
  cost/access/booking bucketing) and once via the new `tryCandidate`
  closure (restore, extended for B7.1). They cannot trivially share one
  implementation because the front door additionally buckets excluded
  entries by TYPE (`excludedAccess`/`excludedBooking`/`excludedCosts`) for
  the collection-level disposition actions, which `tryCandidate` does not
  need. This is the same class of risk named in the Task C section above
  (one concept, two maintained copies) — flagged for the eventual file
  split (work order §6, "NOT fixed here") rather than folded into this
  step, since unifying them is a bigger change than "extend the existing
  check."
- Separately, `lib/extraction/canonical-evidence-resolver.ts:433`'s private
  hedge regex omitting `far away` (work order Task C1) is still open as of
  this step — R2D2's OWN demotion in the measured run went through
  `demoteHedgedSingleUncommittedMentions`, which reads
  `pieceHasHedgeMarker` → `classifyDraftActivityCard` (the SHARED,
  correct vocabulary), not the resolver's narrower copy, so this step did
  not depend on C1 and did not touch it. Left for Task C as scoped.
