# Assembly defect docket — live run 7.18.2 (wave-2 validation run)

Trip `51d3bc5f-db85-4b03-8441-9faa26da5a9d` ("7.18.2"), first extraction on
the wave-2 build. Audited against ground truth v2 + Δ2 and the wave-2 targets
in `docs/next-session.md`. Sources: QA bundle (`run-7.18.2-qa-bundle.json`,
210,725 bytes, sha256 `63a17212…f3d8`, fetched authenticated and saved to
Eli's Downloads), bundle lineage/records/diagnostics. 28/28 chunks succeeded,
303/303 observations dispositioned, 8 parser-artifact repairs recorded,
0 false P0.

## Wave-2 target scorecard

| Target | 7.18.1 | 7.18.2 | Verdict |
|---|---|---|---|
| Geo fields emitted | zero | **EMITTED — both geo grouping rules fired for the first time** (same-site call + discovered walk) | **FIXED at the parser; grouping rules now the defect** |
| Day-title cards | 2 | 1 ("Explore Vienna" — a heading *fragment*, new shape) | improved, one escape |
| Cost cards | 1 | **3** ("Costs" Jan 25, "January 21st Budapest lodging note", "Budapest stay" placeholder) | **worse — demotion too narrow** |
| "X or Y" disjunction singletons | exploded ×4 | one card ✓ ("Pest-Buda Bistro or Cafe Pierrot", "Tour Rome or work") but one **wrong pairing** ("MUMOK Museum or St. Stephen's Cathedral") | mostly fixed, one misfire |
| Ticket-page re-emission | 2 transport | transport ✓ silent accessory; **NEW: activity-ticket page** ("Colosseum skip-the-line ticket" re-dated Jan 15 in PRAGUE) | transport fixed; activity family uncovered |
| Provider/carrier bleed | FR8331 "Delta" | none observed; 8 transport rows clean | FIXED (apparent) |
| Dropped lines | koscom, Szechenyi Baths, Tour Rome, Rome note | Tour Rome ✓ back, Watches-in-Rome in note; **koscom dropped (4th run), Szechenyi Baths dropped (4th run)** | prompt did NOT fix drops; coverage diagnostic fired ✓ |
| Coverage diagnostic | n/a | **fired: 121/393 lines flagged — but very noisy** | works; needs calibration |
| Stays | 5 ✓ | 5 ✓ clean names/dates | held |
| False P0 | 0 | 0 ✓ | held |
| Credentials in prose | 0 | 0 credentials; **but stay cost/arrival fragment in Rome note** (see PB-1) | mostly held |
| Questions | 6 | **6 (target 3): 2 bogus date questions, castle ×2, researched-list misfire; baths question MISSING** | **regressed in kind** |

## Headline defects

- **PB-1 — Stay material leaked into the Rome city note.** Rome Notes & Tips
  ("Shopping/Tailor") reads: "Watches in Rome is located here. Notes: 743
  45.75 euro due upon arrival + tax; arrival and bag drop before touring
  Rome." That is The Yellow's check-in fragment (#743, arrival cost, bag
  drop) fused into a shopping note. Stay-owned content in public note prose
  (RW-ASM-001/RW-PRI-001 vector — cost+identifier, not credentials).
  **Assembly** (note-collection routing + the protected-value scrub covers
  credential values, not stay cost/arrival fragments).
