# Roamwoven Loop 9 work order: Assembly Decision & Carrier Ledger V1

Date: 2026-08-07 (Asia/Tokyo)
Starting commit: `6e0282fd69b617207dfc3cd46e021f46efbf7c03`
Scope: shadow assembly provenance and resolver-replacement proof
Traveler behavior: unchanged
External work: zero new model, geocoding, recovery, or other network calls

## CTO decision

Do **not** remove the canonical resolver yet. Source Fact Ledger V1 is a sound,
immutable record of source evidence, but it cannot currently prove how all
behavior-bearing resolver decisions reached—or failed to reach—the final
traveler records.

Build a separate `AssemblyDecisionCarrierLedgerV1` in shadow mode. This
companion ledger joins:

`source span → source fact → assembly decision → final carrier or explicit disposition`

It must observe the existing pipeline without changing it. Source Fact Ledger
V1 stays byte-for-byte and schema-for-schema immutable. The new ledger may
reference its fact IDs and ledger hash, but may not rewrite or version-smuggle
new fields into V1.

This is the last observability loop before a deterministic resolver-replacement
candidate. Its job is to turn the authority switch from a hopeful output diff
into a source-backed, carrier-conserving proof.

## Evidence for this decision

All evidence below came from saved local artifacts with a network guard that
throws on any fetch. No extraction or geocoding provider was invoked.

### Current resolver facts

| Pin | Accepted role decisions | Accepted relationship decisions | Rejected relationship claims |
| --- | ---: | ---: | ---: |
| Candidate 8.6 | 161 | 0 | 5 |
| Fresh 8.7 | 113 | 0 | 12 |

The statement “all accepted resolver relationships are explained” is therefore
vacuously true: there are no accepted resolver relationships in either pin.
Current grouping is still behaviorally dependent on resolver **role** decisions
(`city_note` or `keep_activity`) followed by deterministic identity and grouping.

Source Fact Ledger V1 persists none of those role decisions as decision or
intent facts. Only 78/161 decisions on 8.6 and 67/113 on fresh 8.7 align to a
unique source span under V1.

The accepted counts are reconciled outputs, not the complete evidence. Across
the 30 saved resolver calls, 8.6 contains 223 raw role proposals over 165
candidate IDs: 58 duplicates, 3 candidates with conflicting roles, and one
medium-confidence proposal. Fresh 8.7 contains 150 raw proposals over 116
candidate IDs: 34 duplicates, no role conflict, and three medium-confidence
proposals. A complete ledger must distinguish an applied proposal from a
consistent supporting duplicate and a rejected proposal.

### Resolver-disabled counterfactual

| Surface | 8.6 current | 8.6 without resolver | Fresh 8.7 current | Fresh 8.7 without resolver |
| --- | ---: | ---: | ---: | ---: |
| Semantic hash | `d4be928…` | `ad38bbe…` | `92e0a9d…` | `7c4ebe9…` |
| Active items | 61 | 60 | 69 | 69 |
| Grouped stops | 13 | 6 | 5 | 0 |
| Calls | 3 | 2 | 1 | 0 |
| Open Questions | 3 | 3 | 6 | 6 |
| Legs / stays / transport | 5 / 5 / 8 | 5 / 5 / 8 | 5 / 5 / 8 | 5 / 5 / 8 |
| Public protected values | 0 | 0 | 0 | 0 |

The saved geocode candidate pools remained exact at 130/130 and 89/89.
Therefore, the divergence is assembly behavior, not geocoding.

The 8.6 resolver-disabled scorecard regressed from 66/66 to 11 failures,
covering identity, all three major grouping families, exact day structure,
Budapest City Notes, and Calls. Fresh 8.7 increased from 27 existing failures
to 29 and lost every grouped stop and the only grouping Call. Two binary
assertions happened to improve while four regressed; this is divergence, not a
safe replacement.

### Decision-by-decision ablation

Each accepted resolver role decision was removed individually from a captured
offline stage graph, followed by a complete deterministic re-assembly.

