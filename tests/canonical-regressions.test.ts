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

  await test("a source-backed destination beats a same-station model endpoint", () => {
    const sourceAnchor: SourceTransportAnchor = {
      anchorId: "vienna-budapest-source",
      arrivalLocation: "Budapest",
      arrivalTime: null,
      confidence: "high",
      confirmation: null,
      date: "2019-01-21",
      departureLocation: null,
      departureTime: "10:42",
      evidence: "10:42 Train To Budapest Wien HBF",
      kind: "train",
      number: null,
      provider: null,
      provenance: ["text_layer"],
      routeLabel: "Train to Budapest",
      sourceFilename: "rail.pdf",
      sourceUploadId: "rail-upload",
    };
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [sourceAnchor],
      stages: [{
        label: "rail",
        source: "model_chunk",
        stage: emptyStage({
          transport: [{
            arrival: "Wien Hbf",
            arrivalTime: null,
            date: "2019-01-21",
            departure: "Wien Hbf",
            departureTime: "10:42",
            title: "Train to Budapest",
            type: "train",
          }],
        }),
      }],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const [train] = (result.draft as {
      transport: Array<Record<string, unknown>>;
    }).transport;

    assert.equal(train?.departure, "Wien Hbf");
    assert.equal(train?.arrival, "Budapest");
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

  await test("a city-only stay fragment attaches only to one compatible dated stay", () => {
    const draft = cluster(emptyStage({
      places: [{
        arriveDate: "2019-01-13",
        city: "Rome",
        leaveDate: "2019-01-25",
      }],
      stays: [
        {
          checkIn: "2019-01-13",
          checkOut: "2019-01-14",
          city: "Rome",
          name: "The Yellow",
        },
        {
          checkIn: "2019-01-24",
          checkOut: "2019-01-25",
          city: "Rome",
          name: "The RomeHello Hostel",
        },
        {
          checkIn: "2019-01-24",
          checkOut: "2019-01-25",
          city: "Rome",
          name: "Rome",
        },
      ],
    }));

    assert.deepEqual(draft.stays.map((stay) => stay.name), [
      "The Yellow",
      "The RomeHello Hostel",
    ]);
  });

  await test("a city-only stay fragment remains separate when two stays are compatible", () => {
    const draft = cluster(emptyStage({
      places: [{ arriveDate: "2019-01-20", city: "Lisbon", leaveDate: "2019-01-24" }],
      stays: [
        { checkIn: "2019-01-20", checkOut: "2019-01-24", city: "Lisbon", name: "Hotel A" },
        { checkIn: "2019-01-20", checkOut: "2019-01-24", city: "Lisbon", name: "Hotel B" },
        { checkIn: "2019-01-21", checkOut: null, city: "Lisbon", name: "Lisbon" },
      ],
    }));

    assert.equal(draft.stays.length, 3);
  });

  await test("a timed arrival and bag-drop bridge stays visible without an approval question", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "arrival_departure",
        city: "Rome",
        date: "2019-01-13",
        description: "Land in Rome at 10:15, drop bags, then spend the day touring.",
        itemType: "activity",
        startTime: "10:15",
        title: "Arrive in Rome and drop bags",
      }],
      missingDetails: [{
        answerType: "confirm",
        evidence: "Land in Rome at 10:15 and drop bags before touring.",
        prompt: "Is the Rome landing and bag-drop the activity to keep?",
        relatedTitle: "Arrive in Rome and drop bags",
        subjectType: "item",
        targetField: "itemType",
      }],
      stays: [{
        checkIn: "2019-01-13",
        checkOut: "2019-01-14",
        city: "Rome",
        name: "The Yellow",
      }],
      transport: [{
        arrival: "Rome",
        arrivalTime: "10:15",
        date: "2019-01-13",
        departure: "JFK",
        departureTime: "19:46",
        title: "Flight to Rome",
        type: "flight",
      }],
    }));

    assert.deepEqual(draft.activities.map((item) => item.title), [
      "Arrive in Rome and drop bags",
    ]);
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("a routine hotel check-in remains attached to the stay", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "arrival_departure",
        city: "Paris",
        date: "2019-01-20",
        description: "Check in at Hotel A.",
        itemType: "activity",
        startTime: "15:00",
        title: "Check in at Hotel A",
      }],
      stays: [{
        checkIn: "2019-01-20",
        checkOut: "2019-01-22",
        city: "Paris",
        name: "Hotel A",
      }],
    }));

    assert.equal(draft.activities.length, 0);
  });

  await test("one active stay resolves a city and date lodging-name fragment question", () => {
    const draft = cluster(emptyStage({
      missingDetails: [{
        answerType: "text",
        evidence: "January 23rd Budapest - private room.",
        prompt: "What lodging does this January 23rd Budapest line refer to?",
        relatedTitle: "Budapest",
        subjectType: "stay",
        targetField: "name",
      }],
      stays: [{
        checkIn: "2019-01-21",
        checkOut: "2019-01-24",
        city: "Budapest",
        name: "Vitae Hostel",
      }],
    }));

    assert.equal(draft.missingDetails.length, 0);
  });

  await test("dated mixed evidence routes to records before city-note merging", () => {
    const draft = cluster(emptyStage({
      activities: [
        {
          address: "Via della Fontanella Borghese 33",
          category: "shopping_tailor",
          city: "Rome",
          date: "2019-01-24",
          description: "Visit the shop.",
          itemType: "activity",
          title: "Watches In Rome",
        },
        {
          category: "art_culture",
          city: "Rome",
          date: "2019-01-24",
          description: [
            "Arrival and departure",
            "Sleeping at The RomeHello Hostel",
            "The source includes the hostel address and room details",
            "Watches In Rome is at Via della Fontanella Borghese 33",
            "Tour Rome in the afternoon or evening or work",
            "Eat some pizza",
          ].join("; "),
          evidenceRole: "city_note_candidate",
          itemType: "note",
          sourceHeadingPath: ["January 24th", "Rome"],
          sourceSectionLabel: "January 24th Rome",
          sourceSectionType: "dated_itinerary",
          title: "Rome arrival notes",
        },
      ],
      places: [{ arriveDate: "2019-01-24", city: "Rome", leaveDate: "2019-01-25" }],
      stays: [{
        address: "Via Torino 45",
        checkIn: "2019-01-24",
        checkOut: "2019-01-25",
        city: "Rome",
        name: "The RomeHello Hostel",
      }],
      transport: [{
        arrival: "Rome",
        arrivalTime: "15:00",
        date: "2019-01-24",
        departure: "Budapest",
        departureTime: "12:00",
        title: "Flight from Budapest to Rome",
        type: "flight",
      }],
    }));
    const titles = draft.activities.map((item) => item.title);

    assert.ok(titles.includes("Watches In Rome"));
    assert.ok(titles.includes("Rome afternoon / evening plans"));
    assert.equal(titles.some((title) => /Notes & Tips/.test(title)), false);
  });

  await test("an explicit city-reference section remains a city note", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "art_culture",
        city: "Vienna",
        date: "2019-01-19",
        description: "Museum of Illusions; Mozarthaus; Ring Tram Tour; Prater",
        evidenceRole: "city_note_candidate",
        itemType: "note",
        sourceHeadingPath: ["Vienna", "Recommendations"],
        sourceSectionLabel: "Vienna recommendations",
        sourceSectionType: "city_reference",
        title: "Vienna possible sights",
      }],
      places: [{ arriveDate: "2019-01-18", city: "Vienna", leaveDate: "2019-01-21" }],
    }));

    assert.deepEqual(draft.activities.map((item) => item.title), ["Vienna Notes & Tips"]);
  });

  await test("a description fragment exactly naming another activity cannot bleed", () => {
    const draft = cluster(emptyStage({
      activities: [
        {
          category: "art_culture",
          city: "Rome",
          date: "2019-01-13",
          description: "Trevi Fountain by 5:30 PM. 'Watches In Rome'.",
          itemType: "activity",
          title: "Trevi Fountain",
        },
        {
          category: "shopping_tailor",
          city: "Rome",
          date: "2019-01-24",
          itemType: "activity",
          title: "Watches In Rome",
        },
      ],
    }));
    const trevi = (draft.activities as Array<Record<string, unknown>>).find(
      (item) => item.title === "Trevi Fountain"
    );

    assert.equal(/Watches In Rome/i.test(String(trevi?.description)), false);
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
