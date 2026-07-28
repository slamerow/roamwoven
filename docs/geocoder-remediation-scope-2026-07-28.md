# Geocoder remediation — scope, LOCKED with Eli 2026-07-28

**Next session: this is your work order. Read it before writing code.**

Prerequisites already done: `0077c3a` + `c76dcc4` pushed, deploy green on
`19b35c1`. Evidence for everything below is
`docs/assembly-defect-docket-2026-07-28-run-7.28.0.md` (run 7.28.0, bundle
sha256 `4db233d3…`). Per AGENTS.md rule 7, every claim here cites its artifact.

**Run budget: 1 run for this pass, 1 for Arc H. Stated up front (rule 5).**

---

## 0. What this pass is and is not

**Is:** restoring trust in the geocode lane so grouping decisions rest on real
coordinates, and making the lane observable enough to audit.

**Is not:** fixing grouping. Grouping code is healthy — the source-hierarchy
path works and was proven to work in §A.4b of the docket. Do not touch
`createSiteMembershipContext`, the ≥2-member floor, or
`CROWDED_DAY_VISIBLE_CARDS`.

**What this pass will and will not recover:**

| Target | Recovered? | Why |
|---|---|---|
| Prague Castle | **Expected yes (7/10)** | Real coordinates for St. Vitus + Changing of the Guard put two members inside 300 m, clearing the ≥2 floor |
| Schönbrunn | **No, and nothing here can** | The model emitted one groupable child; the floor is two. Extraction problem, Arc H |
| Jan-15 walk, Malá Strana | Unknown | Not analysed to root cause; do not promise them |

Anyone reading this and expecting Schönbrunn to group in run 2 has not read
§A.4b of the docket.

---

## 1. The four parts

### G4.1 — Raise the lookup budget

**Defect.** `candidateCount 98`, `budget 50`, `skippedOverBudgetCount 48`
(bundle, `audit.extraction.geocodeVerification`). Rome's entire Jan-13 leg —
Colosseum, Pantheon, Trevi Fountain, Spanish Steps — received no verified
coordinate at all, because a 4-card day never ranks.

**Change.** `GEOCODE_VERIFICATION_MAX_LOOKUPS` (`lib/env.ts:168`, default 50) →
**150** (D1). Env-tunable, so this can ship as a Vercel variable with no code
change — but the *default* should move too, so a fresh environment is not
silently starved.

**Verify.** `skippedOverBudgetCount == 0` on the next run;
`resolvedCount == candidateCount`.
**Undo.** One env var, or one constant. No semantics change.

**Note, and do not re-derive it:** `docs/arc-g-scope-2026-07-27.md` §Geocode
budget already records Eli's position — the 50 was an arbitrary cost cap, it
does not behave as intended, and it was deferred to H. This is H arriving.

### G4.2 — Locality-granularity guard (the centroid bug)

**Defect, and the most important one in this pass.**
`50.0755381,14.4378005` is the Prague city centroid. Three unrelated venues —
Catacombs tour (Jan 14), Peklo and Changing of the Guard (both Jan 16) — carry
it, all stamped `geoVerified: true`. Changing of the Guard therefore sits
3,108 m from the Prague Castle it happens inside. 31 activities hold verified
coordinates across only 29 distinct points.

**Change.** In `parseGeocodeResponse` (`lib/extraction/geocode-verification.ts`),
reject a result as *unverified* when the endpoint says it resolved a place, not
a venue. The configured endpoint is the Google Geocoding API
(`lib/env.ts:166`), which returns both `types[]` and
`geometry.location_type`. Criterion (D2): reject when `types` intersects
`{locality, political, administrative_area_level_*, country, postal_code}`.
A rejected result is **not** an error — the lane stays fail-soft, the piece
simply keeps no verified coordinate.

**Critical:** this guard **alone does not fix Prague Castle.** It converts
Changing of the Guard from wrongly-verified to unverified — still excluded by
the verified-only policy. G4.2 without G4.3 makes the data honest and the
grouping no better.

**Verify.** No two distinct venues share a verified coordinate; the three named
pieces above no longer carry `geoVerified: true` on a centroid.
**Undo.** Remove the predicate; results revert to being accepted.

### G4.3 — Retry with container context

