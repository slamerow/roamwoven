# Assembly defect docket — live run 7.18.0 (2026-07-17, night)

Fourth fresh Central Europe extraction (the run `docs/next-session.md` calls
"7.17.3"; Eli named the trip **7.18.0**). Trip
`e0b06255-ea20-42fa-b3bf-106681db3d49`, built on deployed `a4c4fa2` (the 7.17.2
evening fix pass). Audited against ground truth v2 + Δ2 amendments. Sources: QA
bundle (`run-7.18.0-qa-bundle.json`, saved locally, gitignored — byte-exact
copy, sha256 verified against the live endpoint), live `/data` review page and
`/summary` page, lineage + source-anchor evidence in the bundle. Every finding
below was verified against lineage or source-anchor evidence text before being
recorded; parser misses and assembly-logic defects are separated per section.

## Scorecard vs 7.17.2 and the answer key

| Metric | 7.17.2 | Target (key v2+Δ2) | 7.18.0 |
|---|---|---|---|
| Activity cards (top-level) | 82 | ~49 | 67 (65 shown on review page; 72 "Plans" on summary) |
| Travel rows | 8 ✓ | 8 | 8 ✓ (all routes/times/confirmations correct) |
| Stays | 5 ✓ | 5 | **7 — 3 Prague Airbnb rows, one public** |
| System groups | 1 | 3 | 3, but **all 3 wrong** (see grouping) |
| Questions | 5 | 3 | 6 (3 legit + 1 misfire + 2 parser leaks) |
| Date questions | 3 | 0 | 0 ✓ |
| Days counter | 15 (fake day) | 14 | 14 ✓ |
| False transport P0 | 1 | 0 | **1 (new vector: budget-section anchor)** |
| PII (name/home address/email/phone) in cards | leaked | none | none ✓ |
| Stay access codes in public cards | n/a | none | **Wi-Fi password + door code + address leaked** |

Extraction health: 27/27 activity chunks succeeded, 265/265 observations
dispositioned, 0 undisposed, identity repaired ×4.

## Publish blockers (confirmed, live-page verified)

- **PB-A — Stay access codes + address leak through a duplicate arrival
  activity card (P0, worst in run).** Jan 14 public activity card "Check in to
  AirBNB" renders on the live summary: "Michalská 431/5 Apartmá, Praha 1 … Check
  in after 3:00 PM at the AirBNB. **Wi-Fi password: WelcomeHome2017. Code
  HMRKX42RWB.**" The stay record itself correctly says "Exact address
  protected" — but this activity duplicate carries the whole trip-sabotage
  surface in cleartext prose. Same pattern Jan 21: "Vitae Hostel stay" activity
  card shows "Erzsebet korut 50, Budapest" publicly. The
  `activity_stay_collision` hard warning FIRED for the AirBNB card, but the
  card stays active — confirmed-collision auto-suppression (docket fix 2 from
  7.17.0/7.17.1) is now missing for the **third consecutive run**. The 7.17.2
  PB-1 identity-block scrub held (no name/home address/email/phone anywhere)
  but its scope is personal-identity values only — stay access values in card
  prose are not scrubbed. Classification: **assembly** (parser emitting a
  check-in activity is expected noise; assembly routed the OTHER check-in
  observations to stays correctly, this one escaped and nothing scrubs
  stay-access values from surviving card text).
