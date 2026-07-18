# Roamwoven Product Contracts

Ledger version: 13

Ledger date: 2026-07-18 (wave-2 parser pass)

Approval state: Approved and implementation-tracked

This is the authoritative ledger for current Roamwoven ingestion, extraction,
canonical assembly, review, privacy, and publication behavior. It consolidates
the newest explicit decisions. Older architecture documents, backlogs,
handoffs, code, and tests remain useful evidence, but they do not override a
newer locked contract.

## How to use this ledger

- `LOCKED` is an approved product invariant. Do not reopen it without a genuine
  conflict or a newer explicit user decision.
- `OPEN` is a product decision that still requires CEO direction.
- `SUPERSEDED` preserves history but is no longer authoritative.
- `ENFORCED` means meaningful behavioral coverage exists.
- `PARTIAL` means coverage exists but misses an important live path.
- `KNOWN_GAP` means the current implementation violates the contract.
- `NOT_APPLICABLE` is reserved for open governance decisions with no behavior to
  enforce yet.

Every locked contract must name its enforcement state and evidence. A green
unit test is not enough when the real resolver, compiler, or fresh extraction
path is bypassed.

## Decision precedence

1. The newest explicit user-approved decision in the active work.
2. The newest dated `LOCKED` contract in this ledger.
3. Newer decision records and handoffs where this ledger is silent.
4. Older architecture and backlog documents where newer sources are silent.
5. Current code and tests as implementation evidence, never implicit product
   authority.

## RW-GOV-001 — Newer approved decisions are authoritative

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `ENFORCED`
- Contract: When product records conflict, the newest explicit user-approved
  decision wins. Locked decisions may be changed only by recording the newer
  decision and its coverage impact; they are not silently averaged with older
  guidance.
- Evidence: `AGENTS.md`, this ledger's decision-precedence section.
- Tests: `tests/product-contracts.test.ts`

## RW-ING-001 — Accepted material cannot be silently ignored

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `ENFORCED`
- Contract: If Roamwoven accepts a source file, it must extract usable material
  from it or clearly tell the maker that the named file was not included.
  Automatic retries and safe fallbacks come first. One unreadable file must not
  kill a trip when other usable material exists. If no supplied material is
  usable, show a calm recovery state rather than pretending a draft is complete.
- Evidence: Upload acceptance and extraction readiness now share one capability
  registry. Each material checkpoint is rendered as a named maker receipt; a
  failed visual source is fail-soft when another usable material exists, while
  a trip with no usable material remains in recovery.
- Tests: `tests/material-capabilities.test.ts`,
  `tests/material-extractions.test.ts`,
  `tests/document-material-parser.test.ts`,
  `tests/material-ingestion-pipeline.test.ts`

## RW-ING-002 — V1 supports common intelligent-itinerary formats

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `ENFORCED`
- Contract: V1 first-class inputs are files dropped into Roamwoven plus pasted
  notes: TXT, CSV, PDF, JPEG, PNG, WebP, DOCX, and XLSX, including XLSX files
  exported from Google Sheets. V1 does not ingest live Google Sheets links or
  other internet-published documents. DOCX extraction preserves ordered final
  visible text, headings, lists, tables, hyperlinks, inserted revisions,
  anchored comments as source notes, and bounded embedded-image OCR; deleted
  revisions are ignored. XLSX extraction preserves visible sheet order, visible
  rows and columns, cell order and addresses, dates, merged-cell cues,
  hyperlinks, comments, cached formula display results, and bounded
  embedded-image OCR. Hidden sheets, rows, and columns are ignored. CSV is one
  structured sheet. Roamwoven never executes macros or formulas and never
  fetches external workbook or document content. Legacy `.doc`/`.xls`, `.xlsm`,
  encrypted/password-protected Office files, corrupt archives, and unsafe
  archives are clearly rejected or receipted.
- Evidence: One file capability registry owns upload acceptance and initial
  extraction eligibility. DOCX, XLSX, and CSV parsers perform archive preflight,
  structured text recovery, safe embedded-image OCR, and checkpoint receipts.
- Tests: `tests/material-capabilities.test.ts`,
  `tests/document-material-parser.test.ts`,
  `tests/material-extractions.test.ts`,
  `tests/material-ingestion-pipeline.test.ts`

## RW-QA-001 — Semantic QA is fail-soft

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Once usable source material exists, content-quality findings do not
  kill the run or prevent publishing. Roamwoven attempts deterministic repair,
  applies a safe evidence-preserving fallback, and surfaces one material
  Question only when the user genuinely needs to decide. A less-than-perfect
  Question is preferable to a dead usable run. An abnormal number of Questions
  or an activity/card count inconsistent with the canonical source entities
  triggers an internal repair and deduplication pass rather than dumping the
  problem on the maker. Internal diagnostics, warning counts, audit notices, and
  readiness derive from one assessment: an audit surface may never report "No
  audit notices" while that same report contains P0/P1 diagnostics or hard
  warnings. An audit diagnostic is a candidate finding until independently
  reconciled against source evidence, canonical entities, and final records;
  an unproven detector claim cannot authorize a mutation. Technical inability
  to recover any usable source is a recovery state, not semantic QA.
- Evidence: Quality assessment version 2 is the shared authority for P0/P1/P2
  diagnostics, hard and quiet warnings, open Questions, processing disposition,
  stored quality metadata, and top-level audit notices. Semantic Questions and
  warnings no longer block the publish route. Once usable parser output exists,
  conflicting canonical identities are deterministically re-keyed, exact
  duplicates are collapsed, and missing observation artifacts are reconstructed
  from canonical ownership before persistence. These internal defects cannot
  discard the draft or create a maker Question. The first-run extraction route now reconciles
  serious audit candidates, requests at most one idempotent retry from the
  canonical output-invariant owner, and re-audits before any draft is persisted.
  The audit layer never edits semantic output. Unrepaired findings remain an
  explicit conservative review state rather than being hidden or killing an
  otherwise usable run.
- Tests: `tests/trip-quality-gate.test.ts`,
  `tests/trip-publish-policy.test.ts`, `tests/generated-trip-model.test.ts`,
  `tests/extraction-route-recovery.test.ts`,
  `tests/trip-quality-outcomes.test.ts`

