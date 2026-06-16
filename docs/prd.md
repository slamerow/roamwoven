# Roamwoven Product Requirements Document

Version: 0.1
Date: 2026-06-16
Status: Working draft

## 1. Product Summary

Roamwoven turns messy trip materials into a clean, private, mobile-friendly trip app.

The customer has already planned, booked, or partially organized their trip. They may have flight PDFs, hotel confirmations, screenshots, notes, spreadsheets, Word documents, reservation emails saved as files, and half-finished itinerary docs. Roamwoven's job is not to plan the trip. Its job is to structure what already exists, identify what is missing, ask clear follow-up questions, and generate a polished private travel app.

The Asia trip app, currently named "Wren's Adventure," is both the user's real personal trip app and the reference example for generated output. It is not the name of the product. Customers should be able to name their own generated app.

Wren's Adventure is the architectural and UX north star for the traveler app: legs, categories, calendar/day views, search, phrases, maps, and polished mobile cards should carry forward into Roamwoven rather than being treated as disposable demo details.

## 2. Positioning

### Core Promise

Turn your trip details into your private travel app.

### What Roamwoven Is

- A trip data structuring and app generation tool.
- A maker app for uploading materials, answering clarification questions, editing trip data, and publishing the traveler app.
- A private PWA-style traveler app that works well on mobile and can be added to a phone home screen.

### What Roamwoven Is Not

- Not an itinerary planner in V1.
- Not a booking engine.
- Not a recommendation engine.
- Not a price tracker.
- Not a native App Store / Play Store app generator in V1.
- Not a travel-agent-only professional platform, though travel agents may use it if they want.

## 3. Target Customer

The first customer is an individual, couple, or family planning a meaningful personal trip. The trip may be complex enough that a normal PDF itinerary, notes app, or spreadsheet becomes annoying to use on the road.

The customer is likely the "master planner" for the trip. Other travelers may use the final traveler app, but V1 does not need complex collaboration, user roles, or permissions.

The product should feel consumer-friendly and magical, not like an internal database tool.

## 4. Business Model Assumptions

Roamwoven is sold as a one-time per-trip purchase.

Payment should happen before expensive AI extraction and structuring begins. The product should not allow users to upload large volumes of materials, consume expensive processing, and churn before paying.

Launch pricing should position Roamwoven as a premium but accessible product, not a disposable utility. The current working assumption is a flat $25 per trip for most customers.

Rationale:

- Simple price communication is better than complex trip-length pricing at launch.
- $25 feels meaningfully easier to buy than $30; preserve this price unless real cost data forces a change.
- A $25 trip fee leaves room for AI, storage, payment, and support costs while still feeling reasonable for a meaningful personal trip.
- If the trip is unusually short, the product can offer an automatic goodwill discount, such as $5 off for a three-day trip, without making pricing feel complicated.
- Longer trips can still fit the flat fee if internal cost controls, upload limits, and refresh limits exist without making normal customers feel nickel-and-dimed.
- The target unit economics are roughly under $5 in platform/AI/storage/admin cost per trip, leaving close to $20 gross profit before taxes, refunds, disputes, and unusual support.

Potential future pricing:

- Short-trip automatic discount.
- Referral credit: when a referred customer buys a trip, the referrer gets a free or discounted future trip.
- Unlimited personal plan around $150-199/year, with terms that prohibit commercial resale, automated abuse, or travel-agent usage unless separately approved.
- Travel-agent or small-business plan as a separate commercial tier.

Beta payment should use real Stripe Checkout early. Beta testers can receive promo codes or discounts rather than bypassing checkout entirely, so the payment and fulfillment flow is tested before public launch.

Potential future monetization:

- Premium visual customization.
- Sheet access/export.
- Additional generated app templates.
- Travel-agent or small-business accounts.
- More included trips or bundles.

## 5. Product Surface

Roamwoven has two main surfaces.

### Maker App

The maker app is where the paying customer creates and maintains the trip.

The maker app supports:

- Account/login.
- Trip dashboard.
- Payment.
- File upload and pasted notes.
- Intake review.
- Clarification questions.
- Trip data editing.
- Placeholder resolution.
- App preview.
- Publish/share controls.
- App refresh after edits.

The maker app is the primary source of truth for normal users.

### Traveler App

The traveler app is the generated private trip app.

The traveler app supports:

- Private shareable URL with a high-entropy unguessable token.
- Optional traveler password, at minimum for trips or photo albums where the customer wants an extra privacy layer.
- Mobile-first layout.
- PWA/add-to-home-screen behavior.
- Offline access to core itinerary content where feasible.
- Day-by-day cards.
- Trip legs/city stays.
- Activity cards.
- Placeholder cards for missing details.
- Maps/addresses/links where available.
- Phrasebook and other optional enhancements where available.

