import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";

export type HeterogeneousAssemblyFixture = {
  filename: string;
  name: "booking_heavy" | "freeform" | "recommendation_heavy" | "spreadsheet_like";
  sourceUploadId: string;
  stage: Record<string, unknown>;
  text: string;
  tripOverview: Record<string, unknown>;
};

function completeStage(value: Record<string, unknown>) {
  return {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    ...value,
  };
}

export const HETEROGENEOUS_ASSEMBLY_FIXTURES: HeterogeneousAssemblyFixture[] = [
  {
    filename: "booking-shaped.txt",
    name: "booking_heavy",
    sourceUploadId: "shape-booking",
    text: [
      "Monday, April 7th",
      "Sample Harbor",
      "Hotel Example",
      "Rail transfer 08:10",
      "Reservation ZX91-QP77",
      "Door code 4412",
    ].join("\n"),
    tripOverview: {
      dateRange: "April 7-9, 2036",
      destinationSummary: "Sample Harbor",
      title: "Booking-shaped trip",
    },
    stage: completeStage({
      places: [
        {
          arriveDate: "2036-04-07",
          city: "Sample Harbor",
          country: "Exampleland",
          evidence: "Sample Harbor",
          leaveDate: "2036-04-09",
          title: "Sample Harbor",
        },
      ],
      sensitiveDetails: [
        {
          detailType: "access_code",
          evidence: "Door code 4412",
          reason: "Private access material.",
          title: "Door code 4412",
        },
      ],
      stays: [
        {
          checkIn: "2036-04-07",
          checkOut: "2036-04-09",
          city: "Sample Harbor",
          confirmation: "ZX91-QP77",
          evidence: "Hotel Example",
          name: "Hotel Example",
        },
      ],
      transport: [
        {
          arrival: "Sample Harbor",
          arrivalTime: "09:20",
          confirmation: "ZX91-QP77",
          date: "2036-04-07",
          departure: "Central Station",
          departureTime: "08:10",
          evidence: "Rail transfer 08:10",
          routeLabel: "Rail transfer",
          title: "Rail transfer",
          type: "train",
        },
      ],
    }),
  },
  {
    filename: "recommendations-shaped.txt",
    name: "recommendation_heavy",
    sourceUploadId: "shape-recommendations",
    text: [
      "Tuesday, April 8th",
      "Sample City",
      "Maybe visit the design museum",
      "Booked design tour at 14:00",
    ].join("\n"),
    tripOverview: {
      dateRange: "April 8-10, 2036",
      destinationSummary: "Sample City",
      title: "Recommendation-shaped trip",
    },
    stage: completeStage({
      activities: [
        {
          category: "art_culture",
          city: "Sample City",
          date: "2036-04-08",
          evidence: "Maybe visit the design museum",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          title: "Design Museum",
        },
        {
          category: "art_culture",
          city: "Sample City",
          date: "2036-04-08",
          evidence: "Booked design tour at 14:00",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          startTime: "14:00",
          title: "Design Tour",
        },
      ],
      places: [
        {
          arriveDate: "2036-04-08",
          city: "Sample City",
          country: "Exampleland",
          evidence: "Sample City",
          leaveDate: "2036-04-10",
          title: "Sample City",
        },
      ],
    }),
  },
  {
    filename: "spreadsheet-shaped.csv",
    name: "spreadsheet_like",
    sourceUploadId: "shape-spreadsheet",
    text: [
      "Wednesday, April 9th",
      "Sample City",
      "Gallery Row,09:00,visit",
      "Thursday, April 10th",
      "Gallery Row,15:00,visit",
    ].join("\n"),
    tripOverview: {
      dateRange: "April 9-11, 2036",
      destinationSummary: "Sample City",
      title: "Spreadsheet-shaped trip",
    },
    stage: completeStage({
      activities: [
        {
          category: "art_culture",
          city: "Sample City",
          date: "2036-04-09",
          evidence: "Gallery Row,09:00,visit",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Wednesday, April 9th",
          startTime: "09:00",
          title: "Gallery Row",
        },
        {
          category: "art_culture",
          city: "Sample City",
          date: "2036-04-10",
          evidence: "Gallery Row,15:00,visit",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Thursday, April 10th",
          startTime: "15:00",
          title: "Gallery Row",
        },
      ],
      places: [
        {
          arriveDate: "2036-04-09",
          city: "Sample City",
          country: "Exampleland",
          evidence: "Sample City",
          leaveDate: "2036-04-11",
          title: "Sample City",
        },
      ],
    }),
  },
  {
    filename: "freeform-shaped.txt",
    name: "freeform",
    sourceUploadId: "shape-freeform",
    text: [
      "Thursday, April 10th",
      "Sample Hills",
      "Hill route connects the Clock Tower with the River Arch",
      "Clock Tower",
      "River Arch",
      "Maybe visit Old Observatory if weather is clear",
      "Budget: $120",
    ].join("\n"),
    tripOverview: {
      dateRange: "April 10-12, 2036",
      destinationSummary: "Sample Hills",
      title: "Freeform-shaped trip",
    },
    stage: completeStage({
      activities: [
        {
          category: "sightseeing",
          city: "Sample Hills",
          date: "2036-04-10",
          description: "Clock Tower and River Arch",
          evidence: "Hill route connects the Clock Tower with the River Arch",
          evidenceRole: "grouping_proposal",
          itemType: "activity",
          title: "Hill route",
        },
        {
          category: "sightseeing",
          city: "Sample Hills",
          date: "2036-04-10",
          description: "We will visit Clock Tower at 10:00.",
          evidence: "Clock Tower",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          startTime: "10:00",
          title: "Clock Tower",
        },
        {
          category: "sightseeing",
          city: "Sample Hills",
          date: "2036-04-10",
          description: "We will visit River Arch.",
          evidence: "River Arch",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          title: "River Arch",
        },
        {
          category: "sightseeing",
          city: "Sample Hills",
          date: "2036-04-10",
          evidence: "Maybe visit Old Observatory if weather is clear",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          title: "Old Observatory",
        },
      ],
      places: [
        {
          arriveDate: "2036-04-10",
          city: "Sample Hills",
          country: "Exampleland",
          evidence: "Sample Hills",
          leaveDate: "2036-04-12",
          title: "Sample Hills",
        },
      ],
    }),
  },
];

export function evidenceStageForFixture(
  fixture: HeterogeneousAssemblyFixture,
  sourceSpanIds: string[]
): EvidenceStageInput {
  return {
    label: fixture.filename,
    source: "model_chunk",
    sourceFilename: fixture.filename,
    sourceProvenance: "sanitized_test",
    sourceSpanIds,
    sourceText: fixture.text,
    sourceUploadId: fixture.sourceUploadId,
    stage: {
      ...fixture.stage,
      tripOverview: fixture.tripOverview,
    },
  };
}