- **PB-B — Inter-city booking codes leak through two mis-dated train activity
  cards (P0).** Jan 24 has two public activity cards: "Train to Budapest"
  (desc: "Fri, **18 Jan 2019** 09:20 … **Booking number 1bebb5005; travel code
  0468406277; seat 4/11**") and "Train Vienna to Budapest" (desc: "ÖBB …
  **Ticketcode 2 159 1990 1842 0436; booking 0648 7232 0822 6278**"). Both are
  re-emissions of the RegioJet (Jan 18) and ÖBB (Jan 21) tickets dated Jan 24
  by the parser — the RegioJet desc literally contains its own real date.
  `activity_transport_collision` hard warnings fired for both; cards stay
  active. Classification: **parser** (mis-dated the ticket-page chunks to Jan
  24; also OCR'd "1bebb5005" with an extra b) **+ assembly** (transport-shadow
  suppression is date-keyed, so a title-identical train card two legs away
  sails through; collision detection then finds it but suppresses nothing;
  travel-confirmation values in card prose are not scrubbed).
- **PB-C — Prague stay tripled; one copy public.** Three stay rows: "Prague
  Airbnb · 2019-01-14–2019-01-17", "… · 2019-01-14–2019-01-18", and "Prague
  Airbnb · 2019-01-15" (no checkout, no address, **visibility: public**). Jan
  14–16 each render TWO stay rows on the summary. Stay identity was built with
  the date range in the name, so conflicting checkout observations (Jan 17 vs
  Jan 18 — key says Jan 18) split identity instead of reconciling; and the
  Costs-section line "January 15th Prague- $56 (airbnb)" manufactured the
  third, public stay (the same line also became a "Prague lodging note / $56
  (airbnb)" grouped stop INSIDE the castle card — see grouping). The internal
  identity suffix leaks into the maker-visible stay names. Classification:
  **parser** (chunked stay re-emissions with conflicting dates; cost line
  emitted as stay evidence) **+ assembly** (no venue+leg stay dedup; Costs
  exclusion doesn't cover stay/anchor manufacture; night-coverage rule
  produced no conflict signal).
- **PB-D — Albertina destroyed by stay-evidence misclassification.** Lineage:
  the two correctly dated Jan 18 "Albertina" observations merged, then the
  piece was rejected "**routine check-in or bag-drop evidence attached to
  stay**" — an art museum eaten by the check-in router, presumably because the
  source line is "Check in to hostel and walk to Albertina." Same defect
  family as 7.17.2's castle-as-lodging (PB-2): a suppression rule with no
  semantic guard on what it's suppressing. The key lists Albertina as a
  clearly selected activity. Classification: **assembly**.

## False P0 (third consecutive run, new vector each time)

`critical_transport_source_anchor_missing` — "Travel from Prague to Vienna."
All 8 real segments exist with correct times. The trigger anchor is
`train-2019-01-25-train-prague-to-vienna-notime-25`: scraped from the
**Costs/budget section** ("Prague to Vienna train: $39 Business class …"),
no time, no number, no provider, **date 2019-01-25 fabricated** (nothing in the
evidence text carries a date), confidence medium. It passed AS-1 minimum
validity because it has a route. Reconcile-before-P0 matches same-date
same-kind, and no train exists on Jan 25, so the diagnostic fired — even
though the anchor itself was suppressed as a standalone
(`suppressedStandaloneAnchorCount: 1`) and the Jan 18 RegioJet row covers the
route exactly. Fixes: Costs-section text is excluded from anchor scraping
(the 7.17.1 "budget-like anchors" rule applied only to row manufacture, not
diagnostics); anchors may not fabricate dates; reconcile-before-P0 falls back
to route-semantic matching across dates; suppressed anchors never feed P0.
Classification: **assembly/audit**.

## Questions (6 shipped; target 3)

- Legit and well-formed: castle ticket (St. Vitus folded ✓, per Δ2-2), Vienna
  trio planned-or-ideas ✓ (fired for the first time), baths ✓ (day-title slot
  rule fired). All three target questions now exist. ✓
- **Q-misfire:** "This day also lists Prague Castle and Lesser Town visit, KGB
  museum — planned for the day, or just ideas?" The researched-list pattern
  matched the castle GROUP and its own grouped child (KGB), producing a
  planned-or-ideas question about the day's anchor activity while the castle
  ticket question also targets the same piece. Classification: **assembly**
  (pattern should exclude grouped/committed pieces).
- **Q-leak ×2:** "What is the departure time for the train from Prague to
  Vienna?" (canonical row has 09:20) and "What is the confirmation number for
  the Budapest to Rome flight?" (canonical row has RDGHMT; the question's own
  evidence text shows "Confirmation RDGHMT"). Both prompts carry parser
  chunk-scope language ("not shown in this chunk") verbatim to the maker.
  Docket fix 6 (question reconciliation against canonical records) — **third
  run, still not landed**. Classification: **assembly**.
- Trio inconsistency: the question is open, but State Hall Library, Time
  Travel Vienna, and Upper/lower Belvedere are simultaneously committed as Jan
  18 activity cards (and only State Hall Library shows the NEEDS REVIEW badge
  on the summary). Answering "just ideas" has three cards to unwind.

## Grouping (3 groups, all defective; geo root cause CONFIRMED)

- **Geo fields: `approxLatitude`/`approxLongitude`/`area` appear ZERO times in
  the whole bundle.** Audit views now expose them (7.17.2 fix), so the 7.17.2
  open question is answered: **the live parser does not emit the geo schema
  fields**. Doctrine v3's geo-verified walk rule cannot fire. Classification:
  **parser (schema/prompt)** — this is the confirmed root cause of the missing
  Lesser Town group.
- **Castle mega-group.** "Prague Castle and Lesser Town visit" — one card, 7
  children: Changing of the Guard ✓, St. Vitus ✓, then Vinarna Čertovka, John
  Lennon Wall, Novy Svet (Lesser Town walk items — different site, ~1 km away),
  KGB museum (key: standalone card), and **"Prague lodging note / $56
  (airbnb)"** (Costs junk as a tourist stop). Kafka statue stays standalone,
  so the answer key's TWO groups (castle complex; Malá Strana walk) collapsed
  into one wrong one. The call says "the source lists 7 stops inside Prague
  Castle and Lesser Town visit's own visit" — the parser invented that
  container from the day header "Lesser Town & Prague Castle" and assembly
  trusted it with no semantic/geo validation. Classification: **parser**
  (container over-scoping under the new same-site-component-listing prompt)
  **+ assembly** (source-named container accepted without a same-site check;
  lodging-note child not scrubbed).
- **Royal Palace group (fabricated geo claim).** Jan 22: children = Szechenyi
  Chain Bridge (timed 11:00) and Gerbeaud's (a café across the river in Pest).
  The call asserts "2 stops sit inside Royal Palace's grounds (**within
  300 m**)" — no geo fields exist in this run, so that claim cannot have been
  computed. Timed items must stay standalone outside a single complex; both
  children fail the rule. Honest-call regression AND a grouping regression:
  the key wants Jan 22 fully sequenced and ungrouped. Vorosmarty Ter walk
  (Gerbeaud's rightful parent per the key) is missing entirely.
  Classification: **assembly** (grouping + call honesty).
- **Schönbrunn regression: 2/5 stops** (Orangeriegarten, Palm House).
  Gloriette, Apple Strudel Show, Panorama Train all standalone — 7.17.2 had
  3/5. Classification: **assembly** (membership), pending parser same-site
  listing verification.

## Dedup / promotion / placement misses vs the key

- St. Stephen's Cathedral (Vienna): the **Jan 20 planned copy was folded into
  the city note** ("repeated but never committed: the city-note copy is the
  single home" — lineage row 'Vienna sights list' shows the Sunday Jan 20
  observation attached). Key rule: planned copy WINS, note copy removed. The
  precedence is inverted; the Jan 20 card is missing. **Assembly.**
- Museum of Communism: committed as a Jan 14 card. The Jan 17 doubt copy
  ("maybe communism museum") **exists in the extracted source text** (visible
  in the RegioJet anchor's evidence window) but the parser never emitted it,
  so repeated-uncommitted could not fire. **Parser miss** (dropped mention) —
  with the note that a bare uncommitted single mention still commits
  (**assembly**, commitment narrowing still loose).
- Koscom watch shop: **missing from the entire run** — no card, no observation,
  no lineage row. Source text "Get back by 5 to go to koscom and maybe
  communism museum" is confirmed present in extraction (same anchor evidence
  window). **Parser miss** (was present in 7.17.2 as a mis-dated card; now
  gone entirely).
- Tour Rome (Jan 24 sparse-day activity): **missing** — no card, no lineage
  row. Worked in 7.17.2. **Parser miss (regression).**
- Two rental-car cards on Jan 17: "Pick up car" (9:00, admin; scrub ✓ held —
  reservation 81486 public per Δ2-1) AND "Car rental pickup" (endTime 09:00,
  address + return note). Same event, two cards; alias dedup missed
  ("pick up car" vs "car rental pickup"). **Assembly.**
- Jan 15 tour: "Prague walking and Jewish history route" is a second card for
  the same 9:00 tour (its desc even summarizes the day incl. Klementinum), and
  "Old Town Square" is STILL a standalone card beside the tour — sub-stop
  absorption missed for the second straight run. **Assembly.**
- Mumok / Natural History (Jan 19): TWO cards with opening-hours contamination
  as endTimes (19:00 / 08:30). Key: ONE disjunction card "Mumok or Natural
  History," alternatives in description. **Parser** (split + time
  contamination) **+ assembly** (no or-detection backstop).
