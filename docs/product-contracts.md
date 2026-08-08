# Roamwoven Product Contracts

Ledger version: 32

Ledger date: 2026-08-09 (Assembly Decision & Carrier Ledger V1 contract. The
approved Loop 9 companion ledger observes the existing canonical pipeline from
source fact through assembly decision to a final hash-only carrier or explicit
type-valid terminal state. It is shadow-only, append-only, default-off, and
dependent on an exactly matching persisted Source Fact Ledger V1 row. It may
not change traveler output, canonical authority, model or recovery requests,
geocoding, or live-call volume. Source Fact Ledger V1 remains immutable. Work
order: `docs/assembly-decision-carrier-ledger-v1-work-order-2026-08-07.md`.)

Prior: ledger version 31 (2026-08-07) — (Source Fact Ledger V1 contract and Question-quality
correction. Source facts become an immutable, source-derived boundary before
classification, containment, identity, grouping, review, or publication can
reinterpret them. V1 is shadow-only: it may compute, persist, audit, and score
facts, but it may not change traveler output or add model/geocode work.

The former exact-three Question gate is superseded. Question usefulness is the
gate: material, non-duplicative, not source-answerable, not routine assembly,
and not technical recovery. A small handful is experience guidance only; no
fixed count establishes quality. Work order:
`docs/source-fact-ledger-v1-work-order-2026-08-07.md`.)

Prior: ledger version 30 (2026-08-06) — (Fresh production assembly audit — COVERAGE/EVIDENCE
ONLY; no contract text or enforcement label changed. Deployed commit `2e056d6`
completed the one authorized extraction for trip
`6e200576-b6d5-4a6d-afd3-7beaec001f1c`, processing run
`314c87b9-e014-4811-9d0f-bda60a263ac2`, pin
`d786e9e4a20d11b2476bc60951b07d45b6fe418881a40e788dc2d9282b882c94`.
The infrastructure path was healthy, but persisted assembly is not beta-ready:
only 3/14 day sections have no identified defect, 0/3 City Notes are clean,
1/4 required group structures is complete, six Questions shipped against a
target of three, and two Calls shipped against a target of three with one false
membership claim. A protected-class booking/customer-detail shape also reached
public City Note prose.

Raw calls prove two shipped disjunctions were created by deterministic parser
normalization rather than the model; note/admin/accessory records were promoted
downstream; card/note winner selection and survivor chains lost source content;
identity missed Pinball and basilica cases; and review/quality did not close
confirmed defects. The `FAIL 0 · PASS 31` pinned fixture confidence therefore
does not describe the fresh persisted output. Production records are authority
where replay diverges. RW-ORD-001 and RW-GRP-001 remain `KNOWN_GAP`; the other
existing enforcement labels remain unchanged under coverage honesty. The
corrected offline pass is
`docs/assembly-beta-candidate-work-order-2026-08-06.md`; no second extraction,
model/prompt change, password UI work, or other product expansion is authorized
by this entry.)

Prior: ledger version 29 (2026-08-06) — (Sequencing and UI-scope decision from Eli while the
fresh production extraction was processing. The current run is judged on
extraction and assembly. Roamwoven does not yet expose maker-facing controls
for turning the traveler password on or off, and that missing UI does not fail
this run or the assembly beta gate. Password configuration UI and password-mode
browser QA are deferred until after extraction and assembly are nailed.

No privacy behavior is loosened by the deferral. The implemented fail-closed
storage, public projection, private-row join, unlock route, and prose sweep stay
in force. The later password component is deliberately bounded: blur/protect
travel-card descriptions and change the photo-mode UI/affordances. It is not a
whole-app access redesign. Coverage mapping: RW-TRV-001 and RW-PRI-001 remain
`PARTIAL` with the missing maker UI and browser proof named; RW-GRP-001 and
RW-ORD-001 still depend on the fresh run now in progress.)

Prior: ledger version 28 (2026-08-05) — (Three decisions/coverage corrections from Eli's beta
assembly pass. First, password configuration is optional: password OFF means
every share-link holder starts in fully unlocked traveler mode and receives all
`traveler_password` details; password ON creates the locked follower state
until one correct password unlocks the session. "Follower" remains a viewer
state, not a persisted role. The immutable public snapshot stays secret-free;
the server joins private rows only for an authorized unlocked response.

Second, source wins for the Jan-19 Vienna museums. The pinned text layer and
OCR contain separate `Mumok Museum` and `Natural History Museum` lines and no
`or`; both remain separate Vienna City Note ideas, with no invented choice,
Activity, or Question. The ground truth, fixture, and executable scorecard now
agree and the pin scores **FAIL 0 · NOT CHECKABLE 0 · NOT BUILT 0 · PASS 31**.

Third, RW-QUE-001's dead production Question-gate wiring is repaired. Canonical
subject/disposition assignment now precedes the gate inside the shared
canonicalization boundary, and off-contract parser-shaped questions are
retained as `dismissed` with a reason instead of disappearing. Parser-shaped
positive/negative controls, structured projection, the full suite, and the
pinned replay are green. RW-PRI-001 and the assembly live-coverage entries
remain `PARTIAL`/`KNOWN_GAP` as previously recorded until the authorized fresh
production publish/browser observation is completed.)

Prior: ledger version 27 (2026-08-05) — (RW-PRI-001 Δ4 coverage — COVERAGE ONLY, no contract
text changed. The protected travel-description container moves from
`KNOWN_GAP` to `PARTIAL`. New transport projections stamp a fail-closed
visibility; legacy rows without the field receive the same effective value;
generated transport rows render as traveler cards from structured public
fields; the raw description is removed from `snapshot_json`, transactionally
stored as one derived private detail, and returned only after the existing
password route succeeds. Redacted QA and the public-field audit now use the
same boundary. Evidence:
`tests/generated-trip-model.test.ts`, `tests/published-snapshots.test.ts`,
`tests/traveler-unlock-route.test.ts`, `tests/trip-extraction-qa-bundle.test.ts`,
and `tests/identity-output-gate.test.ts`.

The remaining coverage is named rather than hidden: the no-password-configured
viewer behavior still awaits Eli's explicit product decision, and the new path
has route-level regressions plus an optimized build but no fresh production
publish/browser observation. The load-bearing prose sweep remains unchanged.
RW-PRI-001 as a whole therefore remains `PARTIAL`.)

Prior: ledger version 26 (2026-08-03) — (RW-GRP-001 coverage — COVERAGE ONLY, no contract text
changed. RW-GRP-001 `PARTIAL` → `KNOWN_GAP` on Eli's explicit decision this
date, closing the question v25 recorded as OPEN and left to him.

The decision, in his words: two wrong group members on the main path is
behavior violating the contract, and v24's justification — verbatim, "2 grouped
stops, both correct, ZERO wrong groups" — is no longer true. Under §How to use
this ledger, `KNOWN_GAP` asserts exactly that, so `KNOWN_GAP` is the honest
label.

The condition for returning to `PARTIAL` is recorded WITH the downgrade so it
cannot be re-litigated a fifth time: **a live run that ships zero wrong
groups.** Not specification. Not fixture-green. Not a replay — the geocode lane
is not pinned and the wrong-group path runs through it
(`docs/assembly-defect-docket-2026-07-31-run-8.1.0.md` §6.3).

Supersession: this supersedes v24's 2026-07-31 upgrade of RW-GRP-001 and the
v25 header's "COVERAGE IS OPEN AND IS ELI'S CALL"; both are preserved below as
history. RW-PLC-001 stays `KNOWN_GAP`. No other entry changes.

Recorded with the decision, and binding: **this is the last hand-set coverage
change for RW-GRP-001.** Once `scripts/scorecard.mjs` runs, this entry's
coverage is derived from assertions rather than argued from a docket. The
scorecard turns the approved ground truth into executable assertions labelled
with the entry each one proves, and reports four states — PASS, FAIL, NOT BUILT
and NOT CHECKABLE — so that contract text with no implementation, and a field
that reaches no surface, stop being scored as though they were passes.)

