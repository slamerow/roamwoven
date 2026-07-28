# Arc G audit brief — prepared 2026-07-28, BEFORE the run

You are auditing the first live run on Arc G. This brief was written by the
session that BUILT Arc G, which makes it useful and biased in equal measure.
Read the next section before anything else.

---

## 0. How to use this document

**Score the run on its own telemetry FIRST.** Fetch the bundle, read the
numbers, and form a verdict before you read §6 (my expectations) or §7 (my
predictions). Those sections are a headwind: they describe what I *hoped*
would happen, and a session that reads them first will find them.

**If the run's own evidence contradicts anything here, THE RUN WINS and the
contradiction is the finding.** That is not a courtesy — the 2026-07-25
incident happened because a session reasoned impeccably from a stale premise
in these docs and swapped the OCR model, destroying a run.

Everything in §§1–5 is a fact about the code as committed, checkable in
source at the paths given. §§6–7 are expectations, and they are labelled.

**Read `docs/next-session.md` BEFORE re-deriving anything about grouping,
the ~300 m radius, Gloriette's ~800 m offset, or the geocode budget.** A
previous session burned most of a day re-deriving conclusions already
recorded there.

---

## 1. Retired premises — acting on any of these costs a run

1. **"Roll the OCR model back to `gpt-5.4-mini`."** FALSE and dangerous.
   `gpt-5.4-mini` is TEXT-ONLY (`lib/env.ts:18`); the OCR lane sends
   `input_image`/`input_file`, so on mini it extracts NOTHING. This was
   tried 2026-07-25 and destroyed a run. `gpt-5.6-luna` is the only
   vision-capable model configured. **Eli's standing decision: stay on
   luna.** Better OCR means a better VISION model, through
   `scripts/ocr-smoke-test.mjs` first.
2. **"`uncoveredLineCount` measures OCR loss."** BACKWARDS.
   `computeDaySectionSourceCoverage` walks the OCR OUTPUT, so a line OCR
   never read cannot appear in either the numerator or the denominator. It
   can only measure ASSEMBLY loss.
3. **"Batch size affects OCR yield."** Tested directly and disproven: a 4×
   change in pages-per-call moved yield 1.5%, below measured run-to-run
   nondeterminism. Don't touch `OPENAI_OCR_PDF_BATCH_PAGES` on a hunch.
4. **"GT ≈ 40 cards."** Superseded. **GT = 49 non-travel activity cards**,
   settled with Eli 2026-07-27 and confirmed by two independent derivations
   that reconcile (see the addendum in `docs/arc-g-scope-2026-07-27.md`).
5. **"A 500 storm means change the model."** No. During the 2026-07-25
   OpenAI outage, mini and luna failed identically 500 ms apart.

**The rule behind all of these:** before citing any telemetry number against
a baseline, verify BOTH numbers were measured the same way. It is not "OCR
alarms are probably artifacts" — luna's transcription quality is a REAL and
OPEN defect ("Josefov" → "Joselov" is a character-level misread nothing else
explains).

---

## 2. Run identity — verify before scoring anything

| Check | Where | Expected |
|---|---|---|
| Deploy commit | Vercel deploy / `git log` | `0077c3a` (or later). If it is `84b8676` or `c15d879`, the run is missing Arc G fixes — say so and stop. |
| OCR model | `materialPipeline.checkpoints[0].metadata.model`, `ocrBatches.rows[*].model` | `gpt-5.6-luna` on every batch |
| Extraction / recovery model | run telemetry | `gpt-5.4-mini` |
| `OPENAI_OCR_MODEL` | must not exist in Vercel | absent (production resolves to the code default) |
| Geocode lane | `usage.geocodeVerification.outcome` | `completed`. `disabled` means the API key is missing and ALL of G.3a is untested. |

**Fetch procedure** (unchanged, it works): in-page fetch of
`/maker/trips/<tripId>/data/audit/qa-bundle?includePrivate=1` through Eli's
logged-in Chrome, render into the DOM and read with `get_page_text` in ≤45 KB
slices, verify sha256 in-browser. The Chrome extension may reject the first
`navigate` — ask Eli to approve rather than retrying.

---

## 3. What Arc G changed (3 commits, all fixture-tested, none run before)

- **G.1 — note anchoring** (`draft-to-structured-trip.ts`). Trip range is
  spine-anchored (legs/transport/stays define the window). Day records are
  filtered to that range — this is where run 7.26.1's "16 days" actually came
  from, since the day list is built from item dates. Notes are no longer
  structurally unflaggable: an undated city note stays a clean draft, a note
  dated OUTSIDE the trip range is `needs_review`.
