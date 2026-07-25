# Run 7.25.0 audit — trip 79cff4be (2026-07-24, first run on the Arc F.2 build)

Trip `79cff4be-b458-4ac7-a452-4a0841573169` ("7.25.0"), source `USE FOR TESTING
CZECH.pdf` (1,926,250 B) — **one upload, correct file** (the 7.24.0 answer-key
trap avoided; `originalFilename` verified in the bundle before judging). Bundle
fetched live via `/data/audit/qa-bundle?includePrivate=1` through the maker
session: **255,335 B**, sha256
`7cf3912c4179c393c94d452e5e8b2def93a93ecc9a3b6daf2a11720e2befbb1c`,
`includePrivate:true`, `privateDetailValues:"included"`,
`sourceTextPreviews:"included"` — **zero serve-time masks, REAL payloads
judged** (7.18.3 trap avoided).

**Build: Arc F.2, NOT Arc G.** Confirmed with Eli mid-audit after the device
repo showed `main` == `origin/main` == `2e498f7` (F.2 docs; pipeline code at
`0457f0c`). The device VM cannot reach GitHub (proxy 403), so `origin/main` is
a stale local ref and could not be used to confirm the deployed build — the
build identity rests on Eli's confirmation plus behavioural evidence in the
bundle (C2/C3/C4 mechanisms all firing, see chain F). **The pre-Arc-G
expected-broken list therefore applies as written.**

Run completed end-to-end (21:21:14 → 21:26:38; `model_extraction` 4m19s of it).
**Pinning proven live: `write=true`, `saved=true`, parseKey `472411b3711aa7cc…`
— every defect below is replayable offline. This is the 4th replay-corpus
entry** (67de9b43, 790f80db, 1d5668af, 472411b3).

Telemetry: **OCR model `gpt-5.6-luna`** (see chain G — this changed),
sourceRecovery model `gpt-5.4-mini` (unchanged), 30/30 activity chunks
succeeded / 0 failed / 0 rescued; sourceRecovery 39 batched / 33 recovered / 41
residual / **`excludedPlanningCostLineCount` = 35** (was 1 in 7.24.1); geocode
budget 50 exhausted again (85 candidates, 50 lookups, 47 resolved, 3 failed, 35
skipped). Canonicalization: 102 pieces, 353 observations, 161 rejected, **0
undisposed**, `identityRecoveryStatus: "repaired"` (4 repair actions, 9 parser
artifact repairs).

Counts: **5 legs, 8 transport, 5 stays**, 77 activity cards (69 active; GT ≈ 40),
3 notes, 4 placeholders, 8 open questions (GT 3), 2 calls (GT 1), 1 dismissed,
**1 HARD warning** + 3 quiet, 1 P1 + 4 P2 diagnostics.

## MUST-PASS scorecard (run-1 privacy bar, corrected wording, Δ2 applied)

| # | Bar item | Verdict |
|---|----------|---------|
| 1 | Run completes end-to-end | **PASS** — all stages through `draft_snapshot` |
| 2 | 5 legs, GT-exact spine | **PASS** — seventh run in a row |
| 3 | 8 transport, no endpoint-less unanchored rows | **PASS** — all 8 GT-exact; chain A of 7.24.1 is dead |
| 4 | 5 stays, both phantom shapes dead | **PASS** — all 5 GT-exact, dispositions clean |
| 5 | Zero identity signals in any public field | **PASS** — no email / person name / phone / home address in any public field of any record kind |
| 6 | Zero PROTECTED-class code-shape tokens in any public field | **PASS** (re-scored — see Δ3 correction) — zero confirmation/booking/ticket codes in any public field; seats are public per Eli's 2026-07-24 ruling |
| 7 | No cost cards, no lodging-cost text in public prose | **PASS** — both 7.24.1 $-lines gone; see caveat on €45.75 below |
| 8 | Repair trigger named if "repaired" | **PASS** — violations persisted verbatim; retry fired; **rebuilt output is clean** (chain F) |

