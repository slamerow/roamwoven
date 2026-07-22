# Run 7.22.4 root-cause docket — live lineage confirmation (2026-07-22)

Trip `59ccd1e3-ec3b-40b4-b495-bdd3fc083055` ("7.22.4"), build f1b8ab1,
bundle generated 2026-07-22T06:17:08Z, fetched live via
`/data/audit/qa-bundle?includePrivate=1` through the maker session (full
bundle: 263,590 B, sha256 `5357cf3ad08b8784c702d179bce80a0f4ea6418d81bcc9
b85db411ec8e6e5bd8`, saved in Eli's Downloads as
`run-7.22.4-qa-bundle.json` — drag to repo root when convenient). This
docket quotes the exact lineage rows the Arc E fixtures must reproduce.

## Headline correction to the handoff's hypothesis

The handoff guessed the GROUP fold path killed Schoenbrunn ("no
times/dates on the copies"). The live lineage shows it was the
**card-vs-note reconciliation path** (`evidence-clustering.ts` ~L6653:
"repeated but never committed: the city-note copy is the single home"),
and the castle died by a **different mechanism again** (4th distinct kill
in 4 runs): doubt-marker demotion fired on ABSORBED sibling text because
the parser nulled every `evidence` field, so own-text stamping fell back
to contaminated prose. Both are covered by the approved Arc E plan
(workstream 1 path-3 guard + workstream 2 evidence injection); no scope
change, but the fixtures below target the REAL paths.

## Kill chain 1 — Schönbrunn family (fold path 3, card-vs-note)

Each of **Schönbrunn Palace, Gloriette, Orangeriegarten, Palm House** had
exactly two activity observations, both dated 2019-01-19, no times:

- one with `sourceLabel: "Saturday, January 19th"` (the DATED DAY-PLAN
  section), e.g. obs_734209ee23b2fc27f704dbdf (Schönbrunn Palace),
- one with `sourceLabel: "Czech out Eli's Colossal Eastern Europe
  Excursion (1).pdf notes"` (the trailing notes blob), e.g.
  obs_bdfab00f21b796c94d6e16fb.

They merged ("same named plan"), then every merged card was rejected with
`"repeated but never committed: the city-note copy is the single home"`
and ATTACHED to the suppressed note piece `piece_c19de110cd37ca2efb0dc045`
("Schönbrunn visit", kind note, role city_note_candidate, from the notes
blob) — which was itself then rejected into "note evidence routed to
canonical stay, activity, or travel records". Net: zero traveler cards,
zero groups, content gone. Also absorbed the same way: Apple Strudel Show,
Panorama Train pass, Ferris wheel (all had day-plan copies too).

Fixture assertions (fold-guard acceptance):
1. A merged piece whose observations include a dated day-plan section
   label ("Saturday, January 19th") NEVER yields to a notes-blob note copy
   — the note copy is the reference; the day-plan card survives.
2. Post-fix, Schönbrunn Palace + Gloriette + Orangeriegarten + Palm House
   are cards on 2019-01-19, eligible for the RW-GRP-001 source-hierarchy
   group under the container-named site.
3. Negative control stays green: a card with NO day-plan-section
   observation still folds into its note copy (Konyv Bar / Mazel Tov
   shapes), and the merged-copy price/hours text on the day-plan card does
   not disqualify it (this is what `isDeliberateDayPlanMention`'s
   PRICE_MARKER check got wrong on merged text).

## Kill chain 2 — Prague Castle (absorbed-text doubt demotion, evidence-null root)

Piece `piece_87b83389d5d1775b3bfcc41c` ("Prague Castle complex") merged 4
observations (3 notes-blob + 1 from "Wednesday, January 16th"), then its
recovery actions show the contamination: "removed description fragment
belonging to KGB museum / R2D2 (far away) / Kafka statue / Vinarna
certovka / John Lennon Wall / Novy Svet", followed by `"source doubt
marker (maybe / if time / far away): demoted to city note without a
question"` and rejection into the Prague note collection. The "(far
away)" hedge belongs to R2D2, not the castle. Arc C's own-text stamping
was supposed to prevent exactly this — but it stamps from the parser's
VERBATIM `evidence` excerpt "when present", and **every one of the 140
lineage rows has a null/absent evidence field** (0/140), so stamping fell
back to absorbed prose. St. Vitus and R2D2 shipped as undated
placeholders with which-day/tour questions; no castle card shipped, while
the castle ticket question DID ship (question without its subject card).

Fixture assertions (evidence-injection acceptance):
1. Intake injection fills `evidence` for untimed/unbooked activity
   observations by line-matching within the observation's OWN source
   section; a "(far away)" line matching only R2D2 never lands on the
   castle.
2. With injected own-text evidence, the castle piece is NOT hedge-demoted
   by absorbed sibling fragments; R2D2 still demotes on its own "(far
   away)".
3. Foreign-section-only match ⇒ no injection (negative control).

## Supporting telemetry pulled from the bundle

- Counts: 58 active activities, 2 placeholders (R2D2, St. Vitus), 5
  notes, 6 transport rows, 8 open questions, 0 calls, 0 groups.
- 2019-01-21 has ZERO activity cards (only the ÖBB rail row); Jan-21
  lineage pieces are phrasebook shards ("Asking for paprika",
  "Kuh-suhnem", "Ehr-nee-zhest", "Thank you") — junk-family watch item.
- "GOEURO outbound" survived into final items with literal date "21.01" —
  the via-station/fragment guards missed this shape (new watch item; the
  Arc D twin transport-row fold did not catch it because it shipped as an
  ACTIVITY item, not a transport row).
- activityChunks: 28 calls, 0 failed, 0 rescued (no per-call latency in
  the bundle — pull p95 from Vercel function logs for the Arc E duration
  arithmetic).
- sourceRecovery: outcome "recovered", 61 lines batched, 27 recovered, 34
  residual uncovered (model gpt-5.4-mini).
- geocodeVerification: budget 50 EXHAUSTED again post-ranking (104
  candidates, 50 resolved, 54 skipped, 0 failed) — supports the
  R1-telemetry-then-env-raise decision.
- Privacy: clean in the extract's diagnostics (3 P2 advisories only, no
  P0/P1); identity clauses sit in coverage advisories
  ("ekamerow@gmail.com" uncovered line), not in public prose.
- Questions include the contract-compliant castle-ticket and
  planned-or-ideas (Albertina/State Hall/Time Travel/Belvedere) shapes,
  plus which-day questions minted from the undated placeholders — the
  R2D2 question's own evidence field QUOTES "(far away)", confirming the
  hedge was visible to the question pipeline while invisible to
  classification.

Blind-first integrity: extracted and analyzed without sight of any prior
diff of Eli's.
