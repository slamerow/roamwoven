# Overnight Build Handoff

## Goal

Build the next useful Roamwoven maker step while keeping product/design decisions reversible:

Upload materials -> confirm data scope -> choose design -> review structured trip data.

The immediate target is the structured data review screen. It should feel like the place where the maker checks what Roamwoven understood before the traveler app is generated/published.

## Best Overnight Mission

Build the structured data review framework using mocked/seeded data.

Do not wire paid AI extraction yet. Do not introduce background jobs yet. Do not make irreversible visual direction decisions. The goal is to make the review workflow real enough for product testing tomorrow.

## Scope To Build

- Replace the placeholder structured data screen with reviewable sections:
  - Trip overview.
  - Dates and places.
  - Flights and transport.
  - Stays.
  - Daily activities/cards.
  - Missing or ambiguous details.
  - Sensitive card details that may need password protection.
  - Manual additions.
- Add obvious controls for reviewing data:
  - Edit item.
  - Add item.
  - Delete item.
  - Mark as confirmed.
  - Flag as needs review.
- Keep the data mocked or derived from existing demo/reference data for now.
- Make the UI compatible with the selected design settings where reasonable, but do not spend the night perfecting design packs.
- Add swatch-click support for secondary/accent/soft colors in the design picker, while keeping dropdowns.

## Guardrails

- No new paid services.
- No AI extraction calls.
- No destructive database changes.
- No deleting or rewriting existing user data.
- Additive schema changes are allowed only when clearly necessary, and must be added to `db/schema.sql` and documented.
- If production SQL is needed, prefer pausing for user confirmation unless it is a narrow additive `alter table ... add column if not exists` that is clearly required to test the deployed code.
- Keep payment-before-expensive-processing intact.
- Keep owner-scoped Supabase access intact.
- Do not finalize the privacy model beyond this working principle:
  - The maker can publish without a password.
  - The maker can protect the whole traveler app with one password.
  - The maker can password-protect photos separately.
  - Sensitive details inside specific cards can be password-protected when the maker chooses.

## What Should Wait For User Review

- Final design pack taste and naming.
- Homepage copy and overall brand voice.
- Exact privacy UX.
- Pricing, beta discounts, and checkout changes.
- Real AI extraction architecture and cost controls.
- Public traveler app publish/share behavior.

## Verification

Run:

```bash
npm run build
```

If tests are added, also run the relevant test command.

Before handing back, update:

- `docs/next-session.md`
- This file, if the overnight scope changes

## Tomorrow Test Checklist

Ask the user to test:

1. Open the paid trip workspace.
2. Continue building from the current step.
3. Confirm data scope saves.
4. Design choices save.
5. Structured data review screen loads.
6. Review sections are understandable.
7. Add/edit/delete controls feel like the right workflow.
8. Missing-detail prompts make sense.
9. Sensitive-card-detail protection concept feels low-friction.

## Suggested Commit Summary

Build structured data review scaffold