The traveler app should be usable by family members who never see the maker app.

## 6. V1 User Journey

### Step 1: Landing / Demo

Before payment, the customer can see a product explanation and screenshots/previews based on the Asia trip app.

The demo should show the finished value without processing the customer's actual data for free.

### Step 2: Create Account

The customer creates an account or logs in.

V1 may support shared login credentials for a family/couple. It does not need admin/member permissions.

### Step 3: Create Trip

The customer creates a trip with basic information:

- Trip name.
- Approximate dates, if known.
- Primary traveler/family name, optional.
- Destination summary, optional.

The trip name can become the generated app name, but the customer can edit it later.

### Step 4: Pay

The customer pays the one-time per-trip fee before expensive AI processing begins.

### Step 5: Upload / Dump Materials

The customer uploads or pastes all available trip materials.

V1 input types:

- PDF files.
- Word documents.
- Screenshots/images.
- Spreadsheets.
- Pasted notes/text.
- Saved email confirmations as files or copied text.

V1 non-goal:

- Direct email forwarding.
- Gmail/Google Drive import.
- Live inbox scanning.

Future email forwarding may use one inbound email address plus a unique trip identifier, but this should not be part of V1 unless later prioritized.

### Step 6: Intake Review

Roamwoven analyzes the uploaded materials and shows a compact summary.

Example:

> We found 6 travel bookings, 4 stays, 42 activities or notes, and 10 items that need review.

The intake review may classify documents into categories:

- Travel.
- Lodging.
- Activity/booking.
- General notes.
- Unknown.

Users should not be forced to manually categorize every upload. Roamwoven should only ask for document-type confirmation when confidence is low.

### Step 7: Clarification Flow

Roamwoven asks follow-up questions in a clean, progress-based flow.

The flow should feel closer to TurboTax than a spreadsheet cleanup task: users should always know what section they are in, how many items remain, and roughly how close they are to a usable app.

Recommended clarification sections:

1. Trip structure.
2. Travel.
3. Stays.
4. Fixed bookings.
5. Activities and notes.
6. Placeholder review.
7. Style choices.

Question ordering should prioritize structural and high-risk items first.

Users can skip most questions. Skipped or unresolved items become placeholders where possible.

Some structurally critical questions may block publish if the app cannot place content meaningfully. Even then, the product should prefer placeholder creation over invisible omissions.

### Step 8: Preview

After extraction and clarification, the customer can preview the generated traveler app.

Because the customer has already paid, the preview is a quality-control step, not a free conversion tactic.

V1 customization should be intentionally limited:

- App name.
- Theme pack.
- Color palette within the chosen theme.
- Possibly cover image.

V1 should not support arbitrary layout editing, custom templates, or complex design controls.

Initial theme direction:

- Standard Adventure: warm, grounded, outdoorsy, and clear.
- Modern / Futuristic: crisp, dark, and precise without feeling gimmicky.
- Whimsical / Storybook: more playful and fantasy-adjacent, but still polished.
- Quiet Luxury: understated, premium, and "stealth wealth" rather than ornate.

The default commercial feel should lean Quiet Luxury: restrained, confident, mobile-first, with fewer decorative flourishes and a high-quality editorial feel.

### Step 9: Publish

The customer publishes the private traveler app.

The app should be accessible via a private URL. V1 can support "add to home screen" instructions for iOS/Android rather than native app-store distribution.

### Step 10: Maintain

After publishing, the customer edits the trip in the maker app.

Edits should refresh the traveler app automatically or near-automatically.

The user should not need to edit a sheet directly, though sheet access/export may become a paid or power-user feature.

## 7. Input Processing Requirements

Roamwoven must extract trip facts from messy materials and map them into structured trip data.

### Required Extraction Domains

- Flights.
- Trains/ferries/ground transport where obvious.
- Rental cars.
- Lodging.
- Fixed reservations.
- Activities.
- Restaurants/food plans.
- General notes.
- Free days/rest days.
- Location/address details.
- Confirmation numbers where present.

### Processing Principles

- Preserve source facts.
- Do not silently invent critical details.
- Make best-effort formatting improvements for readability.
- Keep user-facing language natural.
- Track confidence and source provenance internally.
- Prefer asking the user over making risky guesses.

### Confidence Handling

Confidence should be field-specific rather than one global threshold.

High-risk fields require high confidence:

- Flight date.
- Flight time.
- Flight number.
- Departure/arrival airport.
- Hotel dates.
- City/leg assignment.
- Reservation date/time.
- Confirmation number.

Lower-risk fields can tolerate more inference:

- Activity description.
- Category.
- Display title.
- General notes.
- Optional URL.

Recommended behavior:

- High confidence + low risk: auto-accept.
- High confidence + high risk: accept but mark internally as important.
- Medium confidence + high risk: ask the user.
- Medium confidence + low risk: accept, possibly show in review.
- Low confidence: ask or create placeholder.
- Conflicting sources: ask the user.

## 8. Data Model

The Asia workbook is the reference implementation and sample output. It should guide V1, but it is not sacred. The data model may evolve where it improves reliability, maintainability, or user experience.

Current reference tabs:

- README.
- Categories.
- Legs.
- Activities.
- Phrases.

### Legs

Legs are the trip spine: where the traveler is, when, and for how long.

Reference fields:

- leg_id.
- country.
- city.
- arrive.
- leave.
- nights.
- stay_name.
- stay_address.
- why.
- arrival_flight.
- departure_flight.
- notes.
- timezone.
- language.
- latitude.
- longitude.

Potential refinements:

- Separate lodging reservations from city legs if needed.
- Add source/confidence fields internally.
- Add status fields for missing/placeholder details.
- Add display controls if traveler app needs them.

### Activities

Activities are the card feed rendered in the traveler app.

Reference fields:

- activity_id.
- leg_id.
- date.
- start_time.
- end_time.
- title.
- description.
- category.
- location_name.
- address.
- url.
- notes.

Potential refinements:

- Add placeholder_type.
- Add status.
- Add source document reference.
- Add confidence score.
- Add review_required flag.
- Add sort_order for same-day ordering.

### Categories

Categories provide controlled vocabulary for display and grouping.

Reference categories:

- arrival_departure.
- food_dining.
- food_class.
- art_culture.
- art_class.
- temple_shrine.
- nature_outdoors.
- beach_water.
- animal_experience.
- shopping_tailor.
- wellness_&_relaxation.
- kid_activity.
- admin_logistics.
- rest_day.
- social.
- scenic_ride.

Potential refinements:

- Split "arrival_departure" into more specific travel types internally while keeping a simple display group.
- Add placeholder-specific categories.
- Add icon/color metadata.

### Phrases

Phrases are optional enhancement content keyed by leg language.

Reference fields:

- language.
- category.
- english.
- script.
- pronunciation.
- verify.

V1 can include phrasebook generation if cost and reliability are acceptable, but it should not block the core product.

Phrasebook UX should use curated packs rather than a blank free-text field as the primary experience.

Recommended model:

- Each trip/language can include phrase packs of about 10-15 useful words or short phrases.
- Initial packs might include basics, food, transit, lodging, kid/family, emergencies, courtesy, shopping, and allergies.
- Users can optionally add their own phrase later, but the default flow should not make them invent the phrasebook from scratch.
- Generated phrases should be marked for verification or omitted when confidence is weak.

## 9. Placeholder Strategy

The app should avoid silent absences. If something important is known to be missing, create a placeholder card.

Placeholder cards should appear calmly in the traveler app and actionably in the maker app.

### Traveler App Placeholder Tone

Traveler-facing placeholders should look like normal cards with an incomplete state.

Example:

> Hotel details needed
>
> Add your stay info when ready. This card is here so the day still makes sense.

Avoid alarming warning styling unless the missing information could affect travel safety or arrival logistics.

### Maker App Placeholder Tone

Maker-facing placeholders should behave like tasks.

Example:

> Missing hotel for Kyoto, July 20-26.

### Placeholder Types

Initial V1 placeholder types:

- Flight needed.
- Travel details needed.
- Hotel/stay needed.
- Transfer needed.
- Activity details needed.
- Restaurant TBD.
- Location needed.
- Date needed.
- Time needed.
- Confirmation details needed.
- Needs placement.

### Needs Placement

If an item cannot be assigned to a date or city/leg, it should appear in a maker-app "Needs placement" queue.

If published before assignment, unresolved items may appear in a general "Needs Planning" section, but they should not silently disappear.

## 10. Maintenance Model

The maker app is the normal user's source of truth.

Users should be able to edit all trip content through the maker app:

- Flights.
- Stays.
- Activities.
- Restaurants.
- Transport.
- Notes.
- Placeholder cards.
- Dates/times.
- Addresses.
- URLs.
- Confirmation details.

The edit experience is a core product surface, not an admin fallback. Users will often want to add detail after seeing a bare-bones generated card.