| Pin | Accepted decisions | Individually behavior-bearing | Classification | Source linkage |
| --- | ---: | ---: | --- | --- |
| Candidate 8.6 | 161 | 18 | 10 `city_note`, 8 `keep_activity` | 5 exact evidence, 4 source-block token, 6 unresolved chunk, 3 unresolved recovery |
| Fresh 8.7 | 113 | 5 | 5 `city_note` | 3 exact evidence, 1 ambiguous chunk, 1 unresolved recovery |

This narrows the replacement problem materially. We do not need to copy 274
opaque judgments into a new authority. We do need a durable explanation for
every behavior-bearing judgment and a complete record of every accepted or
rejected proposal.

The exhaustive ablation gate took about 497 seconds for 8.6 and 275 seconds for
fresh 8.7. It is an offline release gate only. It must never run per customer
trip.

### Alignment and coverage diagnosis

- A conservative audit of obvious alignment improvements recovered only 2
  additional decisions on 8.6 and 1 on fresh 8.7. Loosening fuzzy matching is
  not the answer.
- Recovery candidates are systematically hard to link because the current
  recovery stage carries neither `sourceSpanIds` nor a `sourceUploadId`.
- V4 coverage marks only about 13% of clauses carried and reports 523/693 and
  519/675 clauses uncovered. The older V3 carrier reports only 53/394 and
  41/377 meaningful lines uncovered. These are different universes—clause-level
  exact ownership versus line-level token coverage—and cannot be substituted
  for one another.
- Current heterogeneous fixtures prove determinism, privacy, and size, but do
  not yet prove useful semantic outcomes for booking-heavy, recommendation,
  spreadsheet, and freeform inputs.

## Locked assumptions

1. Source Fact Ledger V1 is immutable. Its schema version, fact IDs, stored
   fields, hash behavior, and five commits do not change in Loop 9.
2. Persisted production remains authoritative when a replay diverges.
3. The current resolver and canonical assembly remain the only behavioral
   authority in this loop.
4. A model decision is evidence, not truth. Accepted, rejected, conflicting,
   low-confidence, and unbound proposals remain observable.
5. Ephemeral identifiers such as `stage-N-item-M`, chunk ordinals, parser array
   indexes, observation IDs, and mutable canonical piece IDs may be used only
   for an in-memory join. They may not be persisted as durable identity.
6. A durable final carrier uses a hashed stable anchor: record class, leg/date
   context, normalized title digest, and source-fact references. No raw title is
   stored in aggregate telemetry.
7. Every source fact receives exactly one final disposition, even when that
   disposition is `unresolved` or `evidence_only`.
8. Runtime construction is one indexed linear pass. Exhaustive ablation remains
   an offline release gate.

## Explicit exclusions

Loop 9 does not:

- change the extraction model, prompt, sampling, or recovery request body;
- trigger a live extraction or any external lookup;
- change Activities, City Notes, stays, transport, groups, Questions, Calls,
  diagnostics, privacy, or canonical assembly output;
- change classification, containment, identity, grouping, review, or publish
  behavior;
- change geocoding candidates, queries, budgets, or results;
- mutate Source Fact Ledger V1 or reuse its schema version for new content;
- make the new ledger authoritative;
- remove, bypass, or reduce resolver calls yet;
- apply a production migration, enable a production flag, merge, or push; or
- begin publishing, password, photo, UI, or unrelated product work.

## Required architecture

### 1. Full resolver decision evaluation record

Extend resolver metadata without changing applied behavior. Record every raw
role proposal before reconciliation:

```ts
type ResolverRoleEvaluationV1 = {
  evaluationId: string;
  proposedRole: "city_note" | "keep_activity";
  confidence: "high" | "medium" | "low";
  reconciliationOutcome: "applied" | "supporting" | "rejected";
  rejectionCodes: Array<
    | "low_confidence"
    | "conflicting_classification"
    | "unknown_candidate"
    | "duplicate_proposal"
  >;
  reasonDigest: string;
  subjectFactIds: string[];
  unresolvedSourceSpanIds: string[];
  sourceLane: "spine" | "chunk" | "recovery";
};
```

