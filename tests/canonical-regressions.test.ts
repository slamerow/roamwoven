import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  canonicalizeSourceTransportAnchors,
  extractSourceTransportAnchorsFromMaterials,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import { cleanTravelerText } from "@/lib/extraction/traveler-text";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function emptyStage(value: Record<string, unknown>) {
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

function cluster(stage: Record<string, unknown>) {
  return clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [{ label: "regression", source: "model_chunk", stage }],
    tripOverview: { dateRange: "January 12-25, 2019" },
  }).draft as {
    activities: Array<{ title: string }>;
    missingDetails: Array<{ prompt?: string }>;
    stays: Array<{ name: string }>;
  };
}

export default async function run() {
  await test("transport anchor fields prefer a real station over a route phrase", () => {
    const anchor = (
      departureLocation: string,
      evidence: string
    ): SourceTransportAnchor => ({
      anchorId: evidence,
      arrivalLocation: "Budapest",
      arrivalTime: "17:30",
      confidence: "high",
      confirmation: "1beb5005",
      date: "2019-01-21",
      departureLocation,
      departureTime: "14:40",
      evidence,
      kind: "train",
      number: "RJ 1035",
      provider: "RegioJet",
      provenance: ["text_layer"],
      routeLabel: `${departureLocation} to Budapest`,
      sourceFilename: "train.pdf",
      sourceUploadId: "upload-train",
    });
    const [canonical] = canonicalizeSourceTransportAnchors([
      anchor("Train To Budapest", "malformed"),
      anchor("Wien Hbf", "station"),
    ]);

    assert.equal(canonical?.departureLocation, "Wien Hbf");
  });

  await test("timed route headings cannot replace real train endpoints", () => {
    const anchors = extractSourceTransportAnchorsFromMaterials([{
      filename: "rail.txt",
      sourceProvenance: "text_layer",
      text: [
        "Monday, January 21, 2019",
        "10:42 Train To Budapest",
        "10:42 Wien Hbf",
        "13:19 Budapest Keleti",
        "ÖBB D143",
        "Duration 2:37",
      ].join("\n"),
      type: "file_text",
    }]);
    const train = anchors.find((anchor) => anchor.kind === "train");

    assert.equal(train?.departureLocation, "Wien Hbf");
    assert.equal(train?.departureTime, "10:42");
    assert.equal(train?.arrivalLocation, "Budapest Keleti");
    assert.equal(train?.arrivalTime, "13:19");
  });

  await test("token-equivalent addresses and one dated generic fragment make one stay", () => {
    const draft = cluster(emptyStage({
      stays: [
        {
          address: "Michalska 431/5, Apartma Praha 1, Czechia",
          checkIn: "2019-01-14",
          checkOut: "2019-01-18",
          name: "Prague Airbnb",
        },
        {
          address: "Michalska 431/5, Praha 1, Czechia",
          checkIn: "2019-01-14",
          checkOut: "2019-01-18",
          name: "Airbnb apartment",
        },
        {
          address: null,
          checkIn: "2019-01-16",
          checkOut: null,
          name: "Prague stay",
        },
      ],
    }));

    assert.equal(draft.stays.length, 1);
  });

  await test("one price-shaped room fragment attaches to the unique dated stay", () => {
    const draft = cluster(emptyStage({
      stays: [
        {
          checkIn: "2019-01-24",
          checkOut: "2019-01-25",
          name: "The RomeHello Hostel",
        },
        {
          checkIn: "2019-01-24",
          checkOut: "2019-01-25",
          name: "Rome- $118(private room-ensuite)",
        },
      ],
    }));

    assert.deepEqual(draft.stays.map((stay) => stay.name), ["The RomeHello Hostel"]);
  });

  await test("same-city rental transport compiles only as an activity", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "arrival_departure",
        date: "2019-01-17",
        description: "Pick up and return the rental car in Prague.",
        itemType: "activity",
        title: "Prague rental car pickup",
      }],
      transport: [{
        arrival: "Prague Airport",
        arrivalDate: "2019-01-17",
        date: "2019-01-17",
        departure: "Prague Downtown",
        departureDate: "2019-01-17",
        title: "Prague rental car pickup",
        type: "rental_car",
      }],
    }));
    const records = createStructuredTripRecordsFromDraft({
      draft,
      fallbackTripName: "Rental boundary",
      tripId: "rental-boundary",
    });

    assert.equal(records.transport.length, 0);
    assert.deepEqual(records.items.map((item) => item.title), ["Prague rental car pickup"]);
  });

  await test("place-type words cannot misattach or duplicate one semantic tour question", () => {
    const draft = cluster(emptyStage({
      activities: [
        {
          category: "art_culture",
          date: "2019-01-16",
          itemType: "activity",
          title: "St. Stephen's Cathedral",
        },
        {
          category: "art_culture",
          date: "2019-01-16",
          description: "Includes St. Vitus Cathedral.",
          itemType: "activity",
          title: "Prague Castle",
        },
      ],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence: "Need to decide which ticket to get.",
          prompt: "Which Prague Castle ticket should be used?",
          relatedTitle: "Prague Castle",
          subjectType: "item",
          targetField: "ticketChoice",
        },
        {
          answerType: "text",
          confidence: "medium",
          evidence: "St. Vitus Cathedral get tour?",
          prompt: "Should St. Vitus Cathedral be self-guided or a tour?",
          relatedTitle: "St. Vitus Cathedral",
          subjectType: "item",
          targetField: "visitMode",
        },
        {
          answerType: "text",
          confidence: "medium",
          evidence: "Get tour?",
          prompt: "Should St. Vitus Cathedral include a tour booking?",
          relatedTitle: "Prague Castle",
          subjectType: "item",
          targetField: "bookingStatus",
        },
      ],
    }));
    const records = createStructuredTripRecordsFromDraft({
      draft,
      fallbackTripName: "Question ownership",
      tripId: "question-ownership",
    });
    const open = records.reviewQuestions.filter((question) => question.status === "open");
    const stStephen = records.items.find((item) => /Stephen/.test(item.title));

    assert.equal(open.length, 2);
    assert.equal(
      open.some((question) => question.subjectId === stStephen?.id),
      false
    );
  });

  await test("parenthetical price text cannot split an exact activity duplicate", () => {
    const draft = cluster(emptyStage({
      activities: [
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Free-12.90. Open til 6.",
          itemType: "activity",
          title: "Albertina",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Albertina museum (free-12.90). Open til 6.",
          itemType: "activity",
          title: "Albertina",
        },
      ],
    }));

    assert.equal(draft.activities.length, 1);
  });

  await test("canonical transport suppresses duplicate flight activity and nonsense question", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "arrival_departure",
        date: "2019-01-25",
        description: "Fly home from FCO to JFK.",
        itemType: "activity",
        title: "Fly home to JFK",
      }],
      missingDetails: [{
        answerType: "confirm",
        confidence: "high",
        evidence: "The stay is already identifiable.",
        guessedValue: null,
        prompt: "No question needed; the Vienna stay is already identifiable from the source.",
        reason: "Already resolved.",
        relatedTitle: "Wombats Vienna",
        subjectType: "stay",
        targetField: "checkIn",
      }],
      transport: [{
        arrival: "JFK",
        arrivalTime: "18:45",
        confirmation: "GHFHPG",
        date: "2019-01-25",
        departure: "FCO",
        departureTime: "14:45",
        description: null,
        provider: "Delta",
        title: "FCO to JFK",
        type: "flight",
      }],
    }));

    assert.equal(draft.activities.length, 0);
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("opaque eight-digit ticket identifiers are never formatted as dates", () => {
    assert.equal(cleanTravelerText("Tour ticket 19183727"), "Tour ticket 19183727");
    assert.equal(
      cleanTravelerText("Visit on 20190119"),
      "Visit on January 19th, 2019"
    );
  });
}
