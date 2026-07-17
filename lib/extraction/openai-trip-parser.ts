import { createOpenAIStructuredResponse } from "@/lib/ai/openai";
import { getOpenAIConfig } from "@/lib/env";
import { resolveCanonicalEvidenceStages } from "@/lib/extraction/canonical-evidence-resolver";
import {
  clusterExtractedEvidence,
  type CanonicalEvidencePiece,
  type CanonicalGroupingDecision,
  type EvidenceObservation,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { optimizeTripExtractionMaterials } from "@/lib/extraction/material-budget";
import {
  extractSourceTransportAnchorsFromMaterials,
} from "@/lib/extraction/source-transport-anchors";
import { createDraftAuditSnapshot } from "@/lib/extraction/trip-extraction-audit";
import { TRIP_CATEGORY_IDS } from "@/lib/trip-categories";

export type TripExtractionMaterial = {
  dedupedSourceUploadIds?: string[];
  filename: string;
  sourceProvenance?: "manual_note" | "ocr" | "text_layer" | "unknown";
  sourceUploadId?: string;
  text: string;
  type: "file_text" | "note" | "pdf_text";
};

export type TripExtractionResult = {
  draft: unknown;
  evidenceArtifacts: {
    observations: EvidenceObservation[];
    pieces: CanonicalEvidencePiece[];
  };
  model: string;
  usage: unknown;
};

export type ActivityExtractionChunk = {
  charCount: number;
  id: string;
  label: string;
  materials: TripExtractionMaterial[];
};

const ACTIVITY_CHUNK_TARGET_CHARS = 18000;
const ACTIVITY_CHUNK_RETRY_CHARS = 9000;
const ACTIVITY_EXTRACTION_CONCURRENCY = 3;
const LONG_SECTION_CHUNK_OVERLAP_CHARS = 800;

type OpenAIStructuredResult = Awaited<
  ReturnType<typeof createOpenAIStructuredResponse>
>;

type ActivityExtractionAttemptMode = "primary" | "retry" | "split" | "rescue";

type ActivityExtractionAttemptSummary = {
  chunkCharCount: number;
  chunkId: string;
  chunkLabel: string;
  error?: {
    message: string;
    name: string;
  };
  mode: ActivityExtractionAttemptMode;
  status: "failed" | "succeeded" | "suspicious_empty";
  usage?: unknown;
};

type ActivityExtractionSuccess = {
  attempts: ActivityExtractionAttemptSummary[];
  chunk: ActivityExtractionChunk;
  rescued: boolean;
  result: OpenAIStructuredResult;
};

type ActivityExtractionFailure = {
  attempts: ActivityExtractionAttemptSummary[];
  chunk: ActivityExtractionChunk;
  error: unknown;
};

class EmptyActivityChunkOutputError extends Error {
  constructor(chunk: ActivityExtractionChunk) {
    super(
      `Activity extraction returned no cards for a source section that appears to contain itinerary items: ${chunk.label}.`
    );
    this.name = "EmptyActivityChunkOutputError";
  }
}

const tripDraftSchema = {
  additionalProperties: false,
  properties: {
    activities: {
      items: {
        additionalProperties: false,
        properties: {
          address: { type: ["string", "null"] },
          approxLatitude: { type: ["number", "null"] },
          approxLongitude: { type: ["number", "null"] },
          area: { type: ["string", "null"] },
          category: {
            enum: TRIP_CATEGORY_IDS,
          },
          city: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          endTime: { type: ["string", "null"] },
          evidenceRole: {
            enum: [
              "accessory_detail",
              "atomic_candidate",
              "city_note_candidate",
              "context",
              "grouping_proposal",
              "rejected",
            ],
          },
          itemType: {
            enum: [
              "activity",
              "note",
              "admin",
              "rest_day",
              "social",
              "placeholder",
            ],
          },
          sourceFilename: { type: "string" },
          sourceHeadingPath: {
            items: { type: "string" },
            type: "array",
          },
          sourceSectionLabel: { type: ["string", "null"] },
          sourceSectionType: {
            enum: [
              "booking_detail",
              "city_reference",
              "dated_itinerary",
              "unknown",
            ],
          },
          startTime: { type: ["string", "null"] },
          title: { type: "string" },
        },
        required: [
          "address",
          "approxLatitude",
          "approxLongitude",
          "area",
          "category",
          "city",
          "date",
          "description",
          "endTime",
          "evidenceRole",
          "itemType",
          "sourceFilename",
          "sourceHeadingPath",
          "sourceSectionLabel",
          "sourceSectionType",
          "startTime",
          "title",
        ],
        type: "object",
      },
      type: "array",
    },
    missingDetails: {
      items: {
        additionalProperties: false,
        properties: {
          answerOptions: {
            items: {
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
              type: "object",
            },
            type: "array",
          },
          answerType: {
            enum: [
              "text",
              "choice",
              "single_choice",
              "yes_no",
              "date",
              "time",
              "visibility",
              "confirm",
            ],
          },
          confidence: { enum: ["low", "medium", "high"] },
          evidence: { type: ["string", "null"] },
          guessedValue: { type: ["string", "null"] },
          prompt: { type: "string" },
          reason: { type: "string" },
          relatedTitle: { type: ["string", "null"] },
          subjectType: {
            enum: ["trip", "day", "leg", "stay", "transport", "item"],
          },
          targetField: { type: ["string", "null"] },
        },
        required: [
          "answerOptions",
          "answerType",
          "confidence",
          "evidence",
          "guessedValue",
          "prompt",
          "reason",
          "relatedTitle",
          "subjectType",
          "targetField",
        ],
        type: "object",
      },
      type: "array",
    },
    places: {
      items: {
        additionalProperties: false,
        properties: {
          arriveDate: { type: ["string", "null"] },
          city: { type: "string" },
          country: { type: ["string", "null"] },
          leaveDate: { type: ["string", "null"] },
        },
        required: ["arriveDate", "city", "country", "leaveDate"],
        type: "object",
      },
      type: "array",
    },
    sensitiveDetails: {
      items: {
        additionalProperties: false,
        properties: {
          detailType: { type: "string" },
          reason: { type: "string" },
          title: { type: "string" },
        },
        required: ["detailType", "reason", "title"],
        type: "object",
      },
      type: "array",
    },
    stays: {
      items: {
        additionalProperties: false,
        properties: {
          address: { type: ["string", "null"] },
          checkIn: { type: ["string", "null"] },
          checkInTime: { type: ["string", "null"] },
          checkOut: { type: ["string", "null"] },
          checkOutTime: { type: ["string", "null"] },
          confirmation: { type: ["string", "null"] },
          firstNightDate: { type: ["string", "null"] },
          name: { type: "string" },
          nights: { type: ["number", "null"] },
          sourceFilename: { type: "string" },
        },
        required: [
          "address",
          "checkIn",
          "checkInTime",
          "checkOut",
          "checkOutTime",
          "confirmation",
          "firstNightDate",
          "name",
          "nights",
          "sourceFilename",
        ],
        type: "object",
      },
      type: "array",
    },
    transport: {
      items: {
        additionalProperties: false,
        properties: {
          arrival: { type: ["string", "null"] },
          arrivalTime: { type: ["string", "null"] },
          confirmation: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          departure: { type: ["string", "null"] },
          departureTime: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          provider: { type: ["string", "null"] },
          sourceFilename: { type: "string" },
          title: { type: "string" },
          type: { enum: ["flight", "train", "rental_car", "car", "ferry", "transfer", "bus", "drive", "other"] },
        },
        required: [
          "arrival",
          "arrivalTime",
          "confirmation",
          "date",
          "departure",
          "departureTime",
          "description",
          "provider",
          "sourceFilename",
          "title",
          "type",
        ],
        type: "object",
      },
      type: "array",
    },
    tripOverview: {
      additionalProperties: false,
      properties: {
        confidence: { enum: ["low", "medium", "high"] },
        dateRange: { type: ["string", "null"] },
        destinationSummary: { type: ["string", "null"] },
        title: { type: ["string", "null"] },
      },
      required: ["confidence", "dateRange", "destinationSummary", "title"],
      type: "object",
    },
  },
  required: [
    "activities",
    "missingDetails",
    "places",
    "sensitiveDetails",
    "stays",
    "transport",
    "tripOverview",
  ],
  type: "object",
};

const tripSpineSchema = {
  additionalProperties: false,
  properties: {
    missingDetails: tripDraftSchema.properties.missingDetails,
    places: tripDraftSchema.properties.places,
    sensitiveDetails: tripDraftSchema.properties.sensitiveDetails,
    stays: tripDraftSchema.properties.stays,
    transport: tripDraftSchema.properties.transport,
    tripOverview: tripDraftSchema.properties.tripOverview,
  },
  required: [
    "missingDetails",
    "places",
    "sensitiveDetails",
    "stays",
    "transport",
    "tripOverview",
  ],
  type: "object",
};

const tripActivitiesSchema = {
  additionalProperties: false,
  properties: {
    activities: tripDraftSchema.properties.activities,
    missingDetails: tripDraftSchema.properties.missingDetails,
    places: tripDraftSchema.properties.places,
    sensitiveDetails: tripDraftSchema.properties.sensitiveDetails,
    stays: tripDraftSchema.properties.stays,
    transport: tripDraftSchema.properties.transport,
  },
  required: [
    "activities",
    "missingDetails",
    "places",
    "sensitiveDetails",
    "stays",
    "transport",
  ],
  type: "object",
};

const systemPrompt = [
  "You structure existing travel materials into a draft trip app data model.",
  "Do not invent details. Use null when a date, time, address, provider, or confirmation is missing.",
  "Preserve the traveler's mental model, but do not create activity cards that merely summarize a whole day. Full-day overview, theme, and day-title lines belong outside activities; extract the concrete traveler cards instead.",
  "For every traveler card in activities, set itemType to activity, note, admin, rest_day, social, or placeholder. Dining reservations, restaurants, cafes, bars, winery visits, and meal plans should usually be itemType activity with category food_dining.",
  "For every traveler card in activities, set city to the specific trip city/leg named by the source chunk or surrounding source header when clear; set city to null when the source does not clearly indicate one. Do not guess city from public landmark knowledge.",
  "For activity cards at a well-known fixed location, set approxLatitude and approxLongitude to the place's approximate coordinates (2-3 decimal places is enough) from your own knowledge of the landmark. Set both to null for generic meals, errands, unknown venues, or anywhere you are not confident of the specific place. Coordinates are used only to verify which sights are genuinely within a short walk of each other; they must never change a card's city, date, or intent.",
  "For sightseeing activity cards, set area to a SUB-CITY walkable neighborhood label only when the source text itself names one (a day title or heading such as 'Lesser Town' or 'Old Town'). Never use the city name, a day-trip town name, or a district you inferred from your own knowledge as the area. Set area to null when unsure. It must never change a card's city, date, or intent.",
  `For every traveler card, also set category to the traveler-browse bucket, not the record type. Allowed category values are: ${TRIP_CATEGORY_IDS.join(", ")}.`,
  "Never use activity, note, or transport as a category. Those can be item types or separate transport records, but card categories should answer where a traveler would browse the plan.",
  "Use arrival_departure for flights, train transfers, airport/station arrivals, rental car pickup/dropoff, lodging check-ins, and explicit drop-bags cards that need to appear in the daily traveler timeline.",
  "Do not create checkout activity cards for ordinary checkout times. Store checkout date and checkout time on the stay. Only create an activity for a specific traveler action, such as returning a key, meeting a host, or moving bags.",
  "Create a check-in or drop-bags activity card with category arrival_departure only when the source gives a real lodging arrival action or bag-drop instruction. Keep the lodging itself in stays too.",
  "Use tours_tickets for timed entry, ticketed tours, guided tours, walking tours, castle/palace visits with ticket decisions, and similar reservation-like sightseeing. Use art_culture for broader museums, galleries, landmarks, libraries, statues, and cultural sights when the key thing is browsing the place rather than managing a ticket/tour.",
  "Use nightlife_entertainment for shows, performances, Ferris wheels, cocktail bars, evening entertainment, and nightlife. Use food_dining when the main point is a meal, cafe, brewery, beer hall, or tasting stop.",
  "Use scenic_ride only when the ride itself is part of the experience, such as a road trip, scenic train/boat ride, panorama train, or route worth browsing as an activity. Ordinary transport belongs in transport records and arrival_departure cards when needed in the daily timeline.",
  "Travel-card purity rule: transport descriptions may include route, date, time, station/airport, provider/operator, confirmation/ticket, luggage, pickup/dropoff, platform/terminal, seat, and check-in/boarding notes. Do not put destination sightseeing, food plans, shopping plans, or loose notes/tips into a transport description; extract those as activities or notes.",
  "Do not create separate traveler cards or questions for ordinary local airport moves when a same-day flight card already contains the actionable flight details. Only keep an airport transfer when it has a booked provider, pickup arrangement, driver, voucher, or other distinct reservation detail.",
  "Leg rule: places are overnight trip destinations, not every location named by travel. Do not create places for home departure, the return home, connection airports, overnight flights, or same-day excursions. A destination with an explicit overnight date range remains a place even when lodging is missing; create one lodging question for that destination. Leaving a city and later returning creates a new place visit, while changing hotels during one continuous city visit does not.",
  "Day-trip transport rule: ordinary unbooked train, bus, or ferry instructions for a same-day excursion belong inside the day-trip activity. A purchased or confirmed train, bus, or ferry booking may remain transport. Intercity movement into the next overnight destination remains transport even when not yet booked.",
  "For trains between adjacent trip legs, infer the route from the surrounding leg sequence when the source says 'train to X' or shows the next stay in X. Do not ask where the train departed from unless there is competing evidence or the train cannot be placed.",
  "Activity granularity rule: split named, source-backed venues by default. Group only when the uploaded source structure clearly defines one guided tour, one walking/neighborhood route, one same-site visit, or one pick-one options cluster. Do not use outside knowledge to manufacture a grouping relationship.",
  "Evidence-role rule: classify each extracted activity sighting as atomic_candidate, context, grouping_proposal, accessory_detail, city_note_candidate, or rejected. Entity type and evidence role are separate: a ticket can be accessory evidence for an activity, while a city recommendation can name a real venue without becoming a dated itinerary card.",
  "Source-structure rule: preserve the source heading path, nearest section label, and section type. Use dated_itinerary for plans inside a dated itinerary block, city_reference for recommendations or general city notes, booking_detail for confirmations/access instructions, and unknown only when the hierarchy is genuinely unavailable. Headings, indentation/list boundaries, whitespace, and words such as ideas, maybe, or recommendations outweigh physical proximity to a dated heading.",
  "Grouping-proposal rule: when a source block names multiple independently recognizable itinerary stops under one route or same-site heading, emit the source parent as grouping_proposal and every named stop as an atomic_candidate so canonical finalization can preserve first-class ordered children. Do not concatenate child prose into the parent description. A single booked item that merely says it includes ordinary components stays one atomic_candidate and does not need a grouping proposal.",
  "Walking-tour and neighborhood-route rule: propose one walking activity only when the source frames the stops as one walk/tour/route or the stops are untimed and context-linked. Preserve source order. An independently timed, ticketed, reserved, or separately booked stop remains standalone and interrupts the route; a parent booking that explicitly covers the whole visit may own untimed subordinate stops.",
  "Same-site cluster rule: when the source itself defines one booking or visit and lists included components, emit one atomic_candidate activity with those components in the description; that source-defined inclusion needs no grouping proposal. When independently named stops merely share a site, route, or heading, preserve the stops as separate atomic_candidate sightings and emit a grouping_proposal so canonical finalization can decide transparently. Do not attach unrelated museums, churches, shops, restaurants, or city sights after 'also noted' to the same card.",
  "Named-stop rule: if a dated day lists named landmarks directly and they are not clearly inside a walking-route anchor, same-site cluster, or pick-one cluster, create standalone activity cards rather than dropping them into a vague day summary. Generic titles like 'Rome note', 'Prague sights', 'Vienna sights', or 'city note' are only acceptable when the source itself is generic and no named venue exists.",
  "Ambiguous-list rule: date placement is evidence, not proof. A bare named-place list inside a clear day plan can be flexible activities, but a recommendation/reference list remains city notes even when it sits near a date. Consider headings, whitespace, words such as possible/maybe/ideas, explicit action language, fixed activities already on that day, and list density together. Never use a numerical activity cap.",
  "Timed/ticketed rule: named timed entry, ticketed tours, guided tours, attractions with booking numbers, and fixed restaurant reservations should be their own cards. A timed/ticketed item must not be swallowed by a broader sights or walking-tour card.",
  "Flexible-options rule: if the source reserves one itinerary slot for two or three mutually exclusive source-backed options, create one flexible activity card and one answerType single_choice question. Put each concrete option in answerOptions as matching label/value pairs. If the source is simply a dated sequence/list of places, split the places into separate flexible activity cards instead.",
  "City notes/tips rule: never drop general city food ideas, restaurant lists, shopping ideas, beer hall lists, local tips, or loose travel notes. Source headers like 'Eat:', 'Food:', 'Bars:', 'Beer halls:', 'Cafes:', 'Restaurants:', 'Shopping:', 'Tips:', or 'Notes:' are strong note signals when they are loose recommendations rather than chosen dated plans. Create one itemType note with date null, attach it to the specific relevant city/leg, use a title that names that city or leg such as 'Prague food ideas', and keep only the loose recommendations in its description. Split mixed blocks at the smallest useful evidence unit: lodging/pricing belongs to the stay, travel instructions belong to travel, and a timed/booked/chosen venue becomes an activity even when surrounded by note text. These notes must be city-scoped: Prague notes belong only under Prague, Vienna notes only under Vienna, Budapest notes only under Budapest. If the city/leg cannot be inferred from the source chunk or surrounding trip spine, create a missingDetails question for placement instead of attaching it globally. Phrases like 'check out foods like...', 'some good beer halls are...', or a loose list of options belong in city notes/tips. A reservation, booking, ticket, chosen meal, time, specific dated plan, or day-specific sightseeing cluster stays an activity or flexible activity, not a note.",
  "Description rule for this extraction stage: write concise, source-backed descriptions only. Do not add public background or editorial enrichment here; a later enrichment pass can add neutral public context with separate provenance. Never invent logistics, tickets, addresses, bookings, confirmations, opening hours, or times. Sparse generic items such as 'Tour Rome' should become a placeholder or question, not a confident description.",
  "Traveler-facing text should use readable dates such as January 19th, not compact dates like 20190119. Do not repeat the year in every description when the trip is clearly contained to one year.",
  "Opaque identifier rule: confirmation numbers, ticket numbers, reservation codes, and booking references are identifiers, never dates. Preserve their characters exactly in sensitiveDetails and never rewrite an identifier as a calendar date.",
  "Repeated-sighting rule: repeated mentions of one visit, reservation, or stay are evidence for one canonical entity, but explicit visits on different dates, different bookings, or different addresses are distinct entities. Emit each explicit dated visit separately. Create one targeted missingDetails question only when the source truly conflicts about the placement of one visit.",
  "Flag every exact lodging address, stay and travel booking-control identifier, door/access secret, personal note, and personal host contact as sensitiveDetails instead of exposing it casually.",
  "Default sensitiveDetails should include every exact hotel, hostel, rental, Airbnb, and other lodging address; stay and travel confirmation numbers, booking references, PNRs, reservation codes, and travel ticket numbers; door/gate/lockbox/access codes; Wi-Fi passwords; personal host phone numbers or emails; passport/ID/payment details; and medical/personal safety notes. Activity, tour, attraction, and restaurant confirmation or ticket identifiers are public unless they are also access credentials or another universally protected secret.",
  "Hotel and hostel names, public landmarks, restaurants, shops, museums, commercial venue addresses, city names, and general day summaries are usually safe for follower mode unless paired with room numbers, access instructions, booking controls, or personal notes.",
  "Create missingDetails only for unresolved maker decisions that materially change the generated traveler app, such as explicit source todos, true conflicts, ambiguous placement, missing critical route/stay fields, or an unidentifiable booked/timed card. Do not use missingDetails for routine extraction, OCR/material diagnostics, duplicate suppression, privacy defaults, source-anchor repairs, source-backed facts, or high-confidence inferences already applied.",
  "Accuracy is paramount: never suppress a question if answering it would materially change the generated trip. Still, use a human review budget: most roughly week-long trips should average a small handful of meaningful questions and calls, not one per card or reservation. Do not force a fixed count; some clean trips need almost none, and messy trips can need more.",
  "Do not create missingDetails just to ask the maker to approve a high-confidence inference you already used in the structured records. Put that reasoning in the record/evidence instead.",
  "Do not ask privacy yes/no questions when the detail is clearly sensitive. Put every exact lodging address, access code, stay or travel booking-control identifier, and private note in sensitiveDetails and default it behind traveler-password visibility.",
  "Do not ask broad privacy-policy questions such as whether booking references, Airbnb access codes, Wi-Fi passwords, or private rental addresses should be stored as sensitive details. Apply the default privacy policy in sensitiveDetails. Only create a privacy question when the source is genuinely ambiguous about whether a place is private versus public.",
  "Use personal/private note sensitivity narrowly: host personal contact details, passport/ID/payment details, medical or safety notes, emergency contacts, family/private logistics, and explicitly private notes. Ordinary logistics like picking up a rental car, taking a train, or visiting a public business are not personal notes.",
  "When an unresolved maker decision is genuinely needed, fill guessedValue and evidence when the source supports a likely answer instead of asking a blank question. Do not create confirmation prompts for high-confidence facts or routine inferences already reflected in the structured records.",
  "Question-control rule: answerOptions must be empty unless the source supplies concrete choices. Use single_choice for exactly one mutually exclusive choice, date for a calendar date, time for a clock time, yes_no only for a genuine binary decision, and text only for a genuinely textual target. A question must name one targetField that its answer changes; never ask for general commentary.",
  "Avoid asking obvious itinerary questions that a competent travel assistant should infer. A night outbound flight is the start of the trip even if the first lodging check-in is the next day. If lodging is missing for that night because the traveler is on an overnight flight, ask a targeted confirmation about sleeping on the plane only if the materials are genuinely ambiguous.",
  "Do not ask whether the trip start date should be the first hotel night when there is clear same-day outbound transport. Use the transport date as the trip start and explain the evidence in the relevant record or internal audit rather than creating a review item.",
  "If the traveler clearly travels onward to a new city and the next lodging is in that new city, infer the route transition like a human planner would. Do not ask whether they are leaving the prior city unless there is competing evidence.",
  "If only one lodging record is visible for a city and the route then moves onward, treat that as the stay block unless another lodging clue conflicts. Explain the reasoning in the stay evidence; create one targeted missingDetails question only when conflicting source-backed stay dates cannot be resolved.",
  "For stays, infer checkOut only from explicit source evidence, such as a clear first sleeping night or checkIn plus a stated nights count. For example, if a hotel or hostel starts January 14 and says 3 nights, set checkIn to January 14, firstNightDate to January 14, nights to 3, and checkOut to January 17. If the source says 'Friday: sleep at Wombats' and '3 nights', use the Friday date as checkIn/firstNightDate and add 3 nights for checkOut. Do not invent stay dates from surrounding itinerary context alone. If the first night or nights count is ambiguous, leave the uncertain field null and create a missingDetails question.",
  "If a source explicitly says a stay is N nights, do not ask the maker to confirm that nights count and do not surface it as a call. It is a fact. Use it to compute the stay block.",
  "When lodging text is formatted as a check-in instruction, still extract the lodging name. For example, 'The Yellow: Check in: 2:30 PM #743...' should create a stay named 'The Yellow' or 'The Yellow Hostel', with checkInTime 2:30 PM if available, instead of asking whether that is the title.",
  "Do not create model-generated FYI Calls in missingDetails. If a reasonable human trip-planner would confidently infer something from ordering, arrival/departure sequence, bag-drop/check-in flow, surrounding itinerary context, or clear grouping context, apply it in the structured records and explain it in record evidence. If two source-backed answers are genuinely plausible and changing the answer would move a stay, transport record, dated traveler card, or important presentation choice, create one targeted missingDetails question instead.",
  "Presentation Calls, when needed, are created later by assembly/review policy from the structured records, not by this extraction prompt. Output the underlying source-backed activities, notes, stays, transport, and evidence; do not emit non-blocking FYI statements as missingDetails.",
  "For time-bound reservations, pickups, tours, or appointments, decide whether the card has a usable anchor. If it has a specific name, address/location, provider, route, confirmation, or enough descriptive context, create the card and usually omit missing nice-to-have fields from review. If a generic meal has a fixed time but no venue, preserve one lightweight meal card and ask only whether a specific venue is planned, targeting locationName and offering Somewhere nearby as a quick option.",
  "Do not ask about optional labels that are not needed to use the traveler app. For example, if a transport record has enough usable timing/route/location detail but no provider or company name, create the transport record and leave provider null. Create a missingDetails question only when the missing detail materially affects how the maker would understand or use the card.",
  "If an activity choice is unresolved but non-blocking, preserve one flexible traveler card and keep the Question open without blocking the draft. Do not duplicate the card across choices or dates.",
  "If the source itself contains explicit unresolved maker to-do language such as 'Need to decide', 'TBD', 'pick a time', 'choose ticket', 'book this', or 'confirm later', preserve it. Create the activity card with the unresolved detail in the description, and also create one targeted missingDetails question when an answer would fill a specific card field or decision such as ticket type, booking status, startTime, or reservation detail. This should be an open maker decision. Grouping cannot swallow unresolved decisions: if a walking route or same-site cluster absorbs a stop with unresolved ticket, booking, or timing language, keep that detail in the grouped card description and create the question for the specific stop when recoverable.",
  "For missingDetails, set subjectType and targetField to the exact structured record field when possible, such as item/date, item/startTime, stay/checkIn, stay/addressVisibility, transport/date, or transport/departureTime.",
  "Avoid duplicate questions about the same underlying uncertainty. If one answer would resolve multiple concerns, ask once with the clearest wording.",
].join(" ");

const spineSystemPrompt = [
  systemPrompt,
  "This stage extracts only the trip spine: tripOverview, places, stays, transport, sensitiveDetails, and missingDetails. Do not output activities in this stage.",
  "Prioritize dates, destinations, stays, flights, trains, transfers, rental cars, and privacy-sensitive booking details. Preserve departureTime and arrivalTime when the source provides them.",
].join(" ");

const activitiesSystemPrompt = [
  systemPrompt,
  "This is a complete source-evidence pass for one bounded source chunk. Extract activities, places, stays, transport, missingDetails, and sensitiveDetails visible in this chunk. Do not output tripOverview.",
  "Multiple chunks and OCR/prose sources may describe the same real trip object. Preserve every source-backed sighting here; a later canonical evidence stage will decide which sightings belong to the same object before assembly.",
  "Include restaurants and dining reservations as activities with category food_dining. Do not keep broad day arcs as activity cards; keep timed, ticketed, booked, chosen, or concrete experience cards separate.",
].join(" ");

const activityRescueSystemPrompt = [
  activitiesSystemPrompt,
  "This is an automatic second pass after a previous chunk extraction returned no traveler cards despite source text that appears to contain activities, notes/tips, or unresolved activity decisions.",
  "Re-read the chunk carefully and extract every concrete activity, note, place, stay, transport segment, private detail, and genuine unresolved decision. Return empty arrays only when the chunk truly contains no structured trip evidence.",
].join(" ");

function formatMaterials(materials: TripExtractionMaterial[]) {
  return materials
    .map(
      (material, index) =>
        [
          `Material ${index + 1}`,
          `Filename: ${material.filename}`,
          `Type: ${material.type}`,
          "Content:",
          material.text,
        ].join("\n")
    )
    .join("\n\n---\n\n");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isLikelyDayHeading(line: string) {
  const trimmed = normalizeWhitespace(line)
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "");

  if (!trimmed || trimmed.length > 140) {
    return false;
  }

  const month =
    "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const weekday =
    "(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
  const ordinal = "\\d{1,2}(?:st|nd|rd|th)?";
  const patterns = [
    new RegExp(`^${weekday},?\\s+${month}\\s+${ordinal}\\b`, "i"),
    new RegExp(`^day\\s+\\d+\\b.*\\b${month}\\s+${ordinal}\\b`, "i"),
    new RegExp(`^${month}\\s+${ordinal}\\b`, "i"),
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/,
  ];

  return patterns.some((pattern) => pattern.test(trimmed));
}

function getSectionLabel(text: string, fallback: string) {
  const heading = text
    .split(/\r?\n/)
    .map(normalizeWhitespace)
    .find((line) => line && line.length <= 140);

  return heading ?? fallback;
}

function splitLongText(text: string, maxChars: number) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    const paragraphBreak = window.lastIndexOf("\n\n");
    const lineBreak = window.lastIndexOf("\n");
    const breakAt =
      paragraphBreak > maxChars * 0.55
        ? paragraphBreak
        : lineBreak > maxChars * 0.55
          ? lineBreak
          : maxChars;
    const chunk = remaining.slice(0, breakAt).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    const overlap = Math.min(
      LONG_SECTION_CHUNK_OVERLAP_CHARS,
      Math.max(0, Math.floor(breakAt * 0.2))
    );
    const nextStart = Math.max(0, breakAt - overlap);
    remaining = remaining.slice(nextStart).trim();

    if (!remaining) {
      break;
    }

    if (chunks.length > 80) {
      throw new Error(
        "A source section requires more than 80 extraction chunks. Roamwoven will not silently discard the remaining source text."
      );
    }
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function splitMaterialForActivityExtraction(
  material: TripExtractionMaterial,
  maxChars: number
) {
  const text = material.text.trim();

  if (!text) {
    return [];
  }

  const lines = text.split(/\r?\n/);
  const headingIndexes = lines
    .map((line, index) => (isLikelyDayHeading(line) ? index : -1))
    .filter((index) => index >= 0);
  const sections: Array<{ label: string; text: string }> = [];

  if (headingIndexes.length >= 2) {
    if (headingIndexes[0] > 0) {
      const preamble = lines.slice(0, headingIndexes[0]).join("\n").trim();

      if (preamble) {
        sections.push({
          label: `${material.filename} notes`,
          text: preamble,
        });
      }
    }

    headingIndexes.forEach((start, index) => {
      const end = headingIndexes[index + 1] ?? lines.length;
      const sectionText = lines.slice(start, end).join("\n").trim();

      if (sectionText) {
        sections.push({
          label: getSectionLabel(sectionText, `${material.filename} part ${index + 1}`),
          text: sectionText,
        });
      }
    });
  } else {
    sections.push({
      label: material.filename,
      text,
    });
  }

  return sections.flatMap((section, sectionIndex) =>
    splitLongText(section.text, maxChars).map((chunkText, chunkIndex) => ({
      label:
        chunkIndex === 0
          ? section.label
          : `${section.label} continued ${chunkIndex + 1}`,
      text: chunkText,
      sectionIndex,
    }))
  );
}

export function createActivityExtractionChunks(
  materials: TripExtractionMaterial[],
  maxChars = ACTIVITY_CHUNK_TARGET_CHARS
): ActivityExtractionChunk[] {
  return materials
    .filter((material) => material.text.trim())
    .flatMap((material, materialIndex) =>
      splitMaterialForActivityExtraction(material, maxChars).map(
        (section, sectionIndex) => {
          const chunkMaterial = {
            ...material,
            text: section.text,
          };

          return {
            charCount: section.text.length,
            id: `activity-chunk-${materialIndex + 1}-${sectionIndex + 1}`,
            label: section.label,
            materials: [chunkMaterial],
          };
        }
      )
    );
}

function formatArrayContext(
  label: string,
  values: unknown,
  formatter: (item: Record<string, unknown>) => string
) {
  const items = asArray(values)
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? formatter(item as Record<string, unknown>)
        : null
    )
    .filter(Boolean);

  return items.length ? `${label}: ${items.join("; ")}` : null;
}

