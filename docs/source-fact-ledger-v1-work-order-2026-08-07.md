# Roamwoven next coding loop: Source Fact Ledger V1

Date: 2026-08-07 (Asia/Tokyo)
Starting commit: `c6f81d6720b15f193e101644fe249a1668918e2c`
Scope: extraction boundary and observability
Production behavior: unchanged in this loop

## CTO decision

The next loop must make source facts independently durable before any classification, containment, identity, grouping, or review logic can change them.

Do not patch Prague Castle, Vinárna Čertovka, Schönbrunn, or Museum of Communism individually. They are four examples of one architectural failure: the system does not have a stable, immutable boundary between what the source said and what downstream assembly decided.

Build `SourceFactLedgerV1` in shadow mode. Shadow mode means the ledger is computed, persisted, audited, and scored, but the existing traveler-facing pipeline remains authoritative. This loop must add no model calls, geocoding calls, retries, or output mutations.

## Why this comes before another behavior fix

The fresh production run used:

- 29 primary extraction calls;
- 30 canonical-resolver calls;
- 1 bounded recovery call;
- 5 OCR calls;
- about 384,152 total model tokens;
- 89 geocoding lookups; and
- about 172 seconds.

At 10,000 trips per month, this run shape projects to roughly 650,000 model calls, 3.84 billion model tokens, and 890,000 geocoding lookups per month.

The 30-call resolver consumed about 79,805 tokens on the fresh run but produced no Castle or Schönbrunn containment decision. Scaling that lane without first proving a deterministic replacement would increase cost and latency while preserving the same correctness risk.

This loop adds no paid work. It creates the evidence required to remove that resolver safely in a later loop.

## Locked assumptions

1. Persisted run `56ab1933-38e7-411a-a905-1bc18084fd11` is authoritative for what the candidate shipped.
2. Raw parser output is evidence, not traveler truth.
3. A structural proposal and a venue/entity are different facts even when their names overlap.
4. Intent and relationship are independent axes. “Optional” describes intent; “child of this visit” describes relationship.
5. Source coverage is satisfied only by a valid carrier or an explicit exclusion. Mere word presence in parent/context prose is insufficient.
6. IDs must be source-derived and stable across concurrency, chunk order, and chunk-size changes.
7. No source excerpt, private value, or booking detail is copied into aggregate telemetry.

## Explicit exclusions

This loop does not:

- change the extraction model or prompt;
- change traveler-visible Activities, City Notes, groups, Questions, or Calls;
- invoke another live extraction;
- change canonical classification, containment, identity, or grouping;
- add venue-specific rules;
- add a second recovery call or any per-line model call;
- change geocoding behavior;
- remove the canonical resolver yet; or
- begin publishing, password, photo, or unrelated product work.

The Questions contract is corrected from exact-three to usefulness in documentation and test expectations, but Question-generation behavior is not changed in this loop.

## Required architecture

### 1. Source Document Index

Build one deterministic source index from the complete optimized materials before activity chunking.

Each meaningful source clause receives a stable `spanId` derived from:

- source upload/material fingerprint;
- normalized document identity;
- original line occurrence;
- clause ordinal within the line; and
- a digest of the normalized clause.

Do not derive durable IDs from `stage-N-item-M`, chunk number, array order, or model response order.

The index must be built once in linear time. Chunk inputs carry references to the existing index; they do not create a parallel source identity system.

Suggested contract:

```ts
type SourceSpanRefV1 = {
  spanId: string;
  sourceIdentityHash: string;
  materialFingerprint: string;
  sourceUploadId: string | null;
  lineOccurrence: number;
  clauseOrdinal: number;
  excerptDigest: string;
};
```

Raw excerpts remain in the protected source material. The persisted ledger stores locations and digests, not duplicate source prose.

### 2. Source Fact Ledger

The ledger is an append-only set of facts and edges. It does not merge or suppress facts.

```ts
type SourceFactKindV1 =
  | "entity"
  | "relationship"
  | "intent"
  | "decision"
  | "exclusion";

type SourceFactV1 = {
  factId: string;
  kind: SourceFactKindV1;
  sourceSpanIds: string[];
  producer: "parser" | "resolver" | "recovery" | "deterministic_source";
  payload: Record<string, unknown>;
};

type SourceCarrierEdgeV1 = {
  spanId: string;
  factId: string;
  carrierClass:
    | "atomic_entity"
    | "city_note"
    | "stay"
    | "transport"
    | "protected_detail"
    | "structural_only"
    | "context_only";
};
```

