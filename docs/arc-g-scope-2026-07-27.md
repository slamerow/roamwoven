### 2026-07-27 (7.26.1 audit + Arc G scoping, cloud) — **NO CODE CHANGES. Audit + scope only.**

**HOW TO READ THIS ENTRY.** Everything marked VERIFIED was read out of the live
QA bundle (`/maker/trips/ea7857f6-b7b3-4e1e-904a-36119d60b1d1/data/audit/qa-bundle?includePrivate=1`,
221,759 B, `includePrivate=1`, in-page fetch through the maker session) or out of
source at the paths given. Repeat the check before trusting it. Items marked
HYPOTHESIS are inference. **This session re-derived several conclusions that were
already in this file — read `next-session.md` BEFORE re-auditing grouping.**

#### Run identity

Trip `ea7857f6-b7b3-4e1e-904a-36119d60b1d1` ("7.26.1"), source
`USE FOR TESTING CZECH.pdf`. 30/30 activity chunks, 0 failed.

**VERIFIED — 7.26.1 ran OCR on `gpt-5.6-luna`**, all 5 batches
(`ocrBatches.rows[0..4].model`, `materialPipeline.checkpoints[0].metadata.model`).
sourceRecovery ran `gpt-5.4-mini`. Same split as 7.25.0.

**RETIRED PREMISE — "roll OCR back to mini" is not a pending action.** It was
attempted 2026-07-25, destroyed a run, and was reverted. `lib/env.ts:18` lists
`gpt-5.4-mini` in `OCR_TEXT_ONLY_MODELS`; `:14` lists luna as the only
vision-capable model. A text model cannot read a PDF. **Eli's decision this
session: proceed on luna, hold the substrate constant so content deltas stay
measurable.** Better OCR = a better VISION model, through
`scripts/ocr-smoke-test.mjs` first. No `OPENAI_OCR_MODEL` override in `.env.local`.

#### Counts (VERIFIED, `records.counts`)

| Metric | 7.25.0 | 7.26.1 | Δ |
|---|---|---|---|
| legs / transport / stays | 5 / 8 / 5 | 5 / 8 / 5 | GT-exact, 8th clean run |
| active activities | 69 | **75** | **+6** (GT 49) |
| open questions | 8 | **11** | **+3** (GT 3) |
| dismissed questions | 1 | 0 | gate still dead (chain C) |
| grouped stops | — | **2** | Eli's bar is 6 on Schönbrunn alone |
| calls | 2 | 1 | GT 1 |
| notes | 3 | 5 | GT 3 |
| placeholders | 4 | 0 | improved |
| geocode cand / resolved / failed / skipped | 85 / 47 / 3 / 35 | 83 / **45** / **5** / 33 | slightly worse |
| residual uncovered lines | 41 | 32 | improved |

**GT card target settled with Eli this session: 49 (±1–2), counted off the
answer key's day-by-day.** Supersedes the "GT ≈ 40" in the 7.25.0 docket.

#### VERIFIED — the 2018 header has a two-record root cause

Exactly two active records carry a 2018 date:

    items[80]  "onion or garlic soup"                itemType note, legId null, date 2018-01-14
    items[81]  "St. Stephen's mummified right hand"  itemType note, legId null, date 2018-01-22
    records.trip.startDate = "2018-01-14"   <- identical to items[80].date

Mechanism, `lib/extraction/draft-to-structured-trip.ts:450`:
`candidateLeg = findLegForDate(legs, date) ?? findLegForCanonicalCity(...)`.
A 2018 date matches no 2019 leg → `legId: null` → the note floats, and the bad
date still feeds trip range derivation. **The bad year is the cause, not the
symptom — I had this chain backwards mid-session.**

Compounding, same file: `:481` `reviewRequired: itemType === "note" ? false : …`
and `:484` forces `status: "draft"` for notes. **A note with a garbage date is
structurally incapable of being flagged.** Both items are also GT-misplaced:
the soup belongs inside the Prague city note (GT:111), the mummified hand is a
description on St. Istvan's Basilica (GT:211).

#### VERIFIED — transport field bleed, two records

    transport[2]  dep "Praha, Hlavní Nádraží" 09:20  arr "JFK"       arrT 13:23
    transport[3]  dep "Wien Hbf"              10:42  arr "Budapest"  arrT 10:42

GT card 4: RegioJet RJ 1033 → **Wien Hbf 13:23**. The arrival TIME is GT-exact;
only `arrivalLocation` is contaminated, and JFK is legitimate on transport rows
0/1/5/6 (the Delta segments). Narrow cross-record bleed, not a bad parse.

