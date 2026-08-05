# Work order — city-keyed, dateless City Notes (2026-08-05)

## Why this is a separate bounded change

RW-CLS-001 already decides the product behavior: one City Note collection per
city, surfaced on every leg for that city, with no day. The structured model
does not yet express that decision. Projection assigns a note to the first leg
whose city matches, and the traveler view compensates by copying that note to
other same-city legs. A repeat-city trip therefore looks right only because the
presentation layer reverse-engineers city ownership from an arbitrary leg.

This work changes structured identity and its consumers. It does not change
classification, note content, grouping, privacy, model input, or geocoding.

## Contract

1. Every newly projected active City Note has `date: null`, `legId: null`, and
   an explicit `cityNoteKey` derived from a canonical trip-leg city.
2. Repeated legs for the same city and country share one key and surface the
   same note record. A leg is a display anchor, never the note's owner.
3. An explicit note city wins when it resolves to one canonical leg-city
   identity. Otherwise an in-range source date may resolve the parent leg; this
   is how a day-trip town's notes land in the parent city's collection before
   the source date is discarded.
4. A unique leg-city named by the note title, or the sole city in a one-city
   trip, is a valid fallback. A note that still has no unambiguous city key is
   retained, marked `needs_review`, and not attached to an arbitrary leg.
5. Same-named cities in different countries remain distinct. When the name is
   ambiguous, an in-range source date may disambiguate the canonical leg-city.
6. Old saved records without `cityNoteKey` remain readable through their legacy
   `legId`; any newly created or maker-moved note uses the new identity.
7. Summary, review, traveler presentation, review decisions, and extraction
   fingerprints consume the same shared city-key helper.

## Regression matrix

- A Prague note is dateless, has no owning leg, and still appears under Prague.
- One Rome note appears on both Rome legs with one shared id and key.
- A Potsdam note dated inside a Berlin leg receives Berlin's key, then loses its
  date and owning leg.
- Two Springfields in different countries do not share notes; the source date
  disambiguates which canonical city receives the note.
- A generic note in a multi-city trip with no city or date is retained and
  flagged rather than silently assigned to the first leg.
- The maker's move-to-city-tip action creates or merges by city key, not leg id.
- Legacy leg-owned snapshots still render while the new projection never emits
  that shape.

## Acceptance

- Targeted City Note and decision tests pass.
- Full test suite and typecheck pass.
- Offline pinned scorecard changes `CLS-3` from NOT BUILT to PASS without
  regressing any other assertion.
- The handoff, findings inbox, and RW-CLS-001 evidence name the implementation
  and measured result.

## Result

Complete. `TripItemRecord.cityNoteKey` is the durable owner for new City Notes;
projection always emits `date: null` and `legId: null` for them. The shared
helper in `lib/city-note-identity.ts` drives traveler display, generated
summary, structured review, maker move/merge decisions, fingerprints, and the
served audit lineage. Legacy records without the field still resolve through
their old leg and display across repeat-city legs.

The regression matrix is implemented in `tests/generated-trip-model.test.ts`,
including a maker move on Rome's return leg merging into the existing
city-owned note rather than creating a second collection. The full 81-file
suite and 43 Node cases pass; typecheck and scorecard dry-run pass. Pinned
offline replay now scores **FAIL 1 · NOT CHECKABLE 0 · NOT BUILT 1 · PASS 29**.
`CLS-3` is PASS with four active notes, each carrying one city key, no date,
and no owning leg. The sole FAIL and sole NOT BUILT item are unchanged and
unrelated: the Mumok/Natural-History source contradiction and stable decision
anchors, respectively.
