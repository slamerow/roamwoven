# Assembly scorecard — baseline against pinned parse `2a2ae39d-c419-4bd6-87a1-3851b6d0afce`

Trip `4eaf3c6c-f480-442b-8301-c425a032cb87` — 8.1.0. Generated 2026-08-04 by `scripts/scorecard.mjs` in **payload** mode. Scope: RW-ORD-001, RW-CLS-001, RW-GRP-001, RW-PLC-001.

Input: the live run's own audit payload — what actually shipped, geocode lane included. `records.legs` and review-question identity fields are not carried by this surface and are reported NOT CHECKABLE rather than assumed.

**This report fixes nothing.** It is the baseline the fix queue is chosen from, so that the next round works the ranked list rather than whichever symptom is loudest.

## Summary

| State | Count | Meaning |
|---|---:|---|
| FAIL | 18 | Built, and wrong. A defect or a drift. Investigate. |
| NOT CHECKABLE | 4 | The data reaches no surface. An observability defect in its own right. |
| NOT BUILT | 2 | Contract text with no implementation. Expected work, not a defect. |
| PASS | 7 | The contract held. |

Geocode verification lane: **ran**.

## Ledger defects — the ledger overstating its own coverage

These are not code defects and do not share a fix with them. Each is an entry whose `Enforcement:` field claims coverage the scorecard cannot find any implementation for.

- RW-CLS-001 claims `Enforcement: PARTIAL` while CLS-2 ("A dated day section holding a plan block and an idea block classifies each independently") has no implementation. The ledger is overstating its own coverage.
- RW-CLS-001 claims `Enforcement: PARTIAL` while CLS-3 ("No active City Note carries a date") has no implementation. The ledger is overstating its own coverage.

## RW-ORD-001 — ledger `KNOWN_GAP` — 4 FAIL, 1 NOT CHECKABLE

### FAIL — `GT-0116-1` A dated Jan-16 Prague Castle card exists at the top level

- Clause: Invariant A + Invariant B, on the proving case
- Field read: `records.items[].title + .date + .parentItemId`
- Reading: absent. Jan 16 ships 10 top-level cards, none of them the castle
- Answer key: `docs/assembly-ground-truth-central-europe.md:126` — inspect the source locally; protected source values are not copied into this report

### FAIL — `ORD-1` No piece that reached `atomic_candidate` with a real date is suppressed with no surviving record carrying it

- Clause: Invariant A — no later stage deletes a record an earlier stage justified
- Field read: `report.lineage[].actions[].reason + .finalRecords[] vs the City Note text that shipped`
- Reading: 3 routed into a City Note and NOT present in it: "Apple Studel Show", "Ferris wheel", "Schönbrunn visit"

### FAIL — `ORD-2` Every dated named-site container that reached `atomic_candidate` appears as a top-level item

- Clause: Invariant A — a named site container ships as a standalone Activity regardless of child count
- Field read: `records.items[].title/.date/.itemType/.parentItemId vs report.lineage[].title`
- Reading: 3 dated site container(s) justified; 1 with no dated card: "Prague Castle visit"

### FAIL — `ORD-3` No named site container was absorbed by a sibling that is not itself a container

- Clause: Invariant B — containment beats identity
- Field read: `report.lineage[].actions[].absorbedTitles vs .title`
- Reading: 4: "Prague Castle" -> "Changing of the Guard" (merged), "Prague Castle visit" -> "Changing of the Guard" (attached), "Prague Castle area beer note" -> "Prague Notes & Tips" (attached)

### NOT CHECKABLE — `ORD-4` Maker-facing decisions carry a leg-key/date/normalized-title or source anchor alongside the piece id

- Clause: Decision anchors — every maker-facing decision records a stable anchor
- Field read: `(reviewQuestionFields is not carried by the payload input)`
- Reading: this surface exists in the other input mode; re-run there to score it

## RW-CLS-001 — ledger `PARTIAL` — 7 FAIL, 2 NOT BUILT, 2 PASS

### FAIL — `CLS-1` No `activity_bloat` warning is raised

- Clause: Density is a soft trigger, never a classifier — an overfull day means a block was mis-typed
- Field read: `report.warnings[].code`
- Reading: 5 raised — the system observing its own misclassification and reporting it instead of resolving it: Day 3 · January 14 has a lot of visible cards, Day 4 · January 15 has a lot of visible cards, Day 5 · January 16 has a lot of visible cards, Day 8 · January 19 has a lot of visible cards, Day 11 · January 22 has a lot of visible cards

### FAIL — `GT-0116-3` Trdelník breakfast is exactly ONE Jan-16 card

- Clause: A single mention anchored to a meal slot is one untimed Activity with implicit ordering
- Field read: `records.items[].title + .date`
- Reading: 2: "Trdelník for breakfast", "Trdlnik for breakfast"
- Answer key: `docs/assembly-ground-truth-central-europe.md:123` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0116-5` R2D2 is a Prague City Note and raises no Question

- Clause: A source doubt marker demotes to City Notes silently, without a Question
- Field read: `City Note .description + records.items[].itemType + report.lineage[].actions[].reason`
- Reading: the doubt-marker demotion fired correctly and routed it to the Prague note — but the note that shipped does not contain it. Demoted, then lost.
- Answer key: `docs/assembly-ground-truth-central-europe.md:139` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0119-3` The nine scattered Jan-19 Vienna venues are City Notes, not Activities