## RW-CAN-001 — Canonical finalization is the semantic boundary

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Supersession: the commitment rule of evidence (approved Central Europe
  ground truth v2) narrows repeat-occurrence evidence. Distinct dates alone
  are no longer affirmative evidence of separate planned occurrences. A
  mention is committed when it carries an explicit time, a
  booking/confirmation, explicit planned language, or is hedge-free inside a
  sequenced day (three or more explicitly timed activities). Repeats with at
  least one committed copy keep the committed copies (multiple committed
  copies are a genuine planned double visit) and silently absorb loose
  copies; repeats where NO copy is committed become ONE City Note with no
  cards and no Question.
- Enforcement: `PARTIAL`
- Contract: Evidence observations become canonical candidate entities. After
  canonical validation and resolution, finalized canonical entities are
  immutable inputs to structured compilation. Compilation preserves canonical
  identity, count, type, name, dates, relationships, and review status and may
  not create a new semantic decision. Structured records, grouping relations,
  Calls, Questions, private details, maker decisions, and audit lineage refer to
  canonical IDs and declared fields rather than titles, fuzzy similarity, or
  parallel array positions. Identity represents one planned occurrence: repeated
  mentions collapse by default, while separate occurrences require affirmative
  evidence such as distinct dates, bookings, times, or explicit repeat-visit
  language. A strong planned occurrence plus a loose mention remains one
  Activity, never an Activity plus a City Note. Two equally plausible dates
  without independent repeat-visit evidence remain one provisionally placed
  Activity with one precise single-choice date Question; they do not become two
  provisional cards. Correcting an occurrence's date moves the same entity. Maker-added
  entities receive canonical identity, and explicit maker edits or deletions
  survive a future rebuild while that subject survives. New identity versions
  apply to new builds and intentional rebuilds only; existing unpublished drafts
  are not migrated or rewritten. Rebuilds are staged and replace the current
  working draft only after the complete new canonical graph validates.
- Evidence: 2026-07-18 wave 2 (live-run 7.18.0: Mumok and Natural History
  emitted as two cards for one "Mumok or Natural history museum" source
  slot): when a day-section source line offers "X or Y" and the parser
  emitted the alternatives as separate same-day cards with NO or-carrying
  copy, deterministic parser-artifact normalization folds them into one
  "X or Y" card before clustering (the alternative is kept in the
  description and as context lineage); when an or-carrying copy exists, the
  wave-1.1 assembly collapse stays in charge. Enforced by
  `tests/parser-artifact-normalization.test.ts`.
  2026-07-18 wave 1.1 (live-run 7.18.1: "Prague Castle" carried a
  bled 12:00 time and slot collision merged the SITE into the timed
  "Changing of the Guard" EVENT, deleting the castle): sharing a day/time/
  category slot is only identity evidence when titles are related, one title
  is generic, or one text cross-references the other AND the pair is not a
  site-vs-event mismatch. Near-identical same-day descriptions collapse to
  one card, with the copy carrying an unresolved "X or Y" choice always
  winning the merge. Enforced by ground-truth run4 checks.
  Finalization now records and revalidates a versioned canonical
  identity manifest before compilation. Structured activities, legs, stays, and
  transport carry canonical identity directly; Questions and private details
  carry their canonical subject; projection invariants and audit lineage join by
  identity instead of array position or title/date matching. Structured snapshot
  version 2 requires the new identity fields. The extraction route now assembles
  from persisted evidence artifacts, repairs safe identity/manifest drift once,
  recompiles before completion, and records repair telemetry without creating a
  maker Question. First-class parent/child grouping now survives structured
  compilation and traveler projection without flattening child prose or
  inflating traveler-visible card counts. The remaining gap is reconciliation
  of maker-created entities and saved decisions across the future rebuild and
  merge/split lifecycle.
- Tests: `tests/assembly-purity.test.ts`,
  `tests/parser-artifact-normalization.test.ts`,
  `tests/canonical-identity.test.ts`,
  `tests/canonical-factory-boundary.test.ts`,
  `tests/extraction-route-recovery.test.ts`,
  `tests/structured-assembly-idempotency.test.ts`

## RW-SRC-001 — Source precedence is centralized

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Confirmed booking beats dated itinerary; dated itinerary beats
  undated planning note; undated planning note beats city reference. A lower
  authority source cannot overwrite a higher authority source. Equal-authority
  material contradictions produce one canonical Question only when both answers
  remain genuinely plausible. When precedence yields a winner, Roamwoven
  resolves it silently without a Question or preselected-answer theater.
  Question choices must come from source evidence or canonical records; prose
  may be polished, but options may not be invented. Explicitly labeled source
  updates, replacements, and cancellations supersede the earlier record by
  source chronology or source reference, never merely by upload order. A
  meaningful first-run replacement or cancellation creates one concise Call;
  typo and non-semantic metadata corrections are silent. If no source-backed
  supersession is clear, equal-authority alternatives remain one Question.
- Evidence: Canonical source-hierarchy tests pass, but the latest live run still
  misattached an explicit train ticket and created source-obvious Questions.
- Tests: `tests/canonical-factory-boundary.test.ts`,
  `tests/source-transport-anchors.test.ts`

## RW-GRP-001 — Routes and same-site visits preserve the traveler's mental model

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Supersession: the 2026-07-15 source-authored-only scope is superseded by the
  approved Central Europe ground truth v2
  (`docs/assembly-ground-truth-central-europe.md`), which adds
  system-discovered geo grouping. Doctrine v3 (2026-07-17 evening, CEO
  clarifications in `docs/assembly-defect-docket-2026-07-17.md`) narrows it
  further: classification precedes grouping (a City Note candidate can never
  be a group child); same-site visits form around a container-named site with
  parser-coordinate verification (~300 m) and keep the site's source title
  with timed sub-stops allowed; discovered walks require a crowded (>6
  visible cards) unsequenced (<3 timed stops) day, all stops within a
  15-minute walk by coordinates, a source-derived area label, at most one
  walk per day; a trip city or day-trip town name never groups; expect a
  handful of groups per trip; grouping call claims must state the actual rule
  that fired.
