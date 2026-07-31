# Run-2 audit + next-round work order (geocoder remediation aftermath)

**Next session: this is your starting point. Read it before writing code.**

Written by the session that shipped the geocoder remediation pass, then updated
after reading run 2's QA bundle directly. Per AGENTS.md rule 7(c) every claim is
labelled VERIFIED (with its artifact) or HYPOTHESIS.

Run 2 bundle: `/maker/trips/9fa2cd8d-015f-424d-8a97-04e674b8236f/data/audit/qa-bundle`

---

## 0. Verdict

**The pass worked. The TARGET was missed for a cause outside the pass.**

G4.1, G4.2, G4.4 and the docket-§G repair all landed and are provable from
telemetry. Grouped stops went 0 -> 2 with ZERO wrong groups — the first live
evidence since the collapse that the grouping mechanism works. G4.3 never
executed, and Prague Castle did not group, for one shared reason: **there is no
dated Prague Castle card at all** — the model emitted one, twice, correctly dated,
and the pipeline suppressed both and synthesized an undated placeholder in their
place. See §4; it is the single highest-value finding in this document.

**Do not re-open the geocode lane.** Nothing in G4.1/G4.2/G4.4 needs changing.
G4.3 is UNTESTED, not broken.

---

## 1. Bar scoring, from the run-2 bundle — VERIFIED

**MUST HOLD**

| Item | Result |
|---|---|
| Run completes | PASS — `outcome: completed` |
| 5 legs | PASS — 5 |
| 8 transport | PASS — 8 |
| 5 stays | **FAIL — 6** (§3) |
| No wrong groups | PASS — both groups correct |

**MUST IMPROVE**

| Item | Result |
|---|---|
| `skippedOverBudgetCount` 0 | PASS — 0 (was 48) |
| No two venues sharing a verified coordinate | **NOT CHECKABLE** — verified coords absent from the bundle. Substitute proof in §2. |
| All four telemetry fields present | PASS |
| Zero literal-`null` start times | PASS — 0 (was 31); endTime 0 (was 14) |

**TARGET:** Prague Castle groups with >=2 sub-stops — **MISSED** (§4).

**Bonus, not on the bar:** grouped stops 0 -> 2 (Schönbrunn).

---

## 2. What the geocode lane did — VERIFIED

```
budget                        150     (was 50)    G4.1 took effect
candidateCount                131     (was 98)
lookupCount                   131
skippedOverBudgetCount          0     (was 48)    full coverage
failedCount                     0                 Q4 stays closed at 131 lookups
resolvedCount                  91
formattedAddressCount          91                 previously DROPPED by the whitelist
localityRejectedCount          40                 G4.2 firing
retryCount                      0                 G4.3 never fired (§4)
retryAcceptedCount              0
retryOutOfCityCount             0
retrySkippedOverBudgetCount     0                 the CAP was not the constraint
outcome                  completed
candidates[]                  131 rows            G4.4
groupingClaims        claimed 3, same_site 3, contested 0, released 0
transportFieldRepairs         []
```

**G4.2 proof, stronger than a coordinate diff.** The three venues that carried the
Prague centroid `50.0755381,14.4378005` as `geoVerified: true` in run 7.28.0 are
all in run 2's `rejected_locality` list by name: `Changing of the Guard, Prague`,
`Catacombs tour, Prague`, `Peklo, Prague`. The false verification is gone, and
the MUST-PASS 7 near-miss cannot recur — neither piece is verified now.

**Noted for Arc H:** four `Delta Flight NNNN, Rome` entries are being submitted as
geocode CANDIDATES. Transport-shaped activities consume lookups. Harmless at a
150 cap; it is evidence for the deferred candidate-restriction idea.

---

## 3. The 6th stay — VERIFIED mechanism, NOT this pass

