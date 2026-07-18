# Assembly defect docket — live run 7.18.3 (Arc A validation run)

Trip `3cf92459-edf5-4a7c-a285-246d286b62cc` ("7.18.3"), first extraction on
the Arc A build (290df39). Audited from the QA bundle
(`run-7.18.3-qa-bundle.json`, 195,075 bytes, sha256 `ffc0d28c…9bb9`, saved to
Eli's Downloads — move to repo root, gitignored), bundle lineage, and live
maker pages. 28/28 chunks succeeded, 295/295 observations dispositioned,
8 parser-artifact repairs, 4 identity repairs, 0 P0 diagnostics raised BY THE
AUDIT (see PB-1: the audit was blind to the real P0 — detector gap recorded
below).

METHOD NOTE: this audit ran BLIND-FIRST (CEO decision): Claude audited
without Eli's observations, then the two lists were diffed. Eli's blind pass
caught three defect families the automated audit missed (PB-1 privacy, PB-5
provider fields, the full scale of PB-4 idea-list promotion) — each produced
an audit-coverage-gap entry per RW-AUD-001. Eli also self-corrected one
overclassification: train booking/ticket codes visible inside the maker
summary's transport-row Details expanders are protected fields on their
DESIGNED surface (maker-visible, `report.draft.transport[].description`),
NOT a prose leak — off the privacy docket.

## Arc A target scorecard

| Target | 7.18.2 | 7.18.3 | Verdict |
|---|---|---|---|
| Recovery call | not built | fired once, gpt-5.4-mini, 60 lines batched (cap hit, 2 dropped+counted), 53/62 recovered, separate usage, fail-soft | **WORKS mechanically** |
| koscom/Szechenyi recovered or flagged | flagged (noisy) | **dropped (5th run) AND unflagged** — cross-stage coverage masked both (PB-3) | **FAIL — Arc A calibration regression** |
| Schönbrunn survives + groups | destroyed (heading fragment) | heading-fragment kill DEAD ✓; palace destroyed by NEW chain (PB-2) | **FAIL, mechanism moved** |
| Zero wrong groups | Gresham mega-container | **0 wrong groups** — but 0 groups at all (PB-6) | PASS (vacuous) |
| Question count sane | 6 (2 bogus dates) | 3, 0 bogus dates (Phase 2 gate held); wrong mix (castle/baths missing) | mostly held |
| Wave-1/2 wins | — | 5 stays ✓, 8 transport rows ✓, 0 false P0 (4th run) ✓, counts unified (84+8=92) ✓, coverage noise 121→9 ✓, day-title/heading cards 0 ✓, disjunction singletons ✓ | held |

## Headline defects

- **PB-1 — P0 PRIVACY (Eli's blind pass; audit missed it).** (a) "Pick up
  car at Prague Downtown" (Jan 17) activity prose ships the traveler's NAME
  + HOME ADDRESS + PHONE in cleartext ("Customer Eli kamerow. 1225 Harvard
  street nw, 20009 Washington, USA. …") — the EXACT 7.17.2 defect
  resurfaced; the customer-identity scrub did not fire (trace required:
  phrasing evasion vs. a merge path that runs after the scrub). Rental
  reservation number itself is public per CEO ruling. (b) "Ryanair FR8331
  to Prague" survives as a Jan 14 ACTIVITY duplicating the "Rome to Prague"
  transport row AND carrying its confirmation code — a travel booking
  identifier in public prose (RW-PRI-001 protected class) + a transport
  shadow that escaped suppression. (c) "Skip the Line ticket, 1 x 380.00
  Kč, ticket number 19183727" — bare ticket-page re-emission as a Jan 15
  activity (the activity-ticket family run5 marked "uncovered").
  AUDIT GAP (RW-AUD-001): no detector raises on identity-shaped values
  (name/street-address/phone) in public prose, and the QA bundle's redactor
  made the run LOOK clean — the auditor saw "[redacted phone]" markers in
  diagnostics evidence and did not chase them. Fixes: identity-scrub trace
  + fix; travel-confirmation scrub on the shadow path; ticket-page ACTIVITY
  family repair; NEW audit P0 detector for identity-shaped values in public
  prose; audit procedure — privacy is checked on UNREDACTED card prose.
- **PB-2 — Schönbrunn destroyed by a site-component fusion chain (new
  shape).** Parser emitted everything; "Explore Vienna" heading fragment
  correctly died. Then: "Palm house at Schonbrunn" beat "Schonbrunn Palace
  visit" in the near-identical collapse — both merge-ELIGIBLE, and the
  ladder's specificity rung counts tokens (3-token component > 2-token
  site; "visit" is a verb token). The fused piece (holding all four palace
  observations) then lost TITLE CONTAINMENT into "Palm House at Schonbrunn
  or Museum of Illusions"; the palace-noun containment guard never fired
  because the piece's title had drifted to "Palm house…" after the merge.
  Root cause: sameEntity has no site-vs-component relation — a
  container-noun piece and an "X at <site>" component are grouping
  structure, never duplicates. Fixes: (a) sameEntity refuses
  site↔component merges outright (classifier acceptance criterion);
  (b) merge guards must test OBSERVATION titles, not just the current
  payload title (post-merge title drift evades noun guards).
- **PB-3 — Coverage cross-stage matching hides multi-entity line drops
  (Arc A calibration regression, Claude's own).** "Get back by 5 to go to
  koscom and maybe communism museum": distinctive tokens [koscom,
  communism, museum], required 2 — communism+museum are covered by the
  (misplaced, PB-7) Jan 14 card via the cross-stage union, so the line
  counts covered while koscom vanishes, UNFLAGGED for the first time in 3
  runs. Same masking for "Szechenyi Baths or Gellert…" (Chain Bridge +
  Gellert tokens). Fix: per-clause coverage — split lines on
  and/or/commas, require each clause's distinctive tokens covered;
  cross-stage credit never spans clauses. This is the recovery lane's
  trigger integrity — MUST land before 7.18.4.
- **PB-4 — Jan 21 idea-list promotion: 8 dated activity cards** (Great
  Synagogue / Konyv Bar / Mazel Tov / gypsy music / Popped-up statue /
  Pinball / Wine Cellar / Ruszwerm) — the A-6 family fully promoted, plus
  "Budapest food ideas" and "Eat some 'Za" (recovered lines shipping as
  loose-tip cards; the converged audit detector DID flag these two as P1).
  "Buda hills loop" is the same family ("if you want to get out of the
  city…" — and "if you want" is missing from the hedge vocabulary). These
  are the unified classifier's acceptance criteria (Arc B).
- **PB-5 — Transport provider FIELDS corrupted (Eli's blind pass; audit
  read titles only):** "PM Delta" ×2, "Home Delta", "Za Wizz Air",
  "D 143". "Za"/"D"/"143" evade the ≥3-letter token filters (shaped gap);
  "PM"/"Home" are IN the bleed list and should have been stripped —
  regression to trace. Route titles/times themselves correct. AUDIT GAP:
  provider fields join the audit checklist.
- **PB-6 — Grouping collapsed to zero.** 84 activities, 0 grouped stops,
  0 Calls, 17 cards on Jan 22 alone, 6 bloat warnings. No WRONG groups
  (the run5 calibration held), but the castle (hedge-demoted, PB-8) and
  palace (PB-2) containers died before grouping could run, and no walk
  formed. The ship-bar floor needs correct groups, not just no wrong ones.
- **PB-7 — Pinball Museum duplicate (6th run) + the dedup policy defect.**
  The repeat-mention rule KEEPS all "committed" copies as a "genuine
  planned double visit", and a copy counts committed merely by
  sequence-inheritance (hedge-free on a day with 3+ timed cards). Two
  sequenced days → both stay. RW-CAN-001's supersession says distinct
  dates ALONE are not affirmative repeat evidence — sequence-inheritance +
  distinct dates is effectively dates alone, so the implementation is out
  of ledger compliance. Fix: only explicitly committed copies (own time,
  booking, first-person language) survive as a second visit;
  sequence-inherited copies fold into the strongest copy. Upstream, the
  classifier demotes the whole Jan 21 idea list (Pinball's copies never
  become cards). PB-7 auto-suppression (confirmed-collision, 6th run)
  remains the backstop. Also "Museum of communism" shipped as a Jan 14
  activity (the actual maybe-mention; doubt rule missed it while wrongly
  firing on the castle, and the date is wrong).
- **PB-8 — Prague Castle hedge-demoted to a city note.** "Lesser Town &
  Prague Castle" + two "Prague castle" copies merged; after absorbing
  description fragments from Certovka/Lennon/Novy Svet, the merged
  description carried a doubt marker and doubt demotion fired ON ABSORBED
  RESIDUE. The orphaned ticket decision re-rooted as a free-text "Which
  ticket or tour option for Changing of the Guard?" question. Fix: doubt
  demotion may only fire on a piece's OWN observation text (classifier
  acceptance criterion).
- **PB-9 — Recovery output placement/classification.** "Train to/from
  Cesky Krumlov" (recovered) shipped as a Jan 25 ROME-day activity —
  recovered observations need their date bounded to the excerpt's own day
  heading; recovered note-ish lines must route through classification
  (PB-4's two P1 cards). Most recovery output was correctly absorbed as
  duplicates of existing records.

## Smaller items

- St. Stephen's ×4 + undated placeholder + date question (Vienna cathedral
  on BOTH Jan 19 and Jan 20; cross-day uncommitted repeat should fold).
- "Prague lodging cost note" cost-card escape (1, down from 3).
- "Silver mines" (a planned Kutná Hora stop) landed inside Prague Notes
  under "Getting Around", and the Prague note carries Festival-menu
  pollution + a stray "needs to be decided".
- Baths slot question missing again; Szechenyi Baths never extracted
  (masked by PB-3, so also unflagged).
- Recovery line cap hit exactly (60 batched, 2 dropped+counted) — consider
  raising OPENAI_RECOVERY_MAX_LINES.

## What 7.18.3 proved works (keep)

Recovery lane end-to-end (trigger → one bounded call → normal-stage
absorption → source-truth verification → separate telemetry → residual P2);
coverage noise 121→9; heading fragments dead; zero wrong groups (precision
gate + passing-mention ban + area cross-check all held); 0 false P0 (4th
run); 5 stays clean; counts unified everywhere (RW-CNT-001); Phase 2
question gate (0 bogus date questions); converged audit detectors caught
the loose-tip P1s and Pinball P1 that older private regexes missed.

## CEO decisions recorded this session (Eli)

- Blind-first audit protocol worked — keep it (Claude audits cold, Eli's
  blind pass diffs against it, misses become audit-gap entries).
- Privacy P0 fixes ship INSIDE the Arc B push, first in commit order — one
  push, one extraction ("7.18.4"), no separate hotfix run.
- Stronger-model chunk-stage A/B stays HELD until after 7.18.4 — trigger
  only if 7.18.4 still shows parser-drop dominance after the classifier +
  coverage fixes land.
- Train-code finding declassified by Eli (protected fields on their
  designed maker surface).

## Arc B order (next session, one push, extraction "7.18.4")

1. PRIVACY WAVE (P0, first in commit order): identity-scrub trace+fix
   (rental-car card), travel-confirmation scrub on the transport-shadow
   path + the FR8331 shadow suppression, ticket-page ACTIVITY family
   repair, NEW identity-leak P0 audit detector, unredacted-prose audit
   procedure.
2. PB-3 coverage per-clause matching (recovery trigger integrity).
3. Unified activity-vs-city-note/commitment classifier with acceptance
   criteria: A-6/Jan-21 idea list stays demoted (PB-4), site↔component
   never merges (PB-2), doubt demotion on own text only (PB-8),
   explicit-commitment-only repeat survival (PB-7), "if you want" hedge
   family, recovered-line classification (PB-9).
4. Geocoding verification lane (standing CEO decision: env-keyed,
   budgeted, fail-soft, grouping-proximity only, no new DB tables in v1).
5. Riders: provider-field repairs (PB-5), recovery date bounds (PB-9),
   St. Stephen's cross-day fold, cost-note demotion, baths slot override,
   Pinball/collision auto-suppression.
Fixtures from 7.18.3 lineage shapes in the same commits. Then extraction
pinning immediately after 7.18.4 validates (parser variance is now a
first-order drag: koscom 5 runs, a materially different parse per run).