function contextString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatSpineContext(spineStage: unknown) {
  const spine = asRecord(spineStage);
  const overview = asRecord(spine.tripOverview);
  const context = [
    "Trip spine context from the first extraction stage. Use this only to place chunk-level activities; do not invent details from it.",
    [
      contextString(overview.title),
      contextString(overview.dateRange),
      contextString(overview.destinationSummary),
    ]
      .filter(Boolean)
      .join(" · "),
    formatArrayContext("Places", spine.places, (place) =>
      [
        contextString(place.city),
        contextString(place.country),
        [contextString(place.arriveDate), contextString(place.leaveDate)]
          .filter(Boolean)
          .join(" to "),
      ]
        .filter(Boolean)
        .join(" ")
    ),
    formatArrayContext("Stays", spine.stays, (stay) =>
      [
        contextString(stay.name),
        [contextString(stay.checkIn), contextString(stay.checkOut)]
          .filter(Boolean)
          .join(" to "),
      ]
        .filter(Boolean)
        .join(" ")
    ),
    formatArrayContext("Transport", spine.transport, (transport) =>
      [
        contextString(transport.title),
        contextString(transport.date),
        [contextString(transport.departure), contextString(transport.arrival)]
          .filter(Boolean)
          .join(" to "),
      ]
        .filter(Boolean)
        .join(" ")
    ),
  ].filter(Boolean);

  return context.join("\n");
}

