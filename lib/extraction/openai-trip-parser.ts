import { createOpenAIStructuredResponse } from "@/lib/ai/openai";
import { getOpenAIConfig } from "@/lib/env";
import { consolidateTripDraft } from "@/lib/extraction/consolidate-trip-draft";
import { optimizeTripExtractionMaterials } from "@/lib/extraction/material-budget";
import {
  extractSourceTransportAnchorsFromMaterials,
  SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY,
} from "@/lib/extraction/source-transport-anchors";
import { createDraftAuditSnapshot } from "@/lib/extraction/trip-extraction-audit";
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
          answerType: { enum: ["text", "choice", "date", "time", "visibility", "confirm"] },
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
  "Use arrival_departure for flights, train transfers, airport/station arrivals, rental car pickup/dropoff, lodging check-ins, and explicit drop-bags cards that need to appear in the daily traveler timeline.",
  "Do not create checkout activity cards for ordinary checkout times. Store checkout date and checkout time on the stay. Only create an activity for a specific traveler action, such as returning a key, meeting a host, or moving bags.",
  "Create a check-in or drop-bags activity card with category arrival_departure only when the source gives a real lodging arrival action or bag-drop instruction. Keep the lodging itself in stays too.",
  "Use tours_tickets for timed entry, ticketed tours, guided tours, walking tours, castle/palace visits with ticket decisions, and similar reservation-like sightseeing. Use art_culture for broader museums, galleries, landmarks, libraries, statues, and cultural sights when the key thing is browsing the place rather than managing a ticket/tour.",
  "Use nightlife_entertainment for shows, performances, Ferris wheels, cocktail bars, evening entertainment, and nightlife. Use food_dining when the main point is a meal, cafe, brewery, beer hall, or tasting stop.",
  "Use scenic_ride only when the ride itself is part of the experience, such as a road trip, scenic train/boat ride, panorama train, or route worth browsing as an activity. Ordinary transport belongs in transport records and arrival_departure cards when needed in the daily timeline.",
  "Travel-card purity rule: transport descriptions may include route, date, time, station/airport, provider/operator, confirmation/ticket, luggage, pickup/dropoff, platform/terminal, seat, and check-in/boarding notes. Do not put destination sightseeing, food plans, shopping plans, or loose notes/tips into a transport description; extract those as activities or notes.",
  "Do not create separate traveler cards or questions for ordinary local airport moves when a same-day flight card already contains the actionable flight details. Only keep an airport transfer when it has a booked provider, pickup arrangement, driver, voucher, or other distinct reservation detail.",
  "For trains between adjacent trip legs, infer the route from the surrounding leg sequence when the source says 'train to X' or shows the next stay in X. Do not ask where the train departed from unless there is competing evidence or the train cannot be placed.",
  "Activity granularity rule: split named, source-backed venues by default. Group only when the source or common public knowledge clearly supports one guided tour, one walking/neighborhood route, one same-site complex, or one pick-one options cluster.",
  "Walking-tour and neighborhood-route rule: create one walking activity only when the source frames the stops as one walk/tour/route or the stops are untimed, nearby, and context-linked. Every absorbed stop must stay in the description. Split out any stop with its own time, reservation, ticket, booking, vehicle/drive leg, different site, or strong standalone importance.",
  "Same-site cluster rule: if multiple included stops are clearly part of one complex or visit, create one activity card with included stops in the description. For example, a palace visit can include gardens, show, train pass, viewpoints, and related ticket notes in one card. Do not attach unrelated museums, churches, shops, restaurants, or city sights after 'also noted' to the same card.",
  "Named-stop rule: if a dated day lists named landmarks directly and they are not clearly inside a walking-route anchor, same-site cluster, or pick-one cluster, create standalone activity cards rather than dropping them into a vague day summary. Generic titles like 'Rome note', 'Prague sights', 'Vienna sights', or 'city note' are only acceptable when the source itself is generic and no named venue exists.",
  "Timed/ticketed rule: named timed entry, ticketed tours, guided tours, attractions with booking numbers, and fixed restaurant reservations should be their own cards. A timed/ticketed item must not be swallowed by a broader sights or walking-tour card.",
  "Flexible-options rule: if the source lists a cluster of optional ideas that fits one dated window, create one flexible activity card only when the source implies a pick-one or choose-from-these plan. Use answerType choice for one targeted question when the maker's choice determines which options appear, and include the concrete source-backed options in the prompt or reason. If the source is simply a dated sequence/list of places, split the places into separate flexible activity cards instead.",
  "City notes/tips rule: never drop general city food ideas, restaurant lists, shopping ideas, beer hall lists, local tips, or loose travel notes. Source headers like 'Eat:', 'Food:', 'Bars:', 'Beer halls:', 'Cafes:', 'Restaurants:', 'Shopping:', 'Tips:', or 'Notes:' are strong note signals when they are loose recommendations rather than chosen dated plans. Create one itemType note with date null, attach it to the specific relevant city/leg, use a title that names that city or leg such as 'Prague food ideas', and keep the list in the description. These notes must be city-scoped: Prague notes belong only under Prague, Vienna notes only under Vienna, Budapest notes only under Budapest. If the city/leg cannot be inferred from the source chunk or surrounding trip spine, create a missingDetails question for placement instead of attaching it globally. Phrases like 'check out foods like...', 'some good beer halls are...', or a loose list of options belong in city notes/tips. A reservation, booking, ticket, chosen meal, time, specific dated plan, or day-specific sightseeing cluster stays an activity or flexible activity, not a note.",
  "Description rule for this extraction stage: write concise, source-backed descriptions only. Do not add public background or editorial enrichment here; a later enrichment pass can add neutral public context with separate provenance. Never invent logistics, tickets, addresses, bookings, confirmations, opening hours, or times. Sparse generic items such as 'Tour Rome' should become a placeholder or question, not a confident description.",
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
  "Calls must be FYI statements, not questions. Do not use question marks, 'should we', 'do you want', 'Is that right?', or 'Please confirm' in call prompts. If you make a non-obvious presentation choice that is worth surfacing but should not block the draft, such as grouping several stops into one walking afternoon, include it as a missingDetails entry with a statement-style prompt, guessedValue, evidence, confidence, subjectType, and targetField so the app can show it under 'Calls we made' instead of Questions.",
  "For time-bound reservations, pickups, tours, or appointments, decide whether the card has a usable anchor. If it has a specific name, address/location, provider, route, confirmation, or enough descriptive context, create the card and usually omit missing nice-to-have fields from review. If it only has a generic type plus time, such as 'dinner reservation at 6:30' with no restaurant name, address, confirmation, or other identifier, ask a targeted question because the card is not identifiable enough.",
  "Do not ask or create calls for optional labels that are not needed to use the traveler app. For example, if a transport record has enough usable timing/route/location detail but no provider or company name, create the transport record and leave provider null. Surface a call only when the missing detail materially affects how the maker would understand or use the card.",
  "If an activity choice is unresolved but non-blocking, make a placeholder traveler card with TBD language instead of blocking the app. MissingDetails may accept answers like 'not sure yet' and should not prevent a draft unless the missing detail affects the core route, dates, lodging, or critical transport.",
  "If the source itself contains explicit unresolved maker to-do language such as 'Need to decide', 'TBD', 'pick a time', 'choose ticket', 'book this', or 'confirm later', preserve it. Create the activity card with the unresolved detail in the description, and also create one targeted missingDetails question when an answer would fill a specific card field or decision such as ticket type, booking status, startTime, or reservation detail. This should be an open question, not a call we made. Grouping cannot swallow unresolved decisions: if a walking route or same-site cluster absorbs a stop with unresolved ticket, booking, or timing language, keep that detail in the grouped card description and create the question for the specific stop when recoverable.",
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

