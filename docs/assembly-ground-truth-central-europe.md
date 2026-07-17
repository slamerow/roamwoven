# Assembly Ground Truth v2 — "Czech out Eli's Colossal Eastern Europe Excursion"

Revision of the answer key incorporating Eli's comment round 1 (33 comments) and the
follow-up discussion. Changed items are marked **Δ**. **APPROVED by Eli 2026-07-17** —
this is the ground truth the automated test fixture is built from.

Legend: ⏰ timed activity · ▫ untimed activity (clearly selected) · ⊕ system-grouped parent
with sub-stops · 🔒 protected detail (traveler password) · ❓ review question assembly should ask

**Δ Call definition (corrected):** a call explains an *action* the system took — almost always
grouping — never the absence of action or plain system logic. Test: "if you sent a friend your
itinerary and they said 'cool, we should group these things' and you said 'oh tight, that makes
sense'" — that's a call. Calls also serve as the pressure valve against activity bloat.

---

## Trip spine

5 legs, bounded by inter-city travel:

| # | Leg | Dates |
|---|-----|-------|
| 1 | Rome | Jan 12 (depart US) – Jan 14 |
| 2 | Prague (includes Kutna Hora day trip) | Jan 14 – Jan 18 |
| 3 | Vienna | Jan 18 – Jan 21 |
| 4 | Budapest | Jan 21 – Jan 24 |
| 5 | Rome | Jan 24 – Jan 25 (fly home) |

**Δ** Kutna Hora (Jan 17) stays a day trip inside the Prague leg, not a 6th leg — the sleeping
location doesn't change. (System logic, not a call.)

---

## Travel — 8 travel cards (confirmations protected)

**Δ Travel card definition:** a travel card is a subset of activity cards covering each
individual flight/train/ferry/bus that makes an inter-city transfer and changes where the stay
is. One card per segment — connections are never merged. The travel-card treatment exists to
make blurring protected info easy.

| # | Date | Transport | Public | 🔒 Protected |
|---|------|-----------|--------|--------------|
| 1 | Jan 12 | Delta 5925 DCA→JFK 5:00→6:41 PM | route, times | conf #GHFHPG, seat 11C |
| 2 | Jan 12 | Delta 444 JFK→FCO 7:46 PM→10:15 AM (+1) | route, times | conf #GHFHPG, seat 30F |
| 3 | Jan 14 | Ryanair FR8331 Ciampino→Prague 9:20→11:10 AM | route, times | conf N8WBRE, seat 2D |
| 4 | Jan 18 | RegioJet RJ 1033 Praha hl.n. 9:20 → Wien Hbf 13:23 | route, times | booking 1beb5005, travel code 0468406277, seat 4/11 |
| 5 | Jan 21 | ÖBB D 143 Wien Hbf 10:42 → Budapest-Keleti 13:19 | route, times | booking VXFHXKCQEPHPUSNT |
| 6 | Jan 24 | Wizz Air W6 2339 Budapest T2b→FCO 12:20→2:10 PM | route, times | conf RDGHMT, seat C1 |
| 7 | Jan 25 | Delta 1043 FCO→JFK 2:45→6:45 PM | route, times | conf #GHFHPG, seat 14J |
| 8 | Jan 25 | Delta 2934 JFK→DCA 8:30→9:50 PM | route, times | conf #GHFHPG, seat 13D |

**Δ** The Jan 17 rental car is NOT a travel card — same-day return, same location, sleeping
location unchanged. It's a timed activity on Jan 17 (see day-by-day).

"Leave for airport 2:30 PM" (Jan 12) attaches to card 1 and "Wake at 6:00 AM for Ciampino"
(Jan 14) to card 3 as prep notes — not separate activities.

---

## Stays (addresses + confirmations + access info protected)

**Δ Night-coverage rule:** every night is covered by either a stay or an overnight travel card.
Stays span check-in→check-out; they are not required to span the whole leg. The night of Jan 12
is covered by Delta 444's (+1) arrival — no stay is fabricated, and the Rome 1 stay simply
begins Jan 13.

