import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { parseOptionalEnvList } from "@/lib/env";
import {
  applyReviewDecision,
  applyReviewDecisions,
} from "@/lib/generated-trip-decisions";
import {
  formatStructuredDiscoverySummary,
  getStructuredReviewCount,
  getStructuredReviewSections,
} from "@/lib/generated-trip-review";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";
import {
  normalizeTripReviewDecisionRow,
  serializeTripReviewDecision,
} from "@/lib/review-decisions";
import {
  createPublishedPrivateDetails,
  createPublishedTripSnapshotPayload,
} from "@/lib/published-snapshots";
import {
  hashTravelerPassword,
  verifyTravelerPassword,
} from "@/lib/traveler-access";
import { classifyAddressSensitivity } from "@/lib/traveler-privacy";
import {
  createTravelerAppViewModel,
  getAsiaDemoStructuredTripRecords,
  getAsiaDemoTravelerAppViewModel,
} from "@/lib/traveler-view-model";
import { canEditTripMaterials } from "@/lib/trips";
import {
  getUnpaidStarterMaterialCleanupCutoff,
  UNPAID_STARTER_MATERIAL_RETENTION_DAYS,
} from "@/lib/uploads";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("Asia seed compiles into structured records and traveler view model", () => {
  const records = getAsiaDemoStructuredTripRecords();
  const viewModel = getAsiaDemoTravelerAppViewModel();

  assert.equal(records.trip.id, "demo-trip");
  assert.ok(records.legs.length > 20, "expected Wren route spine");
  assert.ok(records.items.length > 300, "expected activity/card records");
  assert.ok(records.days.length > 80, "expected generated day records");
  assert.ok(records.stays.length > 20, "expected linked stays");
  assert.ok(
    records.privateDetails.some(
      (detail) =>
        detail.detailType === "private_address" &&
        detail.visibility === "traveler_password"
    ),
    "expected exact stay addresses to be protected"
  );

  assert.equal(viewModel.trip.id, records.trip.id);
  assert.equal(viewModel.cards.length, records.items.length);
  assert.equal(viewModel.days[0]?.cards[0]?.title, "Fly to Seattle");
  assert.equal(viewModel.days[0]?.legName, "Seattle");
  assert.ok(
    viewModel.categories.some((category) => category.id === "arrival_departure"),
    "expected category cards from seed categories"
  );
  assert.equal(
    viewModel.privacy.privateDetailCount,
    records.privateDetails.length
  );
});

test("starter materials can be edited before checkout until processing starts", () => {
  assert.equal(
    canEditTripMaterials({
      isDemo: false,
      paymentStatus: "unpaid",
      processingStatus: "draft",
    }),
    true
  );
  assert.equal(
    canEditTripMaterials({
      isDemo: false,
      paymentStatus: "paid",
      processingStatus: "parsed",
    }),
    false
  );
  assert.equal(
    canEditTripMaterials({
      isDemo: true,
      paymentStatus: "demo",
      processingStatus: "demo",
    }),
    false
  );
});

test("unpaid starter material cleanup uses the beta retention window", () => {
  assert.equal(UNPAID_STARTER_MATERIAL_RETENTION_DAYS, 14);
  assert.equal(
    getUnpaidStarterMaterialCleanupCutoff({
      now: new Date("2026-06-19T12:00:00.000Z"),
    }),
    "2026-06-05T12:00:00.000Z"
  );
});

