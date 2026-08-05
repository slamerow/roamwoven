# Handoff — the City Note loss (resolved 2026-08-05)

## Resolution and current stopping point

The pinned root cause was in final output sanitization, not demotion or City
Note grouping. The Prague collection initially contained `Sights & Culture:
R2D2 (far away)`. `sanitizeCanonicalCardDescription` split on sentence
punctuation but not newline-delimited sections, so it combined that safe section
with a later phone-bearing `Getting Around` section. The privacy gate correctly
detected the phone and then removed the whole combined segment, including
R2D2. Newline sections are now sanitized independently: R2D2 ships and the
phone still does not. Regression: `tests/city-note-demotion-preserves-city.test.ts`
B7.2.

The four prohibited synthesized placeholders are also gone. Raw named-source
review details now wait until final canonical subject resolution. Exact-title
and unique title-containment matches bind to a real surviving record (including
`Prague Castle` → `Prague Castle visit`); only a genuinely unextracted subject
is dismissed from the maker queue and retained as a source-coverage finding.
Regression: `tests/evidence-clustering.test.ts`.

The separate accessory-routing survivor-chain defect is now resolved as its own
change. A mixed note segment may name both plan records that already survive as
Activities and idea records previously folded into the note as their single
home. The old router removed that entire segment after finding any surviving
Activity. It now forwards a note-owned duplicate to one unambiguous surviving
Activity, preserves every other note-owned item with its title and useful
description, and records the actual absorbing record(s) when a note is fully
redistributed. `Apple Studel Show` reaches the surviving `Apple Strudel Show`
card; `Ferris wheel` reaches the Vienna City Note; the intermediate
`Schönbrunn visit` note reaches that final collection instead of ending at
`NOTE_CONTENT_REDISTRIBUTED_NO_SINGLE_SURVIVOR`. The production-shaped mixed
list regression is in `tests/assembly-ground-truth-run9.test.ts`.

The subsequent classification work order first corrected this measurement:
the replay had been running with geocoding disabled, so seven grouping checks
were unjudgeable and the assembled configuration differed from production.
The scorecard now reattaches the matching saved run's 91 verified results to
its 122-candidate pool and aborts on any stable-id or pool drift. The honest
pre-classification baseline was **FAIL 10 · NOT CHECKABLE 1 · NOT BUILT 3 ·
PASS 17**.

Block typing is now implemented before slot/title/repeat identity. It emits a
served audit ledger with `plan`, `ideas`, `logistics`, `evidence`, and
`ambiguous` decisions; only `ideas` demotes silently. Jan 19's scattered
Vienna blocks route to City Notes, Schönbrunn owns exactly its five supported
sub-stops, and Jan 20 keeps the selected St. Stephen's copy. The generic
seven-card maker warning is gone; density only triggers internal block
re-evaluation.

A post-STOP canonical-identity follow-on then removed the two Jan 16 Trdelník
cards. The two records came from separate parser passes over the same PDF and
differed by one omitted character (`Trdlnik` / `Trdelník`). Canonical intake
now treats one-character drift as one occurrence only when date, city, source
file, token shape, and booking identity agree; short neighboring names remain
separate. The correctly spelled title wins, and the duplicate never reaches
the geocode grouping lane. That also makes `GRP-1` fully checkable and PASS.
That checkpoint scored **FAIL 2 · NOT CHECKABLE 0 · NOT BUILT 2 · PASS 27**;
the current result below is written to
`docs/assembly-scorecard-2026-08-05-run-8.1.0-from-cache.md`.

A second bounded follow-on fixed the actual geocoder-collision cause. The old
`GRP-2` assertion counted eight shared-coordinate groups, but six were aliases
or legitimate same-site resolutions. The unsafe path was a locality retry
borrowing the day's container even when the container's own description did
not list the candidate. Container retries are now source-bounded. Four saved
retries remain accepted (Changing of the Guard, both Apple Strudel spellings,
and Panorama Train); five are refused before lookup (Museum of Illusions ×2,
Ring Tram Tour ×2, and Trdelník). Replay applies the current acceptance policy
to the saved provider output, while still failing closed on pin drift.