```
Rome Stay              2019-01-12 -> 2019-01-14   same legId as The Yellow
The Yellow             2019-01-13 -> 2019-01-14
Prague Airbnb          2019-01-14 -> 2019-01-18
Wombats Vienna         2019-01-18 -> 2019-01-21
Vitae Hostel           2019-01-21 -> 2019-01-24
The RomeHello Hostel   2019-01-24 -> 2019-01-25
```

`Rome Stay` is a generic placeholder overlapping the real `The Yellow` on the same
leg. `evidence-clustering.ts:4836` ("Pass 1: merge same-venue same-city
overlapping stays") merges on VENUE identity — the two names differ, so the
reconciler correctly declines and both ship.

**Why the geocoder pass cannot be the cause (read from source, not asserted):**

- `selectGeocodeCandidates` walks `stage.activities` only.
- `normalizeParserStageArtifacts` adds repairs to the activities and transport
  loops; `stage.stays` passes through by spread, untouched.
- `canonical-evidence-resolver.ts:371` builds candidates from `stage.activities`
  only — the single other "stays" occurrence in that file is a word inside a
  prompt string.
- The stay reconciler reads `checkInDate`/`checkOutDate`; the pass touched
  activity `startTime`/`endTime` and transport `arrivalTime`/`departureTime`.

---

## 4. ROOT CAUSE of the missed target AND of G4.3 never firing — VERIFIED

The container card is not an activity with a missing date. **It is a synthesized
placeholder.**

```
records.items[84]   "Prague Castle visit"
                    itemType: "placeholder"   date: null   legId: null
                    status: needs_review
                    description: "Need to decide which ticket to get"

audit.lineage.rows[14]  "Prague castle"        date 2019-01-16  SUPPRESSED  kind/role: context
audit.lineage.rows[15]  "Prague Castle visit"  date 2019-01-16  SUPPRESSED  kind/role: context
                        sourceLabel: "USE FOR TESTING CZECH.pdf notes"
```

**The model DID emit the date — 2019-01-16, the same day as its three children.**
It was not lost by a date bug. The chain is:

1. The model emitted TWO Prague Castle pieces, both dated `2019-01-16`, both
   arriving as `kind: context, role: context`, both suppressed
   (`outputEligible: false`).
2. The model also emitted a `missingDetails` question about the ticket.
3. `pieceForMissingDetail` found no live piece for that question, because both
   real pieces were suppressed.
4. The **"missing named evidence recovery"** lane at
   `evidence-clustering.ts:9709` SYNTHESIZED a replacement observation with
   `itemType: "placeholder"`, `date: null` and `city: null` HARDCODED — it is
   recovering from a QUESTION, so it has no date to use.

**Consequences, both mechanical:**

- `selectGeocodeCandidates` keys its container map by DATE
  (`containerTitlesByDate`, `siteContainerDates`). No dated Prague Castle exists,
  so Jan 16 has ZERO containers, so `containerTitle` is null for every Jan-16
  card, so `retryQueryFor` returns null. That is the entirety of `retryCount 0`.
- Grouping's same-day container logic has no container either.

**THE PLACEHOLDER IS A SYMPTOM, NOT THE DISEASE.** The disease is step 1: why did
two dated pieces arrive as `context`? Note the source label — `"...CZECH.pdf
notes"`. HYPOTHESIS, NOT VERIFIED: Prague Castle may appear ONLY in a notes blob
and never in the dated Jan-16 day section, in which case classifying it as
context is arguably CORRECT and the fix belongs somewhere else entirely.

**SETTLE THIS BEFORE CODING (rule 7(b) — check the layer below):**

```
node scripts/inspect-pinned-parse.mjs <run2-parse-key> "Prague Castle" notes
```

Two outcomes, two completely different fixes:

- **(A) Prague Castle IS named in the dated Jan-16 day section.** Then suppressing
  it to context is the bug. Fix the classification so a named site container from
  a dated section survives as a dated activity.
- **(B) Prague Castle appears ONLY in notes.** Then context is correct, and the
  fix is the RECOVERY lane: when synthesizing a placeholder for a missing named
  evidence question, inherit `date` and `city` from a SUPPRESSED piece whose title
  matches `relatedTitle`, instead of hardcoding null. Bounded, deterministic, and
  it already sits inside a recovery path.

**ELI'S DECISION, 2026-07-28:** a named site container carrying an unresolved
decision should survive as a DATED CARD **and** raise the question — not one or
the other. This matches the locked RW-GRP-001 rule that grouping cannot swallow
unresolved decisions. Implement toward that outcome under whichever of (A)/(B)
the parse inspection proves.

**Known limit of the shipped G4.3:** its retry context is day-scoped by design
(scope §G4.3: "its same-site container's title, or its day's city"), so an undated
container is invisible to it. A city-scoped fallback would reach this case. Scope
question, not a bug against the locked scope.

## 5. THE METHODOLOGY PROBLEM — read this before trusting any single run

This trip's parse varies enough run-to-run that single-run A/B comparison of
assembly changes is unreliable.

| | run 7.28.0 | run 2 |
|---|---|---|
| draft items | 79 | 90 |
| geocode candidates | 98 | 131 |
| real start times | 15 | 18 |
| Schönbrunn "at Schönbrunn" children emitted | 1 | 2 |
| `Prague Castle visit` dated | yes | **no** |

**Schönbrunn grouped this run**, which the previous scope said was impossible.
The scope was not wrong — docket §A.4b's proof was CONDITIONAL on the 7.28.0
parse emitting one groupable child. This parse emitted two, the hierarchy path
carried them, the >=2 floor was met. **ACTION: amend docket §A.4b to state that
conditionality.** As written it reads as a general impossibility and it is not.
That framing already misled one session.

Three causes of the variance, VERIFIED in source:

1. **Sampling was unset.** `lib/ai/openai.ts:173 resolveExtractionSamplingParams`
   reads `OPENAI_EXTRACTION_TEMPERATURE` and `OPENAI_EXTRACTION_SEED`. Neither
   existed in Vercel production. **FIXED 2026-07-28 — see §6.**
2. **OCR re-runs every run.** OCR is itself a model call, so the parser reads a
   slightly different document each time. Variance compounds.
3. **The prompt is underdetermined.** Nothing forces a date onto a
   container-shaped card, and nothing forces sub-stops to be separate records
   rather than prose. This is the real extraction bug and it is fixable.

`lib/extraction/extraction-pinning.ts` plus the `EXTRACTION_PIN_WRITE` production
env var already exist. **That is the right tool for assembly A/B work** — pin a
parse, iterate assembly against it, and variance stops confounding results.

---

## 6. ENV CHANGE MADE 2026-07-28, after run 2 — inventory per rule 2

Added to Vercel **Production**, then redeployed:

| Variable | Value | Previously |
|---|---|---|
| `OPENAI_EXTRACTION_SEED` | `7` | absent |
| `OPENAI_EXTRACTION_TEMPERATURE` | `0` | absent |

Undo: delete both. Nothing else changes.

**This is a migration per AGENTS.md rule 1** (the code comment at
`lib/ai/openai.ts:169` says so explicitly). Expected failure mode: the Responses
API may reject temperature/seed for reasoning models;
`requestStructuredResponse` strips them fail-soft on a 400 and retries once, so a
rejected param costs one call, never the run.

**THIS ENV CHANGE IS A NO-OP. VERIFIED IN SOURCE 2026-07-29.**

`resolveExtractionSamplingParams()` is called at `lib/ai/openai.ts:416`, and its
result is used for EXACTLY ONE thing: computing the pin hash at `:422`.
`requestStructuredResponse` is built to accept and send it — it spreads
`...samplingParams` into the request body and even implements fail-soft
strip-and-retry if the model rejects the params — but **all three of its call
sites (`:276`, `:463`, `:490`) omit the argument.** No test covers it
(`grep samplingParams tests/` is empty).

Net effect of setting `OPENAI_EXTRACTION_SEED` and
`OPENAI_EXTRACTION_TEMPERATURE`: every stored pin was invalidated (the key
changed) and **nothing about the model call changed.** Parse variance is fully
live. This was found independently by two agents during a skill evaluation and
then confirmed by reading the three call sites.

It is also a textbook instance of the failure AGENTS.md rule 8(b) now names: a
value computed, threaded partway, and never observed. Nobody could have noticed
from telemetry, because `samplingParams` reaches no served surface either.

**Do not try to score the seed change on the next run.** Measuring variance
reduction requires the SAME input parsed TWICE. That is a separate exercise, and
pinning makes it cheap.

---

## 7. NEXT ROUND — work order, in priority order

### Task 1 — actually send the sampling params, THEN record them (prerequisite)

Two bugs, one small change. See §6 — this is verified, not suspected.

1. **Pass `samplingParams` at both real call sites.** `lib/ai/openai.ts:463` and
   `:490` call `requestStructuredResponse` without it; the function already
   accepts it, spreads it into the body, and handles a 400 by stripping and
   retrying. Passing it also makes that strip-retry path reachable for the first
   time — check `Object.keys(samplingParams)` is safe when the param is absent
   before you rely on it.
2. **Record the params the request ACTUALLY SENT** — not the resolved config —
   into the run usage and the audit extraction summary + snapshot whitelist,
   the same way `geocodeVerification` is carried. Recording the resolved value
   would have shown `seed: 7` on a run that never sent it, which is worse than
   no telemetry.
3. **Add a test asserting the request body carries seed/temperature** when the
   env vars are set. The existing coverage asserts the resolver only, which is
   why this survived.

Expect determinism to improve only partially: reasoning models may reject these
params, and OCR is a separate model call that is not seeded.

### Task 2 — recover the Prague Castle container (THE fix)

**DO NOT CODE THIS UNTIL YOU HAVE RUN THE PARSE INSPECTION IN §4.** The two
candidate causes need opposite fixes and the shipping session could not tell them
apart from the sandbox (no network/Supabase for `inspect-pinned-parse.mjs`).

Read §4 in full. Summary: the model emitted Prague Castle DATED 2019-01-16 twice;
both were suppressed as `context`; the ticket question then caused
`evidence-clustering.ts:9709` to synthesize an undated `placeholder`. Eli's
decision is that the card should survive DATED and still raise the question.

- If the parse shows Prague Castle in the dated day section -> fix the
  classification that sent it to `context`.
- If it shows Prague Castle only in notes -> fix the recovery lane to inherit
  `date`/`city` from the suppressed same-title piece rather than hardcoding null.

Either way, verify the result is eligible as a grouping container — a dated
`placeholder` may still be excluded. Check that before declaring it fixed.

### Task 3 — collapse the duplicate generic stay

`Rome Stay` (Jan 12-14) ships alongside `The Yellow` (Jan 13-14) on the same leg.
Either stop the model emitting generic placeholder stays, or teach the
reconciler that an overlapping same-leg stay with a GENERIC name (city + "stay",
"lodging", "hotel" with no venue identity) is a duplicate of a named venue rather
than a distinct stay. Currently `evidence-clustering.ts:4836` requires venue
identity to match, so it correctly refuses.

Watch the wrong-merge risk: two genuinely different hostels in one city on
overlapping dates must NOT collapse. Generic-name detection is the safe
discriminator, not overlap alone.

### Task 3b — turn pinning into the iteration loop (HIGHEST LEVERAGE)

`EXTRACTION_PIN_WRITE` is already on in production. `EXTRACTION_PIN_REUSE`
(`lib/extraction/extraction-pinning.ts:127`, accepts `"1"` or `"true"`) was OFF
and Eli set it to `true` on 2026-07-28.

Why it matters: with reuse on, a re-run REPLAYS the saved parse — no model calls,
no cost, no variance. That is the fix for §5's methodology problem. Assembly
changes become testable without spending a live run.

Two ordering facts:
- The parse key includes `samplingParams`, so the seed/temperature change in §6
  invalidated every existing pin — for no benefit, since the params never
  reached the API (§6). The pin corpus is effectively empty. The FIRST run after
  Task 1 lands writes a fresh pin under the correct key; runs after that replay.
  Do not expect a cache hit before then.
- Keep reuse ON for assembly work, OFF when you are testing extraction itself.

### Task 4 — docs, not code

Amend docket §A.4b per §5: state that the Schönbrunn impossibility proof was
conditional on the 7.28.0 parse, not general.

### Task 5 — optional, cheap

Add `verifiedLatitude`/`verifiedLongitude` to the served draft snapshot so the
"no two venues share a verified coordinate" bar item becomes checkable. Right now
it is scored by proxy.

---

## 8. Corrections the shipping session owes the record

Three things it told Eli that were wrong, all from asserting before reading:

1. Said card count and demotion were "expected not to move, do not score as
   failure". **Withdrawn.** The §G fix flips 31 cards from timed to untimed —
   `trip-card-taxonomy.ts:103 hasTime()` is `Boolean(startTime || endTime)` and
   the string `"null"` is TRUTHY — which feeds `fixedActivityCount` and the
   `roleCandidates` demotion rule at `canonical-evidence-resolver.ts:583`. Item
   count went 79 -> 90, so nothing was eaten, but those surfaces have a live
   second cause and must not be scored as unchanged.
2. Said the §G fix was low-risk with skippable verification. **Wrong** — it was
   the riskiest change in the pass, a classification change wearing a render
   fix's clothes, and it shipped unflagged. That is rule 1's one-variable rule
   broken.
3. Said Schönbrunn would not move. **Wrong**, per §5 — it trusted docket §A.4b's
   framing without checking what the proof was conditional on.

The Google response-shape smoke test was never run (the API key is marked
Sensitive in Vercel so `vercel env pull` returns `"[SENSITIVE]"`). It is now
moot: `localityRejectedCount 40` proves `types[]` is present and read correctly.

---

## 9. Standing constraints — unchanged, still binding

- **Grouping code is healthy. Do not touch it.** The >=2-member floor and
  `createSiteMembershipContext` are correct.
- **A replay CANNOT answer a geocode question** — `replay-pinned-parse.mjs:14`
  disables the lane. It CAN exercise assembly-side changes.
- **Use `scripts/inspect-pinned-parse.mjs`** to ask what the model emitted.
- **OCR model stays `gpt-5.6-luna`.** `gpt-5.4-mini` is text-only and destroyed
  the 2026-07-25 run.
- **Do not calibrate `CROWDED_DAY_VISIBLE_CARDS`.**
- **RW-GRP-001 coverage is `KNOWN_GAP`.** Run 2 produced 2 correct groups and 0
  wrong ones — the first live evidence the mechanism works. Whether that earns
  `PARTIAL` is Eli's call on this evidence, and it must be his explicit decision.
- **Contract ledger is at v23** deliberately; v23's header already records the
  geocoder work as the standing decision.

---

## 10. First five minutes of the next run's audit

1. Does a DATED Prague Castle card exist, and is it eligible as a grouping
   container? That is the run's whole question. A dated `placeholder` may still
   be excluded — check eligibility, not just the date.
2. `retryCount` > 0? If yes, G4.3 finally got tested — then read
   `retryAcceptedCount` and `retryOutOfCityCount`.
3. `groupedStops` — did Prague Castle join Schönbrunn?
4. Stay count back to 5?
5. `samplingParams` present in telemetry, showing seed 7 / temperature 0?