test("draft parser output compiles into structured records", () => {
  const draft = {
    activities: [
      {
        address: "Old Town Square",
        date: "2026-09-02",
        description: "Walk the old town and find dinner.",
        endTime: null,
        sourceFilename: "central-europe.pdf",
        startTime: "17:00",
        title: "Old Town walk",
      },
      {
        address: null,
        category: "food_dining",
        date: null,
        description: "A flexible cafe stop.",
        endTime: null,
        itemType: "activity",
        sourceFilename: "central-europe.pdf",
        startTime: null,
        title: "Cafe TBD",
      },
    ],
    missingDetails: [
      {
        prompt: "Which day is Cafe TBD?",
        reason: "The traveler app needs a date to place the card.",
        relatedTitle: "Cafe TBD",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Prague",
        country: "Czechia",
        leaveDate: "2026-09-04",
      },
      {
        arriveDate: "2026-09-04",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2026-09-06",
      },
    ],
    sensitiveDetails: [
      {
        detailType: "door_code",
        reason: "Door codes should stay behind traveler mode.",
        title: "Apartment access code",
      },
    ],
    stays: [
      {
        address: "Private apartment address",
        checkIn: "2026-09-01",
        checkOut: "2026-09-04",
        name: "Prague apartment",
        sourceFilename: "central-europe.pdf",
      },
    ],
    transport: [
      {
        arrival: "Prague",
        confirmation: "ABC123",
        date: "2026-09-01",
        departure: "New York",
        provider: "Example Air",
        sourceFilename: "central-europe.pdf",
        title: "Fly to Prague",
        type: "flight",
      },
    ],
    tripOverview: {
      confidence: "medium",
      dateRange: "Sep 1-6, 2026",
      destinationSummary: "Prague and Vienna",
      title: "Central Europe",
    },
  };

  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-1",
  });
  const viewModel = createTravelerAppViewModel(records);

  assert.equal(records.trip.travelerAppTitle, "Central Europe");
  assert.equal(records.legs.length, 2);
  assert.equal(records.stays[0]?.legId, records.legs[0]?.id);
  assert.equal(records.transport[0]?.transportType, "flight");
  assert.equal(records.transport[0]?.confirmationVisibility, "traveler_password");
  assert.equal(records.items.length, 2);
  assert.equal(records.items[1]?.itemType, "activity");
  assert.equal(records.items[1]?.categoryId, "food_dining");
  assert.ok(
    records.categories.some((category) => category.categoryKey === "food_dining"),
    "expected dining activities to use the food and dining category"
  );
  assert.equal(records.items[1]?.reviewRequired, true);
  assert.equal(records.reviewQuestions.length, 1);
  assert.ok(
    records.privateDetails.some(
      (detail) =>
        detail.detailType === "confirmation_number" &&
        detail.visibility === "traveler_password"
    ),
    "expected confirmation numbers to become private details"
  );
  assert.ok(
    records.privateDetails.some((detail) => detail.detailType === "door_code"),
    "expected parser-sensitive details to become private details"
  );
  assert.ok(records.days.length >= 2, "expected days from records");
  assert.equal(viewModel.trip.title, "Central Europe");
  assert.equal(viewModel.cards.length, 2);
});

test("explicit stay nights infer checkout without review", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: null,
          checkIn: null,
          checkOut: null,
          firstNightDate: "2019-01-18",
          name: "Wombats City Hostel Vienna - The Lounge",
          nights: 3,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        confidence: "medium",
        dateRange: "Jan 18-21, 2019",
        destinationSummary: "Vienna",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-stay-nights",
  });
  const stay = records.stays[0];

  assert.equal(stay?.checkInDate, "2019-01-18");
  assert.equal(stay?.checkOutDate, "2019-01-21");
  assert.equal(stay?.reviewRequired, false);
  assert.equal(getStructuredReviewCount(records), 0);
});

test("explicit stay nights infer check-in from checkout", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "Wombats City Hostel Vienna - The Lounge ... 3 nights",
          guessedValue: "3 nights",
          prompt: "Is the Vienna hostel stay definitely 3 nights, ending on January 21?",
          reason: "The source explicitly says 3 nights.",
          relatedTitle: "Wombats City Hostel Vienna - The Lounge",
          subjectType: "stay",
          targetField: "item/date",
        },
      ],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: null,
          checkIn: null,
          checkInTime: null,
          checkOut: "2019-01-21",
          checkOutTime: null,
          firstNightDate: null,
          name: "Wombats City Hostel Vienna - The Lounge",
          nights: 3,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        confidence: "medium",
        dateRange: "Jan 18-21, 2019",
        destinationSummary: "Vienna",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-stay-checkin",
  });
  const stay = records.stays[0];
  assert.equal(stay?.checkInDate, "2019-01-18");
  assert.equal(stay?.checkOutDate, "2019-01-21");
  assert.equal(stay?.reviewRequired, false);
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
});

