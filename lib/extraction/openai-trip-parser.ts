import { createOpenAIStructuredResponse } from "@/lib/ai/openai";

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
            enum: [
              "activity",
              "admin_logistics",
              "arrival_departure",
              "art_class",
              "art_culture",
              "beach_water",
              "food_class",
              "food_dining",
              "kid_activity",
              "nature_outdoors",
              "note",
              "rest_day",
              "scenic_ride",
              "shopping_tailor",
              "social",
              "temple_shrine",
              "transport",
              "wellness_and_relaxation",
            ],
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
          checkOut: { type: ["string", "null"] },
          name: { type: "string" },
          sourceFilename: { type: "string" },
        },
        required: ["address", "checkIn", "checkOut", "name", "sourceFilename"],
        type: "object",
      },
      type: "array",
    },
    transport: {
      items: {
        additionalProperties: false,
        properties: {
          arrival: { type: ["string", "null"] },
          confirmation: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          departure: { type: ["string", "null"] },
          provider: { type: ["string", "null"] },
          sourceFilename: { type: "string" },
          title: { type: "string" },
          type: { enum: ["flight", "train", "car", "ferry", "transfer", "other"] },
        },
        required: [
          "arrival",
          "confirmation",
          "date",
          "departure",
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
  "Preserve the traveler's mental model: broad day arcs can remain anchor activities; split only reservation-backed, map-critical, permit-backed, or time-specific stops.",
  "For every traveler card in activities, set itemType to activity, note, admin, rest_day, social, or placeholder. Dining reservations, restaurants, cafes, bars, winery visits, and meal plans should usually be itemType activity with category food_dining.",
  "For every traveler card, also set category to the Wren-style organization bucket travelers would browse under: food_dining, art_culture, nature_outdoors, beach_water, scenic_ride, shopping_tailor, temple_shrine, wellness_and_relaxation, kid_activity, social, rest_day, admin_logistics, arrival_departure, food_class, art_class, transport, note, or activity.",
  "Flag private addresses, door codes, confirmation numbers, personal notes, and host contact details as sensitiveDetails instead of exposing them casually.",
  "Default sensitiveDetails should include exact private home addresses, exact rental or Airbnb addresses, door/gate/lockbox codes, Wi-Fi passwords, host phone numbers or emails, confirmation numbers, booking references, ticket numbers, passport/ID/payment details, and child/medical/personal safety notes.",
  "Hotel names, public landmarks, restaurants, city names, and general day summaries are usually safe for follower mode unless paired with room numbers, access instructions, booking controls, or personal notes.",
  "Create missingDetails only for questions that materially affect the generated traveler app.",
  "When you can make a reasonable uncertain guess, fill guessedValue and evidence instead of asking a blank question. Prefer confirmable prompts like 'This looks like dinner on June 14. Is that right?'",
  "Avoid asking obvious itinerary questions that a competent travel assistant should infer. A night outbound flight is the start of the trip even if the first lodging check-in is the next day. If lodging is missing for that night because the traveler is on an overnight flight, ask a targeted confirmation about sleeping on the plane only if the materials are genuinely ambiguous.",
  "Do not ask whether the trip start date should be the first hotel night when there is clear same-day outbound transport. Use the transport date as the trip start and, if helpful, create a low-friction confirmation such as 'We treated the overnight flight as the first trip night because there is no hotel that night. Is that right?'",
  "For stays, infer checkout dates only from explicit source evidence, such as a clear first sleeping night or check-in date plus a stated nights count. For example, if a hotel or hostel starts January 14 and says 3 nights, set checkInDate to January 14 and checkOutDate to January 17. Do not invent stay dates from surrounding itinerary context alone. If the first night or nights count is ambiguous, leave the uncertain field null and create a missingDetails question.",
  "If you make a reasonable itinerary call that is worth surfacing but should not block the draft, keep it as evidence/reason on the relevant record instead of creating a yes/no question.",
  "If an activity choice is unresolved but non-blocking, make a placeholder traveler card with TBD language instead of blocking the app. MissingDetails may accept answers like 'not sure yet' and should not prevent a draft unless the missing detail affects the core route, dates, lodging, or critical transport.",
  "For missingDetails, set subjectType and targetField to the exact structured record field when possible, such as item/date, item/startTime, stay/checkIn, stay/addressVisibility, transport/date, or transport/departureTime.",
].join(" ");

const spineSystemPrompt = [
  systemPrompt,
  "This stage extracts only the trip spine: tripOverview, places, stays, transport, sensitiveDetails, and missingDetails. Do not output activities in this stage.",
  "Prioritize dates, destinations, stays, flights, trains, transfers, rental cars, and privacy-sensitive booking details.",
].join(" ");

const activitiesSystemPrompt = [
  systemPrompt,
  "This stage extracts only traveler cards and related review details: activities, missingDetails, and sensitiveDetails. Do not repeat places, stays, transport, or tripOverview.",
  "Include restaurants and dining reservations as activities with category food_dining. Keep broad day arcs as anchor activities when they match the traveler's mental model.",
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
