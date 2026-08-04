# Handoff — the City Note loss

One open bug. Three careful diagnoses have already failed on it. **The value of
this document is the ruled-out list; read that before forming a theory.**

Branch `assembly-restructure-phase-1`, HEAD `6e8a5ae`, working tree clean.
Suite green (43 tests, 79 files). Baseline: **FAIL 10 · NOT CHECKABLE 7 ·
NOT BUILT 3 · PASS 11**.

---

## The bug

A record is demoted to a city note, is folded into that city's note collection,
and the note that ships does not contain it. It is gone from the product.

Canonical case: **R2D2**. The source says "R2D2 (far away)". A locked contract
rule (RW-CLS-001 doubt markers) says that must silently demote to city notes.
**The demotion fires correctly.** The note ships without it.

Also lost, and possibly a DIFFERENT mechanism (see §4): `Ferris wheel`,
`Apple Studel Show`, `Schönbrunn visit`.

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

## 4. Likely a second, separate mechanism

`Ferris wheel` and `Schönbrunn visit` die differently. `Ferris wheel` folds into
a city-note copy; that copy (`Schönbrunn visit`) is then itself dissolved
carrying the terminal code `NOTE_CONTENT_REDISTRIBUTED_NO_SINGLE_SURVIVOR`
(recorded by the new removal gate — this is the gate paying for itself on day
one). The survivor chain breaks in the middle. Likely lives in
`canonical-accessory-routing.ts`'s `routeDatedNoteEvidence`, not in
`mergeCanonicalCityNotes`. **Do not assume one fix covers both.**

---

## 5. Tools, with exact commands

```
cd "/Users/eli/Claude - Roamwoven"

node scripts/scorecard.mjs --from-cache .assembly-cache   # measure, offline, ~40s
node scripts/probe-city-notes.mjs .assembly-cache         # layer-by-layer, ~40s
node scripts/run-tests.mjs                                # 43 tests, ~8s
```

`.assembly-cache/` is committed — measuring needs no database and no network.
The scorecard scores four states; **NOT CHECKABLE is never a pass.** Replay
cannot judge grouping membership at all (geocode lane off ⇒ grouping runs on
unverified coordinates production refuses: live 7 grouped stops, replay 14), so
those assertions are payload-only by design.

## 6. Rules that bit us, in one place

- **Anything that changes what is sent to the AI model invalidates the pin and
  destroys the offline loop.** This happened once (3 missed pins) and was
  reverted. If a fix seems to need it, stop and escalate.
- Git writes from a Cowork bridge session need
  `GIT_INDEX_FILE=<somewhere outside the repo>`; the default index lock cannot
  be cleaned up and blocks every subsequent operation.
- Out of scope by explicit decision, in
  `docs/assembly-restructure-work-order-2026-08-04.md` §6: the geocoder
  retry→address→hierarchy loop, classification judgement / block typing, the
  duplicate Trdelník, freezing canonical ids, splitting the 11,788-line file,
  the 5 ordering violations. Finding one is not a reason to chase it — record it
  in `docs/assembly-findings-inbox.md`.
- Task C1 (the resolver's private hedge regex, missing "far away") is deferred
  deliberately: consolidating it changes model input. It lands **with the next
  live run**, which records a fresh pin.

## 7. After this bug

Task B's remaining steps: the 4 dateless `placeholder` stubs — one of which
wears Prague Castle's name beside the real castle card. Then re-measure and
decide on freezing ids and splitting the file **on the new numbers**.