function formatActivityChunkInput({
  chunk,
  chunkIndex,
  chunkTotal,
  mode = "primary",
  spineStage,
  tripName,
}: {
  chunk: ActivityExtractionChunk;
  chunkIndex: number;
  chunkTotal: number;
  mode?: ActivityExtractionAttemptMode;
  spineStage: unknown;
  tripName: string;
}) {
  const rescueInstructions =
    mode === "rescue"
      ? [
          "Automatic second pass: the previous extraction returned no traveler cards for this chunk, but the source appears to contain activity or city notes/tips signals.",
          "Do one careful second pass before the maker sees a blocker. Extract source-backed cards, city notes/tips, and unresolved activity decisions if they are present.",
        ].join("\n")
      : null;

  return [
    `Trip name: ${tripName}`,
    formatSpineContext(spineStage),
    [
      `Evidence source chunk ${chunkIndex + 1} of ${chunkTotal}: ${chunk.label}`,
      "Extract every source-backed activity, city note/tip, place, stay, transport segment, sensitive detail, and genuine unresolved material question from this chunk.",
      "If this chunk contains multiple named dated venues, preserve them as separate cards unless the source clearly makes them one tour, route, complex, or pick-one cluster.",
      "Preserve the chunk's heading/list hierarchy in sourceHeadingPath, sourceSectionLabel, sourceSectionType, and evidenceRole. Do not promote recommendations from a city-reference section merely because a dated section appeared above them.",
      rescueInstructions,
    ].join("\n"),
    formatMaterials(chunk.materials),
  ].join("\n\n");
}

