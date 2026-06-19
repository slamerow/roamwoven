# Generated Trip Data Model

Status: working draft  
Updated: 2026-06-18

## Why This Comes First

The generated traveler app cannot be a themed screenshot of Wren's Adventure. It needs a shared trip data model that can express the same travel concepts Wren used, then render them through reusable traveler-app components.

The Asia/Wren workbook is the best reference for the first pass because it shows which pieces were actually needed by a real trip app. It should inform Roamwoven's model, but it should not become Roamwoven's canonical backend. For Roamwoven:

1. Source materials and optional sheet-style edits feed structured records.
2. Structured records are the maker-editable source of truth.
3. A published traveler snapshot compiles those records for the hosted traveler app.
4. The traveler UI renders a view model derived from the snapshot.

In plainer terms: define the pieces first, then design a cleaner Roamwoven sheet/editor around those pieces, then build the adapters and traveler app.

## What Wren's Workbook Proved

The uploaded workbook has five tabs:

- `README`
- `Categories`
- `Legs`
- `Activities`
- `Phrases`

The Wren app consumed the four data tabs as live published CSVs. The app referenced columns by name, normalized each row into typed objects, validated cross-row references, and then derived Today, Calendar, Stay, Search, Map, Weather, and Phrasebook screens.

### Wren Columns

`Categories`

- `category_id`
- `description`
- `emoji`

`Legs`

- `leg_id`
- `country`
- `city`
- `arrive`
- `leave`
- `nights`
- `stay_name`
- `stay_address`
- `why`
- `arrival_flight`
- `departure_flight`
- `notes`
- `timezone`
- `language`
- `latitude`
- `longitude`

`Activities`

- `activity_id`
- `leg_id`
- `date`
- `start_time`
- `end_time`
- `title`
- `description`
- `category`
- `location_name`
- `address`
- `url`
- `notes`

`Phrases`

- `language`
- `category`
- `english`
- `script`
- `pronunciation`
- `verify`

## How Wren Used Those Pieces

The source columns were compact, but the app got a lot from them:

- `leg_id` and `activity_id` were stable IDs for references, photos, detail views, and deep-link-safe behavior.
- `arrive` and `leave` built the trip calendar. `leave` was exclusive, so a stay from July 2 to July 7 includes July 2-6.
- A single day could include multiple legs. Split travel days worked by combining legs whose date range touched that day plus activities dated that day.
- `timezone` powered correct Today behavior across long trips.
- `language` selected phrasebook rows.
- `latitude` and `longitude` powered map pins and weather. Weather fell back to city/country geocoding if coordinates were missing.
- `category_id`, `description`, and `emoji` powered category cards and activity-card icons.
- `stay_name` and `stay_address` powered the Stay tool and map link.
- `location_name`, `address`, and `url` powered activity detail views and maps.
- `description` and `notes` carried practical booking context, but Wren had no field-level privacy model, so Roamwoven needs to split private details out more intentionally.
- Photos were not in the sheet. They lived in Supabase as `trip_photos` and referenced `leg_id` plus `trip_date`.

## Roamwoven V1 Records

Roamwoven should keep Wren's useful concepts, but separate the data more clearly where V1 needs editing, privacy, or parsing decisions.

### `trip`

One generated app project.

Core fields:

- `id`
- `owner_user_id`
- `name`
- `traveler_app_title`
- `destination_summary`
- `start_date`
- `end_date`
- `status`
- `payment_status`
- `processing_status`
- `theme_pack`
- `published_app_token`
- `published_snapshot_id`
- `photo_sharing_enabled`
- `traveler_password_enabled`

### `trip_days`

One row per calendar date in the traveler app. Most rows can be generated from legs plus dated records, but the record should exist in the published snapshot because the traveler UI renders days.

Core fields:

- `id`
- `trip_id`
- `date`
- `day_number`
- `title`
- `summary`
- `primary_leg_id`
- `leg_ids`
- `status`
- `sort_order`
- `source_confidence`
- `review_required`

Why first-class:

- The traveler app's Today and Calendar surfaces render days, not raw parser output.
- Multi-leg travel days need explicit representation.
- Historical/sample trips need Today to anchor to first trip day when real current date does not apply.

### `trip_legs`

The route spine: one row per city, region, stop, or major overnight base.

Core fields:

- `id`
- `trip_id`
- `leg_key`
- `country`
- `region`
- `city`
- `display_name`
- `arrive_date`
- `leave_date`
- `timezone`
- `language`
- `latitude`
- `longitude`
- `summary`
- `sort_order`
- `status`
- `source_confidence`
- `review_required`

Keep from Wren:

- stable leg key
- date range
- timezone
- language
- coordinates

Change from Wren:

- Do not store lodging/private access directly on the leg. Link stays and private details instead.

### `trip_stays`

Lodging is important enough to be first-class. It is sensitive, map-relevant, date-bound, and often has check-in/access details.

Core fields:

- `id`
- `trip_id`
- `leg_id`
- `name`
- `stay_type`
- `check_in_date`
- `check_out_date`
- `check_in_time`
- `check_out_time`
- `public_location_label`
- `address`
- `latitude`
- `longitude`
- `booking_url`
- `confirmation_label`
- `status`
- `source_confidence`
- `review_required`

Privacy fields:

- `address_visibility`
- `confirmation_visibility`
- `access_details_visibility`
- `private_detail_ids`

Default privacy:

- Exact private residences, Airbnb addresses, room numbers, host contact, access codes, and booking control details should default to traveler-password-only.
- Hotel names and public area labels can usually appear in follower mode.

### `trip_transport`

Flights, trains, ferries, rental cars, transfers, buses, and major drives should be first-class because they are critical path logistics.

Core fields:

- `id`
- `trip_id`
- `leg_id`
- `from_leg_id`
- `to_leg_id`
- `transport_type`
- `provider`
- `route_label`
- `date`
- `departure_time`
- `arrival_time`
- `departure_location`
- `arrival_location`
- `confirmation_label`
- `booking_url`
- `description`
- `status`
- `source_confidence`
- `review_required`

Privacy fields:

- `confirmation_visibility`
- `booking_url_visibility`
- `private_detail_ids`

Why not just an activity:

- Transport connects places and often defines trip-day boundaries.
- It has different required fields than an activity.
- It drives "what happens next" more strongly than a normal card.

### `trip_items`

The unified traveler card record for activities, dining reservations, notes, admin tasks, rest days, and placeholders.

Core fields:

- `id`
- `trip_id`
- `leg_id`
- `parent_item_id`
- `item_type`
- `date`
- `start_time`
- `end_time`
- `title`
- `summary`
- `description`
- `category_id`
- `location_name`
- `address`
- `latitude`
- `longitude`
- `url`
- `status`
- `sort_order`
- `source_confidence`
- `review_required`

Allowed `item_type` values:

- `activity`
- `note`
- `admin`
- `rest_day`
- `social`
- `placeholder`

Dining reservation rule:

- Restaurant reservations, cafes, bars, and meal plans are `trip_items` with `item_type = activity`.
- They should usually use `category_id = food_dining`, because Categories are the Wren-style traveler organization layer.
- Do not create a separate visible `restaurant` type unless restaurant-specific booking/payment/vendor integrations become real later.

### `trip_categories`

Controlled vocabulary for traveler card grouping and iconography.

Core fields:

- `id`
- `trip_id`
- `category_key`
- `label`
- `description`
- `icon`
- `emoji`
- `sort_order`
- `enabled`

V1 can start from a global default category set, then store trip-specific overrides only when needed.

### `trip_private_details`

Private details should not be hidden inside giant descriptions. They need their own record so the maker app can review, protect, reveal, or remove them.

Core fields:

- `id`
- `trip_id`
- `subject_type`
- `subject_id`
- `detail_type`
- `label`
- `value`
- `visibility`
- `reason`
- `source_confidence`
- `review_required`

Allowed `visibility` values:

- `public`
- `traveler_password`
- `maker_only`
- `hidden`

Default sensitive `detail_type` values:

- `private_address`
- `door_code`
- `room_number`
- `host_contact`
- `confirmation_number`
- `booking_reference`
- `ticket_number`
- `payment_detail`
- `identity_detail`
- `medical_or_child_note`
- `personal_safety_note`
- `wifi_password`

### `trip_review_decisions`

Review decisions are the maker's edits to structured records after parsing. They should be persisted as an audit/update layer, then applied to structured records before building the traveler snapshot.

Core fields:

