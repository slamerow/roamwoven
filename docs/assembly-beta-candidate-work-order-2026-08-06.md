# Work order — assembly beta candidate (2026-08-06)

Status: approved next coding pass; no implementation begun

Scope: assembly only

Deployment audited: `2e056d6497bd6651a04f13de0fed5bd23250a0aa`

Trip: `6e200576-b6d5-4a6d-afd3-7beaec001f1c`

Run: `314c87b9-e014-4811-9d0f-bda60a263ac2`

Draft snapshot: `8d57e788-0bf7-4dd3-8648-85a8753c4e59`

Pin: `d786e9e4a20d11b2476bc60951b07d45b6fe418881a40e788dc2d9282b882c94`

## Decision

The production extraction infrastructure completed successfully; persisted
assembly is not beta-ready. The next engineering pass fixes assembly as one
ordered system. It does not tune the model, modify the prompt, trigger another
extraction, build password UI, or expand into publishing, photos, or the rest
of the product.

The locked runtime order is:

`classify → resolve containment → resolve identity → group → question/review → publish projection`

Containment and grouping are deliberately separate. Containment creates a
non-mutating relationship ledger that protects structure from identity.
Grouping applies parent relations only after identity has selected final
survivors.

Passing this authoritative corpus makes the branch an assembly beta candidate.
Beta readiness additionally requires heterogeneous-itinerary validation and an
explicitly authorized fresh run.

## Applicable locked contracts

Read `AGENTS.md` and `docs/product-contracts.md` completely before editing.
Name these contracts in the pre-code callout:

- RW-ORD-001 — one stage order; later stages cannot undo justified output;
- RW-QA-001 — semantic QA is fail-soft;
- RW-CAN-001 — identity/finalization is the semantic boundary;
- RW-GRP-001 — containment and grouping preserve the traveler's model;
- RW-ASM-001 — one primary traveler-visible home;
- RW-CLS-001 — source intent is typed per coherent block;
- RW-EVD-001 — every meaningful block has an explicit disposition;
- RW-REV-001 and RW-QUE-001 — truthful Calls and material Questions;
- RW-PRI-001 — privacy is automatic and final-projection safe;
- RW-AUD-001 — detector findings require independent proof;
- RW-OPS-001 — every validator has a complete route-level outcome.

There is no open product decision in this pass.

## Preserved authority

The exact run artifacts were preserved outside git before code changes:

`/Users/eli/Documents/Codex/2026-08-06/goal-audit-roamwoven-s-single-fresh/outputs`

They include processing events/run, audit payload, persisted redacted QA bundle,
extraction pin, raw calls, source materials, geocode provider snapshot, trip
metadata, and separate production/replay scorecards. Exact raw artifacts may
contain protected source material and must not be committed. Checked-in tests
use minimal sanitized production-shaped fixtures.

The persisted record surface is authoritative for what shipped. The current
replay differs from production and is diagnostic only until Loop 0 achieves
route-equivalent semantic parity.

## Fresh-run result

Operational path:

- about 225.8 seconds of an 800-second budget;
- unchanged `gpt-5.4-mini`;
- 30/30 primary chunks, zero rescues/failures;
- source recovery ran once: 45 lines batched, 29 recovered, 56 residual;
- complete saved geocode lane: 130 candidates, 132 lookups, 92 resolved,
  two accepted retries, zero failures.

Persisted semantic result:

- trip spine passes: 5 legs, 8 transport rows, 5 stays;
- only 3/14 day sections have no identified assembly defect;
- 0/3 City Notes are clean;
- 1/4 required group structures is complete;
- six Questions shipped; exact target is three;
- two grouping Calls shipped; exact target is three, and Schönbrunn's claim is
  false relative to its membership record;
- at least one protected-class booking/customer-detail shape reached public
  City Note prose;
- production quality reported two P1 and five P2 findings and preserved both
  P1 outputs after retry.

The historical 31-check score is too narrow and reconstructs some records from
lineage. It cannot serve as the assembly beta gate.

## Settled attribution

- Raw calls contain separate Colosseum, The Yellow, Palm House, and Museum of
  Illusions records. `repairSplitDisjunctions` fabricated both shipped `or`
  titles from a flattened OCR paragraph.
- `30-minute walk` is raw note/accessory detail; `Payment due` is raw
  admin/accessory; `Return` is raw admin; Wi-Fi is a raw note/role
  contradiction. Final Activity promotion is downstream candidacy behavior.
- Pinball's two loose dated mentions originate in raw calls; identity/home
  policy failed to file them once in Budapest City Notes.
- R2D2 is demoted correctly and then lost. Great Market Hall, House of Terror,
  New York Cafe, Gloriette, Panorama Train, Leopold Museum, and Hospital in the
  Rock also name or imply survivor homes that do not carry the final fact.