A third bounded follow-on replaces the repeat-city presentation workaround
with real City Note identity. New note records now carry one `cityNoteKey`, no
date, and no owning `legId`; every matching leg is only a display anchor. The
same Rome note therefore appears on both Rome legs without being owned by the
first. In-range source dates may resolve a day-trip note to its parent leg-city
and are then discarded. Same-named cities in different countries remain
separate, unplaceable notes are retained in `needs_review`, and old leg-owned
snapshots still render through a compatibility path. Maker move-to-tip actions,
summary, review, traveler projection, fingerprints, and served audit lineage
all use the shared key. Work order:
`docs/city-keyed-notes-work-order-2026-08-05.md`.

A fourth bounded follow-on completes stable maker-decision anchors without
building reprocessing. Every new Question and Call carries a versioned
leg/date/title or source reference. The maker route persists trusted primary
and related anchors, legacy rows keep direct-id behavior, and a stale id may
rebind only to one unique compatible record; ambiguity mutates nothing.
Compound actions are atomic if any related anchor cannot resolve. Fingerprint
version 3 and the redacted QA bundle expose the anchors, and the scorecard
validates their subject type and source-reference shape. Work order:
`docs/stable-decision-anchors-work-order-2026-08-05.md`.

A fifth bounded follow-on closes the locked Δ4 travel-card serving defect.
Every generated transport row now becomes one traveler card built only from
its structured public face. The raw description is a fail-closed protected
container: new and legacy rows share the same effective visibility, public
snapshot JSON receives no raw description, transactional publish stores one
derived private detail, and the existing one-shot password route returns it
only after valid authentication. Redacted QA and the audit use that same
public/private boundary; fingerprint version 4 includes it. The old
prose-side code sweep remains deliberately unchanged. Work order:
`docs/travel-card-protected-container-work-order-2026-08-05.md`.

A sixth bounded follow-on repairs the production-shaped Question gate. The old
call ran before parser details had a canonical disposition, so seven rules were
dead on real parser output and seeded fixtures overstated coverage. Subject and
disposition assignment now precede the gate inside the shared canonicalization
boundary. Off-contract asks remain in the audit as `dismissed` with a reason;
genuinely material asks remain open. Work order:
`docs/production-question-gate-work-order-2026-08-05.md`.

Two CEO rulings then close the remaining product choices. Source wins for
Mumok/Natural History: they are separate source lines and now remain separate
Vienna City Note ideas, with no fabricated `or`, Activity, or Question.
The stale parser-prompt and synthetic-normalizer examples that still named this
false disjunction were replaced by a neutral explicit-`or` control, and the
prompt now forbids inferring `or` from adjacent lines, proximity, or venue
knowledge. **The bounded paid pre-deploy prompt smoke passed 2026-08-05:**
unchanged `gpt-5.4-mini`, 2 live calls, 1/1
activity chunk succeeded, 3 observations, no rescue or source-recovery call;
the adjacent-lines negative and explicit-`or` positive controls both held.
Password OFF now collapses follower mode and starts every share-link holder in
fully unlocked traveler mode with all `traveler_password` details; password ON
retains the locked follower state until one correct password. Private values
remain outside immutable `snapshot_json` and are joined from snapshot-scoped
private rows only for the authorized view. Work order:
`docs/password-off-traveler-mode-work-order-2026-08-05.md`.

The classification work order's explicit STOP remains intact; all eight
follow-ons are separately measured changes. Current pinned score is **FAIL 0 ·
NOT CHECKABLE 0 · NOT BUILT 0 · PASS 31**. `ORD-4` is PASS with 8/8
maker-facing anchors valid. RW-GRP-001 and RW-ORD-001 remain `KNOWN_GAP` under
the fresh-live-run return condition; replay proves the current deterministic
assembly code path against the pre-prompt-change provider output, not live
provider coverage. After the source correction removed the stale false museum
example from the model prompt, the old extraction pin correctly became a cache
miss; strict replay now refuses to call that old pin current. The full 84-file
suite / 43 Node cases, production-shaped negative controls, typecheck,
optimized production build, scorecard table/citations, and diff hygiene pass.
The bounded paid prompt smoke and one authorized fresh production extraction
must create the new pin before strict replay, publish, and browser observation
can close the live-coverage labels.
The one-run procedure, capacity arithmetic, failure costs, and rollback are
locked in `docs/live-run-preflight-2026-08-05.md`.