GT card 5: ÖBB D 143 Wien Hbf 10:42 → **Budapest-Keleti 13:19**. `arrivalTime`
is a verbatim copy of `departureTime`.

Both surface as review questions framed as "equally authoritative source
evidence conflicts." They are deterministic corrections with a known GT answer
and must never reach a human. Note also: both cards are titled "Train to X";
GT names them by operator + number like the six flights.

#### VERIFIED — grouping: the agreed rider was never built

Trip-wide sub-stop count is **2**, and both are `"… at Schönbrunn"`
(Orangeriegarten, Palm House). Gloriette, Apple Strudel Show and Panorama Train
pass sit at top level. They joined via the **title-token path**
(`evidence-clustering.ts:5915`, `token.length >= 5 && childTitle.includes(token)`),
not geo.

- `SAME_SITE_RADIUS_KM = 0.3` (`:7931`). Gloriette is ~800 m out — already
  recorded in this file at line 1133 as refusing it BY DESIGN.
- **`formattedAddress` / `formatted_address` appears NOWHERE in the repo.**
  `parseGeocodeResponse` (`geocode-verification.ts:152–173`) reads `results`,
  returns `{lat, lng}`, discards the rest. The Google response already carries
  the formatted address — the lane is paying for it and parsing it away.
  **This is the "geo coordinate + logic" rider Eli approved (see line 1133).
  It was never implemented.**
- **The grouping claim ledger was never built.** Walk lane still opens with
  `if (grouped.has(piece)) return false` (`:8326`); same-site lane still wins on
  loop order, "no score, no contest" (7.25.0 docket, chain B). `WALK_RADIUS_KM`
  1.8 is still annotated as calibrated to the approved Malá Strana ruling — the
  group it still cannot form.
- `sameEntity` DID land (`lib/extraction/entity-winner.ts`). Phase 1 shipped
  half.

Honest expectation on the F.2 build was 3–4 of 6 Schönbrunn stops. **7.26.1
delivered 2. We are below the pessimistic line.**

#### Arc G scope — LOCKED with Eli this session: correctness + grouping

**G.1 — Note anchoring and spine derivation.** A `legId: null` note must not
carry a date into trip-range derivation, and notes must become flaggable
(`draft-to-structured-trip.ts:481`/`:484`). Kills the 2018 header, the 16-day
count, and the +2 note overage.

**G.2 — Cross-record field bleed.** `arrivalLocation` must be type-compatible
with the record (a train cannot arrive at an IATA code); `arrivalTime` must not
equal `departureTime`. GT has both right answers → fixture assertions, and both
questions disappear.

**G.3 — Grouping.** Ship the two already-approved pieces: (a) capture the
geocoder's formatted address and match container tokens, radius as fallback,
hierarchy-confirmed members extending the site footprint; (b) a claim ledger so
the same-site lane cannot silently consume the walk lane's members. Target:
Schönbrunn at 6 stops, Prague Castle and the Jan-15 walking tour grouping at
all, Malá Strana able to form.