The maker editor should make it easy to:

- Add or rewrite a short title.
- Add a one- or two-line description.
- Preserve or hide confirmation numbers.
- Preserve or hide exact addresses.
- Mark an item as intentionally skipped.
- Keep a placeholder visible without making it feel broken.

AI-generated titles and descriptions may be used to make cards feel complete, but they must err on the side of simple and factual. The system should not invent logistical facts, times, addresses, confirmation numbers, or booking details.

The structured sheet can remain an internal output or power-user export.

### Sheet Access

V1 can use Google Sheets or a sheet-like backend internally if that accelerates development.

Users do not need to know the sheet exists.

Possible future premium feature:

- View/export clean structured sheet.
- Direct sheet access for power users.

If direct sheet edits are supported, traveler app data should refresh automatically or near-automatically.

## 11. Traveler App Requirements

The generated app should be a private mobile-first web app/PWA.

### Required V1 Capabilities

- Private URL.
- Mobile-friendly layout.
- Add-to-home-screen support.
- Offline access to core itinerary content where feasible.
- Day-by-day browsing.
- Current/today state where possible.
- Cards for activities, travel, stays, and placeholders.
- Address/map links.
- External URLs.
- Search or simple filtering, if practical.
- Photo sharing with explicit privacy and retention controls.
- App refresh after maker edits.

### Offline Scope

V1 offline support should cover:

- Trip days.
- Legs.
- Activity cards.
- Stay/travel details.
- Phrasebook, if included.
- Static notes.

V1 offline support does not need to cover:

- Live weather.
- Newly edited data before sync.
- External websites.
- Live maps.
- Full-resolution photo albums.

## 12. Admin / Dashboard Requirements

The customer should have an account dashboard where they can manage multiple trips.

V1 supports:

- One account.
- Multiple trips.
- One-time payment per trip.
- Shared login as the simple collaboration model.

V1 does not support:

- Organization accounts.
- Admin/member roles.
- Fine-grained permissions.
- Multi-user comment threads.

## 13. Quality Bar

The Asia trip should be the primary V1 test case.

Success means:

- Core trip legs are correctly extracted.
- All days are represented.
- Flights and lodging are not missed.
- Fixed bookings land on the correct date.
- Missing critical details become placeholders.
- The traveler app is usable on mobile.
- The maker flow can take a complex trip from upload to usable app in 30-45 minutes, with 60 minutes acceptable for a very complex trip.

Target timing:

- 5 minutes to upload/dump materials, excluding time spent gathering files.
- 5 minutes to process and sort.
- 20 minutes or less for the main questionnaire, with skip/placeholder options.
- 1-2 simple UI/style choices.
- Preview and publish.

Expectation: users will expect near perfection. Missing a flight or placing a hotel on the wrong date is a severe failure.

## 14. V1 Non-Goals

Explicitly out of scope for V1:

- AI itinerary generation.
- Booking travel.
- Recommending destinations.
- Recommending restaurants/activities from scratch.
- Price tracking.
- Complex collaboration.
- Native app-store publication.
- Full design/template customization.
- Direct email forwarding.
- Gmail/Google Drive import.
- Travel-agent CRM features.
- Full two-way public sheet editing as the primary UX.
- Video upload, storage, or sharing.

Optional light reminder functionality may be considered, but it should not distract from the core product. If included, it should be simple: optional reminders attached to specific cards, such as "remind me two weeks before."

## 15. V2 / Future Ideas

Possible future features:

- Email forwarding with trip ID.
- Gmail/Google Drive import.
- More app templates.
- Premium visual customization.
- Travel-agent accounts.
- Collaboration with separate user accounts.
- AI-assisted planning for gaps.
- Smart recommendations.
- Booking integrations.
- Push notifications.
- Calendar sync.
- Native app wrapper if there is strong demand.

## 16. Privacy, Security, and Terms Principles

Roamwoven handles sensitive travel information. Even if the traveler app is simple, the underlying product should be built with commercial-grade care from the beginning.

V1 privacy/security requirements:

- Maker app requires authenticated user access.
- Traveler app uses high-entropy unguessable share tokens.
- Share tokens can be rotated.
- Password protection defaults on during traveler app creation/publish, with plain wording such as "Recommended for private family trips."
- Users can toggle password protection off easily.
- Users can choose a simple password. V1 should not enforce complex password rules beyond basic length/empty-value handling.
- Traveler app can be unpublished.
- Traveler app pages should not be indexed by search engines.
- Optional traveler password should be available, especially for photo albums or sensitive trips.
- Original uploads and extracted text should be private to the trip owner.
- Confirmation numbers should not appear by default on public traveler cards unless the user explicitly exposes them.
- Private residence addresses should be shielded more aggressively than hotels, rentals, restaurants, or public venues.
- Photos are part of V1 because they are a meaningful part of the premium value proposition.
- Photos should support album-level privacy controls before broad sharing.
- Photo storage should have clear compression, size, and retention limits, but the default customer experience should feel generous. A starting target is 250-500 compressed photos included per trip, with soft warnings or support review before hard limits for normal users.
- Video should be out of scope for V1.

Terms and customer messaging should make clear:

- Users are responsible for reviewing all trip details before relying on them.
- Roamwoven is not responsible for missed flights, missed reservations, or travel issues caused by incorrect source material, extraction errors, user edits, or stale information.
- Unlimited plans are for personal use unless commercial terms are separately agreed.
- Roamwoven may limit abusive usage, excessive uploads, excessive refreshes, or commercial resale.

Business formation, LLC choice, and bank account setup are important but should remain a parallel business/legal decision rather than a blocker for product architecture.

## 17. Key Product Risks

### Cost Risk

Processing PDFs, screenshots, and messy documents may be expensive. Payment must happen before full processing.

### Accuracy Risk

The product must avoid missing critical travel facts. Flights, lodging, and fixed bookings are high-risk.

### UX Risk

The clarification flow could become tedious. Progress, grouping, skipping, and placeholders are essential.

### Scope Risk

The product can easily drift into itinerary planning. V1 must stay focused on structuring existing trip data and generating the app.

### Data Model Risk

The Asia workbook is useful but may not be robust enough for broader customer input. The schema should evolve as implementation reveals new cases.

## 18. Open Questions

1. Should phrasebook generation be included in V1 or treated as an enhancement if the trip involves non-English destinations?
2. Should V1 enforce any minimum traveler password length beyond preventing an empty password when password protection is on?
3. Should photo albums have a separate password by default, inherit the trip password, or let the user choose per album?
4. How many previews/refreshes should be included after payment before additional processing is throttled or limited?
5. Should sheet export be included in the base purchase, premium only, or hidden entirely at launch?
6. What should happen if a customer uploads too much material for the base price?
7. Should the first beta be invite-only with manual support behind the scenes?
8. Should Roamwoven store original uploaded documents long term, or delete/archive them after extraction?
9. What retention promise should be made for photos, if any?
10. Should the annual unlimited tier launch early or wait until per-trip economics are proven?

## 19. Initial Build Milestones

### Milestone 1: Product Skeleton

- Account/login.
- Trip dashboard.
- Create trip.
- Payment-gated upload screen.
- Basic trip state model.

### Milestone 2: Upload and Extraction Prototype

- Upload PDFs, docs, images, spreadsheets, and pasted text.
- Extract text and metadata.
- Classify materials.
- Produce preliminary structured trip JSON.

### Milestone 3: Clarification Flow

- Show intake summary.
- Ask grouped questions.
- Track progress.
- Support skip/create-placeholder.
- Update structured data.

### Milestone 4: Data Editing

- Maker-app edit forms for legs, stays, flights/travel, activities, and placeholders.
- Status/review flags.
- Source/confidence metadata internally.

### Milestone 5: Traveler App Generation

- Generate private PWA from structured trip data.
- Day/card layout based on Asia app reference.
- App name and color palette.
- Offline core content.

### Milestone 6: Refresh and Publish

- Publish/share private URL.
- Refresh traveler app after maker edits.
- Preview app before/after publish.
- Beta QA using the Asia trip.

## 20. Suggested First Implementation Slice

The first build should prove the core loop with the least possible surface area:

1. Create a paid trip.
2. Upload a small batch of files and/or pasted notes.
3. Extract a draft trip structure.
4. Show an intake summary.
5. Ask clarification questions for missing or uncertain high-risk fields.
6. Produce structured trip data.
7. Render a traveler app using the Asia app pattern.
8. Allow edits in the maker app and refresh the traveler app.

The first implementation does not need to support every input type perfectly. It should focus on proving that the system can take real trip material and produce a useful app-shaped output.

Recommended first beta path:

- Use the Asia workbook as the expected output reference.
- Start with pasted text, PDFs, and screenshots.
- Support manual correction in the maker app.
- Log source/confidence metadata internally.
- Treat generated sheets as internal implementation detail.
- Use the Asia app UI as the traveler app template.

The first beta should be invite-only. Manual support behind the scenes is acceptable if it helps validate the product and collect failure cases without pretending the automation is complete.
