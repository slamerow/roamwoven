import assert from "node:assert/strict";
import { consolidateTripDraft } from "@/lib/extraction/consolidate-trip-draft";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

export default async function run() {
  await test("flight enrichment cannot absorb lodging directions or addresses", () => {
    const result = consolidateTripDraft({
      activities: [
        {
          address: "99 Hostel Street",
          category: "arrival_departure",
          date: "2030-05-03",
          description:
            "Directions to the hostel: take the tram, use the side entrance, and check in at reception.",
          endTime: null,
          itemType: "activity",
          sourceFilename: "itinerary.pdf",
          startTime: "12:20",
          title: "Example Air Flight EA 2339",
        },
      ],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Destination Airport",
          arrivalTime: "14:10",
          confirmation: "ABC123",
          date: "2030-05-03",
          departure: "Origin Airport",
          departureTime: "12:20",
          description: "Flight EA 2339.",
          provider: "Example Air",
          sourceFilename: "ticket.pdf",
          title: "Example Air Flight EA 2339",
          type: "flight",
        },
      ],
      tripOverview: {},
    });
    const draft = result.draft as {
      activities: unknown[];
      transport: Array<{ description?: string | null }>;
    };
    const description = draft.transport[0]?.description ?? "";

    assert.equal(draft.activities.length, 0);
    assert.doesNotMatch(description, /hostel|tram|side entrance|reception/i);
    assert.doesNotMatch(description, /99 Hostel Street/i);
    assert.match(description, /Flight EA 2339/);
  });
}
