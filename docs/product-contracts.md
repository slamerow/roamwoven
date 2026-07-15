# Roamwoven Product Contracts

Ledger version: 4

Ledger date: 2026-07-15

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
  warnings. Technical inability to recover any usable source is a recovery
  state, not semantic QA.
- Evidence: Quality assessment version 2 is the shared authority for P0/P1/P2
  diagnostics, hard and quiet warnings, open Questions, processing disposition,
  stored quality metadata, and top-level audit notices. Semantic Questions and
  warnings no longer block the publish route; only missing structured records
  remain a technical publishing failure. The remaining gap is the automatic
  repair and deduplication pass for abnormal Question or canonical-card counts.
- Tests: `tests/trip-quality-gate.test.ts`,
  `tests/trip-publish-policy.test.ts`, `tests/generated-trip-model.test.ts`

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
  parallel array positions.
- Evidence: Canonical finalization, projection invariants, stable identity, and
  assembly-purity coverage exist. Review-subject mapping still reconstructs
  canonical-to-structured identity through matching array positions, and some
  downstream records do not yet carry canonical identity directly.
- Tests: `tests/assembly-purity.test.ts`,
  `tests/canonical-factory-boundary.test.ts`,
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
  may be polished, but options may not be invented.
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
  inflating the traveler-visible activity count.
- Evidence: Unit-level route and same-site coverage exists, but the latest live
  resolver inverted negative Albertina evidence and failed to discover the
  Schoenbrunn grouping. Current grouping also flattens children into parent prose
  instead of preserving a first-class ordered sub-stop relationship.
- Tests: `tests/canonical-evidence-resolver.test.ts`,
  `tests/evidence-clustering.test.ts`, `tests/generated-trip-model.test.ts`

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
  transport record, not a new Activity, City Note, Call, or Question.
- Evidence: Several deterministic cleanup tests pass, but the latest live run
  duplicated Borkonyha across activity and city notes, leaked stay/accessory
  content into Rome notes, and preserved day-container bloat.
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
  Missing or disputed dates never change an entity's type.
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
- Enforcement: `KNOWN_GAP`
- Contract: Source text is not forced into Activity or City Notes. Every
  meaningful evidence block is traceably routed to one of: canonical entity,
  declared detail on an owning entity, maker decision, evidence-only lineage, or
  sensitive redaction. Evidence-only omission from the generated app requires a
  recorded reason such as exact duplication, clearly superseded or cancelled
  content, document plumbing, unrelated boilerplate or marketing, broken OCR,
  irrelevant content, or unresolved meaning after bounded recovery. A
  low-confidence fact that could materially change the itinerary cannot be
  silently omitted. Bounded public lookup may resolve an isolated public term's
  identity, city, and existing City Notes category, but may never infer traveler
  intent, a trip date, or private facts. A still-ambiguous term remains lineage,
  not a fabricated traveler card.
- Evidence: Evidence artifacts and canonical lineage exist, but there is no
  exhaustive disposition contract proving every meaningful source block reached
  exactly one of these outcomes.
- Tests: `tests/evidence-artifacts.test.ts`,
  `tests/canonical-factory-boundary.test.ts`,
  `tests/canonical-regressions.test.ts`

## RW-PLC-001 — Unresolved placement preserves a coherent Today experience

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `KNOWN_GAP`
- Contract: Today remains the traveler app's home; Roamwoven does not create an
  inaccessible Unscheduled bucket. When a source-supported Activity has an
  unresolved date, the canonical resolver keeps it an Activity, assigns the
  best-supported provisional date, and creates one precise maker Question when
  needed. The maker sees concise wording such as "We placed this on June 16 for
  now" with optional source evidence; the traveler sees a coherent itinerary,
  not extraction uncertainty. Answering moves the same canonical Activity. It is
  never duplicated across candidate dates or demoted to City Notes merely to
  escape scheduling ambiguity.
- Evidence: Current compilation can leave an Activity undated and mark it for
  review; it does not yet guarantee a provisional Today placement tied to one
  answerable canonical Question.
- Tests: `tests/generated-trip-model.test.ts`,
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
- Evidence: Prompt and regression coverage exists, but the latest live run
  produced source-obvious, duplicated, irrelevant, and mis-targeted Questions.
- Tests: `tests/openai-trip-parser-prompt.test.ts`,
  `tests/canonical-regressions.test.ts`, `tests/generated-trip-model.test.ts`

## RW-QUE-001 — Questions are typed, targeted, and answerable end to end

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `KNOWN_GAP`
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
  choices and one single-choice Question, not two Activities or a City Note.

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
- Evidence: The current record has no explicit options array, yes/no or
  multi-select type, correction escape hatch, affected-card marker, or Undo
  lifecycle. `applyAnswerQuestion` marks a Question answered before verifying a
  supported target mutation, and unsupported targets can therefore close without
  changing the traveler app. Saved decisions are upserted by decision key, which
  preserves only the current value rather than immutable answer history.
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
- Enforcement: `ENFORCED`
- Contract: Extraction, assembly, review, and future fixes never mutate an
  already published traveler snapshot. Maker changes create a new draft and an
  explicit new published snapshot/version when the maker chooses to publish an
  update.
- Evidence: Published snapshots are transactionally created and traveler reads
  use the active published snapshot.
- Tests: `tests/published-snapshots.test.ts`,
  `tests/structured-trip-snapshot.test.ts`

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
