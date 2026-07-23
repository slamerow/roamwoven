# Run 7.23.2 root-cause docket — trip dea9d239 (2026-07-24, first run on 14098e3)

Trip `dea9d239-a197-48c3-b1cd-a52c2b0c9673` ("7.23.2"). Bundle fetched live via
`/data/audit/qa-bundle?includePrivate=1` through the maker session: 225,118 B,
sha256 `cb4b13518edb1700105467707e14a1f714e1bef9ad6ec231327dc5d7249475d7`.
Build verified before analysis: `origin/main..main` empty at 3850f07 on top of
14098e3; tree clean. Single processing run 63bfcaf1 (11:05:20Z) **COMPLETED**
end-to-end. **Pinning proven live: write=true, saved=true, 62 calls, parseKey
`790f80db92b4…`** — this parse is replayable. This docket supersedes the
symptom-level draft of the same date: every defect below is traced to its
mechanism in code (file references at 3850f07), and two of the draft's claims
are explicitly CORRECTED (chains 2 and 5).

Telemetry: gpt-5.4-mini, 30 chunks / 0 failed (~1m46s); sourceRecovery 55
batched / 41 recovered / 54 residual (7.23.0r: 72/65/7); geocode budget 50
exhausted, 75 candidates, 25 skipped. Counts: 5 legs, 8 transport, **6 stays
(5 correct + 1 phantom)**, 73 actives (GT ≈ 40), 4 open questions + 1
dismissed, 2 calls, 1 placeholder, 1 hard warning, 4 bloat warnings.

## MUST-PASS scorecard (bar from the 7.23.1 handoff)

| # | Bar item | Verdict |
|---|----------|---------|
| 1 | Run completes, no assembly-recovery-required | **PASS** |
| 2 | 5 legs | **PASS** — exact GT spine; ddb1699's kill held (see chain 4 proof) |
| 3 | 8 transport rows | **PASS** — GT-matching; no reversed twin (8b5afa1 held) |
| 4 | Zero protected values / personal names in public prose | **FAIL** — three leak shapes, chains 1–3 |
| 5 | No Cesky-Krumlov / cost-line cards | **PARTIAL** — chain 4 |
| 6 | excludedPlanningCostLineCount > 0 | **UNVERIFIABLE** — serializer drops the field (chain 8) |
| 7 | identityRecoveryStatus ideally not_needed | **NOT MET** — "repaired", trigger unknowable (chain 7) |

---

## Chain 1 — email-as-title card: the scrub/detector field asymmetry

**Observed:** `records.items[66]` is an activity card **titled
`Eli.kamerow@fiscalnote.com`** (Jan 17, rental-voucher contact email), in the
public payload. The run's own P0 diagnostic caught it
(`identity_value_in_public_prose`, "[email]").

**Why it shipped.** There are two identity scrubs and neither covers titles:

- `sanitizeCanonicalCardDescription` (evidence-clustering.ts ~4590) is the
  identity-hygiene pass that uses `segmentCarriesIdentityValues` — the
  predicate whose EMAIL_PATTERN would match this string. It runs on
  **descriptions only**.
- `scrubProtectedValuesFromPublicProse` (~4200) handles the title field, but
  for titles it applies ONLY the deny-list containment check (title emptied if
  it contains a protected stay/transport value) plus — for description-like
  fields only — `scrubBookingFieldNames`, which is marker-anchored
  ("Client:", "Passenger…"). A bare email title matches neither: it is not a
  deny-list value and has no booking-field marker.

Meanwhile the audit detector (trip-extraction-audit-diagnostics.ts ~818)
scans `[title, description, summary, address, locationName]` with the full
identity predicates. identity-prose.ts's header comment says scrub and
detector "must judge the SAME shapes … so both import these predicates
instead of keeping private copies" — **the shapes are shared but the FIELD
COVERAGE is not**: detector sees titles, scrub never does. That asymmetry is
the entire defect.

**Why remediation didn't save it:** trip-quality-outcomes.ts is a
classification/bookkeeping layer. `conservative_fallback_preserved_for_review`
(line ~178) is the default label for any persisting serious finding without a
precise open question — **no code path mutates output in response to an
identity finding**. The pipeline can prove a P0 leak and still ship it.