- `id`
- `trip_id`
- `action`
- `subject_type`
- `subject_id`
- `payload_json`
- `note`
- `created_at`
- `created_by_user_id`

Allowed `action` values:

- `confirm`: marks the record as correct enough to build from and removes it from the review queue.
- `edit`: changes record fields such as title, date, leg, category/type, description, stay details, or transport fields.
- `protect`: changes field/detail visibility, usually to `traveler_password`.
- `delete`: removes the record from the traveler app by marking it `ignored`; the UI can call this Delete or Ignore without making it a separate workflow.
- `combine`: folds duplicate or related cards into a target record, preserving the target and marking source cards ignored/linked.
- `answer_question`: records an answer to a generated question, usually resolving into edit, confirm, protect, delete, or combine behavior.

Current code:

- `lib/generated-trip-decisions.ts` defines the decision union and pure apply helpers.
- `lib/review-decisions.ts` serializes decisions into `payload_json`, loads saved decisions, and applies them to structured records.
- `db/schema.sql` includes the owner-scoped `trip_review_decisions` table, grants, indexes, and RLS policy.
- `app/maker/trips/[tripId]/data/decisions/route.ts` persists review controls: confirm, edit, protect, delete/ignore, combine, and mark-question-answered.
- The first test coverage applies edit, protect, combine, answer-question, and delete decisions to parser-generated records.

### `trip_photos`

Photos are a separate media system, not sheet-only data.

Core fields:

- `id`
- `trip_id`
- `leg_id`
- `trip_date`
- `storage_path`
- `caption`
- `width`
- `height`
- `captured_at`
- `published_at`
- `uploader_label`
- `status`
- `visibility`

Notes:

- V1 should keep no video.
- Photo upload is unlocked by the same trip password as traveler mode.
- Photos can attach to date, leg, item, or whole trip over time. Start with date and leg because Wren already proved that works.

### `trip_phrases`

Phrasebook records keyed by language and category.

Core fields:

- `id`
- `trip_id`
- `language`
- `category`
- `english`
- `script`
- `pronunciation`
- `verify_status`
- `sort_order`

Notes:

- Legs determine which phrase language is active.
- English-language legs should suppress phrasebook by default unless the maker explicitly enables phrases.

### `trip_weather_hooks`

Weather should be a hook into the traveler app, not stored forecast truth.

Core fields:

- `id`
- `trip_id`
- `leg_id`
- `date`
- `location_label`
- `latitude`
- `longitude`
- `timezone`
- `source`
- `enabled`

Notes:

- Forecast results are volatile and can be cached separately.
- Hook inputs should prefer coordinates, then stay location, then city/country.
- Open-Meteo's forecast window means future dates outside the window should show an honest "available soon" state.

### `trip_review_questions`

Questions generated from uncertain or conflicting source material.

Core fields:

- `id`
- `trip_id`
- `subject_type`
- `subject_id`
- `prompt`
- `reason`
- `answer_type`
- `answer_value`
- `status`
- `source_confidence`
- `created_at`
- `resolved_at`

Why first-class:

- Review/edit forms should be built around this model.
- Confident records should not clutter the V1 review queue.

## Proposed Roamwoven Sheet Tabs

If we design a Roamwoven sheet-style backend/editor, the tabs should be more explicit than Wren's compact workbook:

1. `Trip`
2. `Days`
3. `Legs`
4. `Stays`
5. `Transport`
6. `Items`
7. `Categories`
8. `Private Details`
9. `Photos`
10. `Phrases`
11. `Weather Hooks`
12. `Review Questions`

This is not necessarily the UI the customer sees. It is the clean technical staging shape for imports, exports, QA, and power-user debugging.

## Traveler App View Model

The traveler app should not render raw database rows or sheet rows. It should render a compiled view model:

```ts
type TravelerAppViewModel = {
  trip: TravelerTripSummary;
  navigation: TravelerNavigation;
  days: TravelerDayView[];
  legs: TravelerLegView[];
  categories: TravelerCategoryView[];
  cards: TravelerCardView[];
  photos: TravelerPhotoView[];
  phrases: TravelerPhrasebookView[];
  privacy: TravelerPrivacyModel;
  weatherHooks: TravelerWeatherHookView[];
};
```

Key derived views:

