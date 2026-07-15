# Roamwoven Product Contracts

Ledger version: 1

Ledger date: 2026-07-15

Approval state: Draft consolidation for CEO review

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
- Enforcement: `KNOWN_GAP`
- Contract: If Roamwoven accepts a source file, it must extract usable material
  from it or clearly tell the maker that the named file was not included.
  Automatic retries and safe fallbacks come first. One unreadable file must not
  kill a trip when other usable material exists. If no supplied material is
  usable, show a calm recovery state rather than pretending a draft is complete.
- Evidence: Upload acceptance and extraction capability currently use different
  type and size rules; unsupported checkpoints can be excluded from readiness.
- Tests: `tests/material-capabilities.test.ts`,
  `tests/material-extractions.test.ts`

## RW-ING-002 — V1 supports common intelligent-itinerary formats

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `KNOWN_GAP`
- Contract: V1 first-class inputs are files dropped into Roamwoven plus pasted
  notes: TXT, PDF, JPEG, PNG, WebP, DOCX, and XLSX, including XLSX files exported
  from Google Sheets. V1 does not ingest live Google Sheets links or other
  internet-published documents. DOCX extraction must preserve ordered text,
  tables, hyperlinks, and recoverable embedded-image evidence. XLSX extraction
  must preserve tab names, row and column relationships, visible values, dates,
  formulas' displayed results when available, and useful cell ordering. Formats
  not actually supported must be rejected clearly before upload rather than
  accepted optimistically.
- Evidence: DOCX and XLSX are accepted by upload validation but do not currently
  seed initial extraction.
- Tests: `tests/material-capabilities.test.ts`,
  `tests/material-extractions.test.ts`

## RW-QA-001 — Semantic QA is fail-soft

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Once usable source material exists, content-quality findings do not
  kill the run or prevent publishing. Roamwoven attempts deterministic repair,
  applies a safe evidence-preserving fallback, and surfaces one material
  Question only when the user genuinely needs to decide. A less-than-perfect
  Question is preferable to a dead usable run. Technical inability to recover
  any usable source is a recovery state, not semantic QA.
- Evidence: Extraction continues P0 diagnostics into Review, but readiness,
  notices, summary warnings, and publishing still use conflicting definitions.
- Tests: `tests/trip-quality-gate.test.ts`, `tests/generated-trip-model.test.ts`

## RW-CAN-001 — Canonical finalization is the semantic boundary

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `ENFORCED`
- Contract: Evidence observations become canonical candidate entities. After
  canonical validation and resolution, finalized canonical entities are
  immutable inputs to structured compilation. Compilation preserves canonical
  identity, count, type, name, dates, relationships, and review status and may
  not create a new semantic decision.
- Evidence: Canonical finalization, projection invariants, stable identity, and
  assembly-purity coverage exist.
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
  remain genuinely plausible.
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
  subordinate stops.
- Evidence: Unit-level route and same-site coverage exists, but the latest live
  resolver inverted negative Albertina evidence and failed to discover the
  Schoenbrunn grouping.
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
  standalone card.
- Evidence: Several deterministic cleanup tests pass, but the latest live run
  duplicated Borkonyha across activity and city notes, leaked stay/accessory
  content into Rome notes, and preserved day-container bloat.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`, `tests/generated-trip-model.test.ts`

## RW-REV-001 — Calls explain; Questions request material decisions

- Status: `LOCKED`
- Decision date: `2026-07-15`
- Enforcement: `PARTIAL`
- Contract: Calls are statement-style FYI explanations of non-obvious app-shaping
  decisions. Questions are only unresolved material user decisions whose answers
  change the generated app. Routine correct extraction, internal diagnostics,
  privacy defaults, source-obvious facts, and presentation mechanics are neither
  Calls nor Questions. Group equivalent uncertainty into one Question attached
  to the canonical subject.
- Evidence: Prompt and regression coverage exists, but the latest live run
  produced source-obvious, duplicated, irrelevant, and mis-targeted Questions.
- Tests: `tests/openai-trip-parser-prompt.test.ts`,
  `tests/canonical-regressions.test.ts`, `tests/generated-trip-model.test.ts`

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

- Status: `OPEN`
- Decision date: `2026-07-15`
- Enforcement: `NOT_APPLICABLE`
- Decision needed: Decide whether the next assembly pass includes end-to-end
  typed response controls and verified record mutations, or only emits corrected
  typed Questions for a later interaction pass.
- Evidence: Current unsupported target fields can close a Question without
  changing the traveler app, and generic text can be written into typed fields.
- Tests: `tests/generated-trip-model.test.ts`

## Governance-pass exit criteria

- CEO approves the exact ledger.
- The repository preflight points to this ledger.
- Historical documents clearly yield to this ledger when they conflict.
- Every contract has an honest enforcement state and test/evidence mapping.
- The existing runtime test suite stays green.
- No runtime ingestion, assembly, review, privacy, or publishing behavior changes
  in the governance-only pass.