- Clause: A scattered flat list is idea-shaped; a source-authored recommendation list belongs in City Notes
- Field read: `records.items[].itemType + .date + .title vs City Note .description`
- Reading: 3 City Note(s) trip-wide; 7 shipped as Activities: "Hundertwasser Haus", "Museum of Illusions", "Mozarthaus", "Ring Tram Tour", "The Prater", "Leopold Museum", +1 more | 2 reached neither a card nor the note text: ferris wheel, stephen
- Answer key: `docs/assembly-ground-truth-central-europe.md:184` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0119-4` Mumok / Natural History is one card, alternatives in the description

- Clause: An explicit 'X or Y' slot is ONE Activity with the choice in the description — no question, no blocker
- Field read: `records.items[].title + .description`
- Reading: neither alternative survived as a card
- Answer key: `docs/assembly-ground-truth-central-europe.md:178` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0120-1` The five Jan-20 Innere Stadt venues are Activities

- Clause: A short, deliberate, tightly clustered list is selected untimed Activities (the control for GT-0119-3)
- Field read: `records.items[].itemType + .date + .title`
- Reading: 1 wrong: stephen -> absent from Jan 20
- Answer key: `docs/assembly-ground-truth-central-europe.md:190` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0120-3` St. Stephen's and the Library keep the Jan-20 card and lose the Jan-19 note copy

- Clause: A stronger planned sighting gives the entity one Activity home and removes its City Note duplicate
- Field read: `records.items[].itemType + .date + .title`
- Reading: stephen: 0 card(s), 0 note copy(ies)
- Answer key: `docs/assembly-ground-truth-central-europe.md:193` — inspect the source locally; protected source values are not copied into this report

### NOT BUILT — `CLS-2` A dated day section holding a plan block and an idea block classifies each independently

- Clause: Intent is typed per BLOCK, not per day
- Field read: `(probe /blockType|blockIntent|intentBlock|blockBoundar/i matched nothing under lib/app/components)`
- Reading: Decided 2026-08-02. No block-boundary detection exists; classification is still per item and per day section.

### NOT BUILT — `CLS-3` No active City Note carries a date

- Clause: City Notes are keyed to a city and anchored on its legs; a City Note has no day
- Field read: `(probe /cityNoteKey|notesForCity|cityNoteCity|noteCityKey/ matched nothing under lib/app/components)`
- Reading: Decided 2026-08-02. Notes are still leg-owned via `findLegForCanonicalCity`, which returns the FIRST leg matching a city name — the exact shape the ledger names as easy to get wrong.

### PASS — `GT-0116-4` KGB Museum is exactly ONE Jan-16 card

- Clause: Repeated mentions collapse by default; separate occurrences need affirmative evidence
- Field read: `records.items[].title + .date`
- Reading: 1: "KGB museum"
- Answer key: `docs/assembly-ground-truth-central-europe.md:132` — inspect the source locally; protected source values are not copied into this report

### PASS — `GT-0116-6` Kafka statue, John Lennon Wall and Novy Svet are Jan-16 Activities, not notes

- Clause: Geographic coherence types a flat list as plan-shaped — the tight Malá Strana list is selected activities
- Field read: `records.items[].itemType + .title`
- Reading: all three typed as Activities
- Answer key: `docs/assembly-ground-truth-central-europe.md:133` — inspect the source locally; protected source values are not copied into this report

## RW-GRP-001 — ledger `KNOWN_GAP` — 5 FAIL, 1 NOT CHECKABLE, 3 PASS

### FAIL — `GRP-2` No two distinct venues share a verified coordinate

- Clause: The echo rule — a result within ~50 m of the injected container is not evidence
- Field read: `report.lineage[].observations[].verifiedLatitude/.verifiedLongitude`
- Reading: 8 collision(s): 45.4671261,9.1530195 <- 2 venues, 50.0910966,14.4016165 <- 3 venues, 50.086446,14.405385 <- 2 venues, 50.08616079999999,14.4165248 <- 2 venues, 48.1858124,16.3127641 <- 6 venues, 48.207337,16.394294 <- 2 venues, +2 more

### FAIL — `GRP-4` A Call claiming the SOURCE lists N stops is backed by N stops in the container's own description

- Clause: A Call's text is rendered FROM the membership record, never composed alongside it
- Field read: `records.reviewQuestions[].evidence (status 'noted') vs parent .description + .parentItemId`
- Reading: 1 Call(s), 1 claiming source placement; 1 false statement(s) to the maker: "Explore Schönbrunn Palace" tells the maker the source lists 7, but its description names 5 — unlisted: "Museum of Illusions", "Ring Tram Tour"

### FAIL — `GT-0116-2` Changing of the Guard is a CHILD of the castle, not its survivor

- Clause: A timed sub-stop inside a same-site parent stays a child (the fixed guard-changing time within a castle visit)
- Field read: `records.items[].parentItemId + report.lineage[].actions[].absorbedTitles`
- Reading: top-level, and it ABSORBED the container: "Prague Castle", "Prague Castle visit"
- Answer key: `docs/assembly-ground-truth-central-europe.md:126` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0119-1` Schönbrunn owns exactly the five ground-truth sub-stops