- `Today` reads `days`, `cards`, active date logic, and weather hooks.
- `Legs` reads `legs`, linked stays, transport, and cards.
- `Categories` reads categories and card counts.
- `Calendar` reads `days`, `legs`, and card counts.
- `Search` reads cards, legs, stays, transport, and safe searchable private-detail labels.
- `Map` reads legs, stays, transport endpoints, and card coordinates.
- `Stay` reads the active leg's linked stay plus private details based on access mode.
- `Phrases` reads the active leg language and phrase rows.
- `Photos` reads photo rows filtered by date, leg, or item.

## Adapter Layers

Roamwoven needs explicit adapters, not one giant parser-to-UI shortcut.

### Workbook Adapter

Input:

- Wren-style workbook tabs or Roamwoven sheet tabs.

Output:

- Structured records above.

Use:

- Legacy import.
- QA against Wren.
- Future power-user export/import.

### Draft Parser Adapter

Input:

- `trip_draft_snapshots.draft_json` from OpenAI extraction.

Output:

- Structured records above.
- Review questions for uncertain or conflicting facts.
- Private-detail records for sensitive data.

Use:

- Paid first app build.

### Published Snapshot Adapter

Input:

- Confirmed structured records.

Output:

- `TravelerAppViewModel` stored as a published snapshot JSON.

Use:

- Fast traveler-app rendering.
- Stable published app even while maker edits a future update.

Current code:

- `lib/published-snapshots.ts` compiles applied structured records into a versioned traveler-app snapshot payload.
- `published_trip_snapshots` in `db/schema.sql` stores the snapshot JSON, version, and share token.
- `app/maker/trips/[tripId]/publish/snapshot/route.ts` creates a new snapshot only after checkout, parsing, and review decisions are complete.
- `app/t/[token]/page.tsx` can render real snapshot payloads by token when `SUPABASE_SERVICE_ROLE_KEY` is configured server-side; `/t/demo` remains the local reference fallback.

## Immediate Implementation Order

1. Define TypeScript types for structured trip records and `TravelerAppViewModel`. Done in `lib/generated-trip-model.ts` and `lib/traveler-view-model.ts`.
2. Build a Wren workbook/seed adapter into those types. First seed adapter exists in `getAsiaDemoStructuredTripRecords()`.
3. Change `/t/demo` to render `TravelerAppViewModel` instead of Asia-demo-specific rows. Done; `TravelerAppShell` now consumes `TravelerAppViewModel`.
4. Build a draft parser adapter from current `trip_draft_snapshots.draft_json` into those records. First adapter exists in `lib/extraction/draft-to-structured-trip.ts`. Draft day generation now follows Wren's leave-date-exclusive rule, so a Sep 1 to Sep 3 leg creates Sep 1 and Sep 2 as trip days unless another dated record lands on Sep 3.
5. Add adapter fixture tests. Done in `tests/generated-trip-model.test.ts`; run with `npm test`.
6. Build review/edit forms around records and review questions. The first grouped review contract now lives in `lib/generated-trip-review.ts`: it creates the maker-facing summary, review count, and sections for Legs, Stays, Transport, Activities, Privacy, and Questions.
7. Define review decisions before wiring persistent forms. Done in `lib/generated-trip-decisions.ts`: confirm, edit, protect, delete/ignore, combine, and answer-question apply to structured records in a testable way.
8. Add the persistence table/action layer for review decisions. The additive schema and data-access helper now exist in `db/schema.sql` and `lib/review-decisions.ts`.
9. Wire card controls to write decisions and re-render the applied structured records. Done for confirm, protect, delete/ignore, mark-question-answered, record-specific edit forms, and item combine.
10. Move summary/publish onto applied structured records and published traveler snapshots. Done for summary, publish snapshot creation, and token-based traveler rendering.
11. Next: browser-test the paid trip after production SQL is applied, then decide whether structured records themselves should be persisted as tables before relying on decision replay long term.
12. Return to Design preview only after it can render the real traveler view model.

## Open Product Decisions

- Whether dining later needs restaurant-specific fields behind the same activity/category view model.
- Whether `days` are stored as canonical editable rows immediately, or generated at publish time and exposed in the view model first.
- Whether `weather_hooks` need a database table immediately, or can be part of the published snapshot.
- How much of `private_details.value` is searchable in unlocked traveler mode.
- How late-document updates patch records without forcing a full rebuild.