Prior: ledger version 25 (2026-08-02) — (assembly and publishing principles pass — Eli's
decisions this date, recorded across RW-ORD-001 (NEW), RW-CLS-001, RW-GRP-001,
RW-PLC-001, RW-REV-001 and RW-PUB-001. Input: Eli's `Roamwoven Assembly and Publishing
Principles`, reviewed against run 8.1.0's audit
(`docs/assembly-defect-docket-2026-07-31-run-8.1.0.md`) and against source.
That standalone principles document is SUPERSEDED IN FULL by this ledger and is
not to be reintroduced as a second authority.

**The most important finding of the pass: most of what the principles document
asks for is ALREADY LOCKED CONTRACT that the code does not honor.** Activity
beats City Note, density-as-soft-trigger-never-classifier, a committed undated
Activity staying an Activity with a provisional date, and Calls explaining
Roamwoven-created groupings are all existing contract text, and all four were
violated by run 8.1.0. The genuinely NEW decisions this date are eleven, listed
in RW-ORD-001. Everything else in the principles document is enforcement work,
not new product judgment — and the audit loop of the last twelve runs kept
diagnosing symptoms rather than checking the code against this ledger.

One correction the principles document itself required: its line "obvious
same-site grouping does not need a maker-facing Call" contradicted RW-REV-001
and was WITHDRAWN by Eli 2026-08-02.

Coverage: NO coverage state is changed by this entry. RW-GRP-001 stays `PARTIAL`
pending Eli's explicit decision on run 8.1.0's evidence — that run produced two
WRONG group members (Museum of Illusions, Ring Tram Tour), and v24's upgrade to
`PARTIAL` was justified in these words: "2 grouped stops, both correct, ZERO
wrong groups." That justification no longer holds. The evidence is recorded in
the entry; the coverage call is Eli's and is OPEN.)

Prior: ledger version 24 (2026-07-31) — (run-2 work order — COVERAGE ONLY, no contract text
changed. RW-GRP-001 `KNOWN_GAP` → `PARTIAL` on Eli's explicit decision this
date, on run-2 evidence: 2 grouped stops, both correct, ZERO wrong groups —
the first live proof since the collapse that the grouping mechanism fires on
real parse output rather than fixtures. `KNOWN_GAP` means the implementation
VIOLATES the contract, and 2-correct/0-wrong is no longer that. What is still
missing is named in the entry rather than hidden by the label: the TARGET
(Prague Castle) has not grouped live, and the reason is now understood and
fixed in code but unproven by a run. Supersession: this supersedes the
2026-07-28 downgrade of RW-GRP-001 only; RW-PLC-001 stays `KNOWN_GAP` because
its defect — the duplicate + dateless castle — is fixed in code and has not
yet shipped. Coverage mapping: grouping is now recorded as partially enforced
with a named uncovered path, which is what `PARTIAL` is for. Eli's standing
decision on the geocoder is unchanged and still binding: a wrong group stays
worse than a missing one.)

Prior: ledger version 23 (2026-07-28) — (run 7.28.0 audit — COVERAGE ONLY, no contract text
changed. RW-GRP-001 `PARTIAL` → `KNOWN_GAP` and RW-PLC-001 `PARTIAL` →
`KNOWN_GAP`, both on Eli's explicit decisions this date; RW-SRC-001 stays
`PARTIAL` with run-7.28.0 evidence added. Supersession: the Evidence sections
of these three entries supersede their 2026-07-27 Arc G text, which described
FIXTURE claims only — run 7.28.0 is the first live evidence for G.1/G.2/G.3a/
G.3b. Coverage mapping: the grouping and placement promises are now recorded as
known-broken rather than partially enforced, so a future session does not spend
a run rediscovering it. Eli's standing decision this date: fix geocoder coverage
and trust — budget, locality-granularity guard, retry-with-container-context,
per-candidate telemetry — rather than relax the verified-only coordinate
policy, because a wrong group stays worse than a missing one.)

Prior: ledger version 22 (2026-07-25) — (Δ4 — a travel card's DESCRIPTION becomes a
protected container unlocked by ONE password entry, superseding the Δ3
display rule; the public card face is composed from structured route/time
fields. Travel cards only for now; "follower" means a link-holder without
the password, not a tracked role. Enforcement `KNOWN_GAP` — the
traveler-side path is unbuilt and the prose-side code sweep is the
load-bearing interim protection until it exists. Recorded now, built after
the mini baseline run, as its own arc. Δ4 also resolves the escalated
fused-train-number tension without loosening any privacy predicate.)

Prior: ledger version 21 (2026-07-25) — Arc F.3 — privacy only, zero live runs: the identity
gate reaches the QUESTION surface, so identity data is scrubbed from review
prose and is never asked as a question; publish readiness copy words privacy
findings and structural findings separately; the Delta-3 travel-card
amendment, the travel-card display rule and the do-not-block standing
directive are recorded; the question gate's dead wiring becomes an explicit
`KNOWN_GAP` covered on the production shape instead of seeded-fixture green;
four positional privacy-predicate false positives fixed)

Prior: ledger version 20 (2026-07-24) — Arc F: run-7.23.2 privacy armor —
one identity output gate over every public field of every record kind with
suppress-or-scrub semantics; prose-side protected-code sweep independent of
capture; stay candidacy gate (night evidence); shared Costs predicate at
canonical candidacy; arrival-directions routed to stays; chain-8 telemetry
closed; publish readiness copy becomes warning-state on open identity P0s /
hard warnings — RW-PUB-001 messaging amendment, CEO decisions 1 and 7.

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

## RW-ORD-001 — Assembly stages run in one order and may not undo each other

- Status: `LOCKED`
- Decision date: `2026-08-02`
- Supersession: none — this is the first statement of assembly stage ordering.
  It is the only structurally NEW entry from the 2026-08-02 principles pass;
  every other decision that date amends an existing entry.
- Enforcement: `KNOWN_GAP`
- Contract: Assembly runs in this order — **classify → resolve containment →
  resolve identity → group → question → publish.** Containment is resolved
  BEFORE identity and is deliberately separated from grouping: without that
  split, identity and grouping are circular, because identity cannot run
  without knowing containment and grouping cannot run without identity.

  **Invariant A — no later stage deletes a record an earlier stage justified.**
  A later stage may enrich a record, re-parent it, or suppress it as a
  duplicate of a surviving record. It may not delete the thing another stage
  found. Where a record is suppressed in favor of a survivor, its useful facts
  MIGRATE to the survivor's description rather than dying with it; a child in a
  group keeps its own descriptive text and therefore its own enrichments
  (Eli, 2026-08-02, extending RW-CLS-001's "a stronger planned sighting gives
  the entity one Activity home and removes its City Note duplicate" — the
  duplicate LISTING is removed, the facts are not, and no stub survives in City
  Notes, because the same information must never appear in two places in the
  traveler app).

  **Invariant B — containment beats identity.** When one record contains the
  other, they remain two records in a parent/child relation regardless of how
  strongly identity signals indicate a merge.

  **A venue is not a container.** The container test is whether the parent has
  two or more children the traveler would name separately — the same `>=2`
  floor grouping already uses, so identity and grouping share ONE definition of
  container rather than maintaining several that drift. A named site container
  ships as a standalone Activity regardless of how many children this
  particular parse surfaced; child count decides whether it GROUPS, not whether
  it EXISTS.

  **Maker decisions never feed back** (Eli, 2026-08-02). A maker's answer, edit,
  ungrouping or dismissal affects that trip only. It never changes Roamwoven's
  logic and never changes that account's future builds. No learning loop and no
  per-account behavioral drift, absent an explicit future decision. Consequences:
  the quality standard is one global standard rather than something meaning
  different things per customer, and runs stay reproducible.

  **Decision anchors.** Because `mergeCanonicalPieceInto` calls
  `refreshCanonicalPieceId` on every merge, canonical piece ids change as
  assembly proceeds and are not a durable handle. Every maker-facing decision
  records a stable anchor alongside its piece id — leg key plus date plus
  normalized title, or a source-anchor reference — emitted in the QA bundle so
  it is observable rather than a dead field. Re-processing is NOT being built
  now; this costs a field today and avoids rebuilding identity later. Per the
  no-feedback rule above, the anchor only has to re-find a record; it never
  carries decision semantics.
- Evidence: Run 8.1.0 (2026-07-31, trip `4eaf3c6c`) is the proving case for both
  invariants and neither held. Invariant A: `collapseAlternativeSlotCards`
  (`lib/extraction/evidence-clustering.ts:6878`) merged the rescued dated
  `Prague Castle visit` container INTO `Changing of the Guard`, one of its own
  sub-stops — audit payload lineage rows 40 (suppressed, `finalRecords: []`) and
  33 (compiled, absorbing it with reason "same plan described twice on one day").
  The site's card left the draft entirely; the day shipped ten cards, none of
  them Prague Castle. Invariant B: every RW-CAN-001 identity signal indicated a
  merge for that pair — same date, same place, overlapping name tokens, shared
  source section — and only the containment relation says otherwise. The
  contrast case in the same run is `U Malířů` / `Lunch at U Malířů`, identical
  `X at Y` surface shape, correctly merged, because a restaurant is a venue and
  not a container. `isSiteComponentTitlePair`
  (`lib/extraction/activity-classifier.ts:126`) is the existing partial patch for
  the circularity; it recognizes a component only by the `"<X> at <Site>"` title
  shape and therefore did not fire on `Changing of the Guard`.
  COVERAGE IS `KNOWN_GAP` AND THE EXISTING FIXTURE IS PART OF THE REASON.
  `tests/site-container-survives-rejected-grouping.test.ts` does include a
  `Changing of the Guard` sibling, but gives it NO description, so Pass 1 bails
  at its `identityTokens(...).length < 4` guard and the lane that actually
  deleted the card is never reached. The suite stayed green through the defect.
  That fixture is to be corrected in the first implementation pass and proven in
  both directions; no test asserts either invariant today.
  2026-08-05 pinned replay: `routeDatedNoteEvidence` previously removed a whole
  mixed note segment as soon as any text matched a surviving Activity. That
  stranded Activity observations already suppressed into the note as their
  declared survivor, and could then terminal-dispose the note itself with no
  final carrier. The router now follows the note's current and prior piece ids,
  forwards a note-owned duplicate to one unambiguous surviving Activity,
  preserves every other note-owned item with its identity and useful detail,
  and records the actual absorbing record or records when a note is fully
  redistributed. The pinned `Apple Studel Show`, `Ferris wheel`, and
  `Schönbrunn visit` chains all reach a final carrier; scorecard `ORD-1` is PASS.
  `tests/assembly-ground-truth-run9.test.ts` proves the mixed-list positive and
  negative directions. 2026-08-05 stable-anchor follow-on: Questions and Calls
  now carry versioned leg/date/title or source-reference anchors; the maker
  route derives and persists trusted primary and related anchors; the decision
  applier uses direct ids first and permits anchor fallback only for one unique
  compatible record. Fingerprint version 3 and the redacted QA bundle serve the
  anchors. Compound decisions are atomic when any related anchor cannot resolve
  uniquely. The maker route also resolves every subject in a bulk action before
  starting any write, so one stale subject cannot partially apply the earlier
  subjects. Pinned scorecard `ORD-4` validates status, version, subject type,
  and source-reference form and is PASS with 8/8 anchors valid. Enforcement
  remains `KNOWN_GAP`. The 2026-08-06 fresh run supplied the missing live
  evidence and confirmed the violation rather than closing it: mutating
  card/note reconciliation still runs before block classification, and multiple
  pieces name a survivor without any final record carrying the source fact.
  The next pass separates non-mutating containment from identity and grouping
  per `docs/assembly-beta-candidate-work-order-2026-08-06.md`.
- Tests: `tests/site-container-survives-rejected-grouping.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/canonical-identity.test.ts`,
  `tests/assembly-ground-truth-run9.test.ts`,
  `tests/generated-trip-model.test.ts`,
  `tests/review-decisions-route.test.ts`,
  `tests/trip-extraction-qa-bundle.test.ts`

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
  2026-08-06 fresh-run evidence: quality assessment found two P1 and five P2
  diagnostics, retried, changed the fingerprint, and still persisted both P1
  output defects with `conservative_fallback_preserved_for_review`. Six open
  Questions shipped instead of the three material decisions. The run stayed
  usable, satisfying fail-soft availability, but the repair/fallback loop did
  not meet the internal assembly quality standard.
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

  2026-07-22 refinement (Arc E, CEO-approved; live-run 7.22.4): the
  never-committed fold may not remove grouping structure or
  heading-committed entities in favor of a reference copy. A copy whose own
  day heading names the entity (the run7 castle rule), or that is same-site
  grouping structure per RW-GRP-001 — an "X at <Site>" component whose tail
  names a present peer, the container a component's tail names, or an
  entity listed in such a container's own description — is a PLAN copy: it
  keeps the card (and its reference copy is removed), even when merged
  reference-copy text carries prices or opening hours. A hedged copy still
  demotes — doubt markers stay authoritative (RW-CLS-001) — and a loose
  day-plan copy with no heading or structure evidence still folds into its
  note copy, so an idea set repeated across day plan and notes blob stays
  City Notes (the Jan-19 Ferris-wheel set). Context: 7.22.4's parse listed
  the Schönbrunn family twice with no times, and the card-vs-note
  reconciliation folded palace and components into the suppressed
  "Schönbrunn visit" note — zero cards, zero groups. Enforced by
  `tests/assembly-ground-truth-run9.test.ts` (fold-guard positive, idea-set
  negative control, heading-committed castle shape, hedged-copy control).
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
- Evidence: 2026-07-18 wave 2 originally treated Mumok/Natural History as an
  explicit source disjunction. **That historical premise is superseded by the
  2026-08-05 source verification:** those are separate lines with no `or` and
  remain separate City Note ideas. The generic rule is retained only for a
  source line that actually offers "X or Y": when the parser
  emitted the alternatives as separate same-day cards with NO or-carrying
  copy, deterministic parser-artifact normalization folds them into one
  "X or Y" card before clustering (the alternative is kept in the
  description and as context lineage); when an or-carrying copy exists, the
  wave-1.1 assembly collapse stays in charge. Enforced by
  a synthetic explicit-`or` control in
  `tests/parser-artifact-normalization.test.ts`.
  2026-08-05 post-classification identity follow-on (pinned run 8.1.0): two
  parser passes over the same PDF emitted `Trdlnik for breakfast` and
  `Trdelník for breakfast` as distinct Jan 16 pieces. Exact distinctive-token
  matching missed the omitted character; one copy then acquired the Prague
  Castle coordinate and shipped as a false group child. Canonical intake now
  treats a single-character spelling drift as one occurrence only when both
  records have the same date, city, source file, token shape, and no conflicting
  booking identity. The differing proper-name token must be at least seven
  characters and keep the same first and last two characters. This is identity
  reconciliation, not fuzzy grouping: short neighboring names remain separate,
  the higher-quality spelling wins, and the duplicate never enters grouping.
  Pinned score movement: `GT-0116-3` and `GRP-1` PASS; result **FAIL 2 · NOT
  CHECKABLE 0 · NOT BUILT 2 · PASS 27**. Enforced by
  `tests/evidence-clustering.test.ts`.
  2026-07-18 wave 1.1 (live-run 7.18.1: "Prague Castle" carried a
  bled 12:00 time and slot collision merged the SITE into the timed
  "Changing of the Guard" EVENT, deleting the castle): sharing a day/time/
  category slot is only identity evidence when titles are related, one title
  is generic, or one text cross-references the other AND the pair is not a
  site-vs-event mismatch. Near-identical same-day descriptions collapse to
  one card, with the copy carrying an unresolved "X or Y" choice always
  winning the merge. Enforced by ground-truth run4 checks.
  2026-07-18 Arc A (live-run 7.18.2 PB-3: the "Explore Vienna" heading
  fragment won the near-identical collapse by raw title length and deleted
  Schonbrunn Palace): every collapse/dedup rule now takes its winner from
  ONE shared ladder (`lib/extraction/entity-winner.ts`) — merge eligibility
  first (an overview, day-arc, or heading-fragment card can NEVER win a
  merge against a real card), then the or-carrying-copy preference, then
  booking > named-venue tokens > commitment > specificity > title quality.
  A heading fragment is a card whose title is one segment of its OWN source
  day heading with no venue content; a venue named inside a multi-part
  heading ("Prague Castle" under "Lesser Town & Prague Castle") keeps its
  content tokens and stays eligible, and a bare verb+city title with no
  heading corroboration ("Tour Rome") stays a real card. Enforced by
  `tests/entity-winner.test.ts` and
  `tests/assembly-ground-truth-run5.test.ts`.
  2026-07-18 Arc B (live-run 7.18.3 PB-2/PB-7): sameEntity now REFUSES a
  site↔component pair outright — a container-noun card and an "X at <site>"
  component are grouping structure, never duplicates — and merge noun
  guards judge OBSERVATION titles as well as the current payload title, so
  post-merge title drift cannot evade them (the Schönbrunn fusion chain).
  The repeat rule is back in supersession compliance: a sequence-inherited
  copy NEVER survives as a second visit (that is distinct-dates-alone in
  disguise); only copies with their own time, booking, or first-person
  language do, and sequenced/loose copies fold into the strongest copy.
  Undated placeholders join their dated repeat group, and a single
  deliberate day-plan copy wins a cross-day uncommitted repeat (ground
  truth v2 St. Stephen's dedup). Enforced by
  `tests/activity-classifier.test.ts` and
  `tests/assembly-ground-truth-run6.test.ts`.
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
  `tests/assembly-ground-truth-run9.test.ts`,
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
  2026-07-27 Arc G.2 (run 7.26.1 field bleed): a transport field that CANNOT
  belong to its record is not an equal-authority contradiction and never
  becomes a Question. Two defect shapes are deterministic:
  `arrivalLocation` type-incompatible with the record (a train, bus or ferry
  arriving at a bare IATA code — "JFK" on the RegioJet row, legitimate on the
  four Delta rows in the same trip; a flight departing a Hauptbahnhof), and
  `arrivalTime` equal to its own `departureTime` (the ÖBB row, a verbatim
  field copy — the transport analogue of the locked degenerate-time repair
  already applied to activities). Both are REPAIRED from the matching
  source-text anchor, which already carries the right answers (Wien Hbf
  13:23, Budapest-Keleti 13:19) and was previously only reported against by
  the audit diagnostic. When no anchor supplies the truth the bad value is
  CLEARED and one typed transport Question is raised — asked only because a
  known value was destroyed, never because a source was merely sparse
  (Eli's ruling 2026-07-27). Repairs are support telemetry
  (`usage.openai.transportFieldRepairs`, `canonicalization
  .transportFieldRepairCount`), never maker-facing mechanics. The pass is
  pure, idempotent, and re-runs in the retry lane. Enforced by
  `tests/transport-field-repair.test.ts` (both live shapes, negative
  controls: airport transfers, flights, sparse rows, and an anchor that
  would re-introduce the defect).
- Tests: `tests/canonical-factory-boundary.test.ts`,
  `tests/source-transport-anchors.test.ts`,
  `tests/transport-field-repair.test.ts`
  2026-07-28 (run 7.28.0): enforcement stays `PARTIAL`. Neither G.2 defect
  shape occurred in this parse (`transportFieldRepairCount 0`: no bare IATA on
  a rail row, no `arrival == departure`), so the Arc G.2 repair is UNTESTED
  live rather than violated. A DIFFERENT precedence failure is confirmed: all
  27 `uncoveredLines` are the ÖBB ticket page and every one carries the Jan-24
  Rome day-section label, so a Jan-21 Vienna→Budapest ticket never joined its
  own row (`materialTransportAnchors 9` / `runAuditMatched 8` /
  `finalMatched 7`). The row inherited `provider: "REGIOJET"` from the adjacent
  rail leg across the shared Wien Hbf interchange — the exact hazard the G.2
  adversarial review named — and kept `"Operator"` as its confirmation label
  where run-7.21.1b had `VXFHXKCQEPHPUSNT`. Day-section attribution, not the
  repair lane, is the precedence gap to close.

## RW-SFL-001 — Source facts are durable before assembly interpretation

- Status: `LOCKED`
- Decision date: `2026-08-07`
- Enforcement: `PARTIAL`
- Contract: Every meaningful source clause receives one stable source span
  identity before activity chunking. That identity is derived from the source
  material fingerprint, normalized document identity, original line occurrence,
  clause ordinal, and normalized-clause digest; it may not depend on chunk,
  concurrency, parser-array, or model-response order. The protected source keeps
  the prose. Durable fact storage keeps only source locations and digests.

  Source facts are append-only and never merged or suppressed. Entity,
  relationship, intent, decision, and exclusion are independent fact kinds.
  Structural proposals and atomic entities remain different facts even when
  their names overlap; optionality is intent, not containment. Resolver claims,
  including rejected and incomplete claims, remain auditable with an explicit
  outcome. Candidate-to-source alignment is deterministic and source-bounded;
  an ambiguous or absent match records `unresolved_source` instead of guessing
  from trip-wide fuzzy similarity.

  Coverage is carrier-based. A source clause is `carried` only by an atomic
  entity, City Note, Stay, Transport, or protected-detail fact. Words found only
  in grouping/container prose are `structural_only`; accessory/context evidence
  is `context_only`; shared exclusions are `excluded`; everything else is
  `uncovered`. Recovery planning batches individual uncovered clauses under
  their original section context and does not itself call a model.

  V1 is shadow-only and defaults off behind
  `EXTRACTION_FACT_LEDGER_SHADOW=1`. It adds no model call, geocode lookup,
  retry, or traveler-output mutation. One append-only fact-set row may be
  written per processing run. Aggregate events expose only versions, counts,
  sizes, durations, and hashes—never source excerpts, names, addresses,
  booking values, or other private content. A build or persistence failure is
  an internal fail-soft event; the existing usable draft continues with no
  maker Question or technical recovery state.
- Evidence: The five ordered Source Fact Ledger V1 commits are implemented.
  The parser builds one deterministic source index before chunking and, only
  when the default-off shadow flag is enabled, builds the fact, coverage, and
  non-invoking recovery ledgers after existing parser/recovery/resolver evidence
  is available. The route performs at most one authenticated append-only insert
  and serves only the audit allowlist. Candidate 8.6 and fresh 8.7 offline
  replays prove identical shadow-off/shadow-on traveler semantics, zero added
  calls/lookups/retries, and the required time/size ceilings. The fresh 8.7
  replay also reproduces its persisted production semantic fingerprint; its
  pre-existing ground-truth failures are unchanged by shadow execution.

  Enforcement remains `PARTIAL`: the additive production migration has not
  been applied and the flag remains off, as required. Shadow evidence does not
  make the ledger authoritative for assembly behavior. See
  `docs/source-fact-ledger-v1-closure-2026-08-07.md`.
- Tests: `tests/source-document-index.test.ts`,
  `tests/source-fact-ledger.test.ts`,
  `tests/source-coverage-v4.test.ts`,
  `tests/source-fact-ledger-scale.test.ts`,
  `tests/source-fact-ledger-store.test.ts`,
  `tests/source-fact-ledger-sql.test.ts`,
  `tests/extraction-route-recovery.test.ts`,
  `tests/arc-f-telemetry.test.ts`

## RW-ADL-001 — Assembly decisions terminate in checkable carriers or states

- Status: `LOCKED`
- Decision date: `2026-08-09`
- Enforcement: `PARTIAL`
- Contract: Source Fact Ledger V1 is immutable. A separate append-only
  `AssemblyDecisionCarrierLedgerV1` observes the current canonical authority
  without changing it and joins `source span → source fact → assembly decision
  → final carrier or explicit terminal state`.

  Every raw resolver role proposal is retained exactly once as `applied`,
  `supporting`, or `rejected`. A consistent duplicate is supporting evidence,
  not a false rejection. Conflicts, low confidence, unknown candidates, and
  unresolved source bindings stay explicit. Raw reason prose and transient
  candidate, stage, chunk, parser-array, observation, and mutable canonical
  identifiers are in-memory joins only and may never become durable identity.

  Decisions cover classification, containment, identity, grouping, review, and
  publish projection in the locked RW-ORD-001 order. Stable decision identity
  is content-addressed from source fact/span references, domain, outcome,
  producer, and writer version. Resolver response order, chunk order, overlap,
  split size, and concurrency may not change durable IDs or hashes.

  Every V1 source fact has exactly one type-valid terminal disposition. Entity
  facts terminate as `carried`, `evidence_only`, or `unresolved`; relationship
  facts as `applied`, `rejected`, or `unresolved`; intent facts as `applied`,
  `superseded`, or `unresolved`; decision facts as `review`,
  `resolved_silently`, `dismissed`, or `unresolved`; and exclusion facts as
  `excluded`. A group child keeps its own carrier. A suppressed duplicate
  forwards to a survivor or records an explicit non-carrier reason. No later
  decision domain may silently delete a fact justified by an earlier domain.

  Final carriers use class-specific hash-only anchors. Persisted and aggregate
  event data contain no title, excerpt, person, address, protected value,
  booking value, model reason, or transient candidate ID. The runtime builder
  is an indexed linear pass; exhaustive resolver ablation is an offline release
  gate and never runs on a customer route.

  The companion is default-off behind
  `ASSEMBLY_DECISION_LEDGER_SHADOW=1`. It requires
  `EXTRACTION_FACT_LEDGER_SHADOW=1` and an inserted or hash-confirmed matching
  source-fact row. A missing/failed dependency, construction mismatch, or
  persistence failure emits one privacy-safe internal event, performs no
  orphan insert, makes no Question or Call, and leaves the usable draft exact.
  It never silently enables either flag. The complete shadow path adds one
  decision-set insert after assembly, for two bounded append-only writes total.

  This ledger does not authorize resolver removal. An authority switch requires
  a later behavior loop that proves every behavior-bearing judgment from source
  facts, reaches zero unresolved behavior-bearing decisions, preserves every
  carrier and ground-truth relationship/intent outcome, and reproduces the
  current route-equivalent output before removing the resolver in that same
  bounded loop.
- Evidence: Loop 8 exit audit found 161 accepted resolver role decisions on the
  8.6 candidate and 113 on fresh 8.7, with 223 and 150 raw proposals
  respectively. Individual offline ablation found 18 and 5 behavior-bearing
  decisions. Disabling the resolver changed both semantic hashes and materially
  reduced grouping/Calls while geocode candidate pools stayed exact. Loop 9.1
  locks the companion schema, stable-ID rules, privacy allowlist, terminal
  outcome families, immutable Source Fact V1 fixture hash, and those sanitized
  baselines. Loop 9.2 captures every resolver role proposal plus recovery-source
  bindings without changing resolver application or recovery requests. Loop 9.3
  adds the indexed terminal reconciliation, all six decision domains,
  class-specific hash-only carriers, exact per-fact terminal coverage, group-child
  conservation, and later-stage deletion guards. Loop 9.4 checks in the
  network-disabled, capture-once role-ablation gate; locks the 18/161 and 5/113
  behavior-bearing baselines; proves durable source-fact linkage for the fresh
  production-shaped replay; adds semantic booking, recommendation, spreadsheet,
  and freeform fixtures; and keeps V3 lines, V1 facts, RW-ORD observations, and
  final records as four separate conservation denominators. Append-only
  persistence remains to be completed in commit 9.5; the enforcement label is
  therefore honestly `PARTIAL`.
- Tests: `tests/assembly-decision-carrier-ledger-schema.test.ts`,
  `tests/resolver-role-evaluations.test.ts`,
  `tests/recovery-source-binding.test.ts`,
  `tests/assembly-decision-carrier-reconciliation.test.ts`, and
  `tests/assembly-decision-heterogeneous-parity.test.ts`

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

  2026-08-03 supersession (coverage only): the v24 upgrade to `PARTIAL` is
  superseded by Eli's `KNOWN_GAP` decision this date, recorded at the end of
  this entry. No contract text above or below changes.
- Enforcement: `KNOWN_GAP`
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

  2026-08-02 additions (Eli-approved) — PROVENANCE, ECHO, AND WHAT DISTANCE MAY
  DO.

  **Only source bytes are source evidence.** Nothing Roamwoven generated may
  serve as evidence of what the source says — not a geocoded address, not a
  coordinate, not a normalized title, not an inferred category. A grouping claim
  that cites the source must be traceable to the document.

  **Explicit source nesting** exists when the source identifies a named parent
  and places bounded child content beneath or inside it through hierarchy,
  containment language ("includes", "stops", "inside", "part of"), a booked tour
  followed by its itinerary, a route with listed stops, or a visual layout in
  which children sit beneath a named parent. Proximity, shared page, shared
  date, shared city, OCR-adjacency and similar coordinates NEVER establish
  nesting. Nesting is strong evidence, not an automatic command to group: a
  nested child with its own booking, a materially different time, or an
  independently experienced character still earns its own card.

  **Source nesting establishes candidacy; distance only corroborates or vetoes.**
  A non-nested item is never admitted to a group by proximity however close it
  appears. Only source-nested members may stretch a site's footprint — otherwise
  an admitted wrong member widens the gate for the next one, which is a ratchet.

  **The echo rule.** A geocode result that returns the container's own
  coordinate is an echo of the query, not evidence. Reject any result within
  ~50 m of the container whose name was injected into the lookup.

  **Two kinds of container.** A SITE container asserts spatial containment: its
  children should be inside it, and a far child indicates a faulty enumeration.
  A ROUTE or TOUR container asserts sequence: its children are expected to be
  spread out and distance says nothing about them. Distance may veto for sites
  and never for routes.

  **A named site container never becomes another site's child** unless the
  source explicitly nests it. This extends to the hierarchy path the rule that
  already protects the geo path (added after Buda Castle was absorbed), and it
  is what protects Belvedere without Roamwoven needing to know what Belvedere
  is.

  **Coordinates carry what they are licensed for.** A coordinate trusted for
  DISPLAY is not thereby trusted for MEMBERSHIP. "Tour of Prague Castle"
  legitimately resolves to its container and stays mappable while being denied
  as membership evidence.

  **Grouping requires a signal independent of tightness.** Geographic coherence
  now types a flat list as plan-shaped under RW-CLS-001; it may not then be
  re-spent as the reason those same items group. Grouping needs one further
  thing — the source listing them adjacently. One piece of evidence driving two
  decisions produces correlated errors.

  OPEN, NOT DECIDED (Eli, 2026-08-02): the discovered-walk gate. This contract
  currently gates a discovered route on a crowded day (~6 visible cards). Eli's
  direction is that the test should be "are these stops close together AND does
  it logically make sense to group them", where the second half reduces to four
  checks — listed together in the source; none independently booked or timed;
  none is already its own plan (a tour, a ticketed experience, a named site);
  and the members are the same KIND of thing, which is the check that keeps an
  errand such as `Laundry` out of a sightseeing outing even when it sits inside
  the same 700 m. Eli 2026-08-02 also confirmed that January 20 grouping is NOT
  required. Deferred deliberately: every other decision of this pass RESTRICTS
  output, while a looser walk gate is the only one that would make Roamwoven
  invent MORE groups, against the standing rule that a wrong group is worse than
  a missing one; and discovered walks depend on verified coordinates, which a
  pinned replay cannot exercise, so shipping this beside the containment work
  would make the next live run's wrong-group result unattributable. Revisit
  after one clean run. `CROWDED_DAY_VISIBLE_CARDS` therefore stands, and the
  standing instruction not to calibrate it is unchanged.
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
  2026-07-18 Arc A run5 geo calibration (live-run 7.18.2 PB-4: a "Quick
  look inside the Gresham Palace" card claimed half of central Pest,
  including a timed bridge crossing, because 2-decimal coordinates quantize
  to ~1.1 km): coordinates below 3-decimal precision are ineligible for any
  geo-radius rule (still valid for source-hierarchy membership); a
  passing-mention title ("quick look", "walk past", "photo stop") is never
  a visit container in either the decision creator or the execution
  verifier; on the geo path a TIMED stop joins a same-site visit only when
  it shares the container's own category (preserving the locked
  guard-changing-inside-the-castle child while killing the coarse-radius
  timed-stop grab); a discovered-walk member's `area` label must be
  supported by its OWN source section/heading text (structure-less fixture
  pieces are never judged, mirroring the source-truth posture); and the
  parser prompt now demands >=3-decimal coordinates in both the system
  prompt and every per-chunk reminder. Geo/area fields now ride on QA
  bundle lineage observations so radius claims are verifiable from the
  bundle. Enforced by `tests/assembly-ground-truth-run5.test.ts` and the
  updated same-site checks in `tests/evidence-clustering.test.ts`.
  2026-07-18 Arc B: the geocoding verification lane is LIVE (standing CEO
  decision; `lib/extraction/geocode-verification.ts`): env-keyed
  (GEOCODE_VERIFICATION_API_KEY — absent means disabled), hard per-trip
  lookup budget with counted overflow, fail-soft (any transport error ends
  the lane and the draft survives on parser coordinates), deterministic
  candidate selection (site containers first, then crowded-day walk
  candidates), results attached as verifiedLatitude/verifiedLongitude with
  provenance and consumed ONLY by grouping-proximity checks — lookups never
  change intent, type, date, city, or booking state. Verified coordinates
  satisfy the precision gate that 2-decimal parser coordinates fail.
  Telemetry rides as usage.geocodeVerification into the audit extraction
  summary and QA bundle; no new DB tables in v1 (durable caching is a later
  additive migration alongside pinning). Enforced by
  `tests/geocode-verification.test.ts` and the run6 verified-coords
  grouping check.
  2026-07-27 Arc G.3 — the two approved pieces that were never built (CEO
  direction 2026-07-23, "geo coordinate + logic"; scope locked
  2026-07-27). (a) FORMATTED ADDRESS: the geocoder's `formatted_address`
  is captured alongside the coordinates it already returns (no extra
  lookup, same proximity-only posture) and attached as
  `verifiedFormattedAddress`. A child whose address names the container is
  a same-site member regardless of radius — this is what admits
  Schönbrunn's Gloriette, ~800 m out, which the locked ~300 m radius
  refuses BY DESIGN. Address tokens must be >=5 characters and are
  filtered of generic site nouns and trip city names, so sharing a city —
  or the word "palace" — is never containment. Confirmed members carrying
  VERIFIED coordinates may extend the site footprint (capped at 1.2 km,
  minimum two confirmed members, untimed and verified-coordinate members
  only). (b) CLAIM LEDGER (`lib/extraction/grouping-claim-ledger.ts`):
  lane contention is arbitrated, not decided by statement order. Claims
  carry a strength — source/address HIERARCHY or proximity-only GEO — and
  only a geo claim is contestable, only by a lane that needs it, and only
  when the holder still keeps two stops. An abandoned decision RELEASES
  its pieces instead of stranding them out of the walk pool. Contention is
  visible in run telemetry (`evidence.groupingClaims`). Membership is now
  judged by ONE shared context used by both the decision creator and the
  execution verifier, ending the whole-word-vs-substring and
  verified-coordinate divergence between them. Enforced by
  `tests/assembly-ground-truth-arc-g.test.ts` (Schönbrunn's six stops,
  Prague Castle and the Malá Strana walk on the same day, the Jan-15
  booked walking tour, and the JAN-22 NO-GROUP guard the demotion-lane
  audit demanded) and `tests/grouping-claim-ledger.test.ts`.
- Tests: `tests/canonical-evidence-resolver.test.ts`,
  `tests/evidence-clustering.test.ts`, `tests/generated-trip-model.test.ts`,
  `tests/structured-assembly-idempotency.test.ts`,
  `tests/geocode-verification.test.ts`,
  `tests/assembly-ground-truth-arc-g.test.ts`,
  `tests/grouping-claim-ledger.test.ts`
  2026-07-28 (run 7.28.0, the first live run with G.3a/G.3b): coverage
  downgraded `PARTIAL` → `KNOWN_GAP` on Eli's explicit decision this date. The
  run shipped ZERO grouped stops and ZERO calls (baseline 7.26.1: 2 / 1;
  run-7.21.0: 13 / 3) with both Arc G grouping mechanisms live. Two days met
  every doctrine-v3 walk gate and still formed nothing (Jan 16: 12 cards /
  2 timed; Jan 19: 11 / 0). Two causes are traced, NEITHER attributable to the
  unpushed 0077c3a. (a) FALSE VERIFICATION: the geocoder returned the Prague
  city centroid `50.0755381,14.4378005` for three unrelated venues — Catacombs
  tour (Jan 14), Peklo and Changing of the Guard (both Jan 16) — and the lane
  stamped all three `geoVerified: true`, putting Changing of the Guard 3,108 m
  from the Prague Castle it happens inside. (b) The 84b8676 verified-only
  coordinate policy excluded St. Vitus Cathedral, 168 m from the castle but
  carrying an approx coordinate only. Prague Castle therefore had exactly two
  candidate children and the lane rejected both. Schönbrunn and Gloriette BOTH
  resolved (893 m apart), so the lookup budget did not starve the ship-bar
  targets; that group hinged entirely on the G.3a address path, which is
  unobservable because `formattedAddressCount` is dropped by the audit-snapshot
  whitelist. NEAR-MISS on the wrong-group bar: Peklo and Changing of the Guard
  share an IDENTICAL verified coordinate on the SAME day and were kept apart
  only by the timed-stop gate. Eli's decision this date: fix geocoder coverage
  and trust rather than relax verified-only — a wrong group stays worse than a
  missing one.
  2026-07-28 geocoder remediation pass LANDED (scope
  `docs/geocoder-remediation-scope-2026-07-28.md`, LOCKED with Eli; evidence
  `docs/assembly-defect-docket-2026-07-28-run-7.28.0.md`, bundle sha256
  `4db233d3…`). This is the EXECUTION of the standing decision already recorded
  in this ledger's v23 header, not a new decision — hence no version bump. Four
  changes to the geocode lane and NONE to grouping: the source-hierarchy path,
  the >=2-member floor and `createSiteMembershipContext` are healthy and
  untouched, because docket §A.4b proves Schönbrunn's failure is extraction-side
  (the model emitted one groupable child, and one is less than two, so no
  grouping change could have reached it).
  (a) BUDGET, D1: the `GEOCODE_VERIFICATION_MAX_LOOKUPS` default moves 50 -> 150
  as a HARD CAP, on measured arithmetic — run 7.28.0 spent 187.6 s of
  `maxDuration` 800 s, and 150 lookups adds at most 19 waves x 4 s worst case,
  leaving 70.5 % headroom against AGENTS.md rule 1's >=40 % bar.
  (b) LOCALITY GUARD, D2 — and this one NARROWS WHAT "VERIFIED" MEANS, which is
  the contract-adjacent part of this pass: a geocode result is no longer
  verified merely because it returned coordinates. `parseGeocodeResponse` now
  rejects a result whose Google `types[]` includes `locality`, `political`,
  `administrative_area_level_*`, `country` or `postal_code` — the endpoint
  saying it resolved a PLACE, not a venue. Rejection is NOT an error and NOT a
  maker question: the lane stays fail-soft and the piece simply keeps no
  verified coordinate. Because the verified-only coordinate policy (84b8676) is
  locked and consumes this definition, tightening the definition is the honest
  way to fix trust without relaxing the policy — which is exactly Eli's stated
  preference, a wrong group being worse than a missing one. It retires the
  MUST-PASS 7 near-miss in which Peklo and Changing of the Guard shared an
  identical verified coordinate on the same day, and stops the Prague centroid
  `50.0755381,14.4378005` being stamped `geoVerified: true` on three unrelated
  venues.
  (c) CONTAINER RETRY, D3: a locality-granularity result is retried exactly ONCE
  with the day's single named-site container appended ("Changing of the Guard,
  Prague Castle"), accepted only if it is non-locality AND inside the day's city
  bounds — taken from the viewport the rejected locality result already carried,
  so the mitigation costs no extra lookup and fails CLOSED when no bounds are
  available. Retries COUNT against the same cap, so the ceiling and its
  arithmetic hold exactly, and they run as their own waves so
  `waves = ceil(lookups / 8)` stays true. A day with two or more containers
  yields no retry context: ambiguous context is worse than none.
  (d) TELEMETRY, and it is a PRECONDITION rather than a nicety — it is what
  makes three changes in one run legitimate under rule 1, because it separates
  them after the fact. Per-candidate `{query, rank, outcome, retried,
  granularity, retryQuery}` now ships for the WHOLE candidate pool, INCLUDING
  candidates that never received a lookup — the record that did not exist when
  St. Vitus Cathedral lost its lookup and nobody could say why (docket §C).
  Alongside it, three fields that were computed and then dropped reach a served
  surface for the first time: `formattedAddressCount` (added to the
  audit-snapshot whitelist, which is why every G.3a address-path conclusion was
  previously unfalsifiable — absent read as zero), `evidence.groupingClaims`
  (produced since Arc G.3b with zero consumers repo-wide), and
  `transportFieldRepairs[].outcome` (support telemetry only, never
  maker-facing, per §Dark-factory).
  Verified coordinates remain proximity-only and consumed solely by
  grouping-proximity checks; no lookup changes intent, type, date, city, title
  or booking state. COVERAGE STAYS `KNOWN_GAP` on Eli's decision this date: no
  live run has yet produced a group, and fixture-green is never sufficient
  (§Coverage honesty). Restoring it is a run-2 decision on run-2 evidence.
  DEFERRED deliberately: candidate restriction ("only look up things that aren't
  obviously standalone", Eli 2026-07-28) is held for Arc H, because it tightens
  the same candidate ranker that just failed while that ranker is still
  unobservable — rule 7(b) violated in advance. Write it from run 2's
  per-candidate data, where every stop the rule would skip can be checked.
  Enforced by `tests/geocode-verification.test.ts` (G4.1-G4.4, including the D3
  budget ceiling and the out-of-city retry refusal).
  2026-07-28 (docket §G, shipped alongside): 31 cards rendered the LITERAL
  STRING "null" as their start time and 14 as their end time, producing summary
  text such as "null · Art and culture"; transport rows measured 0 affected, so
  the defect was confined to the activity projection. Assembly was recorded
  `completed` with output that fails the render boundary, against §Dark-factory:
  a stage may be recorded completed only after its output passes the validation
  required by the next persisted boundary. Repaired as a bounded deterministic
  parser artifact in `normalizeParserStageArtifacts`
  (`literal_null_time_field`), silently and counted, never as a maker Question,
  and ordered BEFORE the degenerate-time rule because two literal "null"s
  compare equal and would otherwise be mistaken for a zero-length window.
  Bounded to time fields and to the two stringified-nullish tokens observed.
  ORIGIN IS A HYPOTHESIS, labelled per rule 7(c): no pipeline code stringifies
  these fields, and the three qa-bundles on disk (7.17.1, 7.21.0, 7.21.1b) carry
  zero literal-"null" time fields through the same projection, which points at
  the model emitting the four characters — NOT confirmed against the pinned
  parse. The repair is correct under either origin. Enforced by
  `tests/literal-null-time-fields.test.ts`.
  2026-07-31 (run 2, work order): coverage upgraded `KNOWN_GAP` → `PARTIAL` on
  Eli's explicit decision this date. Run 2 produced **2 grouped stops, both
  correct, and ZERO wrong groups** (Schönbrunn) — the first live evidence since
  the collapse that the mechanism works on real parse output. Under §How to use
  this ledger, `KNOWN_GAP` asserts that current behavior VIOLATES the contract,
  and that assertion is no longer true: the source-hierarchy path carried the
  members, the >=2-member floor was met, and the wrong-group bar held.
  THE UNCOVERED PATH, named rather than hidden by the label: the TARGET (Prague
  Castle) has never grouped on a live run. Its cause is no longer a mystery —
  `reclassifySourceContainers` demoted the dated container to context, verified
  from run 2's pinned parse (see RW-PLC-001, 2026-07-31) — and the repair has
  landed with fixture coverage, but no run has yet shipped a dated, eligible
  castle container. `PARTIAL` is the honest state for exactly that shape:
  meaningful behavioral coverage exists, and an important live path does not.
  Also corrected this date: docket §A.4b's "Arc G could not have grouped
  Schönbrunn at all" is amended in place to state that its proof was
  CONDITIONAL on the 7.28.0 parse. Run 2's parse emitted the second groupable
  child the proof assumed impossible, which is precisely how these 2 groups
  came to exist, and the general framing had already misled one session.
  2026-08-02 (run 8.1.0, trip `4eaf3c6c`): **the wrong-group bar broke, and the
  v24 upgrade's justification no longer holds.** Grouped stops went 2 -> 7, and
  two of the seven — `Museum of Illusions` and `Ring Tram Tour` — are named
  BY NAME in `docs/assembly-ground-truth-central-europe.md` as Vienna city-note
  ideas. The mechanism is verified and is the reason the 2026-08-02 provenance
  rules above exist. G4.3's retry appended the container title to the query
  (`"Museum of Illusions, Vienna"` -> `"Museum of Illusions, Schönbrunn
  Palace"`, 9 retries, all 9 accepted, `retryOutOfCityCount 0`), the geocoder
  returned the palace, and the resulting address naming Schönbrunn was read by
  `hierarchyMember` (`evidence-clustering.ts:8436`) as SOURCE hierarchy. The
  maker-facing Call therefore read "the source lists 7 stops"; the container's
  own description lists five. `sameSiteClaimText` emits that wording only when
  `geoChildCount === 0`, so all seven were recorded as source-placed, and
  because hierarchy members are not contestable (`contestable()` requires
  `strength === "geo"`), the walk lane could never release them.
  The discriminator was present in the data throughout: every CORRECT child
  resolved to its own location (Gloriette 890 m, Palm House 752 m,
  Orangeriegarten 313 m from the palace) and every WRONG one resolved to the
  palace centroid `48.1858124,16.3127641` exactly — which is the echo rule
  above. Museum of Illusions is 4.81 km from the point it was assigned
  (Wallnerstr. 4, 1010 Wien). The same run put three distinct venues on the
  Prague Castle centroid (`Prague Castle`, `Changing of the Guard`, `Trdelník
  for breakfast`), so the MUST-IMPROVE "no two venues sharing a verified
  coordinate" item also failed.
  ONE UNOBSERVED LINK, labelled per rule 7(c): `verifiedFormattedAddress`
  reaches no served surface, so the address TEXT is a HYPOTHESIS while the
  admitting path is VERIFIED BY ELIMINATION — of `hierarchyMember`'s four paths,
  the container description does not list either title, neither title contains
  the container's full title, and neither contains the token `schonbrunn`,
  leaving only the address path.
  COVERAGE WAS LEFT OPEN AND WAS ELI'S CALL. It was made on 2026-08-03 and is
  recorded immediately below; `PARTIAL` did not survive this evidence. The
  argument for returning to `KNOWN_GAP` was that this contract says a
  mixed-geography list stays individual cards and a 4.81 km outlier inside a
  palace visit is that; the argument against was that the cause is now
  understood and fixed in specification. No coverage state was changed without
  an explicit decision.
  2026-08-03 (Eli's explicit decision): coverage `PARTIAL` → `KNOWN_GAP`. Two
  wrong group members on the MAIN path is behavior violating the contract, and
  v24's justification — "2 grouped stops, both correct, ZERO wrong groups" — is
  no longer true, so the label that asserts a violation is the honest one.
  The argument-against is explicitly rejected on §Coverage-honesty grounds:
  "fixed in specification" is not coverage, and this ledger has now spent four
  sessions re-litigating one entry's label. Therefore, recorded WITH the
  decision:
  (a) RETURN CONDITION — `PARTIAL` is restored only by a LIVE RUN that ships
  ZERO wrong groups. Not specification, not fixture-green, and not a replay:
  the geocode lane is not pinned (`scripts/replay-pinned-parse.mjs:14`) and the
  wrong-group path runs through `verifiedFormattedAddress`, which only exists
  when that lane runs (docket 2026-07-31 §6.3). A replay showing a clean
  Schönbrunn group is silence, not evidence.
  (b) LAST HAND-SET CHANGE — this is the final coverage state for this entry
  set by argument. From `scripts/scorecard.mjs` onward, coverage is DERIVED
  from assertions: the approved ground truth
  (`docs/assembly-ground-truth-central-europe.md`) compiled into executable
  checks, each labelled with the entry it proves, scored PASS / FAIL /
  NOT BUILT / NOT CHECKABLE. The three non-PASS states are separated
  deliberately, because collapsing them is what let this entry drift — an
  unimplemented 2026-08-02 decision and an unobservable field were both being
  counted the same way as working code. NOT CHECKABLE is a defect in its own
  right and is never permitted to score as a pass.
  (c) The scorecard also audits THIS LEDGER, not only the code: an entry
  claiming `ENFORCED` or `PARTIAL` while the scorecard finds no implementation
  for one of its clauses is reported as a ledger defect, separately from code
  defects. That check is the one that would have caught this entry early.
  2026-08-05 source-bounded retry implementation (G5.1/G5.2; pinned run 8.1.0
  provider output): the previous “no shared verified coordinate” scorecard
  assertion was not the contract. Exact shared points are legitimate for
  spelling/meal aliases and estate components resolved to the estate address.
  The causal defect was a locality retry appending the day's single container
  even when that container's own description did not name the candidate.
  Container-context retries now require that source relationship before a
  lookup is sent. Matching is accent/case insensitive and permits one bounded
  long-token edit only when the remaining meaningful title tokens agree
  (`Studel` / `Strudel`); short neighboring names do not fuzzy-match. Non-atomic
  grouping-proposal containers supply the relationship ledger but are never
  geocoded themselves.

  Candidate telemetry now serves stable id, container title, and
  source-support verdict. Offline replay matches all old provider attachments,
  then applies the current acceptance boundary: four source-listed retries
  remain accepted (Changing of the Guard, Apple Strudel ×2, Panorama Train),
  while five source-unlisted retries are rejected before coordinates reach
  assembly (Museum of Illusions ×2, Ring Tram Tour ×2, Trdelník). Schönbrunn
  again owns exactly its five source-supported stops. Pinned score is **FAIL 1
  · NOT CHECKABLE 0 · NOT BUILT 2 · PASS 28**; `GRP-2` PASSes on the causal
  ledger. Enforced by `tests/geocode-verification.test.ts` and
  `tests/arc-f-telemetry.test.ts`; work order:
  `docs/geocoder-retry-containment-work-order-2026-08-05.md`.

  Enforcement deliberately remains `KNOWN_GAP`: Eli's 2026-08-03 return
  condition requires a fresh live run with zero wrong groups. The replay now
  exercises the current acceptance policy exactly, but it is not new live
  provider coverage and does not supersede that explicit condition.
  2026-08-06 fresh-run evidence: every shipped child was source-supported, but
  only Prague Castle was complete. Schönbrunn retained two of five required
  children, the Jan-15 tour and Malá Strana groups were absent, and the
  Schönbrunn Call described source membership not present in the parent state.
  Thus the narrow zero-wrong-member condition was observed, while executable
  completeness/truth assertions still fail and coverage remains `KNOWN_GAP`.

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
  2026-07-18 Arc B (live-run 7.18.3 PB-1b/1c + run5 PB-7): the
  transport-shadow gate now also recognizes airline flight-code shapes
  ("Ryanair FR8331 to Prague" carries no movement word) and
  shared-confirmation matches, and the pass re-runs after structural +
  provisional dates resolve so late-dated shadows are caught; the
  ticket-page family covers ACTIVITY-shaped re-emissions
  (all-ticket-vocabulary titles with quantity/price/ticket-number
  boilerplate); airport-prep lines ("Leave for Airport") fold into their
  same-date travel row; transport provider fields are repaired at the
  anchor AND parser layers (layout bleed, short-token shards,
  number-shaped providers). Enforced by
  `tests/assembly-ground-truth-run6.test.ts` and
  `tests/parser-artifact-normalization.test.ts`.
  2026-08-06 fresh-run evidence: `30-minute walk`, `Payment due`, `Wi-Fi`, and
  `Return` ship as standalone Activities despite raw note/admin/accessory
  roles; Laundry loses its dated Activity home; and Great Market Hall, House of
  Terror, New York Cafe, and Hospital in the Rock are suppressed without a
  durable intended carrier. One-home coverage remains `PARTIAL`.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`, `tests/generated-trip-model.test.ts`,
  `tests/assembly-ground-truth.test.ts`,
  `tests/parser-artifact-normalization.test.ts`,
  `tests/assembly-ground-truth-run6.test.ts`

## RW-TRV-001 — Travel cards are per-segment and cover every night

- Status: `LOCKED`
- Decision date: `2026-08-06`
- Supersession: the 2026-08-06 sequencing ruling keeps the travel-card privacy
  shape but defers maker password controls and password-mode browser QA until
  after the extraction/assembly pass. Their absence is not a failure of the
  current live run.
- Enforcement: `PARTIAL`
- Contract: A travel card is a subset of activity cards covering one individual
  flight, train, ferry, or bus segment that makes an inter-city transfer and
  changes where the traveler sleeps. One card per segment; connections are
  never merged into a single card (a two-flight connection is two travel
  cards). The travel-card treatment exists so protected booking details blur
  cleanly. (2026-07-25, Δ4 — see RW-PRI-001: "blur cleanly" is now specified.
  A travel card's DESCRIPTION is a protected container unlocked by ONE
  password entry, while the card face is composed from structured route/time
  fields and stays public. This serving path is implemented and route-tested;
  maker UI and fresh production publish/browser proof are explicitly deferred,
  so enforcement remains `PARTIAL` and the prose-side code sweep stays
  load-bearing. Those deferred items are not part of the current assembly
  gate.) A same-day round trip that returns to the same stay — such as a
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
  2026-07-24 Arc F stay candidacy gate (live-run 7.23.2 chain 2: phantom
  public stay "Eli J Kamerow" — dateless, leg-less, minted from a booking
  passenger field; stays had NO candidacy rule): a stay record requires
  night evidence (check-in, check-out, or first-night date). The gate runs
  at `reconcileCanonicalStayIdentity` time, after guessed stay dates apply
  and before the deny-list build, accessory attachment, and stay-collision
  warnings (tripwire T2); person-name-shaped dateless stays are suppressed
  as booking material with an auditable disposition, and a suppressed
  phantom still contributes to the protected-value deny list. Enforced by
  `tests/stay-candidacy-gate.test.ts` (live phantom shape, single-boundary
  negative controls, proven both directions).
  2026-07-24 Arc F.2 (run 7.24.1 chains A+B): transport candidacy floor —
  a row with neither endpoint location and no matching source anchor is
  booking material, never a travel row (the live 9th row "Train ticket",
  Jan 24, null→null, a second ÖBB OCR reading whose departure time kept it
  alive); suppressed fragments keep feeding the protected-value deny list
  (transport now mirrors T2's stay property). Stay candidacy gained a
  venue-shape test: document-artifact-shaped names (itinerary / "by day N"
  / filename shapes — the live "Visitacity itinerary by day 3" carried a
  full night range and passed the night rule) fail candidacy regardless of
  dates; same-leg strictly-overlapping stay ranges raise the quiet
  `same_leg_stay_night_overlap` P2 (never a hard warning — CEO decision,
  F.2 session). Enforced by `tests/transport-candidacy-floor.test.ts` and
  `tests/stay-venue-shape.test.ts` (live shapes verbatim, negative
  controls: Delta 2934, missing-arrival-time, anchored endpoint-less row,
  Wombats "The Lounge", Prague Airbnb).
  2026-07-31 (run 2 §3, work-order Task 3 — the 6th stay): `Rome Stay`
  (Jan 12-14) shipped beside `The Yellow` (Jan 13-14) on the same leg. The
  reconciler was not wrong to decline — Pass 1 merges on VENUE identity and
  the names share no token, Pass 2 requires a fragment with no checkout and
  `Rome Stay` carried one. A third pass now absorbs a GENERIC PLACEHOLDER
  stay into the single named venue it overlaps, where "placeholder" means a
  name whose only surviving identity token is its own CITY token
  (`finalizeCanonicalStayFields` has already rewritten every unnamed stay to
  `<City> <Type>` by reconcile time, so the city token is exactly what a
  placeholder has left, and it names the leg rather than the venue). Overlap
  is never sufficient on its own. Guards, each pinned by a fixture-proven
  negative control: an anchored placeholder (address or booking code) is real
  lodging and survives; an ambiguous placeholder with two named same-city
  venues in range stays put, because guessing which one it duplicates is a
  wrong merge and a wrong merge is worse than a duplicate; a non-overlapping
  placeholder survives, because absorbing it would delete real night
  coverage. THE NAMED VENUE'S DATES ALWAYS WIN (Eli, 2026-07-31): the
  placeholder contributes no dates, so this cannot pull `The Yellow` back to
  a Jan-12 check-in — the Jan-12 night is covered by the overnight Delta 444
  arrival and this contract forbids fabricating a stay for a night in
  transit. The discarded range is recorded on the merge action, so dropped
  coverage is auditable rather than silent. Enforced by
  `tests/generic-placeholder-stay.test.ts` (live run-2 shape verbatim plus
  four negative controls, proven both directions).
- Tests: `tests/assembly-ground-truth.test.ts`,
  `tests/generic-placeholder-stay.test.ts`,
  `tests/source-transport-anchors.test.ts`,
  `tests/stay-candidacy-gate.test.ts`,
  `tests/transport-candidacy-floor.test.ts`,
  `tests/stay-venue-shape.test.ts`

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

  2026-08-02 additions (Eli-approved) — INTENT IS TYPED PER BLOCK, NOT PER DAY.
  **Date belongs to the source section; intent belongs to the smallest coherent
  block.** A dated heading establishes temporal context ONLY; it does not
  establish commitment. One dated day section may contain a plan block, an idea
  block, logistics and receipt evidence, and each is classified independently.
  This extends the existing "a loose ideas list after the itinerary remains City
  Notes" rule, which covers only a list POSITIONALLY separate from the
  itinerary, to an idea block sitting INSIDE a dated day section.

  Three layers, in order: (1) COMMITMENT, per item, independent of neighbors — a
  time, booking, ticket, reservation, confirmation code, or first-person intent
  language makes it an Activity, and this is never demotable downstream; (2)
  BLOCK TYPE, inherited by the block's items as their default — plan, ideas,
  logistics or evidence — with strong item-level evidence overriding the default
  in BOTH directions (a booked 2:00 PM ticket inside an ideas block is an
  Activity; "maybe the museum" inside a plan block is not committed); (3)
  DENSITY, which remains what this contract already says it is — a soft trigger
  that prompts re-evaluation and never a classifier. An overfull day means layer
  2 mis-typed a block, and the response is to re-examine the BLOCK, never to
  rank a day's items and demote the weakest, which would make a card's fate
  depend on its neighbors and reintroduce run-to-run instability. Where the
  block is genuinely ambiguous, that earns ONE consolidated Question. The
  density trigger fires on a shape, not on a count; it is not to be reimplemented
  as a second tunable threshold constant.

  BLOCK BOUNDARIES ARE DETECTED FROM DURABLE SIGNALS. Layout is the first thing
  OCR destroys, so boundary signals are ranked by survivability rather than by
  kind. DURABLE, and primary: explicit language ("other ideas", "options", "if
  we have time"), and a sustained shift in item shape across multiple peer
  items. FRAGILE, and corroborating only: indentation, blank lines, hierarchy
  reset. A blank line without an intent shift is not a boundary. One anomalous
  item inside an otherwise coherent block is classified individually rather than
  splitting the block.

  DAY HEADINGS ARE NOT A CLASSIFICATION INPUT (Eli, 2026-08-02): thematic day
  headings are a convention of the current test corpus, not a general one.

  GEOGRAPHIC COHERENCE TYPES A FLAT LIST. A flat list of peer venue names is
  plan-shaped when its members cluster tightly and idea-shaped when they scatter
  across the city; where the day has a committed anchor, distance from that
  anchor is the second reading. This is the ONE place geography participates in
  classification, and it is a different job from RW-GRP-001's containment test:
  here geography corroborates a CLASSIFICATION, there it would establish
  CONTAINMENT. A wrong answer here misfiles a note; a wrong answer there
  fabricates a claim about the source. Ordering consequence, to be implemented
  in this order and not the reverse: classification needs coordinates before it
  knows what is a note, so City Notes do not CARRY coordinates rather than being
  never geocoded — geocode during classification and discard the coordinate for
  whatever lands in Notes. City Notes have no map and no coordinates in the
  traveler app.

  CITY NOTES ARE KEYED TO A CITY AND ANCHORED ON ITS LEGS (Eli, 2026-08-02),
  which extends this contract's existing "one City Note per city" rule to a trip
  that visits a city twice. One set of notes per city, surfaced on EVERY leg for
  that city — Rome leg 1 and Rome leg 2 show the same notes. Notes are keyed to
  the city, not owned by a leg; a leg is a display anchor. "City" here means LEG
  city: a day-trip town has no leg of its own (a day trip is a group of activity
  cards on one day within a leg, per RW-GRP-001), so its notes belong to the
  parent city's set. A City Note has no day. Implementation note, because the
  current attachment path makes this easy to get wrong:
  `findLegForCanonicalCity` (`lib/extraction/draft-to-structured-trip.ts`)
  returns the FIRST leg matching a city name, so a leg-owned model would put
  every dateless Rome note on the January 12 leg and none on the January 24 one.
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
  2026-07-18 remediation Phase 0 (audit finding B1): the commitment
  pattern's first-person contraction alternations ("we'll", "we're",
  "we'd like") were tested against apostrophe-stripped normalized text and
  had never matched; the pattern now matches the normalized forms, so
  contracted first-person intent counts as commitment evidence again.
  Enforced by `tests/cleanup-cron-route.test.ts` (commitment checks).
  2026-07-18 Arc A (live-run 7.18.2 PB-3: "Explore Vienna" — the non-date
  remainder segment of the Jan 18 heading — shipped as a Jan 19 card):
  parser-artifact normalization now also demotes a card whose title is one
  verb+city segment of its OWN day heading (`heading_fragment_card`
  repair), using the shared heading-fragment predicate and each card's own
  sourceSectionLabel/sourceHeadingPath, so the fragment is caught even when
  it ships on a different day than its heading. The researched-list
  question additionally excludes "X at Site" component titles when the site
  is named by a container noun or any co-extracted piece (run5 PB-3: the
  orphaned "Orangeriegarten at Schönbrunn" component leaked into a bogus
  planned-or-ideas question). Enforced by `tests/entity-winner.test.ts` and
  `tests/assembly-ground-truth-run5.test.ts`.
  2026-07-18 Arc B (live-run 7.18.3 PB-4/PB-8; CEO decision A-6): the
  UNIFIED activity-vs-city-note/commitment classifier is live
  (`lib/extraction/activity-classifier.ts`) — ONE module judging source
  structure, list shape, and commitment language (never venue knowledge)
  that the parser-output layer, demotion rules, the LLM resolver, the
  recovery lane, and the audit detectors import. Own-text hedge/commitment
  stamps are recorded at intake, so doubt demotion and commitment fire on
  the piece's OWN observation text only (absorbed sibling residue
  hedge-demoted Prague Castle in 7.18.3); stamps propagate only between
  comparable-title copies. A dated idea list demotes as a unit when a
  same-day section holds 3+ entries with NO fixed commitment plus idea
  vocabulary, a non-day-plan structural section label, or a
  recommendation-category majority (the Jan 21 Great Synagogue / Konyv Bar
  / Mazel Tov / gypsy-music dump) — priced/hours entries stay with the
  researched-list question, unresolved "X or Y" slot cards and unlabeled
  sections are never judged. "if you want / if you'd like / if you feel
  like" joined the hedge vocabulary. The resolver's plan signal imports
  the taxonomy commitment lexicon (audit B1 — bare sight verbs no longer
  promote), and recovered lines route through the same classification
  (PB-9: loose-tip recovery output becomes city-note candidates). Enforced
  by `tests/activity-classifier.test.ts` and
  `tests/assembly-ground-truth-run6.test.ts`.
  2026-07-24 Arc F (live-run 7.23.2 chain 4, tripwire T4): the Costs
  exclusion is enforced at CANONICAL CANDIDACY, not per producer. ONE
  shared predicate (`isPlanningCostMaterial`, source-coverage.ts) is
  consumed by recovery batching (ddb1699's lane), piece-creation candidacy
  (before all reconciliation, so card/note reconciliation still sees
  original note lists), and a new `planning_cost_line_shipped_as_card`
  audit tripwire — the shipped "Vienna lodging cost" card was the same
  Costs line the recovery exclusion had already suppressed, arriving
  through a second path. ddb1699's negative controls (stay costs due on
  arrival, HUF prose, priced venue/idea lines) hold at candidacy. Enforced
  by `tests/planning-cost-candidacy.test.ts` (suppressed-twin/shipped-card
  pair, proven both directions).
  2026-07-24 Arc F.2 (run 7.24.1 chain D; CEO decisions, F.2 session):
  notes are the recommendation taxonomy on EVERY lane — the run8 filters
  gated only the restore pass while the initial city-note render excluded
  nothing but the old costs pattern, so the live Rome Notes & Tips shipped
  an access block, raw ticket OCR, and a lodging-cost line through the
  front door. One segment safety classifier now gates both the initial
  render and the restore pass: costs (including shared planning-cost lines
  and a lodging-cost shape — no lodging cost ships anywhere public, the
  amount-due-at-check-in exception lives as a protected stay detail),
  access/credential material (routed to the same-city stay), and
  booking/receipt boilerplate (FAHRSCHEIN/Zugbindung-class OCR), each
  exclusion recorded as a disposition. The shared ledger-line pattern now
  accepts the em dash the live line used ("January 24th Rome—$118").
  ddb1699 negative controls held (HUF prose, priced venue/idea lines).
  Enforced by `tests/note-lane-protections.test.ts`.
  2026-08-02 (block intent; run 8.1.0 evidence, coordinates from that run's
  audit payload). The City Note lane is materially under-firing: run 8.1.0
  shipped 68 active Activities against 3 active City Notes, while the approved
  ground truth files nine January-19 Vienna entries as city notes on that day
  alone. The run also raised FIVE `activity_bloat` warnings — the system
  observing its own misclassification and reporting it as a quality warning
  instead of resolving it, which is precisely what this contract's
  density-as-soft-trigger clause exists to prevent.
  The geographic-coherence rule is verified across three days of the corpus.
  Jan 16 (plan): Trdelník, KGB museum, Kafka statue, John Lennon Wall, Novy
  Svet — all Malá Strana, a few hundred metres apart. Jan 19 (ideas): Ferris
  wheel at the Prater (48.2167,16.3959), Hundertwasser Haus
  (48.2073,16.3943), Museum of Illusions (Innere Stadt), Leopold
  (Museumsquartier), St. Charles (Karlsplatz), Mozarthaus (Domgasse) — four
  districts, 5+ km from that day's Schönbrunn anchor. Jan 20 (plan): Cafe
  Central, Jewish Museum, St. Stephen's, the Library, Kunstforum — all Innere
  Stadt, inside ~700 m, which the ground truth independently calls "a short,
  deliberate list = selected untimed activities." The rule also reproduces the
  ground truth's existing resolution of St. Stephen's, which appears in Jan
  19's scattered list and Jan 20's tight one, with the tight one winning.
  OCR flattening is demonstrated in the same run rather than assumed: the
  `day_section_source_line_unextracted` diagnostic attributes a German rail
  ticket's lines (`FAHRSCHEIN`, `Zugbindung`, `01 ERWACHSENER`, `Abfahrt:
  10:42`) to a Rome LODGING day-section, which is why boundary detection may
  not rest on layout.
  2026-08-05 pinned replay: the R2D2 City Note loss was measured through every
  stage. Demotion, Prague grouping, initial section rendering, and the
  collection-integrity check all worked. The generic final description
  sanitizer joined newline-delimited City Note sections before applying its
  privacy gate; a phone in a later Getting Around section therefore removed
  the preceding safe Sights & Culture section with R2D2. Newline sections are
  now sanitized independently, preserving R2D2 while still removing the phone.
  Enforced by `tests/city-note-demotion-preserves-city.test.ts` B7.2. The three
  `ORD-1` losses used a separate accessory-routing survivor chain and were
  subsequently fixed and recorded under RW-ORD-001; they are not attributed to
  this classification fix.
  2026-08-05 block-intent implementation: classification now runs after dates
  settle and before slot/title/repeat identity. A pure classifier emits
  `plan`, `ideas`, `logistics`, `evidence`, or `ambiguous` per coherent source
  block. Fixed/sequence evidence and explicit source choices may anchor peers;
  site containment is item-scoped, so a geocoder echo cannot turn an unrelated
  nearby venue into plan content. Once verification ran, parser coordinates
  are not classification evidence. Every decision reaches
  `report.canonicalization.intentBlocks` with date, member/observation ids and
  the rule that fired. The old date-wide classifier cannot override a stamped
  block decision. New summaries no longer emit a maker-facing
  `activity_bloat` warning from a card-count threshold; the warning code is
  retained only to read historical snapshots.

  Pinned result moved from the corrected geocode-on baseline **FAIL 10 · NOT
  CHECKABLE 1 · NOT BUILT 3 · PASS 17** to **FAIL 3 · NOT CHECKABLE 1 · NOT
  BUILT 2 · PASS 25**. Jan 19's loose venues reach Vienna City Notes,
  Schönbrunn has exactly five supported children, and Jan 20 keeps all five
  selected activities including St. Stephen's. The entry remains `PARTIAL`:
  the approved Mumok/Natural-History disjunction is not present in either
  pinned source layer, so the implementation preserves that researched pair as
  ambiguous instead of inventing `or`. Full suite and typecheck pass.
  2026-08-05 city-identity implementation: structured City Notes now carry a
  durable `cityNoteKey` and always project with `date: null` and `legId: null`.
  Explicit canonical city wins; otherwise an in-range source date may derive
  the parent leg-city for a day-trip note before the date is discarded. One
  shared helper drives repeat-city display, summary, review, maker move/merge
  decisions, fingerprints, and served audit lineage. Same-named cities in
  different countries remain separate; unplaceable notes are retained in
  `needs_review`; old leg-owned snapshots remain readable. Pinned `CLS-3` is
  now PASS and the overall replay is **FAIL 1 · NOT CHECKABLE 0 · NOT BUILT 1
  · PASS 29**. Enforced by `tests/generated-trip-model.test.ts` and documented
  in `docs/city-keyed-notes-work-order-2026-08-05.md`.
  2026-08-06 fresh-run evidence: the block classifier's saved decisions did not
  prevent earlier card/note suppression or later candidacy drift. Accessory and
  admin fragments became Activities, selected Albertina/Laundry/Koscom content
  landed in the wrong home, and loose recommendation content became dated
  cards. The classifier remains `PARTIAL`; fixture-green does not cover the
  production ordering and contradiction shapes.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/canonical-evidence-resolver.test.ts`,
  `tests/assembly-ground-truth.test.ts`,
  `tests/parser-artifact-normalization.test.ts`,
  `tests/activity-classifier.test.ts`,
  `tests/arc-f-telemetry.test.ts`,
  `tests/generated-trip-model.test.ts`,
  `tests/planning-cost-candidacy.test.ts`,
  `tests/note-lane-protections.test.ts`

### 2026-07-21 Arc C evidence (RW-CLS-001, live-run 7.21.0, run7 PC-1/PC-3)

The classifier's LOGIC held on live shapes; its INPUTS were broken and are
repaired: (a) committed-day-content guard — an entity named in its own
day-section heading ("Lesser Town & Prague Castle") never demotes via the
planned-or-ideas hold or idea-list demotion (7.21.0 held the castle "as a
city idea" and shipped the day without a castle card, 3rd distinct kill
mechanism in 3 runs); (b) availability means OPENING info, never duration
("castle (2 hours)" matched bare `hours` and read as research); (c) the
meal-slot commitment anchor comes from the TITLE only — the parser invents
meal prose for bare list entries ("Dinner at Mazel Tov restaurant."), which
stamped fixed commitment and poisoned the whole Jan-21 section against
demotion; (d) idea-list groups unify day-plan section labels per date
(parser label fragmentation split one source list below the 3-entry floor);
(e) question subjects protect their entity under aliasing ("Gellert Baths"
vs "Gellert Bath House"); (f) own-text stamping judges hedges/commitment
from the parser's VERBATIM `evidence` excerpt when present (new schema
requirement — the parser strips "(far away)"/"maybe"/prices from prose,
which blinded R2D2, Museum of Communism, and the Vienna trio's researched
signal). Enforced by `tests/assembly-ground-truth-run7.test.ts` with the
exact live payload shapes.

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
  dropped-line shapes.
  2026-07-18 Arc A: the contract's bounded excerpt-only model recovery call
  is now IMPLEMENTED (`lib/extraction/source-recovery.ts`, wired in
  `openai-trip-parser.ts`). The deterministic coverage diagnostic is its
  ONLY trigger. One batched excerpt-only call per build (a prior recovery
  stage blocks a second call), hard env-tunable input/output/line caps
  (OPENAI_RECOVERY_MAX_INPUT_CHARS/[…]_MAX_OUTPUT_TOKENS/[…]_MAX_LINES),
  model = the extraction model unless OPENAI_RECOVERY_MODEL overrides, no
  incomplete-output retry (the lane never retries itself), over-cap lines
  counted in telemetry (never silently dropped), and usage recorded
  separately as `usage.sourceRecovery`. Recovered observations enter
  assembly as a normal late stage — a synthesized model_chunk
  EvidenceStageInput whose sourceText is the excerpt batch, so the standard
  resolver, clustering, and source-truth verification judge recovered
  records exactly like parser output (a recovery record with no excerpt
  support is suppressed). Reported coverage is reconciled against the
  recovery output: recovered lines clear, residual drops stay flagged by
  the quiet P2 advisory. On call failure the usable draft survives and ONE
  precise maker Question ships (subject trip, targetField sourceRecovery,
  confirm — the established failed-chunk shape). The coverage diagnostic
  itself was calibrated (version 2, run5 noise items): OCR page markers and
  ticket boilerplate are excluded, a line covered by ANOTHER stage's output
  (spine included) counts as cross-stage content rather than a drop, and
  the FULL residual uncovered list plus recovery telemetry ship in the
  audit extraction summary and QA bundle. Enforced by
  `tests/source-recovery.test.ts` and `tests/source-coverage.test.ts`.
  2026-07-18 Arc B (live-run 7.18.3 PB-3/PB-9): coverage is version 3 —
  PER-CLAUSE matching. A source line splits on and/or/commas, EACH
  clause's distinctive tokens must be covered, cross-stage credit never
  spans clauses, and a short clause in a multi-entity line requires FULL
  token coverage (a shared generic "baths" token can no longer mask
  Szechenyi; koscom stays flagged when another stage covers
  communism+museum). Single-clause lines keep majority matching so the
  run5 noise calibration holds. Uncovered clauses ride in telemetry. This
  is the recovery lane's trigger integrity. Recovered records now BIND
  their date to their excerpt's own day heading (section attribution by
  distinctive tokens); an unattributable model date matching no excerpt
  heading clears instead of shipping (the Cesky-Krumlov-as-Rome-day
  shape), and recovered note-ish lines classify as city-note candidates
  before entering assembly.
  2026-08-06 fresh-run evidence: the primary parse completed 30/30 chunks with
  zero rescues, but source recovery did run once over 45 lines, recovered 29,
  and left 56 meaningful residual lines uncovered. All 352 observations have a
  persisted disposition, yet disposition accounting did not guarantee a final
  semantic carrier; the next pass adds carrier-level conservation rather than
  treating a survivor id as proof.
