import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
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
    activities: Array<{
      description?: string | null;
      itemType?: string;
      title: string;
    }>;
    missingDetails: Array<{ prompt?: string }>;
    places: Array<{ city: string }>;
    stays: Array<{ checkIn?: string; checkOut?: string; name: string }>;
    transport: Array<{ title: string }>;
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

  await test("canonical stay dates resolve from checkout and nights without a question", () => {
    const draft = cluster(emptyStage({
      missingDetails: [{
        answerType: "confirm",
        confidence: "medium",
        evidence: "Wombats City Hostel Vienna - The Lounge ... 3 nights",
        guessedValue: "3 nights",
        prompt: "Is the Vienna hostel stay definitely 3 nights, ending on January 21?",
        reason: "The source explicitly says 3 nights.",
        relatedTitle: "Wombats City Hostel Vienna - The Lounge",
        subjectType: "stay",
        targetField: "item/date",
      }],
      stays: [{
        checkOut: "2019-01-21",
        name: "Wombats City Hostel Vienna - The Lounge",
        nights: 3,
      }],
    }));

    assert.equal(draft.stays[0]?.checkIn, "2019-01-18");
    assert.equal(draft.stays[0]?.checkOut, "2019-01-21");
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("one uniquely matching explicit night count stays out of review", () => {
    const draft = cluster(emptyStage({
      missingDetails: [{
        answerType: "confirm",
        confidence: "medium",
        evidence: "The source says Wombats City Hostel Vienna is 3 nights.",
        guessedValue: "3 nights",
        prompt: "We treated the Vienna stay as 3 nights. Is that right?",
        reason: "The stay text lists Wombats City Hostel Vienna and 3 nights.",
        relatedTitle: null,
        subjectType: "stay",
        targetField: "nights",
      }],
      stays: [{
        checkIn: "2019-01-18",
        checkOut: "2019-01-21",
        name: "Wombats City Hostel Vienna",
        nights: 3,
      }],
    }));

    assert.equal(draft.missingDetails.length, 0);
  });

  await test("a uniquely scoped source-backed lodging name resolves canonically", () => {
    const draft = cluster(emptyStage({
      missingDetails: [{
        answerType: "confirm",
        confidence: "medium",
        evidence: "The Yellow: Check in: 2:30 PM #743-410652363",
        guessedValue: "The Yellow Hostel",
        prompt: "Is this the correct lodging title for the Rome stay on January 13?",
        reason: "The source has check-in instructions and address.",
        relatedTitle: "Rome stay",
        subjectType: "stay",
        targetField: "item/title",
      }],
      places: [{
        arriveDate: "2019-01-13",
        city: "Rome",
        leaveDate: "2019-01-14",
      }],
      stays: [{
        checkIn: "2019-01-13",
        checkOut: "2019-01-14",
        name: "Rome stay",
      }],
    }));

    assert.equal(draft.stays[0]?.name, "The Yellow Hostel");
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("canonical date review keeps uncertainty but removes a resolved planner call", () => {
    const activity = {
      date: "2019-01-13",
      itemType: "activity",
      title: "Rome walk after bag drop",
    };
    const ambiguous = cluster(emptyStage({
      activities: [activity],
      missingDetails: [{
        answerType: "confirm",
        confidence: "medium",
        evidence: "Surrounding itinerary suggests this framing.",
        guessedValue: "2019-01-13",
        prompt: "Is the Rome walk really on January 13?",
        reason: "The source context implies the date but does not state it directly.",
        relatedTitle: activity.title,
        subjectType: "item",
        targetField: "date",
      }],
    }));
    const resolved = cluster(emptyStage({
      activities: [activity],
      missingDetails: [{
        answerType: "confirm",
        confidence: "medium",
        evidence: "This follows the Rome arrival, bag drop, then check-in sequence on the same day.",
        guessedValue: "2019-01-13",
        prompt: "We placed the Rome walk on January 13 after arrival and bag drop.",
        reason: "A reasonable trip planner would place this on the Rome arrival day from the surrounding sequence.",
        relatedTitle: activity.title,
        subjectType: "item",
        targetField: "date",
      }],
    }));

    assert.equal(ambiguous.missingDetails.length, 1);
    assert.equal(resolved.missingDetails.length, 0);
  });

  await test("fixed privacy policy cannot become a maker-facing question", () => {
    const draft = cluster(emptyStage({
      missingDetails: [
        {
          answerType: "visibility",
          evidence: "The source has an Airbnb address and access code.",
          prompt: "How should the Prague Airbnb address be handled?",
          relatedTitle: "Prague Airbnb",
          subjectType: "stay",
          targetField: "addressVisibility",
        },
        {
          answerType: "confirm",
          evidence: "The source includes access codes and reservation numbers.",
          prompt: "Should these be stored as sensitive details?",
          relatedTitle: null,
          subjectType: "trip",
          targetField: "sensitiveDetails",
        },
      ],
      stays: [{
        address: "Michalská 431/5",
        checkIn: "2019-01-14",
        checkOut: "2019-01-15",
        name: "Prague Airbnb",
      }],
    }));

    assert.equal(draft.missingDetails.length, 0);
  });

  await test("optional provider and named-activity gaps stay out of review", () => {
    const draft = cluster(emptyStage({
      activities: [
        {
          date: "2019-01-15",
          description: "Walking tour in the morning at 9:00 AM.",
          itemType: "activity",
          startTime: "09:00",
          title: "Morning walking tour",
        },
        {
          date: "2019-01-16",
          itemType: "activity",
          startTime: "10:00",
          title: "Széchenyi Baths",
        },
      ],
      missingDetails: [
        {
          prompt: "We created the rental car pickup without a company name.",
          relatedTitle: null,
          subjectType: "transport",
          targetField: "provider",
        },
        {
          prompt: "What is the name of the morning walking tour?",
          relatedTitle: "Morning walking tour",
          subjectType: "item",
          targetField: "title",
        },
        {
          prompt: "We created Széchenyi Baths without an address.",
          relatedTitle: "Széchenyi Baths",
          subjectType: "item",
          targetField: "address",
        },
      ],
      transport: [{
        date: "2019-01-17",
        departure: "Revolucni 1044/23",
        departureTime: "09:00",
        title: "Rental car pickup",
        type: "rental_car",
      }],
    }));

    assert.equal(draft.missingDetails.length, 0);
  });

  await test("the next canonical leg arrival closes the preceding leg", () => {
    const draft = cluster(emptyStage({
      places: [
        { arriveDate: "2026-09-01", city: "Prague" },
        { arriveDate: "2026-09-04", city: "Vienna" },
      ],
    })) as unknown as {
      places: Array<{ arriveDate: string; leaveDate?: string }>;
    };

    assert.equal(draft.places[0]?.leaveDate, "2026-09-04");
    assert.equal(draft.places[1]?.leaveDate, undefined);
  });

  await test("a unique provisional stay date builds the draft but remains a question", () => {
    const draft = cluster(emptyStage({
      missingDetails: [{
        answerType: "date",
        confidence: "medium",
        evidence: "The lodging is listed under the arrival day.",
        guessedValue: "2026-09-01",
        prompt: "This looks like Left Bank Hotel starts on September 1. Is that correct?",
        reason: "The source context implies but does not state check-in explicitly.",
        relatedTitle: "Left Bank Hotel",
        subjectType: "stay",
        targetField: "checkIn",
      }],
      places: [
        { arriveDate: "2026-09-01", city: "Paris" },
        { arriveDate: "2026-09-04", city: "Lyon" },
      ],
      stays: [{ name: "Left Bank Hotel" }],
    }));

    assert.equal(draft.stays[0]?.checkIn, "2026-09-01");
    assert.equal(draft.stays[0]?.checkOut, "2026-09-04");
    assert.equal(draft.missingDetails.length, 1);
  });

  await test("high-confidence canonical trip boundaries stay out of review", () => {
    const draft = cluster(emptyStage({
      missingDetails: [{
        answerType: "confirm",
        confidence: "high",
        evidence: "The outbound overnight flight departs January 12.",
        guessedValue: "Trip starts January 12",
        prompt: "This looks like the first trip day starting January 12. Is that right?",
        reason: "The route starts with the overnight flight.",
        relatedTitle: null,
        subjectType: "trip",
        targetField: "dateRange",
      }],
      transport: [{
        arrival: "Rome",
        date: "2019-01-12",
        departure: "Washington, DC",
        departureTime: "17:00",
        title: "Fly to Rome",
        type: "flight",
      }],
    }));

    assert.equal(draft.missingDetails.length, 0);
  });

  await test("an empty extraction gets one canonical trip-spine blocker", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [{
        label: "empty source",
        source: "model_chunk",
        stage: emptyStage({}),
      }],
      tripOverview: {},
    });
    const details = (result.draft as {
      missingDetails: Array<{ prompt?: string }>;
    }).missingDetails;

    assert.equal(details.length, 1);
    assert.equal(
      details.some(
        (detail) =>
          detail.prompt === "What should Roamwoven include in the first trip draft?"
      ),
      true
    );
  });

  await test("source todo creates one question while presentation questions disappear", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "tours_tickets",
        date: "2019-01-16",
        description: "Prague Castle. Need to decide which ticket to get.",
        itemType: "activity",
        title: "Prague Castle",
      }],
      missingDetails: [
        {
          answerType: "text",
          evidence: "Need to decide which ticket to get.",
          prompt: "Which Prague Castle ticket should be used?",
          relatedTitle: "Prague Castle",
          subjectType: "item",
          targetField: "ticketType",
        },
        {
          answerType: "choice",
          evidence: "Prague Castle is in the source.",
          prompt: "Should Prague Castle be grouped or split?",
          relatedTitle: "Prague Castle",
          subjectType: "item",
          targetField: "itemType",
        },
        {
          answerType: "confirm",
          evidence: "Several venues are in the source.",
          prompt: "Should the day be split into venue cards?",
          relatedTitle: null,
          subjectType: "day",
          targetField: "itemType",
        },
      ],
    }));

    assert.equal(draft.missingDetails.length, 1);
    assert.equal(
      draft.missingDetails[0]?.prompt,
      "Which ticket or tour option should be listed for Prague Castle?"
    );
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
    assert.equal(titles.some((title) => /afternoon \/ evening plans/i.test(title)), false);
    assert.ok(titles.includes("Rome Notes & Tips"));
    const note = draft.activities.find((item) => item.title === "Rome Notes & Tips");
    assert.equal(/RomeHello|Via Torino|Watches In Rome/i.test(note?.description ?? ""), false);
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

  await test("concrete activities and lodging details are removed from city notes", () => {
    const draft = cluster(emptyStage({
      activities: [
        {
          category: "food_dining",
          city: "Budapest",
          date: "2019-01-22",
          description: "Dinner reservation at 8 PM.",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          startTime: "20:00",
          title: "Borkonyha Winekitchen dinner",
        },
        {
          category: "food_dining",
          city: "Budapest",
          date: null,
          description: "Food ideas; Borkhonya at 8 PM; Sleeping at Vitae Hostel; $15 private room; ruin bars",
          evidenceRole: "city_note_candidate",
          itemType: "note",
          sourceSectionType: "city_reference",
          title: "Budapest food ideas",
        },
      ],
      places: [{ arriveDate: "2019-01-21", city: "Budapest", leaveDate: "2019-01-24" }],
      stays: [{
        checkIn: "2019-01-21",
        checkOut: "2019-01-24",
        name: "Vitae Hostel",
      }],
    }));
    const note = draft.activities.find((item) => item.title === "Budapest Notes & Tips");
    assert.ok(draft.activities.some((item) => item.title === "Borkonyha Winekitchen dinner"));
    assert.ok(/ruin bars/i.test(note?.description ?? ""));
    assert.equal(/Borkhonya|Vitae|private room|\$15/i.test(note?.description ?? ""), false);
  });

  await test("accessory flight evidence cannot become a second activity card", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "arrival_departure",
        city: "Rome",
        date: "2019-01-25",
        description: "Delta Flight 444 departs FCO at 2:45 PM.",
        evidenceRole: "accessory_detail",
        itemType: "activity",
        startTime: "14:45",
        title: "Delta Flight 444",
      }],
      transport: [{
        arrival: "JFK",
        arrivalTime: "18:45",
        date: "2019-01-25",
        departure: "FCO",
        departureTime: "14:45",
        title: "Delta Flight 444 FCO to JFK",
        type: "flight",
      }],
    }));

    assert.equal(draft.activities.length, 0);
    assert.equal(draft.transport.length, 1);
  });

  await test("unbooked day-trip rail attaches to the day-trip activity", () => {
    const draft = cluster(emptyStage({
      activities: [{
        category: "art_culture",
        city: "Kutna Hora",
        date: "2019-01-17",
        description: "Visit Kutna Hora and return to Prague.",
        itemType: "activity",
        title: "Kutna Hora day trip",
      }],
      places: [{ arriveDate: "2019-01-14", city: "Prague", leaveDate: "2019-01-18" }],
      transport: [{
        arrival: "Kutna Hora",
        arrivalTime: "09:45",
        date: "2019-01-17",
        departure: "Prague",
        departureTime: "08:00",
        description: "Take the train to Kutna Hora and return at 18:00.",
        title: "Train to Kutna Hora",
        type: "train",
      }],
    }));

    assert.equal(draft.transport.length, 0);
    assert.deepEqual(draft.activities.map((item) => item.title), ["Kutna Hora day trip"]);
    assert.ok(/train/i.test(draft.activities[0]?.description ?? ""));
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

  await test("canonical factory owns the missing critical transport time question", () => {
    const draft = cluster(emptyStage({
      transport: [{
        arrival: "Vienna",
        confirmation: "1beb5005",
        date: "2019-01-18",
        departure: "Prague",
        description: "Train to Vienna. Train code: 1beb5005.",
        title: "Train to Vienna",
        type: "train",
      }],
    }));

    assert.equal(
      draft.missingDetails.some((detail) =>
        /what time does train to vienna depart/i.test(detail.prompt ?? "")
      ),
      true
    );
  });

  await test("opaque eight-digit ticket identifiers are never formatted as dates", () => {
    assert.equal(cleanTravelerText("Tour ticket 19183727"), "Tour ticket 19183727");
    assert.equal(
      cleanTravelerText("Visit on 20190119"),
      "Visit on January 19th, 2019"
    );
  });
}
