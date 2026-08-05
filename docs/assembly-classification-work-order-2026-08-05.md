# Work order — assembly classification and block intent (2026-08-05)

Written after the structural-removal scorecard reached its explicit STOP.
This is the next separately scoped arc selected from the new numbers.

Corrected baseline: `docs/assembly-scorecard-2026-08-04-run-8.1.0-from-cache.md` —
**FAIL 10 · NOT CHECKABLE 1 · NOT BUILT 3 · PASS 17**. The earlier
**FAIL 6 · NOT CHECKABLE 7 · NOT BUILT 3 · PASS 15** result ran without the
saved geocode lane and is retained only as evidence of the replay divergence,
not as the product baseline.

Target: the five RW-CLS-001 failures: `CLS-1`, `GT-0119-3`, `GT-0119-4`,
`GT-0120-1`, and `GT-0120-3`. `GT-0116-3` (the Trdelník spelling duplicate)
is a separate identity defect and is out of scope.

## 0. Measured starting state

1. `classifyIdeaListSections` still unifies every day-plan label by DATE.
   One fixed entry protects that entire date. It has no representation for the
   locked rule that date belongs to a section while intent belongs to the
   smallest coherent block.
2. Idea-list demotion runs after slot/title collapse and cross-day repeat
   resolution. This reverses RW-ORD-001's `classify → containment → identity`
   order. On the pin, the Jan-20 St. Stephen's plan is folded into the Jan-19
   copy before either copy has a block type; the merged cross-day piece is then
   demoted to Vienna Notes.
3. The production geocode lane ran and persisted verified coordinates on 91
   observations out of a 122-candidate pool. Task G0 now reattaches those
   exact provider results at the original boundary and aborts on candidate-pool
   or stable-id drift. Block classification can therefore be measured against
   production's saved inputs rather than the parser coordinates already proven
   wrong.
4. The Jan-19 source is not one coherent list. The saved observations retain
   the durable sequence: a Schönbrunn site block, a jump to Ferris wheel and
   Hundertwasser House, a tight Mumok/Natural History pair, then intervening
   food/cafe/wine context and another scattered venue block. All share one
   dated section label.
5. The pinned text layer and OCR both contain separate `Mumok Museum` and
   `Natural History Museum` lines and no `or` token. The approved ground truth
   calls this an explicit disjunction. The existing generic disjunction repair
   correctly requires source `or`; manufacturing one from venue similarity or
   proximity would be unsupported source inference. This assertion remains a
   product-evidence question until Eli resolves the discrepancy; it is not to
   be hard-coded to these museum names.
6. `activity_bloat` is currently emitted by a post-assembly `>= 7` card
   threshold. It does not trigger block re-evaluation and therefore implements
   the behavior RW-CLS-001 explicitly rejects.

## Task G0 — pin the geocode evidence used by the saved run

**Status: complete 2026-08-05.** Full suite: 81 test files / 43 Node tests
pass. Live export and offline `--from-cache` produce the same score and make
six former grouping NOT CHECKABLE assertions judgeable. The corrected result
is the baseline above.

**Fixes observability, not product behavior.** Extend the existing scorecard
export with a `geocode.json` snapshot derived from the same saved processing
run as the parse pin:

- final per-candidate verified latitude, longitude, formatted address and
  provenance, keyed by stable resolver candidate id;
- the run's full geocode usage/candidate ledger;
- fail closed when the parse pin has no matching saved processing run or when
  pinned candidate ids do not reattach.

`--from-cache` applies this snapshot inside an async-local replay context at
the existing geocode boundary. Production with no replay context is byte-for-
byte unchanged and still calls the configured provider normally.

**Tell it fired:** from-cache reports `geocodeRan: true`; the same saved
candidate coordinates appear on the reconstructed observations; grouping
assertions become judgeable rather than silently using parser coordinates.

## Task D — classify coherent blocks before identity

**Status: complete 2026-08-05.** The pure classifier runs after structural and
provisional dates but before every slot/title/repeat identity pass. Its served
audit ledger contains 33 decisions on the pin, including mixed plan+ideas dates
for Jan 16 and Jan 19. Jan 19's scattered blocks demote without contaminating
the source-supported Schönbrunn visit; the fixed Cafe Central meal slot anchors
Jan 20's five selected peers, and that St. Stephen's copy wins identity.

