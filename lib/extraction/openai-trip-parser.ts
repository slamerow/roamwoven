import { createOpenAIStructuredResponse } from "@/lib/ai/openai";
import { TRIP_CATEGORY_IDS } from "@/lib/trip-categories";

export type TripExtractionMaterial = {
  filename: string;
  sourceUploadId?: string;
  text: string;
  type: "file_text" | "note" | "pdf_text";
};

export type TripExtractionResult = {
  draft: unknown;
  model: string;
  usage: unknown;
};

const tripDraftSchema = {
  additionalProperties: false,
  properties: {
    activities: {
      items: {
        additionalProperties: false,
        properties: {
          address: { type: ["string", "null"] },
          category: {
            enum: TRIP_CATEGORY_IDS,
          },
          date: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          endTime: { type: ["string", "null"] },
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
          startTime: { type: ["string", "null"] },
          title: { type: "string" },
        },
        required: [
          "address",
          "category",
          "date",
          "description",
          "endTime",
          "itemType",
          "sourceFilename",
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
          answerType: { enum: ["text", "date", "time", "visibility", "confirm"] },
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
          type: { enum: ["flight", "train", "car", "ferry", "transfer", "other"] },
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
    sensitiveDetails: tripDraftSchema.properties.sensitiveDetails,
  },
  required: ["activities", "missingDetails", "sensitiveDetails"],
  type: "object",
};

const systemPrompt = [
  "You structure existing travel materials into a draft trip app data model.",
  "Do not invent details. Use null when a date, time, address, provider, or confirmation is missing.",
  "Preserve the traveler's mental model, but do not create activity cards that merely summarize a whole day. Full-day overview, theme, and day-title lines belong outside activities; extract the concrete traveler cards instead.",
  "For every traveler card in activities, set itemType to activity, note, admin, rest_day, social, or placeholder. Dining reservations, restaurants, cafes, bars, winery visits, and meal plans should usually be itemType activity with category food_dining.",
  `For every traveler card, also set category to the traveler-browse bucket, not the record type. Allowed category values are: ${TRIP_CATEGORY_IDS.join(", ")}.`,
  "Never use activity, note, or transport as a category. Those can be item types or separate transport records, but card categories should answer where a traveler would browse the plan.",
  "Use arrival_departure for flights, train transfers, airport/station arrivals, lodging check-ins, and explicit drop-bags cards that need to appear in the daily traveler timeline.",
  "Do not create checkout activity cards for ordinary checkout times. Store checkout date and checkout time on the stay. Only create an activity for a specific traveler action, such as returning a key, meeting a host, or moving bags.",
  "Create a check-in or drop-bags activity card with category arrival_departure only when the source gives a real lodging arrival action or bag-drop instruction. Keep the lodging itself in stays too.",
  "Use tours_tickets for timed entry, ticketed tours, guided tours, walking tours, castle/palace visits with ticket decisions, and similar reservation-like sightseeing. Use art_culture for broader museums, galleries, landmarks, libraries, statues, and cultural sights when the key thing is browsing the place rather than managing a ticket/tour.",
  "Use nightlife_entertainment for shows, performances, Ferris wheels, cocktail bars, evening entertainment, and nightlife. Use food_dining when the main point is a meal, cafe, brewery, beer hall, or tasting stop.",
  "Use scenic_ride only when the ride itself is part of the experience, such as a road trip, scenic train/boat ride, panorama train, or route worth browsing as an activity. Ordinary transport belongs in transport records and arrival_departure cards when needed in the daily timeline.",
  "Walking-tour and neighborhood-route rule: if a day lists three or more untimed, nearby, context-linked sightseeing stops, create one walking activity with every absorbed stop listed in the description. Split out stops with their own time, reservation, ticket, booking, or strong standalone importance.",
  "Same-site cluster rule: if multiple sub-stops are clearly part of one complex or visit, create one activity card with sub-stops in the description. For example, a palace visit can include gardens, show, train pass, viewpoints, and related ticket notes in one card.",
  "Named-stop rule: if a dated day lists named landmarks directly and they are not clearly inside a walking-route anchor or same-site cluster, create standalone activity cards rather than dropping them into a vague day summary.",
  "Flexible-options rule: if the source lists a cluster of optional ideas that fits one dated window, create one flexible activity card with the options in the description. Ask a question only when the choice affects a booking, ticket, route, or core day placement.",
  "City tips rule: never drop general city food ideas, restaurant lists, shopping ideas, beer hall lists, and local tips. Create one itemType note with date null, a title that names the city or leg such as 'Prague food ideas', and the list in the description. Phrases like 'check out foods like...', 'some good beer halls are...', or a loose list of options belong in city tips. A reservation, booking, ticket, chosen meal, time, or specific dated plan stays an activity.",
  "Description enrichment rule: you may add one short, tasteful sentence of general public context for known public places. Never invent logistics, tickets, addresses, bookings, confirmations, opening hours, or times. Sparse generic items such as 'Tour Rome' should become a placeholder or question, not a confident description.",
  "Traveler-facing text should use readable dates such as January 19th, not compact dates like 20190119. Do not repeat the year in every description when the trip is clearly contained to one year.",
  "Duplicate-place rule: if the same place appears on multiple days, do not silently create duplicate cards. Place it once when context is clear; if two placements are genuinely plausible, create one targeted missingDetails question.",
  "Flag private addresses, door codes, confirmation numbers, personal notes, and host contact details as sensitiveDetails instead of exposing them casually.",
  "Default sensitiveDetails should include exact private home addresses, exact rental or Airbnb addresses, door/gate/lockbox codes, Wi-Fi passwords, host phone numbers or emails, confirmation numbers, booking references, ticket numbers, passport/ID/payment details, and child/medical/personal safety notes.",
  "Hotel and hostel names, public landmarks, restaurants, shops, museums, commercial venue addresses, city names, and general day summaries are usually safe for follower mode unless paired with room numbers, access instructions, booking controls, or personal notes.",
  "Create missingDetails only for two cases: material unresolved questions, or non-obvious calls worth surfacing under 'Calls we made'. Do not create missingDetails for obvious facts directly stated by the source.",
  "Accuracy is paramount: never suppress a question if answering it would materially change the generated trip. Still, use a human review budget: most roughly week-long trips should average a small handful of meaningful questions and calls, not one per card or reservation. Do not force a fixed count; some clean trips need almost none, and messy trips can need more.",
  "Do not create missingDetails just to ask the maker to approve a high-confidence inference you already used in the structured records. Put that reasoning in the record/evidence instead.",
  "Do not ask privacy yes/no questions when the detail is clearly sensitive. Put private rental or Airbnb addresses, access codes, confirmations, booking references, and private notes in sensitiveDetails and default them behind traveler-password visibility. Do not flag hotel or hostel addresses as sensitive just because they are exact addresses.",
  "Do not ask broad privacy-policy questions such as whether booking references, Airbnb access codes, Wi-Fi passwords, or private rental addresses should be stored as sensitive details. Apply the default privacy policy in sensitiveDetails. Only create a privacy question when the source is genuinely ambiguous about whether a place is private versus public.",
  "Use personal/private note sensitivity narrowly: host personal contact details, passport/ID/payment details, medical or safety notes, emergency contacts, family/private logistics, and explicitly private notes. Ordinary logistics like picking up a rental car, taking a train, or visiting a public business are not personal notes.",
  "When you can make a reasonable uncertain guess, fill guessedValue and evidence instead of asking a blank question. Prefer confirmable prompts like 'This looks like dinner on June 14. Is that right?'",
  "Avoid asking obvious itinerary questions that a competent travel assistant should infer. A night outbound flight is the start of the trip even if the first lodging check-in is the next day. If lodging is missing for that night because the traveler is on an overnight flight, ask a targeted confirmation about sleeping on the plane only if the materials are genuinely ambiguous.",
  "Do not ask whether the trip start date should be the first hotel night when there is clear same-day outbound transport. Use the transport date as the trip start and, if helpful, create a statement-style call such as 'We treated the overnight flight as the first trip night because there is no hotel that night.'",
  "If the traveler clearly travels onward to a new city and the next lodging is in that new city, infer the route transition like a human planner would. Do not ask whether they are leaving the prior city unless there is competing evidence.",
  "If only one lodging record is visible for a city and the route then moves onward, treat that as the stay block unless another lodging clue conflicts. Surface it as a call only if the decision is non-obvious and useful to inspect, not as multiple overlapping questions.",
  "For stays, infer checkOut only from explicit source evidence, such as a clear first sleeping night or checkIn plus a stated nights count. For example, if a hotel or hostel starts January 14 and says 3 nights, set checkIn to January 14, firstNightDate to January 14, nights to 3, and checkOut to January 17. If the source says 'Friday: sleep at Wombats' and '3 nights', use the Friday date as checkIn/firstNightDate and add 3 nights for checkOut. Do not invent stay dates from surrounding itinerary context alone. If the first night or nights count is ambiguous, leave the uncertain field null and create a missingDetails question.",
  "If a source explicitly says a stay is N nights, do not ask the maker to confirm that nights count and do not surface it as a call. It is a fact. Use it to compute the stay block.",
  "When lodging text is formatted as a check-in instruction, still extract the lodging name. For example, 'The Yellow: Check in: 2:30 PM #743...' should create a stay named 'The Yellow' or 'The Yellow Hostel', with checkInTime 2:30 PM if available, instead of asking whether that is the title.",
  "Do not turn weak medium-confidence guesses into 'calls we made' when changing the guess would move a stay, transport record, or dated traveler card. Strong contextual evidence is acceptable: if a reasonable human trip-planner would confidently make the same call from ordering, arrival/departure sequence, bag-drop/check-in flow, or surrounding itinerary context, make the call and explain it. If two answers are genuinely plausible, create one targeted missingDetails question instead.",
  "Calls must be statements, not questions. Do not end call prompts with 'Is that right?' or 'Please confirm'. If you make a non-obvious itinerary call that is worth surfacing but should not block the draft, include it as a missingDetails entry with a statement-style prompt, guessedValue, evidence, confidence, subjectType, and targetField so the app can show it under 'Calls we made' instead of Questions.",
  "For time-bound reservations, pickups, tours, or appointments, decide whether the card has a usable anchor. If it has a specific name, address/location, provider, route, confirmation, or enough descriptive context, create the card and usually omit missing nice-to-have fields from review. If it only has a generic type plus time, such as 'dinner reservation at 6:30' with no restaurant name, address, confirmation, or other identifier, ask a targeted question because the card is not identifiable enough.",
  "Do not ask or create calls for optional labels that are not needed to use the traveler app. For example, if a transport record has enough usable timing/route/location detail but no provider or company name, create the transport record and leave provider null. Surface a call only when the missing detail materially affects how the maker would understand or use the card.",
  "If an activity choice is unresolved but non-blocking, make a placeholder traveler card with TBD language instead of blocking the app. MissingDetails may accept answers like 'not sure yet' and should not prevent a draft unless the missing detail affects the core route, dates, lodging, or critical transport.",
  "If the source itself contains explicit unresolved maker to-do language such as 'Need to decide', 'TBD', 'pick a time', 'choose ticket', 'book this', or 'confirm later', preserve it. Create the activity card with the unresolved detail in the description, and also create one targeted missingDetails question when an answer would fill a specific card field or decision such as ticket type, booking status, startTime, or reservation detail. This should be an open question, not a call we made.",
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
  "This stage extracts only traveler cards and related review details: activities, missingDetails, and sensitiveDetails. Do not repeat places, stays, transport, or tripOverview.",
  "Include restaurants and dining reservations as activities with category food_dining. Do not keep broad day arcs as activity cards; keep timed, ticketed, booked, chosen, or concrete experience cards separate.",
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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function createActivityExtractionFailureQuestion(error: unknown) {
  return {
    answerType: "text",
    confidence: "low",
    evidence: null,
    guessedValue: null,
    prompt:
      "Roamwoven built the trip spine, but could not finish extracting activities. Add any important activities manually or contact support to recover this section.",
    reason:
      error instanceof Error
        ? `Activity extraction failed after the trip spine was captured: ${error.message}`
        : "Activity extraction failed after the trip spine was captured.",
    relatedTitle: null,
    subjectType: "trip",
    targetField: null,
  };
}

function combineDraftStages({
  activitiesStage,
  activityFailure,
  spineStage,
}: {
  activitiesStage?: unknown;
  activityFailure?: unknown;
  spineStage: unknown;
}) {
  const spine = asRecord(spineStage);
  const activities = asRecord(activitiesStage);
  const activityMissingDetails = activityFailure
    ? [createActivityExtractionFailureQuestion(activityFailure)]
    : asArray(activities.missingDetails);

  return {
    activities: asArray(activities.activities),
    missingDetails: [
      ...asArray(spine.missingDetails),
      ...activityMissingDetails,
    ],
    places: asArray(spine.places),
    sensitiveDetails: [
      ...asArray(spine.sensitiveDetails),
      ...asArray(activities.sensitiveDetails),
    ],
    stays: asArray(spine.stays),
    transport: asArray(spine.transport),
    tripOverview: spine.tripOverview ?? {
      confidence: "low",
      dateRange: null,
      destinationSummary: null,
      title: null,
    },
  };
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

  const formattedMaterials = formatMaterials(usableMaterials);
  const input = [`Trip name: ${tripName}`, formattedMaterials].join("\n\n");
  const spineResult = await createOpenAIStructuredResponse({
    input,
    schema: tripSpineSchema,
    schemaName: "roamwoven_trip_spine",
    system: spineSystemPrompt,
  });
  let activitiesResult: Awaited<
    ReturnType<typeof createOpenAIStructuredResponse>
  > | null = null;
  let activityFailure: unknown = null;

  try {
    activitiesResult = await createOpenAIStructuredResponse({
      input,
      schema: tripActivitiesSchema,
      schemaName: "roamwoven_trip_activities",
      system: activitiesSystemPrompt,
    });
  } catch (error) {
    activityFailure = error;
    console.error("trip_activity_extraction_failed_after_spine", {
      message: error instanceof Error ? error.message : "Unknown error.",
      name: error instanceof Error ? error.name : "UnknownError",
      tripName,
    });
  }

  const draft = combineDraftStages({
    activitiesStage: activitiesResult?.json,
    activityFailure,
    spineStage: spineResult.json,
  });

  return {
    draft,
    model: activitiesResult?.model ?? spineResult.model,
    usage: {
      activities: activitiesResult?.usage ?? null,
      activityFailure:
        activityFailure instanceof Error
          ? {
              message: activityFailure.message,
              name: activityFailure.name,
            }
          : null,
      spine: spineResult.usage,
      staged: true,
    },
  };
}
