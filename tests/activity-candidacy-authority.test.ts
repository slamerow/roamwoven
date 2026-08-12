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
    "",
    "Things to check out: Sample Synagogue",
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
          evidence: "Things to check out: Sample Synagogue",
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

  const genericVenueOverlap = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "two dated beach sections",
        source: "model_chunk",
        sourceFilename: "beach-plan.xlsx",
        sourceText: [
          "July 3 — Aquarium + Beach",
          "Afternoon at North Cove Beach Park III.",
          "",
          "July 5 — South Coast",
          "If closed, backups include South Bay Beach or Harbor Landing Park.",
        ].join("\n"),
        stage: {
          activities: [
            {
              category: "beach_water",
              city: "Sample Island",
              date: "2030-07-03",
              description: "Afternoon at North Cove Beach Park III.",
              evidence: "Afternoon at North Cove Beach Park III.",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              sourceSectionLabel: "July 3 — Aquarium + Beach",
              sourceSectionType: "dated_itinerary",
              title: "North Cove Beach Park III",
            },
            {
              category: "beach_water",
              city: "Sample Island",
              date: "2030-07-05",
              description:
                "If closed, backups include South Bay Beach or Harbor Landing Park.",
              evidence:
                "If closed, backups include South Bay Beach or Harbor Landing Park.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              sourceSectionLabel: "July 5 — South Coast",
              sourceSectionType: "dated_itinerary",
              title: "Backup beach idea: South Bay Beach",
            },
          ],
          missingDetails: [],
          places: [
            {
              arriveDate: "2030-07-01",
              city: "Sample Island",
              country: "Example",
              leaveDate: "2030-07-06",
            },
          ],
          sensitiveDetails: [],
          stays: [],
          transport: [],
        },
      },
    ],
    tripOverview: { dateRange: "July 1-6, 2030" },
  });
  assert.equal(
    genericVenueOverlap.pieces.filter(
      (piece) =>
        piece.outputEligible &&
        piece.kind === "activity" &&
        piece.payload.title === "North Cove Beach Park III"
    ).length,
    1,
    "a later backup note sharing only generic beach/park words cannot steal a planned venue"
  );

  const exactOccurrenceBeatsSummaryContext = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "broad summary lane",
        source: "model_chunk",
        sourceFilename: "memorial-plan.pdf",
        sourceText: [
          "Tuesday, April 15th",
          "If you want a break, stop at Riverside Cafe.",
          "River Memorial",
        ].join("\n"),
        stage: {
          activities: [
            {
              category: "food_dining",
              city: "Sample City",
              date: "2030-04-15",
              description: "If you want a break, stop at Riverside Cafe.",
              evidence: "If you want a break, stop at Riverside Cafe.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              sourceSectionLabel: "Tuesday, April 15th",
              sourceSectionType: "dated_itinerary",
              title: "Optional cafe break",
              _canonicalSourcePosition: {
                line: 2,
                sourceIdentityHash: "memorial-source",
                stageIndex: 0,
              },
            },
            {
              category: "art_culture",
              city: "Sample City",
              date: "2030-04-15",
              description: "See River Memorial.",
              evidence: "River Memorial",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              sourceSectionLabel: "Tuesday, April 15th",
              sourceSectionType: "dated_itinerary",
              title: "River Memorial",
              _canonicalSourceOccurrences: [
                {
                  date: "2030-04-15",
                  line: 3,
                  sequencedDay: true,
                  sourceIdentityHash: "memorial-source",
                  stageIndex: 1,
                },
              ],
              _canonicalSourcePosition: {
                line: 3,
                sourceIdentityHash: "memorial-source",
                stageIndex: 0,
              },
            },
          ],
          missingDetails: [],
          places: [],
          sensitiveDetails: [],
          stays: [],
          transport: [],
        },
      },
      {
        label: "exact day lane",
        source: "model_chunk",
        sourceFilename: "memorial-plan.pdf",
        sourceText: [
          "Tuesday, April 15th",
          "",
          "River Memorial",
          "",
          "Walk along the river to River Memorial.",
        ].join("\n"),
        stage: {
          activities: [
            {
              category: "art_culture",
              city: "Sample City",
              date: "2030-04-15",
              description: "Walk along the river to River Memorial.",
              evidence: "River Memorial",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              sourceSectionLabel: "Tuesday, April 15th",
              sourceSectionType: "dated_itinerary",
              title: "River Memorial",
              _canonicalSourceOccurrences: [
                {
                  date: "2030-04-15",
                  line: 3,
                  sequencedDay: true,
                  sourceIdentityHash: "memorial-source",
                  stageIndex: 1,
                },
              ],
              _canonicalSourcePosition: {
                line: 3,
                sourceIdentityHash: "memorial-source",
                stageIndex: 1,
              },
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
    tripOverview: { dateRange: "April 15, 2030" },
  });
  assert.equal(
    exactOccurrenceBeatsSummaryContext.pieces.filter(
      (piece) =>
        piece.outputEligible &&
        piece.kind === "activity" &&
        piece.payload.title === "River Memorial"
    ).length,
    1,
    "an optional note beside a broad summary copy cannot retype the exact source occurrence"
  );

  const recoveryProviderLabel = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "source recovery",
        source: "model_chunk",
        sourceFilename: "ticket.pdf",
        sourceText: [
          "Friday, April 18th — Friday, April 18th",
          "TRAVELPORT",
          "Passenger and Ticket Details",
          "Total: 32.00",
        ].join("\n"),
        stage: {
          activities: [
            {
              category: "arrival_departure",
              city: "Sample City",
              date: "2030-04-18",
              description: "TRAVELPORT",
              evidence: "TRAVELPORT",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              sourceHeadingPath: ["Friday, April 18th"],
              sourceSectionType: "booking_detail",
              title: "TRAVELPORT",
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
    tripOverview: { dateRange: "April 18, 2030" },
  });
  assert.equal(
    recoveryProviderLabel.pieces.filter(
      (piece) =>
        piece.outputEligible &&
        piece.kind === "activity" &&
        piece.payload.title === "TRAVELPORT"
    ).length,
    0,
    "a lone provider label recovered from a booking receipt is evidence, not a traveler action"
  );

  const exactDatedRelationship = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "Monday, April 14th",
        source: "model_chunk",
        sourceFilename: "day-plan.pdf",
        sourceText: [
          "Monday, April 14th",
          "",
          "Fly to Sample City",
          "",
          "Lodging: Central Apartment",
          "",
          "North Arcade near Main Square (10 min walk from apartment)",
        ].join("\n"),
        stage: {
          activities: [
            {
              category: "art_culture",
              city: "Sample City",
              date: "2030-04-14",
              description: "Visit North Arcade near Main Square.",
              evidence:
                "North Arcade near Main Square (10 min walk from apartment)",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              sourceSectionLabel: "Monday, April 14th",
              sourceSectionType: "dated_itinerary",
              title: "North Arcade",
              _canonicalSourceOccurrences: [
                {
                  date: "2030-04-14",
                  line: 7,
                  sequencedDay: true,
                  sourceIdentityHash: "arcade-source",
                  stageIndex: 0,
                },
              ],
              _canonicalSourcePosition: {
                line: 7,
                relationshipSignal: true,
                sourceIdentityHash: "arcade-source",
                stageIndex: 0,
              },
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
    tripOverview: { dateRange: "April 14, 2030" },
  });
  assert.equal(
    exactDatedRelationship.pieces.filter(
      (piece) =>
        piece.outputEligible &&
        piece.kind === "activity" &&
        piece.payload.title === "North Arcade"
    ).length,
    1,
    "an exact dated source relationship is plan evidence even while the new authority stays shadow-only"
  );
}