- Tests: `tests/canonical-factory-boundary.test.ts`,
  `tests/canonical-regressions.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/extraction-route-recovery.test.ts`,
  `tests/trip-quality-gate.test.ts`,
  `tests/source-coverage.test.ts`

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
  escape scheduling ambiguity. Placement first follows trustworthy source
  proximity; if none exists, it uses the first full day in the matching city,
  then the first city day as a fallback. A date answer is limited to the trip
  window and moves that same canonical Activity.

  2026-08-02 addition (Eli-approved) — **SYNTHESIZED PLACEHOLDER RECORDS ARE
  ABOLISHED.** There are four traveler-facing homes: Stay, Transport, Activity
  and City Note. Legs are the asserted spine, not a fifth home. Roamwoven never
  invents a record so that an orphaned Question has a subject.

  This is an ENFORCEMENT of this contract rather than a change to it: the text
  above already requires that a source-supported Activity with an unresolved
  date STAYS an Activity with a provisional date and one bounded Question, and
  never says a placeholder may be synthesized. It also settles the
  committed-but-undated case (a booking whose date exists only in material OCR
  failed on): provisional date plus one bounded Question, exactly as written.

  Under RW-ORD-001 Invariant A the orphan case cannot arise, because the
  Question's subject is still present. Where a Question's subject was NEVER
  EXTRACTED — as distinct from deleted — the Question is dropped from the maker's
  queue and recorded in the audit as a source-coverage finding, because it is
  evidence of an extraction miss rather than a maker decision.