- Laundry survives only in Vienna City Notes; source intent requires a Jan-20
  Activity.
- All shipped group children are source-supported, but grouping is incomplete.
- The public City Note leak occurs after raw protected booking/contact capture;
  final projection owns the failure.

## Engineering discipline

- Create a clean branch/worktree from this documentation checkpoint. Do not
  reset, clean, or reuse the dirty production checkout.
- One implementation task owns the whole assembly branch; do not start one chat
  per symptom or per loop.
- One commit per loop below. Do not deploy intermediate commits.
- Before changing `itemType`, `evidenceRole`, `outputEligible`, parent/group
  fields, City Note text, or review fields, run
  `scripts/blast-radius.sh <field>` and record every semantic writer/consumer.
- Each decision domain has one authoritative writer. Remove or make read-only
  every superseded mutating pass in the same loop; never leave a second repair
  downstream as insurance.
- Every loop includes its implementation, positive and adversarial
  production-shaped tests, served telemetry, exact saved-run replay,
  persisted-style scoring, full assembly/canonical regressions, full repository
  suite, typecheck, and a revertible commit.
- Run the optimized production build after route/compiler boundary changes and
  at final closure.
- No production extraction endpoint may be invoked.

## Loop 0 — measurement parity, zero behavior change

**Invariant:** one saved assembly result has one canonical representation and
one score. A replay cannot be green while persisted production is red.

Implement:

1. Add direct persisted QA-record input to `scripts/scorecard.mjs`; never infer a
   missing field or reconstruct an exact row when it is available.
2. Make replay exercise the route-equivalent assembly, rebuild, and quality
   corridor with the same pin, materials, geocode results, and flags.
3. Compare semantic fingerprints: kind, status, date, parent, City Note key/text
   digest, review anchors/options/status, public protected-value count, and
   record counts. Exclude timestamps, generated ids, and semantically irrelevant
   order.
4. Inventory every mutating pass in `evidence-clustering.ts`; serve an
   executable stage/writer trace that exposes the current early mutating
   card/note reconciliation.
5. Expand the gate from 31 assertions to the complete day, City Note, grouping,
   identity, debris, conservation, privacy, Question, and Call requirements.

Stop: replay matches the persisted production semantic fingerprint and
reproduces every known defect. If parity cannot be reached, no behavior loop
begins.

## Loop 1 — source-bounded parser syntax repair

**Invariant:** parser normalization repairs syntax only when a bounded local
source span proves it. It cannot infer identity, containment, or choice.

Restrict disjunction repair to an explicit local `X or Y` construction whose
two candidates originate in that span. Test all four legitimate alternatives
and exact negative controls for Colosseum/The Yellow and Palm House/Museum of
Illusions. Telemetry records the span hash/range, observation ids, rule, and
before/after role without source secrets.

Stop: the two fabricated titles disappear, legitimate alternatives remain, and
all other semantic output is unchanged.

## Loop 2 — authoritative classification and Activity candidacy

**Invariant:** every observation receives one role before containment or
identity can suppress it. A later pass cannot promote admin, note, or accessory
material without explicit audited commitment evidence.

Implement one pure role/candidacy decision shared by primary intake, source
recovery, block classification, and final Activity enforcement. Resolve
`itemType`/`evidenceRole` contradictions explicitly. Move the first mutating
`reconcileCardsAgainstCityNotes` invocation after block classification; an
earlier pass may observe but cannot suppress or change kind. Preserve one block
decision id and retire legacy mutators that can invert it.

Production targets include `Explore Rome`, `30-minute walk`, `Payment due`,
Wi-Fi, Return, Museum of Communism, Albertina, Laundry, Koscom, `Eat`, `Buy
wine`, and Great Synagogue. Useful details route to durable owners.

Stop: primary/recovery lanes agree, all production role cases are correct, and
no downstream pass changes a stamped block decision.

## Loop 3 — non-mutating containment ledger

**Invariant:** containment resolves before identity and remains separate from
grouping. It creates no parent ids, suppression, container records, or Calls.

Evolve the existing `grouping-claim-ledger.ts`,
`createSiteMembershipContext`, and `CanonicalGroupingDecision` machinery into
the single typed containment authority. Absorb the independent
`isSiteComponentTitlePair` and `pieceIsProtectedPlanCopy` semantic guards, then
retire their independent authority. Preserve source nesting, site-versus-route
typing, echo protection, coordinate licensing, same-kind checks, independent
booking/time guards, and the shared `>=2` container rule.

Required relations: Jan-15 tour; Prague Castle; Malá Strana; Schönbrunn.
Negative controls: Museum of Illusions, Ring Tram, Laundry, container-query
echoes, named peer sites, independent bookings, and one-child pseudo-groups.

