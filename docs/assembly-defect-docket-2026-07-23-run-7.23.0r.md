# Run 7.23.0r root-cause docket — trip 892b2e3e (2026-07-23)

Trip `892b2e3e-177e-429b-89ee-b8c8259f535f` ("7.23.0"). Bundle fetched live
via `/data/audit/qa-bundle?includePrivate=1` through the maker session:
277,699 B, sha256
`419b7405874c587dd094ae9ec81da6102bc01b5f3472881b1e564d764a8ec5bb`,
generated 2026-07-22T22:10:42Z. Two runs on this trip:

- R1 (processingRun e715131b, 20:33Z, PRE-fix build): assembly FAILED —
  initialError `CanonicalIdentityInvariantError: activities identity order
  does not match canonical evidence artifacts`, retryError `missingDetails[8]
  targets missing canonical identity piece_a7a0bcd4fdf628f8a466ecd1`. The
  exact shape aa9e16b was built for.
- R2 (processingRun d980034f, 21:25Z, on aa9e16b+f6a0ec5): COMPLETED.
  Assembly finalized `identityRecoveryStatus: "repaired"` with 4 actions
  (`reapplied_canonical_output_invariants`,
  `rebuilt_canonical_outputs_from_evidence`,
  `regenerated_canonical_review_identity`,
  `rebuilt_evidence_identity_manifest`). **The shipped draft is the
  rebuild-corridor output, not a clean first-pass assembly.**

Telemetry: extraction gpt-5.4-mini, `pinning: null` (envs off), 27 chunks /
0 failed / 0 rescued (~3m33s). OCR gpt-5.6-luna, 19 pages, 5 batches, 97s,
reason `large_embedded_images`; final material = 13,077 text-layer chars +
OCR = 31,839 chars (day sections duplicated source-side, as before). Spine
truncated to 17,982 chars (per-material budget 18,000). sourceRecovery: 72
lines batched, **65 recovered** (7.22.4: 61/27), 7 residual. Geocode:
budget 50 EXHAUSTED, 127 candidates, 77 skipped.

## Eli's reaction, quantified

"Too many legs, too much transit" is literal, not impressionistic:

- **7 legs shipped vs ground-truth 5** (`records.counts.legs: 7`).
- **9 transport rows vs ground-truth 8**, one a garbled phantom duplicate.
- Plus ~6 transit-flavored activity cards (arrival_departure/admin) that
  render as movement: GoEuro ticket, ÖBB ticket, Train to/from Cesky
  Krumlov, Car rental pickup, Budapest stay, Check in to hostel and walk to
  Albertina (hard warning: duplicates a stay row).
- 66 active activities (7.22.4: 58; ground truth ≈ 40), 7 questions, 1 call,
  2 grouped stops, 5 stays (correct).

## Defect chain 1 — two phantom legs minted from the Costs section

Legs 6 and 7 in `records.legs`:

- `piece_4443af853afd7519ce5d5347` — "Prague", arrive 2019-01-15, leave
  2019-01-17;
- `piece_4f1f87e25bcb3a715eae340e` — "Budapest", arrive 2019-01-21, leave
  2019-01-23.

Both are place pieces whose single observation is titled literally
`"source recovery"` (`obs_621b267e763c52ddd3adb885`,
`obs_dd8b496bf91fa9233cc1d922`). The recovered lines are the per-night COST
entries ("January 15th Prague - $56 (airbnb)", "January 22nd Budapest - $15
(private room- shared bathroom)" — those section labels appear across 23
lineage observations). The Costs section is excluded from trip content by
the approved ground truth; source recovery re-extracted it (it is uncovered
BECAUSE it is excluded) and the recovery→place path minted overnight legs
from consecutive dated cost lines. The guard exists and caught the
siblings — Cesky Krumlov, Rome, Vienna recovery-places were rejected
`"same-day destination is an activity, not an overnight trip leg"` — but
multi-date cost runs (Prague 15–17, Budapest 21–23) read as overnight and
passed. Root: **the costs exclusion is not applied to source-recovery
output before place/leg candidacy.**

## Defect chain 2 — phantom 9th transport row (garbled Delta 1043 twin)

Shipped rows for Jan 25 (`records.transport`):

- `piece_70efd2f9313abcc3890304bf` "Delta Flight 1043": FCO 14:45 → JFK
  18:45, conf GHFHPG — correct.
- `piece_4547a62a615ffc687f997e60` "Home flight FCO to JFK": **JFK 02:45 →
  FCO 10:15**, description "Delta Flight 1043 operated by Alitalia, seat
  14J", conf #GHFHPG — phantom. Route reversed, 02:45 is the source's
  "2:45 -> 6:45" without its PM, 10:15 is Delta 444's arrival time.