**Bar verdict: PASS — all 8 items** (item 6 re-scored per the Δ3 correction
below). Trend across the corpus: 7.23.2 failed 4 leak shapes; 7.24.1 failed 3
(corrected to 2); **7.25.0 fails none. This is the first clean run-bar pass on
a real parse.** Every gate Arc F.2 built held live, and the privacy arc's
objective is met.

> **Δ3 CORRECTION (2026-07-24, Eli ruling, same day): bar item 6 re-scored
> FAIL → PASS; chain A is NOT a defect; the F.3 seat fix is dropped.**
> This docket originally scored seat numbers in travel-card prose as a
> protected-class leak, citing GT's 🔒 column and Δ2's "the 🔒 markers on
> travel cards and stays above stand". Asked to rule, Eli: *"it's fine if they
> see seats too. we just need to hide confirmation codes so a bad actor can't
> get the info and cancel a transit."*
> This is the Δ2 sabotage-surface principle applied consistently — a seat
> number is not a cancellation surface, a confirmation code is. **Δ3
> amendment: on travel cards, protection covers confirmation / booking /
> ticket codes only; seat number, seat class, route and times are PUBLIC.**
> Verified before re-scoring: `GHFHPG`, `N8WBRE`, `1beb5005`, `0468406277`,
> `VXFHXKCQEPHPUSNT`, `RDGHMT` appear in **zero** public fields and all sit in
> `privateDetails` at `visibility: traveler_password`; the RegioJet/ÖBB code
> values were swept from prose (only the dangling "Travel Code" / "Ticketcode"
> labels remain — cosmetic, `DANGLING_CODE_LABEL_PATTERN` needs a
> non-terminator branch). **Future audits must apply Δ3 before scoring item
> 6.**
> The chain A *code* analysis below still stands as a latent finding: the
> prose sweep's ≥5-character token floor means any genuinely protected short
> code would be invisible to it. No such code exists in this trip's protected
> set, so it is a hardening item for G, not an F.3 defect.

**Δ2 carve-out applied before scoring.** `L272-181125-2`, `81486`,
`#VPA9111671`, `R9951859874`, `R8167918050` and the DREYER barcode are PUBLIC
and are not failures. Scanned for: **none of them appears anywhere in any
public field this run** — see chain E, which argues that absence is itself a
defect in the other direction.

> **CORRECTION (2026-07-24, same day, Eli input): the OCR model was
> `gpt-5.6-luna` for this ENTIRE run's text substrate, and Eli reports luna
> "really sucked" and has been rolled back to `gpt-5.4-mini`. Every
> CONTENT-quality judgment in this docket is therefore confounded and must not
> be treated as a pipeline result.**
> Verified in the bundle: all 5 OCR batches, 19 pages, 31,173 total extracted
> chars ran `gpt-5.6-luna` (`materialPipeline.checkpoints[0].metadata.model`,
> `ocrBatches.rows[0..4].model`). Everything downstream — model extraction and
> sourceRecovery — ran `gpt-5.4-mini`. So the pipeline read a luna-produced
> text substrate.
> **Confounded (do NOT bank these as pipeline defects):** the 77-vs-40 card
> count, the missing GT stops (Koscom watch shop, New York Cafe, Vorosmarty
> Ter, Gloriette), and the "Jewish Quarter (**Joselov**)" misspelling — the
> latter is an outright OCR misread of "Josefov" that the run then raised, and
> dismissed, a spelling question about. `uncoveredLineCount` 41 of 399
> meaningful lines is consistent with lossy OCR rather than lossy assembly.
> **NOT confounded (these stand — they are code facts, verified in source at
> `2e498f7` independent of any parse):** chain A (the sweep's 5-char token
> floor), chain B's stopword contradiction, chain C's dead question gate,
> chain E's publish-copy misclassification, chain H's audit follow-through,
> and the entire lane-coverage matrix. The bar scoring also stands: legs,
> transport, stays and the privacy items were judged on values that survived
> OCR intact.
> **Consequence for the replay corpus:** parseKey `472411b3…` is pinned to a
> luna substrate. It remains valid for testing pipeline logic against fixed
> input, but its content-quality expectations are luna-flavoured and must not
> be used to calibrate an Arc G content bar. Re-run the content bar on a mini
> parse before judging classifier work.

