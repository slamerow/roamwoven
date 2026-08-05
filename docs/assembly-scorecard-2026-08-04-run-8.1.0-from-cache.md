# Assembly scorecard — baseline against pinned parse `a3e0ab66b05a`

Trip `4eaf3c6c-f480-442b-8301-c425a032cb87` — 8.1.0. Generated 2026-08-04 by `scripts/scorecard.mjs` in **from-cache** mode. Scope: RW-ORD-001, RW-CLS-001, RW-GRP-001, RW-PLC-001.

Input: a re-assembly of the pinned parse with the matching saved geocode provider outputs reattached at the original boundary. Candidate-pool or result-id drift aborts the run.

**This report fixes nothing.** It is the baseline the fix queue is chosen from, so that the next round works the ranked list rather than whichever symptom is loudest.

## Summary

| State | Count | Meaning |
|---|---:|---|
| FAIL | 4 | Built, and wrong. A defect or a drift. Investigate. |
| NOT CHECKABLE | 1 | The data reaches no surface. An observability defect in its own right. |
| NOT BUILT | 2 | Contract text with no implementation. Expected work, not a defect. |
| PASS | 24 | The contract held. |

Geocode verification lane: **pinned and replayed**.

## Ledger defects — the ledger overstating its own coverage

These are not code defects and do not share a fix with them. Each is an entry whose `Enforcement:` field claims coverage the scorecard cannot find any implementation for.

- RW-CLS-001 claims `Enforcement: PARTIAL` while CLS-3 ("No active City Note carries a date") has no implementation. The ledger is overstating its own coverage.

## RW-ORD-001 — ledger `KNOWN_GAP` — 1 NOT BUILT, 4 PASS

### NOT BUILT — `ORD-4` Maker-facing decisions carry a leg-key/date/normalized-title or source anchor alongside the piece id

- Clause: Decision anchors — every maker-facing decision records a stable anchor
- Field read: `(probe /decisionAnchor|stableAnchor|anchorKey\b/ matched nothing under lib/app/components)`
- Reading: Recorded 2026-08-02. `mergeCanonicalPieceInto` still calls `refreshCanonicalPieceId` on every merge, so piece ids remain the only handle.

### PASS — `GT-0116-1` A dated Jan-16 Prague Castle card exists at the top level

- Clause: Invariant A + Invariant B, on the proving case
- Field read: `records.items[].title + .date + .parentItemId`
- Reading: "Prague Castle visit" (activity)
- Answer key: `docs/assembly-ground-truth-central-europe.md:126` — inspect the source locally; protected source values are not copied into this report

### PASS — `ORD-1` No piece that reached `atomic_candidate` with a real date is suppressed with no surviving record carrying it

- Clause: Invariant A — no later stage deletes a record an earlier stage justified
- Field read: `report.lineage[].actions[].reason + .finalRecords[] vs the City Note text that shipped`
- Reading: every justified record reaches a final record, a carrier, or a destination that contains it

### PASS — `ORD-2` Every dated named-site container that reached `atomic_candidate` appears as a top-level item

- Clause: Invariant A — a named site container ships as a standalone Activity regardless of child count
- Field read: `records.items[].title/.date/.itemType/.parentItemId vs report.lineage[].title`
- Reading: 3 dated site container(s) justified; all ship as real dated top-level cards

### PASS — `ORD-3` No named site container was absorbed by a sibling that is not itself a container

- Clause: Invariant B — containment beats identity
- Field read: `report.lineage[].actions[].absorbedTitles vs .title`
- Reading: no container lost its identity to a sibling

## RW-CLS-001 — ledger `PARTIAL` — 3 FAIL, 1 NOT BUILT, 7 PASS

### FAIL — `GT-0116-3` Trdelník breakfast is exactly ONE Jan-16 card

- Clause: A single mention anchored to a meal slot is one untimed Activity with implicit ordering
- Field read: `records.items[].title + .date`
- Reading: 2: "Trdlnik for breakfast", "Trdelník for breakfast"
- Answer key: `docs/assembly-ground-truth-central-europe.md:123` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0119-3` The nine scattered Jan-19 Vienna venues are City Notes, not Activities

- Clause: A scattered flat list is idea-shaped; a source-authored recommendation list belongs in City Notes
- Field read: `records.items[].itemType + .date + .title vs City Note .description`
- Reading: 4 City Note(s) trip-wide; 1 reached neither a card nor the note text: stephen
- Answer key: `docs/assembly-ground-truth-central-europe.md:184` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0119-4` Mumok / Natural History is one card, alternatives in the description