The current accepted `metadata.roleDecisions` array must remain exact so no
downstream behavior changes. Raw model reason prose and ephemeral candidate IDs
must not enter the persisted decision set or aggregate events.

`supporting` means the proposal agrees with the one applied decision for that
subject. It is not mislabeled as a rejection merely because overlapping windows
produced it more than once. All proposals for a conflicting subject are
rejected with `conflicting_classification`; medium/low proposals are rejected
with `low_confidence`.

### 2. Recovery source-binding sidecar

Attach source identity to the existing recovery plan without changing the
request sent to the model.

- Join each recovery excerpt to Source Fact Ledger V1 span references using
  source identity, original section, line occurrence, and exact normalized
  clause.
- Carry those refs in a ledger-only sidecar, separate from parser/resolver input.
- Bind a returned candidate only to an exact or unique section-bounded match.
- Preserve ambiguous or absent matches explicitly.
- Assert that recovery request bytes, cache keys, model-call count, and parser
  output remain identical before and after the sidecar exists.

Do not add `_sourceSpanIds` to traveler payloads or fields that influence
observation/canonical IDs.

### 3. Assembly Decision & Carrier Ledger

Add a new append-only companion set that references the immutable V1 ledger:

```ts
type AssemblyDecisionDomainV1 =
  | "classification"
  | "containment"
  | "identity"
  | "grouping"
  | "review"
  | "publish_projection";

type AssemblyDecisionV1 = {
  decisionId: string;
  domain: AssemblyDecisionDomainV1;
  producer: "resolver" | "deterministic_assembly";
  subjectFactIds: string[];
  unresolvedSourceSpanIds: string[];
  inputDecisionIds: string[];
  outcomeCode: string;
  applied: boolean;
  writerVersion: number;
};

type FactTerminalDispositionV1 =
  | {
      factId: string;
      factKind: "entity";
      outcome: "carried" | "evidence_only" | "unresolved";
      carrierAnchorHashes: string[];
      decisionIds: string[];
      reasonCode: string;
    }
  | {
      factId: string;
      factKind: "relationship";
      outcome: "applied" | "rejected" | "unresolved";
      carrierAnchorHashes: string[];
      decisionIds: string[];
      reasonCode: string;
    }
  | {
      factId: string;
      factKind: "intent";
      outcome: "applied" | "superseded" | "unresolved";
      carrierAnchorHashes: string[];
      decisionIds: string[];
      reasonCode: string;
    }
  | {
      factId: string;
      factKind: "decision";
      outcome: "review" | "resolved_silently" | "dismissed" | "unresolved";
      carrierAnchorHashes: string[];
      decisionIds: string[];
      reasonCode: string;
    }
  | {
      factId: string;
      factKind: "exclusion";
      outcome: "excluded";
      carrierAnchorHashes: [];
      decisionIds: string[];
      reasonCode: string;
    };

type AssemblyDecisionCarrierSetV1 = {
  schemaVersion: 1;
  sourceFactLedgerSchemaVersion: 1;
  sourceFactLedgerHash: string;
  sourceFingerprint: string;
  resolverRoleEvaluations: ResolverRoleEvaluationV1[];
  decisions: AssemblyDecisionV1[];
  factDispositions: FactTerminalDispositionV1[];
};
```

Stable IDs are content-addressed from source fact/span references, decision
domain, outcome, producer, and version. They never depend on array order or
ephemeral runtime IDs.

Use ephemeral IDs only inside maps that join the already-built source ledger,
resolver stages, evidence observations, canonical pieces, and final records.
Drop those IDs before serialization. Ambiguity produces an explicit unresolved
edge; it never triggers title-wide fuzzy matching.