**Defect.** A venue the geocoder cannot resolve standalone ("Changing of the
Guard", "Peklo") silently degrades to its city rather than being retried with
the context that would identify it.

**Change.** When a lookup returns a locality-granularity result (G4.2) and the
piece has a plausible container — its same-site container's title, or its day's
city — retry **once** with the container appended: `"Changing of the Guard,
Prague Castle"`. Accept only if the retry returns a non-locality result.

**This is the part that actually recovers Prague Castle.** With St. Vitus and
the Changing of the Guard resolved to real points, two members land inside
300 m and the ≥2 floor is met.

**Verify.** Changing of the Guard resolves within ~300 m of Prague Castle;
Prague Castle groups with ≥2 sub-stops.
**Undo.** Skip the retry branch; behaviour returns to G4.2-only.

### G4.4 — Per-candidate telemetry, and the three fields Arc G never plumbed

**Defect.** Four things the audit needs do not exist on any served surface
(docket §C, verified in source at HEAD):

| Field | Where it dies |
|---|---|
| `formattedAddressCount` | dropped by the snapshot whitelist, `trip-extraction-audit-snapshot.ts:253-269` and `-types.ts:231-239` |
| `evidence.groupingClaims` | produced at `evidence-clustering.ts:11640`, **zero consumers repo-wide** |
| `usage.openai.transportFieldRepairs` | written at `openai-trip-parser.ts:1514`, no endpoint serves `usage` |
| per-candidate rank + outcome | does not exist at all |

**Why this is the precondition, not a nice-to-have.** Rule 1 says exactly one
variable per run, and this pass changes three. What makes that legitimate rather
than careless is that per-candidate telemetry **separates them after the
fact**: for every candidate you can see whether it was ranked, looked up,
rejected as locality, retried, or resolved. Without it, a run-2 failure is
unattributable across G4.1–G4.3 and rule 1 says split the pass into three runs.

**Change.** Emit per-candidate `{query, rank, outcome, retried, granularity}`;
add `formattedAddressCount` to the snapshot whitelist and types; carry
`summary.groupingClaims` into the snapshot; surface
`transportFieldRepairs[].outcome`.

**Verify.** All four readable in the next qa-bundle.
**Undo.** Revert; all are additive read-only fields.

---

## 2. Rule 1 arithmetic — MEASURED, not estimated

Sources: `maxDuration = 800` (`app/maker/trips/[tripId]/data/extract/route.ts:71`);
`GEOCODE_LOOKUP_CONCURRENCY = 8` (`geocode-verification.ts:31`);
`timeoutMs` default `4000` (`lib/env.ts:175`); wall clock from run 7.28.0's own
`processingEvents` timestamps.

**Run 7.28.0 actual:**

```
material_checkpoint  00:20:43.888
run started          00:20:44.107
model_extraction     00:20:44.156 → 00:23:49.433   = 185.3 s
everything after     00:23:49.433 → 00:23:51.441   =   2.0 s
TOTAL WALL CLOCK                                    = 187.6 s
```

**187.6 s against `maxDuration` 800 s → 76.5 % headroom.** The geocode lane runs
inside `model_extraction` (called at `openai-trip-parser.ts:1422`).

**Delta from raising the budget.** Waves = `ceil(lookups / 8)`.

| Budget | Waves | Worst case @ 4 s/wave | Worst-case total | Headroom |
|---|---|---|---|---|
| 50 (today) | 7 | 28 s | 187.6 s | 76.5 % |
| 98 (this trip's pool) | 13 | 52 s | ~211.6 s | **73.5 %** |
| 150 (proposed cap) | 19 | 76 s | ~235.6 s | **70.5 %** |

Worst case assumes **every lookup times out**, which is maximally pessimistic —
run 7.28.0 had `failedCount 0`. Even so, 150 lookups clears the ≥40 % bar with
30 points to spare.

G4.3's retries are bounded at one per locality-result and count against the same
cap (D3), so they cannot extend the ceiling.

---

## 3. Expected failure modes, and what each costs

1. **Google returns non-locality results for venues that are genuinely
   locality-level** (a city-wide "Explore Vienna" style card). Cost: those keep
   no verified coordinate, exactly as today. Harmless.
2. **The retry resolves to the wrong venue** — "Peklo, Prague" finding a
   different Peklo. Cost: a wrong coordinate, which is worse than none, because
   grouping trusts verified points. Mitigation: accept a retry only if it is
   non-locality **and** within the day's city bounds.
3. **Quota or QPS ceiling** at 8 concurrent × 150 (OPEN Q4). Cost: `failedCount`
   rises, lane stays fail-soft, draft survives on parser coords.
4. **Prague Castle groups but with a wrong third member.** A wrong group is
   worse than a missing one (bar item 7). Watch the run-2 bar below.
5. **Nothing changes.** If run 2 shows zero groups again, per-candidate
   telemetry (G4.4) tells you which of G4.1–G4.3 failed — that is the whole
   reason it ships in this pass.

---

## 4. Run-2 bar

**MUST HOLD (regressions):** run completes; 5 legs / 8 transport / 5 stays;
trip span Jan 12–25 2019, 14 days; privacy clean post-Δ3; **no wrong groups**.

**MUST IMPROVE:** `skippedOverBudgetCount 0`; no two distinct venues sharing a
verified coordinate; all four telemetry fields present; **zero literal-`null`
start times** (shipped alongside, docket §G).

**TARGET:** Prague Castle groups with ≥2 sub-stops.

**EXPECTED NOT TO MOVE, do not score as failure:** Schönbrunn (§A.4b), card
count (~76), demotion debris, question flattening. All Arc H.

---

## 5. Decisions — SETTLED with Eli 2026-07-28

- **D1 Budget shape: HARD CAP AT 150.** Bounded worst case, provable
  arithmetic (§2). Env-tunable; the default moves too.
- **D2 Centroid criterion: REJECT ON RESULT TYPES.** Reject when Google's
  `types[]` includes `locality`, `political`, `administrative_area_level_*`,
  `country` or `postal_code`. Chosen over the broader
  `location_type: APPROXIMATE` rule, which would also reject legitimate venues
  Google only approximates and would make the ≥2 member floor harder to clear.
- **D3 Retries COUNT against the budget.** The cap stays a true ceiling and §2's
  arithmetic holds exactly as written.

### DEFERRED TO ARC H — candidate restriction (Eli's proposal, 2026-07-28)

Eli: *"only things that aren't obviously standalone activities"* — do not spend
lookups on pieces that could never participate in a group.

**The idea is sound and it is specifiable**, straight from RW-GRP-001: a
candidate earns a lookup only if it matches the site-container pattern, shares a
day with something that does, or sits on a crowded day while untimed and
unbooked. It checks out against this run — Jan 13 Rome (Colosseum, Pantheon,
Trevi, Spanish Steps) got no lookups and GT says that day has no group, so the
rule would have skipped them deliberately rather than by accident. It is also
safe on the contract: RW-GRP-001 records that verified coordinates are consumed
ONLY by grouping-proximity checks, so nothing downstream is starved (a map would
use the parser's `approxLatitude`/`approxLongitude`, which every piece carries).

**Held back anyway, deliberately.** The candidate ranker is the exact mechanism
that just failed: St. Vitus Cathedral is on a crowded day, is a same-day
component of a container, and eight of its twelve day-mates were looked up — and
it was not. **Nobody can say why, because per-candidate telemetry does not
exist.** Tightening that ranker from ordering into hard EXCLUSION while it is
still unobservable is AGENTS.md rule 7(b) violated in advance.

It also buys little now: not a cost argument (~$0.75/trip at the 150 cap, and
cost is explicitly not the constraint), and only ~5 fewer waves ≈ 20 s against
70 % headroom. The budget raise already solves coverage completely.

**Write it in Arc H from run 2's per-candidate data**, where you can check, for
every stop the rule would skip, whether it was one that mattered. The 150 cap
then becomes a vestigial safety ceiling, which is what a cap should be.

### Q4 Google key quota — LARGELY ANSWERED by the run's own telemetry

Run 7.28.0: `outcome completed`, `resolvedCount 50`, `failedCount 0`, at
`GEOCODE_LOOKUP_CONCURRENCY = 8`. The key works, billing is functional, and
8-wide does not trip a rate limit. **Do not spend time re-checking those.**

Untested: volume beyond 50 lookups in a single run, and the monthly ceiling
(Geocoding is a Google "Essentials" SKU — 10,000 free calls/month, then
$5/1,000). Lookups equal CANDIDATES, not the cap, so this trip costs 98
lookups ≈ $0.49 at full rate — inside the free allowance until roughly 100
trips/month. Watch `failedCount` on run 2; anything non-zero is the first
sign of a quota or QPS ceiling, and the lane degrades fail-soft either way.

---

## 6. After this pass — Arc H

Scope H on **extraction and attribution**, not grouping. One family, all
evidenced in the run-7.28.0 docket:

- the model folding sub-stops into prose (§A.4) — the only path to Schönbrunn
- the ÖBB ticket page filed under the wrong day section (§B)
- the Rome-2 stay inheriting the watch shop's address (§F)
- two ground-truth questions flattened into scheduled cards (§H)
- a transcription-accuracy metric (§K) — nothing measures whether OCR read
  characters correctly, and `uncoveredLineCount` structurally cannot

This is also where the 75-vs-49 card gap lives.
