# Run 8.1.0 audit — the castle fix fired and was eaten one stage later; grouping regressed

Trip `4eaf3c6c-f480-442b-8301-c425a032cb87` ("8.1.0"), run completed
2026-07-31T23:04:36Z, model `gpt-5.4-mini`, parse key `a3e0ab66b05aa90e…`.
Input: `docs/run-2-work-order-tasks-1-3-2026-07-31.md`.

Per AGENTS.md rule 7(c) every claim is VERIFIED (with its artifact) or labelled
HYPOTHESIS. Artifacts are the QA bundle
(`/data/audit/qa-bundle`), the full audit payload (`/data/audit/payload` — 215
lineage rows, vs the bundle's 120; see §5), repo source at HEAD `80e2b38`, and
`docs/assembly-ground-truth-central-europe.md`.

---

## 0. Verdict

**Task 2's rescue fired. It was defeated one stage later by a different lane, so
the TARGET is missed for the third run running — for a third distinct cause.**
Tasks 1 (held), 3 and 5 behaved as designed. Task 5 half-landed.

**And the run broke a MUST HOLD that has held since the collapse: `no wrong
groups`.** Grouped stops went 2 → 7, but two of the seven are venues the
approved ground truth files as Vienna city-note *ideas*, roughly 4.8 km from
Schönbrunn. Under Eli's standing ruling — a wrong group is worse than a missing
one — this run is a net regression on grouping, not a net gain.

The two headline causes are independent and neither is in the code Task 2
touched:

- **A.** `collapseAlternativeSlotCards` merged the rescued dated Prague Castle
  container INTO `Changing of the Guard`, one of its own sub-stops. The
  container is gone from the draft. (§3, VERIFIED)
- **B.** G4.3's retry-with-container-context resolved five venues to the
  Schönbrunn Palace centroid and three to the Prague Castle centroid. Two of
  the Schönbrunn five are not at Schönbrunn, and the resulting
  geocoder-supplied ADDRESS then admitted them to the site visit through the
  *source-hierarchy* path — which is uncontestable and which makes the
  maker-facing Call text a false statement. (§4, VERIFIED by elimination)

**Do not re-open the reclassification lane (Task 2). It did its job.** The
evidence is in the lineage: the Prague Castle observations now arrive as
`role: atomic_candidate` with `date: 2019-01-16`, not `context`, and the
geocode lane saw a dated Jan-16 container for the first time (`retryCount` 0 →
9, two of them keyed on `Prague Castle`). Everything after that is downstream.

---

## 1. Did each shipped change fire?

The work order §1 named the tell for each. All four readings, taken from
telemetry rather than the console (rule 2):

| change | expected tell | reading | verdict |
|---|---|---|---|
| Task 1 (HELD) | `extractionSampling.sent` = `{}` | `{resolved:{}, sent:{}, liveCallCount:33, replayedCallCount:0, strippedCallCount:0}` | **HELD correctly.** The ops step ran; the two env vars are gone; the plumbing reports honestly on a run where it changes nothing. Task 1's control reading is clean. |
| Task 2 | a dated Jan-16 Prague Castle card, grouping-container ELIGIBLE | rescue fired (role `atomic_candidate`, date `2019-01-16`); **no castle card in the draft** | **FIRED, then defeated.** §3 |
| Task 3 | `stays` = 5, no stay with `checkInDate 2019-01-12` | 5 stays; `The Yellow` 01-13→01-14; `Rome Stay` gone; Jan-12 night still carried by the overnight Delta 19:46→10:15 | **LANDED.** No fabricated transit night. |
| Task 5 | `audit.lineage.rows[].observations[].verifiedLatitude` non-null for Schönbrunn and Gloriette | fields present and populated (69 venues in the payload) — but **absent for both named venues in the served bundle** | **HALF-LANDED.** §5 |

Task 4 was docs-only and is in the tree; §7 records a new contradiction it did
not cause but now sits next to.

---

## 2. Bar scoring

**MUST HOLD**

| Item | Result |
|---|---|
| Run completes | PASS — `status: completed`, all 14 stages |
| 5 legs | PASS — 5 |
| 8 transport | PASS — 8 |
| 5 stays | **PASS — 5** (was 6; Task 3) |
| No wrong groups | **FAIL — 2 of 7 wrong** (§4) |

**MUST IMPROVE**

| Item | Result |
|---|---|
| `skippedOverBudgetCount` 0 | PASS — 0 |
| No two venues sharing a verified coordinate | **FAIL — and now genuinely checkable.** 10 coordinate collisions; 8 are benign spelling aliases of one venue; 2 are distinct venues collapsed onto a container centroid (§4). |
| All four telemetry fields present | PASS — `formattedAddressCount`, `localityRejectedCount`, `retry*`, `candidates[]` all present |
| Zero literal-`null` start times | PASS — 0 |

**TARGET: Prague Castle groups with ≥2 sub-stops — MISSED** (§3).

**Regression not previously on the bar:** grouped stops 2 (both correct) → 7
(five correct, two wrong).

Geocode lane, for the record:

```
budget                        150      candidateCount   122     lookupCount    131
skippedOverBudgetCount          0      failedCount        0     resolvedCount   91
formattedAddressCount          91      localityRejectedCount     32
retryCount                      9      retryAcceptedCount 9     retryOutOfCityCount 0
outcome                  completed     groupingClaims  same_site 8, walk 0, contested 0
```

`lookupCount 131 = 122 candidates + 9 retries` — arithmetic checks out.
**G4.3 executed for the first time**, which was the run's second question, and
it is also the run's second defect (§4).

---

## 3. Root cause A — the rescued container was eaten by the near-identical collapse

**VERIFIED, artifact: audit payload lineage rows 33 and 40.**

```
row 40  "Prague Castle visit"   2019-01-16   status suppressed   outputEligible false
        actions: merged <- ["Prague Castle"]   "same named plan"
                 merged <- ["Prague Castle"]   "same named plan"
                 rejected <- []  "same plan described twice on one day:
                                  near-identical descriptions collapse to one card"

row 33  "Changing of the Guard" 2019-01-16   status compiled     outputEligible true
        actions: attached <- ["Decision for Changing of the Guard"]
                 merged   <- ["Prague Castle"] x2
                 attached <- ["Prague Castle visit"]  "same plan described twice on
                              one day: near-identical descriptions collapse to one card"
        observations: Changing of the Guard (Wednesday, January 16th)
                      Decision for Changing of the Guard
                      Prague Castle visit  2019-01-16  atomic_candidate
                      Prague Castle        2019-01-16  atomic_candidate
                      Prague Castle        2019-01-16  atomic_candidate  <- dated day section
```

The container did not lose its date and did not lose its role. It lost a merge.
`collapseAlternativeSlotCards` Pass 1 (`lib/extraction/evidence-clustering.ts`
:6878) picked the timed sub-stop as the winner and folded the site container
into it. **The site's own card is gone from the draft** — Jan 16 ships ten
cards, none of them Prague Castle — and a 12:00 guard-changing ceremony now
carries the castle's evidence, its date, and one of its ticket questions.

This is the exact mechanism the code's own comment two lines above the guard
warns about — live-run 7.18.3 PB-2, *"'Palm house at Schonbrunn' beat
'Schonbrunn Palace visit' here and the palace was deleted downstream"* — and
the guard that exists to stop it, `isSiteComponentTitlePair`
(`activity-classifier.ts:126`), **cannot fire here**: it recognises a component
only by the title shape `"<X> at <Site>"`. `Changing of the Guard` has no
`at <site>` tail, so the pair is judged as two ordinary cards.

**Why the suite stayed green.** `tests/site-container-survives-rejected-grouping
.test.ts` does include a `Changing of the Guard` sibling — but that fixture
gives it a title and a `startTime` and **no description**. Pass 1 bails at
`if (leftDesc.length < 4 || rightDesc.length < 4) continue`, so the collapse is
never reached and the test passes without ever exercising the lane that
actually killed the card. The negative controls are sound; the positive case
stops one stage short of production. Fixture-green, never sufficient (rule 1).

**Blast radius, in hindsight (rule 8(a)).** The work order §4 identified Task 2
correctly as a classification-gate change and then offered "the whole suite is
green unchanged" as the evidence it does not widen. The question rule 8(a)
actually asks is *who consumes the new value* — and the answer was a lane no
existing test reached, because until this change dated site containers never
arrived at `collapseAlternativeSlotCards` as candidates at all. They were
`context`. Task 2 created a new population for that pass and nothing measured
what it would do with them.

**Consequences, all mechanical and all visible in this run:**

1. no dated castle card → the TARGET cannot be met, again;
2. `recoverMissingNamedEvidence` still finds no live piece for the ticket
   question and synthesizes placeholders — **two of them this run**
   (`Prague Castle visit` and `Prague Castle`, both `date: null`,
   `legId: null`), where run 2 had one. `activePlaceholders` is 4, half of it
   castle;
3. the question half of Eli's 2026-07-28 ruling is further from settled, not
   closer. Three castle-ticket questions still ship — and one of them now hangs
   off `Changing of the Guard`, a card that is not the venue the decision is
   about. The work order §6 pinned "three questions" as a characterisation
   assertion; the count is unchanged, the subjects are worse.

**Deferred item that turned out to be load-bearing.** Work order §8 predicted
that with both castle pieces surviving as real candidates "the existing
near-identical collapse ladder should merge them" and said to look at that
ladder only "if the next run ships two castle cards". It shipped *zero*, and
the ladder is the cause. The prediction had the right lane and the wrong
direction.

---

## 4. Root cause B — G4.3's retry manufactures container centroids, and the address path launders them into source hierarchy

### 4a. What shipped

**VERIFIED, artifact: `records.items` parent/child links and
`docs/assembly-ground-truth-central-europe.md` lines 174–184.**

`Explore Schönbrunn Palace` (2019-01-19) shipped with seven children:

| child | ground truth |
|---|---|
| Gloriette | ✅ sub-stop |
| Orangeriegarten at Schönbrunn | ✅ sub-stop |
| Palm House at Schönbrunn | ✅ sub-stop |
| Apple Strudel Show | ✅ sub-stop |
| Panorama Train pass | ✅ sub-stop |
| **Ring Tram Tour** | ❌ *"Everything else on the day (… Museum of Illusions, …, Ring Tram Tour, …) → **Vienna city notes** (ideas)"* |
| **Museum of Illusions** | ❌ same line |

The ground truth is explicit and names both by name. Five correct, two wrong.

### 4b. Where the wrong coordinates came from — VERIFIED

All nine G4.3 retries, from `geocodeVerification.candidates[]`:

```
Apple Strudel Show, Vienna      >> Apple Strudel Show, Schönbrunn Palace
Apple Studel Show, Vienna       >> Apple Studel Show, Schönbrunn Palace
Museum of Illusions, Vienna     >> Museum of Illusions, Schönbrunn Palace     x2
Panorama Train pass, Vienna     >> Panorama Train pass, Schönbrunn Palace
Ring Tram Tour, Vienna          >> Ring Tram Tour, Schönbrunn Palace          x2
Changing of the Guard, Prague   >> Changing of the Guard, Prague Castle
Trdelník for breakfast, Prague  >> Trdelník for breakfast, Prague Castle
```

Every one accepted (`retryAcceptedCount 9`, `retryOutOfCityCount 0`). The
resulting verified coordinates:

```
48.1858124,16.3127641  <- Schönbrunn Palace, Apple Strudel Show, Apple Studel Show,
                          Panorama Train pass, Museum of Illusions, Ring Tram Tour
50.0910966,14.4016165  <- Prague Castle, Changing of the Guard, Trdelník for breakfast
```

**When the retry query names a venue the container does not contain, Google
returns the container.** Museum of Illusions is at Wallnerstr. 4, 1010 Wien —
**4.81 km** from the point it was assigned. The Ring Tram runs the Ringstraße —
**~4.6 km** away. `Trdelník for breakfast` is a street pastry; a second
`Trdlnik for breakfast` card on the same day resolved 1.2 km away, to itself.

This is the same false-verification class G4.2 was built to kill — run 7.28.0's
three venues all wearing the Prague centroid — returning through the retry
lane. `retryOutOfCityCount 0` gives false comfort: the acceptance test asks
whether the answer is in the right city, and a container centroid always is.

### 4c. How a wrong coordinate became *source hierarchy* — VERIFIED by elimination

The maker-facing Call reads:

> "same-site visit: **the source lists 7 stops** inside Explore Schönbrunn
> Palace's own visit, so one visit card owns them"

Per `sameSiteClaimText` (`evidence-clustering.ts:8612`) that exact wording is
emitted only when **`geoChildCount === 0`** — i.e. the code believes *none* of
the seven came in by radius and *all seven* were placed inside the visit by the
source. That is false: the container's own description lists five.

```
"Schonbrunn Palace (free- 17.50) Explore Schönbrunn Palace visit with related
 options listed in the source: Gloriette, Orangeriegarten at Schönbrunn,
 Palm house at Schönbrunn, Apple Strudel Show, and Panorama Train pass."
```

`hierarchyMember` (`:8436`) has exactly four paths. For `Museum of Illusions`
and `Ring Tram Tour`:

1. `containerListsComponent(description, title)` — needs an exact or prefix
   segment match; neither title appears in the description. **No.**
2. child title contains the container's full title. **No.**
3. child title contains a `siteIdentifyingTokens` token (≥5 chars, not a
   container noun, not a trip city — i.e. `schonbrunn`). **No.**
4. `addressNamesSite(pieceVerifiedAddress(piece), tokens)` — substring match of
   `schonbrunn` against the **geocoder-supplied `verifiedFormattedAddress`**.
   The only path left.

Path 4 is therefore the admitting path. The one link I cannot read directly is
the address string itself: `verifiedFormattedAddress` is not projected onto any
served surface — **the fifth instance of the whitelist-drop class**, after
`formattedAddressCount`, `excludedPlanningCostLineCount`, `extractionSampling`
and the Task 5 geo fields, and the only one of the five that decides grouping
membership. Given a verified point at the Schönbrunn Palace centroid, the
address naming Schönbrunn is not a real doubt, but rule 7(c) says label it:
**HYPOTHESIS on the address text; VERIFIED on the elimination.**

**Why this is worse than an ordinary radius mistake.** Membership strength is
recorded as `hierarchy`, not `geo`, and:

- `contestable()` (`:8624`) releases **only** `strength === "geo"` members, so
  the walk lane can never take these two back. The wrong members are locked in.
- the maker is told the *source* placed them there. The `SiteDecisionState`
  comment says a claim that misstates its own membership "is a lie in the
  product, not just a stale variable". It is currently misstating it.
- footprint extension compounds it: the base radius is
  `SAME_SITE_RADIUS_KM = 0.3`, but a confirmed member at 0.89 km (Gloriette)
  stretches `footprintKm` toward the `SITE_FOOTPRINT_MAX_KM = 1.2` ceiling, so
  the next borderline venue is easier to admit — and hierarchy members are what
  stretch it.

**Loop, stated plainly:** the retry injects the container's name into the query
→ the geocoder returns the container → the container's name appears in the
child's address → the address is read as the source placing the child inside
the container. Each step is individually defensible. Together they let a lane
confirm its own premise.

---

## 5. Task 5 — the fields landed on the rows that did not ship

`createAuditSummary` (`trip-extraction-qa-bundle.ts:611`) reads:

```js
report?.lineage.filter((row) => row.status !== "compiled").slice(0, MAX_LINEAGE_ROWS)
```

215 lineage rows: **95 `compiled`, 115 `suppressed`, 5 `missing_from_structured`.**
The filter drops all 95 compiled rows; 120 remain, under the 150 cap, so the
cap never bites — yet `truncated` is computed as `215 > 150` and reports
**`true`**, describing a truncation that did not happen while saying nothing
about the status filter that did.

Consequences:

- Task 5's own stated proof — *"`verifiedLatitude` non-null on the next run's
  bundle for Schönbrunn and Gloriette"* — **is not satisfied in the bundle.**
  Both rows are `compiled`, so both are filtered out. The fields are populated
  (I read them from the payload), but not where the work order said to look.
- the MUST-IMPROVE coordinate check, scored from the bundle, runs over
  *suppressed evidence only* — the wrong population. From the bundle it finds
  one collision; from the payload, ten. **Both of the genuinely wrong ones are
  invisible in the bundle.**
- rule 8(b) again, one layer further out: the field reached a served surface,
  but not for any record that ships.

Not a reason to revert anything. It is a reason not to score the bar off the
bundle until the projection covers compiled rows.

---

## 6. Ops discrepancies — both verified from telemetry, both cheap, both would cost a session

**1. `EXTRACTION_PIN_REUSE` is OFF in production.**

```
model_extraction.details.pinning =
  { hits: 0, misses: 65, reuse: false, write: true, saved: true,
    parseKey: "a3e0ab66b05aa90eb4edd61b8e5f42c2579eb4241fec87c0c0f76b4e4df12a0f",
    samplingParams: {}, seededEntryCount: 0 }
```

`reuse` reads `process.env.EXTRACTION_PIN_REUSE` directly
(`extraction-pinning.ts:127`). The run-2 handoff §Task 3b says Eli set it to
`true` on 2026-07-28; the work order §7 states both flags "are both already ON
in production, so the loop needs no env change"; the §1 pre-flight says to
confirm both from run 2's telemetry. Nobody did, and it is off. **Write is on
and a valid pin was saved** — the corpus is no longer empty — but in-app replay
will not happen until the var is set.

Undo/redo, per rule 6: Vercel → Production → set `EXTRACTION_PIN_REUSE=true`,
redeploy; verify on the next run from `pinning.reuse` and a non-zero `hits`;
undo is deleting the var. Note it is genuinely a *choice*, not an oversight to
reflexively fix — reuse must be OFF when the thing under test is extraction
itself.

**2. The replay command in the work order is wrong.** §7 gives:

```
node scripts/replay-pinned-parse.mjs <parseKeyPrefix>
```

The script's own header (`replay-pinned-parse.mjs:5`) takes **two** arguments:

```
node scripts/replay-pinned-parse.mjs <tripId> <parseKeyPrefix>
```

**3. The replay's limit matters more this round than last (rule 7(a)).**
`replay-pinned-parse.mjs:14` disables the geocode lane, "so verified-coordinate
grouping can differ from the live run". Root cause A (§3) is pure assembly and
**is** replayable against pin `a3e0ab66…`. Root cause B (§4) runs through
`verifiedFormattedAddress`, which only exists when the lane runs — **a replay
cannot validate the wrong-group fix, and a replay that shows a clean Schönbrunn
group proves nothing about it.**

---

## 7. Corrections the record needs

**1. The work order contradicts itself on RW-GRP-001, in the same document.**
Its header and §8 bullet 2 both record `KNOWN_GAP → PARTIAL` on Eli's
2026-07-31 decision (ledger v24); §8 bullet 3 says the question is "deferred to
the next run's evidence, so it stays `KNOWN_GAP`". `docs/product-contracts.md`
is at v24 with `Enforcement: PARTIAL`, so the ledger and the header agree and
bullet 3 is the stale line. Worth deleting rather than leaving for a future
session to re-litigate a fourth time.

**2. That coverage state now needs Eli's decision again, on worse evidence.**
v24's justification is, verbatim, "2 grouped stops, both correct, ZERO wrong
groups". This run produced two wrong groups, and AGENTS.md defines `KNOWN_GAP`
as "current behavior is known to violate the contract". RW-GRP-001's contract
says a mixed-geography list stays individual cards; a 4.8 km outlier inside a
palace visit is that. **My reading is that this returns RW-GRP-001 to
`KNOWN_GAP`** — but per the standing rule it is Eli's explicit call, not mine,
and I have not touched the ledger.

**3. `docs/assembly-ground-truth-central-europe.md` line 178 is now doubly
load-bearing** and should be cited in whatever fixes §4: it names Museum of
Illusions and Ring Tram Tour as city notes, and the Jan-19 disjunction as
"Mumok *or* Natural History". This run instead produced a lineage row titled
`Palm House at Schönbrunn or Museum of Illusions` (suppressed, context) — the
model built a disjunction the ground truth does not have, pairing a real
sub-stop with a city-note idea. That is probably where the Museum of Illusions
association starts, and it is worth one look at the parse before assuming §4b
is the whole story.

**4. Not a defect, recorded so it is not rediscovered:** `p1
duplicate_same_venue_activity` fires on `Pinball Museum` ×2, and Jan 16 ships
both `Trdlnik for breakfast` and `Trdelník for breakfast`. The collapse ladder
deleted a site container while leaving two spelling-variant duplicates of a
pastry standing on the same day. Same lane, opposite error, same run.

---

## 8. Next round — work order

Run budget: **one live run**, and only after both fixes below are replay-validated
where a replay can validate them (§6.3).

### Task A — stop the collapse from eating site containers (blocks the TARGET)

`collapseAlternativeSlotCards` Pass 1 must refuse a pair where one side is a
`SAME_SITE_CONTAINER_PATTERN` container with a real date and the other is a
same-day piece — the same predicate Task 2 used, so the container definition
cannot drift between the reclassification lane and the collapse lane. Widening
`isSiteComponentTitlePair` is the wrong shape: the bug is not that the sibling
is a component, it is that the *container* is a container.

Blast radius before editing (rule 8(a)): `collapseAlternativeSlotCards` is what
keeps the 7.18.1 four-cards-for-one-lunch defect closed, and Pass 2 depends on
Pass 1's survivors. The negative controls that must still pass are in
`tests/assembly-ground-truth-run6.test.ts:368` and the existing
`generic-placeholder-stay` / question-gate fixtures.

Fix the test at the same time: give the `Changing of the Guard` fixture in
`tests/site-container-survives-rejected-grouping.test.ts` a real description, so
the case reaches Pass 1 at all. Prove it both directions — with the new guard
disabled, the fixture must fail.

Replayable against pin `a3e0ab66…`. **Do not spend a live run to learn this.**

### Task B — break the retry→address→hierarchy loop (fixes the MUST HOLD)

Three candidate cut points; they are not exclusive, and B1 is the one I would
ship first.

- **B1. Do not let a retry answer BE the container.** If the retry result's
  coordinate is within ~50 m of the container's own verified coordinate, treat
  it as unresolved rather than accepted. Cheap, deterministic, and it is the
  step where the false fact is created. Telemetry: a new
  `retryContainerCentroidRejectedCount`, which must be > 0 on the next run for
  the fix to be observable at all (rule 8(b)).
- **B2. A retry-derived address is not source hierarchy.** `hierarchyMember`'s
  address path should not count a `verifiedFormattedAddress` produced by a
  retry whose query injected the container title — that is the system reading
  back its own input. Requires carrying a `retryDerived` flag to the piece.
- **B3. Whatever else changes, the claim text must stop lying.** If a member
  came in by address rather than by the container's description, it is not "the
  source lists N stops". Either count address-derived members separately in
  `SiteDecisionState`, or classify them as `geo` so they are at least
  contestable by the walk lane.

**NOT replayable** (§6.3). This is what the live run is for.

### Task C — project the compiled rows (unblocks scoring, not a fix)

Include `compiled` rows in the QA-bundle lineage projection, or add a separate
projection for them, and fix `truncated` to describe what was actually dropped.
Until then the coordinate bar item is scored off the wrong population, and
`verifiedFormattedAddress` — the field §4c turns on — reaches no surface at all.
Adding it is a one-line change to the same whitelist and would have made §4c
VERIFIED instead of eliminated-to.

### Task D — the sub-stop question subject, unchanged from work order §6

Still the highest-value item after A and B, still precisely located
(`relatedCanonicalPieceId: null` on sub-stop questions), and now with a third
castle question attached to the wrong subject. Do not ship it beside A and B —
that is a third variable in one run.

### Held, deliberately

**Task 1 stays held for one more run.** This run is not a clean comparison for
anything: the collapse defect and the retry defect both moved output. Re-add
`OPENAI_EXTRACTION_SEED=7` / `OPENAI_EXTRACTION_TEMPERATURE=0` only when a run
lands whose assembly is otherwise unchanged — and note that setting them
changes the parse key, which invalidates pin `a3e0ab66…` and the replay loop it
just made possible. Sequence matters: replay-validate Task A first, then decide.

### What proves each change fired, next run

| change | tell |
|---|---|
| Task A | a dated Jan-16 `Prague Castle` card in `records.items`, and it is grouping-container eligible |
| Task B | `Museum of Illusions` and `Ring Tram Tour` NOT among `Explore Schönbrunn Palace`'s children; no distinct venues sharing `48.1858124,16.3127641`; `retryContainerCentroidRejectedCount > 0` |
| Task C | `audit.lineage` includes rows with `status: "compiled"`; `verifiedLatitude` non-null for Gloriette **in the bundle** |
| Task 1 (held) | `extractionSampling.sent` = `{}` — the control reading, again |

Then, in order, the run's real questions: does the castle card carry ≥2
sub-stops (`groupedStops` gains Prague)? Is the Schönbrunn group back to five
correct members and zero wrong? And does the castle ticket question consolidate
from three to one — or is that still Task D?

### Pre-flight (rule 3)

Deploy green; fresh browser tab; confirm from **this** run's telemetry that
`pinning.write` is `true` and decide `pinning.reuse` explicitly rather than
assuming (§6.1); confirm `extractionSampling.resolved` is `{}` before the run,
so Task 1 stays held by fact rather than by intention.
