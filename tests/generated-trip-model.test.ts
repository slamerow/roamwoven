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
import { createPublishedTripSnapshotPayload } from "@/lib/published-snapshots";
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
        itemType: "restaurant",
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
  assert.equal(records.items[1]?.itemType, "restaurant");
  assert.ok(
    records.categories.some((category) => category.categoryKey === "restaurant"),
    "expected restaurant cards to get their own category"
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
        itemType: "restaurant",
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
    "We found 1 leg across 2 days, including 1 transport item (1 flight), 1 stay, 1 restaurant, 1 activity. We need you to confirm 2 things before this becomes the traveler app."
  );
  assert.equal(reviewCount, 2);
  assert.equal(sections.length, 6);
  assert.deepEqual(
    sections.map((section) => section.id),
    ["places", "stays", "transport", "cards", "private-details", "questions"]
  );
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
  assert.equal(summary.dateRange, "2026-09-01 to 2026-09-02");
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

test("env allowlist parser trims empty values", () => {
  assert.deepEqual(parseOptionalEnvList(null), []);
  assert.deepEqual(parseOptionalEnvList(" trip-1,trip-2, , trip-3 "), [
    "trip-1",
    "trip-2",
    "trip-3",
  ]);
});
