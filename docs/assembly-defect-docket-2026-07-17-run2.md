# Assembly defect docket — live run 7.17.2 (2026-07-17, evening)

Confirmed defects from the third fresh Central Europe extraction, audited against
ground truth v2 (`docs/assembly-ground-truth-central-europe.md`) and the 7.17.1
scorecard in `docs/next-session.md`. Sources: QA bundle
(`run-7.17.2-qa-bundle.json`, saved locally, gitignored), live `/data` and
`/summary` pages, and cross-verification of a second independent audit. Each
item must land as a ground-truth fixture check in the same change that fixes it
(`tests/assembly-ground-truth.test.ts`), with ledger updates per `AGENTS.md`.

Run under audit: trip `629d9b33-9f9e-4280-8a5c-90cacf684dc6` (7.17.2), built on
`86ea837` (docket fixes 1–7 from runs 7.17.0/7.17.1).

## Scorecard vs 7.17.1

| Metric | 7.17.1 | Target (key v2) | 7.17.2 |
|---|---|---|---|
| Activity cards (top-level, excl. travel) | 98 | ~49 | 82 |
| Travel cards | 8 | 8 | 8 ✓ (all times correct) |
| Stays | 5 | 5 | 5 ✓ (dates + night coverage correct) |
| System groups | 8 (mostly wrong) | ~3 | 1 (Schönbrunn, 3 of 5 stops) |
| Questions | 5 | 3 | 5 (2 legit, 3 new P0s) |
| Delta 5925 times | corrupted | 17:00→18:41 | ✓ fixed |
| Colosseum/barcode in Prague notes | leaked | none | ✓ fixed |
| Calls state the actual rule | dishonest | honest | ✓ (the 1 call that exists) |

Note: "86 Plans" on the summary = 82 top-level activities + 3 Schönbrunn child
stops + 1 undated placeholder. The maker-visible count includes hidden children.

## Docket-fix regression check (from the 7.17.0/7.17.1 docket)

1. Transport time anchoring — **LANDED.** All 8 segments correct (5925
   17:00→18:41, 444 19:46→10:15, 1043 PM).
