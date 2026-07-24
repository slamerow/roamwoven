# Run 7.24.1 audit — trip aa218430 (2026-07-24, first REAL-PDF run on the Arc F build)

Trip `aa218430-5da8-4c8c-9ea0-b14ae8a498e6` ("7.24.1"), source `USE FOR TESTING
CZECH.pdf` (1,926,250 B). Bundle fetched live via
`/data/audit/qa-bundle?includePrivate=1` through the maker session: 242,910 B,
sha256 `a477adad0c26de958ea8f66687a07aba0762e1a828e31be3c327db253804bc63`,
`includePrivate:true`, zero serve-time masks — REAL payloads judged (the
documented 7.18.3 audit trap avoided). Repo at audit time: `main` ==
`origin/main` at e3f7e3e; Arc F build confirmed live FROM RUN TELEMETRY
(named initialViolations, serialized excludedPlanningCostLineCount,
full-content dismissedQuestions all present in this bundle).

Run completed end-to-end. **Pinning proven live: write=true, saved=true, 62
calls, parseKey `1d5668af5324f41c…` — every defect below is replayable
offline.** Telemetry: gpt-5.4-mini, 30/30 chunks; sourceRecovery 69 batched /
61 recovered / 9 residual / **1 planning-cost line excluded (field now
serialized)**; geocode budget 50 exhausted again (99 candidates, 49 skipped).
Counts: 5 legs, **9 transport (8 correct + 1 fragment)**, **6 stays (5 correct
+ 1 document-artifact)**, 78 activity cards (GT ≈ 40), 4 notes, 1 placeholder,
7 open questions (5 junk-fragment), 1 dismissed, 1 call, 0 hard / 5 quiet
warnings, 0 P0 / 5 P2 diagnostics.

Prior audit note, same date: the first "run 1" attempt (trip 6ad4ee72,
"7.24.0") processed the ANSWER KEY PDF by mistake — 5 model calls, bar
unjudgeable, discarded. This run is the real one.

## MUST-PASS scorecard (run-1 bar, CEO decision 6, approved verbatim)

| # | Bar item | Verdict |
|---|----------|---------|
| 1 | Run completes | **PASS** — all stages completed through draft snapshot |
| 2 | 5 legs | **PASS** — GT-exact spine, sixth run in a row |
| 3 | 8 transport | **FAIL** — 9 rows; extra is a fragment (chain A) |
| 4 | stays=5, phantom suppressed + disposition | **FAIL** — 6 stays; the 7.23.2 phantom shape is dead, a NEW shape shipped (chain B) |
| 5 | Zero identity signals in any public field | **PASS** — no email / person name / phone in any public field of any record kind; every 7.23.2 identity shape (email-title card, "Eli J Kamerow" stay) is gone |
| 6 | Zero code-shape tokens in any public field | **FAIL** — 3 sites, all in the activity/note lane the sweep doesn't walk (chain C) |
| 7 | No cost cards on any path | **PASS on cards** — two Costs pieces suppressed with the new path-independent candidacy reason — but cost TEXT ships embedded in surviving notes (chain D) |
| 8 | Repair trigger NAMED | **PASS** — `identityRecoveryStatus: "repaired"` with initialViolations persisted VERBATIM in both the assembly completed event and the canonicalization summary (chain E — and those strings finger the leak mechanism) |

Bar verdict: **FAIL (items 3, 4, 6).** Not shippable as run 1's exit. But see
"What held" — all four 7.23.2 leak shapes are dead; the failures are new
shapes one rule-boundary over, plus a scope gap between the approved bar's
wording and the implemented sweep.

## Chain A — 9th transport row: "Train ticket", Jan 24, null→null

`records.transport[8]`: type train, routeLabel "Train ticket", date
2019-01-24, no departure/arrival locations, departureTime 10:42, no arrival
time, confirmationLabel `0648 7232 0822 6278` (properly captured into the
protected slot — the code does NOT appear in public prose). 10:42 is the ÖBB
Jan-21 departure; the row is a second reading of the ÖBB FAHRSCHEIN OCR block
(whose raw text also surfaces inside Rome Notes & Tips, chain C/D) with a
wrong date. Diagnostics saw it twice (`transport_row_without_source_anchor`,
`critical_transport_missing_soft_details: missing arrival time`) and nothing
was empowered to kill it. 8b5afa1's reversed-twin kill doesn't match this
shape: it is not a twin, it is a fragment that cleared transport candidacy
with no route at all.

