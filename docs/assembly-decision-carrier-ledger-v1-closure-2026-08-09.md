# Assembly Decision & Carrier Ledger V1 closure

Date: 2026-08-09
Contract: RW-ADL-001
Base: `6e0282fd69b617207dfc3cd46e021f46efbf7c03` (completed Loop 8)
Activation: `ASSEMBLY_DECISION_LEDGER_SHADOW=1`, additionally requiring
`EXTRACTION_FACT_LEDGER_SHADOW=1`; both default off

## Outcome

Loop 9 is implemented as a shadow-only, append-only explanation layer over the
existing canonical pipeline. Every Source Fact Ledger V1 fact ends in exactly
one type-valid disposition. Carried entities point to class-specific hash-only
final carriers; grouping keeps child carriers distinct; resolver proposals and
recovery bindings remain checkable; and later decision domains cannot silently
delete earlier source justification.

The loop does not change the extraction model, prompt, sampling, recovery
request, resolver application, geocoding, canonical assembly, traveler records,
Questions, Calls, or privacy projection. It adds no external call or retry.
No migration was applied, no flag was enabled, and no live extraction was run.

The five independently revertible implementation steps are:

1. immutable companion schema, stable IDs, terminal outcomes, privacy allowlist,
   and locked audit baselines;
2. raw resolver evaluation capture plus recovery source-binding sidecars;
3. all-six-domain decision graph plus exact fact-to-carrier reconciliation;
4. network-disabled decision ablation, heterogeneous semantic fixtures, and
   four-universe conservation gates; and
5. compact append-only persistence, exact Source Fact dependency, terminal
   route integration, aggregate QA telemetry, and closure evidence.

## Counterfactual diagnosis

The checked-in ablation harness captures the pinned parse and resolver stage
graph once, disables network access, then removes each accepted role decision
individually and reruns deterministic assembly. It is not imported by a
customer route.

The first candidate replay exposed 11 durable-ID collisions where distinct raw
proposals became indistinguishable after forbidden transient candidate IDs were
dropped. The schema now preserves that multiplicity with a deterministic
occurrence ordinal. The same replay also exposed two audit-only lookup defects:
span/unresolved bindings were not counted, and grouping proposals were searched
as entity facts instead of relationship facts. Both were corrected at the
identity/checking layer; no extraction or assembly behavior changed.

Candidate 8.6 remains locked to the accompanying audited evidence:

- semantic hash
  `d4be928274955c83cc1253264be4a296c94748fd62f79387b00e4c21cee33bde`;
- 66/66 candidate scorecard;
- 161 accepted/applied evaluations from 223 raw proposals;
- 18 individually behavior-bearing decisions: 10 `city_note`, 8
  `keep_activity`;
- binding status for those 18: 16 source facts, 1 source span, and 1 explicit
  unresolved binding;
- model cache 62 hits / 0 misses; and
- geocode pool 130 / 130.

The candidate cache was exported from the exact pinned production parse by six
read-only database GET requests: zero writes, zero extraction triggers, and no
model or geocoding call. The guarded replay then disabled network access inside
the process. It reproduced all 161 applied evaluations and all 223 raw proposal
outcomes one-to-one; all 18 behavior-bearing decisions are ledger-linked.

Fresh 8.7 was rerun from its local pinned cache after implementation:

- semantic hash
  `92e0a9dc7a7b5789bdd52a811f8977b76a358679212c11ec62b329cf89dee8a6`;
- 113 accepted/applied evaluations from 150 raw proposals;
- 5 individually behavior-bearing decisions, all `city_note`, and all 5 linked
  to durable source facts;
- linkage: 3 exact chunk evidence, 1 ambiguous chunk source, and 1 explicit
  unresolved recovery source;
- model cache 60 hits / 0 misses;
- geocode pool 89 / 89; and
- network access disabled by the harness.