test("strong lodging title guesses become stay names instead of questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The Yellow: Check in: 2:30 PM #743-410652363",
          guessedValue: "The Yellow Hostel",
          prompt: "Is this the correct lodging title for the Rome stay on January 13?",
          reason: "The source has check-in instructions and address.",
          relatedTitle: "Rome stay",
          subjectType: "stay",
          targetField: "item/title",
        },
      ],
      places: [
        {
          arriveDate: "2019-01-13",
          city: "Rome",
          country: "Italy",
          leaveDate: "2019-01-14",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: null,
          checkIn: "2019-01-13",
          checkInTime: "14:30",
          checkOut: "2019-01-14",
          checkOutTime: null,
          firstNightDate: "2019-01-13",
          name: "Rome stay",
          nights: 1,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        confidence: "medium",
        dateRange: "Jan 13-14, 2019",
        destinationSummary: "Rome",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-yellow",
  });
  const stay = records.stays[0];

  assert.equal(stay?.name, "The Yellow Hostel");
  assert.equal(stay?.checkInTime, "14:30");
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(records.reviewQuestions[0]?.status, "noted");
});

test("commercial stay addresses remain public", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [
        {
          detailType: "address",
          reason: "The source includes the hostel address.",
          title: "Wombats City Hostel address",
        },
      ],
      stays: [
        {
          address: "Mariahilfer Strasse 137, Vienna, Austria",
          checkIn: "2019-01-18",
          checkOut: "2019-01-21",
          firstNightDate: "2019-01-18",
          name: "Wombats City Hostel Vienna - The Lounge",
          nights: 3,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-hostel-address",
  });

  assert.equal(records.stays[0]?.addressVisibility, "public");
  assert.equal(records.privateDetails.length, 0);
});

test("private rental stay addresses remain protected", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [
        {
          address: "Private apartment address",
          checkIn: "2019-01-14",
          checkOut: "2019-01-15",
          firstNightDate: "2019-01-14",
          name: "Prague Airbnb",
          nights: 1,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-airbnb-address",
  });

  assert.equal(records.stays[0]?.addressVisibility, "traveler_password");
  assert.equal(records.privateDetails[0]?.detailType, "private_address");
});

test("medium-confidence core date guesses stay questions without explicit evidence", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-13",
          itemType: "activity",
          title: "Rome walk after bag drop",
        },
      ],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "Surrounding itinerary suggests this framing.",
          guessedValue: "2019-01-13",
          prompt: "Is the Rome walk really on January 13?",
          reason: "The source context implies the date but does not state it directly.",
          relatedTitle: "Rome walk after bag drop",
          subjectType: "item",
          targetField: "date",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Rome",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-contextual-date",
  });

  assert.equal(records.reviewQuestions[0]?.status, "open");
  assert.equal(getStructuredReviewCount(records), 1);
});

test("strong contextual date calls become notes instead of questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-13",
          itemType: "activity",
          title: "Rome walk after bag drop",
        },
      ],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence:
            "This follows the Rome arrival, bag drop, then check-in sequence on the same day.",
          guessedValue: "2019-01-13",
          prompt: "We placed the Rome walk on January 13 after arrival and bag drop.",
          reason:
            "A reasonable trip planner would place this on the Rome arrival day from the surrounding sequence.",
          relatedTitle: "Rome walk after bag drop",
          subjectType: "item",
          targetField: "date",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Rome",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-strong-contextual-date",
  });

  assert.equal(records.reviewQuestions[0]?.status, "noted");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("commercial activity addresses do not become private details", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          address: "10 Via Roma",
          date: "2019-01-13",
          itemType: "activity",
          title: "Watches in Rome",
        },
      ],
      missingDetails: [],
      places: [],
      sensitiveDetails: [
        {
          detailType: "address",
          reason: "The source includes a watch shop address.",
          title: "Watch shop in Rome address",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Rome",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-commercial-address",
  });

  assert.equal(records.privateDetails.length, 0);
  assert.equal(
    classifyAddressSensitivity({
      address: "10 Via Roma",
      context: "Watches in Rome shop",
    }),
    null
  );
  assert.equal(
    classifyAddressSensitivity({
      address: "10 Via Roma",
      context: "Airbnb apartment",
    })?.kind,
    "private_residence"
  );
});