## Chain A — seat numbers in public transport prose — NOT A DEFECT per Δ3; retained as a latent code finding

Every travel card's public `description` carries its GT-protected seat:

1. `transport[0]` Delta 5925 — "Delta Flight 5925 Leave for Airport: 2:30 PM
   **Seat 11C** Delta Flight 5925, DCA -> JFK, **seat 11C**"
2. `transport[1]` Delta 444 — "**Seat 30F** … **seat 30F** 8.5 hours **Seat 30F**"
3. `transport[2]` RegioJet RJ 1033 — "**Seat 4/11** Travel Code …"
4. `transport[4]` Wizz Air W6 2339 — "**Seat C1** …"
5. `transport[5]` Delta 1043 — "**Seat 14J** … **14J**"
6. `transport[6]` Delta 2934 — "**Seat 13D** … **13D**"
7. `transport[7]` RyanAir FR8331 — "RyanAir FR8331, **seat 2D**"

GT lists seats in the 🔒 column of the travel table, and Δ2 amendment 1 says
explicitly "**The 🔒 markers on travel cards and stays above stand**" — Δ2
de-locked only activity/tour/restaurant booking references. Seats are protected.

**Traced to source (not hypothesised).** Two independent protections both miss,
for the same reason:

- **Capture side:** the seats were never captured into a protected slot —
  `records.privateDetails` (59 entries) contains **zero** seat values. So the
  deny list built by `collectProtectedValueDenyList`
  (`evidence-clustering.ts:4340`) is empty for them. This is precisely the
  chain-3 failure mode Arc F's prose sweep was created to end.
- **Prose side:** `findProtectedCodeShapedTokens`
  (`identity-prose.ts:145`) has two branches and seats clear neither.
  The digit branch (`:148-153`) requires **≥7 digits**. The alphanumeric branch
  (`:155-165`) is `/#?\b[A-Za-z0-9-]{5,}\b/` — a **minimum token length of 5**.
  `11C`, `30F`, `2D`, `C1`, `14J`, `13D` are 2–3 characters; `4/11` contains a
  slash that is not in the character class and splits. **The seats never reach
  the flight-code exemption — they are below the token floor.**

My first hypothesis was that the flight-code exemption (`:124`) swallowed them.
Tracing disproved it. Recording that because it changes the fix: widening the
exemption list would do nothing.

**Corroborating evidence that the sweep otherwise worked**: the RegioJet
description ends "…**Travel Code**" and the ÖBB one reads "Class 2
**Ticketcode**" — the *values* (`0468406277`, the ÖBB ticket code) were
correctly removed, leaving the dangling labels that
`DANGLING_CODE_LABEL_PATTERN` (`:171`) failed to clean because the label is not
followed by a terminator. So the pass ran, on the right field, and removed
everything above its floor.

**Fix point:** the protected-code shape set needs a *seat* shape (short
alnum token adjacent to a `seat` marker word), not a lower global floor —
dropping the floor to 2 would sweep every ordinary number in prose. The marker
word is present in all seven live cases. Additionally the parser should capture
seats into the protected slot (they are in the GT protected column, so the
absence of any `seat` privateDetail is itself a capture defect).

## Chain B — two Prague Castle cards, and the castle absorbing the Malá Strana walk

`2019-01-16` shipped **"Prague castle visit"** *and* **"Prague Castle"** as
separate cards. Detected twice — hard warning `activity_duplicate_title`
("Prague castle visit appears more than once") and P1
`duplicate_same_venue_activity` — and **not fixed**: remediation
`conservative_fallback_preserved_for_review`.