function getChunkText(chunk: ActivityExtractionChunk) {
  return chunk.materials.map((material) => material.text).join("\n\n");
}

function hasActivityLikeSignals(chunk: ActivityExtractionChunk) {
  const text = getChunkText(chunk);
  const normalizedText = normalizeWhitespace(text);

  if (!normalizedText) {
    return false;
  }

  const dateContextSignal =
    /\b(day\s+\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
      normalizedText
    );
  const timeSignal = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(normalizedText);
  const transportLogisticsSignal =
    /\b(airline|airport|boarding|bus|cab|connection|departure|flight|gate|luggage|platform|rail|seat|station|terminal|train|transfer|uber)\b/i.test(
      normalizedText
    );
  const lodgingLogisticsSignal =
    /\b(airbnb|apartment|check[- ]?in|check[- ]?out|hostel|hotel|lodging|room|stay)\b/i.test(
      normalizedText
    );
  const venueActivitySignal =
    /\b(art|bar|bars|bath|baths|bridge|castle|catacombs|cathedral|church|fountain|gallery|guided|landmark|library|market|mine|mines|museum|ossuary|palace|park|square|statue|synagogue|temple|tour|tours|visit|walk|walking)\b/i.test(
      normalizedText
    );
  const foodOrDrinkSignal =
    /\b(beer|breakfast|brewery|cafe|cafes|coffee|dinner|eat|food|lunch|restaurant|restaurants|supper|tasting|wine)\b/i.test(
      normalizedText
    );
  const notesTipsSignal =
    /\b(eat\s*:|food\s*:|bars?\s*:|beer halls?\s*:|cafes?\s*:|restaurants?\s*:|shopping\s*:|tips?\s*:|notes?\s*:|where to eat|local tips?|food ideas?|good beer halls|check out foods like|find .{0,40}\b(music|shop|souvenir|market|food|bar|restaurant)|skippable|skip this|worth (?:seeing|visiting|doing)|try .{0,40}\b(food|beer|wine|restaurant|bar|cafe|shop))/i.test(
      normalizedText
    );
  const adminOnlySignal =
    /\b(keep|receipt|receipts|expense|expenses|invoice|invoices|file|folder|admin|paperwork|document|documents)\b/i.test(
      normalizedText
    ) &&
    !venueActivitySignal &&
    !foodOrDrinkSignal;
  const namedPlaceListSignal =
    dateContextSignal &&
    /[A-Z][A-Za-z0-9'&.-]+(?:\s+[A-Z][A-Za-z0-9'&.-]+){0,4}(?:,|\s+and\s+)[A-Z][A-Za-z0-9'&.-]+/.test(
      text
    );
  const bookingWordSignal = /\b(booking|entry|reservation|ticket|tickets)\b/i.test(
    normalizedText
  );
  const bookingActivitySignal =
    bookingWordSignal &&
    !transportLogisticsSignal &&
    (venueActivitySignal || foodOrDrinkSignal || timeSignal || namedPlaceListSignal);

  if (
    transportLogisticsSignal &&
    !venueActivitySignal &&
    !foodOrDrinkSignal &&
    !notesTipsSignal &&
    !bookingActivitySignal
  ) {
    return false;
  }

  if (
    lodgingLogisticsSignal &&
    !venueActivitySignal &&
    !foodOrDrinkSignal &&
    !notesTipsSignal &&
    !bookingActivitySignal &&
    !namedPlaceListSignal
  ) {
    return false;
  }

  if (adminOnlySignal) {
    return false;
  }

  return (
    venueActivitySignal ||
    foodOrDrinkSignal ||
    notesTipsSignal ||
    namedPlaceListSignal ||
    bookingActivitySignal
  );
}