Stop: the ledger is exact, every identity path consumes its `doNotMerge` guard,
and traveler/review output is unchanged.

## Loop 4 — identity and one durable home

**Invariant:** one intended occurrence has one home unless the source
affirmatively proves separate visits. Containment components never merge with
their parent or sibling.

Run identity only after the containment ledger. Choose winners from commitment,
block role, date/slot evidence, City Note candidacy, and verified venue
identity. Distinct dates alone are neutral. A suppression commits only after an
output-eligible carrier accepts every unique useful-fact digest.

Production targets: Pinball → one Budapest note idea; Great Market Hall →
Jan-22 Activity; one Jan-22 basilica venue while Jan-23 tower remains distinct;
KGB remains one Jan-16 card. Preserve fixed repeated bookings and every
parent/component negative control.

Stop: every loser has a durable carrier, all facts migrate, and no parent
relation has yet been applied.

## Loop 5 — grouping execution from frozen ledgers

**Invariant:** grouping consumes final identity survivors and the containment
ledger. It cannot discover identity, reclassify, or widen containment.

Required final structures:

1. Jan-15 booked tour with Old Town Square and Jewish Quarter children; no Call.
2. Prague Castle with supported children; Call required.
3. Malá Strana with Kafka statue, John Lennon Wall, Vinárna Čertovka, Nový
   svět; Call required.
4. Schönbrunn with Gloriette, Orangeriegarten, Palm House, Apple Strudel Show,
   Panorama Train in source order; Call required.

Map candidate ids through identity survivors first. Freeze one decision record
containing membership, order, provenance, rejections, and Call policy. All
records, telemetry, and later Call text derive from that record.

Stop: all four groups are exact and ordered; no negative control is grouped;
only declared parent relations change.

## Loop 6 — content conservation and final-projection privacy

**Invariant:** every meaningful source fact has exactly one public carrier,
protected carrier, or explicit exclusion. No protected-class or personal value
can appear publicly after the final mutation.

Use one authoritative segment-safety classifier for initial note rendering,
restore, merge, retry, and final projection. Classify raw and sanitized forms;
record exclusions before mutation. A `survivorId` is insufficient—the final
output-eligible carrier must contain the fact digest. If it does not, fail soft
by restoring a safe original or correct City Note home. Run the protected-value
detector after the last text mutation and locally scrub/route any confirmed
segment without killing the draft.

Restore the correct homes for R2D2, Vienna ideas, Pinball, Hospital in the Rock,
Great Market Hall, House of Terror, New York Cafe, Laundry, and group members.
Test ordinary numbers, venue prices/addresses, and public activity/tour/
restaurant/rental/in-city-pass references as negative privacy controls.

Stop: all three City Notes match ground truth, zero facts are unresolved, and
final public protected-value count is zero.

## Loop 7 — review, independent QA, and closure

**Invariant:** Questions request only unresolved material decisions. Calls
truthfully describe completed visible actions. A detector cannot mutate output
without independent source/canonical/final reconciliation.

Exact Questions:

1. Prague Castle ticket choice.
2. Jan-18 State Hall / Time Travel / Belvedere planned-versus-ideas; Albertina
   excluded.
3. Jan-21 Gellért versus Széchenyi baths.

Exact Calls:

1. Prague Castle grouping from its membership record.
2. Malá Strana grouping from its membership record.
3. Schönbrunn grouping from its membership record.

No Jan-15 tour Call; no Watches privacy, duplicate St. Vitus, or source-obvious
provider Question.

Extend quality detection to the production P0/P1 shapes, but reconcile every
finding independently. Invoke the single owning deterministic repair at most
once and re-audit. Route-level mocked tests cover clean unchanged output, one
bounded repaired output, and a usable unresolved conservative fallback. No
second repair cycle or technical recovery state is allowed after usable parse
evidence exists.

Stop: exact 3 Questions/3 Calls, zero P0/P1, no detector incident, no
`conservative_fallback_preserved_for_review` on this corpus, all expanded
ground truth passes, semantic fingerprints agree, full suite/typecheck/build
pass.

## Branch completion and next gate

The assembly branch is complete only when:

- route-equivalent replay and persisted-style records agree;
- 14/14 day sections match intended homes and structure;
- all three City Notes are complete and safe;
- all four groups are exact and ordered;
- exact 3 Questions and 3 Calls remain;
- every meaningful observation has one durable final disposition;
- public protected-value count and P0/P1 count are zero;
- all loop and repository gates pass; and
- no live extraction occurred.

Then validate against heterogeneous saved/pinned itineraries in the same
branch. Ask for explicit authorization before one fresh paid/live extraction.
Do not begin password UI or other product work in this pass.