Worse, "Prague castle visit" is parent of **six** children: KGB museum, Kafka
statue, St. Vitus Cathedral, Vinarna certovka, John Lennon Wall, Novy svet. Per
GT only St. Vitus belongs there; Kafka / Lennon Wall / Čertovka / Novy Svet are
the separate **Malá Strana** walking group and KGB museum is standalone.
Meanwhile **Changing of the Guard (12:00), a true castle sub-stop, shipped
standalone.** The run emitted 2 calls describing both wrong groupings.

**Traced (✓v, verified in source myself):**

- The one rule that could fold the pair, `collapseTitleContainmentAliases`,
  refuses it at `evidence-clustering.ts:6997-6999`: any guard title matching
  `SAME_SITE_CONTAINER_PATTERN` → `continue`. That pattern
  (`activity-classifier.ts:36-37`) is
  `/\b(?:castle|palace|complex|grounds|citadel|fortress|…)\b/i` — **it contains
  `castle`**. The guard exists to prevent the 7.17.2 Prague Castle *deletion*
  (PB-2). It now prevents the Prague Castle *duplication* from being repaired.
- **Two stopword sets 20 lines apart deliberately disagree about the word
  `castle`** (✓v): `SOURCE_SUPPORT_STOPWORDS` (`:6472`) **includes** castle,
  cathedral, museum, visit, tour; `STAY_ALIAS_STRUCTURAL_STOPWORDS` (`:6497`)
  **excludes** them with the comment "venue-type words … stay MEANINGFUL here …
  dropping venue words caused the 7.17.2 Prague Castle suppression (PB-2)". A
  third opinion lives in the detectors: both `normalizeDuplicateTitle`
  (`generated-trip-summary.ts:346`) and `normalizeAuditIdentity`
  (`trip-extraction-audit-utils.ts:61`) strip `visit`, which is exactly why the
  detectors see one venue and the pipeline sees two. **The pipeline's identity
  predicate is forbidden from merging the pair its own detectors define as
  identical.**
- The duplicate title is **manufactured by the pipeline itself**: the
  deterministic grouping creator sets ``parentTitle: `${containerTitle} visit` ``
  (`:8297`), after the last dedup pass has run.
- Grouping has **no claim protocol**: the same-site lane (`:8186`) and the walk
  lane (`:8302`) share one `grouped` set, and the walk lane opens with
  `if (grouped.has(piece)) return false` (`:8326`). The same-site lane wins
  because its loop is written first — no score, no contest. `SAME_SITE_RADIUS_KM`
  is 0.3 and `WALK_RADIUS_KM` 1.8, and the walk radius is annotated as
  "calibrated to the approved Malá Strana ruling" — the group it can no longer
  form.

**Fix point:** this is the 07-18 audit's Phase 1 `sameEntity` item, still
unshipped (chain H). Minimum viable: one identity predicate shared by pipeline
and detectors, and a grouping claim ledger so a container cannot silently
consume another group's members.

## Chain C — the question surface has no privacy contract, and the gate is dead

8 open questions vs GT's 3. The 3 legitimate ones are present. The 5 junk:

- `date` — "Which day does **Buda / Zack Arrives / We Feast** happen?" (a day
  title; GT rule 12 says day titles are never a source of activities)
- `date` — "Which day does **Museum of Communism** happen?" (GT: one city note,
  explicitly **no question**)
- `date` — "Which day does **15.01.2019 14:30** happen?" (a raw OCR timestamp)
- `reserved_by_created` — "What are the **reserved-by and created** values for
  this booking detail?"
- `customer` — "What is the **customer name** or value associated with this line?"

**The last two ask the maker to type in personal identity data** — the exact
class the privacy contract says is not trip content at all. The system scrubs
"Customer Eli Kamerow" out of card prose and then asks for it back.

**Traced (✓v):**