function hasActivityExtractionOutput(stage: unknown) {
  const record = asRecord(stage);

  return (
    asArray(record.activities).length > 0 ||
    asArray(record.missingDetails).length > 0
  );
}

export function isSuspiciouslyEmptyActivityChunkResult({
  chunk,
  stage,
}: {
  chunk: ActivityExtractionChunk;
  stage: unknown;
}) {
  return hasActivityLikeSignals(chunk) && !hasActivityExtractionOutput(stage);
}

function createAttemptSummary({
  chunk,
  error,
  mode,
  result,
  status,
}: {
  chunk: ActivityExtractionChunk;
  error?: unknown;
  mode: ActivityExtractionAttemptMode;
  result?: OpenAIStructuredResult;
  status: ActivityExtractionAttemptSummary["status"];
}): ActivityExtractionAttemptSummary {
  return {
    chunkCharCount: chunk.charCount,
    chunkId: chunk.id,
    chunkLabel: chunk.label,
    error: error
      ? {
          message: error instanceof Error ? error.message : "Unknown error.",
          name: error instanceof Error ? error.name : "UnknownError",
        }
      : undefined,
    mode,
    status,
    usage: result?.usage,
  };
}

function splitActivityChunk(
  chunk: ActivityExtractionChunk,
  maxChars = ACTIVITY_CHUNK_RETRY_CHARS
): ActivityExtractionChunk[] {
  const splitMaterials = chunk.materials.flatMap((material) =>
    splitLongText(material.text, maxChars).map((text, index) => ({
      ...material,
      text,
      splitIndex: index,
    }))
  );

  return splitMaterials.map((material, index) => {
    const { splitIndex: _splitIndex, ...chunkMaterial } = material;

    return {
      charCount: chunkMaterial.text.length,
      id: `${chunk.id}-split-${index + 1}`,
      label: `${chunk.label} part ${index + 1}`,
      materials: [chunkMaterial],
    };
  });
}