**Fix point:** run the identity predicates over the same field list the
detector scans, at the output boundary; make `identity_value_in_public_prose`
a scrub-or-quarantine action, not a log line.

## Chain 2 — phantom stay "Eli J Kamerow": a record kind with no candidacy gate, no scrub, no detector

**Observed:** `records.stays[5]` = name "Eli J Kamerow", no dates, no leg, no
address, reviewRequired=true, name public. GT stays are exactly 5 (all 5 also
shipped correctly).

**Why it exists.** The parser emitted a stay-kind piece named from a booking
passenger/Client field (the ÖBB FAHRSCHEIN "Zugbindung Kamerow Eli" block is
on OCR page 17; the voucher Client field is the other candidate — not
distinguishable from the bundle because **shipped pieces get no lineage
rows**, see chain 8). Assembly then has no stay candidacy rule: stays are
merged/reconciled (`reconcileCanonicalStayIdentity`, evidence-clustering
~4330: same-venue token match + overlapping ranges) — a DATELESS stay never
range-overlaps anything, so it merges with nothing and nothing else judges
it. Compare: activities have committed-mention candidacy, transports have
anchor/fragment rules; stays have no equivalent.

**Why nothing caught it.** Triple hole: (a) no minting gate (above); (b) the
privacy sweep never touches stay names — stays only CONTRIBUTE to the deny
list (`collectProtectedValueDenyList` reads stay address/confirmation), their
own fields are never swept, and `BOOKING_NAME_FIELD_PATTERN` wouldn't fire on
a bare name anyway; (c) the identity-leak P0 detector scans `records.items`
only — stays are structurally invisible to it, which is why the diagnostic
evidence lists the email card but not this.

**Fix point:** stay candidacy (a stay requires a night: check-in or
night-coverage evidence — GT night-coverage rule makes this well-defined);
add stays/transport to the identity detector's and sweep's field walk;
person-name-shaped stay names are booking material.

## Chain 3 — ticket codes in transport descriptions: capture-dependent deny list, and the audit trap that hid it

**CORRECTION of the draft docket.** The draft said "codes are redacted in the
public view ✓". That redaction is `redactSensitiveText` in
**trip-extraction-qa-bundle.ts** (~62) — a serve-time cosmetic mask applied
ONLY when serving the qa-bundle without includePrivate (its phone-shaped
digit-run pattern is what printed "[redacted phone]" over ticket codes). It
does not touch the stored records, and no equivalent exists in the traveler
path (grep of traveler-view-model.ts / trip-privacy-policy.ts: zero
redact/scrub sites). identity-prose.ts's own comment documents this exact
trap: "the QA bundle's redaction markers made live-run 7.18.3 LOOK clean to
the auditor." The draft fell into it; this docket corrects it.

**The real state:** the shipped transport descriptions contain
"travel code 0468406277" (RegioJet) and "ticket code 2159 1990 1842 0436"
(ÖBB) — GT-protected values — in the actual records.

**Why f58a61b's sweep missed them.** The sweep DID run on transport
descriptions (that part of f58a61b works). But its deny list
(`collectProtectedValueDenyList`) is built from (a) protected stay/transport
FIELDS and (b) code tokens inside captured **sensitive details**. This run
the parser captured NEITHER code anywhere: all 50 privateDetails were
checked — zero contain 0468406277 or 2159-1990-1842-0436 (the ÖBB row's
confirmationLabel is the garbled string "Operator"; the real booking
VXFHXKCQEPHPUSNT was never captured either). An empty deny list sweeps
nothing. f58a61b's design assumes the code is captured SOMEWHERE protected;
under unpinned parse variance that assumption fails silently — 7.23.0r
captured the ÖBB Ticketcode as a sensitive detail, 7.23.2 did not.

**Fix point:** the sweep needs a prose-side code-shape pass (the same token
patterns `protectedCodeTokensFromSensitiveValue` already defines) applied
directly to transport/stay-adjacent prose, so protection stops depending on
the parse having ALSO captured the value in a protected slot. Plus: a
capture-miss telemetry signal when a transport row has no
confirmation-shaped value at all ("Operator" label = detectable garbage).

### Chain 3b — stay arrival-directions in public prose (2 sites; credit: Eli's second-opinion audit caught the note-lane site)

