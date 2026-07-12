import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  canonicalizeSourceTransportAnchors,
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
