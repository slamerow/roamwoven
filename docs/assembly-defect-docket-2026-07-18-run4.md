# Assembly defect docket — live run 7.18.1 (wave-1 validation run)

Trip `5fc3223b-f31f-4d85-b287-e80dbb388f9a` ("7.18.1"), first extraction on
the wave-1 build. Audited against ground truth v2 + Δ2 and the wave-1 targets
in `docs/next-session.md`. Sources: QA bundle (`run-7.18.1-qa-bundle.json`,
saved locally, gitignored, byte-exact sha256-verified), live `/data` and
`/summary` pages, lineage evidence. Extraction model gpt-5.4-mini again;
28/28 chunks succeeded; 311/311 observations dispositioned.

## Wave-1 target scorecard — the assembly layer did its job

| Target | 7.18.0 | 7.18.1 | Verdict |
|---|---|---|---|
| Stays | 7 (3× Prague, one public) | **5 ✓** — Prague Airbnb Jan 14–18, clean name, all protected | **FIXED LIVE** |
| Credentials/booking codes in public prose | Wi-Fi pwd, door code, addresses, train bookings | **ZERO** — checked live DOM; protected values appear only inside maker edit-form fields | **FIXED LIVE** |
| Cross-date ticket duplicate cards | 2 (with booking codes) | **0** | **FIXED** (not re-emitted this run; fold path fixture-covered) |
| False transport P0 | 1 (Costs anchor, fabricated date) | **0** — budget anchor never minted (7 anchors); NEW coverage P2 correctly flags the unanchored FR8331 row | **FIXED LIVE** |
| Transport question leaks | 2 | **0** | **FIXED LIVE** |
| Day-slot venue options | Gellert card + Baths card + question | **ONE** Baths card with "Option: Bath houses (Gellert Baths)" + question (Gellert copies folded per lineage) | **FIXED LIVE** |
| Schönbrunn group | 2/5 stops | **5/5** with an honest source-listing call | **FIXED LIVE** |
| Count definition | 65 / 67 / 72 | **77 Plans = 69 top-level cards + 8 travel**, consistent | **FIXED LIVE** (one 68-vs-69 straggler in the audit `structured` block — minor) |
| Hard warnings | 3 | 1 (a new parser shape, see A-2) | improved |
| Days | 14 ✓ | 14 ✓ | held |
| Transport rows | 8 ✓ | 8 ✓ all times/confirmations correct | held |

Every defect class wave 1 targeted is fixed or absent in the live run.

## Verdict: still no-ship — parser variance is now the dominant failure source

