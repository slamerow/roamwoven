import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import type {
  StructuredTripRecords,
  TripStayRecord,
} from "@/lib/generated-trip-model";

// Arc F.2 C3 — run 7.24.1 chain B, fixture assertion 3. The 6th stay
// "Visitacity itinerary by day 3" (a source-document artifact title with a
// FULL night range and confirmationLabel #VPA9111671) is quoted verbatim
// from the run's QA bundle: night-evidence candidacy PASSED it, so the
// venue-shape test now judges the NAME regardless of dates. Same-leg
// full-overlap stays additionally raise a quiet P2 (never a hard warning —
// CEO decision 3, F.2 session).

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

function stage(label: string, value: Record<string, unknown>): EvidenceStageInput {
  return { label, source: "model_chunk", stage: value };
}

function emptyStage(overrides: Record<string, unknown> = {}) {
  return {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    ...overrides,
  };
}

const PLACES = [
  { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
  { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
];

type Draft = {
  stays: Array<Record<string, unknown>>;
};

const STAY_RECORD_BASE: TripStayRecord = {
  accessDetailsVisibility: "traveler_password",
  address: null,
  addressVisibility: "traveler_password",
  bookingUrl: null,
  canonicalId: "canonical-stay-a",
  checkInDate: "2019-01-18",
  checkInTime: null,
  checkOutDate: "2019-01-21",
  checkOutTime: null,
  confirmationLabel: null,
  confirmationVisibility: "traveler_password",
  id: "stay-a",
  latitude: null,
  legId: "leg-vienna",
  longitude: null,
  name: "Wombats City Hostel Vienna",
  privateDetailIds: [],
  publicLocationLabel: null,
  reviewRequired: false,
  sourceConfidence: "high",
  status: "confirmed",
  stayType: "hostel",
  tripId: "trip-venue-shape",
};

const RECORDS_BASE: StructuredTripRecords = {
  categories: [],
  days: [],
  items: [],
  legs: [],
  photos: [],
  phrases: [],
  privateDetails: [],
  reviewQuestions: [],
  stays: [],
  transport: [],
  trip: {
    destinationSummary: null,
    endDate: null,
    id: "trip-venue-shape",
    name: "Venue shape",
    startDate: null,
    travelerAppTitle: "Venue shape",
  },
  weatherHooks: [],
};

export default async function run() {
  test("chain B: the dated document-artifact stay fails candidacy with a disposition; real stays pass", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Vienna itinerary",
          emptyStage({
            places: PLACES,
            stays: [
              {
                address: null,
                checkIn: "2019-01-18",
                checkOut: "2019-01-21",
                city: "Vienna",
                name: "Wombats City Hostel Vienna - The Lounge",
              },
              {
                address: null,
                checkIn: "2019-01-14",
                checkOut: "2019-01-18",
                city: "Prague",
                name: "Prague Airbnb",
              },
              {
                // The live 7.24.1 shape verbatim: full night range, a
                // confirmation label, and a document-artifact title.
                address: null,
                checkIn: "2019-01-18",
                checkOut: "2019-01-21",
                city: "Vienna",
                confirmationLabel: "#VPA9111671",
                name: "Visitacity itinerary by day 3",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.stays.some((stay) => /visitacity|itinerary/i.test(`${stay.name ?? ""}`)),
      false,
      "the document-artifact stay does not ship despite its full night range"
    );
    assert.equal(
      draft.stays.some((stay) => /wombats/i.test(`${stay.name ?? ""}`)),
      true,
      "Wombats 'The Lounge' passes the venue-shape test"
    );
    assert.equal(
      draft.stays.some((stay) => /prague airbnb/i.test(`${stay.name ?? ""}`)),
      true,
      "the Prague Airbnb passes the venue-shape test"
    );
    const suppressed = result.pieces.find(
      (piece) =>
        piece.kind === "stay" &&
        !piece.outputEligible &&
        /visitacity/i.test(`${piece.payload.name ?? ""}`)
    );
    assert.ok(suppressed, "the artifact stay is suppressed, not silently dropped");
    assert.equal(
      suppressed?.actions.some((action) =>
        /document-artifact-shaped name .* booking material/.test(action.reason)
      ),
      true,
      "the suppression carries the auditable booking-material disposition"
    );
  });

  test("filename-shaped and by-day stay names fail candidacy; ordinary venue names never match", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Vienna itinerary",
          emptyStage({
            places: PLACES,
            stays: [
              { address: null, checkIn: "2019-01-18", checkOut: "2019-01-19", city: "Vienna", name: "Roamwoven itinerary (Czech).pdf" },
              { address: null, checkIn: "2019-01-19", checkOut: "2019-01-20", city: "Vienna", name: "Trip plan by day 2" },
              { address: null, checkIn: "2019-01-20", checkOut: "2019-01-21", city: "Vienna", name: "Hotel Daniel Vienna" },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.stays.length,
      1,
      "only the real hotel survives"
    );
    assert.match(`${draft.stays[0]?.name ?? ""}`, /Hotel Daniel/);
  });

  test("same-leg overlapping stays raise the quiet P2; sequential stays do not", () => {
    const overlapping: StructuredTripRecords = {
      ...RECORDS_BASE,
      stays: [
        STAY_RECORD_BASE,
        {
          ...STAY_RECORD_BASE,
          canonicalId: "canonical-stay-b",
          id: "stay-b",
          name: "Second Vienna Room",
        },
      ],
    };
    const diagnostics = createAuditDiagnostics({
      lineage: [],
      records: overlapping,
    });
    const overlap = diagnostics.find(
      (diagnostic) => diagnostic.code === "same_leg_stay_night_overlap"
    );
    assert.ok(overlap, "full-range same-leg overlap raises the diagnostic");
    assert.equal(overlap?.severity, "p2", "the signal is a quiet P2, never a hard warning");

    const sequential = createAuditDiagnostics({
      lineage: [],
      records: {
        ...RECORDS_BASE,
        stays: [
          STAY_RECORD_BASE,
          {
            ...STAY_RECORD_BASE,
            canonicalId: "canonical-stay-c",
            checkInDate: "2019-01-21",
            checkOutDate: "2019-01-24",
            id: "stay-c",
            name: "Next Vienna Room",
          },
        ],
      },
    });
    assert.equal(
      sequential.some(
        (diagnostic) => diagnostic.code === "same_leg_stay_night_overlap"
      ),
      false,
      "back-to-back stays (checkout == next check-in) are normal sequence"
    );
  });
}
