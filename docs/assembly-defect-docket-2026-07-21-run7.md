# Assembly defect docket — live run 7.21.0 (Arc B validation run, planned as "7.18.4")

Trip `d45bb01b-a6ae-4197-8344-31844bf30440` (named **"7.21.0"**, not "7.18.4" —
the handoff's planned label; recorded here to keep lineage traceable), first
extraction on the Arc B build (4f8e0a5 — geocode lane firing confirms the Arc B
deploy). Audited BLIND-FIRST (standing protocol) from the live QA bundle
fetched via the maker route with `includePrivate=1` (privacy checked on
UNREDACTED card prose per RW-AUD-001): 222,807 bytes, sha256
`86752931…d483f2`, generatedAt 2026-07-21T03:30:48Z, saved as
`run-7.21.0-qa-bundle.json` (repo root, gitignored). Note: no
`run-7.18.4-qa-bundle.json` or `run-7.18.3-qa-bundle.json` exists in the repo
root — 7.18.3's never moved out of Downloads, so the run-over-run diff below
leans on the run6 docket's recorded 7.18.3 state.

Pipeline health: 28/28 chunks, 307/307 observations dispositioned, 8
parser-artifact repairs, 4 identity repairs, 0 P0 diagnostics, 2 true-positive
P1s (Pinball duplicate, Borkonyha loose tip), 2 P2s. Counts unified across
fingerprints/records/review (69 activities + 13 grouped stops = 82 items,
6 notes, 1 placeholder, 5 stays, 9 transport, 3 calls, 9 questions;
RW-CNT-001 holds).

## Ship-bar scorecard (Eli's floor)

| Floor item | 7.18.3 | 7.21.0 | Verdict |
|---|---|---|---|
| Castle CORRECT (survives AND groups) | hedge-demoted to city note | **demoted again — NEW mechanism** (classifier "held as a city idea pending the maker's planned-or-ideas answer" → folded into Prague note + a planned-or-ideas QUESTION; KGB museum same fate; St. Vitus survives standalone with its own extra question) | **FAIL — 3rd distinct kill mechanism in 3 runs** |
| Schönbrunn CORRECT | destroyed (site↔component fusion) | **⊕ parent + Gloriette/Palm House/Orangeriegarten** — PB-2 fix held live | **PASS** (sub-stop set short: Apple Strudel Show landed in Vienna notes, Panorama Train vanished) |
| Zero wrong groups | 0 wrong (vacuous: 0 groups) | **2 wrong of 3**: Gresham Palace mega-container RETURNED (6 stops "within 300 m" incl. TIMED Chain Bridge 11:00, Parliament, Shoes on the Danube, **Buda Castle** — geographically false); Charles Bridge "discovered walk" groups the Jan-14 evening route the approved answer key explicitly leaves ungrouped AND absorbs Catacombs tour. The one SANCTIONED walk (Kafka/Lennon/Čertovka/Nový Svět) did not form — all four ship standalone | **FAIL** |
| Zero identity/booking values in public prose | P0 (3 leaks) | **rental-car prose scrubbed** (reservation 81486 public per CEO ruling — correct), FR8331 shadow activity GONE, zero identity shapes in any item/note prose (verified against unredacted records) | **PASS — first clean privacy run in 3** |
| Idea lists stay notes | 8 promoted + 2 loose tips | **still promoting**: Jan-21 Budapest 6/8 promoted (Great Synagogue, Konyv Bar, Mazel Tov, Ruszwurm, Pinball, Hilton wine cellar; gypsy music + Popped-up statue correctly noted); Vienna Friday trio (State Hall/Time Travel/Belvedere) shipped as Jan-18 activities INSTEAD of question #2; Ferris wheel + Hundertwasser cards (Jan-19 ideas); R2D2 card (doubt-marker "(far away)" ignored); Museum of Communism Jan-14 card (never-committed maybe); Hospital in the Rock card; embassy-rec promotions (Smart Kitchen, Szimpla Kert, Dohany, Gerbeaud, Pest-Buda-or-Pierrot lunch) | **FAIL — classifier centerpiece missed live despite fixture-green** |
| Question mix sane | 3, wrong mix | **9 questions**: castle ticket ✓ + baths ✓ (but offers "Budapest baths note" — Szechenyi was silently folded into Gellert and never named) + 7 off-contract: bogus Rome DATE question (Phase-2 family back), phantom-GOEURO departure time, rental-car travel-mode, separate St. Vitus question (violates Δ2 fold-into-one-castle-question), customer-contact-details question (RW-PRI-001 says identity scrub is automatic and final — never a maker question), booking-title question for receipt shards, planned-or-ideas mis-targeted at castle/KGB | **FAIL** |
| Wave wins hold | held | 5 stays clean w/ traveler_password ✓, provider FIELDS all clean (PB-5 FIXED: Delta/RegioJet/ÖBB/Wizz Air/RyanAir) ✓, 0 false P0 (5th run) ✓, counts unified ✓, 0 heading-fragment cards ✓, airport-prep folded ✓, St. Stephen's single Jan-20 card ✓, cost cards 0 ✓ | **mostly PASS** |

## Geocode verification lane (explicit check)

`usage.geocodeVerification` FIRED with **outcome "completed"**: budget 15,
lookupCount 15, resolvedCount 15, failedCount 0, candidateCount 44,
skippedOverBudgetCount 29. Three findings:

1. **Budget is materially binding** — 29/44 candidates skipped. If the lane is
   to arbitrate walks, 15 lookups don't cover this trip.
2. **Verified coordinates are INVISIBLE in the bundle** — zero
   `verifiedLatitude`/`verifiedLongitude` fields anywhere; lineage observation
   geo fields all null. The ledger says results attach with provenance and
   radius claims are verifiable from the bundle — this audit was structurally
   blind to them (the 7.17.2 geo-blindness shape, RW-AUD-001 gap).
3. **The lane's first live effect is implicated in the worst wrong group.**
   The Gresham call claims 6 stops "within 300 m of Gresham Palace's grounds"
   — Chain Bridge genuinely abuts Gresham, but Parliament (~700 m),
   Vorosmarty Ter (~450 m), and Buda Castle (across the river) do not, and
   NONE of them are "inside Gresham Palace's grounds" — this is a sequenced
   guided-day route, not a same-site visit. Trace hypothesis: compound
   slash-title observations
   ("Chain Bridge / Gresham Palace", "Castle Hill / Buda Castle") geocoded to
   the shared landmark token, converging members onto one point that then
   passed the precision gate with verified-coord authority. The timed-child
   guard passed because members share art_culture. Meanwhile the sanctioned
   Lesser Town walk never formed — so the lane delivered a false group and
   not the true one.

## Headline defects

- **PC-1 — Castle demoted by the classifier's planned-or-ideas hold (new
  mechanism).** The parser DID emit "Prague Castle" and "Prague Castle
  Changing of the Guard" as activity-kind observations (plus KGB ×2); lineage
  shows them merged ("same venue alias"), then held "as a city idea pending
  the maker's planned-or-ideas answer", then rejected into the canonical
  Prague note. The question's own evidence claims "Listed with prices/hours
  but no booking or times" — false: the guard change carries 12:00 PM (it
  survives as note prose), the day title commits the section ("Lesser Town &
  Prague Castle"), and "Prague castle (2 hours)" is a planned duration. The
  A-6 researched-list demotion (built to demote the Jan-21 idea list) is
  over-firing on committed day-plan content — whether via the recovered-line
  routing or the intake path needs a code trace (the lineage action label
  reads "recovered"). The orphaned ticket question + St. Vitus question +
  planned-or-ideas question are all shards of this one failure (3 of the 9
  questions).
- **PC-2 — Gresham mega-container returned via verified-coords proximity
  (see lane findings above).** Also a detector gap: no diagnostic fired on a
  6-member group whose members include another site container (Buda Castle)
  and a timed stop — the run5 "no wrong groups" calibration guards were
  satisfied by (unauditable) verified coords.
- **PC-3 — Idea-list promotion persists live (classifier centerpiece).**
  All six acceptance criteria were fixture-proven, but the live Jan-21
  section still ships 6/8 as dated cards. Divergence to trace: the live
  parse emits these as per-item activity observations with the source-section
  metadata that the fixtures modeled differently, OR the recovered/normal
  merge re-stamps commitment. PB-7 also failed live: Pinball Jan-21 + Jan-23
  both ship (7th run; the P1 detector catches it — the pipeline never
  consumed the signal), and Museum of Communism ships dated Jan-14.
- **PC-4 — Walking-tour receipt shards ship as 5 junk cards + a question**
  (Jan-15: "Adult 16+ x 1 x 395CZK", "TOTAL 395CZK", "Status: paid (PayPal)",
  "LivingPragueTours", "Restaurant Peklo" — the last absorbing the Prague
  Drinks city-note content into a tours_tickets card). Same family as run6's
  Skip-the-Line fix (that exact shape IS fixed) — the ticket-page predicate
  covers ticket-vocabulary titles but not receipt FIELD lines
  (quantity/total/payment-status/vendor-name). Old Town Square also ships
  standalone instead of folding into the tour ⊕.
- **PC-5 — Phantom GOEURO transport row** (Jan-24, provider "Österreichische
  Bundesbahnen AG", no times) minted from GoEuro receipt boilerplate — 9
  transport rows vs 8 real segments, plus a departure-time question. The
  no-anchor P2 fired honestly on it (and on FR8331 — that row is real but
  still anchorless, 2nd run).
- **PC-6 — koscom gone AND unflagged, 7th consecutive run — per-clause
  coverage did not protect it live.** "Get back by 5 to go to koscom and
  maybe communism museum": koscom appears ONLY in raw source text — not in
  cards, not in the 52 uncoveredLines. The communism-museum clause became a
  (wrong-dated, uncommitted) card; the koscom clause counts covered — trace
  whether the recovery stage's absorption credits the whole line or the
  clause splitter never saw it. PB-3's named acceptance case failed live.
- **PC-7 — Prague city-note content loss.** The Prague note carries ONLY a
  leaked lunch-menu fragment + castle shards. Country life, trdelník rec,
  Mistral Cafe, Malostranská beseda, Cafe Louvre, the soup note, Vaci-Utca
  anti-rec, langos recs, Buda Hills children's train: none exist anywhere
  (cards, notes, or uncovered flags). Recovery dropped 27 lines at the
  60-line cap (up from 2) — the cap is now a first-order content-loss driver.
  RW-EVD-001 exposure: meaningful lines with no disposition surface.
- **PC-8 — Answer-key deviations in otherwise-good areas:** Mumok ships alone
  while Natural History goes to notes (disjunction rule wants ONE card with
  the alternatives); baths question never names Szechenyi (folded into
  Gellert as "generic bath evidence"); Vienna note prose carries a dangling
  "St." (St. Stephen's fold residue); Delta 2934 lost its confirmation;
  Crown Jewels ships separate from Parliament; Tour Rome placeholder title
  carries "(or work)"; Hemingway Bar description duplicates its own sentence
  ("Hemingway Bar - 6 PM, 2 people" ×2 — merge-prose residue).

## What 7.21.0 proved works (keep)

Privacy wave END-TO-END on live data (identity scrub incl. colon-less/postal/
phone shapes, FR8331 shadow suppression, transport-confirmation scrub) — the
first fully clean prose run; provider-field repairs (PB-5) with the new P1
correctly quiet; Schönbrunn site↔component refusal + observation-title guards
(PB-2); St. Stephen's cross-day fold; baths slot override (day-title
commitment → question); collision auto-suppression (airport-prep folded, no
stay-collision noise); cost-card exclusion; heading fragments still dead;
0 false P0 (5th run); counts unified; recovery lane fail-soft mechanics; both
P1 detectors that fired were true positives.

## Audit-gap entries (RW-AUD-001) — automated-detector misses this run

1. No detector raises when a committed day-title entity (castle) exists only
   as note prose + questions (missing-committed-container family).
2. No detector challenges a same-site group whose members include another
   site container or exceed plausible radius — because verified coords are
   absent from the bundle, the claim is unfalsifiable downstream (bundle gap).
3. Receipt-shard cards raised no loose-tip/ticket-family P1s (only Borkonyha
   flagged); idea-list promotions raised zero flags this run (run6's
   converged detector caught 2).
4. identity_value_in_public_prose ran quiet — correct outcome, but the bundle
   carries no known-good-control emission, so "quiet because clean" vs
   "quiet because not wired" is not distinguishable from the bundle alone.

## Run-over-run (7.18.3 → 7.21.0, docket-based)

Activities 84→69 (junk shards down, but 15+ idea cards remain), groups 0→3
(1 right/2 wrong), questions 3→9 (mix worse), transport 8→9 (phantom),
stays 5→5, P0 prose leaks 3→0, false P0 0→0, provider-field corruptions 5→0,
koscom drop 6th→7th run, Pinball dup 6th→7th run, recovery dropped-at-cap
2→27.

## Decisions this audit queues for Eli (CEO)

- **Model A/B trigger**: parser drops persist (koscom never parsed — 7th run,
  Prague eat/drink recs never parsed, 52 residual uncovered, 27 dropped at
  the recovery cap) — but the two ship-bar breakers (castle demotion, Gresham
  group) are ASSEMBLY-side misfires on content the parser DID deliver. Evidence supports holding the A/B one more run while the
  recovery-classification + geocode-grouping defects are fixed; your call.
- **Extraction pinning** was queued for "immediately after 7.18.4 validates" —
  this run does not validate the floor.
- Recovery cap raise (OPENAI_RECOVERY_MAX_LINES) is now load-bearing (PC-7).
- Geocode budget (15) vs candidates (44), and bundle visibility for verified
  coords, before the lane arbitrates any more grouping.

Blind-first integrity: this audit was produced without sight of Eli's blind
list; his diffs land after, misses become audit-gap entries per protocol.

## Arc C fix status (2026-07-21, Claude/Cowork cloud session — implemented, awaiting validation run "7.21.1")

Reconciliation inputs: this blind audit + ChatGPT's independent audit (run
eb5cb832 report; its Klementinum/Colosseum, leg-less Vienna notes, Borkonyha
pair, and publish-gate-fails-open catches are folded in; its "sensitive
identifiers" finding is DECLASSIFIED per ledger Δ2 — tour/rental/city-pass
refs are public; its keep-St.-Vitus-question call contradicts Δ2 and was not
followed). Eli's blind diffs were deliberately skipped this round (CEO call)
and may still land as riders. Five commits, prefix-green (53 test files +
typecheck at every prefix), fixtures from exact live payload shapes:

1. GROUPING SAFETY (f7fe907) — radius rules trust only lane-verified
   coordinates once the lane ran (root cause: PARSER FABRICATED 3-decimal
   coords — not the lane; and candidate selection was skipping exactly the
   precise-looking records); passing mentions disqualify containers from own
   description; site-container pieces never join another site; walks exclude
   tours + source-narrated routes (Jan-14 answer key); budget 15→50;
   verified coords + provenance ride into the bundle.
2. CLASSIFIER INPUT REPAIR (bdca094) — committed-day-heading guard (castle),
   availability≠duration, meal-anchor-from-TITLE-only (Mazel Tov poison),
   day-level idea-list group keys (label fragmentation), question-subject
   aliasing guard (Gellert).
3. NOTE INTEGRITY + SHARDS + AFFINITY (682e088) — receipt-FIELD family dies
   at the parser-artifact layer (incl. the anchor-override resurrection via
   the word "paid"); admission evidence attaches by entity tokens, never
   date+time coincidence (Klementinum/Colosseum); recommendation prose can
   never be stripped from notes as record evidence (Prague recs); leg-less
   notes find their city from their own day heading (Eat/Buy-wine floaters).
4. TRANSPORT + QUESTIONS + COVERAGE + PUBLISH (1e3e494) — route-less
   time-less fragments never mint rows (GOEURO + its question); question
   gate v2 dismisses guessed-date/travel-mode/sensitive-details/receipt-
   identification families + Δ2 St.-Vitus-into-castle fold; coverage
   weak-credit tripwire + new P2 (koscom shape); recovery cap 60→120;
   publish warns-never-blocks (CEO decision).
5. PARSER EVIDENCE RETENTION (41211f9, ISOLATED for revert) — verbatim
   source excerpt required on untimed/unbooked cards; stamping judges the
   quote. The one model-behavior change; 7.21.1 partly exists to test it.

CONFIDENCE FLAGS (explicit 7.21.1 acceptance checks, not claimed fixes):
Prague note carries the eat/drink recs end-to-end; Pinball never-committed
repeat ships as ONE note, zero cards; evidence field comes back verbatim,
not paraphrase (paraphrase → strongest model-A/B argument yet); castle
GROUPS (⊕ + guard sub-stop) vs merely survives — parser variance decides;
Lesser Town walk forms under the raised budget; Vienna trio question #2
returns via retained evidence. CEO decisions this session: publish
warns-never-blocks; Δ2 privacy scope stands (ChatGPT finding declassified);
Jan-14 follows the answer key (may be amended later); budgets approved;
evidence retention approved; model A/B stays held. Recommended validation:
TWO extractions on the same build (7.21.1a/b) to measure parser variance
directly — decision pending.