Same model, same PDF, third materially different parse. This run the parser:
dropped the entire Jan 20 Vienna day into a reference list, dropped Watches
in Rome / Tour Rome / the Rome city note / koscom (again) / Szechenyi Baths
(again) / two of the three Vienna trio venues; emitted day TITLES as activity
cards ("We Explore Budapest", "Walking tour / Jewish History / Old Town free
time"); exploded one lunch disjunction into FOUR cards plus a question;
minted a "$72 (private room—ensuite)" cost card ("Vienna lodging note");
mislabeled Ryanair FR8331 as "Delta flight FR8331" (provider text-bleed
family); placed a "Prague Walking Tour" card on the Vienna Jan 18 day; and
emitted three bare "Prague Castle" observations that slot-collision then
killed — the castle is gone from the app entirely. This is the wave-2 case
in one paragraph, plus the strongest argument yet for the source-coverage
diagnostic and extraction pinning.

## Assembly defects exposed by the new shapes (wave-1.1 patch list)

- **A-1 (worst): the Vienna leg was gutted by note-copy-wins.** The parser
  ALSO emitted the Vienna venues as a trailing-notes reference list this run,
  so Albertina, Pick up Vienna card, State Hall Library, Belvedere (Jan 18)
  and Jewish Museum, Library, Laundry, Bank Austria Kunstforum, St.
  Stephen's (Jan 20) were all folded into the Vienna note ("repeated but
  never committed"). The wave-1 day-plan exception did not fire because the
  cards' merged pdf-notes activity copies poisoned the shared-source-section
  veto (piece labels contain the notes-blob label, so every note copy looks
  same-section). Fix: the veto must compare the note copies against the
  card's DAY-SECTION label only, not every label the merge accreted.
  Lineage-verified. **Assembly (wave-1 regression under new parser shape).**
- **A-2: "Drop bags and tour Rome" survived the check-in title gate** —
  "tour" is not in the routine-vocabulary list. One hard warning, one live
  duplicate card. Fix: add tour/touring/spend/starting to the vocabulary.
- **A-3: "Fisherman's Bastion to Castle Hill" formed a bogus same-site
  group** (2 stops incl. St. Stephen's Basilica across the river) because the
  parser's run-on container description lists half the day, which satisfies
  source-listing membership, and "A to B" titles slip the multi-site guard
  (it only checks "and"/"&"). Fix: "A to B" container titles are routes, not
  sites; and source-listing membership needs a component-list shape, not a
  substring of narrative prose.
- **A-4: Jan 22 duplicate pairs** — "Castle Hill walk" + "Castle Hill / Buda
  Castle" (both 10:30), and the lunch disjunction as "Lunch option" + "Lunch
  in Buda" + "Pest-Buda Bistro" + "Cafe Pierrot" + a "which lunch option"
  question. Slot collision caught neither pair (title overlap too low). Fix:
  same-day same-time description-identity collapse; alternative-slot cards
  ("Have lunch at X or Y") collapse to one card, choice in description, no
  question (RW-QUE-001 disjunction rule).
- **A-5: two parser question leaks remain** — "which lunch option was chosen"
  and "which beer spot should be added as the planned activity" (both
  trip-subject description/title questions; the beer one is note content and
  source-obvious). Wave-1 reconciliation covered transport fields only. Fix:
  extend to alternative-slot and note-content questions.
- **A-6: uncommitted-mention promotions worse this run** (gypsy music, Konyv
  Bar, Mazel Tov, Hilton wine cellar, Popped up statue, Retró Lángos, Street
  Food Karavan as cards) — the thin notes this run gave the card/note
  reconciliation no note copies to fold into. Root cause is parser section
  classification (wave 2); an assembly backstop for recommendation-list
  phrasing is possible but risks the key's meal-slot/deliberate-list rules —
  defer to wave 2 unless Eli wants the backstop.
- **A-7 (minor): audit `structured.activeActivities` 68 vs 69 elsewhere** —
  one count source still not on the shared definition.

## What else held from earlier passes

R2D2 → note ✓; costs excluded from Prague note ✓ (but a costs ADMIN card
leaked, see parser list); Gerbeaud's folded into Vorosmarty Ter ✓ (new, key-
correct); Chain Bridge one card ✓; U Malířů one lunch ✓; Bellevue with menu
description ✓; no date questions ✓; night coverage ✓; no PII ✓.

## Recommended order

1. Wave-1.1 assembly patch (A-1, A-2, A-3, A-4, A-5 — each with a 7.18.1-
   shape fixture; small, deterministic, one push, no extraction needed to
   validate beyond the next scheduled run).
2. Wave 2 parser pass as planned (geo fields, section classification, no
   day-title cards, disjunction singletons, no cost cards, provider/title
   bleed, keep dropped lines) + the source-coverage diagnostic — this run
   makes it the highest-leverage work in the codebase.
3. Extraction pinning right after (Supabase SQL first) — three different
   parses of one unchanged PDF is unacceptable QA noise and real cost.

## Wave-1.1 fix status (2026-07-18, same session — all landed with run4 fixtures)

Suite: 42 test files green incl. NEW `tests/assembly-ground-truth-run4.test.ts`
(6 checks from the live 7.18.1 shapes); typecheck + build clean; ledger v12.

- A-1 Vienna leg gutted: note-copy veto now compares against the card's
  DAY-PLAN section labels only. LANDED.
- A-2 "Drop bags and tour Rome": routine-title vocabulary extended
  (tour/touring/spend/land/starting). LANDED.
- A-3 Fisherman's Bastion overgroup: "A to B" container titles are routes;
  source-listing membership requires a component-list shape, not narrative
  containment. LANDED.
- A-4 lunch ×4 + Castle Hill pair: near-identical same-day descriptions
  collapse (or-carrying copy wins), option-titled cards fold into the slot
  card. LANDED.
- A-5 question leaks: "which X was chosen" suppressed when a slot card
  carries the choice; note-content promotion questions ("which beer spot
  should be added") suppressed. LANDED.
- Second-audit adoption: day-slot venue options alias-deduped; fewer than
  two distinct venues → silent fold, no question (Gellert). Prague Castle
  restoration via the site-vs-event slot-collision guard. LANDED.
- A-7 structured count straggler: audit `structured.activeActivities` joined
  the RW-CNT-001 shared rule. LANDED.
- Not in 1.1 (wave 2): FR8331 "Delta" title / provider bleed, uncommitted
  recommendation promotions (parser section classification), geo fields,
  day-title container cards at the source, cost cards, dropped lines,
  source-coverage diagnostic. Then extraction pinning.

## Wave-2 fix status (2026-07-18, fresh session — all landed with wave-2 fixtures)

Suite: 44 test files green incl. NEW `tests/parser-artifact-normalization.test.ts`
(11 checks from live 7.18.0/7.18.1 parser shapes) and
`tests/source-coverage.test.ts` (6 checks incl. the koscom / "tour Rome" drop
shapes); typecheck + build clean; ledger v13.

- Geo fields: prompt hardened — coordinates are demanded for every named
  landmark card ("a famous sight with null coordinates is an extraction
  defect") in the system prompt AND repeated in every per-chunk input.
  Model compliance is only observable on the next fresh extraction; the
  Lesser Town walk rule stays blocked until it complies. LANDED (prompt).
- Dropped lines (koscom / "maybe communism museum" / Tour Rome / Szechenyi
  Baths): line-coverage prompt rule naming exactly these shapes + the NEW
  deterministic day-section source-coverage diagnostic
  (`lib/extraction/source-coverage.ts`): every meaningful line under a dated
  day heading is checked for token coverage in its chunk's output; gaps ship
  as quiet P2 `day_section_source_line_unextracted` with bounded excerpts,
  plus counts in the audit extraction summary and QA bundle. Candidate
  finding only — never a mutation, never a maker Question (RW-QA-001).
  LANDED.
- Day-title cards ("We Explore Budapest", "Walking tour / Jewish History /
  Old Town free time"): prompt day-title rule + deterministic demotion when
  a card's title IS the heading's non-date remainder; a venue named inside a
  multi-part heading ("Prague Castle" under "Lesser Town & Prague Castle")
  survives — fixture-guarded so the castle cannot be re-killed. LANDED.
- Cost cards ("Vienna lodging note / $72"): prompt cost-line rule +
  deterministic demotion of pure lodging/price fragments. LANDED.
- Disjunction singletons (Mumok + Natural History): prompt disjunction rule
  + deterministic fold of split alternatives into one "X or Y" card when the
  source line carries the disjunction and no or-copy exists; when an
  or-carrying copy exists the wave-1.1 assembly collapse stays in charge.
  LANDED.
- Ticket-page re-emission (RegioJet/ÖBB as Jan 24 cards): prompt ticket-page
  rule (only the ticket's own printed date; booking_detail evidence, never a
  new activity) + deterministic demotion of transport-titled,
  booking-code-carrying activities from ticket-page chunks to accessory
  evidence. LANDED (assembly date-agnostic shadow remains the backstop).
- Provider/title bleed ("PM Delta", "Home Delta", "Delta flight FR8331"):
  prompt provider rule + deterministic scrub of layout tokens and of carrier
  words absent from the chunk's own source text (title and provider). FR8331
  now ships as "Flight FR8331" with provider null unless the source names
  the carrier. LANDED.
- Reference-list re-emission (A-1's parser half) + section classification:
  prompt reference-list rule — trailing blobs re-listing day-section venues
  are reference copies (city_note_candidate/context), never new dated
  activities, and never move a card to another city's day. LANDED (prompt;
  wave-1.1 day-plan veto remains the assembly backstop).
- Telemetry (RW-OPS-001): every deterministic repair is recorded in
  extraction usage (`parserArtifactRepairs`) and counted in the audit
  canonicalization summary (`parserArtifactRepairCount`).
- NOT in wave 2: the RW-EVD-001 bounded excerpt-only recovery call (the
  coverage diagnostic is its deterministic trigger when built); A-6
  recommendation-promotion assembly backstop (deferred pending Eli's call);
  extraction pinning (next: own push, Supabase SQL first).