2. Auto-suppress confirmed collisions — **NOT LANDED.** Both confirmed
   collisions ("Arrive in Rome and drop bags" vs stay, "Rome arrival / key
   pickup" vs travel) are flagged as hard warnings but the duplicate cards
   remain active.
3. Block continuation on hard defects — superseded by CEO no-blocking decision;
   warnings ARE now visible on review/summary. ✓ as amended.
4. Source-hierarchy grouping — **PARTIAL.** Schönbrunn formed (3/5 stops);
   castle group destroyed upstream (see PB-2); Lesser Town walk regressed.
5. City notes / sensitive-value sanitization — **PARTIAL.** Rome/barcode
   contamination gone, but new budget contamination and note-structure collapse
   (see P1-1), and PII survives in a card description (PB-1).
6. Question dedup/source-resolution — **NOT LANDED.** 3 of 5 questions are
   system failures; the 2 expected new questions still never fire.
7. False-positive transport diagnostic — **NOT LANDED.** Fired again via a new
   vector (see AS-1).

## Publish blockers (confirmed)

- **PB-1 — PII leak in active card description (P0, worst in run).** The
  "Pick up car" card description ends: "Customer: Eli kamerow. 1225 Harvard
  street nw, 20009, Washington, USA. <email>. <phone>." — rendered in cleartext
  on the live summary page (verified). The privacy pipeline generated 45
  generic leg-scoped labels with `reviewRequired: true` but never scrubbed the
  values out of the card text, and no review surface shows those 45. Same card
  also shows merged-description echo ("Pick up car at 9:00 AM… Pick up car at
  9 am… Reservation number 81486" ×3). Fixes: value-level scrub of card/note
  text against detected private details (attach to the correct subject record,
  not the leg); echo dedup on merge; decide explicitly whether a cleartext PII
  leak is the one exception to the CEO no-publish-blocking rule (default per
  ledger: no blocking — suppress + visible warning).
- **PB-2 — Prague Castle destroyed by stay-shadow misclassification.** Lineage:
  two correctly dated Jan 16 "Prague Castle" observations merged, then the
  piece was rejected with reason "lodging already represented by canonical stay
  record" — the lodging-shadow suppressor treated a castle as lodging. An
  undated copy survived as a `needs_review` placeholder, which (a) prevents the
  castle same-site group from ever forming, (b) leaves Changing of the Guard +
  St. Vitus as standalone cards, and (c) creates a fake day: summary shows
  "15 Days" for the 14-day Jan 12–25 trip because "Needs placement" is counted.
  Fixes: semantic guard on lodging-shadow suppression (site/venue kinds are
  never lodging shadows); dated observations must win identity over undated
  copies; "Needs placement" must not count as a Day.
- **PB-3 — Source sequencing lost for undated pieces → wrong day + fabricated
  date questions.** Silver mines and Koscom placed Jan 15 "using the matching
  city leg"; the source puts both inside the Jan 17 Kutná Hora day (Koscom
  placement-from-sequencing is an explicit answer-key rule). Vitae Hostel
  arrival directions became a Jan 22 activity with a date question — and its
  public description contains "Buzzer number 25" (privacy leak); the key routes
  it to the Vitae stay as protected access detail. All three of these are the
  P0 questions in the maker queue. Fix: undated pieces inherit day context from
  their source section before any leg-level fallback; stay
  directions/access content routes to the stay record; stays never get item
  date questions.
- **PB-4 — Budapest Jan 21 classification inversion + city-note regression.**
  Nine idea/city-note items promoted to Jan 21 activities (gypsy music, Konyv
  Bar, Mazel Tov, Hilton wine cellar, Ruszwurm/"oldest pastry shop", Great
  Synagogue, Pinball Museum, "Popped up statue", Gellert Baths committed with
  no baths question). Meanwhile city notes collapsed to ONE mashed note per
  city (4 total): Eat/Drinks subcategory structure gone, wrong categories
  (Budapest note = art_culture), and the Budapest note contains "Budget notes:
  $1200 total, $100/day" — Costs exclusion held for activities but not note
  text. Lost note content: Prague Eat notes (trdelník, Mistral, Malostranská
  beseda, Cafe Louvre, soup note), currency + Hungarian phrases/pronunciation
  (language-guide feed), Street Food Karavan, embassy-friend recs.

## Question quality (5 shipped; target 3)

- The 3 date questions are PB-3 — they disappear when placement is fixed.
- The 2 ticket questions are individually well-formed, but there is a ledger
  conflict to resolve: the recorded CEO decision says St. Vitus folds into ONE
  castle ticket question; the prior docket says "keep St. Vitus tour-vs-visit."
  Decide which rule wins before the fix pass. The castle question currently
  attaches to the broken PB-2 placeholder.
- **Still missing (second consecutive run):** Vienna trio "planned or ideas?"
  (State Hall Library, Time Travel, Belvedere) and the baths question. Both
  regressed further: 7.17.1 didn't fire them; 7.17.2 committed the candidates
  as real activities (trio as Jan 18 cards; Gellert Baths as Jan 21 card plus a
  Jan 23 "Gellert Bath House" alias dup).

## Grouping (1 of ~3; one regression)

- Lesser Town / Malá Strana walk — **regression.** Zero occurrences in the
  bundle; 7.17.1 had this group right. Kafka statue, Lennon Wall, Vinárna
  Čertovka, Novy Svet are 4 standalone Jan 16 cards.
- Schönbrunn — right concept, honest call, but only 3/5 stops; Apple Strudel
  Show and Panorama Train leaked as standalone cards. The call/summary also
  doesn't show which stops were absorbed.
- Old Town walking-tour sub-stops not absorbed: "Old Town Square" is a
  standalone card beside the 9:00 tour.
- **Likely root cause to verify first:** `approxLatitude`/`approxLongitude`/
  `area` appear ZERO times in the bundle on this fresh extraction. Either the
  parser isn't emitting the new geo schema fields or they don't survive into
  assembly. Doctrine v3's geo-verified walk rule cannot fire without them —
  check the parser payload before touching grouping logic.

## Dedup / single-home misses

- Cafe Central (Jan 19) vs "Breakfast cafe central" (Jan 20) — key: Jan 20
  planned copy wins.
- "Chain Bridge walk" AND "Szechenyi Chain Bridge / Four Seasons Hotel", both
  Jan 22.
- Gellert Baths (Jan 21) vs Gellert Bath House (Jan 23) — alias family.
- Pinball Museum cards Jan 21 AND Jan 23 — key: never committed → one city
  note, zero cards.
- Museum of Communism still an activity — commitment-language fix
  (first-person/booking language, time, or confirmation) did not land; bare
  "Visit X" still commits.
- "Eat some 'Za" activity (Jan 24) + "Eat some pizza in Rome" note — same
  content, two homes.
- Great Market Hall landed Jan 23; key: the Jan 22 planned-sequence copy wins.
- "Prague Downtown" junk fragment card (Jan 17, 09:00, description "Return") —
  shard of the rental-car line.
- Dohany Street synagogue promoted to a Jan 22 activity — key: city note.

## Audit-system defects

- **AS-1 — False-positive P0, new vector.** `critical_transport_source_anchor_
  missing` triggered by junk anchor `train-2019-01-21-bitte-notime-496`
  (confidence: high) scraped from the ÖBB ticket's German marketing boilerplate
  ("für Ihre Bahnfahrt… Bahnfahrer sind Klimaschützer!"), with an ad-text
  Ticketcode captured as a confirmation. All 8 real segments exist. Fixes:
  minimum-validity rules for anchors (require route or times or a plausible
  number; reject boilerplate-only text), anchor dedup per source document, and
  reconcile-before-P0 (RW-AUD-001 repeat).
- **AS-2 — Semantic diagnostics don't reach review surfaces.** The duplicate
  (Cafe Central, Pinball) and loose-tip diagnostics exist only in
  `audit.diagnostics`; structured warnings carry only 2 collisions + 6 bloat
  notes, so the maker never sees them. Caveat: the "St. Stephen's Basilica
  loose tip" diagnostic is itself a false positive (Jan 22 Basilica is planned
  and sequenced per the key) — route diagnostics through the same
  source-truth verification as everything else before surfacing.
