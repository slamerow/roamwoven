# Assembly defect docket — run 7.28.0 (2026-07-28)

Trip `67b2bc76-e2ec-44f0-b147-aa1a2f99b811` · processing run
`097c69c4-50f9-458b-8b69-c44dfd66c0b8` · bundle `generatedAt`
2026-07-28T00:32:30.862Z · qa-bundle sha256
`4db233d391f9d556d2569411f36e677d0218d1ef1c26da0df938c68a0bbba0e3`
(239,627 bytes, computed in-browser over the exact response body) ·
fingerprint hash `c56c89a72d00c3651098cbba2acf24f884572017aa9f9e445d559c998f36a6e4`.

Surfaces read: `/data/audit/qa-bundle?includePrivate=1` (239 KB),
`/data/audit/payload?includePrivate=1` (516 KB — this is where per-piece
coordinates live and it is the surface the first pass of this docket missed),
and the maker `/publish` page. Read-only throughout.

Two independent audits were run on this bundle. §R reconciles them.

---

## 0. Verdict — NO-SHIP

**NO-SHIP.** Stated as engineering judgment, and deliberately non-binding:
publish-never-blocks is locked in three places (ground truth: "Unresolved
answers never block publishing"; the Arc G handoff: "needs_review never
blocks; Publish still never blocks, verified in the fixture"; `0077c3a`: "warn
loudly, never block"). Nothing here reverses that posture. The verdict binds a
human decision, not the gate.

The blocking-quality defects are **not** the open questions — those are working
as designed. They are: 31 cards rendering the literal string `null` as their
start time, zero grouping on a build where grouping was live, a false-verified
geocode coordinate shared by three unrelated venues, and one duplicate pair the
P1 detector cannot see.

**Arc G shipped and Arc G ran.** The first draft of this docket led with "the
run did not execute Arc G." That was wrong; Eli rejected it and the record is
corrected in §1. Every Arc G mechanism was live. The correction makes the
grouping result worse, not better.

| MUST-PASS | Result |
|---|---|
| 1. Run completes, no `assembly-recovery-required` | **PASS** — 14/14 processing events completed |
| 2. Spine 5 legs / 8 transport / 5 stays | **PASS** — GT-exact, 9 consecutive runs |
| 3. Trip header Jan 12–25 **2019**, 14 days | **PASS** — G.1 landed; the cleanest result of the run |
| 4. Zero transport questions **and** both train rows read correctly | **FAIL** — questions gone, ÖBB row misattributed (§B) |
| 5. No group on Jan 22 | **PASS**, and not vacuously — the ≥3-timed gate held with 5 timed cards |
| 6. Privacy clean post-Δ3 | **PASS** — zero protected-class code tokens in any public field (§P) |
| 7. No wrong groups anywhere | **PASS**, vacuously — and a documented near-miss (§A) |

| Target | Result |
|---|---|
| Schönbrunn parent + 5 sub-stops (bar: 6) | **0** — regression from baseline 2 |
| Prague Castle groups | **No** — root cause now fully traced (§A) |
| Jan-15 walking tour groups | **No** |
| Malá Strana able to form | **No** — the area name appears nowhere in the bundle |
| Notes 5 → GT 3 | **3 — PASS on count**; the flagging branch was never exercised (§E) |
| Card count 65–69 | **76** — above band, and identical to the 7.26.1 baseline's 75 |

**Grouped stops 2 → 0. Calls 1 → 0.** Grouping did not degrade; it stopped.

---

## 1. Run identity

| Check | Expected | Observed |
|---|---|---|
| Deploy commit | `0077c3a`+ | **`c15d879`** — contains every Arc G mechanism; §2's stop condition does not apply |
| OCR model | `gpt-5.6-luna` every batch | luna on all 5 `ocrBatches.rows` + `checkpoints[0].metadata.model` — **PASS** |
| Extraction / recovery model | `gpt-5.4-mini` | `sourceRecovery.model = "gpt-5.4-mini"` — **PASS** |
| `OPENAI_OCR_MODEL` in Vercel | absent | not directly observable; luna telemetry is the run-evidence proxy rule 2 asks for — **PASS by telemetry** |
| Geocode lane | `completed` | `completed`, 50 lookups, 0 failures — **PASS** |

**Push timeline** (`.git/logs/refs/remotes/origin/main`):

```
23:33:19Z  commit 84b8676  Arc G: note anchoring, transport field repair,
                           grouping address + claim ledger
23:39:54Z  PUSH   84b8676
23:46:44Z  commit c15d879  Arc G pre-flight
23:48:13Z  PUSH   c15d879   ← deploy green here
00:06:19Z  commit 0077c3a  Arc G block-risk audit      (never pushed)
00:21:44Z  fetch — records remote main STILL c15d879
00:27:51Z  commit c76dcc4  the audit brief             (never pushed)
00:32:30Z  run 7.28.0 bundle generated
```

`0077c3a` was authored **eighteen minutes after the last push**. It is the
block-risk audit's three quality fixes, not Arc G. The brief's §2 bar of
"`0077c3a` or later" was written at 00:27 by a session holding that commit
locally and assuming it was upstream.

**Bounds.** Lower: `transportFieldRepairCount` is present in the bundle and
`git log -S` names exactly one commit that added it to the audit snapshot,
`84b8676`. Upper: three artefacts agree GitHub's `main` was `c15d879` at run
time — the ref file (mtime 23:48:13Z, written by a push), the reflog
(`84b8676 → c15d879, "update by push"`, nothing after), and `.git/FETCH_HEAD`
written 00:21:44Z, a fetch *after* `0077c3a` was authored and *before* the run.
`git branch -a --contains 0077c3a` returns only local `main`.

**Falsifier, stated so it can be checked:** all of the above reads Eli's clone
and would not detect a deploy routed around it (`vercel --prod` from another
tree, a GitHub web edit, a second clone). Against that: no `.vercel/` directory
exists in the repo, and every `origin/main` reflog entry is `update by push`
from here.

**What the run lacked**, all from `0077c3a`, none an Arc G mechanism: the
explicit geocode rank ladder; the `canonicalPiecePublicPayload` address strip
(unobservable from the bundle's fixed item projection — untested, not cleared);
and the `cleared_impossible_transport_<field>_without_question` recovery action
(moot at zero repairs). **None of these caused the grouping collapse** — see §A.

---

## Chain A — Grouping produced nothing, and the cause is geo trust, not budget

**Status: VERIFIED, with one prior hypothesis RETRACTED.**

### A.0 Retraction

The first draft of this docket proposed that the missing rank ladder let the
50-lookup budget be cut **alphabetically**, starving the ship-bar stops. **That
is wrong and is withdrawn.** Sorting all 79 draft activities A→Z and marking
which received a verified coordinate shows a fully interleaved pattern — first
non-verified at index 1, last verified at index 76. A name-ordered cut would
leave a clean break. It does not. The ranked tiers evidently consumed all 50
lookups before the alphabetical tail mattered.

Consequence: **the unpushed `0077c3a` is not the reason grouping collapsed.**
Arc G's grouping failed on its own merits.

### A.1 The outcome

- `activeGroupedStops 0`, `calls 0`; `sectionHashes.groupedStops` and `.calls`
  are both `4f53cda1…`, the sha256 of the empty array.
- No item in `records.items` (n=79) carries a non-null `parentItemId`.
- Baseline 7.26.1: 2 stops / 1 call. On disk: run-7.21.1b 2 / 1;
  run-7.21.0 **13 / 3**.

The walk lane's gates were satisfied on two days and still yielded nothing:

| Day | Cards | Timed | Walk-lane eligible? | Groups |
|---|---|---|---|---|
| Jan 16 | 12 | 2 | **yes** | 0 |
| Jan 19 | 11 | 0 | **yes** | 0 |
| Jan 22 | 13 | 5 | no (≥3 timed) | 0 |

All three raised `activity_bloat` quiet warnings, so the density trigger fired
and found no candidate it would accept.

### A.2 Cause 1 — FALSE VERIFICATION (the finding that explains Prague Castle)

`50.0755381,14.4378005` is the **Prague city centroid**. Three unrelated venues
sit on it, all stamped `geoVerified: true`:

```
Catacombs tour        2019-01-14  VERIFIED  50.0755381,14.4378005
Peklo                 2019-01-16  VERIFIED  50.0755381,14.4378005
Changing of the Guard 2019-01-16  VERIFIED  50.0755381,14.4378005
```

The geocoder failed to resolve the venue, returned the locality, and the lane
recorded it as verified. 31 of 79 activities carry verified coordinates across
only **29 distinct points**.

### A.3 Cause 2 — verified-only policy excludes a 168 m child

```
Prague Castle          VERIFIED  50.0910966,14.4016165   (correct)
Changing of the Guard  VERIFIED  centroid   →  3,108 m from the castle
St. Vitus Cathedral    approx    50.09,14.40 →    168 m from the castle
```

Prague Castle had exactly two candidate children and Arc G rejected both.
St. Vitus is 168 m away and would pass a 300 m radius trivially, but `84b8676`
made the executor trust verified coordinates only once the geocode lane has
run — so it was excluded for being *unverified*, not for being far. Changing of
the Guard was verified, and the verification was garbage.

The Arc G handoff called this shot exactly: *"If a group that used to survive
verification now disappears, this is the first place to look."*

### A.4 Cause 3 — the model never emitted Schönbrunn's sub-stops, and a ≥2-member floor finishes the job

Four of the five sub-stops do not exist as records. They were folded into the
parent card's description:

```
piece_38cba22e · 2019-01-19 · "Schönbrunn Palace visit"
description: "Schönbrunn Palace. Notes in source: Gloriette; Orangeriegarten
at Schönbrunn; Palm house at Schönbrunn; Apple Studel Show; Panorama Train
pass."
```

Across the whole 239 KB bundle, `Orangerie`, `Palm House` and `Panorama` occur
**exactly once each** — inside that string.

**Confirmed at the source.** `scripts/inspect-pinned-parse.mjs ff706e4d` reads
the pinned model output for this exact parse (61 calls, 0 misses,
parse-key byte-identical). Titles emitted by the model:

```
Gloriette              as TITLE: 1   in a DESCRIPTION: 3
Orangerie              as TITLE: 0   in a DESCRIPTION: 2
Palm house             as TITLE: 0   in a DESCRIPTION: 2
Apple Strudel Show     as TITLE: 0   in a DESCRIPTION: 3
Panorama               as TITLE: 0   in a DESCRIPTION: 2
Schönbrunn Palace visit as TITLE: 1
```

The four missing stops exist only as prose, in the parent's own description and
in a day-level `"Explore Vienna"` blob that semicolon-lists the whole day.
**This is extraction-side, not assembly-side.** No grouping change reaches it.

### A.4b The ≥2-member floor — why Arc G could not have grouped Schönbrunn ON THIS PARSE

> **AMENDED 2026-07-31 (run-2 work order, Task 4). READ THIS BEFORE THE PROOF
> BELOW.** The proof is CONDITIONAL ON THE 7.28.0 PARSE, not general, and the
> original heading ("could not have grouped Schönbrunn at all") did not say so.
> Its load-bearing premise is the sentence "The model emitted two Schönbrunn
> pieces total" — a fact about ONE parse, not about the code. Run 2's parse
> emitted TWO groupable children instead of one, the hierarchy path carried
> them, the ≥2-member floor was met, **and Schönbrunn grouped.** Grouped stops
> went 0 → 2, with zero wrong groups.
>
> Everything below remains correct as written FOR THE 7.28.0 PARSE. What is
> withdrawn is only the generalisation: nothing here shows the code cannot
> group Schönbrunn, and it must not be cited as showing that. This framing
> already misled one session into treating a parse-variance outcome as a
> structural impossibility (run-2 handoff §5) — exactly the failure AGENTS.md
> rule 7(c) exists to prevent, a conclusion outliving the artifact that
> conditioned it.
>
> Practical consequence for future audits: this trip's parse varies enough
> run-to-run that single-run A/B comparison of assembly changes is unreliable.
> Pin the parse (`EXTRACTION_PIN_REUSE`) before drawing a structural conclusion
> from one run's member counts.

Schönbrunn and Gloriette **both resolved**, 893 m apart (matching the recorded
~800 m offset; not re-derived), so the budget did not starve this target either.

The source-hierarchy path would have carried Gloriette regardless of that
893 m: `containerListsComponent` splits the container description on `;` and
`:`, and `"…Notes in source: Gloriette; Orangeriegarten at Schönbrunn; …"`
yields a segment normalizing to exactly `gloriette`. Hierarchy membership hits
with no coordinates required. **That path is healthy.**

The kill is in the executor's verification
(`evidence-clustering.ts`, same-site branch):

```js
if (verifiedSourcePieces.filter((piece) => piece !== siteContainer).length < 2
```

**A same-site visit requires at least two members besides the container.** The
model emitted two Schönbrunn pieces total. One member. Below the floor.

Therefore: **even a perfect G.3a formatted-address match on Gloriette yields one
member, and one is still less than two.** Arc G's address path could not have
produced a Schönbrunn group on this parse under any circumstances. This is a
proof, not an inference, and it retires the "unobservable" framing for this
specific target — though §C still stands for every other candidate.

### A.4c Prague Castle fails the same floor, for different reasons

Its container tokens are `prague` + `castle` — a city name and a generic site
noun, both stripped by G.3a's filter, leaving the token list empty. The
full-title fallback needs a child whose title *contains* "prague castle";
neither child does. And `"Changing of the Guard at Prague Castle"` is the
child's **description**, not its title, so the `<stop> at <Site>` title rule
never sees it. **Zero hierarchy members.** Geo members: St. Vitus unverified →
rejected; Changing of the Guard verified-at-centroid 3,108 m → rejected. Zero.

### A.4d The scoping split this produces

- **Prague Castle is geocoder-fixable.** Real coordinates for St. Vitus and the
  Changing of the Guard put two members inside 300 m — floor met, group forms.
- **Schönbrunn is not.** It needs the model to emit its sub-stops. No geocoder
  change reaches it.

### A.4e A second retraction: "Arc G lost the group that worked" is withdrawn

An earlier revision of this docket said Arc G regressed a group the baseline had
achieved. Given the ≥2 floor, 7.26.1's two grouped stops required the model to
emit **at least three** Schönbrunn pieces that run; this run it emitted two.
That difference is **parse variance in extraction**, not an Arc G regression.
Both of this docket's earlier attempts to explain the grouping collapse reached
for an Arc G cause when the cause was upstream.

### A.5 Near-miss on MUST-PASS 7

Peklo and Changing of the Guard share an **identical** verified coordinate on
the **same day**. They were kept apart only by the timed-stop gate and the
absence of a container-named site. Under slightly different gates that is a
wrong group, which the bar rates worse than a missing one.

### A.6 Coverage observation

**Rome's entire Jan-13 leg has no geo at all** — Colosseum, Pantheon, Trevi
Fountain, Spanish Steps, all unverified. Not a crowded day, so nothing ranked.

---

## Chain B — The ÖBB row ships under RegioJet's operator

**Status: VERIFIED.**

```
Jan 18  provider "RegioJet"  Praha, Hlavní Nádraží → "— Wien, Hauptbahnhof"
        09:20 → 13:23   conf 1beb5005
        description: "/train: RegioJet | RJ 1033 Train to Vienna Train to Budapest"

Jan 21  provider "REGIOJET"  "Wien HBF" → "Budapest"   10:42 → 13:19
        conf "Operator"      routeLabel "Wien HBF to Budapest-Keleti"
        description: "Train to Budapest Outbound - Jan 21, 2019. ÖBB | D 143. …"
```

Regression against run-7.21.1b on disk, which had `ÖBB` /
`VXFHXKCQEPHPUSNT`.

**Root cause.** All 27 entries in `sourceCoverage.uncoveredLines` are the ÖBB
ticket page, and every one carries the wrong day-section label:

```
label: "January 24th Rome- $118(private room-ensuite)"
excerpts: FAHRSCHEIN · DATUM: 21.01 · ZEIT: 10:42 · ZEIT: 13:19 · Dauer: 2:37 ·
          "Ticketcode 2159 1990 1842 0436 zur Buchung 0648 7232 0822 6278"
```

A Jan-21 Vienna→Budapest ticket filed under the Jan-24 Rome section. Its anchor
never joined the Jan-21 row (`materialTransportAnchors 9` /
`runAuditMatchedTransportAnchors 8` / **`finalMatchedTransportAnchors 7`**, 2
`missingFromFinalRecords`), so the row inherited its operator from the adjacent
rail leg. Wien Hbf is the shared interchange — the exact hazard the G.2
adversarial review named.

**G.2 did not fire and is UNTESTED.** `transportFieldRepairCount 0`; neither
trigger shape was present. The two baseline transport questions are gone, but
not because G.2 removed them.

The real ÖBB codes are **uncaptured**, which is why
`transport_confirmation_value_not_captured` fires — the deny list cannot sweep
a code it never captured. They leak nowhere today.

---

## Chain C — Four telemetry fields the audit needs do not exist on any served surface

**Status: VERIFIED in source at HEAD (`c76dcc4`), not just in the run.**

| Field | Where it should be | Reality |
|---|---|---|
| `geocodeVerification.formattedAddressCount` | `usage.openai.geocodeVerification` | Declared `geocode-verification.ts:43`, incremented `:344`. **Dropped by the snapshot whitelist** — `trip-extraction-audit-snapshot.ts:253-269` and `-types.ts:231-239` list seven geocode fields and not this one. |
| `evidence.groupingClaims` | run summary | Produced `evidence-clustering.ts:11640`. **Zero consumers repo-wide.** Never persisted, never served. |
| `usage.openai.transportFieldRepairs` | usage | Written `openai-trip-parser.ts:1514`. No audit endpoint serves `usage`. |
| **per-candidate geocode rank + outcome** | nowhere | Only aggregate counts exist. There is no way to ask why a given candidate did or did not get a lookup. |

Probe over both response bodies: `formattedAddress` → 0 occurrences,
`groupingClaim` → 0, `claimsByLane` → 0. Only `skippedOverBudgetCount` (48) is
readable.

**Why it is load-bearing.** The brief decodes a zero as *"the address path never
fired, and every G.3a grouping conclusion is void."* Absent is not zero. We
cannot distinguish "the geocoder returned no formatted addresses" from "the
address path worked and nobody plumbed the counter" — and per §A.4 that is
precisely the question Schönbrunn turns on.

The fourth field is new to this revision and is the one Eli's decision needs:
**St. Vitus lost its lookup and there is no telemetry that says why.** It sits
on a crowded day, it is a same-day component of a container, and eight of its
twelve day-mates resolved. You cannot fix coverage you cannot see.

---

## Chain D — The Prague Castle decision fragmented into two records and three questions

**Status: VERIFIED. Violates the placement contract (RW-PLC-001) and Δ2
amendment 2.**

```
piece_e97bee98 · activity    · 2019-01-16 · "Prague Castle"        · draft
piece_264b4ac8 · placeholder · date null  · "Prague Castle"        · needs_review
                               description: "Need to decide which ticket to get"
piece_0ab37988 · activity    · 2019-01-16 · "St. Vitus Cathedral"
piece_5964e3ee · activity    · 2019-01-16 · "Changing of the Guard" 12:00
```

Three of five open questions are castle fragments — the guard ticket, the
castle ticket (subject: the undated stub), and the St. Vitus tour — against a
ground-truth budget of **three questions for the entire trip**. Δ2 amendment 2
is explicit: *"St. Vitus folds into ONE castle ticket question."*

Chains A and D are one wound: with no castle parent, each sub-stop keeps its
own decision.

---

## Chain E — G.1 landed; its flagging branch was never exercised

**Status: VERIFIED (pass) / UNEXERCISED.**

`startDate 2019-01-12`, `endDate 2019-01-25` — 14 days, 2019. The spine
anchored correctly: leg 1 arrives 01-13, but transport row 1 is dated 01-12 and
the window starts there. Notes are 3 (Prague / Vienna / Budapest), GT-exact,
down from 5, with no Rome note.

The two 2018-dated pieces were **suppressed at canonicalization** —
`L272-181125-2` @2018-01-15 (the walking-tour booking reference parsed as a
date) and "Walk down the trails to the river's edge" @2018-01-22 — so they
never reached note status and `needs_review` never ran. No output note carries
`reviewRequired: true`. Range anchoring is proven; out-of-range flagging is not.

---

## Chain F — The Rome-2 stay carries the watch shop's address

**Status: VERIFIED. Regression vs run-7.21.1b.**

```
7.28.0:  "The RomeHello Hostel" · address "Via della Fontanella Borghese 33"
                                · addressVisibility traveler_password
7.21.1b: "The RomeHello Hostel" · address "Via Torino n. 45"
```

`Via della Fontanella Borghese 33` is the **watch-shop** address from the Jan-24
errand. `Via Torino` appears 5× elsewhere and lost the slot. The other side of
the same defect: the `Watches In Rome` card reads
`"Watches In Rome is located at."` — the address was lifted off the activity,
leaving a dangling sentence, and bound to the stay as a protected private
address.

Wrong protected data behind the traveler password, plus a gutted activity.

---

## Chain G — 31 cards render the literal string `null` as their start time

**Status: VERIFIED. Originated by the second audit; missed by the first pass of
this docket, which filtered `!== 'null'` in its own queries and never reported
it.**

```
startTime === "null"  (literal string) : 31
startTime === null    (real null)      : 33
startTime  = real time                 : 15
endTime   === "null"  (literal string) : 14
transport rows affected                :  0
```

The summary surface renders text such as **"null · Art and culture."**

This is not an unresolved decision — it is malformed output, and it lands
against AGENTS.md §Dark-factory: *"A processing stage may be recorded as
completed only after its output passes the validation required by the next
persisted boundary."* Assembly was recorded `completed` with output that fails
the render boundary. Transport rows are clean, so the defect is confined to the
activity projection.

---

## Chain H — Question targeting: 1 of 3 ground-truth questions survived, 2 were converted into cards

**Status: VERIFIED. Originated by the second audit.**

The count improved 11 → 5. The targeting did not. Against the answer key's
three questions:

| GT question | Outcome |
|---|---|
| #1 Prague Castle ticket choice | Present — but fragmented into three (§D) |
| #2 Friday Vienna list: State Hall Library, Time Travel, Belvedere — planned or ideas? | **Flattened into three Jan-18 `art_culture` activity cards** |
| #3 Baths — Gellert or Szechenyi, which day? | **Flattened into "Bath houses" (Jan 21) + "Gellert Bath House" (Jan 23)** |

Plus two spurious: a deterministic Kutná Hora city assignment (GT: it stays a
Prague day trip, system logic, not a question) and a client/provider contact
header that should have been suppressed rather than asked about.

So the honest scoring is not "5 questions vs 3." It is **one of three GT
questions present, two silently converted into scheduled commitments, three
spurious.** Converting an open choice into a scheduled activity is worse than
asking a redundant question — it ships a decision the traveler never made.

---

## Chain I — Duplicates, fusions and miscategorisation the P1 detector cannot see

**Status: VERIFIED. Originated by the second audit.**

- **Two trdelník cards on Jan 16**: `"Trdlnik breakfast"` (`food_dining`) and
  `"Trdelník for breakfast"` (`nature_outdoors`). GT: one untimed breakfast
  activity. **The P1 duplicate detector misses this** — diacritics plus word
  order defeat normalised identity — while catching Pinball Museum. That
  detector gap matters more than either duplicate.
- **Pinball Museum on Jan 21 and Jan 23** — the run's only P1. GT: one Budapest
  city note, zero cards.
- **Unrelated venues fused into one title**: `"House of Terror Museum or Retró
  Lángos Büfé"` — a museum and a lángos stand. GT has House of Terror as a
  Jan-23 activity and Retró Lángos Büfé as a Budapest city note. The disjunction
  rule exists for genuine either/or choices (Mumok *or* Natural History), not
  for arbitrary pairs.
- **`Great Synagogue / Jewish History` categorised `food_dining`.**
- **The rental car split across two cards** — `"Car selection"`
  (`admin_logistics`, `needs_review`) and `"Pick up car"` (`arrival_departure`)
  — where GT has one timed rental activity.
- **A pronunciation phrase promoted to an activity**: `"Ehr-nee-zhest"`, the
  lone `social` card. Δ2 amendment 4 routes Hungarian phrases to the language
  module.

---

## Chain J — Publish declares ready, and has no concept of malformed output

**Status: VERIFIED on the maker `/publish` page.**

> **Step 6 of 7 complete** — "The app is ready to share."
> "Private app is ready"

With 5 open questions, 31 literal-`null` cards, zero grouping and a live P1.

**The finding is narrower than "gating is broken."** Open questions
deliberately do not block — that posture is locked in three places and nothing
here should loosen it. The gap is that the gate reasons only about *review
items* and has no notion of *malformed output*. A start time of `"null"` is not
an unresolved decision; it is a defect, and per §G the dark-factory rule says a
stage should not be recorded complete with it.

**Bonus, found while checking:** the page contradicts itself. It shows
"SHARE URL — Not published yet" and "Create the first snapshot" alongside
**"Published snapshot is current."** Two state readouts disagreeing on one
screen.

---

## Chain K — Carry-overs, confirmed present, out of Arc G scope

- Demotion-lane debris shipped as `needs_review` cards: "Car selection",
  "Buy wine", "Ehr-nee-zhest", "Buy a pack of 10-20 tickets", "From Termini
  Station".
- **"From Termini Station"** is the Rome-2 arrival directions shipped as a
  public dated card. Δ2 keeps arrival directions as protected "getting there"
  detail. **Explicitly NOT a bar-6 failure** — the Δ3 procedure scopes item 6
  to code tokens — but chain 3b from run 7.23.2, still open.
- **OCR — re-scored against every bundle on disk, and the previous framing was
  wrong.** "OCR was rock solid a few days ago and something changed" does not
  survive the data:

  | Run | chars | pages | model | `Josefov` | `Joselov` |
  |---|---|---|---|---|---|
  | 7.17.1 | 31,448 | 19 | luna | 0 | 1 |
  | 7.17.2 | 32,127 | 19 | luna | — | — |
  | 7.18.0 | 31,390 | 19 | luna | — | — |
  | 7.18.1 | 30,990 | 19 | luna | 0 | 2 |
  | 7.21.0 | 31,704 | 19 | luna | 0 | 2 |
  | 7.21.1a | 31,616 | 19 | luna | — | — |
  | 7.21.1b | 30,929 | 19 | luna | 0 | 3 |
  | **7.28.0** | **32,355** | 19 | luna | **3** | **1** |

  Yield is flat within ±2% across every run and **7.28.0 is the highest of all
  of them**. The `Josefov` misread is in EVERY bundle back to 7.17.1, and in all
  the older ones the correct spelling appears **zero times** — 7.28.0 is the
  first run where it reads correctly more often than not. **Nothing regressed;
  transcription accuracy was simply never solid and never instrumented.**
  What was made solid a few days ago is the MODEL AND CONFIG discipline —
  durable default, tripwire, smoke test, batching A/B — and that held perfectly
  here: luna on all five batches and all five checkpoints, no drift.
  The reason it felt solved is that the watched metric was
  `uncoveredLineCount`, which §1 of the brief correctly calls backwards: it
  walks the OCR OUTPUT, so a character OCR never read right is invisible to it.
  **There is no transcription-accuracy metric anywhere in the pipeline.**
  *Method caveat:* these counts are of tokens that survived into each bundle,
  not of raw OCR output, so a token could be read correctly and dropped
  downstream. `Joselov` occurrences prove misreads happened; the zero `Josefov`
  counts are strong but not airtight.
  Fix remains a better VISION model via `scripts/ocr-smoke-test.mjs`.
  **`gpt-5.4-mini` is text-only and destroyed the 2026-07-25 run.**
- Jan-19 idea flood (11 cards, GT 2); Kutná Hora scoping question.
- 75 activities vs GT 49: debris routing (~9) and demotion (~10) are Eli's
  declared out-of-scope deferrals, not new findings.

---

## §P Privacy — bar item 6, scored AFTER applying Δ3

**PASS.** Zero PROTECTED-class code tokens in any public field.

Every public prose surface — `items[].title/description/locationName/address`,
`transport[].routeLabel/description/provider/departureLocation/arrivalLocation`,
`stays[].name/description`, and every question's `prompt/evidence/reason` — was
swept for all 20 known protected tokens (`GHFHPG`, `N8WBRE`, `1beb5005`,
`0468406277`, `VXFHXKCQEPHPUSNT`, `RDGHMT`, `743-410652363`, `HMRKX42RWB`,
`2580`, `13911-411380482`, `43145-412325267`, `283260-411989672`, `Wimgen`,
`WelcomeHome2017`, `buzzer`, and the five stay street addresses).

**Total hits: 0.** A generic code-shape scan returned one match, `FR8331` — a
flight number, PUBLIC under Δ3.

Δ3 applied as required: `seat 11C`, `seat 30F`, `Seat 2D`, `Seat C1`,
`Seat 14J`, `Seat 13D` all ship publicly and none is a finding. All 45
`privateDetails` carry `visibility: "traveler_password"`. Judged against
`includePrivate=1` real values, not the serve-time masked view (the documented
7.18.3 trap).

**This is the one bar two independent audits cleared separately** — see §R.

---

## §R Reconciliation of two independent audits

Both passes examined the same bundle. The second audit's trip identifier
`097c69c4-50f9-458b-8b69-c44dfd66c0b8` is the **processing run id**
(`reportRun.id` / `latestRun.id`) on trip `67b2bc76`, not a second trip — same
run, no discrepancy.

### Agreed, independently

Spine 5/8/5 · trip span Jan 12–25 2019 · 29/29 chunks, zero failures · geocode
98/50/48 · questions 11 → 5 · 75 activities · zero groups, zero calls ·
Jan 16/19/22 at 12/11/13 cards · cost-only cards, raw-URL cards and reservation
labels gone · 30 planning-cost lines correctly excluded · **privacy clean**.

Two independent passes clearing privacy by different methods is the strongest
evidence in this docket.

### Found only by the second audit (adopted here)

Chains **G** (literal `null` × 31/14), **H** (question targeting), **I**
(trdelník duplicate, either/or fusion, Great Synagogue category, rental split,
pronunciation card), **J** (publish declares ready), and — most importantly —
the **shared verified coordinate** that unlocked chain A.

The first pass printed the trdelník pair, the two flattened GT question sets and
the fusion titles in its own output and drew no conclusion from any of them, and
filtered around the literal `null` in its own queries. Those are misses of
reading, not of access.

### Found only by the first audit

The **ÖBB day-section root cause** (§B): the second audit recorded "both train
records now have the correct stations and arrival times," which is true of the
times but misses `provider: "REGIOJET"`, `arrivalLocation: "Budapest"` and
`confirmationLabel: "Operator"`. Also the deploy-commit derivation (§1), the
telemetry-observability chain (§C), the Rome-2 stay address (§F), the 2018-note
suppression (§E) and the near-miss analysis (§A.5).

### Where the second audit's method needs correcting

1. **Drop the ">3 km from expected city coordinates" metric.** It yields four,
   not six, and **all four are correctly placed** — Schönbrunn genuinely is
   5.2 km from Vienna's centre, Gloriette 5.9 km, Nový Svět 3.7 km, Prague
   Castle 3.1 km. The metric flags good data and would have missed the centroid
   trio entirely. Distance-from-city-centre is not a defect signal; **identical
   coordinates across distinct venues** is, and that is the check to keep.
2. **"The built-in audit misses bloat" is wrong** — three `activity_bloat`
   quiet warnings fired on Jan 16, 19 and 22. The rest of the meta-point stands:
   nothing fires for literal-`null` or for zero grouping.
3. **"Publish gating fails" needs re-aiming** — see §J.

### Method conclusion

The second pass was stronger on *rendered artefacts and semantics* (it looked at
what a traveler sees); the first was stronger on *provenance and telemetry* (it
looked at how the data got there). Neither surface is optional. The
first pass's specific failure was analysing `records.items` and never opening
`/data/audit/payload`, where the coordinates live.

---

## §7 Reconciliation with the brief's predictions

| # | Prediction | Outcome |
|---|---|---|
| 1 | G.1 lands, 9/10 | **Correct.** |
| 2 | G.2 lands, 8/10 — zero transport questions and both rows GT-exact | **Half.** Questions gone; rows not GT-exact; mechanism never fired. Its stated risk signal is unobservable (§C). |
| 3 | Schönbrunn at 6 stops, 5/10 | **Wrong — 0.** The self-identified likely cause lands one stage late: the components were never components. |
| 4 | No group on Jan 22, 8/10 | **Correct**, on a real gate. |
| 5 | Card count 65–69, 6/10 | **Wrong — 76.** |

The §7 self-critique — *"every grouping number comes from fixtures I wrote,
using coordinates and Google-shaped addresses I chose"* — was the right worry
aimed one layer too high. The live geocoder returned a **city centroid** and the
lane called it verified; no fixture models that.

---

## Contract coverage — CHANGED this session, ledger v22 → v23

Applied to `docs/product-contracts.md` in the same change, per AGENTS.md
§Product-contract preflight. No contract *text* was modified; these are coverage
and evidence updates.

| Entry | Was | Now | Basis |
|---|---|---|---|
| Grouping (RW-GRP-001) | `PARTIAL` | **`KNOWN_GAP`** | Eli's explicit decision 2026-07-28. Zero groups with the code live and two days passing every gate. |
| Placement (RW-PLC-001) | `PARTIAL` | **`KNOWN_GAP`** | Eli's explicit decision 2026-07-28. Duplicate + dateless stub, on deployed code, unaffected by the geocoder fixes. |
| Source precedence (RW-SRC-001) | `PARTIAL` | `PARTIAL` | Unchanged — neither G.2 defect shape occurred, so the repair is untested rather than violated. Chain B added to Evidence. |

---

## Before run 2

Arc G's budget of 1 run is spent. This run produced substantial new
information, so rule 5's hard stop is not triggered. **Proposed budget for the
remediation pass plus Arc H: 2 runs**, stated up front per rule 5.

Ordered, each with verification and undo per rule 6:

1. **Push `0077c3a` and `c76dcc4`** — authored after the Arc G push, never went
   up. *Verify:* `git rev-list --left-right --count origin/main...HEAD` → `0 0`,
   green deploy on `c76dcc4`. *Undo:* revert the Vercel deploy to the `c15d879`
   build.
2. **Geocoder coverage and trust — all four parts** (Eli's decision
   2026-07-28; premium experience over lookup cost):
   a. **Raise the lookup budget** to cover the candidate pool (98 here). Cost is
      well under a dollar per trip; the real constraint is rule 1's arithmetic —
      98 lookups at `GEOCODE_LOOKUP_CONCURRENCY = 8` against `maxDuration` with
      ≥40% headroom, **written down before the run**.
   b. **Locality-granularity guard** — a result whose granularity is the city,
      or whose coordinate equals the city centroid, must never be stamped
      `geoVerified: true`.
   c. **Retry with container context** before abandoning a venue — "Changing of
      the Guard, Prague Castle" rather than accepting a centroid. This is the
      part that actually recovers §A.3, and note that (b) alone does not: it
      turns a wrongly-verified stop into an unverified one, still excluded.
   d. **Per-candidate rank and outcome telemetry** — the fourth field in §C.
   *Verify:* zero venues sharing a coordinate; St. Vitus and the Jan-13 Rome
   landmarks resolved; `skippedOverBudgetCount 0`. *Undo:* each is independently
   revertible; (a) is one constant.
   **The verified-only coordinate policy stays strict** — Eli's decision: a
   wrong group remains worse than a missing one.
3. **Plumb the three original telemetry fields** (§C) — `formattedAddressCount`
   into the snapshot whitelist and types; `summary.groupingClaims` into the
   snapshot; `transportFieldRepairs[].outcome` onto an audit surface.
   *Verify:* all three present in the next qa-bundle. *Undo:* revert; additive
   read-only fields.
4. **Fix the literal-`null` serialisation** (§G) — a projection writing
   `String(null)` into a time field. Small, user-visible, and the cheapest win
   in this docket.
5. **DONE, 2026-07-28 — the fold question is answered.** Replay A ran clean
   (61/61 hits, 0 misses, byte-identical parse key) but **a replay can never
   answer a grouping question**: the harness disables the geocode lane
   (`replay-pinned-parse.mjs:14`), a limitation already recorded in
   `next-session.md` under the 2026-07-24 replay notes. `scripts/inspect-pinned-parse.mjs`
   (new, read-only, no run budget) answered it directly from the pin corpus
   instead — see §A.4. **Arc H does not need a grouping investigation; it needs
   an extraction one.**
6. **Then scope Arc H on upstream segmentation and attribution** — §B's
   day-section misfiling, §A.4's model-side fold, §F's address misrouting and
   §H's question flattening are one family: content lost or misrouted before
   assembly sees it. That is also where the 75-vs-49 gap lives, and per §A.4d it
   is the ONLY path to a Schönbrunn group.
7. **Add a transcription-accuracy metric.** Per §K, nothing in the pipeline
   measures whether OCR read characters correctly, and the metric everyone
   watched cannot. A held-out set of known-correct proper nouns checked against
   OCR output would have surfaced `Joselov` eleven runs ago.
8. **Do not** change the OCR model. **Do not** calibrate
   `CROWDED_DAY_VISIBLE_CARDS` against this run's inflated counts.

**Prediction for run 2, per rule 4 — revised after §A.4.**

- **Prague Castle groups: 7/10.** Step 2c must give St. Vitus and the Changing
  of the Guard real coordinates; that puts two members inside 300 m and clears
  the ≥2 floor. Falsified by either child still lacking a verified coordinate,
  or by a member count of 1.
- **Schönbrunn groups: <2/10, and steps 1–4 cannot change that.** Per §A.4b the
  model emitted one groupable child, the floor is two, and no geocoder or
  address work alters either number. Anyone predicting otherwise has not read
  the floor. **Falsified only by the model emitting ≥3 pieces for the complex**,
  which is an extraction change, not an Arc H grouping change.
  > **RESOLVED 2026-07-31: this prediction was WRONG, and it was wrong in the
  > way it named its own falsifier.** Run 2's parse emitted the extra piece, the
  > floor was met, and Schönbrunn grouped. The prediction was sound about the
  > CODE and unsound about treating one parse's piece count as fixed — see the
  > amendment at the top of §A.4b. The lesson is not "predict less
  > confidently"; it is that a confidence stated over a variable input has to
  > name the input as the variable, which this one did only in its final clause
  > and its heading did not carry at all.
- **Card count moves: low.** Nothing in steps 1–4 touches demotion or debris.
- **Literal-`null` cards drop to 0: 9/10.** It is a serialization bug with a
  deterministic fix and a visible check.

Cost if wrong on Prague Castle: one run, plus a docket that can finally
attribute per-candidate geocode outcomes. Rollback: none of steps 1–4 changes
assembly semantics.

**A standing caution this docket earned.** Three separate times it proposed an
Arc G explanation for the grouping collapse — the alphabetical cut, then a lost
baseline group, then an unobservable address path — and all three were wrong for
the same reason: the cause was upstream of grouping, in what the model emitted.
The evidence that settled it was available from the first hour in
`/data/audit/payload` and the pin corpus. Prefer the parse over the pipeline
when a card is missing.
