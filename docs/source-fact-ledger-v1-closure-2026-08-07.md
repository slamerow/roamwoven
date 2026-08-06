# Source Fact Ledger V1 closure

Date: 2026-08-07  
Contract: RW-SFL-001  
Base: `c6f81d6720b15f193e101644fe249a1668918e2c`  
Activation: `EXTRACTION_FACT_LEDGER_SHADOW=1`; default off

## Outcome

Loop 8 is implemented as a shadow-only, append-only source fact ledger. It
changes no model, prompt, geocoding, canonical assembly writer, traveler record,
Question, or Call. It adds no external call. Construction and persistence fail
softly and create one privacy-safe internal event without blocking an otherwise
usable draft.

The five independently revertible implementation steps are:

1. locked contract plus stable source document index;
2. deterministic fact and relationship ledger;
3. carrier-based Source Coverage V4 plus a non-invoking recovery plan;
4. authenticated append-only persistence plus privacy-safe telemetry; and
5. default-off route integration, scorecard assertions, Question-quality gate,
   and closure evidence.

The persisted fact set uses a source dictionary and compact source-span tuples.
Facts still carry source identity, location, and digests; protected source prose
stays in the existing protected material boundary. Fact IDs are 96-bit,
ledger-scoped deterministic digests, and excerpt digests retain 160 bits. The
full ledger is never placed in processing events or the served audit snapshot.

## Replay diagnosis

Candidate 8.6, pinned parse
`d786e9e4a20d11b2476bc60951b07d45b6fe418881a40e788dc2d9282b882c94`:

- scorecard: 66 PASS, 0 FAIL, 0 NOT CHECKABLE, 0 NOT BUILT;
- final semantic output hash:
  `d4be928274955c83cc1253264be4a296c94748fd62f79387b00e4c21cee33bde`,
  exactly the pre-Loop-8 baseline;
- 693 source clauses, 523 uncovered clauses, 18 planned recovery batches;
- guarded-offline ledger build: 28.48 ms; serialized ledger: 256,016 bytes; and
- additional model calls / geocoding lookups / retries: 0 / 0 / 0.

Fresh 8.7, pinned parse
`1f103f50f8f3d0cbf09250883dced96c372ac5caec202f26cbfe4f822ec5acf1`:

- production/replay semantic fingerprint:
  `9ba6f1b0dce237b7e07c088f8b4be549990eb4f0e247d6c7629f2941eb4bafb9`
  on both sides;
- current persisted-style replay projection: exact parity;
- shadow-off and shadow-on final semantic output hash:
  `92e0a9dc7a7b5789bdd52a811f8977b76a358679212c11ec62b329cf89dee8a6`;
- both modes reproduce the same 27 pre-existing ground-truth failures; shadow
  execution adds three RW-SFL-001 passes and changes no prior score state;
- 675 source clauses, 519 uncovered clauses, 16 planned recovery batches;
- guarded-offline ledger build: 25.45 ms; serialized ledger: 230,954 bytes; and
- additional model calls / geocoding lookups / retries: 0 / 0 / 0.

The 8.7 failures are therefore existing assembly-output defects, not Loop 8
divergence. The persisted run remains authoritative. No assembly behavior was
changed in response to replay differences.

The one fresh-cache export read already-persisted database, material, and saved
geocode records. It did not invoke extraction, OpenAI, or a geocoding provider.
Both proof replays then ran through `--from-cache`, whose replay path is offline.

## Acceptance and scale

- identical materials rebuild to an identical ledger hash;
- chunk order, overlap, split shape, and concurrency do not change source or
  fact identity;
- structural and atomic facts remain separate;
- every relationship member resolves to a fact or an unresolved member span;
- every exclusion uses the shared exclusion vocabulary;
- persistence performs one insert, treats an identical retry as success, and
  fails closed on collision, authorization, or the 1 MB maximum;
- the heterogeneous fixture corpus enforces a build-time p95 below 200 ms, a
  serialized-size p95 below 256 KiB, and a maximum below 1 MiB;
- the two production-shaped replays remain below those same p95 ceilings; and
- audit/event telemetry is an explicit aggregate-only allowlist.

At 1,000 trips per month, the uncompressed acceptance-corpus upper observation
is about 256 MB of new ledger JSON before database compression and indexes.
There is no GIN index over the payload in V1, so write amplification remains
bounded to the single append-only row. Retention remains an operations policy,
not a hidden delete path in this loop.

## Recovery and activation

Rollback is disabling `EXTRACTION_FACT_LEDGER_SHADOW` or reverting the route
integration. No traveler record depends on the table. The additive table may
remain unused.

Do not enable the flag until
`db/production-sql-2026-08-07-source-fact-ledger.sql` is applied. A build or
insert failure must continue to emit one aggregate internal failure event and
allow the existing draft to complete. Making this ledger authoritative is a
separate behavior loop and requires full fact/resolver parity first.