const activityRescueSystemPrompt = [
  activitiesSystemPrompt,
  "This is an automatic second pass after a previous chunk extraction returned no traveler cards despite source text that appears to contain activities, notes/tips, or unresolved activity decisions.",
  "Re-read the chunk carefully and extract every concrete named, timed, ticketed, food, local-tip, loose travel-note, or optional-plan item. If the chunk truly contains only transport/stay/privacy data and no traveler activity or note, return empty arrays.",
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

    if (!remaining || chunks.length > 80) {
      break;
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
      `Activity source chunk ${chunkIndex + 1} of ${chunkTotal}: ${chunk.label}`,
      "Extract every source-backed traveler card, city note/tip, material question, and non-obvious call from this chunk.",
      "If this chunk contains multiple named dated venues, preserve them as separate cards unless the source clearly makes them one tour, route, complex, or pick-one cluster.",
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

function createActivityExtractionFailureQuestion(
  error: unknown,
  chunk?: ActivityExtractionChunk
) {
  const suspiciousEmpty = error instanceof EmptyActivityChunkOutputError;

  return {
    answerType: "text",
    confidence: "low",
    evidence: chunk?.label ?? null,
    guessedValue: null,
    prompt:
      suspiciousEmpty && chunk
        ? `Roamwoven could not confidently extract activities from ${chunk.label}. Review this source section and add any missing activities before publishing.`
        : chunk
        ? `Roamwoven built the trip spine, but could not finish extracting activities from ${chunk.label}. Add any important activities from that source section manually or contact support to recover it.`
        : "Roamwoven built the trip spine, but could not finish extracting activities. Add any important activities manually or contact support to recover this section.",
    reason:
      suspiciousEmpty
        ? "Automatic extraction and a second pass returned no traveler cards even though this source section appears to contain activity or notes/tips details."
        : error instanceof Error
        ? `Activity extraction failed after the trip spine was captured${
            chunk ? ` for ${chunk.label}` : ""
          }: ${error.message}`
        : "Activity extraction failed after the trip spine was captured.",
    relatedTitle: null,
    subjectType: "trip",
    targetField: null,
  };
}

function dedupeDraftObjects(items: unknown[]) {
  const byKey = new Map<string, unknown>();
  const order: string[] = [];

  const objectScore = (item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return 0;
    }

    const record = item as Record<string, unknown>;
    const description = contextString(record.description);
    const filledFields = Object.values(record).filter((value) =>
      typeof value === "string" ? value.trim() : value !== null && value !== undefined
    ).length;

    return filledFields + Math.min(description?.length ?? 0, 500) / 100;
  };

  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const key = [
      contextString(record.title) ?? contextString(record.prompt) ?? "",
      contextString(record.date) ?? "",
      contextString(record.startTime) ?? "",
      contextString(record.itemType) ?? "",
      contextString(record.subjectType) ?? "",
      contextString(record.targetField) ?? "",
    ]
      .map((part) => normalizeWhitespace(part).toLowerCase())
      .join("|");

    const existing = byKey.get(key);

    if (existing) {
      if (objectScore(item) > objectScore(existing)) {
        byKey.set(key, item);
      }

      continue;
    }

    order.push(key);
    byKey.set(key, item);
  }

  return order.map((key) => byKey.get(key)).filter(Boolean);
}