| Leg | Stay | 🔒 Protected |
|-----|------|--------------|
| Rome 1 (Jan 13–14) **Δ** | The Yellow (hostel), check-in 2:30 PM | Via Palestro 51, conf 743-410652363, €45.75 due on arrival, walking directions from Termini (kept as protected "getting there" detail) |
| Prague | Airbnb, check-in after 3:00 PM | Michalská 431/5 address, **lockbox code 2580**, key-pickup steps, door code HMRKX42RWB, **WiFi Wimgen / WelcomeHome2017** |
| Vienna | Wombats City Hostel "The Lounge", 3 nights | Mariahilfer Strasse 137, res 13911-411380482 |
| Budapest | Vitae Hostel | Erzsebet korut 50, **buzzer 25**, res 43145-412325267, metro directions from Keleti |
| Rome 2 | The RomeHello Hostel | Via Torino 45, res 283260-411989672, directions from Termini |

**Δ** Cost info appears on a stay card only when money is due on arrival (The Yellow's €45.75).
The Prague lockbox photos/steps (last PDF pages) belong to the Prague stay as protected
check-in instructions, not activities.

---

## Day-by-day activities

### Jan 12 — Fly to Rome

Travel only (cards 1–2). No activities.

### Jan 13 — Explore Rome

- ⏰ Colosseum, 2:00 PM
- ⏰ Pantheon, 4:30 PM
- ⏰ Trevi Fountain, ~5:30 PM
- ▫ Spanish Steps (sequenced after Trevi, no time)
- Walk-time notes ("30 min walk / 10 min metro") become card descriptions, not activities.

**Δ** 4 individual sequenced activities — no invented grouped "walking tour" parent. Ordering
logic: provided time first, then source sequencing, then semantics (breakfast never sorts after
lunch even if the source lists it that way).

### Jan 14 — Fly to Prague / Old Town

- Travel: Ryanair (card 3)
- ▫ Charles Bridge · Astronomical Clock ("stop by on the hour" = description, not a timestamp)
  · Lucerna Arcade · Dancing House — 4 untimed activities; a chosen evening route, not a grouped
  tour and not city notes. **Δ** (No [CALL] marker — nothing was grouped.)
- ▫ Catacombs tour
- ⏰ Hemingway Bar, 6:00 PM (2 people)
- Museum of Communism appears here without commitment AND on Jan 17 as "maybe" → never committed
  anywhere → **one Prague city note**, no question. (City note = "something we could/might do" —
  good info for free time.)
- City notes (Prague · Eat): country life, trdelník, Mistral Cafe, Malostranská beseda, Cafe
  Louvre; garlic/onion soup note (česnečka, cibulačka).

### Jan 15 — Walking tour / Jewish History

- ⏰ ⊕ "Old Town and Jewish Quarter Hidden Secrets" walking tour, 9:00 AM — booked
  (L272-181125-2, 395 CZK 🔒). Old Town Square and Jewish Quarter are sub-stops, not separate
  cards. The praguego.com link attaches as a reference.
- ⏰ Klementinum guided tour, 2:30 PM — ticketed (380 Kč 🔒)
- ⏰ Bellevue dinner, 6:30 PM — booked (R9951859874 🔒, menu detail as description)

### Jan 16 — Lesser Town & Prague Castle

- ▫ Trdelník breakfast **Δ** — untimed activity. Rule: single mention + meal-slot anchor
  ("breakfast") = activity with implicit time-of-day ordering; city notes are only for
  repeated-uncommitted or listed-as-options items.
- ⊕ Prague Castle complex (~2 hrs): sub-stops Changing of the Guard ⏰ 12:00 PM, St. Vitus
  Cathedral, Golden Lane-style items. "Need to decide which ticket" ❓ → review question #1.
  **Δ** If the maker answers "unknown / not decided yet," that doesn't block publishing — it
  translates to a description ("still need to choose tour").
- ⏰ Lunch U Malířů, 1:00 PM — booked (R8167918050 🔒). **Δ** Restaurant/meal info from the
  source goes in the description, same treatment as Bellevue.
- ▫ KGB Museum (~1 hr) — listed twice on this day in the source; one card.
- **Δ** ⊕ Malá Strana & Hradčany walk — grouped parent with sub-stops Kafka statue · John Lennon
  Wall · Vinárna Čertovka · Novy Svet, with a call: "these four untimed sights sit in adjacent
  quarters and read as one walking route, so we grouped them." The Novy Svet prose paragraph →
  that sub-stop's description. (Grouping rule: ≥3 adjacent-in-source untimed sights that pass a
  geo-proximity check. Timed/ticketed items stay standalone — unless they're inside a single
  complex/campus, like the Changing of the Guard above.)