- Enforcement: `PARTIAL`
- Contract: A continuous source-authored walking route becomes one parent card
  with ordered sub-stops when no stop has an independent booking or fixed time.
  Same-site clusters become one parent visit with sub-stops. In addition,
  Roamwoven may discover a route grouping the source did not author: three or
  more adjacent-in-source untimed selected sights that pass a geographic
  proximity check become one parent card with ordered sub-stops and one
  statement-style Call explaining the grouping. Source adjacency alone is never
  sufficient — the proximity check must pass, and a mixed-geography list stays
  individual cards. Independently
  timed, ticketed, reserved, permitted, or separately booked stops remain
  standalone, unless the source places them inside one complex or campus visit
  (a timed sub-stop inside a same-site parent, such as a fixed guard-changing
  time within a castle visit, stays a child). Inconclusive relationships remain
  separate. Grouping cannot
  swallow unresolved source decisions. Day density (~6 visible cards) may
  trigger a search for grouping candidates under these same rules, but density
  never forces a group that the rules would not independently create. A Call is created when Roamwoven's
  grouping suppresses or parents records that appeared independently meaningful;
  no Call is needed when the source already presents one explicit route with
  subordinate stops. A grouped route counts as one activity card with its stop
  count shown separately, for example `1 activity card · 6 stops`; internal
  audit preserves all six source entities plus the grouping container without
  inflating the traveler-visible activity count. A valid system-created group
  has at least two named or traveler-meaningful stops, preserves source order,
  and uses a restrained source-derived title rather than a generic invention.
  A generic meal break may be a child of an otherwise valid route, but cannot
  make one real stop into a group. A separately timed or reserved stop breaks a
  route sequence. For a same-site visit, however, a booked or timed parent may
  own untimed subordinate stops when the source indicates that the parent
  booking covers the visit; an independently timed or booked child remains
  standalone. Parent cards keep concise parent prose and ordered child records;
  child prose is not concatenated into a wall of parent text. Picking up or
  activating a citywide card or pass is a standalone admin/logistics Activity
  and can never be grouping evidence for the sights it may cover. A pass tied to
  one site may support a same-site group only when the source explicitly says it
  covers that one continuous visit. Informational pass details without a planned
  pickup or activation task belong to their owning detail or evidence lineage,
  not a traveler card.