The candidate shadow-on scorecard is 69/69 PASS. The fresh shadow-on scorecard
remains at the same 27 pre-existing failures and adds six support-ledger passes:
27 FAIL, 0 NOT CHECKABLE, 0 NOT BUILT, 42 PASS. Persisted-style score-state
parity is exact in both. Loop 9 did not “fix” a replay by changing traveler
behavior.

## Persistence and recovery

`trip_assembly_decision_sets` stores one compact decision set per processing run
and schema version. A unique four-column Source Fact key and matching composite
foreign key require the same trip, run, source schema, and source ledger hash.
The application also carries the inserted/hash-confirmed source result through
the route and refuses the decision write if that proof is absent or mismatched.

The stored JSON uses sorted dictionaries and fixed-order tuples. A full
round-trip back to the in-memory V1 set must reproduce the exact decision-set
hash before insertion. Stable-ID and code-shape checks reject non-allowlisted
durable strings before persistence. An identical retry confirms the existing
hash; a different hash never overwrites.

The route builds the companion only after the quality corridor reaches terminal
assembly. A missing source dependency, build mismatch, oversized payload,
database failure, or event-store failure leaves the same usable draft intact.
It creates no maker Question or Call and performs no retry. Exactly one
aggregate decision-ledger event is attempted for the terminal result.

## Semantic, privacy, and scale proof

- booking-heavy: Stay, Transport, and protected facts terminate in their own
  carrier classes; protected values reach neither public prose, compact JSON,
  nor telemetry;
- recommendation-heavy: hedged suggestions remain City Notes while source-own
  commitment remains Activity;
- spreadsheet-like: repeated same-title rows on different dates remain distinct
  and stable under row reorder, with no invented containment;
- freeform: route relationships stay distinct from their entity carriers,
  loose hedges remain uncertain, and exclusions remain explicit;
- V3 meaningful lines, V1 source facts, RW-ORD observations, and final records
  are conserved independently and never equated;
- candidate 8.6 decision build: 35.73 ms in the guarded ablation replay and
  38.41 ms in the independent scorecard dry run;
- candidate 8.6 compact decision payload: 142,050 bytes;
- candidate 8.6 source-plus-decision payload: 398,066 bytes;
- fresh 8.7 decision build: 27.88 ms in the guarded ablation replay and
  30.33 ms in the independent scorecard dry run;
- fresh 8.7 compact decision payload: 114,734 bytes;
- fresh 8.7 source-plus-decision payload: 345,688 bytes;
- hard decision maximum: below 1 MiB; and
- additional model calls / geocoding lookups / retries: 0 / 0 / 0.

At 1,000 trips per month, the 512 KiB combined p95 ceiling bounds uncompressed
ledger JSON to about 500 MiB per month before database compression. There is no
GIN or full-content index and no hidden deletion path. Retention remains an
explicit operations decision.

## Gates and activation boundary

The final repository gates cover schema, stable IDs, resolver evaluations,
recovery bindings, decision graph, carrier reconciliation, heterogeneous
semantics, conservation, compact round-trip, dependency refusal, idempotency,
collision, size, privacy, SQL policy, route order, fail-soft recovery, audit
allowlisting, scorecard parity, full tests, type-check, and optimized build.
The final local gates pass 102 test files, TypeScript checking, and the
optimized Next.js production build.

Do not enable either flag until the Source Fact migration is present and
`db/production-sql-2026-08-09-assembly-decision-carrier-ledger.sql` has been
reviewed and applied. Enable Source Fact first, confirm healthy exact-hash rows,
then enable the decision ledger. Rollback is disabling the decision flag or
reverting commit 9.5; no traveler output depends on the table.

Loop 9 does not authorize resolver removal. The following behavior loop must
derive all 18 candidate and all 5 fresh behavior-bearing judgments from source
facts, eliminate unresolved behavior-bearing bindings, reproduce every carrier
and relationship/intent outcome, and match resolver-enabled route output before
switching authority and removing the model resolver in that same bounded loop.