Do not force unlike fact kinds into a traveler-record carrier. An entity fact
terminates in a traveler/private carrier, evidence-only lineage, or unresolved
state. A relationship or intent fact terminates in an assembly decision. A
decision fact terminates in review, a silent resolution/dismissal, or an
unresolved state. An exclusion fact terminates in the declared exclusion.

Carrier anchors are class-specific and hash-only:

- Activity: leg key + date + normalized-title digest + source-fact refs;
- City Note: city-note key + normalized-title digest + source-fact refs;
- Stay: leg key + check-in/out + normalized-name digest + source-fact refs;
- Transport: leg key + departure context + normalized endpoint digests +
  source-fact refs;
- protected detail: owning carrier anchor + protected-field class; and
- review item: the existing stable decision anchor + decision ID.

### 4. Post-assembly reconciliation

Build the companion ledger after the quality corridor has reached its terminal
assembly result but before the processing run completes.

The route must retain the Source Fact Ledger persistence result. If the
matching source-fact row was not inserted or hash-confirmed, the decision set
must not attempt an orphan insert: emit
`source_fact_dependency_unavailable`, skip companion persistence, and continue
the usable draft. Enabling the companion flag without the source-ledger flag is
the same bounded configuration failure. It does not silently enable either
feature and does not create a maker-facing state.

Every V1 fact must have one disposition. Multiple traveler records may be
referenced only when the source genuinely represents multiple planned
occurrences. A suppressed duplicate must point to its surviving carrier or an
explicit evidence-only/exclusion reason. A group child keeps its own carrier
anchor; the parent relationship is a separate grouping decision.

The reconciliation must verify, not repair. A mismatch emits one privacy-safe
internal failure event and leaves the usable draft unchanged. It creates no
maker Question and performs no retry.

### 5. Persistence and scale

Use a new append-only table, for example `trip_assembly_decision_sets`.

Required columns:

- `trip_id`;
- `processing_run_id`;
- `schema_version`;
- `source_fact_ledger_schema_version`;
- `source_fact_ledger_hash`;
- `decision_set_hash`;
- `decisions_json`;
- `metrics_json`;
- `created_at`.

Required constraints:

- unique `(processing_run_id, schema_version)`;
- an exact composite foreign-key relationship to the matching immutable
  source-fact row for trip, run, source schema, and ledger hash; add only the
  supporting unique constraint/index required on the V1 table—do not alter its
  stored fact JSON or hash;
- owner read and authenticated owning-run insert;
- no update/delete policy for authenticated users;
- no GIN/full-content indexes;
- idempotent same-hash confirmation, never overwrite;
- decision-set maximum below 1 MiB; and
- one new insert per run, so the complete shadow path performs two bounded
  writes: one source-fact row before assembly and one decision-carrier row after.

Targets:

- indexed `O(facts + evaluations + decisions + observations + records)`;
- no candidate/source, candidate/candidate, fact/record, or fact/fact all-pairs
  scan;
- decision-ledger p95 below 100 ms;
- decision-ledger p95 below 256 KiB;
- combined source-plus-decision p95 below 512 KiB on the acceptance corpus;
- individual maximums below their hard database gates; and
- no silent truncation.

Persist dictionaries and fixed-order tuples rather than repeating long JSON
field names per decision. The raw resolver evaluations alone would occupy
about 81 KiB for 8.6 and 54 KiB for fresh 8.7 in the verbose reference shape.
The compact persisted representation must retain the same semantics while
leaving room for roughly 447/358 fact dispositions and the assembly decisions.

At 1,000 trips per month, the combined 512 KiB p95 ceiling is about 500 MiB of
uncompressed JSON per month before database compression and indexes. At 10,000
trips, it is about 4.9 GiB. Retention remains an explicit operations decision,
not a hidden delete path.

### 6. Privacy-safe telemetry

Aggregate events may include only:

- schema and writer versions;
- source-ledger and decision-set hashes;
- counts by decision domain, producer, status, rejection code, source lane, and
  final disposition;