Add one pure block classifier to `activity-classifier.ts`. Its input is source
order, source structure, own-item commitment, source-supported containment,
and verified coordinates. It does not know venue names or use the day heading
as an intent signal.

The classifier emits `plan`, `ideas`, `logistics`, `evidence`, or `ambiguous`
for each coherent block. Strong item evidence overrides in both directions.
Only `ideas` demotes silently. `ambiguous` preserves the item and may produce
one consolidated Question; it is never converted into ideas merely to reduce
the day count.

Run block typing before slot/title/repeat identity passes. Record every block
decision in the canonical audit summary with observation ids, date, type and
the rule that fired. A later identity pass can follow prior piece ids, but it
cannot erase or invert the earlier type.

Production-shaped guards:

- one dated section containing a same-site plan block and a geographically
  scattered idea block classifies both independently;
- a fixed meal-slot entry anchors the short Jan-20 peer block as plan;
- Jan-20 St. Stephen's wins over the Jan-19 note copy;
- a dense, coherent timed/selected day remains fully visible;
- one anomalous item does not split a block;
- parser coordinates never satisfy a geographic classification rule after the
  verification lane has run.

## Task D2 — make density a real trigger

**Status: complete 2026-08-05.** The `activity_bloat` code remains in the
public warning union for historical snapshot compatibility, but new summaries
do not manufacture warnings from a `>= 7` threshold. Production-shaped tests
prove a coherent seven-card day stays clean.

The density detector may inspect the emitted block ledger and report an
unresolved `ambiguous` block for internal review. It may not issue a generic
maker warning merely because a legitimate day has seven cards. Remove the
post-hoc threshold as a classification substitute. Preserve the warning type
for backwards-compatible reads of historical snapshots.

## Task S — score and stop

**Status: complete 2026-08-05 — STOP reached.** Current pinned result:
**FAIL 3 · NOT CHECKABLE 1 · NOT BUILT 2 · PASS 25**, improved from the
corrected **10 / 1 / 3 / 17** baseline. `CLS-1`, `CLS-2`, `GRP-4`,
`GT-0119-1`, `GT-0119-2`, `GT-0119-3`, `GT-0120-1`, and `GT-0120-3` now PASS.
Full suite: 81 files / 43 Node tests; typecheck and scorecard dry-run pass.

Remaining failures are deliberately not folded into this arc: `GRP-2` saved
provider-coordinate collisions, `GT-0116-3` Trdelník identity, and
`GT-0119-4` Mumok/Natural History. The last remains an evidence decision: the
ground truth calls it an explicit disjunction, while both pinned source layers
contain separate lines and no `or` token.

Update `CLS-2` to read the served block ledger rather than a static source
probe. Re-run the full suite, pinned replay and scorecard. Record each named
assertion that moves.

Then STOP and choose between the remaining classification evidence question,
Trdelník identity, city-keyed notes, stable decision anchors, and a fresh live
run from the measured scorecard. No extraction run is authorised by this work
order.

## Explicitly out of scope

- changing grouping membership or the geocoder's provider/retry policy;
- trusting parser coordinates after verified geocoding has run;
- hard-coding Vienna, Schönbrunn, Mumok, Natural History, or any venue;
- changing privacy, publishing, model prompts, dates, canonical ids, or the
  City Note taxonomy;
- splitting `evidence-clustering.ts`;
- fixing Trdelník duplication.

## Post-STOP CEO resolution (2026-08-05)

The Mumok/Natural-History evidence question is resolved: source wins. Both
pinned source layers contain separate lines and no `or`, so each museum is a
separate Vienna City Note idea—not an Activity and not a Question. The
authoritative ground truth, source-faithful fixture, and `GT-0119-4` now encode
that ruling without changing the generic explicit-disjunction behavior. The
pinned scorecard is **FAIL 0 · NOT CHECKABLE 0 · NOT BUILT 0 · PASS 31**.