- Evidence: A committed undated Activity now receives a provisional matching-city
  date, prefers the first full city day, and carries one bounded date Question
  that moves the same canonical record. The remaining gap is a deterministic
  placement fallback when the canonical trip spine itself has no usable place
  boundary.
  2026-07-27 Arc G.1 (run 7.26.1 header defect): the trip date range is
  SPINE-ANCHORED. Legs, transport rows and stays define the window; an
  itinerary item's date participates only when it falls inside a window it
  cannot itself create, and a draft with no spine at all keeps the previous
  behavior. Run 7.26.1 shipped a 2018 header over a 16-day trip because two
  `itemType: note` records anchored to no leg carried 2018 dates and one of
  them became `trip.startDate` verbatim — while the spine (5 legs / 8
  transport / 5 stays) was GT-exact beside it. Notes also stopped being
  structurally unflaggable: `reviewRequired` was hardcoded false for every
  note, so a note with a garbage date could never surface. An UNDATED note
  is the normal City Note shape and stays a clean draft; a note carrying a
  date that anchors to no leg is now `needs_review`. Dated-but-unanchored
  ACTIVITIES are deliberately unchanged — that is demotion-lane work, out
  of Arc G's scope. Publishing still never blocks (GT:269). Enforced by
  `tests/assembly-ground-truth-arc-g.test.ts`.