- **Δ** R2D2 "(far away)" → **Prague city note**, no question. Doubt-marker rule: parentheticals
  like "(far away)," "maybe," "?" demote silently.
- City notes (Prague · Drinks): Peklo monastery-cellar bar rec, "popular beer spots U Fleku,
  U Medvídku, U Pinkasů."

**Δ Density rule (soft):** ~6 cards/day (travel cards included) is a *suggestion trigger*, not
a limit. Exceeding it makes the system look for grouping candidates (geo rule) and demotion
candidates (doubt markers) — it never forces a collapse or invents an illogical group. A 9-card
day with nothing groupable ships as 9 cards. Jan 16 lands at 5 cards.

### Jan 17 — Kutna Hora (day trip)

**Δ** 5 activities, no travel cards, no [CALL]s:

- ⏰ Pick up rental car, 9:00 AM, Revolucní 1044/23 (reservation 81486 🔒; return 8:00 PM same
  location as a note on this card)
- ▫ Sedlec Ossuary
- ▫ Church of St. Barbara
- ▫ Silver mines
- ▫ Koscom watch shop (Prague) — sequenced after the day trip; "back by 5" → description.
  **Δ** Unknown-token rule: "koscom" fails lookup → one light search identifies it (watch shop,
  Nové Město) for *enrichment only*; placement comes from the source's sequencing ("be back by 5
  to go to the shop" puts it in Prague), never from the search.
- "maybe communism museum" → reinforces the city-note call above.

### Jan 18 — Train to Vienna / Albertina