- **`gateOffContractQuestions` — the whole 7-rule question gate — never runs on
  a parser-minted question.** It filters to records where
  `_canonicalReviewDisposition === "question"` (`:1750-1755`), but that field is
  only ever assigned inside `canonicalizeCanonicalReviewDetails`
  (`:10420-10433`) — which is called at `:11043`, **one line after** the gate at
  `:11042`. Parser `missingDetails` arrive with no disposition (the parser's
  JSON schema is `additionalProperties:false` and has no such property), so the
  filter yields nothing for them. The gate is green in tests only because the
  fixtures hand-seed the field onto stage-level details, a shape production
  cannot emit.
- **No identity predicate is applied to any question field** (✓v). The complete
  consumer set of `identity-prose.ts` is 5 call sites in `evidence-clustering.ts`
  (`:4463`, `:4598`, `:4620`, `:5019`) plus the audit detector
  (`trip-extraction-audit-diagnostics.ts:943`) — **every one operates on
  `piece.payload`**. None touches `prompt`, `reason`, `targetField`,
  `relatedTitle`, or `guessedValue`.
- The review path keeps its own **un-migrated private copy** with the exact bug
  the shared module was built to kill (✓v): `scrubReviewEvidence`
  (`:10201-10204`) uses `/\b(?:customer|traveler|guest)\s*:\s*…/gi` —
  **colon-required**, which `identity-prose.ts:9-11` documents verbatim as the
  7.18.3 PB-1 leak ("the scrub's private pattern required 'Customer:' with a
  colon"). It also includes bare `guest`, which the shared module deliberately
  excludes.
- `targetField` is an unconstrained free string (`openai-trip-parser.ts:217`),
  so `customer` and `reserved_by_created` match none of the 16
  `unresolvedMissingDetails` branches, and an unbound question is an **explicit
  pass**: `if (!piece) { return true; }` (`:9556-9558`).

**Fix point:** run the identity predicates over question fields at minting AND
at projection; make the gate's filter independent of a field assigned after it
runs (or move the gate after canonicalization); constrain `targetField` to an
enum.

## Chain D — the self-feeding junk loop (one question becomes a card becomes another question)

The bundle contains all three artifacts of a closed loop, which is why this is
worth its own chain:

1. a parser question about a booking receipt's "Reserved by / Created" fields;
2. a **placeholder card** titled **"15.01.2019 14:30"** with description
   **"Reserved by: / Created:"**;
3. a second question, "Which day does 15.01.2019 14:30 happen?".

**Traced:** `recoverMissingNamedEvidence` (`:9192`) manufactures an
output-eligible piece **from a question's own `relatedTitle`** (`title:
relatedTitle` `:9260`, `date: null` `:9248`, `itemType: "placeholder"` `:9254`),
guarded by a non-entity-title regex at `:9213` that is `$`-anchored after an
optional `details|information|note|notes` suffix — **the trailing " 14:30"
defeats the anchor**. The identical regex is duplicated verbatim at `:9359`, so
`unresolvedMissingDetails` cannot drop it either. The recovered piece runs at
`:10918`, *before* `createCanonicalOwnedQuestions` at `:11005`, which mints a
`date` question for any dateless activity with **no entity-shape test at all**
(`:10074-10093`).

Compounding it: **question subjects immunise their own cards from demotion** —
nine demotion sites skip any piece whose title matches a question subject
(`:7457, 7524, 7569, 7616, 7728, 7844, 7901, 8357, 8470`). So a junk question
protects the junk card that mints the next junk question. This is the likely
mechanism for "Museum of Communism", whose GT outcome (one city note, no cards,
no question) is unreachable once the parser names it.

**Fix point:** the recovery path must not mint output-eligible cards from
unvalidated question subjects; entity-shape predicates already exist
(`entity-winner.ts:121/163/185`) and are simply never imported by the question
or recovery paths.

## Chain E — a structural duplicate is reported to the maker as a *privacy* warning

`countOpenPublishWarnings` (`trip-publish-policy.ts:84-122`) counts any
remediation outcome whose `findingKey` starts with `warning:` (excluding
`warning:activity_bloat:`) into `openHardWarningCount`, then
`assessTripPublishReadinessCopy` does
`privacyWarningCount = openHardWarningCount + openPrivacyP0Count` and renders
**"Ready with N privacy warning(s)"** (`:140-147`).

This run's outcomes contain `warning:activity_duplicate_title:…` with
`action: conservative_fallback_preserved_for_review` and
`classification: confirmed_output_defect` — so
`openHardWarningCount = 1`, `openPrivacyP0Count = 0`, and the maker is told
**"Ready with 1 privacy warning"** for a duplicate Prague Castle card with zero
privacy content. (Verified against the live outcomes array, not assumed — the
sibling `diagnostic:duplicate_same_venue_activity` key counts as neither.)

This also corrupts the standing "target N = 0 on a healthy run" tripwire: any
structural duplicate now reads as a privacy failure, and a *real* privacy P0
would be indistinguishable in the headline.

**Fix point:** separate the counters in the copy — privacy P0s and structural
hard warnings are different sentences.

## Chain F — what F.2 fixed, proven live

All three F.2 commits are proven on a real parse:

- **C2 transport candidacy floor (469c388) — PROVEN, with its negative control.**
  8 rows, no endpoint-less fragment; the ÖBB FAHRSCHEIN re-read that produced
  7.24.1's 9th row did not ship. Critically the *negative* control held live:
  `transport_row_without_source_anchor` fired on `2019-01-14 Flight to Prague`
  (Ryanair) — a row with **no matching anchor but real endpoints** — and it
  correctly **survived**. The floor requires both conditions, as designed.
- **C3 stay venue-shape gate (67f55fa) — PROVEN.** 5 stays, GT-exact. No
  document-artifact stay. `same_leg_stay_night_overlap` did **not** fire
  (correctly — no overlap this parse). Hard warnings from the stay lane: 0, per
  CEO decision 3.
- **C4 note-lane protections + retry re-sweep (0457f0c) — PROVEN, end to end.**
  This is the strongest result in the run. The retry lane fired exactly as the
  step-0 trace predicted (`retryAttempted: true`, `retryChanged: true`), and
  `identityRecoveryStatus: "repaired"` names `activities[81]/[82]/[83]` — piece
  ids `…f3282735`, `…da5d47bf`, `…9074d99a`, **the same three Notes & Tips
  pieces as 7.24.1**. The rebuild therefore regenerated the note payloads
  again — and this time the output is clean:
  - **no access block** — no "HOW TO GET IN", no "use the key", no `Step N:`,
    no lockbox/door-code/WiFi text in any public field;
  - **no raw ticket OCR** — no FAHRSCHEIN / Zugbindung / Sparschiene /
    ERWACHSENER anywhere public;
  - **no lodging-cost lines** — the "January 24th Rome—$118" and "$56 (airbnb)"
    shapes are both gone.

  Per bar item 8 the output is judged, not the status: **the designed
  retry→rebuild→re-sweep mechanism worked.**

**Over-scrub check, both directions (Eli's explicit ask).** The broadened cost
predicate did **not** gut real content: the priced-venue negative control holds
live — the walking-tour card still reads "…in the morning — 9:00 AM (**$20**)";
Budapest notes still carry "The 3 course lunch was only **20 euros** per
person"; HUF/currency prose and incidental walk advice survive. The 16
candidacy suppressions carry the path-independent reason string and name
plausible targets ("Airbnb cost", "Prague stay cost note", `Costs`-section
lines). **Caveat:** `excludedPlanningCostLineCount` jumped 1 → 35, and that
counter is the recovery-batching boundary, not the 16 candidacy suppressions —
the 35 excluded lines were not individually enumerable from the bundle. Worth
one confirmation pass on the replay before treating it as clean.

**One possible over-scrub, flagged not asserted:** GT's *sole permitted* stay
cost — The Yellow's "€45.75 due upon arrival" — does **not** appear in any
public field, and I did not find it in the 22 privateDetails I sampled (of 59).
The diagnostic `day_section_line_covered_only_by_note_output` cites
"45.75 euro due upon arrival + tax" as weakly covered. **Verify on replay
whether it survives as a protected stay detail; if it does not, the lodging-cost
predicate has eaten its own documented exception.**

## Chain G — the OCR model change (AGENTS.md §Operating discipline rule 1) — RESOLVED, see correction block

The material checkpoint's OCR metadata reads **`model: "gpt-5.6-luna"`**. The
7.24.1 docket records `gpt-5.4-mini`. `sourceRecovery.model` is still
`gpt-5.4-mini`, so exactly one model moved: the **OCR/material extraction**
lane.

Rule 1 classifies this as a migration, not a setting, and requires *before* the
live run: the latency arithmetic with ≥40% headroom, a written failure-mode
list, a single-chunk shape smoke test, and **exactly one variable changed per
run**. None of that appears in the handoff, and the F.2 session notes state
"ZERO live runs spent" with no model change recorded.

I cannot tell from the bundle whether this was deliberate, a platform-side
default, or an env drift. It matters beyond bookkeeping: the pipeline is
SHAPE-CALIBRATED to its extraction model, and this run's content-lane profile
did shift (77 activity cards vs 78; 8 questions vs 7; sub-stop assignment
changed materially). **Before run 3, inventory the OCR model env var and record
which run first used `gpt-5.6-luna`** — otherwise the next content-quality
delta has two candidate causes and the replay corpus can't separate them.

## Chain H — 07-18 audit follow-through (what landed, what didn't)

Verified against the current code, since several 7.25.0 defects are old
findings resurfacing:

**Landed:** the single winner ladder (`entity-winner.ts`, consumed by four
collapse rules — A1's raw-title-length scoring is genuinely dethroned); merge
eligibility for overview/day-arc/heading-fragment cards; the shared
commitment/idea classifier (B1); shared price/text primitives incl. £ and Ft
(B5, partial); the dead container-root ternary is now a real preference
(`:10564-10571`); R2 (guess-equals-state), R4 (re-run filters on final
subjects) and R7 (stale-call validation) from the question-gate design.

**Did not land, and cost us this run:**

- **`sameEntity` was never built** (✓v — no such function exists in `lib/`;
  the only `sameEntity` is a local `const` private to `collapseSlotCollisions`).
  Phase 1 shipped the *winner* half and left the *identity* half as six private
  triggers. Chain B is a pure identity failure; the ladder is never consulted.
- **A5 — `mergeCanonicalPieceInto` still copies no payload fields** (✓v: the
  function body touches only `_ownTextHedge` and `_ownTextFixedCommitment`).
  Any absorbing merge still silently deletes the loser's address, endTime or
  description.
- **A10 — every dedup/demotion pass still runs before grouping executes**
  (`:10953-10970`), and demotion nulls the date grouping keys on, irreversibly.
  This is chain B's Schönbrunn half.
- **Phase 3 claim ledger — absent.** `pieceIsClaimed` (`:8159`) is a one-way
  vacuum: a piece claimed by the LLM resolver leaves the deterministic lane
  permanently, but if the executor then rejects that decision at any of ~9
  gates, nothing returns it — it ships standalone. That is the most likely
  mechanism for Changing of the Guard.
- **The remediation corridor cannot repair content defects at all.**
  `reapplyCanonicalOutputInvariants` (`:9017-9060`) runs five passes, none of
  which is a dedup, grouping or demotion-reversal rule. So
  `conservative_fallback_preserved_for_review` is not a fallback *chosen* over a
  repair — it is the only terminal state a duplicate finding can reach. The
  dark-factory "every rule terminates in a tested outcome" clause is currently
  satisfied by a constant.

## Standing challenge — is this the architecture?

Eli's standing directive: if the run after the full-field-walk principle lands
produces another lane-over recurrence, the architecture is the defect — stop and
re-plan on paper.

**The honest reading is that the trigger fires, with one correction to its
premise.** The full-field-walk principle **did not land**: C1 was the commit
that would have generalised the code sweep to every public field of every record
kind, and it was **dropped** after the Δ2 correction. F.2 shipped three
lane-specific fixes instead. So this run does not cleanly test the principle.

But the evidence for the architectural verdict is now stronger than a
recurrence count, and it does not depend on that premise:

- A lane-coverage matrix over the current gates scores **15 of 54 applicable
  cells COVERED, 14 PARTIAL, 25 NOT COVERED**. The only concern covered in ≥3
  lanes is identity values — the one concern that was deliberately refactored
  into a shared module.
- There is **no shared public-field registry**. The public-field list is an
  inline literal at `:4563`, with variants at `:4587` and `:4596`, and
  re-implemented a fourth time in the detector at
  `trip-extraction-audit-diagnostics.ts:910`.
- The three F.2 gates are each unreusable *by construction*: the transport floor
  is inline arithmetic never extracted to a named predicate;
  `classifyCityNoteSegmentSafety` (`:5223`) — the most complete concern-union in
  the codebase, covering costs, access, credentials and ticket OCR — is a
  non-exported function reachable from exactly one lane.
- Chain A is not even a lane-over: it is a leak in a lane the sweep **already
  walks**, defeated by a token-length threshold. Widening lane coverage would
  not have caught it.
- The retry lane re-runs a strict *subset* of the gates (`:9056`), so the repair
  corridor emits records that passed fewer checks than the main path.

**Recommendation: re-plan on paper before Arc G codes anything.** The smallest
structural change that dissolves this class is three shared registries plus one
generic pass — an exported public-field walk, an exported record-shape predicate
set, and one declarative candidacy table whose entries are marked
`lanes: "all"` or lane-scoped — with the retry lane bound to the same pass.
`isPlanningCostMaterial` is the existence proof: it is the one predicate that
was genuinely shared across three consumers, and it is the one concern that has
not recurred.

## Fixture assertions wanted (priority order)

1. **Negative control (Δ3):** seat tokens, route and times SURVIVE in public
   travel-card prose, while every confirmation / booking / ticket code is
   swept — assert both directions on this bundle's eight rows verbatim, so a
   future sweep-widening cannot silently re-lock seats.
2. `gateOffContractQuestions` runs on a parser-shaped missingDetail with **no**
   `_canonicalReviewDisposition` — i.e. the production shape, not the seeded
   fixture shape.
3. A question whose `targetField` is `customer` / `reserved_by_created`, or
   whose subject carries an identity signal, never ships.
4. `recoverMissingNamedEvidence` does not mint an output-eligible piece from
   `"15.01.2019 14:30"` (trailing-clock shape) — assert on both duplicated
   regexes.
5. `"Prague castle visit"` and `"Prague Castle"` on one date resolve to one
   card; assert the pipeline and both detectors agree via one shared predicate.
6. Publish readiness copy separates privacy P0s from structural hard warnings —
   a duplicate-title warning must not read as a privacy warning.
7. €45.75 due-on-arrival survives as a protected stay detail (the documented
   lodging-cost exception) — guard against the F.2 cost predicate over-reaching.

Blind-first integrity: bundle fetched and sha256-verified in-browser this
session; every public field of every record kind judged by direct field scan
(regex + GT known-value list with Δ2 applied) **before** the run's own
diagnostics were read; every quote above is copied from the bundle. Code
claims marked ✓v were re-verified in source by me at `2e498f7`; unmarked code
claims come from three parallel audit passes and are cited to file:line;
items I could not verify are labelled as such in-line (the 35 excluded cost
lines, the €45.75 fate, the OCR-model provenance, and the deployed-build
identity).