function combineActivityStages(stages: unknown[]) {
  const records = stages.map(asRecord);

  return {
    activities: dedupeDraftObjects(
      records.flatMap((record) => asArray(record.activities))
    ),
    missingDetails: dedupeDraftObjects(
      records.flatMap((record) => asArray(record.missingDetails))
    ),
    sensitiveDetails: dedupeDraftObjects(
      records.flatMap((record) => asArray(record.sensitiveDetails))
    ),
  };
}

function combineDraftStages({
  activitiesStage,
  activityFailures,
  sourceTransportAnchors,
  spineStage,
}: {
  activitiesStage?: unknown;
  activityFailures?: Array<{ chunk?: ActivityExtractionChunk; error: unknown }>;
  sourceTransportAnchors?: unknown[];
  spineStage: unknown;
}) {
  const spine = asRecord(spineStage);
  const activities = asRecord(activitiesStage);
  const activityFailureDetails =
    activityFailures?.map((failure) =>
      createActivityExtractionFailureQuestion(failure.error, failure.chunk)
    ) ?? [];

  return {
    activities: asArray(activities.activities),
    missingDetails: [
      ...asArray(spine.missingDetails),
      ...asArray(activities.missingDetails),
      ...activityFailureDetails,
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
    [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
      transport: sourceTransportAnchors ?? [],
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

  const config = getOpenAIConfig();
  const spineMaterials = optimizeTripExtractionMaterials({
    materials: usableMaterials,
    totalCharBudget: config.maxInputChars,
  });
  const sourceTransportAnchors =
    extractSourceTransportAnchorsFromMaterials(usableMaterials);
  const formattedMaterials = formatMaterials(spineMaterials.materials);
  const input = [`Trip name: ${tripName}`, formattedMaterials].join("\n\n");
  const spineResult = await createOpenAIStructuredResponse({
    input,
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

  const activitiesStage = combineActivityStages(
    activityResults.map((activityResult) => activityResult.result.json)
  );

  const combinedDraft = combineDraftStages({
    activitiesStage,
    activityFailures,
    sourceTransportAnchors,
    spineStage: spineResult.json,
  });
  const preAssemblyDraft = createDraftAuditSnapshot(combinedDraft);
  const { debug: consolidation, draft } = consolidateTripDraft(combinedDraft);
  const assembledDraft = createDraftAuditSnapshot(draft);

  return {
    draft,
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
      activityFailures: activityFailures.map(({ attempts, chunk, error }) => ({
        attempts,
        chunkId: chunk.id,
        chunkLabel: chunk.label,
        message: error instanceof Error ? error.message : "Unknown error.",
        name: error instanceof Error ? error.name : "UnknownError",
      })),
      audit: {
        assembledDraft,
        preAssemblyDraft,
      },
      consolidation,
      sourceAnchors: {
        transport: sourceTransportAnchors,
      },
      spineMaterialBudget: spineMaterials.summary,
      spine: spineResult.usage,
      staged: true,
    },
  };
}