Same contract (GT protects stay "getting there" material), different lane:
(1) admin card "The RomeHello Hostel access details" ships the full
directions-from-Termini walk publicly; (2) the public Rome Notes & Tips
carries The Yellow's protected walking-directions block verbatim ("Exit the
train station onto Via Marsala by track 1. Find Via Marghera…" — GT stays
table, Rome 1 row). The stay-arrival attachment rule
(evidence-clustering ~3240, "stay arrival/access instructions attached to
stay record") only matches text that names a known stay or contains an
address; direction prose that names neither ships as ordinary
activity/note content, and the CREDENTIAL_SENTENCE_PATTERN drop only covers
key/code/wifi/buzzer sentences, not route directions. Fix point: the
arrival-directions shape ("directions from/to <station>", turn-by-turn
prose near a stay's leg) routes to the stay's protected details regardless
of whether the stay is named; notes are swept by the same rule.

## Chain 4 — "Vienna lodging cost" card: the Costs exclusion is path-local

**Observed:** admin card "Vienna lodging cost" (Jan 20, "Private room
ensuite lodging cost for Vienna") shipped. No Cesky Krumlov content anywhere.

**Mechanism, proven inside one bundle:** lineage row `…0c85bd5f` "Vienna
lodging cost" — observation kind `context`, source `model_chunk`, sourceLabel
literally the Costs line "January 19th Vienna- $72 (private room- ensuite)"
— was SUPPRESSED. The shipped card `…b3be4619` is the same Costs line arriving
as a second model_chunk observation shaped as an admin activity. ddb1699
excluded Costs lines from **source-recovery batching**
(source-recovery.ts:110–166) — that path held: the Cesky Krumlov line sits in
residual-uncovered, and legs stayed at 5. But nothing gates Costs-section
content at the chunk-extraction or activity-candidacy boundary, so whether a
cost card ships depends on which PATH re-emits the line. Same class as
7.23.0r's "Prague lodging price note", one lane over.

**Fix point:** the Costs-section test belongs at the canonical candidacy
boundary (any observation whose source section is Costs), not inside one
producer.

## Chain 5 — the Kutna Hora gutting: numeric section label defeats the day-plan pattern

**Observed (worst content loss):** Sedlec Ossuary, Church of St Barbara,
Silver mines — GT's committed Jan 17 day trip — all suppressed
`"dated idea list: the section commits nothing"` and folded into Prague
notes.

**Mechanism, airtight from lineage + code:** all three observations carry
sourceLabel **"17.1.2019 20:00"** — the rental voucher's return-time heading,
which the parser attributed to the adjacent day-trip sights instead of the
day heading. In `classifyIdeaListSections` (activity-classifier.ts:221):

- `DAY_PLAN_LABEL_PATTERN` (line 175) recognizes ONLY English weekday/month
  names — "17.1.2019 20:00" fails it, so the group keys as a NOTES BLOB
  section, not a day plan;
- the three sights are untimed → `hasFixedEvidence` false (the day's one
  fixed entry, "Pick up car 9:00 AM", carries a different section label so it
  can't rescue the group);
- group size 3 ≥ floor, all entries labeled, none day-plan-labeled →
  `notesBlobSignal` TRUE → demote all three (signal (b), line 252).

Two independent root causes, either fix kills it: (1) parser section
attribution let a booking-document timestamp own day-section sights
(pinned — replayable); (2) the day-plan label vocabulary cannot read numeric
European dates, so a legitimately dated section is structurally guaranteed to
count as a notes blob. (2) is the cheap, deterministic fix:
`17.1.2019`-style labels are day-plan labels.

## Chain 6 — St Stephen's (Vienna) and the fold-then-rejudge contradiction

**CORRECTION of the draft docket.** The draft attributed this kill to
"traveler movement represented by canonical transport" — that was raw-JSON
adjacency, not this piece's action. The actual lineage:

- piece `…df513df4` (Jan 20 copy, the committed day-plan mention) and piece
  `…f1360cd5` (merged, **date: null**, holding BOTH the Jan 19 idea copy and
  the Jan 20 copy) show the action chain:
  1. `"cross-day repeat: the deliberate day-plan copy is the planned
     sighting; the loose copy folds in (ground truth v2 dedup)"` — the fold
     rule correctly IDENTIFIED the Jan 20 copy as the deliberate one;
  2. `"repeated across days but never committed anywhere in the source: one
     city note, no cards, no question"` — a later rule re-judged the merged
     piece from raw commitment evidence (no time/booking/first-person) and
     demoted it anyway;
  3. the merged piece also LOST ITS DATE (date: null), so no day card could
     exist even in principle.

**Root cause:** the cross-day fold's determination ("this copy is the
planned sighting") is expressed only in an action string — it is never
STAMPED on the merged piece as commitment evidence, so the downstream
never-committed rule (which cannot see fold conclusions) contradicts it.
This is the same mechanism as the Prague Castle collapse (now on its 6th
run, shipped as a placeholder + which-day question this time) and 7.23.0r's
Jan 18/20 kills: a dedup/fold rule elects a winner, then the card-vs-note
rejudgement kills the winner. Fixture assertion 5 from the 7.23.0r docket
covers exactly this; unfixed (queue item c). Same family, second Basilica:
Budapest's Jan 22 St. Stephen's/St. Istvan's (GT sequenced card) died
`"removed stay, activity, and travel evidence before city-note merge"` →
Budapest note collection.

**Fix point:** fold winners carry a `deliberateMention` stamp that the
never-committed rule must honor (and the fold must preserve the winning
copy's date).

## Chain 7 — Vienna Jan 19 idea flood + the vanished baths question: one classifier, two exits, neither is "city note"

**Observed:** ~10 Jan 19 idea items shipped as cards (Ferris wheel, Mumok AND
Natural History separately — GT: one "or" card — Museum of Illusions,
Mozarthaus, Ring Tram, Prater, Leopold, St. Charles, Hundertwasser,
Meteorite). GT sends all to Vienna notes. Meanwhile GT question #3 (baths)
never surfaced, and `dismissedQuestions: 1`.

**Why the ideas shipped.** Two disjoint mechanisms at the
`classifyIdeaListSections` call site (evidence-clustering ~7320):

- Researched entries are EXEMPT by design: "Ferris wheel (free-10)",
  "Natural History Museum (free-10)" carry price/hours markers →
  `PRICE_MARKER_PATTERN` filter removes them from idea-list judgement
  entirely, on the theory that researched lists go to a maker question. The
  question path minted for the Jan 18 trio only — for Jan 19 no question
  minted, and the exemption's fallback is SHIP AS CARD. The exemption assumes
  a question that isn't guaranteed to exist.
- The unresearched remainder (Mozarthaus, Illusions, Leopold…) grouped under
  the legitimate day-plan label "Saturday, January 19th" → notesBlobSignal
  false; no hedge vocabulary; museums aren't recommendation-category → **no
  signal fires** and the classifier keeps them. The classifier's idea-list
  definition requires a lexical/structural signal; a bare researched sight
  list under a day heading has none. (7.23.0r killed these same items the
  OTHER way — note-copy folds — because that parse emitted note-role
  copies; this parse largely didn't. Direction flip = parse variance, now
  replayable: 790f80db vs 67de9b43.)

**Why the baths question died.** Gellert Bath House / Baths pieces were
note-folded (`"canonical Budapest note collection"`, lineage). The
subject-resolution dead-target sweep (evidence-clustering ~1770, part of the
Arc E/14098e3 reconciliation) then dismisses any question whose subject
piece is no longer output-eligible: `"subject entity was suppressed by
assembly; a question cannot outlive its subject"`. `dismissedQuestions: 1`
is consistent; the bundle stores no dismissed-question content (chain 8), so
this is the handoff's dismissed-question quality check confirmed as a live
loss: **the dismissal rule worked as designed on a subject the note-fold
should never have killed** — 14098e3 converting an upstream classification
error into silent question deletion. The GT-correct outcome (bathing is in
the day title; both venues are options) is a trip-level question that
survives subject loss.

**Fix point:** (a) a researched-list exemption must terminate in a question
or fall back to DEMOTION-WITH-DISPOSITION, never silent card promotion;
(b) a dismissed question whose prompt matches a day-title anchor re-binds to
trip level instead of dying (the dismissal already knows the subject text).

## Chain 8 — telemetry gaps that blocked this audit (all one-line-class fixes)

1. **Repair trigger discarded at the event boundary.** The corridor
   (canonical-trip-assembly.ts:703–718) computes
   `recoverySummary().initialViolations` — the actual violation strings —
   but the extract route's `summarizeFinalizationUsage`
   (app/…/data/extract/route.ts:168–179) persists only
   actions/attempted/status. That is the precise reason must-pass item 7 is
   unknowable: status "repaired", 4 actions, no violation text anywhere in
   the bundle. canonical_validation reported not_needed, so the trigger was
   artifact-inspection-time; WHICH invariant fired cannot be determined
   until this field is persisted. One field addition.
2. **`excludedPlanningCostLineCount` computed but never serialized** —
   source-recovery.ts:53/110/166 produce it;
   trip-extraction-audit-snapshot.ts:216's whitelist drops it. Must-pass
   item 6 was unverifiable by construction.
3. **Shipped pieces have no lineage** (bundle lineage = suppressed +
   missing_from_structured only), so the phantom stay's source observation
   cannot be traced from the bundle; **dismissed questions keep only a
   count**, so chain 7's dismissal is inference rather than quotation.
4. Cosmetic but misleading: qa-bundle's serve-time mask labels ticket codes
   "[redacted phone]"; ÖBB confirmationLabel shipped as the literal string
   "Operator".

---

## What held, what didn't, attribution

- **14098e3 achieved its P0** — the run completed; both 7.23.1 signatures
  gone. Its subject-reconciliation half also executed as designed — and that
  design, fed by an upstream misclassification, is what deleted GT question
  #3 (chain 7). Repair still engaged; trigger unknowable until chain-8.1.
- **f58a61b held on its tested shapes** (booking-field names in prose:
  the 7.23.0r Client/GoEuro card set is gone entirely) and failed one lane
  over on each axis: titles instead of descriptions (chain 1), stay names
  instead of card prose (chain 2), uncaptured codes instead of captured ones
  (chain 3).
- **ddb1699 held** (no recovery-minted legs — the 5-leg spine is proof) and
  its exclusion is path-local (chain 4).
- **8b5afa1 held** (8 rows, no twin).
- **The card-vs-note classifier is the dominant defect source** (chains 5,
  6, 7): three distinct mechanisms — label-vocabulary miss, fold-then-
  rejudge contradiction, exemption-without-terminal — not one bug. All three
  are now replayable against parseKey 790f80db offline before any live run.
- Real wins vs 7.23.0r: junk-shard cards 9→~6 with the entire old set gone,
  GT questions 1→2 minted (Vienna trio first-ever), castle visible as
  placeholder, Rome notes clean, zero junk-fragment questions, zero Costs
  text in prompts.

## Fixture assertions wanted (priority order)

1. Identity predicates cover every public field the detector scans — title,
   stay name, locationName included (chain 1/2 live shapes verbatim); an
   `identity_value_in_public_prose` finding forces scrub-or-quarantine.
2. A stay requires night evidence; person-name-shaped, dateless stays are
   booking material (chain 2 shape).
3. Code-shaped tokens in transport/stay prose are swept even when captured
   in NO protected slot (chain 3 shape: deny-list empty, prose still clean).
4. Costs-section observations fail canonical candidacy regardless of
   producing path (chain 4's suppressed-twin/shipped-card pair).
5. A numeric-dated section label ("17.1.2019 20:00") is a day-plan label;
   Kutna Hora's three sights survive with exactly this lineage (chain 5).
6. A cross-day fold winner keeps its date and carries a deliberate-mention
   stamp the never-committed rule honors (chain 6; supersedes 7.23.0r
   fixture 5, still open).
7. Researched-list exemption terminates in question-or-disposition;
   a subject-loss dismissal of a day-title-anchored question re-binds to
   trip (chain 7 both halves).
8. `initialViolations` and `excludedPlanningCostLineCount` appear in run
   telemetry (chain 8; assert on a staged run's bundle).

Blind-first integrity: bundle fetched and sha256-verified in-browser this
session; all lineage/action/observation quotes are copied from the bundle;
all code claims reference files read at 3850f07. The two corrections
(chains 3, 6) each replace a draft claim with the mechanism the evidence
actually supports — the draft's raw-text adjacency error and the qa-bundle
redaction trap are documented above so the next audit doesn't repeat them.
