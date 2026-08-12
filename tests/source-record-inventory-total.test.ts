import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type CanonicalEvidencePiece,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function stage(value: Record<string, unknown>): EvidenceStageInput {
  return {
    label: "source-record inventory fixture",
    source: "model_chunk",
    sourceText: [
      "Saturday, April 12th",
      "Laundry",
      "Sample Kitchen, Sample Bistro (quick/cheap)",
      "Pick up rental car at 9:00 AM.",
      "Selected car: compact automatic. Fuel type: petrol.",
      "30-minute walk, approximately 2.5 km",
    ].join("\n"),
    stage: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      ...value,
    },
  };
}

function activities(result: { draft: unknown }) {
  return ((result.draft as Record<string, unknown>).activities ?? []) as Array<
    Record<string, unknown>
  >;
}

function stays(result: { draft: unknown }) {
  return ((result.draft as Record<string, unknown>).stays ?? []) as Array<
    Record<string, unknown>
  >;
}

function genericNoOwnerActions(pieces: CanonicalEvidencePiece[]) {
  return pieces.flatMap((piece) =>
    piece.actions.filter((action) =>
      /no unique canonical owner/i.test(action.reason)
    )
  );
}

export default async function run() {
  await test("Loop 2: a source-supported standalone activity remains visible provisionally", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          activities: [
            {
              category: "admin_logistics",
              description: "Laundry.",
              evidence: "Laundry",
              evidenceRole: "accessory_detail",
              itemType: "activity",
              sourceHeadingPath: ["Saturday, April 12th"],
              sourceSectionType: "dated_itinerary",
              title: "Laundry",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    const laundry = activities(result).filter(
      (item) => item.title === "Laundry"
    );
    assert.equal(laundry.length, 1);
    assert.equal(laundry[0].date, "2030-04-12");
    assert.equal(genericNoOwnerActions(result.pieces).length, 0);
  });

  await test("Loop 2: an unowned non-entity fragment receives a specific exclusion instead of a vague rejection", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          activities: [
            {
              category: "admin_logistics",
              description: "30-minute walk, approximately 2.5 km",
              evidence: "30-minute walk, approximately 2.5 km",
              evidenceRole: "accessory_detail",
              itemType: "note",
              sourceSectionType: "dated_itinerary",
              title: "30-minute walk",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    assert.equal(activities(result).length, 0);
    assert.ok(
      result.pieces.some(
        (piece) =>
          piece.payload.title === "30-minute walk" &&
          piece.disposition?.kind === "terminal" &&
          piece.disposition.code === "ISOLATED_TERM_NO_SOURCE_SUPPORT"
      )
    );
    assert.equal(genericNoOwnerActions(result.pieces).length, 0);
  });

  await test("Loop 2: a rental booking detail routes to its proven pickup record without becoming a second card", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          activities: [
            {
              category: "arrival_departure",
              city: "Sample City",
              date: "2030-04-12",
              description: "Pick up rental car at 9:00 AM.",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              startTime: "09:00",
              title: "Pick up rental car",
            },
            {
              category: "admin_logistics",
              city: "Sample City",
              description: "Selected car: compact automatic. Fuel type: petrol.",
              evidence: "Selected car: compact automatic. Fuel type: petrol.",
              evidenceRole: "accessory_detail",
              itemType: "admin",
              sourceHeadingPath: ["Saturday, April 12th"],
              sourceSectionType: "booking_detail",
              title: "Selected car",
            },
            {
              category: "arrival_departure",
              city: "Sample City",
              date: "2030-04-12",
              description: "Rental pickup reservation.",
              evidenceRole: "accessory_detail",
              itemType: "activity",
              startTime: "09:00",
              title: "Car pickup",
            },
          ],
          places: [
            {
              arriveDate: "2030-04-11",
              city: "Sample City",
              country: "Example",
              leaveDate: "2030-04-13",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    const pickup = activities(result).filter((item) =>
      /pick up rental car/i.test(String(item.title))
    );
    assert.equal(pickup.length, 1);
    assert.equal(
      activities(result).some((item) =>
        /selected car/i.test(String(item.title))
      ),
      false
    );
    assert.doesNotMatch(
      String(pickup[0].description),
      /selected car|fuel type/i,
      "receipt fields keep source lineage without bloating the public pickup card"
    );
    const selectedCar = result.pieces.find(
      (piece) => piece.payload.title === "Selected car"
    );
    assert.equal(selectedCar?.disposition?.kind, "survivor");
    const selectedCarOwnerId =
      selectedCar?.disposition?.kind === "survivor"
        ? selectedCar.disposition.survivorId
        : null;
    assert.ok(
      selectedCarOwnerId &&
        result.pieces.some((piece) => piece.id === selectedCarOwnerId),
      "the owner pointer must resolve after legacy attachments stabilize its id"
    );
    const pieceIds = new Set(result.pieces.map((piece) => piece.id));
    assert.deepEqual(
      result.pieces.filter(
        (piece) =>
          piece.role === "accessory_detail" &&
          piece.disposition?.kind === "survivor" &&
          !pieceIds.has(piece.disposition.survivorId)
      ),
      [],
      "every accessory survivor pointer must resolve to its final owner"
    );
    assert.equal(genericNoOwnerActions(result.pieces).length, 0);
  });

  await test("Loop 2: a proven same-title detail attaches to its activity instead of duplicating", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          activities: [
            {
              category: "food_dining",
              city: "Sample City",
              date: "2030-04-12",
              description: "Lunch reservation.",
              evidenceRole: "atomic_candidate",
              itemType: "activity",
              startTime: "13:00",
              title: "Sample Restaurant",
            },
            {
              category: "food_dining",
              city: "Sample City",
              date: "2030-04-12",
              description: "Three-course menu with two drinks.",
              evidenceRole: "accessory_detail",
              itemType: "activity",
              title: "Sample Restaurant",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    const restaurants = activities(result).filter(
      (item) => item.title === "Sample Restaurant"
    );
    assert.equal(restaurants.length, 1);
    assert.match(String(restaurants[0].description), /three-course menu/i);
  });

  await test("Loop 2: unsupported receipt prose cannot attach by a coincidental time", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          activities: [
            {
              category: "tours_tickets",
              city: "Sample City",
              date: "2030-04-12",
              description: "Dawn canal tour.",
              itemType: "activity",
              startTime: "05:30",
              title: "Dawn canal tour",
            },
            {
              _sourceSupport: "unsupported",
              category: "arrival_departure",
              city: "Sample City",
              date: "2030-04-12",
              description: "Unrelated balloon receipt: 2 adults.",
              evidenceRole: "accessory_detail",
              itemType: "activity",
              startTime: "05:30",
              title: "Balloon receipt",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    const tour = activities(result).find((item) => item.title === "Dawn canal tour");
    assert.doesNotMatch(String(tour?.description), /balloon receipt/i);
  });

  await test("Loop 2: a broad slash-separated day summary does not duplicate its real plans", () => {
    const summaryStage = stage({
      activities: [
        {
          category: "nature_outdoors",
          city: "Sample City",
          date: "2030-04-12",
          description: "Sunrise / Art Museums / Bird Sanctuary / Ballet",
          itemType: "activity",
          title: "Sunrise / Art Museums / Bird Sanctuary / Ballet",
        },
        {
          category: "tours_tickets",
          city: "Sample City",
          date: "2030-04-12",
          description: "Sunrise canal tour.",
          itemType: "activity",
          startTime: "05:30",
          title: "Sunrise canal tour",
        },
        {
          category: "art_culture",
          city: "Sample City",
          date: "2030-04-12",
          description: "Visit the modern art museum.",
          itemType: "activity",
          startTime: "14:00",
          title: "Modern Art Museum",
        },
      ],
    });
    summaryStage.sourceText = [
      "Saturday, April 12th",
      "Sunrise / Art Museums / Bird Sanctuary / Ballet",
      "5:30 AM Sunrise canal tour",
      "2:00 PM Modern Art Museum",
    ].join("\n");
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [summaryStage],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    assert.equal(
      activities(result).some((item) =>
        String(item.title).includes("Bird Sanctuary / Ballet")
      ),
      false
    );
    assert.equal(
      activities(result).some((item) => item.title === "Sunrise canal tour"),
      true
    );
    assert.equal(
      activities(result).some((item) => item.title === "Modern Art Museum"),
      true
    );
  });

  await test("Loop 2: an exact private access twin follows the uniquely proven stay home", () => {
    const privateProse =
      "Arrival directions: collect the key from the locked box by the entrance.";
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          activities: ["Prague", "Rome"].map((city) => ({
            category: "admin_logistics",
            city,
            description: privateProse,
            evidence: privateProse,
            evidenceRole: "accessory_detail",
            itemType: "admin",
            title: "Arrival directions",
          })),
          stays: [
            {
              address: "Sample Street 1",
              checkIn: "2030-04-11",
              checkOut: "2030-04-13",
              city: "Prague",
              name: "Prague Stay",
            },
            {
              checkIn: "2030-04-11",
              checkOut: "2030-04-12",
              city: "Rome",
              name: "Rome Stay A",
            },
            {
              checkIn: "2030-04-12",
              checkOut: "2030-04-13",
              city: "Rome",
              name: "Rome Stay B",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    assert.equal(
      activities(result).filter((item) => item.title === "Arrival directions")
        .length,
      0,
      "private access text never becomes a traveler card"
    );
    const prague = stays(result).find((stay) => stay.name === "Prague Stay");
    assert.match(String(prague?.accessInstructions), /collect the key/i);
    assert.equal(genericNoOwnerActions(result.pieces).length, 0);
  });

  await test("Loop 2: planning-cost material remains an explicit permitted exclusion", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          activities: [
            {
              category: "admin_logistics",
              city: "Sample City",
              date: "2030-04-12",
              description: "Sample City — $72 (private room ensuite)",
              evidence: "Sample City — $72 (private room ensuite)",
              evidenceRole: "accessory_detail",
              itemType: "admin",
              sourceSectionLabel: "Costs",
              sourceSectionType: "reference_notes",
              title: "Stay pricing",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-13, 2030" },
    });

    assert.equal(
      activities(result).some((item) => item.title === "Stay pricing"),
      false
    );
    assert.ok(
      result.pieces.some(
        (piece) =>
          piece.payload.title === "Stay pricing" &&
          piece.disposition?.kind === "terminal" &&
          piece.disposition.code === "PLANNING_COST_SECTION_LINE"
      )
    );
    assert.equal(genericNoOwnerActions(result.pieces).length, 0);
  });
}