- **G.2 — transport field repair** (`lib/extraction/transport-field-repair.ts`,
  new). A type-incompatible endpoint (bare IATA code on train/bus/ferry, rail
  station on a flight) and `arrivalTime == departureTime` are repaired from
  the matching source anchor. A repair requires CORROBORATION (departure
  time, confirmation, or transport number) and one agreed value across all
  corroborating anchors; otherwise the value is cleared and one typed
  question is raised.
- **G.3a — geocoder formatted address** captured and used for same-site
  membership; container tokens filtered of generic site nouns and city names;
  confirmed members with verified coordinates may extend the site footprint
  (cap 1.2 km).
- **G.3b — grouping claim ledger** (`lib/extraction/grouping-claim-ledger.ts`,
  new). Lane contention is arbitrated by claim strength, not statement order.
- **Pre-flight** — geocode candidate ranking: 0 containers, 1 same-site
  companions, 2 area-labeled crowded-day members, 3 the rest. This roughly
  DOUBLES lookups (measured 20 → 41 on a trip-shaped corpus) and makes the
  budget cut deliberate rather than alphabetical.

**Explicitly OUT of Arc G** (Eli's call — do not score these as failures,
do not burn run budget on them): debris routing (~9 cards) and the
idea-vs-plan demotion lane (~10 cards). Together they are most of the gap
between the expected landing zone and GT 49.

---

## 4. Read these NEW telemetry fields FIRST

Before scoring cards, read these four. They tell you whether Arc G's
mechanisms even fired, which changes what every downstream number means.

| Field | Where | How to read it |
|---|---|---|
| `geocodeVerification.formattedAddressCount` | `usage.openai.geocodeVerification` | **0 = the address path never fired**, and every G.3a grouping conclusion is void. Non-zero = addresses were captured; then check whether they name the site. |
| `geocodeVerification.skippedOverBudgetCount` | same | Large (say >40) means the 50-lookup budget is now the binding constraint. That moves the budget conversation from Arc H to now. |
| `evidence.groupingClaims` | run summary | `{claimedPieceCount, claimsByLane, contestedPieceCount, releasedDecisionCount}`. `claimsByLane.walk > 0` on **Jan 22** is a REGRESSION (see §5). `releasedDecisionCount > 0` means a same-site decision was abandoned and gave its pieces back. |
| `canonicalization.transportFieldRepairCount` + `usage.openai.transportFieldRepairs` | audit report / usage | Each entry has `outcome`. `repaired_from_source_anchor` = working as designed. **`cleared_pending_review` = the anchor join failed** — that is a lead worth tracing, not a success. |

Also new: a recovery action shaped
`cleared_impossible_transport_<field>_without_question:<route>` means the
RETRY lane cleared a transport value where it could not raise a question.
Rare; if present, trace it.

---

## 5. The audit bar

### MUST PASS (fixed — a miss here is a real defect)

1. Run completes. No `assembly-recovery-required`. (An independent audit
   concluded Arc G cannot cause this; if it happens anyway, that conclusion
   is wrong and the trace is the finding.)
2. Spine: **5 legs / 8 transport rows / 5 stays**. This has been GT-exact for
   8 consecutive runs; a regression here is serious and Arc G touched the
   spine's date derivation.
3. **Trip header reads January 12–25, 2019, and the trip is 14 days.** Not
   2018, not 16 days. This is G.1's whole purpose.
4. **Zero transport questions**, and the two train rows read
   `RegioJet → Wien Hbf 13:23` and `ÖBB → Budapest-Keleti 13:19`. This is
   G.2's whole purpose.
5. **No group on Jan 22.** The key says that day ships as 10 individual
   cards. Both lanes must be silent. See the trap below.
6. Privacy clean: zero PROTECTED-class code tokens in public prose. **Apply
   Δ3 BEFORE scoring this** — seat numbers, seat class, route endpoints and
   clock times are PUBLIC; only confirmation/booking/ticket codes are
   protected.
7. No wrong groups anywhere. A wrong group is worse than a missing one.

### TARGETS (Arc G's reason for existing — score, don't panic)

- Schönbrunn Palace parent with **all 5 sub-stops** (Gloriette,
  Orangeriegarten, Palm House, Apple Strudel Show, Panorama Train).
  Baseline was 2. Anything ≥4 is real progress; 6 is the bar Eli set.
- Prague Castle groups at all.
- The Jan-15 walking tour groups at all.
- Malá Strana able to form.
- Notes down from 5 toward GT 3, with the two 2018 notes flagged rather than
  silently shipped.