- Evidence: System-discovered geo grouping is now implemented: the parser
  emits an optional per-activity `area` hint (walkable district), and
  `createDeterministicAreaGroupingDecisions` groups three or more same-day
  untimed unbooked hedge-free sights sharing an area into one parent with
  ordered children and one statement-style Call, reusing the existing
  grouping executor. Covered by `tests/assembly-ground-truth.test.ts`
  (Malá Strana & Hradčany walk). A fresh live extraction with the new `area`
  field is still required before discovery quality is fully enforced.
  2026-07-17 evening (live-run 7.17.2): same-site membership now also comes
  from SOURCE HIERARCHY — a stop listed in the container's own description,
  or titled "<stop> at <Site>", joins the visit even without parser
  coordinates (7.17.2 grouped only 3 of Schönbrunn's 5 stops for lack of
  coords); call claims state which rule actually fired (geo radius, source
  listing, or both). A same-site container whose description lists its
  component stops is grouping structure and is exempt from
  covered-container context demotion (the 7.17.2 Prague Castle placeholder
  chain). The deterministic pass never re-groups candidates the resolver
  has already ruled on. Ground-truth checks `castle-same-site-group` and
  `schonbrunn-all-stops` enforce hierarchy membership. The
  2026-07-18 wave 2 (live runs 7.18.0/7.18.1: approxLatitude/approxLongitude
  appear ZERO times in either bundle — the model returns null despite the
  schema): the geo instruction was hardened to demand coordinates for every
  named landmark card ("a famous sight with null coordinates is an
  extraction defect") and is now repeated in every per-chunk input, not only
  the system prompt. Whether gpt-5.4-mini complies is only observable on the
  next fresh extraction; the doctrine v3 walk rule stays blocked until it
  does. The
  older gap: the pre-checkpoint live resolver run inverted
  negative Albertina evidence while failing to discover the Schoenbrunn
  grouping. The current first-run path now requires conclusive supplied source
  structure, preserves an explicit parent plus ordered child identities, keeps
  independent timed/booked stops standalone, suppresses Calls for explicit
  source-authored routes, and counts one traveler card separately from its
  stops. A fresh real extraction is still required before discovery quality can
  be called fully enforced.
- Tests: `tests/canonical-evidence-resolver.test.ts`,
  `tests/evidence-clustering.test.ts`, `tests/generated-trip-model.test.ts`,
  `tests/structured-assembly-idempotency.test.ts`

## RW-ASM-001 — One primary traveler-visible home per semantic entity

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: A semantic activity, stay, transport segment, private detail, or city
  reference has one primary traveler-visible home. A dated activity does not
  also survive as a city-tip recommendation; stay and transport evidence does
  not survive as duplicate activity cards; protected access details do not
  remain inside public notes. Broad source containers whose contents are covered
  by concrete children become context or a valid parent group, not an additional
  standalone card. Supporting text routes to a declared field on its owning
  entity when possible: arrival and check-in instructions belong to the stay or
  transport record, not a new Activity, City Note, Call, or Question. When the
  same place appears as both an Activity and City Note, the Activity wins; one
  unique useful detail may move to the Activity, while generic praise and list
  context are discarded. The scheduled place is removed from the City Note at
  the smallest useful list or segment boundary, so Activity and City Notes never
  overlap. First-run assembly never mutates an existing draft or
  published snapshot; these rules apply to newly assembled drafts only.
- Evidence: Several deterministic cleanup tests pass, but the latest live run
  duplicated Borkonyha across activity and city notes, leaked stay/accessory
  content into Rome notes, and preserved day-container bloat. New builds now
  preserve explicit City Note list entries as hidden canonical pieces, route
  each entry once, and merge only surviving entries into the visible city
  collection; a fresh live extraction is still required to verify the boundary.
  2026-07-17 evening (live-run 7.17.2 PB-2): bare-stay-name shadow matching
  now keeps venue-type words as meaningful tokens and bans reduction to a
  shared city token — "Prague Castle" can never again be suppressed as a
  "Prague Airbnb" lodging shadow ("castle" was a matching stopword). A bag
  drop at a same-date transport's own arrival time folds into the stay
  (ground truth v2: Jan 13 ships 4 cards); an arrival-time-distinct luggage
  movement still stays visible. Same-day alias containment survives a
  trailing generic word ("Chain Bridge walk" folds into the timed
  "Szechenyi Chain Bridge" crossing), meal-prefix phrasing no longer defeats
  venue repeat detection ("Breakfast at Cafe Central" ≡ "Cafe Central"), and
  place-fragment shards ("Prague Downtown", 9:00, "Return") are absorbed by
  the real card sharing their exact slot. Enforced by ground-truth checks
  `castle-survives-stay-shadow`, `dropbags-folds-into-stay`,
  `chain-bridge-single-card`, `cafe-central-planned-wins`.
  2026-07-17 wave 1 (live-run 7.18.0): transport-shadow suppression gained a
  date-agnostic ticket-copy fallback (exact clock time + route identity, or a
  shared booking code, against ANY canonical segment — the parser re-emitted
  the RegioJet and OeBB tickets as Jan 24 cards carrying booking codes);
  check-in matching uses stay alias tokens and tolerates duplicate stay rows;
  lodging-role words ("stay", "arrival") are structural stopwords so "Vitae
  Hostel stay" folds; the routine check-in gate reads the TITLE and requires
  every distinctive title token to be lodging/city vocabulary (Albertina was
  destroyed by a description that merely mentioned the day's check-in); a
  credential-bearing card is stay material even when timed. Each cross-date
  ticket fold produces one statement-style call (Eli-approved) so the maker
  sees what merged. Enforced by ground-truth run3 checks.
  2026-07-18 wave 2: deterministic parser-artifact normalization now demotes
  ticket-page transport re-emissions to accessory evidence at the parser
  boundary (booking_detail/ticket-code activity shapes from live-run 7.18.0
  Jan 24), clears degenerate time pairs (endTime equal to startTime; bare
  opening-hours endTimes on browse-a-place sightseeing cards), strips
  provider text-bleed layout tokens ("PM Delta", "Home Delta"), and scrubs a
  carrier from a transport title/provider when that carrier appears nowhere
  in the chunk's own source text (live-run 7.18.1: Ryanair FR8331 mislabeled
  "Delta flight FR8331"). Every repair is recorded in extraction usage and
  counted in the audit canonicalization summary. Enforced by
  `tests/parser-artifact-normalization.test.ts`.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`, `tests/generated-trip-model.test.ts`,
  `tests/assembly-ground-truth.test.ts`,
  `tests/parser-artifact-normalization.test.ts`

## RW-TRV-001 — Travel cards are per-segment and cover every night

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Enforcement: `PARTIAL`
- Contract: A travel card is a subset of activity cards covering one individual
  flight, train, ferry, or bus segment that makes an inter-city transfer and
  changes where the traveler sleeps. One card per segment; connections are
  never merged into a single card (a two-flight connection is two travel
  cards). The travel-card treatment exists so protected booking details blur
  cleanly. A same-day round trip that returns to the same stay — such as a
  rental car picked up and returned at one location — is a timed Activity, not
  a travel card. Airport-prep lines ("leave for airport", "wake for flight")
  attach to their travel card as prep notes, never as separate activities.
  Every trip night is covered by exactly one of: a stay or an overnight travel
  card with a next-day arrival. Stays span check-in to check-out and are not
  required to span their whole leg; Roamwoven never fabricates a stay for a
  night spent in transit.
- Evidence: Specified in the approved Central Europe ground truth v2
  (`docs/assembly-ground-truth-central-europe.md`): 8 travel cards including
  split Delta connections on Jan 12 and Jan 25, the Jan 17 rental car as a
  timed Activity, and the un-lodged Jan 12 night covered by the overnight
  Delta 444 card. The ground-truth fixture now asserts all of these against
  the real clustering + compilation path and passes. Enforcement stays
  `PARTIAL` (upgraded from `KNOWN_GAP` on 2026-07-17) until a fresh live
  extraction of the Central Europe PDF confirms the per-segment split
  end to end. 2026-07-17 wave 1 (live-run 7.18.0 P0: three Prague Airbnb
  stay rows, one public, from conflicting chunk checkouts plus a Costs
  day-price line): stay identity is venue+leg — a checkout disagreement
  between same-venue records is a field conflict reconciled against the leg
  departure boundary (else the later checkout), never a second stay; a
  generic-name stay fragment with no address, booking, or checkout whose
  night is covered by a surviving same-city stay is absorbed as cost/context
  residue; internal date-suffix disambiguators never survive in stay names.
  Enforced by ground-truth run3 checks.
- Tests: `tests/assembly-ground-truth.test.ts`,
  `tests/source-transport-anchors.test.ts`

## RW-CLS-001 — Source intent determines Activity versus City Note

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Supersession: doubt-marker, meal-slot, and density-trigger clarifications
  added per the approved Central Europe ground truth v2 on 2026-07-17.
- Enforcement: `PARTIAL`
- Contract: Classification follows source-supported traveler intent and source
  structure, not venue type, public venue knowledge, an arbitrary activity cap,
  or a nearby date alone. A source doubt marker on a listed item — a
  parenthetical hedge such as `(far away)`, `maybe`, or a trailing `?` — is
  source intent evidence and demotes that item to City Notes silently, without
  a Question. A single mention anchored to a meal slot (such as `breakfast`)
  with no options language is an untimed Activity with implicit time-of-day
  ordering. Day density (~6 visible cards) is a soft trigger that prompts
  re-evaluation of grouping and doubt-marker demotion candidates; density by
  itself never reclassifies an entity, forces a collapse, or invents a group,
  and a dense day with no qualifying candidates ships at full size. A booking, reservation, ticket, itinerary slot, time or
  meal slot, or explicit planned stop supports Activity. A source-authored city
  reference, recommendation, category list, optional list, or background note
  belongs in City Notes using the existing City Notes taxonomy and presentation;
  no catch-all category or new taxonomy is created. A dated category-only list
  such as several restaurants under a day remains City Notes unless the source
  selects, sequences, books, or assigns a slot to an entry. A stronger planned
  sighting gives the entity one Activity home and removes its City Note duplicate.
  Missing or disputed dates never change an entity's type. A named restaurant,
  reservation, fixed meal time, or named meal presented as its own stop is an
  Activity; the same restaurant inside a recommendation list is a City Note. A
  generic meal embedded in another activity is supporting detail, not a new
  card. An isolated untimed generic meal with no valid group context is omitted
  from the app with retained lineage. `If time: X` is a City Note, while a fixed
  itinerary slot such as `Morning: X or Y` is one Activity with one unresolved
  choice. Explicit commitment such as `We definitely want to visit X` is an
  Activity even when its date is missing. A loose ideas list after the itinerary
  remains City Notes.

  2026-07-17 evening additions (Eli-approved): (1) Commitment language is
  narrowed to first-person intent, booking language, a time, or a
  confirmation — bare sight verbs ("visit", "explore", "stroll") are parser
  phrasing, never commitment evidence (defect docket commitment-language
  fix; live runs kept Museum of Communism and Pinball Museum on that
  phrasing alone). (2) Card/note reconciliation: an uncommitted, anchor-less
  dated card whose venue also sits in a same-city note list is "repeated but
  never committed" — the note copy is the single home and the card folds
  away; a committed card removes its duplicate note-list entry. (3) City
  Note presentation: one City Note per city, rendered in the approved
  universal sections — Food, Drinks & Nightlife, Sights & Culture, Shopping,
  Getting Around, Local Tips, Notes (fallback; nothing is ever dropped for
  not fitting). Splitting a section later is additive; merging breaks
  fixtures. (4) Costs/budget planning content ("Budget notes: $1200 total")
  is excluded from traveler notes with a recorded disposition — the Costs
  exclusion applies to note TEXT, not only to activity records.
- Evidence: 2026-07-17 evening pass: `PLANNED_ACTIVITY_PATTERN` narrowed in
  `lib/trip-card-taxonomy.ts`; `reconcileCardsAgainstCityNotes` runs before
  accessory routing so notes are matched intact; city-note sections +
  costs scrub live in the note-collection builder. Ground-truth checks
  `budapest-note-copies-win`, `budget-scrubbed-from-notes`,
  `city-note-sections`, `cafe-central-planned-wins` enforce the additions.
  2026-07-17 wave 1 (live-run 7.18.0): city-note collections gained an
  integrity check — every routed note's content must land in the rendered
  note or carry an explicit exclusion disposition, otherwise it is restored
  into its classified section with a recovery action (Mistral Cafe, Cafe
  Louvre, Malostranska Beseda, Country Life, and Pontoon were routed in and
  silently lost); prose segmentation never splits after a title
  abbreviation ("St. Stephen's" cannot become an orphaned "St."); a named
  multi-topic tips/ideas note that merely mentions another leg's entity
  keeps its city home instead of being wholesale rerouted (the Budapest
  public-transport tip was killed this way). Enforced by ground-truth run3
  checks. 2026-07-18 wave 1.1 (live-run 7.18.1: the parser emitted the Vienna
  venues both as day-section activities and as a notes-blob reference list;
  merged blob copies made every card look same-section and the note-copy rule
  gutted the whole Vienna leg): the shared-section veto now compares note
  copies against the card's DAY-PLAN section labels only. Enforced by
  ground-truth run4 checks (`tests/assembly-ground-truth-run4.test.ts`).
  2026-07-18 wave 2 (live-run 7.18.1: "We Explore Budapest" and
  "Walking tour / Jewish History / Old Town free time" shipped as day-title
  activity cards; "Vienna lodging note / $72 (private room—ensuite)" shipped
  as a cost card): the parser prompt gained explicit day-title,
  reference-list, and cost-line rules, and deterministic parser-artifact
  normalization demotes a card whose title IS the day heading's non-date
  remainder (a venue named inside a multi-part heading survives — "Prague
  Castle" under "Lesser Town & Prague Castle") and a card whose text is a
  pure lodging/price fragment. Enforced by
  `tests/parser-artifact-normalization.test.ts` and
  `tests/openai-trip-parser-prompt.test.ts`.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/canonical-evidence-resolver.test.ts`,
  `tests/assembly-ground-truth.test.ts`,
  `tests/parser-artifact-normalization.test.ts`

## RW-EVD-001 — Every meaningful source block receives an explicit disposition

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Supersession: on 2026-07-17 the CEO relaxed the lookup posture — bounded,
  budgeted public lookups are acceptable when they materially improve the
  generated app ("the default is a magical experience"). V1 still keeps the
  assembly pass deterministic by sourcing geographic hints from the parser
  call itself (per-activity `area`, `approxLatitude`, `approxLongitude`); a
  live lookup lane for unresolved terms is permitted as a follow-up and
  remains subject to the caps below. Also 2026-07-17: source-truth
  verification is live — each model observation is checked against its
  producing chunk's source text; records with zero distinctive-title support
  are suppressed to evidence-only lineage silently (CEO decision), and
  confirmation codes absent from source text are scrubbed.
- Enforcement: `PARTIAL`
- Contract: Source text is not forced into Activity or City Notes. Every
  meaningful evidence block is traceably routed to one of: canonical entity,
  declared detail on an owning entity, maker decision, evidence-only lineage, or
  sensitive redaction. Evidence-only omission from the generated app requires a
  recorded reason such as exact duplication, clearly superseded or cancelled
  content, document plumbing, unrelated boilerplate or marketing, broken OCR,
  irrelevant content, or unresolved meaning after bounded recovery. A
  low-confidence fact that could materially change the itinerary cannot be
  silently omitted. Public lookup and description enrichment are outside the
  first-run assembly pass. An uncertain isolated public term may receive an
  internal `needs_identity_enrichment` disposition, but remains evidence-only
  lineage rather than a fabricated traveler card. When the source itself
  commits an uncertain term — sequencing it, timing it, or planning around it
  (2026-07-17 `koscom` precedent in the approved Central Europe ground truth) —
  the term is an Activity on source evidence alone; enrichment may later
  identify it, but placement, date, and intent always come from the source,
  never from lookup results. Any future enrichment is a
  separate post-assembly step limited to one or two concise, sourced factual
  lines and may never change intent, type, date, grouping, booking state, or
  private facts. When deterministic source-block coverage proves that meaningful
  source text never became an observation, Roamwoven may run at most one
  excerpt-only, batched model recovery call for that build. The call has hard
  input and output caps, records its usage separately, never retries itself, and
  cannot be triggered by audit disagreement, grouping, classification, card
  density, or presentation warnings. If it fails, the usable draft survives and
  one precise maker Question is allowed only when a maker answer can actually
  repair the declared field.
- Evidence: Every extracted evidence observation now receives exactly one
  persisted disposition. The validated assembly boundary deterministically
  rebuilds a missing manifest, re-materializes repaired dispositions onto the
  persisted observations, and reconstructs a missing observation artifact from
  its canonical owner with explicit recovery provenance. Audit surfaces dispositioned versus
  undisposed counts and raises a P0 diagnostic for a gap. Remaining coverage is
  reconciliation from every raw meaningful source block to an extracted
  observation; the current invariant begins at the observation boundary.
  2026-07-17 evening (live-run 7.17.2 PB-3): undated activity pieces resolve
  their day from SOURCE STRUCTURE before any leg fallback —
  `lib/extraction/canonical-placement-policy.ts` (extracted stage, own unit
  tests) reads a parseable date from the piece's section label/heading path,
  then inherits the nearest dated neighbor from the same source section,
  bounded to the trip window and the piece's own city leg. Intake structural
  dating also accepts "unknown"-typed sections (the parser tagged the Kutná
  Hora day-trip lines unknown, stranding Silver mines and Koscom undated on
  a leg-guess with fabricated date questions). Leg-guess placement plus a
  date question is now the genuine last resort. Ground-truth checks
  `koscom-activity` and `silver-mines-placement` enforce this from the
  live-run shape (undated + section label).
  2026-07-18 wave 2 (live runs 7.18.0/7.18.1 each silently dropped
  day-section lines the other run extracted — koscom, "maybe communism
  museum", Tour Rome, Szechenyi Baths): deterministic day-section source
  coverage now exists (`lib/extraction/source-coverage.ts`) — every
  meaningful line under a dated day heading is checked for token coverage in
  its chunk's extracted output, uncovered lines are recorded in extraction
  usage with bounded excerpts, coverage counts ship in the audit extraction
  summary and QA bundle, and a gap raises the quiet P2 advisory
  `day_section_source_line_unextracted` (candidate finding per RW-QA-001 /
  RW-AUD-001 — it never authorizes a mutation and never creates a maker
  Question). The parser prompt gained a line-coverage rule naming the
  dropped-line shapes. The contract's bounded excerpt-only model recovery
  call is NOT yet implemented; the coverage diagnostic is its required
  deterministic trigger evidence when that lane is built.
- Tests: `tests/canonical-factory-boundary.test.ts`,
  `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/extraction-route-recovery.test.ts`,
  `tests/trip-quality-gate.test.ts`,
  `tests/source-coverage.test.ts`

## RW-PLC-001 — Unresolved placement preserves a coherent Today experience

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Today remains the traveler app's home; Roamwoven does not create an
  inaccessible Unscheduled bucket. When a source-supported Activity has an
  unresolved date, the canonical resolver keeps it an Activity, assigns the
  best-supported provisional date, and creates one precise maker Question when
  needed. The maker sees concise wording such as "We placed this on June 16 for
  now" with optional source evidence; the traveler sees a coherent itinerary,
  not extraction uncertainty. Answering moves the same canonical Activity. It is
  never duplicated across candidate dates or demoted to City Notes merely to
  escape scheduling ambiguity. Placement first follows trustworthy source
  proximity; if none exists, it uses the first full day in the matching city,
  then the first city day as a fallback. A date answer is limited to the trip
  window and moves that same canonical Activity.
- Evidence: A committed undated Activity now receives a provisional matching-city
  date, prefers the first full city day, and carries one bounded date Question
  that moves the same canonical record. The remaining gap is a deterministic
  placement fallback when the canonical trip spine itself has no usable place
  boundary.
- Tests: `tests/generated-trip-model.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/structured-assembly-idempotency.test.ts`

## RW-REV-001 — Calls explain; Questions request material decisions

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Calls are statement-style FYI explanations of non-obvious app-shaping
  decisions. Questions are only unresolved material user decisions whose answers
  change the generated app. Routine correct extraction, internal diagnostics,
  privacy defaults, source-obvious facts, and presentation mechanics are neither
  Calls nor Questions. Group equivalent uncertainty into one Question attached
  to the canonical subject. Question prose is schema-driven, concise, concrete,
  and nonredundant; an optional collapsed "Why we're asking" shows short source
  evidence rather than model reasoning or diagnostics. The existing review-page
  format and City Notes presentation remain in place; this assembly pass fixes
  semantics beneath them rather than redesigning their order or taxonomy.
  First-run Calls primarily explain Roamwoven-created groupings and meaningful
  source-authored replacements or cancellations. Multiple unresolved fields on
  one subject may share one compact review card, but each control remains a
  separate typed mutation that must succeed independently.
- Evidence: Prompt and regression coverage exists, but the latest live run
  produced source-obvious, duplicated, irrelevant, and mis-targeted Questions.
- Tests: `tests/openai-trip-parser-prompt.test.ts`,
  `tests/canonical-regressions.test.ts`, `tests/generated-trip-model.test.ts`

## RW-QUE-001 — Questions are typed, targeted, and answerable end to end

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Supersession: per the approved Central Europe ground truth v2, a fixed slot
  with alternatives (`Museum X or Museum Y`) no longer generates an automatic
  single-choice Question. It stays one flexible traveler card with the
  unresolved choice in its title/description; the maker can edit the card
  directly. The rest of this contract is unchanged, including the
  standalone generic timed-meal venue Question. A new deterministic Question
  IS generated for a researched-but-uncommitted list: two or more same-day
  untimed unbooked entries carrying prices/hours produce one "planned for
  this day, or just ideas?" single-choice Question.

  2026-07-17 evening additions (Eli-approved): (1) One venue complex, one
  open decision — same-day ticket/tour questions consolidate into ONE
  question rooted at the container-named subject; sub-stop uncertainty (St.
  Vitus "ticket or tour") folds into the castle's ticket question even
  before grouping parents them. This resolves the prior tension between
  "keep St. Vitus tour-vs-visit" and the one-castle-question CEO ruling in
  favor of folding. (2) Day-title slot rule: when a source DAY TITLE commits
  an activity slot ("… // Budapest Bathing") whose matching entries are all
  uncommitted options, one question asks which venue (ground truth v2
  question #3); stays never get item date questions; undated activities
  resolve their day from source structure before any leg-guess date
  question is allowed (see RW-EVD-001).
- Enforcement: `PARTIAL`
- Contract: Every emitted Question declares one canonical subject, one target
  field or explicit atomic mutation, source-backed answer options, and an
  end-to-end answer handler. Supported controls are yes/no, single choice,
  multi-select, date, time, and short free text. Single choice means exactly one
  mutually exclusive option; multi-select allows any number. `Another date` and
  `Another time` open typed pickers; a `Something else` escape hatch is allowed
  only when it opens a valid declared target. Free text is allowed only when the
  target is genuinely textual and must write to its declared field; it is never
  appended to generic description as a fallback. A fixed slot with alternatives,
  such as `Dinner: Borkonyha or Stand25`, is one planned slot with candidate
  choices and one single-choice Question, not two Activities or a City Note. A
  day decision is single choice, never multi-select: two or three source-backed
  candidate dates use buttons, otherwise a date picker constrained to the trip
  window. Natural-language date parsing is outside V1. If it is added later, it
  must parse and validate into the date field rather than append prose.

  A standalone generic timed meal keeps one lightweight Activity and asks
  whether a specific venue is already planned; a specific venue writes to the
  declared restaurant field, while `Somewhere nearby` keeps the generic meal.
  An unresolved fixed choice remains one flexible traveler-visible card such as
  `Museum X or Museum Y`; Roamwoven never invents one choice. Answering replaces
  that same canonical slot with the chosen option.

  An explicit maker answer is the highest authority for that draft and applies
  immediately to the intended canonical record; derived views recompute. An
  answer cannot mark a Question resolved unless its declared mutation succeeds.
  Directly editing the affected field resolves the same Question.
  The newest explicit answer remains active, with Change/Undo and immutable
  decision history. It persists only while the same canonical subject and field
  survive; it never transfers by title similarity, and it retires as stale when
  its target disappears or changes meaning. Unanswered Questions never block the
  draft. Each keeps a conservative provisional result, remains visible in the
  existing maker review, and may be resolved individually with Roamwoven's best
  judgment; that judgment is recalculated after a rebuild, and there is no batch
  best-judgment action. Maker-only affected-card highlighting may show the
  impact, while travelers never see the Question or marker. Published snapshots
  remain untouched.
- Evidence: Review records now carry explicit options and date bounds; first-run
  controls render exclusive choices, yes/no buttons, bounded date/time inputs,
  and declared free text. Exclusive choices reject invented answers, quick
  suggestions do not constrain valid text or picker responses, and a Question
  remains open unless its declared canonical mutation succeeds. Unsupported
  option shapes fail soft to an answerable text control rather than killing the
  run. Remaining gaps are true multi-select mutation, direct-edit co-resolution,
  affected-card highlighting, Change/Undo, and immutable answer history. Saved
  decisions still preserve only the current value.
- Tests: `tests/generated-trip-model.test.ts`,
  `tests/published-snapshots.test.ts`, `tests/structured-trip-snapshot.test.ts`

## RW-PRI-001 — Privacy defaults are automatic and final-projection safe

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Supersession: the 2026-07-15 scope is narrowed by Eli's explicit 2026-07-17
  evening decision: protection exists for *trip-sabotage surface* — things
  that house you or move you between cities. Protected: stay addresses,
  access/entry codes, Wi-Fi credentials, stay and inter-city travel booking
  identifiers, private contacts, personal safety details. Explicitly PUBLIC:
  activity/tour/restaurant booking references and confirmation codes, rental
  car reservations (recoverable failure — CEO ruling), in-city passes such as
  the Vienna Card. Personal identity data (traveler name, home address,
  email, phone) is not trip content at all — it is scrubbed from card prose
  as content hygiene, not gated behind privacy.
- Enforcement: `PARTIAL`
- Contract: Clearly sensitive details default protected without a user Question.
  Exact lodging and private-residence addresses, access codes, private contacts,
  stay/travel booking-control identifiers, credentials, and personal safety
  details cannot leak into public activity, note, transport, or stay prose.
  Lodging access instructions (lockbox steps, key pickup, buzzer/door codes,
  arrival directions) are STAY material: they attach to their stay or are
  suppressed — they never ship as traveler activity cards. The
  final traveler projection revalidates privacy after every merge.
- Evidence: 2026-07-17 evening pass added stay-access instruction routing
  (Vitae directions with public buzzer number, Rome key-pickup apartment
  instructions — both live-run 7.17.2 leaks) and the customer-identity
  scrub for card descriptions (7.17.2 rental car carried name + home
  address + email + phone in cleartext). Ground-truth checks
  `vitae-directions-fold` and `rome-key-pickup-suppressed` enforce the
  routing; the 45 leg-scoped generic privacy labels remain a known
  presentation gap. 2026-07-17 wave 1 (live-run 7.18.0 P0: a "Check in to
  AirBNB" activity card shipped the stay address, Wi-Fi password, and door
  code in cleartext): a protected-value scrub now runs at the output
  boundary — values sourced from canonical STAY and TRANSPORT records
  (addresses, access credentials, booking identifiers) are removed from all
  public activity/note prose, and credential-shaped sentences (Wi-Fi
  password / door code / lockbox / buzzer) are dropped whenever a stay
  record exists to own them. Activity/tour/restaurant booking references
  remain public per the narrowed scope. Ground-truth run3 checks enforce
  the live shapes (`tests/assembly-ground-truth-run3.test.ts`).
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/generated-trip-model.test.ts`, `tests/published-snapshots.test.ts`,
  `tests/assembly-ground-truth.test.ts`

## RW-PUB-001 — Published trip versions are immutable

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Extraction, assembly, review, and future fixes never mutate an
  already published traveler snapshot. Maker changes create a new draft and an
  explicit new published snapshot/version when the maker chooses to publish an
  update.
- Evidence: Published snapshots are transactionally created and traveler reads
  use the active published snapshot.
- Tests: `tests/published-snapshots.test.ts`,
  `tests/structured-trip-snapshot.test.ts`

## RW-AUD-001 — Audit findings require independent proof before action

- Status: `LOCKED`
- Decision date: `2026-07-16`
- Enforcement: `PARTIAL`
- Contract: An audit detector produces candidate findings, not truth. Before a
  P0, P1, or hard warning can authorize any output mutation, an independent
  reconciliation step checks the source evidence, canonical entity, and final
  record. Canonical ID is the primary join, but the verifier also uses typed
  semantic evidence such as entity kind, city, normalized date/time, route
  endpoints, booking locator, provider, venue identity, and source lineage so a
  detector cannot report a correct record as missing merely because one identity
  join failed. A semantic match with broken identity is reported as an identity
  defect, not as a missing traveler record.

  Every serious candidate is classified as exactly one of:
  `confirmed_output_defect`, `confirmed_audit_defect`,
  `confirmed_source_processing_failure`, or `genuine_maker_decision`. A
  confirmed audit defect fixes or reconciles the detector, leaves correct output
  untouched, creates no maker-visible Call, Question, or warning, and remains
  loud in internal telemetry until covered by a regression. A confirmed output
  defect cannot be relabeled as an audit incident to make the run appear ready.
  Detector tests include known-good controls plus metamorphic changes to IDs,
  array order, and non-semantic title formatting. The final audit report contains
  only reconciled findings; detector disagreements are preserved separately as
  internal incidents.
- Evidence: Canonical identity remains the primary join. The independent
  reconciliation layer accepts a unique exact booking locator by itself;
  otherwise it requires at least two compatible typed fields from normalized
  dates, times, endpoints, providers, venue identity, address, and entity type.
  2026-07-17: anchor-to-record matching gained a semantic fallback (one exact
  clock time + date + a route token), fixing the false "Budapest transport
  missing" P0, and a time-corruption tripwire
  (`transport_times_disagree_with_source_anchor`) now fires when a matched
  final row's times disagree with its source anchor — the Delta 5925 class of
  defect the detector previously missed.
  2026-07-17 evening (live-run 7.17.2 false P0, second consecutive class):
  source transport anchors now require minimum validity — a time, a
  digit-bearing transport number, or a full route — so ticket-PDF marketing
  boilerplate can no longer mint a `train-…-bitte` anchor with an ad-copy
  "Ticketcode" confirmation; digit-less scraped "numbers" are nulled; and
  the missing-transport diagnostic reconciles before raising: an anchor
  whose date already has a same-kind final transport row is an identity-join
  incident, never a missing-record P0. Audit views also now expose the
  parser's `approxLatitude`/`approxLongitude`/`area` fields — the 7.17.2
  audit was structurally blind to whether geo hints were emitted at all.
  2026-07-17 wave 1 (live-run 7.18.0 false P0, third consecutive class —
  a Costs-section route line, fabricated Jan 25 date): Costs/budget lines
  can no longer mint transport anchors; a weak anchor (no time, no
  transport number) never inherits the scan cursor's date and its date
  never disqualifies route reconciliation; a route-only unmatched anchor
  raises at most a P2, never a P0; and final travel rows with NO anchor
  coverage raise a quiet internal notice (7.18.0 shipped Ryanair FR8331
  with zero anchor coverage — source-truth verification was blind to that
  segment). A broken identity join on
  otherwise matching output becomes an internal detector incident and cannot
  create a missing-record diagnostic or mutate the traveler draft. Metamorphic
  tests cover activity, stay, and transport identity drift; array reordering;
  title punctuation; European dotted dates; unique and shared booking locators;
  and negative controls where the candidate is actually absent. Enforcement
  remains partial until every serious diagnostic family carries typed canonical
  identity rather than evidence prose.
- Tests: `tests/trip-audit-reconciliation.test.ts`,
  `tests/trip-quality-gate.test.ts`,
  `tests/extraction-route-recovery.test.ts`

## RW-OPS-001 — Detectors require a complete dark-factory outcome

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: A new ingestion, extraction, canonicalization, assembly, privacy,
  review, or publishing validator is not push-ready merely because it detects a
  defect. Its actual route-level behavior must map the defect to bounded
  deterministic repair, a retained last-good draft, a usable
  evidence-preserving fallback, or a named calm technical recovery state when
  no valid draft can exist. A processing stage is completed only after its
  persisted boundary validates. Successful backstage repair is recorded in
  internal events, usage, QA bundles, and audit notices without becoming a maker
  Question or exposing machinery in the premium customer experience. Each
  serious reconciled finding records its truth classification, affected
  canonical IDs, action, and before/after fingerprint. The route re-audits after
  repair and saves only an explicit terminal result: either a converged repaired
  draft or a usable conservative fallback whose remaining finding and single
  retry result stay visible in review state and internal telemetry. Repair is
  bounded and cannot repeatedly mutate the same draft. Every new terminal path
  requires behavioral route-level coverage before code is called safe to push.
  After the parser returns a usable draft and evidence pieces, canonical
  identity, manifest, and disposition defects are internal recovery work and
  cannot enter a technical recovery state or discard the draft.
- Evidence: Repository preflight now requires route-outcome tracing for new
  validators and terminal paths. Canonical evidence is preflighted before its
  database uniqueness boundary, exact duplicates are repaired before
  persistence. Evidence-cluster version 13 preserves synthetic collection
  identity, and conflicting identities are deterministically re-keyed with
  sanitized collision telemetry. Same-lineage or semantically identical
  conflicts remain in evidence-only lineage instead of becoming duplicate
  traveler cards.
  Canonical assembly records `started` before validation and `completed` only
  after repair, finalization, and structured compilation succeed. A usable
  parser result cannot be discarded for an identity, manifest, or disposition
  defect. Semantic audit
  candidates now have explicit truth classifications and before/after
  fingerprints; repaired output is rebuilt and re-audited, while detector
  incidents leave correct output untouched. Other existing pipeline validators
  have not yet received the same exhaustive route audit.
- Tests: `tests/extraction-route-recovery.test.ts`,
  `tests/canonical-identity.test.ts`, `tests/trip-quality-gate.test.ts`,
  `tests/trip-quality-outcomes.test.ts`,
  `tests/trip-audit-reconciliation.test.ts`

## RW-OPEN-001 — Question response controls in the assembly pass

- Status: `SUPERSEDED`
- Decision date: `2026-07-15`
- Enforcement: `KNOWN_GAP`
- Contract: This open decision was resolved in favor of end-to-end typed response
  controls and verified canonical mutations. `RW-QUE-001` is authoritative.
- Evidence: Superseded by the explicit Question-control decisions consolidated in
  `RW-QUE-001`; current runtime coverage remains incomplete.
- Tests: `tests/generated-trip-model.test.ts`

## RW-CNT-001 — One count definition across every maker surface

- Status: `LOCKED`
- Decision date: `2026-07-17`
- Enforcement: `ENFORCED`
- Contract: Travel cards are a subset of activity cards (Eli, 2026-07-17).
  The activity umbrella counts every top-level traveler-visible card —
  sights, meals, admin/logistics — excluding grouped child stops, city
  notes, and undated placeholders. "Plans" = top-level activity-umbrella
  cards PLUS travel cards; Transport is presented as a drill-down subset of
  Plans, not a disjoint bucket. The review page, summary page, extraction
  fingerprints, and QA bundle all compute counts with this one definition
  (live-run 7.18.0 showed 65 / 67 / 72 across three surfaces). Hard
  structural warnings render on the review page as well as the summary page
  (Eli, wave 1) so a maker working the queue sees collisions where they
  decide.
- Evidence: `getReviewActivityItems`, summary `plans`, and fingerprint
  `activeActivities` share the top-level-card rule; the review page renders
  summary hard warnings above the decision sections. 2026-07-18 wave 1.1:
  the audit `structured.activeActivities` count joined the shared rule (the
  last 68-vs-69 straggler in live run 7.18.1).
- Tests: `tests/assembly-ground-truth-run3.test.ts`,
  `tests/generated-trip-model.test.ts`

## Ledger maintenance criteria

- CEO-approved decisions are recorded as locked contracts.
- The repository preflight points to this ledger.
- Historical documents clearly yield to this ledger when they conflict.
- Every contract has an honest enforcement state and test/evidence mapping.
- The existing runtime test suite stays green.
- Enforcement states and evidence are updated in the same change as material
  runtime behavior.