- Clause: An explicit 'X or Y' slot is ONE Activity with the choice in the description — no question, no blocker
- Field read: `records.items[].title + .description`
- Reading: neither alternative survived as a card
- Answer key: `docs/assembly-ground-truth-central-europe.md:178` — inspect the source locally; protected source values are not copied into this report

### NOT BUILT — `CLS-3` No active City Note carries a date

- Clause: City Notes are keyed to a city and anchored on its legs; a City Note has no day
- Field read: `(probe /cityNoteKey|notesForCity|cityNoteCity|noteCityKey/ matched nothing under lib/app/components)`
- Reading: Decided 2026-08-02. Notes are still leg-owned via `findLegForCanonicalCity`, which returns the FIRST leg matching a city name — the exact shape the ledger names as easy to get wrong.

### PASS — `CLS-1` No `activity_bloat` warning is raised

- Clause: Density is a soft trigger, never a classifier — an overfull day means a block was mis-typed
- Field read: `report.warnings[].code`
- Reading: no day reported itself overfull

### PASS — `CLS-2` A dated day section holding a plan block and an idea block classifies each independently

- Clause: Intent is typed per BLOCK, not per day
- Field read: `report.canonicalization.intentBlocks.blocks[].date/.type/.observationIds/.reason`
- Reading: 33 block decision(s); mixed plan+ideas dates: 2019-01-16, 2019-01-19

### PASS — `GT-0116-4` KGB Museum is exactly ONE Jan-16 card

- Clause: Repeated mentions collapse by default; separate occurrences need affirmative evidence
- Field read: `records.items[].title + .date`
- Reading: 1: "KGB museum"
- Answer key: `docs/assembly-ground-truth-central-europe.md:132` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0116-5` R2D2 is a Prague City Note and raises no Question

- Clause: A source doubt marker demotes to City Notes silently, without a Question
- Field read: `City Note .description + records.items[].itemType + report.lineage[].actions[].reason`
- Reading: present in the Prague note; 0 stray card(s), 0 Question(s)
- Answer key: `docs/assembly-ground-truth-central-europe.md:139` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0116-6` Kafka statue, John Lennon Wall and Novy Svet are Jan-16 Activities, not notes

- Clause: Geographic coherence types a flat list as plan-shaped — the tight Malá Strana list is selected activities
- Field read: `records.items[].itemType + .title`
- Reading: all three typed as Activities
- Answer key: `docs/assembly-ground-truth-central-europe.md:133` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0120-1` The five Jan-20 Innere Stadt venues are Activities

- Clause: A short, deliberate, tightly clustered list is selected untimed Activities (the control for GT-0119-3)
- Field read: `records.items[].itemType + .date + .title`
- Reading: all five ship as Jan-20 Activities
- Answer key: `docs/assembly-ground-truth-central-europe.md:190` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0120-3` St. Stephen's and the Library keep the Jan-20 card and lose the Jan-19 note copy

- Clause: A stronger planned sighting gives the entity one Activity home and removes its City Note duplicate
- Field read: `records.items[].itemType + .date + .title`
- Reading: one home each, note copies removed
- Answer key: `docs/assembly-ground-truth-central-europe.md:193` — inspect the source locally; protected source values are not copied into this report

## RW-GRP-001 — ledger `KNOWN_GAP` — 1 FAIL, 1 NOT CHECKABLE, 7 PASS

### FAIL — `GRP-2` No two distinct venues share a verified coordinate

- Clause: The echo rule — a result within ~50 m of the injected container is not evidence
- Field read: `report.lineage[].observations[].verifiedLatitude/.verifiedLongitude`
- Reading: 8 collision(s): 45.4671261,9.1530195 <- 2 venues, 50.08616079999999,14.4165248 <- 2 venues, 50.0910966,14.4016165 <- 3 venues, 50.086446,14.405385 <- 2 venues, 48.1858124,16.3127641 <- 6 venues, 48.1842141,16.3029026 <- 2 venues, +2 more

### NOT CHECKABLE — `GRP-1` Every group child is traceable to source nesting

- Clause: Only source bytes are source evidence; source nesting establishes candidacy, distance only corroborates
- Field read: `records.items[].parentItemId + parent .description; `verifiedFormattedAddress` reaches no surface`
- Reading: 1 child(ren) not traceable to the container's description, and the address path that may have admitted them is unreadable: "Trdelník for breakfast"

### PASS — `GRP-3` Every parent with children has exactly one Call

- Clause: A Call is REQUIRED when grouping removes cards from the traveler's top level (with RW-REV-001)
- Field read: `records.items[].parentItemId vs records.reviewQuestions[] where status = 'noted'`
- Reading: 2 parent(s), 2 Call(s); each grouping explained