Release-package privacy hygiene is also closed. Generated scorecards now cite
the answer-key line plus a safe expected phrase instead of copying the full
source line into a committable report; citation-drift errors likewise never
echo the source. Historical scorecard files in this change were scrubbed, the
local `.assembly-cache/` and source PDF remain excluded from the commit, and
the City Note sanitizer regression uses an explicitly fictional phone number.

The remainder of this document preserves the investigation record. Three
careful diagnoses failed before instrumentation found the cause; **the value of
the history is the ruled-out list.**

At the start of this investigation: branch `assembly-restructure-phase-1`,
HEAD `6e8a5ae`, working tree clean; suite green (43 tests, 79 files). Baseline:
**FAIL 10 · NOT CHECKABLE 7 · NOT BUILT 3 · PASS 11**.

---

## The bug

A record is demoted to a city note, is folded into that city's note collection,
and the note that ships does not contain it. It is gone from the product.

Canonical case: **R2D2**. The source says "R2D2 (far away)". A locked contract
rule (RW-CLS-001 doubt markers) says that must silently demote to city notes.
**The demotion fires correctly.** The note ships without it.

Also lost at the start, through a DIFFERENT mechanism (resolved separately in
§4): `Ferris wheel`, `Apple Studel Show`, `Schönbrunn visit`.

---

## 1. RULED OUT — do not re-propose these

Each was proposed, implemented, measured, and produced a **byte-identical**
result. Two of the fixes are still in the tree, labelled as latent-correctness
rather than the fix.

| Theory | Verdict |
|---|---|
| City Notes drop everything that isn't Food or Drinks | **FALSE.** The Vienna note has a populated `Sights & Culture` section containing State Hall Library, Time Travel Vienna, Mumok, Natural History Museum and St. Stephen's Cathedral. |
| Demotion wipes the record's date before the code uses that date to resolve its city, so it never joins a city group | **FALSE for this parse.** Fix landed; A/B with it disabled is byte-identical. R2D2's piece already carries `city: "Prague"`. |
| The record's description sanitises to an empty string, so nothing reaches the section classifier | **FALSE for R2D2.** Its description is `"R2D2 (far away)"`. The fix rescues a synthetic empty-description case; it does not move R2D2. |

Also verified and NOT the cause:
- R2D2 **does** join the Prague group — its action reason is the group-specific
  string `"canonical Prague note collection"`.
- The safety classifier (`classifyCityNoteSegmentSafety`) does not match it —
  its cost/access/booking/OCR patterns were run against the literal text.
- Section classification is fine: `category: "art_culture"` maps to
  `Sights & Culture`, and `classifyCityNoteSection` has a `"Notes"` catch-all,
  so even unclassifiable content should land.

## 2. Known true, from measurement not reading

- R2D2's piece at end of pipeline: `kind=note`, `city="Prague"`,
  `role=atomic_candidate`, **`outputEligible=false`**, description present.
- Its disposition: `{kind:"survivor", survivorId:"piece_4b57a9f01b7f303ef3282735"}`
  — the gate believes it was filed.
- Its last two actions: `recovered: source doubt marker (...) demoted to city
  note`, then `rejected: canonical Prague note collection`.
- **St. Stephen's Cathedral is rescued and R2D2 is not.** St. Stephen's carries
  a third action R2D2 lacks: `recovered: note content restored by the
  city-note collection integrity check`.
- The Prague note ships at 222 chars: Food + Drinks only, no `Sights & Culture`
  section at all. Vienna's ships at 820 chars WITH one.