- **PB-2 — Two parser-minted FALSE-CONFLICT date questions (Eli's "shitty
  questions"; 0 date questions in 7.18.1 → 2 here).** "Should the Vienna
  train / arrival day be dated Friday, January 18th?" — its own evidence says
  the day section says Jan 18 AND the ticket says 18 Jan 2019. They AGREE;
  there is no conflict. Same for Budapest/Jan 21. guessedValue equals the
  date already on the final transport row and stay. Suspicion: the new
  ticket-page prompt rule ("use only the ticket's own printed date") made the
  model defensively surface date "conflicts" as missingDetails.
  Classification: **parser** (fabricated conflict) **+ assembly** (the wave-1
  question reconciliation covers transport-subject questions only; a
  TRIP-subject date question whose guessedValue equals the already-final
  canonical state must resolve silently; also `targetField: date` shipped
  with a `text` control — RW-QUE-001 violation).
- **PB-3 — Schönbrunn destroyed by a day-arc collapse chain.** The parser DID
  emit Schonbrunn Palace, Gloriette, Palm House at Schönbrunn,
  Orangeriegarten at Schönbrunn — all four pieces are SUPPRESSED. Lineage:
  "Schonbrunn Palace … rejected: same plan described twice on one day:
  near-identical descriptions collapse to one card" — the wave-1.1
  near-identical collapse let a generic day-arc card win against the named
  venue (the surviving "Explore Vienna" heading-fragment card summarizes the
  day, so the venue card looked like its duplicate). The orphaned components
  then fed the researched-list hold ("Orangeriegarten at Schönbrunn" appears
  in a planned-or-ideas QUESTION). Fixes: (a) near-identical collapse winner
  rule — a named venue card always beats a day-arc/heading-fragment card;
  (b) day-title demotion must also catch heading-fragment titles ("Explore
  Vienna" from "Friday, January 18th // Explore Vienna / Pick up Card /…" —
  and note it shipped on Jan 19, not even its own day); (c) researched-list
  pattern must exclude "X at Site" component titles. Classification:
  **wave-2/1.1 assembly calibration** (parser emitted everything correctly).
- **PB-4 — Geo grouping fired for the first time and its membership rules
  broke.** "Gresham Palace" — a *"Quick look inside the Gresham Palace"*
  card — matched the same-site container noun pattern ("palace") and, with
  coordinates now real, claimed 5 stops "within 300 m": St. Istvan's
  Basilica (~650 m away), Vorosmarty Ter, Gerbeaud's, the TIMED Szechenyi
  Chain Bridge @11:00, and Pontoon. "Old Town walk" (discovered walk,
  correct that it fired) absorbed Dancing House and Lucerna Arcade (Nové
  Město, not Old Town) and Museum of Communism. Likely mechanism: prompt
  asks for 2-3 decimal coordinates — 2 decimals quantizes to ~1.1 km, so
  central-Pest venues collapse onto shared rounded points and "300 m" passes
  (unverifiable from the bundle: lineage does not expose the coordinate
  values — audit-visibility gap). Fixes: require ≥3-decimal precision in
  prompt AND treat 2-decimal coords as too coarse for the 300 m rule;
  same-site containers must be actual site-visit cards (not "quick look"
  passing mentions) with source-listing support; timed stops never join;
  cross-check walk members against the area label. Classification:
  **wave-2 grouping calibration + parser precision + audit visibility**.
- **PB-5 — Castle day still wrong, now in a new shape.** "Lesser Town &
  Prague Castle" container card ships alongside its standalone components
  (St. Vitus, Vinarna Certovka, Lennon Wall, KGB, Novy svet — no group), TWO
  castle ticket questions (one on the container, one on "Prague Castle"),
  and an undated "Prague Castle" placeholder marked needs_review. RW-QUE-001
  one-complex-one-question: same-day ticket_choice decisions must
  consolidate to ONE subject. Also two 13:00 lunch cards ("U Malířů" AND
  "Restaurant Festival") — same-slot collision missed again.
  Classification: **assembly**.
- **PB-6 — Baths question missing.** Gellert pieces exist but were
  doubt-demoted to notes ("source doubt marker … demoted to city note
  without a question"), Szechenyi Baths never extracted (4th run) — so the
  Jan 21 day-title slot rule found <2 venues and folded silently. The key's
  question #3 never fires. Fixes: day-title slot commitment should override
  doubt demotion for its matching venues (note-demoted copies still count as
  options); Szechenyi drop is the chronic parser miss. Classification:
  **assembly rule interaction + parser drop**.
- **PB-7 — Collision auto-suppression STILL missing (4th consecutive run).**
  3 hard warnings, all three cards active: "Drop bags and start Rome
  sightseeing" (title-gate miss: "start"), "Check in to hostel and walk to
  Albertina" (the Albertina eater, 3rd appearance — title gate has
  tour/spend/land/starting but the collision path still ships the card),
  "Leave for Airport" (airport-prep line as activity). Classification:
  **assembly** (docket fix 2 from 7.17.0, never landed).

## Smaller items

- Pinball Museum active on Jan 21 AND Jan 23 (duplicate P1 fired, both cards
  stay; key: zero cards, one note). Uncommitted promotions persist (Great
  Synagogue, Konyv Bar, Children's train, Erzsébet lookout, Chairlift — A-6,
  known-deferred to parser section classification).
- "Car pickup @20:00" is the rental RETURN re-emitted as a second card
  beside "Pick up car for Kutna Hora @09:00" (alias dedupe miss:
  pickup-vs-return titles).
- Old Town Square still standalone beside the 9:00 walking tour (3rd run).
- "MUMOK Museum or St. Stephen's Cathedral" (suppressed piece, surfaces in
  the bogus researched-list question) is a wrong disjunction pairing —
  verify against the PDF; tighten the wave-2 disjunction fold (require short
  sides, skip lines with `//` list separators).
- Coverage diagnostic noise: 121/393 flagged lines include cross-stage
  content (transport covered by the SPINE stage: "JFK -> FCO", stay-routed
  walking directions, "Catacombs tour" extracted by a different chunk), OCR
  page markers ("=== Page 2 ==="), and ticket boilerplate ("Order summary:").
  Fixes: match against the union of ALL stage outputs (spine included) with
  per-chunk match preferred; skip page-marker/boilerplate lines; sort
  evidence so real itinerary lines outrank noise; include the full uncovered
  list in the QA bundle (only counts + 10 capped evidence lines shipped).
- Lineage rows in the bundle do not carry approxLatitude/approxLongitude/
  area (observations are summarized without geo), so grouping-radius claims
  cannot be verified from the bundle — restore geo fields to bundle lineage.

## What 7.18.2 proved works (keep)

Geo emission (the wave-2 prompt hardening worked — first run ever with both
geo rules firing); 5 stays clean; 8 transport rows with no provider bleed;
0 false P0 (three-run streak); 0 credential leaks (live-DOM class of PB-A
stays dead); disjunction singletons for the lunch and Rome slots; Tour Rome
recovered; Jan 20 Vienna day intact (wave-1.1 note veto held); count
definition consistent (67 activities / 4 notes everywhere); ticket-page
transport re-emissions silently absorbed as accessory evidence; coverage
diagnostic fired exactly as designed (a candidate finding, no mutation).

## Recommended wave-2.1 order

1. PB-2 question hygiene: trip-subject question whose guessedValue equals
   final canonical state resolves silently; date targets get date controls;
   parser prompt: never mint a conflict question when the two cited dates
   are equal after normalization.
2. PB-3 collapse winner rule + heading-fragment demotion + researched-list
   excludes "X at Site" members (restores Schönbrunn end to end).
3. PB-4 geo calibration: ≥3-decimal precision demanded and enforced
   (2-decimal coords are ineligible for the 300 m rule), real-site
   containers only, timed stops never join, walk members must match the
   area label; expose geo in bundle lineage.
4. PB-5 one-castle-question consolidation + same-slot lunch collapse +
   container/component resolution.
5. PB-1 stay-fragment scrub for note text + PB-6 slot-rule override +
   PB-7 confirmed-collision auto-suppression (finally).
6. Cost-card demotion broadened ("Costs", "<date> <city> lodging note",
   stay placeholders); coverage calibration items above.
7. Then extraction pinning (own push, Supabase SQL first) — unchanged.

Each fix lands with a 7.18.2-shape fixture in the same commit, per
`AGENTS.md`. After the pass: one fresh extraction — do not hand-edit this
draft.

## Arc A fix status (2026-07-18, pre-7.18.3)

Implemented this session (fixtures in the same commits; see
`docs/product-contracts.md` ledger v15 for contract evidence):

- **PB-3 (Schönbrunn)** — FIXED at three layers: (a) ONE shared
  sameEntity/winner ladder (`lib/extraction/entity-winner.ts`) — overview /
  day-arc / heading-fragment cards can never win any merge; every collapse
  rule (near-identical, slot collision, title containment, fragment
  absorption, placeholder attachment) now takes its winner from the ladder
  (eligibility > or-copy > booking > named-venue tokens > commitment >
  specificity > length); (b) heading-fragment demotion in parser-artifact
  normalization catches "Explore Vienna" via the card's OWN
  sourceSectionLabel/headingPath even when it ships on another day
  ("Prague Castle" under a multi-part heading and un-corroborated
  "Tour Rome" survive); (c) researched-list questions exclude "X at Site"
  component titles. `tests/assembly-ground-truth-run5.test.ts`,
  `tests/entity-winner.test.ts`.
- **PB-4 (geo grouping)** — CALIBRATED: coords below 3-decimal precision
  are ineligible for radius rules; passing-mention titles ("Quick look
  inside …") can never be visit containers; on the geo path a timed stop
  joins only with the container's own category (the locked castle
  guard-changing child survives, the Chain Bridge grab dies); walk members'
  area labels must be source-supported from their own section/heading;
  prompt now demands ≥3-decimal coords (system + per-chunk); geo/area ride
  on QA-bundle lineage observations (the audit-visibility gap).
- **Coverage calibration** — v2: page-marker/boilerplate lines excluded,
  cross-stage union matching (spine included) so other-stage-owned content
  is no longer flagged, full residual uncovered list ships in the bundle.
- **RW-EVD-001 recovery call** — BUILT (`lib/extraction/source-recovery.ts`):
  one excerpt-only batched re-ask off the coverage diagnostic, hard caps,
  separate usage, never self-retries, recovered observations enter assembly
  as a normal late stage (source-truth verified against the excerpts), on
  failure one precise sourceRecovery Question. This is the chronic
  koscom/Szechenyi drop's repair lane (4 runs).
- **Slot-collision retitle (audit A2, partial)** — the cross-referenced
  retitle now only considers copies that actually merged.
- **Audit detector drift (B4)** — detectors import pipeline predicates
  (hedge/availability, high-intent, loose-tip, identity tokenizer,
  heading-fragment day-overview detection).
- Cron hardening: timing-safe CRON_SECRET compare + rejected-attempt logs.

Still open from this docket (Arc B / later): unified
activity-vs-city-note classifier (A-6 promotions), geocoding verification
lane, PB-1 stay-fragment note scrub, PB-5 castle consolidation remainder,
PB-6 slot-rule override, PB-7 collision auto-suppression, Pinball
duplicate, Old Town Square absorption, car pickup/return alias dedupe,
MUMOK/St. Stephen's disjunction pairing verification.

Validation: fresh extraction "7.18.3" against the Arc A targets in
`docs/next-session.md`.