- Travel: RegioJet (card 4)
- ▫ Pick up Vienna Card (#VPA9111671 🔒)
- ▫ Albertina — listed in the source body (confirmed by Eli), clearly selected.
- ❓ State Hall Library, Time Travel Vienna, Belvedere (listed with prices/hours but no
  commitment) → review question #2: "Friday also lists these 3 — planned for Friday, or Vienna
  ideas?" **Δ** (Confirmed in discussion: keep the question; researched prices/hours alone
  aren't a strong enough intent signal.)

### Jan 19 — Schönbrunn day

- ⊕ Schönbrunn Palace visit — ordered sub-stops: Gloriette, Orangeriegarten, Palm House, Apple
  Strudel Show, Panorama Train. One parent card.
- **Δ** ▫ Museum: Mumok *or* Natural History — one untimed card, alternatives in the
  description. Disjunction rule: an explicit "or" between items = a committed slot with an
  unresolved choice → one card, choice in description, no question, no blocker (mirrors the
  Prague Castle ticket treatment).
- Everything else on the day (Ferris wheel, Hundertwasser Haus, Museum of Illusions, Mozarthaus,
  Ring Tram Tour, Prater, Leopold Museum, St. Charles Church, St. Stephen's Cathedral) →
  **Vienna city notes** (ideas) — no booking, time, or sequence. Opening hours/prices attach to
  the notes.
- St. Stephen's south-tower details (hours, €3.50, access side) attach to its city-note entry.

### Jan 20 — Explore Vienna

- ▫ Breakfast at Cafe Central · Jewish Museum · St. Stephen's Cathedral · Library · Bank Austria
  Kunstforum — short, deliberate list = selected untimed activities.
- ▫ Laundry — clearly planned practical activity. **Δ** (No [CALL] marker.)
- Dedup: St. Stephen's Cathedral and the Library also appear in Jan 19's idea list → the Jan 20
  planned visit wins; city-note copies removed.

### Jan 21 — Train to Budapest / Bathing

- Travel: ÖBB (card 5)
- ❓ Gellert Baths vs Szechenyi: bathing is in the day title but both entries read as options →
  review question #3: "Bathing Monday — which baths, or keep both as ideas?"
- City notes (Budapest): currency ($1 ≈ 280 HUF), Hungarian phrases + pronunciation guide
  (→ language guide module), gypsy music, Great Synagogue/Jewish history, Pinball Museum, Konyv
  Bar/Tokaji, Mazel Tov, Hilton wine cellar, Ruszwurm pastry shop, S=sh pronunciation.

### Jan 22 — Buda / Zack arrives

A fully sequenced guided day — times preserved:

- ⏰ Fisherman's Bastion 9:00 · ⏰ Matthias Church 9:45 · ⏰ Castle Hill/Buda Castle stroll 10:30
  (funicular, viewpoint prose → descriptions) · ⏰ Szechenyi Chain Bridge 11:00 · ▫ St. Istvan's
  Basilica (sequenced; mummified-hand and bell-tower prose → description) · ▫ Vorosmarty Ter
  walk · ▫ Shoes on the Danube · ▫ Parliament (+ crown jewels detail) · ▫ Great Market Hall
- ⏰ Borkonyha Wine Kitchen dinner, 8:00 PM (listed once with time; also in eat-recs — one card,
  rec copy removed)
- Gerbeaud's "if you want a break" → description under Vorosmarty Ter, not an activity.
- "Vaci Utca is skippable" → Budapest city note (an anti-recommendation is still useful info).
- City notes (Budapest · Eat): Comme Chez Soi, Smart Kitchen, Bors GasztroBar, Szimpla Kert,
  Dohany St. synagogue, Buda Hills children's train loop, public transport ticket tip, Pontoon
  bar / Chain Bridge at dusk. **Δ** Thermal-baths rec removed from city notes — baths are
  already a day-anchored question (dedup hierarchy: activity/question beats city note within a
  leg).

### Jan 23 — Explore Budapest

- ▫ House of Terror Museum · ▫ New York Cafe lunch (no time given → untimed) · ▫ Baths (see
  Jan 21 question) · Gellert Bath House Roman ruin + pastry-shop tip (→ description on the baths
  entry) · ▫ St. Stephen's Basilica tower
- Dedup within leg: Great Market Hall — planned in the Jan 22 sequence, listed again Jan 23
  without commitment → Jan 22 card wins, copy removed, no question. Pinball Museum — appears
  Jan 21 AND Jan 23, untimed and unbooked both times → never committed → **one Budapest city
  note**, no cards, no question.
- City notes (Budapest): Hospital in the Rock, embassy-friend food recs (Balthazar, Pest-Buda
  Bisztro, Pomodoro, Menza, Zona), Aranykaviar Russian restaurant, both langos recs (Retró
  Lángos Büfé + Street Food Karavan, addresses kept).

### Jan 24 — Fly to Rome

- Travel: Wizz Air (card 6)
- ▫ Watches in Rome errand (Via della Fontanella Borghese 33) — appears Jan 13 ("watches in
  rome" aside) and Jan 24 with address → one card on Jan 24, where the address lives.
- **Δ** ▫ Tour Rome — untimed activity from the body line "Tour Rome in afternoon/evening (or
  work)," with a description matching the sparse data ("walk around Rome in the evening;
  stops/route to be planned"). Sparse-day rule: when a line like this is the day's only content,
  it's an activity, not a day description. Day titles are never a source of activities.

### Jan 25 — Home

Travel only — cards 7 and 8 (FCO→JFK, JFK→DCA).

---

## Excluded entirely

**Δ** (System logic, not a call.) The Costs section (budgets, per-flight prices, per-night
hotel costs): planning artifacts, not trip content. Not activities, not city notes, not
maker-only fields — omitted from the traveler app.

---

## Review questions budget check

Total questions this trip should generate: **3**

1. Prague Castle ticket choice (explicit open decision in source)
2. Friday Vienna list (State Hall Library, Time Travel, Belvedere) — planned or ideas?
3. Baths — Gellert, Szechenyi, which day? (Budapest)

Well under the 5–15 target: ask only when the source genuinely doesn't reveal intent.
Unresolved answers never block publishing — they become descriptions.

---

## Dedup rules exercised by this trip

(Eli's rule: duplicates never exist unless the source explicitly plans something twice.)

- Same name, same leg, one planned + one idea copy → planned wins, idea copy silently removed
  (St. Stephen's Vienna, Great Market Hall, Borkonyha).
- Same name, same leg, repeated but never committed → ONE city note, no cards, no question
  (Pinball Museum, Museum of Communism).
- **Δ** Same name, same leg, activity-or-question + city note → the activity/question wins,
  city-note copy removed (thermal baths, Budapest).
- Same name, DIFFERENT leg → never dedup: Vienna's St. Stephen's Cathedral and Budapest's
  St. Stephen's/St. Istvan's Basilica are different places. Jewish Quarter (Prague) vs Jewish
  Museum (Vienna) vs Great Synagogue (Budapest) likewise all distinct.

---

## Δ2 Amendments (2026-07-17 evening, Eli-approved)

1. **Privacy scope narrowed:** protection covers *trip-sabotage surface* only —
   stays (addresses, access codes, Wi-Fi, reservations) and inter-city travel
   confirmations. Activity/tour/restaurant booking references are PUBLIC: the
   walking tour's L272-181125-2, Klementinum and Bellevue bookings, the rental
   car reservation 81486 (CEO: recoverable failure — "worst case take a cab"),
   and the Vienna Card #VPA9111671 all lose their 🔒 markers. The 🔒 markers on
   travel cards and stays above stand. Personal identity data (name, home
   address, email, phone) is scrubbed from card prose as content hygiene —
   it is not trip content and not a privacy toggle.
2. **St. Vitus folds into ONE castle ticket question** (supersedes "keep St.
   Vitus tour-vs-visit"): one venue complex, one open decision. Sub-stop
   uncertainty folds into the container's question. Question #1 covers both
   the ticket choice and the tour-vs-visit angle. Total questions stay 3.
3. **City Note sections:** each city gets ONE City Note rendered in universal
   sections — Food · Drinks & Nightlife · Sights & Culture · Shopping ·
   Getting Around · Local Tips · Notes (fallback — nothing is dropped for not
   fitting). The "Prague · Eat" / "Prague · Drinks" groupings above map into
   these sections. Splitting a section later is additive; merging breaks
   fixtures, so start merged.
4. **Language content:** currency notes go to Local Tips. Hungarian phrases +
   pronunciation do NOT become note prose — they signal the (curated,
   category-driven) language-guide module; the source phrase list gets a
   "covered by language module" disposition.
5. **Costs exclusion applies to note text too** — a "Budget notes: $1200
   total" line inside a tips blob is scrubbed with a recorded disposition,
   not shipped inside a city note.

## Δ Rules added or refined this round (2026-07-17, Eli-approved)

1. **Calls** explain system *action* (grouping), never absence of action or plain logic.
2. **Travel cards**: one per segment; must be inter-city AND change the stay. 8 on this trip.
3. **Night coverage**: every night = a stay or an overnight travel card; stays span
   check-in→check-out only.
4. **Stay costs**: only shown when due on arrival. Arrival directions kept as protected detail.
5. **Grouping**: ≥3 adjacent untimed sights passing geo-proximity → ⊕ parent + call.
   Timed/ticketed items stay standalone unless inside one complex/campus.
6. **Density**: ~6 cards/day soft trigger for grouping/demotion *suggestions* — never forced
   collapse.
7. **Doubt markers** ("(far away)," "maybe," "?") demote to city notes silently.
8. **Meal-slot rule**: single mention + meal anchor = untimed activity.
9. **Disjunction rule**: explicit "or" = one committed card, choice in description.
10. **Unknown tokens**: one light search for identification/enrichment only; placement always
    from source sequencing. Capped per trip.
11. **Unresolved choices** (source or review answer) → description, never a blocker.
12. **Day titles** are never a source of activities or rules.