- behavior-bearing decision counts from offline gates only;
- unresolved/ambiguous counts;
- byte size and build milliseconds; and
- output fingerprints before and after shadow execution.

No title, excerpt, person, address, booking value, model reason, raw source span,
or candidate ID may appear in aggregate events or the served audit snapshot.

## Heterogeneous semantic proof cases

The four existing sanitized shapes must stop being scale-only fixtures.

1. Booking-heavy: Stay, Transport, and protected facts each reach the correct
   carrier class; protected values never reach public prose or telemetry.
2. Recommendation-heavy: hedged suggestions preserve uncertain intent and end
   in City Notes unless their own source evidence is committed.
3. Spreadsheet-like: adjacent rows remain distinct, exact row/source identity
   survives reordering, and no shared-cell context invents containment.
4. Freeform: a source-authored route remains a relationship distinct from its
   entities; a loose hedge remains uncertain; shared exclusion rules remain
   explicit.

Add negative controls for repeated venues on different committed dates,
same-title rows in different sections, overlapping chunks, recovery excerpts
with duplicate wording, and category labels that contradict a source-authored
route.

## Five commits in order

### 9.1 — Contract and immutable companion schema

- Add `RW-ADL-001` and this work order to repository docs.
- Lock Source Fact Ledger V1 against in-place extension.
- Add types, stable ID rules, privacy allowlists, and schema tests.
- Freeze the 8.6 and fresh-8.7 evidence counts above as audit fixtures without
  copying private prose.

### 9.2 — Resolver evaluations and recovery source bindings

- Capture every resolver role proposal and its acceptance/rejection outcome.
- Add the recovery source-binding sidecar.
- Prove resolver application, request bytes, cache keys, calls, and output are
  unchanged.
- Add duplicate-section and recovery-ambiguity controls.

### 9.3 — Decision graph and fact-carrier reconciliation

- Build stable decision records across all six assembly domains.
- Join every V1 fact to exactly one terminal disposition.
- Add source-backed final carrier anchors without persisting transient IDs.
- Detect dangling facts, decisions, carriers, and illegal later-stage deletion.

### 9.4 — Counterfactual and heterogeneous parity gates

- Check in an offline resolver-role ablation harness that captures extraction
  once and performs no external call.
- Assert the exact 18/161 and 5/113 individually behavior-bearing baselines.
- Add semantic, not merely size/privacy, assertions for all heterogeneous
  shapes.
- Add carrier-conservation comparison against V3, RW-ORD-001 dispositions, and
  the final structured records without treating their different units as equal.

### 9.5 — Append-only persistence, route integration, telemetry, and closure

- Add the decision-set migration and store.
- Integrate after terminal assembly behind
  `ASSEMBLY_DECISION_LEDGER_SHADOW=1`, requiring the Source Fact Ledger shadow
  and matching persisted source row.
- Carry the source-row persistence/hash confirmation through the route; never
  create an orphan companion row when the source dependency failed or is off.
- Fail soft with one aggregate event.
- Add scorecard assertions, full replay gates, scale/privacy gates, docs, and a
  closure report.

Each commit must be independently revertible. Do not merge or push.

## Acceptance gates

### Correctness and checkability

- 161/161 accepted role decisions on 8.6 and 113/113 on fresh 8.7 appear as
  applied evaluations.
- All 223 raw role proposals on 8.6 and all 150 on fresh 8.7 appear exactly
  once as applied, supporting, or rejected evaluations.
- Every conflicting, duplicate, low-confidence, or unbound proposal carries
  the correct reconciliation outcome and reason code.
- All 18 and all 5 individually behavior-bearing decisions are linked to source
  facts/spans or an explicit unresolved binding; none are invisible.
- Recovery-origin decisions carry a source-binding result instead of losing
  their lane and section provenance.
- Every V1 fact has exactly one type-valid terminal disposition.
- Every carried entity fact points to a valid class-specific final carrier
  anchor; relationship, intent, decision, and exclusion facts terminate in
  their own allowed decision/state families.