**Fix point:** transport candidacy floor — a row with neither endpoints nor a
matching source anchor is booking material, not a traveler row. The two P2s
that fired are the detection; wire them to a disposition.

## Chain B — 6th stay: "Visitacity itinerary by day 3"

`records.stays[5]`: name "Visitacity itinerary by day 3" (a source-document
artifact title), check-in 2019-01-18, check-out 2019-01-21, leg Vienna —
duplicating the Wombats window — confirmationLabel `#VPA9111671`,
reviewRequired **false**. The Arc F stay candidacy gate tested the 7.23.2
shape (person-named + dateless) and that shape is dead. This one carries a
full night range, so night-evidence candidacy PASSES it. Lineage shows the
note-lane twin was suppressed with `"note evidence routed to canonical stay,
activity, or travel records"` — i.e. the router itself minted/fed the stay
record; shipped pieces still get no lineage rows (7.23.2 chain 8.3, still
open), so the minting observation can't be quoted from the bundle. Also of
note: full date-range overlap with Wombats on the same leg produced ZERO
stay-collision warnings (hardWarnings 0).

**Fix point:** stay candidacy needs a venue-shape test alongside night
evidence (document-artifact titles — "itinerary", "by day N", filename shapes
— are not lodging names); a same-leg full-overlap second stay should at
minimum trip the stay-collision warning it currently evades.

## Chain C — code-shape tokens in public prose: the sweep's lane boundary, third time

Three GT-protected identifiers ship in public prose, all in fields the Arc F
code sweep does not walk (edde7cd scoped the prose-side code sweep to
**transport/stay prose**; these are activity cards and notes):

1. Activity "Skip the Line ticket" (Jan 15): description "Skip the Line
   ticket. Barcode number: **19813727**. Seller: DREYER s.r.o." — a bare
   ticket barcode as card prose (the card itself is a receipt-shard card).
2. Activity "Pick up car at 9 am" (Jan 17): description ends "...Car rental
   pickup location for **reservation 81486**" — the GT-protected rental
   reservation, with a marker word the booking-field scrub should love.
3. Note "Prague Notes & Tips": "...Visit Sedlec Ossuary. Visit Church of St
   Barbara. Silver mines, **L272-181125-2** Shopping: Washington, USA" — the
   walking-tour booking ref floating loose in note prose.