### PASS — `GRP-4` A Call claiming the SOURCE lists N stops is backed by N stops in the container's own description

- Clause: A Call's text is rendered FROM the membership record, never composed alongside it
- Field read: `records.reviewQuestions[].evidence (status 'noted') vs parent .description + .parentItemId`
- Reading: 2 Call(s), 1 claiming source placement; every source claim is re-derivable from the container's own text

### PASS — `GRP-5` No parent card owns fewer than two children

- Clause: A valid system-created group has at least two named stops
- Field read: `records.items[].parentItemId`
- Reading: no one-child groups

### PASS — `GT-0116-2` Changing of the Guard is a CHILD of the castle, not its survivor

- Clause: A timed sub-stop inside a same-site parent stays a child (the fixed guard-changing time within a castle visit)
- Field read: `records.items[].parentItemId`
- Reading: child of "Prague Castle visit"
- Answer key: `docs/assembly-ground-truth-central-europe.md:126` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0119-1` Schönbrunn owns exactly the five ground-truth sub-stops

- Clause: Same-site clusters become one parent visit with sub-stops
- Field read: `records.items[].parentItemId + .title`
- Reading: 5 child(ren); 5/5 expected present
- Answer key: `docs/assembly-ground-truth-central-europe.md:176` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0119-2` Museum of Illusions and Ring Tram Tour are NOT Schönbrunn children

- Clause: A mixed-geography list stays individual cards; a non-nested item is never admitted by proximity
- Field read: `records.items[].parentItemId + .title`
- Reading: neither is a child
- Answer key: `docs/assembly-ground-truth-central-europe.md:182` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0120-2` Laundry is a standalone Jan-20 Activity, not a group child

- Clause: Group members must be the same KIND of thing — an errand is not a sightseeing stop
- Field read: `records.items[].parentItemId + .itemType`
- Reading: "Laundry" type=admin parent=none
- Answer key: `docs/assembly-ground-truth-central-europe.md:192` — inspect the source locally; protected source values are not copied into this report

## RW-PLC-001 — ledger `KNOWN_GAP` — 6 PASS

### PASS — `GT-SPINE-1` 5 legs

- Clause: The trip spine is asserted, not derived from itinerary items
- Field read: `records.legs[].status`
- Reading: 5: Rome, Prague, Vienna, Budapest, Rome
- Answer key: `docs/assembly-ground-truth-central-europe.md:19` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-SPINE-2` 8 transport rows

- Clause: One travel card per inter-city segment
- Field read: `records.transport[].status`
- Reading: 8
- Answer key: `docs/assembly-ground-truth-central-europe.md:34` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-SPINE-3` 5 stays

- Clause: Every night is covered by a stay or an overnight travel card; no stay is fabricated
- Field read: `records.stays[].status`
- Reading: 5: The Yellow, Prague Airbnb, Wombats City Hostel Vienna - The Lounge, Vitae Hostel, The RomeHello Hostel
- Answer key: `docs/assembly-ground-truth-central-europe.md:69` — inspect the source locally; protected source values are not copied into this report

### PASS — `PLC-1` No record carries `itemType: placeholder`

- Clause: Synthesized placeholder records are abolished — four homes, no fifth
- Field read: `records.items[].itemType + .status`
- Reading: none

### PASS — `PLC-2` Every open Question resolves to a real record

- Clause: Where a Question's subject was never extracted the Question is dropped and recorded as source coverage, not given a synthesized subject
- Field read: `records.reviewQuestions[].subjectCanonicalId vs records.{items,stays,transport,legs}[].canonicalId`
- Reading: 6 open Question(s), all anchored

### PASS — `PLC-3` No active Activity is dateless

- Clause: A source-supported Activity with an unresolved date keeps its type and gets a provisional date
- Field read: `records.items[].date + .itemType + .status`
- Reading: every active Activity is placed

## How to read this

- **FAIL** means code exists and produces output that violates the contract. This is the fix queue.
- **NOT BUILT** means no implementation exists. Every declaration here carries a static probe; if the probe had found an implementation the assertion would have been evaluated instead and the stale declaration reported. NOT BUILT is never filtered out of this report.
- **NOT CHECKABLE** means the mechanism may have run but its output reaches no surface this harness can read. Treat each one as its own defect: it is how three bar items went unscored for weeks.
- A `PARTIAL` entry with NOT BUILT assertions is not automatically wrong — `PARTIAL` admits an uncovered path — but the ledger must NAME that path in the entry rather than let the label carry it. The finding is raised either way; the judgement is the CEO's.