- **AS-3 — Collision warning recommends the wrong fix.** "Rome arrival / key
  pickup" is classified as a travel-row duplicate, but its content ("key
  prepared on arrival at 3pm; apartment on the first floor, door on the right")
  is stay access information — and reads like the PRAGUE Airbnb instructions
  (check-in after 3 PM, apartment, key pickup), not the RomeHello hostel.
  Verify against the source PDF: possible cross-stay contamination. Collision
  classification should compare content semantics, not just date+kind overlap.
- **AS-4 — Bundle redactor over-matching AND under-matching.** Dates and piece
  IDs render as "[redacted phone]" inside diagnostic evidence and question
  reasons (degrades the audit surface), while a real name + full home address
  in a card description pass through unredacted.
- **AS-5 — Inconsistent counters.** "15 Days" (fake day, PB-2), "86 Plans"
  (includes 3 hidden children + 1 placeholder; 83 visible), "Review: 5" vs 8
  summary checks with no shared definition. "Mark checked" acknowledges a
  hard warning without resolving or suppressing anything.

## What 7.17.2 proved works (keep)

All 8 travel segments with correct times/routes/confirmations protected; all 5
stays with correct dates, check-in times, and the night-coverage rule done
right (no fabricated Jan 12 stay; The Yellow starts Jan 13); Jan 13 Rome
matches the key exactly (4 individual sequenced cards, no invented tour);
Jan 22 Buda preserved as a fully sequenced individual day; U Malířů
triple-lunch collapsed to one 13:00 card; R2D2 demoted silently; trdelník
breakfast untimed activity; KGB one card; watches-in-Rome on Jan 24 with the
address; Tour Rome sparse-day rule; Costs excluded from activities; the one
call is honest and states the real rule; 30/30 extraction chunks, 309/309
observations dispositioned, 0 undisposed.

## Decisions recorded (Eli, 2026-07-17 evening)

1. No publish blocking — not even for PII leaks (reconfirmed).
2. St. Vitus folds into ONE castle ticket question (no planned tour exists;
   supersedes the earlier keep-tour-vs-visit note).