`protected_code_shape_in_public_prose` (P0) did not fire — consistent with
its implemented scope (transport/stay prose), which means **the implemented
scope is narrower than the approved bar wording** ("any public field of any
record kind"). The exact chain-1 lesson — shapes shared, field coverage not —
recurred one layer up: the identity predicates got full field coverage in Arc
F, the code-shape pass did not.

**Fix point:** run the code-shape pass over the same full field walk the
identity gate got (with the existing flight-code/date/clock exemptions);
detector parity for the P0.

## Chain D — Rome Notes & Tips: protected access block + raw FAHRSCHEIN OCR + Costs text in one public note

The single worst record in the draft. Its description contains, in order:

- Costs-section text: "January 24th Rome—$118 (private room—ensuite)"
  (Prague Notes similarly carries "Prague stay cost note for $56 (airbnb)").
  The candidacy-time Costs gate WORKED on its lane — lineage shows "Budapest
  budget note" and "Vienna note" suppressed with the new reason string
  ("Costs-section planning line fails canonical candidacy … exclusion is
  path-independent") and excludedPlanningCostLineCount=1 — but cost TEXT
  embedded inside a surviving merged note is invisible to a piece-level gate.
- The apartment access block, public: "HOW TO GET IN For entering the
  building, use the key. The apartment is on the first floor, the door on
  the right side. Step 1:, Step 2:, Step 3:, Step 4:" — GT-protected stay
  access material; the chain-3b arrival-directions routing and the
  key/code/wifi/buzzer credential-sentence drop both failed to catch a
  "use the key" sentence in the note lane.
- Raw ÖBB ticket OCR: "FAHRSCHEIN Zugbindung 01 ERWACHSENER DATUM: 21.01 …
  Sparschiene KEIN UMTAUSCH/KEINE ERSTATTUNG … Hinfahrt: Dauer: 2:37 …" —
  unrouted OCR shards dumped into public prose (same material that minted
  chain A's fragment row).

**Mechanism hypothesis (needs a code trace, and chain E points at it):** the
repair corridor's initialViolations name activities[79]/[80]/[81] — pieces
`…f3282735`, `…da5d47bf`, `…9074d99a`, i.e. the Notes & Tips items — as
"semantic payload does not match canonical evidence", and the corridor's
actions include `rebuilt_canonical_outputs_from_evidence`. If the rebuild
regenerates note payloads from raw evidence AFTER the sweep position
(T1: nothing may mutate output after canonicalizeCanonicalReviewDetails —
the e0f1db42 mine class), then swept lanes can un-sweep themselves at
finalization, which would explain protected material surviving in a lane
chain 3b nominally covered. Verify in canonical-trip-assembly.ts at e3f7e3e
before coding anything.

## Chain E — telemetry: Arc F's chain-8 fixes all proven live

initialViolations persisted verbatim in BOTH the assembly completed event and
the canonicalization summary (must-pass 7.23.2 item 7 is now answerable —
and the violation strings are what generated chain D's hypothesis);
excludedPlanningCostLineCount serialized (=1); the dismissed baths question
ships full text + dismissalReason ("subject entity no longer exists after
assembly; a review item cannot outlive its subject");
transport_confirmation_value_not_captured fired correctly (Delta 2934,
conf null). Still open from 7.23.2 chain 8: shipped pieces have no lineage
rows (blocked chain B's minting trace).

## What held, what didn't, attribution

- **Every 7.23.2 privacy leak shape is dead on a real parse**: no email-title
  card, no person-named stay, no ticket codes in transport descriptions
  (0468406277 and the ÖBB code appear NOWHERE in public fields; both trains
  carry correct confirmations in protected slots — no "Operator" garble),
  no cost CARDS. The Arc F gates held on every shape they were built for.
- **The failures are all one-lane-over recurrences**: code sweep scoped to
  transport/stay prose while the codes moved to activity/note prose (chain
  C); stay gate tested person-named/dateless while a dated document-artifact
  stay shipped (chain B); transport twins fixed while a fragment row shipped
  (chain A); Costs gated at piece level while cost text embedded in merged
  notes (chain D). Pattern for Arc G: gates must bind to the FIELD WALK and
  the TEXT, not to the lane and the record shape that happened to leak last
  run.
- Expected-broken items behaved as predicted (correctly outside the bar):
  Kutna Hora gutted into Prague notes again (chain 5), baths question
  minted-then-dismissed again (rebind is Arc G/T3 — the reason string it
  needs is now persisted), idea flood (78 cards), 5 junk receipt-shard trip
  questions (booking-identifier / total price / payment status / email on
  booking / provider name), geocode budget exhausted, The Yellow check-in
  Jan 13 vs GT Jan 12, Prague Airbnb confirmationLabel holds the door code
  HMRKX42RWB (capture misassignment; protected lane, so not a leak).
- Content-lane quality regressed vs 7.23.2 on question hygiene (0 → 5 junk
  questions) under a fresh unpinned parse — variance, now replayable
  (parseKey corpus: 67de9b43, 790f80db, 1d5668af).

## Fixture assertions wanted (priority order)

1. Code-shape pass covers every public field of every record kind (chain C's
   three live shapes verbatim); protected_code_shape_in_public_prose fires
   on them; scrub-or-quarantine, not log.
2. Post-repair outputs are re-swept or the rebuild is proven pre-sweep
   (chain D mechanism; assert on this bundle's three violation strings).
3. A dated stay whose name is document-artifact-shaped fails candidacy
   (chain B shape verbatim); same-leg full-overlap stays trip a collision
   warning regardless of venue-token match.
4. A transport row with no endpoints and no matching anchor fails candidacy
   (chain A shape verbatim).
5. Costs text inside merged note prose is swept (chain D's two $-lines).
6. Access-instruction sentences ("use the key", "HOW TO GET IN") route
   protected in the note lane (chain D block verbatim).

Blind-first integrity: bundle fetched and sha256-verified in-browser this
session; payloads judged by direct field scan (regex + GT known-value list)
before reading the run's own diagnostics; every quote above is copied from
the bundle. Code-mechanism claims are BUNDLE-LEVEL this time — the chain C/D
fix points reference edde7cd's stated scope, and chain D's rebuild-bypass
hypothesis is explicitly unverified until traced at e3f7e3e.
