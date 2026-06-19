import { createOpenAIStructuredResponse } from "@/lib/ai/openai";

export type TripExtractionMaterial = {
  filename: string;
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
  "For missingDetails, set subjectType and targetField to the exact structured record field when possible, such as item/date, item/startTime, stay/checkIn, stay/addressVisibility, transport/date, or transport/departureTime.",
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

  const result = await createOpenAIStructuredResponse({
    input: [`Trip name: ${tripName}`, formatMaterials(usableMaterials)].join(
      "\n\n"
    ),
    schema: tripDraftSchema,
    schemaName: "roamwoven_trip_draft",
    system: systemPrompt,
  });

  return {
    draft: result.json,
    model: result.model,
    usage: result.usage,
  };
}