test("optional transport provider questions become calls", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence: "The source has pickup time and location, but no provider.",
          guessedValue: null,
          prompt: "We created the rental car pickup without a company name.",
          reason:
            "The pickup details are enough for the traveler app; the company name can be added later if needed.",
          relatedTitle: "Rental car pickup",
          subjectType: "transport",
          targetField: "provider",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          date: "2019-01-17",
          departure: "Revolucni 1044/23",
          title: "Rental car pickup",
          type: "rental_car",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-rental-car-provider",
  });
  const notes = getStructuredReviewSections(records).find(
    (section) => section.id === "notes"
  );

  assert.equal(records.reviewQuestions[0]?.status, "noted");
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(notes?.count, 1);
});

test("optional train operator questions become calls", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence: "The source has train route and times, but no operator.",
          guessedValue: null,
          prompt: "We created the train without an operator.",
          reason:
            "The route and times are enough for the traveler app; the operator can be added later if needed.",
          relatedTitle: "Vienna to Budapest train",
          subjectType: "transport",
          targetField: "provider",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Budapest Keleti",
          date: "2019-01-21",
          departure: "Wien Hbf",
          title: "Vienna to Budapest train",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-train-provider",
  });

  assert.equal(records.reviewQuestions[0]?.status, "noted");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("duplicate open questions for the same record and field collapse", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-14",
          itemType: "activity",
          title: "Prague walking plan",
        },
      ],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The source context suggests this but does not lock it.",
          guessedValue: "2019-01-14",
          prompt: "Is Prague walking plan on January 14?",
          reason: "The date is not explicit.",
          relatedTitle: "Prague walking plan",
          subjectType: "item",
          targetField: "date",
        },
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The same source context suggests this date.",
          guessedValue: "2019-01-14",
          prompt: "Should Prague walking plan also be on January 14?",
          reason: "This is the same underlying date uncertainty.",
          relatedTitle: "Prague walking plan",
          subjectType: "item",
          targetField: "date",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-duplicate-question",
  });

  assert.equal(
    records.reviewQuestions.filter((question) => question.status === "open")
      .length,
    1
  );
  assert.equal(getStructuredReviewCount(records), 1);
});