Relationship facts use explicit types such as `contains`, `ordered_route`, `alternative_set`, and `attribute_of`. They reference fact IDs or unresolved member span IDs; they never consume model category as membership proof.

Rejected or incomplete model-resolver claims remain visible with rejection codes. Do not retain only accepted claims.

### 3. Deterministic candidate-to-source alignment

Align each parser candidate to the source index using this order:

1. exact normalized `evidence` match;
2. exact title within the candidate’s declared section;
3. description/title token match constrained to the declared source block;
4. explicit `unresolved_source` state when zero or multiple spans remain plausible.

Never guess a unique span from trip-wide fuzzy similarity.

Build token and section indexes once. Candidate alignment must be approximately `O(source clauses + candidates + relationships)`, not a pairwise scan of every candidate against every source line.

### 4. Clause-to-carrier coverage

Create `SourceCoverageV4` alongside the current coverage implementation.

For every meaningful source clause, record exactly one of:

- `carried`: at least one valid atomic/note/stay/transport/protected fact;
- `structural_only`: its words appear only in a grouping proposal or container prose;
- `context_only`: its words appear only in context/accessory evidence;
- `excluded`: an explicit shared exclusion rule owns it; or
- `uncovered`: no valid fact owns it.

A structural grouping proposal can prove that a relationship was mentioned. It cannot prove that each named child was extracted as an entity.

The shadow recovery plan must batch individual uncovered clauses under their original day/section context. It must not send a whole merged paragraph merely because one child is missing.

This loop computes and scores that plan but does not invoke it. The current recovery path stays authoritative until the shadow ledger passes the corpus.

### 5. Persistence designed for 10,000 trips per month

Add one append-only row per processing run, not one database write per fact.

Recommended table: `trip_extraction_fact_sets`.

Required columns:

- `trip_id`;
- `processing_run_id`;
- `schema_version`;
- `source_fingerprint`;
- `ledger_hash`;
- `facts_json`;
- `metrics_json`;
- `created_at`.

Required constraints and access:

- unique `(processing_run_id, schema_version)`;
- trip/run foreign keys with cascade on trip deletion;
- owner read access and authenticated insert for the owning run;
- no authenticated update path;
- no GIN or full-content index over private JSON;
- only run/trip/created-time lookup indexes; and
- an idempotent repeat may confirm the same hash, never overwrite a different hash.

The aggregate processing event stores only counts, byte size, duration, versions, and hashes.

Storage targets for the acceptance corpus:

- p95 serialized ledger below 256 KB;
- maximum below 1 MB;
- one database insert per run; and
- no silent truncation. A larger ledger fails the shadow gate and remains inspectable locally.

### 6. Telemetry

Emit:

- ledger schema version and hash;
- source clause count;
- entity, relationship, intent, decision, and exclusion fact counts;
- carried, structural-only, context-only, excluded, uncovered, and ambiguous span counts;
- unresolved relationship member count;
- candidate-to-span ambiguity count;
- serialized byte size;
- ledger build milliseconds; and
- output fingerprint before and after shadow execution.

No titles, excerpts, names, addresses, booking values, or other source content appear in aggregate logs.

## Production-shaped proof cases

Sanitize and freeze these cases from the fresh run:

1. `Lesser Town & Prague Castle` structural proposal plus atomic Castle, Guard, and St. Vitus facts.
2. A resolver relationship that omits the timed Guard and lacks an explicit parent.
3. Lesser Town route containing Kafka statue, Vinárna Čertovka, John Lennon Wall, and Nový Svět, with Vinárna categorized as food.
4. Schönbrunn source list containing Gloriette, Orangeriegarten, Palm House, Apple Strudel Show, and Panorama Train, where four children appear only inside proposal prose.
5. `maybe Museum of Communism` inside a nearby planned block.
6. Duplicate source lines, overlapping chunks, chunk reordering, and chunk splitting.
7. Booking-heavy evidence, recommendation-heavy prose, spreadsheet-like rows, and lightly structured freeform notes.
8. Privacy controls proving that source locations and facts do not leak protected values into metrics or fixtures.

For the fresh-run fixture, the ledger must prove:

- Castle structure and Castle venue remain different facts;
- Guard and St. Vitus remain atomic entity facts;
- Vinárna remains an eligible authored-route member regardless of category;
- all five Schönbrunn child spans exist;
- Gloriette has an atomic carrier while Orangeriegarten, Palm House, Apple Strudel Show, and Panorama Train are reported `structural_only` or `uncovered`, never falsely `carried`; and
- the Museum of Communism span retains its own hedge/uncertain intent.

## Code surface

New modules:

- `lib/extraction/source-document-index.ts`;
- `lib/extraction/source-fact-ledger.ts`;
- `lib/extraction/source-fact-ledger-store.ts`;
- `lib/extraction/source-coverage-v4.ts`; and
- an additive SQL migration for `trip_extraction_fact_sets`.

Integration surfaces:

- `lib/extraction/openai-trip-parser.ts` — construct the index before chunking and build the shadow ledger after parser/recovery/resolver evidence exists;
- `app/maker/trips/[tripId]/data/extract/route.ts` — persist the shadow ledger once and record aggregate telemetry;
- `lib/extraction/trip-extraction-audit-types.ts` and snapshot code — expose redacted counts/hashes;
- `scripts/scorecard.mjs` — add ledger integrity assertions without changing existing output assertions; and
- the Questions work order/contract/test expectations — remove exact-three as a gate.

Do not change `evidence-clustering.ts` traveler semantics in this loop.

## Commit sequence inside the loop

1. Contract and stable source index.
2. Fact/edge builder with deterministic alignment and production-shaped fixtures.
3. Clause-to-carrier shadow coverage and shadow recovery plan.
4. Append-only persistence plus privacy-safe telemetry.
5. Route integration, scorecard assertions, documentation, and full closure gates.

Each commit must be independently revertible. The loop is incomplete until all five agree.

## Acceptance gates

### Correctness

- The fresh production fixture satisfies every proof case above.
- Structural and atomic facts never share one fact ID.
- Every fact references a known source span or records `unresolved_source`.
- Every relationship member references a fact or an unresolved member span.
- Every excluded span carries a shared exclusion code.
- Rebuilding from identical materials produces the identical ledger hash.
- Chunk order, concurrency, overlap, and split changes do not change source/fact IDs.

### No behavioral change

- Candidate 8.6 replay produces the exact existing semantic output hash.
- Fresh 8.7 offline replay produces the exact persisted-style output fingerprint before and after shadow execution.
- Activities, notes, stays, transport, groups, Questions, Calls, privacy counts, and quality diagnostics are unchanged.

### Commercial scale

- zero additional model calls;
- zero additional geocoding lookups;
- zero retries;
- one ledger database insert;
- linear-time builder with no all-pairs candidate/source or candidate/candidate search;
- p95 build time under 200 ms on the acceptance corpus;
- p95 serialized ledger below 256 KB and maximum below 1 MB; and
- no protected content in aggregate telemetry.

### Repository and replay

- targeted source-index, ledger, coverage, persistence, privacy, and route tests;
- sanitized heterogeneous document-shape fixtures;
- authoritative pinned replay and semantic parity;
- complete test suite;
- typecheck;
- optimized production build;
- scorecard dry run; and
- no network access during offline replay.

## Recovery and rollback

The ledger is behind `EXTRACTION_FACT_LEDGER_SHADOW=1` and defaults off until the additive database migration is present.

If ledger construction or persistence fails:

- the current extraction and traveler output continue unchanged;
- one internal processing event records the failure class without source content;
- no maker Question or technical recovery state is created; and
- beta activation remains blocked.

Rollback is disabling the flag or reverting the route integration. The additive table can remain unused. No traveler record depends on it in this loop.

## Exit decision and following loop

When this loop is green, compare the fact ledger against the current 30-call resolver across every saved pin and every heterogeneous fixture.

The next behavior loop may make the fact ledger authoritative and remove pre-containment identity-like merging only when:

- every ground-truth relationship and intent assertion is reproduced;
- every negative control remains separate;
- no source clause loses a carrier;
- replay/persisted parity holds; and
- no resolver-only accepted decision remains unexplained.

After that parity, remove the model resolver rather than run two semantic authorities. That is the commercially meaningful cost reduction: approximately 30 calls and 79,805 tokens per fresh-run-shaped trip, or about 300,000 calls and 798 million tokens at 10,000 trips per month.

No additional fresh extraction is authorized by this work order.
