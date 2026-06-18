import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import {
  formatStructuredDiscoverySummary,
  getStructuredReviewCount,
  getStructuredReviewSections,
} from "@/lib/generated-trip-review";
import {
  createTravelerAppViewModel,
  getAsiaDemoStructuredTripRecords,
  getAsiaDemoTravelerAppViewModel,
} from "@/lib/traveler-view-model";

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
        date: null,
        description: "A flexible cafe stop.",
        endTime: null,
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

test("structured review summary uses maker-facing counts", () => {
  const draft = {
    activities: [
      {
        date: "2026-09-02",
        title: "Museum visit",
      },
      {
        date: null,
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
    "We found 1 leg across 2 days, including 1 flight, 1 stay, 2 activities. We need you to confirm 2 things before this becomes the traveler app."
  );
  assert.equal(reviewCount, 2);
  assert.equal(sections.length, 6);
  assert.deepEqual(
    sections.map((section) => section.id),
    ["places", "stays", "transport", "cards", "private-details", "questions"]
  );
});