**Explicitly OUT of G** (deferred, Eli's call): debris routing (~9 cards) and
the idea-vs-plan demotion lane (~10 cards, **never audited — no read on it at
all**). Expect G to land around 65–69 cards, not 49. That is expected, not a
failure of G.

**Publish gate — Eli's ruling this session: warn loudly, do not block.**
Plausibility failures raise a HARD warning on the publish page; publish stays
available. GT:269 (unresolved answers never block) stays intact.

#### Geocode budget

Eli, this session: the 50 was an arbitrary cost cap, intended to cover only
candidates that might land in a system-grouped activity. It does not behave that
way — the lane runs across all 83 in encounter order. **Lower priority than it
looks:** formatted-address matching needs no additional lookups, so G.3 is not
blocked on the budget. Revisit in H.

#### Corrections to claims made earlier in THIS session (do not inherit them)

1. "7.26.1 is the first clean content baseline" — **WRONG**, it is on luna.
2. "69 → 75 is an apples-to-oranges denominator error" — **WRONG**,
   `activeActivities` is 75 and 7.25.0's active was 69. The +6 is real.
3. "2018 is not evidenced in the data" — **WRONG**, see the two records above.
   That was an over-read of the rendered DOM.
4. "10:42 vs 13:19 is genuine source ambiguity" — **WRONG**, 10:42 is the
   departure. Field copy.
5. "St. Vitus is a legitimate 4th question" — **WRONG**, Δ2 amendment 2 folds
   it into the castle ticket question. GT budget is 3.
6. "Switch OCR to mini" — **WRONG and dangerous**, see the retired premise above.

---

## ADDENDUM — demotion-lane audit (2026-07-27, same session)

Run because the demotion lane had never been audited and it was the last unknown
in the card gap. Two independent agents: one classified all 82 observed records
against the key, one derived the expected output from the key alone without
seeing pipeline output. **They reconcile**, which is the main reason to trust
the numbers below.

- Independent derivation from the key: **49 activity cards**, 8 travel, 4 grouped
  parents, **14 sub-stops**, 3 city notes, 3 questions.
- Classification of the 82 observed: **45** should remain activity cards.
- 49 - 45 = 4, and exactly four GT cards are ABSENT from the output: Matthias
  Church (only its URL survived, idx 71), Vorosmarty Ter, Koscom watch shop, and
  the Mala Strana & Hradcany grouped parent. The two counts close.

**49 is confirmed as the target.** Supersedes "GT ~ 40".

### The gap, decomposed (75 active -> 45 correctable)

| Correction | Cards removed | Notes |
|---|---|---|
| -> SUBSTOP | **9** | 11 GT sub-stops exist; only 2 are flagged today |
| -> CITYNOTE | **9** | idx 18, 30, 33, 51, 61, 64, 68, 70, 73 |
| -> DEBRIS | **5** | idx 0, 34, 67, 71, 75 |
| -> DESCRIPTION | **3** | idx 42, 69, 74 |
| -> STAY_DETAIL | **1** activity (+2 admin) | idx 76; idx 63, 66 are `itemType: admin` |

Grouping, demotion and debris are each worth roughly 9 cards. The earlier
"three equal thirds" estimate holds.

### WARNING - COUPLING FOUND - read before calibrating the walk lane

The walk lane fires only on crowded days
(`if (visibleCount <= CROWDED_DAY_VISIBLE_CARDS) continue`,
`evidence-clustering.ts:8322`). Missed demotion is inflating that signal:

- **Jan 19 - 12 observed cards, GT says 2.** Ten of the twelve are Schonbrunn
  sub-stops or Vienna city-note ideas, including the separate Mumok and Natural
  History lines (2026-08-05 source correction). The day only
  looks crowded because demotion never ran. GT wants NO walk group here -
  Schonbrunn is containment, not a walk.
- **Jan 22 - 12 observed, GT says 10 individual cards and NO grouping.** This is
  the explicit guard case: the key says "a 9-card day with nothing groupable
  ships as 9 cards... it never forces a collapse or invents an illogical group."
  The day is already over the crowded threshold and the four timed items are
  standalone by rule 5.

**Consequence for G.3: fixing the claim ledger could ENABLE a wrong walk group on
Jan 22.** Today the same-site lane starves the walk lane, which accidentally
suppresses it. Free the walk lane without a demotion fix and Jan 22 becomes the
regression. Add a Jan 22 "no group forms" fixture assertion alongside the
Schonbrunn-6 assertion, and do not calibrate `CROWDED_DAY_VISIBLE_CARDS` against
the current inflated counts.

Everything else in G is uncoupled: G.1, G.2 and the campus half of G.3
(Schonbrunn, Prague Castle, Jan-15 walking tour) are safe to build now.

### Key ambiguities surfaced - need an Eli ruling, none blocking

1. **A2 (+/-1 card):** Jan 22 "St. Istvan's Basilica" and Jan 23 "St. Stephen's
   Basilica tower" are the same Budapest building in the same leg. The key never
   dedups them. Pipeline emitted BOTH, and dated both to Jan 22 (idx 53, 72).
   Literal read = 49; same-name-same-leg dedup = 48.
2. **A4:** the Jan 20 dedup removes "the Library," but the only Library in the
   key is State Hall Library, which is one of question #2's three items. If the
   Jan 20 card wins, question #2 shrinks to two items. Key insists it stays three.
3. **Rome has no city note in the key**, yet Rome is 2 of 5 legs and the pipeline
   emitted "Pizza in Rome" (idx 64). Delta-2 amd. 3's "nothing is dropped" implies
   a Rome note should exist.
4. **A1:** "activity cards" is defined once as including travel cards (line 35)
   and used per-day as excluding them. Eli settled this session: **49 = non-travel.**