- Clause: Same-site clusters become one parent visit with sub-stops
- Field read: `records.items[].parentItemId + .title`
- Reading: 7 child(ren); 5/5 expected present; 2 unexpected: "Museum of Illusions", "Ring Tram Tour"
- Answer key: `docs/assembly-ground-truth-central-europe.md:176` — inspect the source locally; protected source values are not copied into this report

### FAIL — `GT-0119-2` Museum of Illusions and Ring Tram Tour are NOT Schönbrunn children

- Clause: A mixed-geography list stays individual cards; a non-nested item is never admitted by proximity
- Field read: `records.items[].parentItemId + .title`
- Reading: 2 wrong member(s): "Museum of Illusions", "Ring Tram Tour"
- Answer key: `docs/assembly-ground-truth-central-europe.md:182` — inspect the source locally; protected source values are not copied into this report

### NOT CHECKABLE — `GRP-1` Every group child is traceable to source nesting

- Clause: Only source bytes are source evidence; source nesting establishes candidacy, distance only corroborates
- Field read: `records.items[].parentItemId + parent .description; `verifiedFormattedAddress` reaches no surface`
- Reading: 2 child(ren) not traceable to the container's description, and the address path that may have admitted them is unreadable: "Museum of Illusions", "Ring Tram Tour"

### PASS — `GRP-3` Every parent with children has exactly one Call

- Clause: A Call is REQUIRED when grouping removes cards from the traveler's top level (with RW-REV-001)
- Field read: `records.items[].parentItemId vs records.reviewQuestions[] where status = 'noted'`
- Reading: 1 parent(s), 1 Call(s); each grouping explained

### PASS — `GRP-5` No parent card owns fewer than two children

- Clause: A valid system-created group has at least two named stops
- Field read: `records.items[].parentItemId`
- Reading: no one-child groups

### PASS — `GT-0120-2` Laundry is a standalone Jan-20 Activity, not a group child

- Clause: Group members must be the same KIND of thing — an errand is not a sightseeing stop
- Field read: `records.items[].parentItemId + .itemType`
- Reading: "Laundry" type=admin parent=none
- Answer key: `docs/assembly-ground-truth-central-europe.md:192` — inspect the source locally; protected source values are not copied into this report

## RW-PLC-001 — ledger `KNOWN_GAP` — 2 FAIL, 2 NOT CHECKABLE, 2 PASS

### FAIL — `PLC-1` No record carries `itemType: placeholder`

- Clause: Synthesized placeholder records are abolished — four homes, no fifth
- Field read: `records.items[].itemType + .status`
- Reading: 4: "Kutna Hora note" date=null leg=null, "Prague Castle" date=null leg=null, "Prague Castle visit" date=null leg=null, "Prague notes" date=null leg=null

### FAIL — `PLC-3` No active Activity is dateless

- Clause: A source-supported Activity with an unresolved date keeps its type and gets a provisional date
- Field read: `records.items[].date + .itemType + .status`
- Reading: 4 stranded: "Kutna Hora note" (placeholder), "Prague Castle" (placeholder), "Prague Castle visit" (placeholder), "Prague notes" (placeholder)

### NOT CHECKABLE — `GT-SPINE-1` 5 legs

- Clause: The trip spine is asserted, not derived from itinerary items
- Field read: `(legs is not carried by the payload input)`
- Reading: this surface exists in the other input mode; re-run there to score it
- Answer key: `docs/assembly-ground-truth-central-europe.md:19` — inspect the source locally; protected source values are not copied into this report

### NOT CHECKABLE — `PLC-2` Every open Question resolves to a real record

- Clause: Where a Question's subject was never extracted the Question is dropped and recorded as source coverage, not given a synthesized subject
- Field read: `(reviewQuestionFields is not carried by the payload input)`
- Reading: this surface exists in the other input mode; re-run there to score it

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

## How to read this

- **FAIL** means code exists and produces output that violates the contract. This is the fix queue.
- **NOT BUILT** means no implementation exists. Every declaration here carries a static probe; if the probe had found an implementation the assertion would have been evaluated instead and the stale declaration reported. NOT BUILT is never filtered out of this report.
- **NOT CHECKABLE** means the mechanism may have run but its output reaches no surface this harness can read. Treat each one as its own defect: it is how three bar items went unscored for weeks.
- A `PARTIAL` entry with NOT BUILT assertions is not automatically wrong — `PARTIAL` admits an uncovered path — but the ledger must NAME that path in the entry rather than let the label carry it. The finding is raised either way; the judgement is the CEO's.