The Arc D twin transport-row fold missed it because every match basis
fails: number field differs (title carries no flight number), route is
reversed (jfk|fco vs fco|jfk), times differ, dated titles differ. It DOES
share confirmation #GHFHPG with three canonical Delta segments — the
shared-confirmation rule exists only in the transport-shaped-ACTIVITY gate,
not in the transport-row twin fold. The run's own diagnostics flagged it
(`transport_row_without_source_anchor`: "2019-01-25 - Home flight FCO to
JFK") as p2 advisory; nothing acted on it. Fixture: a transport row sharing
a confirmation code and date-adjacent identity with an anchored segment,
with no source anchor of its own, must fold into (or be rejected against)
the anchored twin — reversed-route shapes included.

## Defect chain 3 — booking-blob shards shipped as cards (incl. identity leaks)

Junk activity cards in the final records, all traceable to ticket/receipt
blobs (most via `sourceLabel: "source recovery"`):

- Jan 15: "Event date", "Client" (public description **"Client: Eli J
  Kamerow"**), "Seller" (DREYER s.r.o. + address), "Menu items", "Jewish
  quarter link" (bare URL card).
- Jan 14: "Wi-Fi: Wimgen" (admin_logistics card naming the Wi-Fi network).
- Jan 13: "Payment due upon arrival" (itemType `admin`; belongs ON the stay
  card per stay-cost rule). Jan 17: "Prague lodging price note" (Costs).
- Jan 24: "GoEuro ticket" (raw text incl. **"Passenger and Ticket Details
  Eli Kamerow"** + "32.00 €") and "ÖBB ticket" (raw German boilerplate
  "KEIN UMTAUSCH… Ticketcode…", on Jan 24 in the ROME leg — the D 143 it
  duplicates ran Jan 21 and already ships as a proper transport row).
- Jan 25: "Train to/from Cesky Krumlov ($15-$20)" — a Costs line for a day
  trip never taken; **`legId: null`** (orphan card).

Two of these put Eli's NAME in public card prose — the Δ2 privacy
amendment says personal identity data is scrubbed from card prose as
content hygiene. The `no source support (model invention)` guard caught
"Entry instructions", "Currency conversion note", "Phrase note" but cannot
catch these: the text IS in the source; it is booking material, not a
traveler activity. The accessory-owner rejection caught "Adult ticket" /
"Payment status" / "Booking reference" / "Fuel type" / "Shift" /
"Selected car" but the shards above arrived as `atomic_candidate` rather
than `accessory_detail`, so no rule ever weighed them.

## Defect chain 4 — evidence injection was a NO-OP in production

The bundle contains **zero** occurrences of `evidenceProvenance` /
`line_match_injected` / `model_verbatim` / `model_unverified` — across 150
lineage rows and the snapshot. a97b36f added provenance to lineage rows,
snapshot, and audit types, so the expected floor signal
(`line_match_injected >> model_verbatim`) is not merely low, it is absent.
`injectVerbatimActivityEvidence` silently returns without stamping when
`sourceText` is null, and the intake callsite passes
`stageInput.sourceText ?? null` — consistent with **sourceText never being
plumbed at the live intake boundary** (fixtures pass it; the live stage
input apparently does not). Verify in code before fixing; the observable
fact from the bundle is: no provenance markers anywhere, and the downstream
kills below behave exactly like merged-prose stamping.

## Defect chain 5 — the floor items

- **Prague Castle: dead, 5th distinct kill in 5 audited runs.** Piece
  `piece_37dc9194c0e197b509a5081b` merged the day-plan and notes copies,
  then was rejected `"same plan described twice on one day: near-identical
  descriptions collapse to one card"` — and no surviving castle card exists
  in the 66 actives (the "one card" this collapse promises is nowhere).
  Changing of the Guard and St. Vitus ship standalone; the castle-ticket
  question ships re-subjected to `subjectType: "trip"` (question without
  its subject card, again).
- **Schönbrunn: 3 of 6, matching the honest 3–4/6 expectation on this
  build.** Palace + Orangeriegarten + Palm House grouped under one parent
  with the contract-compliant call — the fold guard's first live save, and
  the run's only group (zero wrong groups ✓). Apple Strudel Show, Panorama
  Train and Ferris wheel died in the card-vs-note path again
  (absorbed into note piece `piece_f5cab9f2fe3aecc9d375b3cc` "Schonbrunn
  Palace visit", `"repeated but never committed: the city-note copy is the
  single home"`): neither protection basis reaches them — no "at <site>"
  tail, no heading naming them. Gloriette went to the planned-or-ideas
  question, but the question is polluted (next bullet).
- **Jan 18 + Jan 20 committed lists gutted by the note-copy inversion.**
  Albertina, State Hall Library, Time Travel Vienna, Belvedere (Jan 18) and
  Jewish Museum, Laundry, Library, St Stephens (Jan 20) all demoted
  `"repeated but never committed: the city-note copy is the single home"` —
  the ground-truth v2 dedup says the planned day-plan copy WINS. The
  parse emitted note-role copies of the same items (day-section AND
  notes-blob), the pieces carry price/hours text, and without injected
  own-text evidence the deliberate-mention test keeps failing — same
  family as the castle kill, and the reason ground-truth question #2
  (Vienna Friday list) never minted: its three subjects were silently
  note-folded first.
- **Questions: 7 vs budget 3, wrong shapes.** Junk fragment questions
  shipped: "What are the directions?" (heading fragment), "What is the
  title for this link?" (bare URL), castle-descent mode, rental-provider
  name. The Gloriette planned-or-ideas prompt names "**Vienna stay price
  note**" as a candidate plan item — a Costs artifact inside a maker
  question. Baths question lists "Budapest thermal baths note" as a venue
  option. Costs contamination reaches the review surface.
- **Privacy:** stays/travel confirmations, codes, Wi-Fi password all
  correctly behind traveler_password (52 private details) ✓ — but the
  identity-in-prose leaks of chain 3 (Eli's name on two public cards) are
  a hygiene contract miss, and the phantom transport row carries a real
  #GHFHPG onto a fabricated segment.
- Jan-19 idea list stays notes ✓. Jan-21 phrasebook shards stayed OUT of
  cards this run ✓ (they live in Budapest notes text).

## What the recent commits did and did not cause (Eli's hypothesis, checked)

- **aa9e16b + f6a0ec5 did exactly what they were built to do**: R1 died on
  the pre-fix build with the predicted violation pair; R2 assembled a
  repaired draft instead of `assembly-recovery-required`. They introduced
  none of the content defects — but they are why this mess SHIPPED where
  runs 7.23.0-and-earlier would have failed outright. "Previously we
  weren't getting these mess ups" is half-true: previously the same class
  of run died before anyone saw its cards. Containment converted a hard
  failure into a visible-quality failure. That is the intended dark-factory
  trade, but it moves the burden onto the output gates — which chains 1–3
  show are not yet strong enough.
- **The identity-order violation now fires on (at least) both runs of this
  parse** ("activities identity order does not match canonical evidence
  artifacts", identityRepairCount 4). The handoff's read stands: the Arc E
  fold guard changed which pieces flow through merges and tripped a latent
  ordering mine. Repair heals it, but every run now takes the rebuild
  corridor — worth fixing at the source so the corridor goes back to being
  exceptional.
- **b2fe586 (fold guard) is net-positive but incomplete**: first live
  Schönbrunn group + call; does not cover non-"at-site" family members or
  the committed-single-vs-note-copy inversion.
- **a97b36f (evidence injection) shipped dead in production** (chain 4) —
  the fix that was supposed to end merged-prose misclassification never
  engaged, which is why the kill patterns look pre-Arc-E.
- **The junk/leg explosion is NOT attributable to any commit**: source
  recovery recovered 65 lines vs 27 on the same code family — pins and
  temperature were OFF, so parse/recovery variance is unbounded
  run-to-run. This is precisely the case for flipping
  EXTRACTION_PIN_WRITE/REUSE after the Supabase SQL (still pending): with
  pins, "is this variance or code?" becomes a replay question instead of a
  live-run question.

## Fixture assertions wanted (next arc)

1. Costs-section lines recovered by source recovery never become place,
   leg, activity, or question-subject material; dated cost runs
   ("January 15th Prague - $56") specifically do not mint overnight legs.
2. A final transport row with no source anchor that shares a confirmation
   code with an anchored same-trip segment folds or rejects — reversed
   route and mismatched times included (the 7.23.0r phantom shape,
   verbatim).
3. Ticket-blob shards (Client/Seller/Event date/Menu items/receipt
   boilerplate) are booking material: attach or reject, never cards; no
   personal name ever survives into public card prose (Client card and
   GoEuro card shapes as negative fixtures).
4. Evidence injection proves itself in the LIVE pipeline: a staged run's
   lineage must carry provenance counts, and absence of `sourceText` at
   intake must be a loud telemetry signal, not a silent no-op.
5. A committed single day-plan mention (Jan 20 Laundry shape: one activity
   observation in a dated day section, note copies elsewhere) survives the
   card-vs-note reconciliation; the note copy folds into it.
6. "Same plan described twice on one day" collapse must terminate in an
   surviving card (castle shape) — collapsing both copies to zero cards is
   the bug, wherever the target went.

Blind-first integrity: bundle extracted and analyzed before writing any
conclusion; every quoted row, count, id, and error string above is copied
from the live bundle (sha256 above) fetched this session.
