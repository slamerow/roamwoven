import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { createCanonicalizationSummary } from "@/lib/extraction/trip-extraction-audit-snapshot";

function stage(): EvidenceStageInput {
  const sourceText = [
    "Saturday, April 12th",
    "Explore Sample City",
    "Check in and walk to North Gallery",
    "North Gallery",
    "Laundry",
    "City guidance",
    "Sample Synagogue",
    "Go to Watch Workshop and maybe Optional Museum.",
  ].join("\n");
  return {
    label: "sanitized dated plan and reference block",
    source: "model_chunk",
    sourceFilename: "sanitized-production-shape.txt",
    sourceText,
    stage: {
      activities: [
        {
          category: "art_culture",
          city: "Sample City",
          date: "2030-04-12",
          description: "Day overview.",
          evidence: "Explore Sample City",
          evidenceRole: "grouping_proposal",
          itemType: "activity",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "Explore Sample City",
        },
        {
          category: "arrival_departure",
          city: "Sample City",
          date: "2030-04-12",
          description: "Check in and walk to North Gallery.",
          evidence: "Check in and walk to North Gallery",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "Check in and walk to North Gallery",
        },
        {
          category: "art_culture",
          city: "Sample City",
          date: "2030-04-12",
          description: "North Gallery.",
          evidence: "North Gallery",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "North Gallery",
        },
        {
          category: "admin_logistics",
          city: "Sample City",
          date: "2030-04-12",
          description: "Laundry.",
          evidence: "Laundry",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "Laundry",
        },
        {
          category: "local_tips",
          city: "Sample City",
          date: "2030-04-12",
          description: "City guidance.",
          evidence: "City guidance",
          evidenceRole: "city_note_candidate",
          itemType: "note",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "City guidance",
        },
        {
          category: "temple_shrine",
          city: "Sample City",
          date: "2030-04-12",
          description: "Sample Synagogue.",
          evidence: "Sample Synagogue",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "Sample Synagogue",
        },
        {
          category: "local_tips",
          city: "Sample City",
          date: "2030-04-12",
          description: "One selected stop and one optional reference.",
          evidence: "Go to Watch Workshop and maybe Optional Museum.",
          evidenceRole: "city_note_candidate",
          itemType: "note",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "Evening note",
        },
        {
          category: "admin_logistics",
          city: "Sample City",
          date: "2030-04-12",
          description: "Return at the same location.",
          evidence: "Return at the same location",
          evidenceRole: "atomic_candidate",
          itemType: "admin",
          sourceSectionLabel: "Saturday, April 12th",
          sourceSectionType: "dated_itinerary",
          title: "Return",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2030-04-11",
          city: "Sample City",
          country: "Example",
          leaveDate: "2030-04-13",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

export default function run() {
  const result = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [stage()],
    tripOverview: {
      dateRange: "April 11-13, 2030",
      title: "Sanitized role fixture",
    },
  });
  const decisions = result.summary.activityCandidacyDecisions;
  const forTitle = (title: string) =>
    decisions.filter((decision) => decision.observationTitle === title);

  assert.ok(
    forTitle("Explore Sample City").every(
      (decision) => decision.destination === "context"
    )
  );
  assert.ok(
    forTitle("Laundry").some(
      (decision) => decision.destination === "activity"
    )
  );
  assert.ok(
    forTitle("Sample Synagogue").some(
      (decision) => decision.destination === "city_note"
    )
  );
  assert.ok(
    forTitle("Watch Workshop").some(
      (decision) =>
        decision.destination === "activity" &&
        decision.reasonCode === "AUDITED_COMMITMENT"
    ),
    JSON.stringify(
      decisions.filter((decision) =>
        /watch|optional|evening/i.test(decision.observationTitle ?? "")
      )
    )
  );
  assert.ok(
    forTitle("Optional Museum").some(
      (decision) => decision.destination === "city_note"
    )
  );
  assert.ok(
    forTitle("Return").every(
      (decision) => decision.destination === "accessory"
    )
  );

  const finalActivities = result.pieces
    .filter(
      (piece) => piece.outputEligible && piece.kind === "activity"
    )
    .map((piece) => piece.payload.title);
  assert.ok(finalActivities.includes("Laundry"));
  assert.ok(!finalActivities.includes("Sample Synagogue"));
  assert.ok(!finalActivities.includes("Optional Museum"));
  assert.ok(!finalActivities.includes("Return"));

  const served = createCanonicalizationSummary({
    openai: { evidence: result.summary },
  });
  assert.equal(
    served.activityCandidacyDecisions.length,
    decisions.length,
    "served telemetry proves every candidacy decision"
  );
  assert.ok(
    served.activityCandidacyDecisions.every(
      (decision) =>
        decision.decisionId &&
        decision.observationId &&
        Array.isArray(decision.canonicalPieceIds)
      )
  );

  const broadOrEvidence = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "sanitized reference list",
        source: "model_chunk",
        sourceText: [
          "Saturday, April 12th",
          "Food ideas",
          "Eat nearby or buy a local bottle",
        ].join("\n"),
        stage: {
          activities: [
            {
              category: "food_dining",
              date: "2030-04-12",
              description: "Food ideas.",
              evidence: "Food ideas",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              sourceSectionLabel: "Saturday, April 12th",
              sourceSectionType: "dated_itinerary",
              title: "Eat nearby",
            },
            {
              category: "food_dining",
              date: "2030-04-12",
              description: "Eat nearby or buy a local bottle.",
              evidence: "Eat nearby or buy a local bottle",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              sourceSectionLabel: "Saturday, April 12th",
              sourceSectionType: "dated_itinerary",
              title: "Buy a local bottle",
            },
          ],
          missingDetails: [],
          places: [],
          sensitiveDetails: [],
          stays: [],
          transport: [],
        },
      },
    ],
    tripOverview: { dateRange: "April 11-13, 2030" },
  });
  assert.ok(
    broadOrEvidence.summary.activityCandidacyDecisions.some(
      (decision) =>
        decision.observationTitle === "Buy a local bottle" &&
        decision.destination === "city_note"
    ),
    "an unrelated or in broad evidence cannot promote a loose recommendation"
  );
}