- Tests: `tests/generated-trip-model.test.ts`,
  `tests/evidence-clustering.test.ts`,
  `tests/structured-assembly-idempotency.test.ts`,
  `tests/assembly-ground-truth-arc-g.test.ts`,
  `tests/site-container-survives-rejected-grouping.test.ts`
  2026-07-28 (run 7.28.0): coverage downgraded `PARTIAL` → `KNOWN_GAP` on
  Eli's explicit decision this date. Prague Castle shipped TWICE —
  `piece_e97bee98` as a dated Jan-16 draft activity, and `piece_264b4ac8` as an
  UNDATED `itemType: "placeholder"` in `needs_review` carrying "Need to decide
  which ticket to get". That is duplication plus the dateless stranding this
  contract forbids, on deployed code, independent of the unpushed commit and of
  the geocoder defects — fixing the geocoder will not change it. Downstream
  cost: the castle decision fragmented into THREE open questions (Changing of
  the Guard ticket, Prague Castle ticket, St. Vitus tour) against a
  ground-truth budget of three questions for the ENTIRE trip, violating Δ2
  amendment 2 ("St. Vitus folds into ONE castle ticket question"). Chains A and
  D of the run-7.28.0 docket are one wound: with no castle parent, each
  sub-stop keeps its own decision.
  2026-07-31 — ROOT CAUSE FOUND, and it is neither the model nor the geocoder.
  VERIFIED from run 2's pinned parse (`trip_extraction_parses`, parse key
  `5d2ad2d66cba52f5…`): the model emitted "Prague Castle visit" AND "Prague
  castle" as `evidenceRole: grouping_proposal`, `itemType: activity`, both
  `date: 2019-01-16`, both `sourceSectionType: dated_itinerary`,
  `sourceSectionLabel: "Wednesday, January 16th"`. The source agrees — `USE
  FOR TESTING CZECH.pdf` carries "Prague castle (2 hours)" inside the dated
  Jan-16 day section under the heading "Lesser Town & Prague Castle", with
  "Changing of the Guard -12:00 PM" and "Need to decide which ticket to get"
  beneath it. The model did exactly what the parser prompt's grouping-proposal
  rule asks. `reclassifySourceContainers` (`evidence-clustering.ts`) then
  converted BOTH to `kind/role: context`, unconditionally, because no grouping
  decision had been approved for them — their children were the ones the
  geocode lane could not place. ONE line produced four symptoms: the Jan-16
  castle card disappeared; `recoverMissingNamedEvidence` synthesized an UNDATED
  `placeholder` for the orphaned ticket question (the duplicate + dateless
  stranding recorded above); Jan 16 held zero dated containers, so
  `retryQueryFor` returned null for every Jan-16 card, which is the ENTIRETY of
  run 2's `retryCount: 0` and the reason G4.3 was never exercised; and grouping
  had no container either, which is the missed TARGET. The prior hypothesis
  that the model mis-filed the castle into a notes blob is FALSIFIED — that
  `"…CZECH.pdf notes"` label was the chunk name, not the section.
  FIX, per Eli's 2026-07-28 decision (a named site container carrying an
  unresolved decision survives as a DATED CARD *and* raises the question):
  a rejected grouping proposal that is a NAMED SITE container with a real date
  is rescued to `atomic_candidate` instead of demoted. The demotion itself
  stays — it is load-bearing against day/route-heading cards (RW-ASM-001) — so
  the rescue is gated on the SHARED `SAME_SITE_CONTAINER_PATTERN` grouping
  itself uses (the two can never diverge) plus a date, since an undated
  survivor is the defect rather than the fix. Heading fragments are already
  demoted upstream by parser-artifact normalization and are not re-judged here.
  Enforced by `tests/site-container-survives-rejected-grouping.test.ts` (live
  parse shape verbatim; negative controls for a day-heading proposal and for an
  undated container; proven both directions).
  COVERAGE STAYS `KNOWN_GAP`: no live run has yet shipped a dated Jan-16 castle
  card, and fixture-green is never sufficient (§Coverage honesty). Restoring it
  is a decision on the NEXT run's evidence, and the first thing that run's audit
  must check is ELIGIBILITY as a grouping container, not merely the date.
  2026-08-05 pinned replay: `recoverMissingNamedEvidence` no longer creates
  traveler records. Original parser-missing details wait until final subject
  resolution; exact titles and one unambiguous title-containment match bind to
  the surviving canonical subject, while a genuinely unextracted named item is
  dismissed from the maker queue with an audit-visible `source coverage`
  reason. The pinned result has zero `itemType: placeholder` records, zero
  active dateless Activities, and every open Question binds to a real record;
  scorecard `PLC-1`, `PLC-2`, and `PLC-3` all PASS. Unit coverage proves both
  the binding and never-extracted paths in `tests/evidence-clustering.test.ts`.
  Enforcement remains `KNOWN_GAP` until a fresh live run confirms the shipped
  path, per coverage honesty.

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

  2026-08-02 additions (Eli-approved). The test: **if the maker does nothing, is
  the app internally resolved?** No — Question. Yes, and Roamwoven made a
  meaningful visible judgment — Call. Yes, and the action was routine or
  invisible — neither; audit only. Explicitly audit-only, never Calls: merging
  obvious duplicates, repairing a source-backed time, attaching check-in
  instructions to a Stay, suppressing receipt debris, moving a recommendation
  list into City Notes, normalizing spelling.

  **A Call is REQUIRED when grouping removes cards from the traveler's top
  level.** Merging duplicates removes nothing the traveler would have seen
  twice; grouping folds separate cards under one, and that is a visible
  judgment. Eli 2026-08-02 WITHDREW the line "obvious same-site grouping does
  not need a maker-facing Call" from his principles draft as contradicting this
  contract's existing "First-run Calls primarily explain Roamwoven-created
  groupings". Schönbrunn requires a Call; so does Prague Castle once it
  survives. Zero Calls on a clean itinerary is an acceptable outcome; the
  current test corpus is deliberately messy and should produce several.

  **A Call's text is rendered FROM the membership record, never composed
  alongside it.** Run 8.1.0's Schönbrunn Call claimed seven source-listed stops
  against a container description listing five, because the claim string and the
  membership decision were computed from different state. Rendering both from
  one source makes that class of false statement structurally impossible rather
  than something each audit has to catch.

  **Question usefulness, not a count gate.** There is no required exact count.
  A useful Question is material, non-duplicative, not already answerable from
  the source, not routine assembly, and not technical recovery. Roughly 5-10
  can be reasonable experience guidance for a complex trip, while zero can be
  correct for an explicit one; neither range nor count is an acceptance
  assertion. Superfluous Questions degrade the maker experience against the
  product goal of a finished app in 15-20 minutes. The internal standard
  asserts that the RIGHT Questions exist, or a run that silently misclassifies
  everything could outscore a correct one. Every classification decision is
  therefore recorded in the audit even when it raises no Call and no Question,
  so a silent wrong decision stays discoverable.