- Every suppressed entity fact either forwards to a survivor or records an
  allowed evidence-only/unresolved reason.
- Every group member keeps an individual carrier and references one grouping
  decision.
- No later decision domain silently deletes a fact justified by an earlier one.
- Rebuilds produce identical decision IDs, hashes, and influence counts.
- Chunk order, overlap, split size, concurrency, and resolver response order do
  not change durable identity.

### No behavioral change

- Candidate 8.6 remains 66/66 with semantic hash
  `d4be928274955c83cc1253264be4a296c94748fd62f79387b00e4c21cee33bde`.
- Fresh 8.7 remains exact persisted/replay parity with semantic hash
  `92e0a9dc7a7b5789bdd52a811f8977b76a358679212c11ec62b329cf89dee8a6`.
- Fresh 8.7 retains the same 27 pre-existing scorecard failures; Loop 9 may not
  “improve” them by changing behavior.
- Activities, notes, stays, transport, groups, Questions, Calls, diagnostics,
  privacy counts, and all writer outcomes are unchanged.
- Model cache hit/miss counts remain 62/0 and 60/0.
- Geocode candidate pools remain 130/130 and 89/89.
- Recovery request bytes and cache keys are exact.

### Commercial scale

- zero additional model calls, geocoding lookups, retries, or network access;
- one additional append-only decision-set insert per run;
- indexed linear-time runtime construction;
- p95 decision build below 100 ms;
- p95 decision payload below 256 KiB and maximum below 1 MiB;
- combined p95 source-plus-decision payload below 512 KiB;
- no protected/source content in aggregate telemetry; and
- offline ablation never executes on the route.

### Repository and replay

- targeted resolver-evaluation, recovery-binding, decision-graph,
  carrier-reconciliation, persistence, route, SQL, privacy, and scale tests;
- production-shaped and heterogeneous semantic fixtures;
- guarded offline 8.6 and fresh-8.7 replay;
- current and resolver-disabled scorecard comparison;
- complete `npm test`;
- `npm run typecheck`;
- optimized `npm run build`;
- scorecard dry run;
- source-fact and decision-ledger size/time p95 gates; and
- final clean-worktree and five-commit audit.

## Dark-factory recovery and rollback

The new ledger is default-off and observational. If construction, joining, or
persistence fails:

- the existing assembly and usable draft continue unchanged;
- one aggregate internal event records the failure class;
- no maker Question, Call, technical recovery screen, or retry is created;
- no partial decision set is persisted; and
- authority replacement remains blocked.

Rollback is disabling `ASSEMBLY_DECISION_LEDGER_SHADOW` or reverting commit
9.5. Source Fact Ledger V1 and the additive decision table can remain unused.
No traveler record may depend on either ledger in this loop.

## Exit decision and following behavior loop

Loop 9 does **not** authorize resolver removal. It makes the replacement gate
non-vacuous and auditable.

The following behavior loop may introduce a deterministic decision candidate
only when it can prove:

- all 18 behavior-bearing 8.6 decisions and all 5 fresh-8.7 decisions from
  source facts, not candidate IDs or model reason prose;
- every required ground-truth relationship and intent outcome;
- every repeated-visit, duplicate-section, mixed-category, and recovery
  negative control;
- zero unresolved behavior-bearing decision;
- exact fact-carrier conservation;
- exact resolver-enabled output hashes and score states when the candidate is
  substituted offline; and
- route-equivalent replay/persisted parity.

At that later authority switch, remove the model resolver in the same bounded
loop. Do not run two behavioral authorities in production.

No fresh extraction is authorized by this work order.

## Pre-code approval gate

Recommended decisions:

1. Approve a shadow-only Loop 9; do not remove the resolver yet.
2. Keep Source Fact Ledger V1 immutable and add the separate companion ledger.
3. Create migrations and flags in code, but do not apply or enable them in
   production and do not merge or push without explicit approval.

Coding should begin only after these three decisions are approved.