test("structured review summary uses maker-facing counts", () => {
  const draft = {
    activities: [
      {
        date: "2026-09-02",
        itemType: "activity",
        title: "Museum visit",
      },
      {
        date: null,
        itemType: "activity",
        category: "food_dining",
        title: "Dinner TBD",
      },
    ],
    missingDetails: [
      {
        prompt: "Which day is Dinner TBD?",
        reason: "The traveler app needs a date to place the card.",
        relatedTitle: "Dinner TBD",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    stays: [
      {
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        name: "Left Bank Hotel",
      },
    ],
    transport: [
      {
        date: "2026-09-01",
        departure: "New York",
        arrival: "Paris",
        title: "Fly to Paris",
        type: "flight",
      },
    ],
    tripOverview: {
      title: "Paris test",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-2",
  });
  const reviewCount = getStructuredReviewCount(records);
  const summary = formatStructuredDiscoverySummary(records, reviewCount);
  const sections = getStructuredReviewSections(records);

  assert.equal(
    summary,
    "We found 1 leg across 3 days, including 1 transport item (1 flight), 1 stay, 2 activities (1 food and dining). We need you to confirm 2 things before this becomes the traveler app."
  );
  assert.equal(reviewCount, 2);
  assert.equal(sections.length, 7);
  assert.deepEqual(
    sections.map((section) => section.id),
    [
      "legs",
      "stays",
      "transport",
      "activities",
      "private-details",
      "notes",
      "questions",
    ]
  );
  assert.equal(sections.find((section) => section.id === "notes")?.count, 0);
});

test("high-confidence parser calls become notes instead of review questions", () => {
  const draft = {
    activities: [],
    missingDetails: [
      {
        answerType: "confirm",
        confidence: "high",
        evidence: "Outbound flight departs on January 12.",
        guessedValue: "Trip starts January 12",
        prompt: "This looks like the trip starts with the outbound flight on January 12. Is that right?",
        reason: "The outbound flight is the first dated trip event.",
        relatedTitle: null,
        subjectType: "trip",
        targetField: "dateRange",
      },
    ],
    places: [
      {
        arriveDate: "2019-01-12",
        city: "Rome",
        country: "Italy",
        leaveDate: "2019-01-15",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [
      {
        date: "2019-01-12",
        departure: "Washington, DC",
        arrival: "Rome",
        provider: "Delta",
        title: "Fly to Rome",
        type: "flight",
      },
    ],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-note",
  });
  const sections = getStructuredReviewSections(records);
  const notes = sections.find((section) => section.id === "notes");
  const questions = sections.find((section) => section.id === "questions");

  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(records.reviewQuestions[0]?.status, "noted");
  assert.equal(notes?.count, 1);
  assert.equal(questions?.count, 0);
  assert.match(notes?.summaryItems[0] ?? "", /outbound flight/i);
});

test("review decisions update structured records", () => {
  const draft = {
    activities: [
      {
        date: null,
        description: "Duplicate dinner note.",
        title: "Dinner TBD",
      },
      {
        date: "2026-09-02",
        description: "Dinner reservation.",
        title: "Dinner reservation",
      },
    ],
    missingDetails: [
      {
        prompt: "Which day is Dinner TBD?",
        reason: "The traveler app needs a date to place the card.",
        relatedTitle: "Dinner TBD",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    sensitiveDetails: [
      {
        detailType: "door_code",
        reason: "Door codes should stay behind traveler mode.",
        title: "Apartment access",
      },
    ],
    stays: [
      {
        address: "Private apartment address",
        checkIn: null,
        checkOut: "2026-09-03",
        name: "Paris apartment",
      },
    ],
    transport: [],
    tripOverview: {
      title: "Paris review",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-3",
  });
  const stay = records.stays[0];
  const detail = records.privateDetails.find(
    (item) => item.detailType === "door_code"
  );
  const sourceItem = records.items.find((item) => item.title === "Dinner TBD");
  const targetItem = records.items.find(
    (item) => item.title === "Dinner reservation"
  );
  const question = records.reviewQuestions[0];

  assert.ok(stay);
  assert.ok(detail);
  assert.ok(sourceItem);
  assert.ok(targetItem);
  assert.ok(question);

  const updated = applyReviewDecisions(records, [
    {
      action: "edit",
      changes: {
        checkInDate: "2026-09-01",
        reviewRequired: false,
        status: "confirmed",
      },
      createdAt: "2026-06-18T12:00:00.000Z",
      id: "decision-edit-stay",
      subjectId: stay.id,
      subjectType: "stay",
      tripId: "trip-3",
    },
    {
      action: "protect",
      createdAt: "2026-06-18T12:01:00.000Z",
      id: "decision-protect-detail",
      subjectId: detail.id,
      subjectType: "private_detail",
      tripId: "trip-3",
    },
    {
      action: "combine",
      createdAt: "2026-06-18T12:02:00.000Z",
      id: "decision-combine-dinner",
      mergedChanges: {
        description: "Dinner reservation with the duplicate note folded in.",
      },
      sourceIds: [sourceItem.id],
      subjectId: targetItem.id,
      subjectType: "item",
      targetId: targetItem.id,
      tripId: "trip-3",
    },
    {
      action: "answer_question",
      answerValue: "Use the dinner reservation on Sep 2.",
      createdAt: "2026-06-18T12:03:00.000Z",
      id: "decision-answer-question",
      resolvedAction: "combine",
      subjectId: question.id,
      subjectType: "review_question",
      tripId: "trip-3",
    },
  ]);

  const updatedStay = updated.stays.find((item) => item.id === stay.id);
  const updatedDetail = updated.privateDetails.find(
    (item) => item.id === detail.id
  );
  const updatedSourceItem = updated.items.find(
    (item) => item.id === sourceItem.id
  );
  const updatedTargetItem = updated.items.find(
    (item) => item.id === targetItem.id
  );
  const updatedQuestion = updated.reviewQuestions.find(
    (item) => item.id === question.id
  );

  assert.equal(updatedStay?.checkInDate, "2026-09-01");
  assert.equal(updatedStay?.reviewRequired, false);
  assert.equal(updatedStay?.status, "confirmed");
  assert.equal(updatedDetail?.visibility, "traveler_password");
  assert.equal(updatedDetail?.reviewRequired, false);
  assert.equal(updatedSourceItem?.status, "ignored");
  assert.equal(updatedSourceItem?.parentItemId, targetItem.id);
  assert.equal(updatedTargetItem?.status, "confirmed");
  assert.equal(
    updatedTargetItem?.description,
    "Dinner reservation with the duplicate note folded in."
  );
  assert.equal(updatedQuestion?.answerValue, "Use the dinner reservation on Sep 2.");
  assert.equal(updatedQuestion?.status, "answered");

  const deleted = applyReviewDecision(updated, {
    action: "delete",
    createdAt: "2026-06-18T12:04:00.000Z",
    id: "decision-delete-dinner",
    subjectId: targetItem.id,
    subjectType: "item",
    tripId: "trip-3",
  });

  assert.equal(
    deleted.items.find((item) => item.id === targetItem.id)?.status,
    "ignored"
  );
});

test("answering a targeted question updates the structured record", () => {
  const draft = {
    activities: [
      {
        category: "food_dining",
        date: null,
        description: "Dinner reservation listed under Sep 2 notes.",
        itemType: "activity",
        title: "Dinner at Septime",
      },
    ],
    missingDetails: [
      {
        answerType: "date",
        confidence: "medium",
        evidence: "The reservation appears in the Sep 2 section.",
        guessedValue: "2026-09-02",
        prompt: "This looks like dinner on September 2nd. Is that right?",
        reason: "The traveler app needs a date to place the dinner card.",
        relatedTitle: "Dinner at Septime",
        subjectType: "item",
        targetField: "date",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Paris question",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-targeted-question",
  });
  const dinner = records.items[0];
  const question = records.reviewQuestions[0];

  assert.ok(dinner);
  assert.ok(question);
  assert.equal(question.subjectId, dinner.id);
  assert.equal(question.targetField, "date");
  assert.equal(question.guessedValue, "2026-09-02");

  const updated = applyReviewDecision(records, {
    action: "answer_question",
    answerValue: "2026-09-02",
    createdAt: "2026-06-18T15:00:00.000Z",
    id: "decision-targeted-answer",
    resolvedAction: "edit",
    subjectId: question.id,
    subjectType: "review_question",
    tripId: "trip-targeted-question",
  });
  const updatedDinner = updated.items[0];
  const updatedQuestion = updated.reviewQuestions[0];

  assert.equal(updatedDinner?.date, "2026-09-02");
  assert.equal(updatedDinner?.reviewRequired, false);
  assert.equal(updatedDinner?.status, "confirmed");
  assert.equal(updatedQuestion?.answerValue, "2026-09-02");
  assert.equal(updatedQuestion?.status, "answered");
  assert.equal(getStructuredReviewCount(updated), 0);
});

test("review decisions serialize through the persistence payload contract", () => {
  const serialized = serializeTripReviewDecision({
    action: "combine",
    createdAt: null,
    id: "decision-1",
    mergedChanges: {
      description: "Merged dinner plan.",
      title: "Dinner reservation",
    },
    note: "Duplicate parser output.",
    sourceIds: ["item-2"],
    subjectId: "item-1",
    subjectType: "item",
    targetId: "item-1",
    tripId: "trip-4",
  });

  assert.deepEqual(serialized, {
    action: "combine",
    decision_key: "trip-4:item:item-1:combine",
    id: "decision-1",
    note: "Duplicate parser output.",
    payload_json: {
      mergedChanges: {
        description: "Merged dinner plan.",
        title: "Dinner reservation",
      },
      sourceIds: ["item-2"],
      targetId: "item-1",
    },
    subject_id: "item-1",
    subject_type: "item",
    trip_id: "trip-4",
  });

  const normalized = normalizeTripReviewDecisionRow({
    action: "combine",
    created_at: "2026-06-18T13:00:00.000Z",
    decision_key: serialized.decision_key,
    id: "decision-1",
    note: "Duplicate parser output.",
    payload_json: serialized.payload_json,
    subject_id: "item-1",
    subject_type: "item",
    trip_id: "trip-4",
  });

  assert.deepEqual(normalized, {
    action: "combine",
    createdAt: "2026-06-18T13:00:00.000Z",
    id: "decision-1",
    mergedChanges: {
      description: "Merged dinner plan.",
      title: "Dinner reservation",
    },
    note: "Duplicate parser output.",
    sourceIds: ["item-2"],
    subjectId: "item-1",
    subjectType: "item",
    targetId: "item-1",
    tripId: "trip-4",
  });
});

test("generated trip summary uses applied structured records", () => {
  const draft = {
    activities: [
      {
        date: "2026-09-02",
        title: "Museum visit",
      },
      {
        date: null,
        title: "Loose duplicate note",
      },
    ],
    missingDetails: [
      {
        prompt: "Where does the loose note belong?",
        reason: "The traveler app needs placement.",
        relatedTitle: "Loose duplicate note",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Paris summary",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-5",
  });
  const duplicate = records.items.find(
    (item) => item.title === "Loose duplicate note"
  );
  const keeper = records.items.find((item) => item.title === "Museum visit");
  const question = records.reviewQuestions[0];

  assert.ok(duplicate);
  assert.ok(keeper);
  assert.ok(question);

  const updated = applyReviewDecisions(records, [
    {
      action: "combine",
      createdAt: "2026-06-18T14:00:00.000Z",
      id: "decision-combine-summary",
      sourceIds: [duplicate.id],
      subjectId: keeper.id,
      subjectType: "item",
      targetId: keeper.id,
      tripId: "trip-5",
    },
    {
      action: "answer_question",
      answerValue: "Combined into Museum visit.",
      createdAt: "2026-06-18T14:01:00.000Z",
      id: "decision-answer-summary",
      resolvedAction: "combine",
      subjectId: question.id,
      subjectType: "review_question",
      tripId: "trip-5",
    },
  ]);
  const summary = createGeneratedTripSummaryView(updated);

  assert.equal(summary.title, "Paris summary");
  assert.equal(summary.counts.activities, 1);
  assert.equal(summary.counts.review, 0);
  assert.equal(summary.isReadyForPublishReview, true);
  assert.equal(summary.dateRange, "2026-09-01 to 2026-09-03");
});

test("published snapshot payload compiles traveler app view model", () => {
  const records = getAsiaDemoStructuredTripRecords();
  const payload = createPublishedTripSnapshotPayload(records);

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.createdFrom, "structured_trip_records");
  assert.equal(payload.travelerApp.trip.id, records.trip.id);
  assert.equal(payload.recordsSummary.cardCount, payload.travelerApp.cards.length);
  assert.equal(payload.recordsSummary.dayCount, payload.travelerApp.days.length);
  assert.equal(payload.recordsSummary.legCount, payload.travelerApp.legs.length);
  assert.equal(
    payload.recordsSummary.privateDetailCount,
    payload.travelerApp.privacy.privateDetailCount
  );
  assert.ok(payload.travelerApp.days.length > 80);
});

test("published snapshot payload redacts protected traveler details", () => {
  const records = getAsiaDemoStructuredTripRecords();
  const privateStay = records.stays.find(
    (stay) => stay.address && stay.addressVisibility !== "public"
  );

  assert.ok(privateStay);

  const payload = createPublishedTripSnapshotPayload(records);
  const redactedLeg = payload.travelerApp.legs.find(
    (leg) => leg.id === privateStay.legId
  );

  assert.equal(redactedLeg?.stayAddress, null);
  assert.equal(
    JSON.stringify(payload).includes(privateStay.address ?? ""),
    false
  );

  const privateDetails = createPublishedPrivateDetails(records);
  assert.ok(
    privateDetails.some((detail) => detail.value === privateStay.address),
    "expected server-only published private details to retain protected value"
  );
});

test("traveler password verification is explicit about missing configuration", () => {
  const passwordHash = hashTravelerPassword("traveler");

  assert.equal(
    verifyTravelerPassword({
      password: "traveler",
      passwordEnabled: true,
      passwordHash,
    }),
    "valid"
  );
  assert.equal(
    verifyTravelerPassword({
      password: "wrong",
      passwordEnabled: true,
      passwordHash,
    }),
    "invalid"
  );
  assert.equal(
    verifyTravelerPassword({
      password: "traveler",
      passwordEnabled: true,
      passwordHash: null,
    }),
    "missing_hash"
  );
  assert.equal(
    verifyTravelerPassword({
      password: "",
      passwordEnabled: false,
      passwordHash: null,
    }),
    "disabled"
  );
});

test("env allowlist parser trims empty values", () => {
  assert.deepEqual(parseOptionalEnvList(null), []);
  assert.deepEqual(parseOptionalEnvList(" trip-1,trip-2, , trip-3 "), [
    "trip-1",
    "trip-2",
    "trip-3",
  ]);
});
