# Roamwoven Product Contracts

Ledger version: 8

Ledger date: 2026-07-16

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
  warnings no longer block the publish route; only missing structured records
  remain a technical publishing failure. Canonical identity defects now run
  through one deterministic artifact-backed repair and recompile pass before a
  named technical recovery state. The first-run extraction route now reconciles
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
- Decision date: `2026-07-15`
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
- Evidence: Finalization now records and revalidates a versioned canonical
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
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: A continuous source-authored walking route becomes one parent card
  with ordered sub-stops when no stop has an independent booking or fixed time.
  Same-site clusters become one parent visit with sub-stops. Independently
  timed, ticketed, reserved, permitted, or separately booked stops remain
  standalone. Inconclusive relationships remain separate. Grouping cannot
  swallow unresolved source decisions. A Call is created when Roamwoven's
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
- Evidence: The latest live resolver run predates this checkpoint and inverted
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
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`, `tests/generated-trip-model.test.ts`

## RW-CLS-001 — Source intent determines Activity versus City Note

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Classification follows source-supported traveler intent and source
  structure, not venue type, public venue knowledge, an arbitrary activity cap,
  or a nearby date alone. A booking, reservation, ticket, itinerary slot, time or
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
- Evidence: The canonical resolver carries source hierarchy and role decisions,
  and regression coverage protects explicit city-reference sections. The live
  Central Europe run still duplicated Borkonyha, polluted Rome notes, and
  overproduced activities, so the full production path does not yet enforce the
  rule.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/canonical-evidence-resolver.test.ts`

## RW-EVD-001 — Every meaningful source block receives an explicit disposition

- Status: `LOCKED`
- Decision date: `2026-07-15`
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
  lineage rather than a fabricated traveler card. Any future enrichment is a
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
  persisted observations, and quarantines an irreconcilable observation graph in
  the named technical recovery state. Audit surfaces dispositioned versus
  undisposed counts and raises a P0 diagnostic for a gap. Remaining coverage is
  reconciliation from every raw meaningful source block to an extracted
  observation; the current invariant begins at the observation boundary.
- Tests: `tests/canonical-factory-boundary.test.ts`,
  `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/extraction-route-recovery.test.ts`,
  `tests/trip-quality-gate.test.ts`

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
- Decision date: `2026-07-15`
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
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Clearly sensitive details default protected without a user Question.
  Exact lodging and private-residence addresses, access codes, private contacts,
  stay/travel booking-control identifiers, credentials, and personal safety
  details cannot leak into public activity, note, transport, or stay prose. The
  final traveler projection revalidates privacy after every merge.
- Evidence: Privacy-policy and published-redaction tests pass, but the latest live
  run leaked stay address/category text into Rome city notes and retained
  lockbox/access content in a note.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/generated-trip-model.test.ts`, `tests/published-snapshots.test.ts`

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
- Enforcement: `ENFORCED`
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
  A broken identity join on
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
- Evidence: Repository preflight now requires route-outcome tracing for new
  validators and terminal paths. Canonical evidence is preflighted before its
  database uniqueness boundary, exact duplicates are repaired before
  persistence, and conflicting identities enter the named recovery state.
  Canonical assembly records `started` before validation and `completed` only
  after repair, finalization, and structured compilation succeed;
  unrecoverable identity conflicts cannot save a draft snapshot. Semantic audit
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

## Ledger maintenance criteria

- CEO-approved decisions are recorded as locked contracts.
- The repository preflight points to this ledger.
- Historical documents clearly yield to this ledger when they conflict.
- Every contract has an honest enforcement state and test/evidence mapping.
- The existing runtime test suite stays green.
- Enforcement states and evidence are updated in the same change as material
  runtime behavior.