### EXPECTED, NOT A FAILURE

- **Card count lands around 65–69, not 49.** Debris routing and demotion are
  out of scope. A number near 49 would mean something unexpected happened —
  investigate it rather than celebrating it.
- Open questions above GT 3 for non-transport reasons (the researched-list
  and baths questions are legitimate; junk-shaped ones are the demotion
  lane's fault, not G's).

### THE TRAP — read before touching any constant

`CROWDED_DAY_VISIBLE_CARDS` (currently 6) fires the walk lane, and **current
card counts are inflated by missed demotion** — Jan 19 showed 12 cards where
the key says 2. **Do not calibrate that constant against this run's counts.**
You would be fitting to a defect.

Jan 22 is the specific guard case: 12 observed cards, GT says 10 individual
cards and NO grouping. In the fixtures it is blocked by the ≥3-timed gate AND
by real coordinates putting Buda Castle ~790 m from Fisherman's Bastion. If
the live run demotes enough of that day to drop below 3 timed cards, the first
gate disappears. Check `groupingClaims.claimsByLane.walk` for Jan 22
specifically.

---

## 6. Baseline for every delta (run 7.26.1, VERIFIED from its bundle)

| Metric | 7.26.1 | GT |
|---|---|---|
| legs / transport / stays | 5 / 8 / 5 | 5 / 8 / 5 |
| active activities | 75 | 49 |
| open questions | 11 | 3 |
| dismissed questions | 0 | — |
| grouped stops | 2 | 14 sub-stops under 4 parents |
| calls | 1 | 1 |
| notes | 5 | 3 |
| geocode cand / resolved / failed / skipped | 83 / 45 / 5 / 33 | — |
| residual uncovered lines | 32 | — |

Known-broken and DEFERRED — do not re-audit, do not burn budget:
debris cards (~5), city-note demotion (~9 cards), description-demotion (~3),
stay-detail (~1), Matthias Church absent (only its URL survived), Vörösmarty
Ter and Koscom absent, Rome has no city note in the key though the pipeline
emits one.

---

## 7. My predictions — READ LAST, and treat as a headwind

Stated with confidence and what would falsify each, per AGENTS.md rule 4.

1. **G.1 lands. Confidence 9/10.** The trip header reads Jan 12–25 and 14
   days. Falsified by: any 2018 date surviving into `trip.startDate`, or a
   day count ≠ 14. Cost if wrong: low, it is a projection-level fix with
   direct fixtures.
2. **G.2 lands. Confidence 8/10.** Zero transport questions and both train
   rows GT-exact. The risk is the anchor join: if `transportFieldRepairs`
   shows `cleared_pending_review`, corroboration failed and the two rows lose
   their arrival values instead of gaining correct ones — visible, not
   silent. Cost if wrong: two cards ship incomplete plus two questions.
3. **Schönbrunn at 6 stops. Confidence 5/10 — the weakest claim here.** It
   requires the five components to be geocoded AND their formatted addresses
   to contain "Schönbrunn". I fixed candidate selection for the first
   condition; I have no evidence at all about the second, because no run has
   ever captured a formatted address. `formattedAddressCount` is the tell.
4. **No group on Jan 22. Confidence 8/10.** Two independent gates. Falsified
   by any parented piece on Jan 22.
5. **Card count 65–69. Confidence 6/10.** Wide because grouping folds an
   unknown number of stops into parents and the demotion lane is untouched.

**Where I am most likely to have fooled myself:** every grouping number above
comes from fixtures I wrote, using coordinates and Google-shaped addresses I
chose. The live parser's titles, categories and section labels are what
actually decide membership. If Schönbrunn still groups 2 stops, the most
probable explanation is not a bug in the ledger — it is that the components
were never geocoded, or their addresses do not name the estate.

---

## 8. Output of the audit

- Docket at `docs/assembly-defect-docket-2026-07-28-run-<version>.md`,
  following the existing dockets' shape: chains, each with evidence quoted
  from the bundle, each marked VERIFIED or HYPOTHESIS.
- Update `docs/next-session.md` with a new top entry.
- If a run finding changes a locked contract, update the ledger entry, its
  decision date, its supersession note and its coverage mapping **in the same
  change** (AGENTS.md §Product-contract preflight).
- Arc G touched RW-SRC-001, RW-GRP-001 and RW-PLC-001. All three are
  `PARTIAL` and say so because no live run had exercised them. If this run
  exercises them, that coverage state should be revisited honestly —
  including downgrading to `KNOWN_GAP` if the run shows the contract is
  violated.
