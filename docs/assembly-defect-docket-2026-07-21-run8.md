# Assembly defect docket — runs 7.21.1a + 7.21.1b (Arc C validation, same-build variance pair)

Trips `e0f1db42` ("7.21.1a", the retried trip — first attempt failed on the
question-gate P0, fixed in e022574) and `13434949` ("7.21.1b"), both on the
Arc C build (e022574). Blind-first audit from live bundles, includePrivate=1:
a = 227,825 B sha256 `8c0c1a1d8a1f…`, b = 241,841 B sha256 `c7d877e11a17…`,
both generated 2026-07-21T06:56Z, saved to repo root (gitignored).

## Verdict: NO-SHIP both — and the headline is VARIANCE, not any single fix

The same build, same PDF, minutes apart, produced structurally different
drafts: a = 88 activities / 8 questions / 7 transport / castle SURVIVES;
b = 86 / 3 / 8 / castle GONE ENTIRELY (parser emitted it only as context
observations — nothing downstream could save it). Failure sets barely
overlap. Eli's standing trigger condition for the model A/B ("if the next
run still shows parser-drop dominance") is now met with n=2 evidence:
**recommend pulling the stronger-model chunk A/B forward as Arc D item 1.**

## Arc C fix verification (what the pair proves)

| Confidence flag | a | b |
|---|---|---|
| Prague note carries eat/drink/soup recs | **PASS** (Country Life, Mistral, Beseda, Louvre, soups, U Fleku beer spots all in note) | **PASS** |
| Gresham-class wrong groups | **PASS — zero in both**; only group is Schönbrunn ⊕ (2 stops, source-hierarchy claim, honest call) | PASS |
| Receipt shards (Adult/TOTAL/PayPal/vendor/menu) | PASS — family gone | PASS |
| GOEURO phantom row | PASS (fragment suppressed) — but a NEW shape shipped: "Train ticket 21.01" row minted from the ÖBB ticket's VIA-STATIONS (Gramatneusiedl→Gyor) — has route+times so the fragment rule passes it | PASS (8 correct rows) |
| Recovery cap | PASS both — droppedLineCount 0 (was 27) | PASS |
| Weak-credit tripwire | **WORKING** — new P2 fired in both, correctly naming the at-risk content (incl. "Kamerow" identity clauses sitting in note/context output) | WORKING |
| Castle survives | **PASS in a** (activity + ticket question; still no ⊕ container — guard/St. Vitus ship standalone) | **FAIL in b** — parser never emitted it as a card candidate |
| Idea lists stay notes | Jan-21 PASS in a (only Great Synagogue promoted; Konyv/Mazel/pastry/wine-cellar/Pinball all in notes); **Jan-19 FAIL in a — all ~11 Vienna ideas promoted** (Ferris wheel, Prater, Leopold, Mozarthaus, Illusions, NHM…) | Jan-21 FAIL in b (Gellért/Pinball/Konyv/Mazel promoted; Pinball ×2, P1 caught it); Jan-19 FAIL incl. DUPLICATE cards ("Apple Strudel/Studel Show", Hundertwasser ×2) |
| Question mix | 8: castle ✓ baths ✓ **Vienna-trio planned-or-ideas RETURNED ✓** + 5 junk (arrivalTime conflict, lockbox access-code question — gate misses targetField `accessCode`, "turn left onto…", 2 receipt-title) | 3: trio ✓ baths (but "Gellért Baths vs Gellért Bath House" aliases) + "Which day does R2D2 happen?" (hedge unseen → date question) |
| Privacy on unredacted prose | **PASS** (the "Customer details" junk card shipped EMPTY — scrub held) | **P0 FAIL — the Prague lockbox code 2580 + key-pickup instructions ship inside "Rome Notes & Tips"** plus German ÖBB ticket boilerplate. Mechanism: recovered boilerplate routed to a note; the C3 integrity-restore ("routed content must land") restored it; the credential-sentence scrub missed the phrasing ("To open the box use the code 2580" — no lockbox/door-code keyword); wrong city too. The restore pass needs the boilerplate/credential/protected filters the initial render has. |
| Evidence retention (verbatim) | Not verifiable from bundles (lineage serializer hard-nulls `evidence` — visibility gap to fix); behaviorally PARTIAL: a saw "(far away)" (R2D2 → note ✓), b did not (R2D2 → date question) | PARTIAL |

Other regressions: a's transport = 7 rows — BOTH DCA↔JFK Delta legs lost
(anchors existed; suppressed without rows) and "Home" carries arrival
"2019-01-25" as a LOCATION; junk-card family in a (street-nav "Exit the
train station onto Via Marsala", "Walk along Via Marghera", "Take tram 4 or
6…", stay-details cards, empty "Customer details", "Selected car",
"Return at the same location"). Geocode lane: budget 50 exhausted in both
(candidates ballooned to 145/191 after the candidate-selection fix — 95/141
skipped); the Lesser Town walk formed in NEITHER run.

## Arc D order (proposed)

1. **Model A/B for the chunk stage** — the standing trigger has fired.
2. **P0: integrity-restore filter** — the note-restore pass applies the
   boilerplate, credential-sentence (phrasing-hardened: "use the code",
   bare code sentences), Costs, and protected-value filters before
   restoring; cross-city guard (Prague stay material never lands in Rome
   notes); lockbox phrasing joins the credential pattern.
3. Question gate: `accessCode`-family auto-protect; nav-fragment ("turn
   left onto") and receipt-title families; conflict-arrivalTime dedupe.
4. Junk-card families: street-navigation cards, stay-details cards,
   empty-desc admin cards, rental-detail shards; via-station guard (a row
   whose route matches an existing segment's ticket VIA stations folds).
5. Geocode: candidate cap/rank (grouping-relevant first — containers,
   walk-pool with area labels; cap the rest), or budget ~150.
6. Evidence field rides into lineage serialization (verbatim-compliance
   becomes auditable).

Blind-first integrity: produced without sight of Eli's diffs.