async function callActivityChunkExtraction({
  chunk,
  chunkIndex,
  chunkTotal,
  mode,
  spineStage,
  tripName,
}: {
  chunk: ActivityExtractionChunk;
  chunkIndex: number;
  chunkTotal: number;
  mode: ActivityExtractionAttemptMode;
  spineStage: unknown;
  tripName: string;
}) {
  return createOpenAIStructuredResponse({
    input: formatActivityChunkInput({
      chunk,
      chunkIndex,
      chunkTotal,
      mode,
      spineStage,
      tripName,
    }),
    schema: tripActivitiesSchema,
    schemaName: "roamwoven_trip_activities",
    system:
      mode === "rescue" ? activityRescueSystemPrompt : activitiesSystemPrompt,
  });
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

async function extractActivityChunkWithEmptyRescue({
  chunk,
  chunkIndex,
  chunkTotal,
  mode,
  spineStage,
  tripName,
}: {
  chunk: ActivityExtractionChunk;
  chunkIndex: number;
  chunkTotal: number;
  mode: ActivityExtractionAttemptMode;
  spineStage: unknown;
  tripName: string;
}): Promise<ActivityExtractionSuccess> {
  const result = await callActivityChunkExtraction({
    chunk,
    chunkIndex,
    chunkTotal,
    mode,
    spineStage,
    tripName,
  });
  const suspiciousEmpty = isSuspiciouslyEmptyActivityChunkResult({
    chunk,
    stage: result.json,
  });

  if (!suspiciousEmpty) {
    return {
      attempts: [
        createAttemptSummary({
          chunk,
          mode,
          result,
          status: "succeeded",
        }),
      ],
      chunk,
      rescued: false,
      result,
    };
  }

  const rescueResult = await callActivityChunkExtraction({
    chunk,
    chunkIndex,
    chunkTotal,
    mode: "rescue",
    spineStage,
    tripName,
  });
  const rescueSuspiciousEmpty = isSuspiciouslyEmptyActivityChunkResult({
    chunk,
    stage: rescueResult.json,
  });
  const attempts = [
    createAttemptSummary({
      chunk,
      mode,
      result,
      status: "suspicious_empty",
    }),
    createAttemptSummary({
      chunk,
      mode: "rescue",
      result: rescueResult,
      status: rescueSuspiciousEmpty ? "suspicious_empty" : "succeeded",
    }),
  ];

  if (rescueSuspiciousEmpty) {
    const error = new EmptyActivityChunkOutputError(chunk);

    throw Object.assign(error, { attempts });
  }

  return {
    attempts,
    chunk,
    rescued: true,
    result: rescueResult,
  };
}

function errorAttempts(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "attempts" in error &&
    Array.isArray((error as { attempts?: unknown }).attempts)
  ) {
    return (error as { attempts: ActivityExtractionAttemptSummary[] }).attempts;
  }

  return [];
}