- Evidence: Prompt and regression coverage exists, but the latest live run
  produced source-obvious, duplicated, irrelevant, and mis-targeted Questions.
  2026-08-02 (run 8.1.0): 12 open Questions shipped, of which 8 are excluded by
  the rules above — three separately worded Prague Castle ticket Questions on
  three different subjects (two of them synthesized placeholders), two "which
  day does this note happen" Questions that City-Note-to-leg attachment makes
  impossible, and `What is the booking/reference code?`, `How many adults are
  booked?`, `What is the provider name?`, all answerable from the ticket. The
  four that survive — the castle ticket, the Vienna planned-or-ideas question,
  `koscom`, and the baths — are Eli's canonical good-Question set.
  2026-08-05: the Central Europe gate now asserts its three intended material
  decisions semantically (Prague Castle ticket, Vienna researched-list choice,
  Budapest baths), rather than allowing any three Questions to satisfy a count.
  Exact and unique title-containment subject binding keeps the castle decision
  on its real canonical card without synthesizing a subject.
  2026-08-06 fresh-run evidence: all served review items are anchored, but
  semantics still fail. Six Questions shipped: four were materially useful;
  the standalone `Home` city ask was routine assembly, and the booking-code ask
  was already source-answerable.
  The required grouping Calls are Prague Castle, Malá Strana, and Schönbrunn;
  production shipped Castle and Schönbrunn, omitted Malá Strana, and rendered
  the Schönbrunn claim from state inconsistent with its membership record.
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

  2026-07-25 addition (Eli, Arc F.3) — the material-decision test restated,
  plus one absolute. Verbatim: "questions should be asked if there is
  something material that would impact the shape of a day (or the trip).
  asking the maker's name is never useful and should never be a question."
  Personal identity data — a name, email, phone, home address, a
  reserved-by / booked-by field, or any equivalent — is NEVER a Question, on
  any lane, at any confidence. It is scrubbed from output (RW-PRI-001) and it
  is not solicited: the pipeline may not ask the maker to re-supply the exact
  data it removes. A question that solicits identity data is dismissed in
  place with an auditable reason; a question that is otherwise material keeps
  its ask and loses only the personal detail from its wording.
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
- Evidence: 2026-07-18 remediation Phase 2 (live-run 7.18.2 PB-2/PB-5; audit
  finding A3): the question pipeline is re-staged — canonical subject
  resolution now runs BEFORE the reconciliation filters, and a new final
  reconciliation gate runs on FINAL subjects and values before
  consolidation: a question whose guessedValue equals the final canonical
  state resolves silently (all field kinds, dates via tripDatesMatch, times
  via clock normalization); a firm canonical date/time/confirmation with no
  differing guess resolves silently; a date question proposing a DIFFERENT
  value than canon always survives (fixture-guarded negative control);
  transport-subject date questions reconcile against final rows (the wave-1
  regex gained `date`, guess-aware); questions about folded duplicates
  reconcile through the `_representedByPieceId` chain; stale presentation
  calls about suppressed pieces are dropped (source-update cancellation
  calls exempt by design); same-venue ticket questions consolidate with the
  container preference actually implemented (the audit's dead ternary) and
  undated same-venue subjects folding into the dated container root; a
  date-target question always renders a date control. Enforced by
  `tests/question-reconciliation-gate.test.ts`.
  Review records now carry explicit options and date bounds; first-run
  controls render exclusive choices, yes/no buttons, bounded date/time inputs,
  and declared free text. Exclusive choices reject invented answers, quick
  suggestions do not constrain valid text or picker responses, and a Question
  remains open unless its declared canonical mutation succeeds. Unsupported
  option shapes fail soft to an answerable text control rather than killing the
  run. Remaining gaps are true multi-select mutation, direct-edit co-resolution,
  affected-card highlighting, Change/Undo, and immutable answer history. Saved
  decisions still preserve only the current value.
  2026-07-25 Arc F.3 F1 — the identity absolute above is `ENFORCED` at two
  boundaries by `lib/extraction/review-identity-gate.ts`; see RW-PRI-001 for
  the mechanism and `tests/review-identity-gate.test.ts` for coverage.
  2026-08-05 production-shaped Question-gate repair — the 2026-07-25 F3
  `KNOWN_GAP` is CLOSED at this boundary. Canonical subject resolution and
  disposition assignment now run before `gateOffContractQuestions` inside
  `canonicalizeCanonicalReviewDetails`, which is shared by initial assembly
  and rebuilds. Parser-shaped mode/type, settled-date, automatic-privacy,
  truncated-OCR, receipt-title, and same-section venue-complex asks terminate
  as retained `dismissed` records with `_canonicalQuestionGate`; seeded and
  parser-shaped twins converge. A genuinely unresolved material ticket
  question remains open, identity handling still uses the shared identity
  gate, and structured projection preserves the dismissal reason. This changes
  review policy only—no model input, candidacy, item type, date, grouping, or
  traveler record changed. Enforced by
  `tests/question-gate-production-shape.test.ts` and the production-shaped
  cases in `tests/canonical-regressions.test.ts`. RW-QUE-001 remains `PARTIAL`
  for its separately named multi-select, direct-edit co-resolution,
  affected-card highlighting, Change/Undo, and immutable-history gaps.
- Tests: `tests/generated-trip-model.test.ts`,
  `tests/published-snapshots.test.ts`, `tests/structured-trip-snapshot.test.ts`,
  `tests/review-identity-gate.test.ts`,
  `tests/question-gate-production-shape.test.ts`

## RW-PRI-001 — Privacy defaults are automatic and final-projection safe

- Status: `LOCKED`
- Decision date: `2026-08-06`
- Supersession: Eli's explicit 2026-08-06 sequencing ruling defers the missing
  maker password controls and password-mode browser QA until after extraction
  and assembly. It does not make protected values public or remove any existing
  fail-closed backend behavior. The later UI arc is bounded to protected/blurred
  travel-card descriptions and the photo-mode UI/affordances, not a whole-app
  access redesign. The 2026-07-15 scope was previously narrowed by Eli's
  explicit 2026-07-17
  evening decision: protection exists for *trip-sabotage surface* — things
  that house you or move you between cities. Protected: stay addresses,
  access/entry codes, Wi-Fi credentials, stay and inter-city travel booking
  identifiers, private contacts, personal safety details. Explicitly PUBLIC:
  activity/tour/restaurant booking references and confirmation codes, rental
  car reservations (recoverable failure — CEO ruling), in-city passes such as
  the Vienna Card. Personal identity data (traveler name, home address,
  email, phone) is not trip content at all — it is scrubbed from card prose
  as content hygiene, not gated behind privacy.
  REAFFIRMED 2026-07-24 (Arc F.2 session): confronted with the run-7.24.1
  bar wording ("zero code-shape tokens in any public field"), Eli ruled the
  Δ2 carve-out stands — activity/tour/rental booking references stay
  public; bar item 6 means zero PROTECTED-class code tokens, and the
  7.24.1 chain C finding was re-scored not-a-defect (docket correction).

  Δ3 AMENDMENT (Eli, 2026-07-24, run-7.25.0 audit; verbatim: "it's fine if
  they see seats too. we just need to hide confirmation codes so a bad
  actor can't get the info and cancel a transit"): on travel cards,
  protection covers CONFIRMATION / BOOKING / TICKET CODES ONLY. Seat
  number, seat class, route and times are PUBLIC. This is Δ2's
  sabotage-surface principle applied consistently — a seat number cannot
  cancel a transit. Consequences recorded with the decision: run-7.25.0 bar
  item 6 was re-scored FAIL → PASS on it, the planned F.3 seat fix was
  DROPPED, and future audits must apply Δ3 BEFORE scoring item 6.

  TRAVEL-CARD DISPLAY RULE (Eli, 2026-07-24, approved with Δ3): a travel
  card shows title + route + times publicly; its protected details (the
  codes) sit behind ONE password entry. The traveler-side screen that
  enforces this is NOT BUILT — `lib/traveler-view-model.ts` is the demo
  seed builder (it imports asia-trip-seed.json with transport hard-coded to
  `[]`), and no generated-trip transport → traveler rendering path exists
  yet. Recorded as a build item, not as enforced behavior.

  DO-NOT-BLOCK STANDING DIRECTIVE (Eli, 2026-07-24, binding on every
  session; verbatim: "we are close, so as you work on privacy and stuff in
  99% of times we should not block the run (unless there is corrupted
  source data)"): every privacy mechanism terminates in suppression or
  scrub plus an auditable disposition. No new throws, no quarantines, no
  hard warnings, and no invariants that can fail a run. Corrupted source
  data is the ONLY exception. (Run 7.23.1 died to a defensive invariant;
  this directive is that lesson made standing. It is the privacy-lane
  specialisation of RW-QA-001's fail-soft posture and RW-OPS-001's
  dark-factory clause.)

  Δ3 SCOPE NOTE, question surface (Eli, 2026-07-25): personal identity data
  is not merely scrubbed from output — it is never SOLICITED. Verbatim:
  "that should absolutely be scrubbed, and should never be asked as a
  question. questions should be asked if there is something material that
  would impact the shape of a day (or the trip). asking the maker's name is
  never useful and should never be a question." See RW-QUE-001.

  Δ4 AMENDMENT — TRAVEL-CARD DESCRIPTION IS A PROTECTED CONTAINER
  (Eli, 2026-07-25; SUPERSEDES the Δ3 travel-card display rule above, and
  partially supersedes Δ3 itself). Verbatim: "it is good to have the train
  numbers. they can go in the description and we can make the whole
  description of a travel card password protected. so if a 'traveler' clicks
  in, they enter password once, all are unlocked. if a 'follower' clicks in
  they are prompted for password and if can't answer/they don't see the
  description on the card."

  The rule:
  - A travel card's DESCRIPTION is protected in full — one container, not a
    set of classified fragments. Nothing inside it needs to be judged
    individually, so route prose, train numbers, seats, class and codes may
    all live there.
  - The card FACE stays public and is composed from STRUCTURED FIELDS, never
    from the description: title, `routeLabel`, `departureLocation`,
    `arrivalLocation`, `departureTime`, `arrivalTime`, `date`, `provider`,
    `transportType`. A locked description therefore costs the public card
    nothing.
  - ONE password entry unlocks every protected detail for that viewing
    session ("enter password once, all are unlocked") — not per-card, not
    per-field.
  - A viewer WITHOUT the password is prompted, and on failure simply does not
    see the description. It is not an error state and never blocks the rest
    of the card or the app.
  - "Follower" is NOT a tracked role (Eli, 2026-07-25): it means a
    link-holder who does not have the password. There is one share link and
    one password. Eli has flagged that UI differences between the two viewer
    kinds are planned LATER, so the implementation must not foreclose
    distinguishing them — but no role model, second link, or revocation is in
    scope now.
  - PASSWORD-OFF SERVING RULING (Eli, 2026-08-05): the maker may turn the
    traveler password on or off. OFF collapses follower mode completely:
    every valid share-link holder starts in traveler mode, no password prompt
    appears, and all `traveler_password` details are loaded and visible. ON
    preserves the locked follower state until one correct password unlocks all
    such details for the session. `maker_only` data is not reclassified by
    this rule. In both modes the immutable public `snapshot_json` remains
    secret-free; private values are joined from snapshot-scoped private rows at
    request time, never copied back into the public snapshot.
  - SCOPE: travel cards ONLY for now (Eli, 2026-07-25). Stays keep their
    existing per-field protection (`addressVisibility`,
    `accessDetailsVisibility`), which is enforced and passing its bar.
    Activity/note descriptions stay public.
  - SEQUENCING AND UI SCOPE (Eli, 2026-08-06): the deployed maker app has no
    control for enabling or disabling the traveler password. Do not treat that
    missing UI as an extraction/assembly defect or make password-mode browser
    QA a condition of the fresh assembly run. Build the password component
    after extraction and assembly are stable. Its customer-visible work is
    bounded to blurring/protecting travel-card descriptions and changing the
    photo-mode UI/affordances; existing backend privacy safeguards remain
    active in the meantime.

  Effect on Δ3: seats and seat class move from "public on the card face" to
  "inside the protected container", i.e. visible to any traveler after ONE
  unlock. Δ3's INTENT is preserved — travelers were never meant to be denied
  their seat numbers — but its letter ("seat number, seat class, route and
  times are PUBLIC") is superseded for the description surface. Route and
  times remain public because they are structured fields. Audit scoring under
  Δ4: bar item 6 means zero PROTECTED-class code tokens in any field that is
  actually PUBLIC; a code inside a description whose `descriptionVisibility`
  is `traveler_password` is not a leak.

  WHY THIS IS THE RIGHT SHAPE, recorded so it is not re-litigated: the Arc
  F.3 dark-factory sweep found 11 positional false positives in the shared
  privacy predicates — a date range read as a phone number, "Passenger
  Terminal 3" read as a person, a date+clock run read as a booking code —
  because a shape-matching regex cannot distinguish trip content from
  secrets inside free prose. Protecting the CONTAINER removes the need to
  classify its contents at all, which dissolves that entire defect class for
  travel cards. It also returns to RW-TRV-001's original stated intent: "the
  travel-card treatment exists so protected booking details blur cleanly."
  It further RESOLVES the escalated fused-train-number tension (REX2513 /
  NJ40295 swept from transport descriptions against Δ3): no widening of the
  code exemption is needed, so no privacy loosening is traded for it.

  ENFORCEMENT — `PARTIAL`; the interim protection remains LOAD-BEARING.
  Implemented 2026-08-05 as its own measured arc: `TripTransportRecord`
  carries the fail-closed `descriptionVisibility`; new projection stamps it
  and legacy missing fields resolve to the same protected value. Every active
  transport becomes one traveler card whose face is composed only from the
  structured fields above. Public snapshot projection nulls the description,
  adds its deterministic private-detail reference, and transactional publish
  stores the raw value beside the immutable snapshot. The existing unlock
  route was regression-tested at both terminal outcomes: valid password reads
  and returns the detail; invalid password returns 401 without reading private
  rows. QA shows the visibility plus a redaction marker by default, and the
  audit now scans the structured public transport face rather than protected
  prose. Fingerprint version 4 records the effective visibility.

  The prose-side protected-code sweep MUST REMAIN in force. It was not loosened
  in this arc, per the original dependency order and dark-factory rule. The
  password-off product choice is now implemented: the server validates the
  current published snapshot a second time before reading private rows, starts
  the shell unlocked with every `traveler_password` value, and the fallback
  unlock route returns the same complete set when the password is disabled.
  Password-on initial rendering reads no private rows; invalid authentication
  still returns none. A revoked password-off snapshot fails closed instead of
  serving stale details. Maker configuration UI and a fresh password-mode
  publish/browser observation are still outstanding and deliberately deferred;
  route, page-state, RPC-payload, full-suite, typecheck, and optimized-build
  proof are green.
- Enforcement: `PARTIAL`
- Δ4 enforcement: `PARTIAL`. Recorded on its own line because the
  contract-level `Enforcement` field is machine-validated against a fixed
  vocabulary (`tests/product-contracts.test.ts`) and must stay a bare value.
  RW-PRI-001 as a whole remains `PARTIAL`; the Δ4 travel-card container and
  explicit password-off traveler mode are implemented and regression-tested,
  while maker configuration UI and fresh password-mode browser proof are
  deferred. The prose-side code sweep remains load-bearing until that later
  component is built and observed in production.
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
  2026-07-18 Arc B privacy wave (live-run 7.18.3 PB-1, P0 first in commit
  order per CEO decision): the identity scrub's shapes now live in ONE
  shared module (`lib/extraction/identity-prose.ts`) covering the
  colon-less role-labelled name block ("Customer Eli kamerow"), postal
  home addresses (street number + street + postal code), and labelled /
  international / mid-segment phones — the 7.18.3 rental-car leak was a
  phrasing evasion (the old pattern required "Customer:" with a colon),
  not an ordering defect. Transport-shaped activities (movement words,
  flight-code shapes, or a confirmation shared with a transport row)
  additionally lose travel confirmation values from prose AND fields at
  the output boundary — inter-city travel booking identifiers are
  protected class even on an activity-shaped card. Enforced by
  `tests/assembly-ground-truth-run6.test.ts` (rental-car scrub, FR8331
  shadow + confirmation, clean-prose agreement with the shared
  predicates).
  2026-07-24 Arc F identity output gate (live-run 7.23.2 chains 1-3b; CEO
  decision 2): ONE gate at the existing sweep position covers every public
  field of every record kind — the chain-1 defect was FIELD-COVERAGE
  asymmetry (detector scanned titles, scrub never did). A card/note whose
  TITLE carries an identity value is suppressed whole with an auditable
  disposition (no maker review item, no scrubbed husks); structural
  records (transport, stays) keep the row and lose only the leaked value
  (Eli, 2026-07-24). Protected-code-shaped tokens are swept from
  transport/stay prose DIRECTLY (`identity-prose.ts` shapes shared with
  the detector), so protection no longer depends on the parse having
  captured the code in a protected slot (chain 3's empty-deny-list
  failure); flight codes, dates, and clock times are exempt, and ordinary
  activity booking references stay public. Stay fields are now swept and
  the detector walks items, stays, and transport alike; a new
  `protected_code_shape_in_public_prose` P0 makes the code-token bar
  verifiable from the bundle. Arrival-directions prose (chain 3b, Eli:
  full fix in Arc F) routes to the leg's stay even when no stay is named,
  and city notes are swept by the same rule. Enforced by
  `tests/identity-output-gate.test.ts` and
  `tests/stay-arrival-directions.test.ts` (live shapes verbatim, proven
  both directions).
  2026-07-24 Arc F.2 (run 7.24.1 chain D + step-0 trace): the route's
  quality retry was the one post-sweep payload mutation point — it re-ran
  the accessory router after the output-boundary sweep, and the assembly
  corridor's rebuild then regenerated public outputs from those un-re-swept
  payloads (`rebuilt_canonical_outputs_from_evidence`, the run's "repaired"
  trigger). `reapplyCanonicalOutputInvariants` now ends by re-running
  `scrubProtectedValuesFromPublicProse` (T1: the sweep stays the last text
  mutation before outputs are composed, retry lane included), proven
  end-to-end (drift → repaired → re-swept output). The note-lane access
  vocabulary now includes access-instruction shapes ("HOW TO GET IN",
  "use the key", key-pickup, step sequences, credential sentences) in both
  the pre-merge 3b sweep and the merged-note composition; access material
  routes to the same-city stay's protected accessInstructions with a
  recorded disposition. Enforced by `tests/note-lane-protections.test.ts`
  (live 7.24.1 shapes verbatim, both directions).
  2026-07-25 Arc F.3 (run 7.25.0 chain C — the QUESTION surface had no
  privacy contract at all): the identity gate now covers the review surface
  as well as records. `lib/extraction/review-identity-gate.ts` is one pure
  idempotent predicate set consumed at TWO boundaries — the draft boundary
  (`canonicalizeCanonicalReviewDetails`, which every build and every
  rebuild passes through) and the projection boundary
  (`createReviewQuestions`, the last stop before the maker). A question
  whose `targetField` solicits identity data, whose prose asks for it, or
  whose prompt is nothing but an identity value is DISMISSED IN PLACE with
  an auditable reason naming the signal SHAPE, never the value; a still
  material question keeps its ask and loses only the personal detail from
  its wording; a Call is never dismissed (RW-REV-001 — a statement is not
  an ask). Dismissal is never a filter: `validateStructuredTripRecords`
  requires one projected review record per draft `missingDetail`
  (`draft-to-structured-trip.ts:846-851`), so dropping one would fail a
  compile invariant — the do-not-block directive in mechanical form. The
  review path's un-migrated private copy (`scrubReviewEvidence`, which
  required "Customer:" WITH a colon — the exact 7.18.3 leak
  `identity-prose.ts` documents in its own header) is now layered UNDER the
  shared predicates, so the change is strictly additive.
  `dropIdentitySegments` was promoted out of the output sweep into
  `identity-prose.ts` (a local closure over a fifth byte-identical copy of
  the segment-split regex). FOUR positional false positives in the shared
  predicates were found by applying them to a new lane, each fixed and
  proven both directions: a DATE RANGE read as a phone number
  (`TRAILING_PHONE_PATTERN` on "2038-04-02 to 2038-04-05" — live in the
  CARD lane, where it silently deleted any description sentence ending in a
  date, and capable of raising a false identity P0 on an itinerary date, an
  RW-AUD-001 report-correct-output-as-defect violation); a ROLE WORD
  followed by an itinerary noun read as a person ("Passenger Terminal 3",
  "Driver Instructions", "Customer Service desk" — and because a
  title-borne identity signal suppresses the WHOLE card, this DELETED
  legitimate cards rather than cleaning them); and a DATE FOLLOWED BY A
  CLOCK TIME read as a protected code ("2019-01-18 06:20", scrubbed down to
  ":20"). Enforced by `tests/review-identity-gate.test.ts` (live 7.25.0
  question shapes verbatim, purity + idempotency for the retry/rebuild
  lane, and every material question this pipeline must keep asking as a
  negative control) and `tests/delta3-travel-card-publicity.test.ts` (Δ3
  both directions on the eight live travel rows).
  KNOWN residual, recorded and NOT fixed (see `docs/next-session.md`): the
  street-address shape still flags VENUE addresses ("Borkonyha, 3 Sas
  street, 1051 Budapest") because shape alone cannot separate a venue
  address from the traveler's home address, and the live leak sits in its
  own segment so context-coupling would miss it — content loss, not a leak,
  and genuine design work; and the protected-code shape still flags fused
  continental train numbers ("REX2513", "NJ40295"), which is in TENSION
  WITH Δ3 and needs a CEO call, because any widening of the flight-code
  exemption also exempts short booking locators — trading a content bug for
  a privacy loosening. Mitigation verified in source
  (`evidence-clustering.ts:4472`): transport titles and routeLabels are not
  swept, only descriptions, so the row's public identity survives. Both
  residuals are pinned as explicit KNOWN_GAP characterisation assertions in
  `tests/delta3-travel-card-publicity.test.ts` so a change to either fails
  loudly.
  2026-08-06 fresh-run evidence: a protected-class booking identifier and
  customer-detail prose reached the public Prague City Note even though the raw
  parse separately captured protected booking/contact details. Note restoration
  reintroduced content through a weaker safety classification after an earlier
  sanitizer pass. Password UI remains deferred; this is an assembly final-
  projection defect and does not loosen the public activity-booking carve-outs.
- Tests: `tests/canonical-regressions.test.ts`,
  `tests/generated-trip-model.test.ts`, `tests/published-snapshots.test.ts`,
  `tests/assembly-ground-truth.test.ts`,
  `tests/assembly-ground-truth-run6.test.ts`,
  `tests/identity-output-gate.test.ts`,
  `tests/stay-arrival-directions.test.ts`,
  `tests/note-lane-protections.test.ts`,
  `tests/review-identity-gate.test.ts`,
  `tests/delta3-travel-card-publicity.test.ts`

## RW-PUB-001 — Published trip versions are immutable

- Status: `LOCKED`
- Decision date: `2026-07-25`
- Supersession: the 2026-07-21 messaging is amended by the 2026-07-24 CEO
  decisions 1 and 7 (Arc F). Publishing still warns-never-blocks; the
  amendment changes only the readiness COPY: while an identity-class P0
  finding or a hard structural warning is open, the readiness headline is a
  warning-state instead of "Private app is ready". Quiet warnings never
  change readiness copy. Standing directive recorded with the decision:
  these warnings are a TRIPWIRE, not a feature — recurring hard-warning
  shapes are backlog defects the assembly logic must learn to resolve; the
  target state is zero open findings on a healthy run.

  2026-07-25 Δ-COPY AMENDMENT (Eli, Arc F.3 F2) — SUPERSEDES the
  2026-07-24 formula. The 2026-07-24 text specified ONE count, "Ready with
  N privacy warnings" where N = open identity P0s + open hard warnings.
  Run 7.25.0 proved that wording wrong on a real run: its only open finding
  was a structural `warning:activity_duplicate_title` (the duplicate Prague
  Castle card) with ZERO privacy content, and the page rendered "Ready with
  1 privacy warning" — making a real identity leak and a duplicate title
  indistinguishable in the headline, which is the opposite of the signal the
  amendment exists to raise. The two classes are now counted AND WORDED
  separately:
    - no open findings          → "Private app is ready"
    - privacy P0s only          → "Ready with N privacy warning(s)"
    - structural warnings only  → "Ready — N item(s) to review"
    - both                      → "Ready with N privacy warning(s) and
                                   M item(s) to review"
  Privacy language is reserved for privacy findings. Publishing still never
  blocks: `canPublish` and `assessTripPublishability` are untouched and
  Create snapshot stays enabled. This is recorded rather than averaged per
  RW-GOV-001 — the newest explicit CEO decision wins, and the older formula
  is preserved above as history.
- Enforcement: `PARTIAL`
- Contract: Extraction, assembly, review, and future fixes never mutate an
  already published traveler snapshot. Maker changes create a new draft and an
  explicit new published snapshot/version when the maker chooses to publish an
  update.

  2026-08-02 additions (Eli-approved). Roamwoven's INTERNAL quality benchmark and
  the maker's AUTHORITY TO PUBLISH are separate. A run may fail the internal
  standard without preventing publication; internally that is a **benchmark
  failure**, never automatically a publishing prohibition. Semantic detectors can
  be wrong, and the product does not hold a sophisticated maker hostage over a
  contested duplicate, category or grouping judgment.

  Quality issues WARN: duplicate or questionable activities, activity bloat,
  wrong or uncertain grouping, unresolved Questions, missing optional details,
  map uncertainty, wrong categories, possible wrong-city placement, and general
  audit P1/P2 findings. Where material warnings remain, a lightweight
  confirmation ("Publish with twelve unresolved review items?") is permitted;
  a heuristic never becomes a barrier.

  Only safety or mechanical failures BLOCK: the maker is not authorized; no
  usable snapshot exists or processing is still running; the snapshot is corrupt
  or structurally invalid; or Roamwoven has VERIFIED that protected data would
  become publicly visible and cannot automatically protect or remove it. Privacy
  is enforced automatically first — protected values move into protected fields
  or are stripped from public prose — and publication stops only when a safe
  result cannot be guaranteed, never because a detector raised an uncertain
  warning.

  Three truthful states: **Ready to publish** (no material known issues),
  **Review recommended** (known quality issues, publishing allowed), **Safety
  action required** (no safe or valid snapshot yet). A maker may explicitly
  resolve OR ignore a review Question; ignoring is a recorded maker decision, not
  a lingering unresolved system state.

  THREE OF THESE ARE NEW BUILD, not restatement: the third state does not exist
  today (the 2026-07-25 formula above has no safety state), the confirmation step
  does not exist, and an explicit maker "ignore" that records a decision does not
  exist. **The safety block is the first true hard stop in the system** —
  `assessTripPublishability` currently returns `canPublish: true` on every path
  but missing records. Per RW-OPS-001 and §Dark-factory, that new blocking path
  is not push-ready until its route-level outcome is traced and it terminates in
  one of the four named states.
- Evidence: Published snapshots are transactionally created and traveler reads
  use the active published snapshot.
  2026-07-21 CEO decision (Eli, run7): publishing NEVER hard-blocks on audit
  findings — the maker (a detail-oriented planner) is the quality gate, the
  expensive stages are extraction/assembly, and republishing is cheap. The
  publish page must state surviving confirmed output defects prominently
  instead of claiming readiness ("Private app has open audit findings"),
  but Create snapshot stays enabled.
  2026-07-24 Arc F: `assessTripPublishReadinessCopy`
  (`lib/trip-publish-policy.ts`) derives the warning-state headline from
  the run's remediation outcomes (open conservative-fallback findings
  only; repaired/verified findings, detector incidents, and the quiet
  activity_bloat warning never count); the publish page renders it above
  the run7 audit-findings copy.
  2026-07-25 Arc F.3 F2: the headline is composed from the two counts
  separately (four explicit cases, so a structural finding can never borrow
  privacy language again). `privacyWarningCount` was REMOVED rather than
  redefined — its name no longer matched its contents — and replaced by
  `openFindingCount`, which drives `state` only, never the wording, so the
  compiler names every consumer instead of letting an old meaning survive
  silently. The publish page consumes only `state` + `headline`. Enforced by
  `tests/trip-publish-policy.test.ts` with the run-7.25.0 outcome shape
  verbatim (asserting the headline contains no "privacy" at all) plus the
  inverse control — a lone identity P0 still says "privacy", so the
  amendment did not mute the signal it protects.
- Tests: `tests/published-snapshots.test.ts`,
  `tests/structured-trip-snapshot.test.ts`,
  `tests/trip-publish-policy.test.ts`

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
  2026-07-18 Arc A (audit finding B4 — detector drift): audit detectors now
  IMPORT pipeline predicates instead of re-implementing them. Hedge and
  availability detection use the taxonomy's own
  hasWeakRecommendationMarker/hasAvailabilityMarker (the private audit
  regex missed five hedge phrases the pipeline demotes on — false P1s);
  high-intent detection uses hasStandaloneActivityAnchor +
  hasStrongPlannedActivityLanguage + the shared sight/container
  vocabularies; loose-tip detection uses isLooseTipActivity (booking and
  time guards included); the audit identity join uses the pipeline's
  exported identityTokens (plural folding + one stopword set) and
  normalizeAuditIdentity now folds with the canonical normalizeText; the
  day-overview P0 detector also runs the shared heading-fragment predicate
  against each card's source-heading context from lineage (the "Explore
  Vienna" family was previously invisible to it). Lineage rows and
  candidates carry sourceSectionLabel/sourceHeadingPath and geo/area fields
  so these checks are verifiable from the QA bundle.
  2026-07-18 Arc B (run6 RW-AUD-001 audit-gap entries): a NEW
  `identity_value_in_public_prose` P0 detector scans the UNREDACTED
  structured records — the same prose travelers see — for identity shapes,
  importing the exact predicates the pipeline scrub uses
  (`identity-prose.ts`), with evidence naming the signal shape and never
  the value (safe in redacted bundles). Audit procedure: privacy is
  checked on unredacted card prose — the QA bundle's redaction markers
  made 7.18.3 LOOK clean to the auditor. A NEW
  `transport_provider_field_corrupted` P1 detector checks final transport
  provider FIELDS (the 7.18.3 audit read titles only) via the pipeline's
  own repair predicate. Enforced by
  `tests/assembly-ground-truth-run6.test.ts` (known-good control +
  detector firing + evidence shape).
  2026-08-06 fresh-run evidence: the assessment caught duplicate Pinball and a
  loose `Eat` card but missed the public protected-value leak, the basilica
  alias duplicate, the fabricated disjunctions, most lost carriers, and most
  candidacy debris. The next pass keeps detectors non-authoritative and adds
  independent source/canonical/final reconciliation before any owner repair.
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
  2026-07-18 Arc A cron hardening: the cleanup cron route's CRON_SECRET
  bearer compare is timing-safe (SHA-256 digests compared with
  crypto.timingSafeEqual — no byte-position or length oracle) and every
  rejected attempt is logged (`cron_cleanup_unauthorized_attempt` with
  header shape, forwarded IP, user agent, timestamp). Route-level outcomes
  unchanged. The RW-EVD-001 recovery call records its own dark-factory
  outcomes: recovered / failed-with-one-question / no-trigger, each with
  separate usage telemetry. Enforced by `tests/cleanup-cron-route.test.ts`
  and `tests/source-recovery.test.ts`.
  2026-07-22 Arc E hotfix (live-run 7.23.0: a usable draft terminated in a
  technical recovery state because a repeat-fold merge refreshed a
  question subject's canonical id — forbidden by this contract): canonical
  id refreshes now record a prior-id trail on the piece; review subjects
  forward through that trail at subject resolution, the question gate, and
  the rebuild boundary (identity forwarding, never title similarity); a
  subject that matches no live piece dismisses its review item inside
  `canonicalizeCanonicalReviewDetails`, so the finalization
  missing-identity invariant is unreachable by construction and every
  rebuild heals the class. ONE mechanism at the existing boundaries — this
  retires the run7 dead-target band-aid's blind spot rather than adding a
  parallel sweep. Enforced by
  `tests/canonical-review-identity-recovery.test.ts` (live 7.23.0
  violation shape survives as a repaired draft + dismissed item;
  id-refresh forwarding keeps the question alive on the same entity).
  Same change, containment: the assembly corridor no longer lets ANY raw
  non-canonical exception escape untyped — every failure (invariant or
  TypeError-class unknown) flows through the same bounded
  rebuild-from-pieces + retry and terminates, at worst, in a named
  recovery state with the real error summarized in events. The former
  isCanonicalAssemblyError gate is deleted, not bypassed. Proven both
  directions by the poisoned-draft check in
  `tests/canonical-review-identity-recovery.test.ts`.
  2026-07-24 Arc F telemetry honesty (run 7.23.2 chain 8 — three gaps that
  made must-pass items unverifiable from the bundle): the repair
  corridor's `initialViolations` now persist in the assembly completed
  event AND the audit canonicalization summary (a "repaired" status names
  which invariant tripped); `excludedPlanningCostLineCount` survives the
  audit-snapshot whitelist; dismissed questions ship their full content
  plus a `dismissalReason` (the gate/sweep trace — Arc G's rebind, T3,
  keys off it); and a quiet `transport_confirmation_value_not_captured`
  advisory flags rows with no confirmation-shaped value (the chain-3
  capture-miss symptom, e.g. the literal label "Operator"). Enforced by
  `tests/arc-f-telemetry.test.ts` and the qa-bundle dismissed-question
  checks in `tests/trip-extraction-qa-bundle.test.ts`.
  2026-07-24 Arc F.2 (step-0 trace of the 7.24.1 "repaired" trigger): the
  quality retry (`reapplyCanonicalOutputInvariants`) was the one live
  mutation point after the output-boundary sweep — its router changes made
  the corridor's artifact inspection report semantic payload mismatches
  (the three persisted initialViolations named exactly the router-walked
  note pieces) and rebuild outputs from un-re-swept payloads. The retry
  now re-sweeps its clone before returning, so every corridor rebuild
  regenerates from swept payloads; `changed` stays false on an untouched
  clone (idempotency fixture-proven). Chain D's rebuild-bypass hypothesis
  is CORRECTED in the docket: the corridor itself never un-swept — the
  retry lane did. Enforced by `tests/note-lane-protections.test.ts`.
  2026-07-31 (run-2 handoff §6, work-order Task 1 — a change nobody could
  observe): `OPENAI_EXTRACTION_SEED=7` / `_TEMPERATURE=0` were set in Vercel
  production on 2026-07-28 and were a NO-OP.
  `resolveExtractionSamplingParams()` fed exactly one consumer, the pin hash;
  `requestStructuredResponse` accepted the params, spread them into the body,
  and even implemented a fail-soft strip-and-retry for a 400 — but every call
  site omitted the argument, so that branch was dead code, the API never saw a
  seed, and the only effect of the env change was that every stored pin was
  invalidated. No telemetry could have caught it, because `samplingParams`
  reached no served surface (rule 8(b): ABSENT IS NOT ZERO). Both real call
  sites now pass the params, and the run records what the request ACTUALLY
  SENT rather than the resolved config — `usage.openai.extractionSampling`
  carries `resolved`, `sent`, `liveCallCount`, `replayedCallCount` and
  `strippedCallCount` — and it is added to the audit-snapshot whitelist in the
  SAME change, because that whitelist is what silently dropped
  `formattedAddressCount` and `excludedPlanningCostLineCount` before it. A pin
  HIT reports `sent: null`, never `{}`: a replayed call made no request, and
  recording the recording run's params on it would be the same dishonesty in
  the opposite direction. Enforced by `tests/extraction-pinning.test.ts`
  (request-body assertion, strip-retry reported as not-sent, pin-hit null) and
  `tests/arc-f-telemetry.test.ts` 8.4/8.5 (whitelist survival, sent-vs-resolved
  divergence).
  2026-08-06 fresh-run evidence: the route reached a usable persisted draft,
  but the bounded quality retry preserved both confirmed P1 defects. The
  corrected work order requires route-equivalent replay, one independently
  proven owner repair, re-audit, and explicit clean/repaired/conservative
  terminal tests before the assembly branch can merge.
- Tests: `tests/extraction-route-recovery.test.ts`,
  `tests/extraction-pinning.test.ts`,
  `tests/canonical-identity.test.ts`, `tests/trip-quality-gate.test.ts`,
  `tests/trip-quality-outcomes.test.ts`,
  `tests/trip-audit-reconciliation.test.ts`,
  `tests/arc-f-telemetry.test.ts`,
  `tests/note-lane-protections.test.ts`

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
