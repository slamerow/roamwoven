# Assembly defect docket — live runs 7.17.0 / 7.17.1 (2026-07-17)

Confirmed defects from the first two fresh Central Europe extractions after the
ground-truth v2 commit (`b53c135`), plus Eli's approved correction order and
doctrine clarifications. Each item must land as a ground-truth fixture check in
the same change that fixes it (`tests/assembly-ground-truth.test.ts`), with
ledger updates per `AGENTS.md`.

Run under audit: trip `b480e3f7-1fbe-482f-8eeb-77a5125b394f` (7.17.1).

## Correction order (Eli, approved)

1. Fix transport time anchoring.
2. Automatically suppress confirmed stay/transport collisions.
3. Block continuation when confirmed hard defects remain.
4. Replace area-only grouping with source-hierarchy constraints.
5. Sanitize city notes and sensitive values.
6. Deduplicate/source-resolve Questions.
7. Repair the false-positive transport diagnostic.

## Publish blockers (confirmed)

- **Transport time corruption.** Source: leave for airport 2:30 PM, Delta 5925
  flies 5:00–6:41 PM. Final transport row shows 2:30–5:00 PM — every time
  shifted back one field. Prep-note times must never displace segment times;
  source anchors carry authoritative times. (The detector also missed this.)
- **Confirmed duplicates preserved.** Five hard warnings: four activities
  duplicating transport rows, one duplicating a stay. Delta 1043's duplicate
  activity says 2:45–6:45 AM vs the correct PM row. Remediation classified
  these `confirmed_output_defect` and preserved them; the review page never
  shows the warnings. Confirmed collisions must suppress the duplicate.
  UPDATED (CEO, 2026-07-17 evening): publish is NOT blocked — publish is
  post-review and the maker's call; suppression plus visible warnings replace
  the 2026-07-02 hard publish-blocking behavior. Blocking was a crutch for
  bad remediation.
- **City-note contamination.** Prague Notes contain a Rome Colosseum ticket
  AND its booking barcode (privacy leak), plus R2D2 content misfiled. Budapest
  note repeats its own content. Fixes: note-collection city assignment from
  content evidence (not date-range fallback), entry-level dedup inside
  collections, privacy scrub of note text.
- **Triple-lunch P0 (duplicate resolution miss).** "U Malířů" (13:00),
  "Restaurant Festival reservation at U Malířů 1543" (13:00), and "Lunch"
  (13:00) survived as three cards. Root cause: identity matching keys on title
  tokens; these share none. Fix: title-agnostic collision collapse — same day
  + same time (±15 min) + same category = one entity; booking-anchored copy
  wins identity; venue name wins title. Same family: "Parliament tour" vs
  "Parliament", St. Stephen's apostrophe variants, Pest basilica variants.
- **Merged-description echo.** "Changing of the Guard at 12:00 PM. Changing of
  the Guard - 12:00 PM." — chunk-overlap observations concatenated instead of
  deduped on merge.

## Grouping doctrine v3 (Eli, 2026-07-17 — supersedes v2 geo rule)

- Grouping happens because it is the CLEAN interpretation of the source — the
  "friend looks at your itinerary and says we should group these" test. Day
  pressure (over ~6 visible cards) is a hint to go LOOKING, never the reason,
  and never forces a group.
- Classification precedes grouping: a City Note candidate ("things I could
  do") can never be rescued into a group of Activities ("things I'm doing").
- Expect a HANDFUL of system groups per trip. Two per day would be
  over-constrained. This source is unusually freeform; restraint wins.
- Same-site complexes group via SOURCE HIERARCHY (castle/palace container with
  sub-stops, e.g., "Prague Castle, 2 hours: Changing of the Guard 12:00, St.
  Vitus"), presented as "<Site> visit". No size cap when it is logically one
  visit — 5, 7, or 9 Schönbrunn stops all belong together.
- Walking-route groups require geographic verification: parser-emitted
  approximate coordinates, every stop within a 10–15 minute walk. Shared area
  labels alone are insufficient. Area labels that equal a leg city or day-trip
  town never group ("Budapest", "Kutná Hora").
- Fully sequenced source days (3+ explicitly timed stops) block system
  grouping — the maker authored that flow (Jan 22 Buda stays individual).
- Parent titles must be source-derived and obvious ("Lesser Town" came from
  the source's own day title — good; "Malá Strana" was invented — bad).
- Never surface non-actions: no calls/questions/warnings about groups NOT
  made. Overload is evidence to look for city notes and groups — not to force
  them.
- Call claims must state the actual rule used. 7.17.1's calls said "source
  structure supports one visit" while lineage shows area grouping — dishonest
  claims are their own defect.
- 7.17.1 verdicts: Kutná Hora walk (wrong — 3 discrete activities, sights not
  walkably close, day not crowded), Old Town walk Jan 14 (wrong — approved
  answer key keeps 4 individual cards), Albertina absorbing Vienna attractions
  (wrong), Innere Stadt absorbing Laundry (wrong — admin errand in a sights
  walk), Pest/Budapest catch-alls (wrong), Schönbrunn (right concept, should
  be a same-site visit not a "walk"), Lesser Town (right, source-named).

## Question quality (target: ~2 good questions from 7.17.1's five)

- Drop "Which day does AirBNB happen?" — stay dates are known (Jan 14–18);
  a duplicate stay-activity was provisionally placed Jan 15. Stays never get
  item date-questions.
- Drop the lunch venue question — U Malířů at 1:00 PM answers it in-source.
  A generic timed meal with a same-day booked venue at the same time is the
  same entity, not a question.
- Collapse Changing-of-the-Guard/Prague-Castle ticket prompts into ONE
  correctly attributed ticket decision (attach to the castle same-site parent
  once it forms; dedupe by normalized decision text, not subject).
- Keep St. Vitus tour-vs-visit. Keep one genuine ticket-choice question.
- Vienna trio "planned or ideas?" question never fired — price/hours markers
  need to be read from all parser text fields (description AND evidence).
- Baths question missing; Jan 23 has three bath-alias cards ("Budapest
  baths", "Baths", "Gellert Bath House") needing alias dedup + the question.

## Hierarchy leaks

- "Budget note" became a Jan 24 food activity (Costs section must be excluded
  with recorded disposition).
- "Prague Walking Tour" card dated Jan 24 — inside the Rome leg. Wrong-city
  placement must route to the named city or a placement review item.
- Pest lunch exists as BOTH standalone card and grouped stop (single-home
  violation).

## Audit system defects

- Declared P0 "Budapest transport missing" is FALSE — the train exists with a
  compiled 10:42–13:19 record. False-positive detector must be reconciled
  (identity-join failure reported as missing record, violating RW-AUD-001).
- The detector MISSED the genuine Delta 5925 time corruption (2:30–5:00 vs
  source 5:00–6:41): no time-plausibility check against source anchors.

## Commitment-language fix (from 7.17.1 evidence)

- `PLANNED_ACTIVITY_PATTERN` treats bare "visit/explore/stroll" as planned
  intent, but the parser writes "Visit the museum" for everything — so
  Museum of Communism and Pinball each kept one activity card instead of
  demoting to a city note. Commitment requires first-person/booking language
  ("we'll", "plan to", "booked", "reserved"), a time, or a confirmation.

## What 7.17.1 proved works (keep)

8 per-segment travel cards; 5 stays with night coverage; calls exist,
statement-style, correctly separated from questions; R2D2 doubt-marker
demotion; repeat mentions partially collapsing (2→1); parser → area → group →
call pipeline mechanics; "Lesser Town walk" naming from source.