**The sharpest open question:** the integrity check in `mergeCanonicalCityNotes`
demonstrably works — it rescued St. Stephen's on this very run. Why does it not
run for R2D2?

One lead nobody has chased: `mergeCanonicalCityNotes` snapshots its working set
as `pieces.filter(p => p.kind === "note" && p.outputEligible)`. R2D2 is
`outputEligible: false`. Establish **when** it became false relative to that
snapshot — before, and it was never in the machinery at all, and the "rejected:
canonical Prague note collection" action came from a different path.

## 3. The method to use — instrument, do not reason

Three attempts have now failed by reading code and reasoning forwards. Do not
make a fourth. Print what actually happens:

Inside `mergeCanonicalCityNotes`, log for one run: every piece entering the
`notes` snapshot; every piece reaching each city's `group`; every candidate the
restore loop considers; every candidate it appends; and every early `continue`
with its reason. Then find the line R2D2 does not reach.

`scripts/probe-city-notes.mjs` already exists and walks the layers from outside.
It is what produced §2. Extend it or instrument the function directly.

## 4. Second, separate mechanism — resolved 2026-08-05

`Ferris wheel` and `Schönbrunn visit` die differently. `Ferris wheel` folds into
a city-note copy; that copy (`Schönbrunn visit`) is then itself dissolved
carrying the terminal code `NOTE_CONTENT_REDISTRIBUTED_NO_SINGLE_SURVIVOR`
(recorded by the new removal gate — this is the gate paying for itself on day
one). The survivor chain breaks in the middle. Likely lives in
`canonical-accessory-routing.ts`'s `routeDatedNoteEvidence`, not in
`mergeCanonicalCityNotes`. **Do not assume one fix covers both.**

That diagnosis was correct. The note contained a punctuation-less mixed list,
so one match against a surviving plan Activity caused the router to remove the
whole segment, including records whose declared survivor was the note itself.
The router now distinguishes content the note owns from content represented by
another live record, preserves or forwards each owned item, and records the
actual absorber when no note content remains. The run9 regression proves both
directions: Ferris wheel and The Prater remain in the Vienna City Note, while
the already-represented Schönbrunn members do not duplicate there. The pinned
scorecard now reports `ORD-1` PASS.

---

## 5. Tools, with exact commands

```
cd "/Users/eli/Claude - Roamwoven"

node scripts/scorecard.mjs --from-cache .assembly-cache   # measure, offline, ~40s
node scripts/probe-city-notes.mjs .assembly-cache         # layer-by-layer, ~40s
node scripts/run-tests.mjs                                # 43 tests, ~8s
```

`.assembly-cache/` contains the local exported parse, materials, and matching
geocode snapshot; `--from-cache` needs no database or network. The scorecard
scores four states; **NOT CHECKABLE is never a pass.** Replay now judges group
membership against the saved production geocode outputs and fails closed if
they do not reattach exactly.

## 6. Rules that bit us, in one place

- **Anything that changes what is sent to the AI model invalidates the pin and
  destroys the offline loop.** This happened once (3 missed pins) and was
  reverted. If a fix seems to need it, stop and escalate.
- Git writes from a Cowork bridge session need
  `GIT_INDEX_FILE=<somewhere outside the repo>`; the default index lock cannot
  be cleaned up and blocks every subsequent operation.
- Historical scope boundary, in
  `docs/assembly-restructure-work-order-2026-08-04.md` §6: the geocoder
  retry→address→hierarchy loop, classification judgement / block typing, the
  duplicate Trdelník, freezing canonical ids, splitting the 11,788-line file,
  and the 5 ordering violations were outside that work order. Block typing and
  Trdelník identity are now complete as separately measured follow-ons; the
  other items remain separate work.
- Task C1 (the resolver's private hedge regex, missing "far away") is deferred
  deliberately: consolidating it changes model input. It lands **with the next
  live run**, which records a fresh pin.

## 7. After this bug

Historical note: Task B's four dateless `placeholder` stubs were the next step
at this point in the investigation. They have since been removed and the
scorecard re-measured; do not use this paragraph as the current work queue.