3. Privacy deprioritized vs extraction/assembly. Scope narrowed: protect only
   trip-sabotage surface (stays + inter-city travel). Tour/activity booking
   codes public; rental car public (recoverable failure); Vienna Card public.
   Personal-identity data in card prose is scrubbed as content hygiene.
4. City notes: one note per city with universal sections (Food, Drinks &
   Nightlife, Sights & Culture, Shopping, Getting Around, Local Tips, Notes).
5. Language: currency → Local Tips; phrases/pronunciation → language module
   (curated pack; source list gets a covered-by-module disposition).
6. Audit tooling this pass: false-P0 fix + counters only; diagnostics-to-review
   plumbing and redactor fixes deferred. Summary-page UX → backlog.
7. Partial evidence-clustering split approved (placement stage extracted);
   parser prompt/schema fixes in the same commit.

## Fix status (same-day evening pass — all landed with fixtures)

- PB-1: identity-block scrub + echo dedup at the output boundary. LANDED.
  (Leg-scoped generic privacy-label presentation stays open, deprioritized.)
- PB-2: stay-shadow venue-word guard ("castle" stopword root cause found in
  `SOURCE_SUPPORT_STOPWORDS`), same-site container exemption from
  covered-container demotion, Days counter excludes "Needs placement". LANDED.
- PB-3: structural date resolution (`canonical-placement-policy.ts`, extracted
  stage + unit tests), intake structural dating accepts unknown sections,
  stay-directions routing (Vitae). LANDED.
- PB-4: commitment-language narrowing, card/note reconciliation (runs before
  accessory routing), city-note sections, Costs scrub in note text. LANDED.
- Grouping: source-hierarchy same-site membership + honest per-rule call
  claims + resolver-decision precedence; audit views expose
  approxLatitude/approxLongitude/area (the audit was blind to them — the
  earlier "parser emits no geo fields" finding was an audit artifact, cause
  in the parser payload still unverified until 7.17.3). Lesser Town walk
  remains dependent on live parser area/coords emission.
- Questions: castle/St. Vitus fold via same-day ticket consolidation;
  day-title slot rule fires the baths question; researched-list trio
  question unchanged. LANDED.
- Dedup: meal-prefix aliasing, generic-tail containment (Chain Bridge),
  place-fragment absorption (Prague Downtown), drop-bags arrival-time fold.
  LANDED.
- AS-1: anchor minimum validity + digit-bearing number requirement +
  reconcile-before-P0 (same-date same-kind row = identity incident). LANDED.
- AS-5 (partial): qa-bundle splits activeActivities / activeGroupedStops /
  activePlaceholders; summary Days counts dated days only. LANDED.
- Parser prompt: day-section membership, lodging access-instruction
  attachment, same-site component listing, arrival-day recommendation rule.
  LANDED (validation requires the 7.17.3 live run).
- Deferred to backlog: AS-2 diagnostics→review plumbing, AS-4 redactor
  over/under-matching, remaining AS-5 counter unification, summary-page UX
  (expanded sections, "Mark checked" semantics), suppression-stage module
  extraction (placement stage was extracted; the shadow-suppression stage
  still lives inside evidence-clustering.ts).

## Original proposed correction order (superseded by the decisions above)

1. PB-1 privacy value-scrub + subject routing (+ explicit CEO decision on
   whether PII leaks are an exception to no-publish-blocking).
2. PB-2 stay-shadow semantic guard + dated-beats-undated identity + day-count
   fix (unblocks the castle group and question attachment).
3. PB-3 undated-piece placement from source sequencing + stay-detail routing
   (kills all 3 P0 questions at the root).
4. PB-4 commitment/demotion family (restores Budapest notes, Vienna trio +
   baths questions, Pinball/Museum-of-Communism demotions).
5. Verify parser geo fields in payload; then castle + Lesser Town groups and
   Schönbrunn stop completeness.
6. City-note subcategory structure, note categories, Costs scrub in notes.
7. Collision suppression (docket fix 2 re-land) + AS-3 semantic routing.
8. AS-1 anchor validity rules; AS-2 diagnostics → review surface plumbing;
   AS-4 redactor; AS-5 counters.

Each fix lands with its ground-truth fixture check in the same commit, per
`AGENTS.md`. After the pass: one fresh extraction (7.17.3) — do not hand-edit
this draft; it would hide the upstream defects.