- Idea promotions still active (key: city notes): Ferris wheel, Hundertwasser
  Haus (Jan 19); Great Synagogue, Pinball Museum, Ruszwurm, Gellert Baths (Jan
  21 — the question exists AND the card is committed); Children's train,
  Erzsébet lookout, Chairlift down (Jan 22 Buda Hills note content); Pinball
  Museum again Jan 23 (the `duplicate_same_venue_activity` P1 fired ✓ but
  both cards stay). Improvement: gypsy music, Konyv Bar, Mazel Tov, Hilton
  wine cellar correctly demoted to notes this run. **Assembly.**
- Great Market Hall on Jan 23; key: the Jan 22 planned-sequence copy wins.
  **Assembly.**
- Vorosmarty Ter walk (Jan 22): missing entirely; no lineage row → likely
  **parser miss** (source presence not verifiable from the bundle).

## City notes (structure shipped; content badly damaged)

All four notes exist with Δ2-3 section labels — but:

- **Routed content is dropped at the collection merge.** Lineage shows Mistral
  Cafe, Cafe Louvre, Malostranská Beseda, Country Life, trdelník (note copy),
  Prague beer/food ideas → "rejected: canonical Prague note collection", yet
  the final Prague note contains none of them. Same for Pontoon (Budapest).
  Retró Lángos Büfé was "routed to canonical stay, activity, or travel
  records" — no record contains it. The Budapest public-transport tip was
  killed by a cross-city false positive ("note text names an entity in another
  leg"). **Assembly — the note-collection stage loses most of what's routed
  into it.**
- **Wrong content leaked in:** Prague note opens with the Bellevue degustation
  menu (unsectioned, then repeated under "Drinks & Nightlife: Menu
  description…") and ends "Notes: Stay at an Airbnb for $56" — a Costs leak in
  note text (Δ2-5 violation, new vector). "Eat some 'Za" appears in the
  Budapest note (it's Rome content; it's also correctly in the Rome note).
  The Gellert pastry-shop tip landed under Budapest "Shopping."
- **Mis-sectioning + truncation:** Vienna note puts Museum of Illusions,
  Mozarthaus, Ring Tram Tour, the Prater, Leopold Museum under "Getting
  Around" and ends mid-entity: "Leopold Museum, St." Budapest
  "Drinks & Nightlife" is an unpunctuated run-on.
- Missing per key: currency notes (→ Local Tips), Hungarian phrases (→
  language-module disposition — no disposition visible in the bundle), Vaci
  Utca anti-rec, Hospital in the Rock, Aranykaviar, Szimpla Kert, Comme Chez
  Soi, Smart Kitchen, Bors GasztroBar, St. Stephen's south-tower details.
  Umbrella note observations exist ("Budapest food ideas", "Budapest social
  ideas"), so at least part of this is the same collection-merge loss;
  item-level parser vs assembly split is not fully determinable from the
  bundle (lineage does not carry observation text).

## Audit-system defects

- **AS-A — Leg place pieces flagged `missing_from_structured`** (Prague,
  Vienna, Budapest, Rome ×2) although all 5 legs exist and are correct.
  Lineage bookkeeping doesn't link place pieces to leg records → false alarm
  noise in every future audit.
- **AS-B — Counter inconsistency persists (AS-5):** 65 activities
  (review page, fingerprints, structured) vs 67 (records.counts — includes
  the 2 admin cards) vs **72 "Plans"** (summary tile). "14 Days" is fixed ✓.
- **AS-C — Warnings surface asymmetry:** the 3 hard collision warnings render
  on `/summary` (with Mark checked) but the `/data` review page shows only
  questions — a maker working the review queue never sees them. (AS-2
  plumbing, known-deferred, now with a concrete surface gap.)
- **AS-D — Redactor (AS-4, known-deferred) still degrades the bundle:** dates
  and piece ids render as "[redacted phone]"; one question prompt is redacted
  into "What is the confirmation [redacted]?" while the SAME question's
  evidence on the live review page shows "Confirmation RDGHMT" cleartext.

## What 7.18.0 proved works (keep)

All 8 travel rows correct (routes, times, providers, confirmations — Delta
5925 17:00→18:41 ✓); 4 of 5 non-Prague stays correct with the night-coverage
rule right (no Jan 12 stay; The Yellow starts Jan 13 ✓); 14 Days ✓; Jan 13
Rome exactly per key (4 sequenced cards); personal-identity scrub held
(no name/home address/email/phone anywhere — checked live DOM); Vitae buzzer
and Prague lockbox 2580 appear nowhere public; R2D2 doubt-demotion with
recorded reason ✓; drop-bags/check-in/fly-to shadows suppressed on their own
days ✓; 7.17.2's "Rome arrival / key pickup" collision now suppressed ✓
(AS-3 case resolved); all 3 target questions exist for the first time; castle
ticket question correctly folds St. Vitus ✓; ÖBB boilerplate anchor gone
(AS-1 minimum validity held against LAST run's vector); baths day-title slot
rule works; Kutná Hora day correctly dated with no date questions ✓;
Watches-in-Rome single Jan 24 card with address ✓; Cafe Central single home ✓;
Prague Downtown fragment gone ✓; 27/27 chunks, 265/265 observations
dispositioned.

## Suggested correction order

1. PB-A/PB-B value-scrub: extend the output-boundary scrub to stay-access and
   inter-city-travel values (address, Wi-Fi, door/lockbox codes, booking/
   ticket codes) wherever they survive in card prose — plus land docket fix 2
   (auto-suppress confirmed hard collisions) at last.
2. PB-C stay identity: venue+leg identity for stays (never date-range names),
   checkout-date conflict reconciliation (latest wins per night coverage),
   Costs section barred from manufacturing stays/anchors/grouped stops.
3. PB-D + St. Stephen's inversion: semantic guards on check-in routing and
   note-home precedence (planned copy beats note copy — direction test in the
   fixture).
4. False-P0 family: Costs text excluded from anchor scraping, no fabricated
   anchor dates, route-semantic reconcile, suppressed anchors can't fire P0.
5. Question reconciliation vs canonical records (kills both leaked transport
   questions) + researched-list pattern excludes committed/grouped subjects.
6. Parser pass: emit geo fields (confirmed absent — blocks Lesser Town), stop
   re-emitting ticket pages as new-dated activities, keep koscom/'maybe'
   mentions and Tour Rome, one disjunction item for "X or Y".
7. Grouping: reject source-named containers spanning sites without geo
   support; never absorb timed stops outside a complex; honest calls only
   claim rules that ran.
8. Note-collection merge: routed content must land or get an explicit
   disposition; section classifier fixes; Costs scrub for note text vector 2.

Each fix lands with its ground-truth fixture check in the same commit, per
`AGENTS.md`. After the pass: one fresh extraction — do not hand-edit this
draft.

## Addendum — cross-audit reconciliation (second independent audit, verified)

Items from the second audit that survive verification against the bundle,
plus cross-run checks against `run-7.17.2-qa-bundle.json`:

- **Ryanair FR8331 has no source anchor.** 8 anchors = 7 real segments + the
  junk budget anchor; FR8331 absent. Anchor-layer coverage gap: source-truth
  verification is blind to that segment. Fix folds into the false-P0 family:
  add an anchor-coverage check (each canonical transport row wants ≥1 anchor;
  a gap is a quiet notice, never a P0).
- **Szechenyi Baths was never observed — in EITHER run** (both bundles contain
  only "Szechenyi Chain Bridge"). The key's baths question is "Gellert vs
  Szechenyi"; the shipped question offers "Gellert Baths and Baths" because
  the real alternative never entered evidence. **Parser miss, chronic** (not a
  7.18.0 regression).
- **Extraction model confound ruled out:** both 7.17.2 and 7.18.0 extracted
  with `gpt-5.4-mini` (OCR `gpt-5.6-luna`). Koscom (×8) and Tour Rome (×5)
  are present in the 7.17.2 bundle and absent in 7.18.0 — same model, so the
  drops are chunk-level parser nondeterminism and/or side effects of the
  7.17.2-evening prompt changes (same-site component listing / access-
  instruction attachment), not a model change.
- **Two remediation cycles ran** (`evidence_cluster → assembly →
  quality_remediation` ×2) with defects preserved for review — the retry loop
  exists and did not mask anything.
- **Parser artifact family (minor, fixture-worthy):** provider text-bleed
  ("PM Delta", "Home Delta", "Personenverkehr AG"); degenerate time pairs
  (Borkonyha 20:00–20:00, Trevi 17:30–17:30); bare opening-hours endTimes
  (Mumok 19:00, Natural History 08:30); OCR booking typo "1bebb5005"
  (source: 1beb5005).

Second-audit claims rejected after verification: "bad coordinates put Chain
Bridge/Gerbeaud's within 300 m" (no geo fields exist anywhere in the bundle —
the call text is fabricated, which is worse); keeping Jan 23 Pinball as "the
dated instance" (key: never committed → one note, zero cards); re-anchoring
the baths question to Jan 23 (key anchors it to Jan 21's day title); a
two-Calls acceptance gate (key expects three groups); and its "last run"
baseline (108 activities / 11 questions / 132 pieces) matches neither recorded
prior run (7.17.1: 98/5; 7.17.2: 82/5, stays 5 ✓).

## Wave-1 fix status (2026-07-17 night pass — all landed with run3 fixtures)

Implemented per Eli's two-wave decision (assembly first, parser second).
Suite: 41 test files green incl. NEW `tests/assembly-ground-truth-run3.test.ts`
(16 checks mirroring the live 7.18.0 shapes); typecheck + build clean.
Ledger v11 updated in the same change (RW-CNT-001 added).

- PB-A (credential leak): output-boundary protected-value scrub (stay/travel
  values + credential sentences when a stay exists) + check-in alias/title
  fixes. LANDED.
- PB-B (mis-dated ticket cards): date-agnostic ticket-copy shadow (exact
  time + route, or booking code) + one fold call per merge. LANDED.
- PB-C (stay triple): venue+leg stay identity, checkout reconciled to the
  leg boundary, costs-fragment absorption, no date-suffix names. LANDED.
- PB-D (Albertina): routine check-in gate reads the title and rejects
  foreign distinctive tokens. LANDED.
- St. Stephen's inversion: deliberate day-plan membership beats an
  idea-list note copy from a different source section. LANDED.
- False P0: Costs lines mint no anchors; weak anchors get no positional
  date, can't fail date reconciliation, cap at P2; anchor-coverage quiet
  notice (Ryanair). LANDED.
- Questions: transport questions reconcile vs final rows; researched-list
  members hold as ideas with end-to-end promote-on-answer
  (memberSnapshots); day-slot options fold into ONE flexible card;
  grouped pieces excluded; question creation moved after grouping. LANDED.
- Grouping: same-site membership verified (geo or source-listing);
  multi-site containers rejected; cost fragments never stops; fabricated
  radius claims rewritten. LANDED. (Lesser Town walk still blocked on
  wave-2 parser geo fields.)
- Notes: collection integrity restore; abbreviation-safe segmentation
  ("St." orphan fix); multi-topic tips keep their city. LANDED.
- Counts (RW-CNT-001): one definition across review/summary/fingerprints/
  bundle; hard warnings render on /data. LANDED.
- Deferred to wave 2 (parser): geo fields, ticket-page re-emission,
  dropped lines (koscom, Tour Rome, 'maybe communism museum', Szechenyi
  Baths), disjunction cards, provider/time artifacts, source-coverage
  diagnostic. Then extraction pinning (own push, SQL first).