async function extractActivityChunkWithRecovery({
  allowSplit = true,
  chunk,
  chunkIndex,
  chunkTotal,
  spineStage,
  tripName,
}: {
  allowSplit?: boolean;
  chunk: ActivityExtractionChunk;
  chunkIndex: number;
  chunkTotal: number;
  spineStage: unknown;
  tripName: string;
}): Promise<{
  failures: ActivityExtractionFailure[];
  successes: ActivityExtractionSuccess[];
}> {
  const attempts: ActivityExtractionAttemptSummary[] = [];

  try {
    const success = await extractActivityChunkWithEmptyRescue({
      chunk,
      chunkIndex,
      chunkTotal,
      mode: "primary",
      spineStage,
      tripName,
    });

    return { failures: [], successes: [success] };
  } catch (error) {
    const nestedAttempts = errorAttempts(error);

    attempts.push(
      ...(nestedAttempts.length
        ? nestedAttempts
        : [
            createAttemptSummary({
              chunk,
              error,
              mode: "primary",
              status: "failed",
            }),
          ])
    );

    if (error instanceof EmptyActivityChunkOutputError) {
      return {
        failures: [{ attempts, chunk, error }],
        successes: [],
      };
    }
  }

  try {
    const success = await extractActivityChunkWithEmptyRescue({
      chunk,
      chunkIndex,
      chunkTotal,
      mode: "retry",
      spineStage,
      tripName,
    });

    return {
      failures: [],
      successes: [
        {
          ...success,
          attempts: [...attempts, ...success.attempts],
        },
      ],
    };
  } catch (error) {
    const nestedAttempts = errorAttempts(error);

    attempts.push(
      ...(nestedAttempts.length
        ? nestedAttempts
        : [
            createAttemptSummary({
              chunk,
              error,
              mode: "retry",
              status: "failed",
            }),
          ])
    );

    if (error instanceof EmptyActivityChunkOutputError) {
      return {
        failures: [{ attempts, chunk, error }],
        successes: [],
      };
    }

    if (!allowSplit || chunk.charCount <= ACTIVITY_CHUNK_RETRY_CHARS) {
      return {
        failures: [{ attempts, chunk, error }],
        successes: [],
      };
    }
  }

  const splitChunks = splitActivityChunk(chunk);

  if (splitChunks.length <= 1) {
    return {
      failures: [
        {
          attempts,
          chunk,
          error: new Error(
            `Activity extraction failed and ${chunk.label} could not be split smaller.`
          ),
        },
      ],
      successes: [],
    };
  }

  const splitResults = await mapWithConcurrency(
    splitChunks,
    Math.min(ACTIVITY_EXTRACTION_CONCURRENCY, splitChunks.length),
    (splitChunk, splitIndex) =>
      extractActivityChunkWithRecovery({
        allowSplit: false,
        chunk: splitChunk,
        chunkIndex: splitIndex,
        chunkTotal: splitChunks.length,
        spineStage,
        tripName,
      })
  );

  return {
    failures: splitResults.flatMap((result) => result.failures),
    successes: splitResults.flatMap((result) =>
      result.successes.map((success) => ({
        ...success,
        attempts: [
          ...attempts,
          createAttemptSummary({
            chunk: success.chunk,
            mode: "split",
            result: success.result,
            status: "succeeded",
          }),
          ...success.attempts,
        ],
      }))
    ),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, values.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(values[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

export async function extractTripDraftWithOpenAI({
  materials,
  tripName,
}: {
  materials: TripExtractionMaterial[];
  tripName: string;
}): Promise<TripExtractionResult> {
  const usableMaterials = materials.filter((material) => material.text.trim());

  if (usableMaterials.length === 0) {
    throw new Error("No extracted text is available for AI trip parsing.");
  }

  const config = getOpenAIConfig();
  const completeSpineCharBudget = Math.min(
    120000,
    Math.max(
      config.maxInputChars,
      usableMaterials.reduce((sum, material) => sum + material.text.length, 0) +
        usableMaterials.length * 240
    )
  );
  const spineMaterials = optimizeTripExtractionMaterials({
    materials: usableMaterials,
    totalCharBudget: completeSpineCharBudget,
  });
  const sourceTransportAnchors =
    extractSourceTransportAnchorsFromMaterials(usableMaterials);
  const formattedMaterials = formatMaterials(spineMaterials.materials);
  const input = [`Trip name: ${tripName}`, formattedMaterials].join("\n\n");
  const spineResult = await createOpenAIStructuredResponse({
    input,
    maxInputChars: completeSpineCharBudget,
    schema: tripSpineSchema,
    schemaName: "roamwoven_trip_spine",
    system: spineSystemPrompt,
  });
  const activityChunks = createActivityExtractionChunks(usableMaterials);
  const recoveredActivityChunks = await mapWithConcurrency(
    activityChunks,
    ACTIVITY_EXTRACTION_CONCURRENCY,
    (chunk, chunkIndex) =>
      extractActivityChunkWithRecovery({
        chunk,
        chunkIndex,
        chunkTotal: activityChunks.length,
        spineStage: spineResult.json,
        tripName,
      })
  );
  const activityResults = recoveredActivityChunks.flatMap(
    (result) => result.successes
  );
  const activityFailures = recoveredActivityChunks.flatMap(
    (result) => result.failures
  );

  for (const failure of activityFailures) {
    console.error("trip_activity_chunk_extraction_unrecovered", {
      chunkId: failure.chunk.id,
      chunkLabel: failure.chunk.label,
      message:
        failure.error instanceof Error
          ? failure.error.message
          : "Unknown error.",
      name:
        failure.error instanceof Error ? failure.error.name : "UnknownError",
      tripName,
    });
  }

  const spineRecord = asRecord(spineResult.json);
  const recoveryStages: EvidenceStageInput[] = activityFailures.map(
    ({ chunk }, index) => {
      const material = chunk.materials[0];
      const title = `Review missing source section ${index + 1}`;

      return {
        label: `automatic recovery required: ${chunk.label}`,
        source: "model_chunk" as const,
        sourceFilename: material?.filename ?? null,
        sourceProvenance: material?.sourceProvenance ?? null,
        sourceText: getChunkText(chunk),
        sourceUploadId: material?.sourceUploadId ?? null,
        stage: {
          activities: [
            {
              _recoveryRequired: true,
              address: null,
              category: "admin_logistics",
              city: null,
              date: null,
              description:
                "Automatic extraction could not fully read this source section. Review the source and add or remove this placeholder if needed.",
              endTime: null,
              evidenceRole: "atomic_candidate",
              itemType: "placeholder",
              sourceFilename: material?.filename ?? "source material",
              sourceHeadingPath: [chunk.label],
              sourceSectionLabel: chunk.label,
              sourceSectionType: "unknown",
              startTime: null,
              title,
            },
          ],
          missingDetails: [
            {
              answerType: "confirm",
              confidence: "low",
              evidence: chunk.label,
              guessedValue: null,
              prompt: `Please review ${chunk.label} and confirm or add any missing plans.`,
              reason:
                "Automatic extraction retries could not completely cover this source section, so Roamwoven preserved a review-required placeholder instead of dropping it or blocking Review.",
              relatedTitle: title,
              subjectType: "item",
              targetField: "sourceRecovery",
            },
          ],
          places: [],
          sensitiveDetails: [],
          stays: [],
          transport: [],
        },
      };
    }
  );
  const evidenceStages: EvidenceStageInput[] = [
    {
      label: "trip spine",
      source: "model_spine",
      stage: spineResult.json,
    },
    ...activityResults.map(({ chunk, result }) => {
      const material = chunk.materials[0];

      return {
        label: chunk.label,
        source: "model_chunk" as const,
        sourceFilename: material?.filename ?? null,
        sourceProvenance: material?.sourceProvenance ?? null,
        sourceText: getChunkText(chunk),
        sourceUploadId: material?.sourceUploadId ?? null,
        stage: result.json,
      };
    }),
    ...recoveryStages,
  ];
  let resolvedEvidenceStages = {
    groupingDecisions: [] as CanonicalGroupingDecision[],
    metadata: null as unknown,
    stages: evidenceStages,
    usage: null as unknown,
  };

  try {
    resolvedEvidenceStages = await resolveCanonicalEvidenceStages(evidenceStages);
  } catch (error) {
    console.error("trip_canonical_evidence_resolver_failed", {
      message: error instanceof Error ? error.message : "Unknown error.",
      name: error instanceof Error ? error.name : "UnknownError",
      tripName,
    });
  }

  const evidence = clusterExtractedEvidence({
    groupingDecisions: resolvedEvidenceStages.groupingDecisions,
    resolverMetadata: resolvedEvidenceStages.metadata,
    sourceTransportAnchors,
    stages: resolvedEvidenceStages.stages,
    tripOverview: spineRecord.tripOverview ?? {
      confidence: "low",
      dateRange: null,
      destinationSummary: null,
      title: null,
    },
  });
  const combinedDraft = evidence.draft;
  const canonicalDraft = createDraftAuditSnapshot(combinedDraft);

  return {
    draft: combinedDraft,
    evidenceArtifacts: {
      observations: evidence.observations,
      pieces: evidence.pieces,
    },
    model: activityResults.at(-1)?.result.model ?? spineResult.model,
    usage: {
      activityChunks: {
        count: activityChunks.length,
        failed: activityFailures.length,
        succeeded: activityResults.length,
        rescued: activityResults.filter((result) => result.rescued).length,
        totalCharCount: activityChunks.reduce(
          (sum, chunk) => sum + chunk.charCount,
          0
        ),
      },
      activities: activityResults.map(({ attempts, chunk, rescued, result }) => ({
        attempts,
        chunkCharCount: chunk.charCount,
        chunkId: chunk.id,
        chunkLabel: chunk.label,
        rescued,
        usage: result.usage ?? null,
      })),
      canonicalResolver: {
        metadata: resolvedEvidenceStages.metadata,
        usage: resolvedEvidenceStages.usage,
      },
      activityFailures: activityFailures.map(({ attempts, chunk, error }) => ({
        attempts,
        chunkId: chunk.id,
        chunkLabel: chunk.label,
        message: error instanceof Error ? error.message : "Unknown error.",
        name: error instanceof Error ? error.name : "UnknownError",
      })),
      audit: {
        canonicalDraft,
      },
      evidence: evidence.summary,
      sourceAnchors: {
        transport: sourceTransportAnchors,
      },
      spineMaterialBudget: spineMaterials.summary,
      spineCoverage: {
        activityChunkFailureCount: activityFailures.length,
        completeStagedCoverage: activityFailures.length === 0,
        sourceCharCount: usableMaterials.reduce(
          (sum, material) => sum + material.text.length,
          0
        ),
        spineCharBudget: completeSpineCharBudget,
        spineTruncatedMaterialCount:
          spineMaterials.summary.truncatedMaterialCount,
      },
      spine: spineResult.usage,
      staged: true,
    },
  };
}
