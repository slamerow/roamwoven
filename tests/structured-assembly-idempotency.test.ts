import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import {
  SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import { createTripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";
import { createCentralEuropeFirstHalfDraft } from "@/tests/fixtures/central-europe-extraction-qa";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function cloneDraft<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createJan25ReturnFlightAnchorDraft() {
  const anchors: SourceTransportAnchor[] = [
    {
      anchorId: "source-flight-2019-01-25-delta-1043-fco-jfk",
      arrivalLocation: "JFK",
      arrivalTime: "18:45",
      confidence: "high",
      confirmation: "GHFHPG",
      date: "2019-01-25",
      departureLocation: "FCO",
      departureTime: "14:45",
      evidence:
        "Friday, January 25th Home Delta Flight 1043 Confirmation #GHFHPG FCO -> JFK 2:45 -> 6:45.",
      kind: "flight",
      number: "1043",
      provider: "Delta",
      provenance: ["text_layer", "ocr"],
      routeLabel: "Delta Flight 1043",
      sourceFilename: "central-europe.pdf",
      sourceUploadId: "upload-return-flights",
    },
    {
      anchorId: "source-flight-2019-01-25-delta-2934-jfk-dca",
      arrivalLocation: "DCA",
      arrivalTime: "21:50",
      confidence: "high",
      confirmation: "GHFHPG",
      date: "2019-01-25",
      departureLocation: "JFK",
      departureTime: "20:30",
      evidence:
        "Friday, January 25th Delta Flight 2934 Confirmation #GHFHPG JFK -> DCA 8:30 PM -> 9:50 PM.",
      kind: "flight",
      number: "2934",
      provider: "Delta",
      provenance: ["text_layer", "ocr"],
      routeLabel: "Delta Flight 2934",
      sourceFilename: "central-europe.pdf",
      sourceUploadId: "upload-return-flights",
    },
  ];

  return {
    [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
      transport: anchors,
    },
    activities: [],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-21",
        city: "Budapest",
        country: "Hungary",
        leaveDate: "2019-01-24",
      },
      {
        arriveDate: "2019-01-24",
        city: "Rome",
        country: "Italy",
        leaveDate: "2019-01-25",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [
      {
        arrival: null,
        arrivalTime: null,
        confirmation: "GHFHPG",
        date: "2019-01-25",
        departure: null,
        departureTime: null,
        description: "Return flight home. Confirmation #GHFHPG.",
        provider: "Delta",
        sourceFilename: "central-europe.pdf",
        title: "Return flight home",
        type: "flight",
      },
    ],
    tripOverview: {
      confidence: "medium",
      dateRange: "Jan 21-25, 2019",
      destinationSummary: "Budapest, Rome, home",
      title: "Central Europe",
    },
  };
}

export default function run() {
  test("structured assembly fingerprint is stable across recomputation and trip ids", () => {
    const draft = createCentralEuropeFirstHalfDraft();
    const firstRecords = createStructuredTripRecordsFromDraft({
      draft: cloneDraft(draft),
      fallbackTripName: "Central Europe",
      tripId: "assembly-idempotency-a",
    });
    const secondRecords = createStructuredTripRecordsFromDraft({
      draft: cloneDraft(draft),
      fallbackTripName: "Central Europe",
      tripId: "assembly-idempotency-b",
    });
    const first = createTripExtractionFingerprints(firstRecords);
    const second = createTripExtractionFingerprints(secondRecords);

    assert.equal(first.hash, second.hash);
    assert.deepEqual(first.sectionHashes, second.sectionHashes);
    assert.deepEqual(first.counts, second.counts);
    assert.equal(first.counts.transport, 5);
    assert.equal(first.counts.openQuestions, 1);
  });

  test("structured assembly fingerprint changes when traveler-visible transport changes", () => {
    const draft = createCentralEuropeFirstHalfDraft();
    const changedDraft = cloneDraft(draft);
    const train = changedDraft.transport.find(
      (item) => item.title === "Train to Vienna"
    );

    assert.ok(train, "expected Train to Vienna in fixture");
    (train as { departureTime: string | null }).departureTime = "10:20";

    const original = createTripExtractionFingerprints(
      createStructuredTripRecordsFromDraft({
        draft,
        fallbackTripName: "Central Europe",
        tripId: "assembly-fingerprint-original",
      })
    );
    const changed = createTripExtractionFingerprints(
      createStructuredTripRecordsFromDraft({
        draft: changedDraft,
        fallbackTripName: "Central Europe",
        tripId: "assembly-fingerprint-changed",
      })
    );

    assert.notEqual(original.hash, changed.hash);
    assert.notEqual(
      original.sectionHashes.transport,
      changed.sectionHashes.transport
    );
    assert.equal(original.sectionHashes.activeActivities, changed.sectionHashes.activeActivities);
  });

  test("central europe P0 anchors stay visible without source-obvious review questions", () => {
    const records = createStructuredTripRecordsFromDraft({
      draft: createCentralEuropeFirstHalfDraft(),
      fallbackTripName: "Central Europe",
      tripId: "central-europe-p0-anchors",
    });
    const viennaTrains = records.transport.filter(
      (transport) =>
        transport.date === "2019-01-18" &&
        transport.transportType === "train" &&
        /vienna/i.test(transport.routeLabel)
    );
    const uMaliru = records.items.find((item) => /u maliru/i.test(item.title));

    assert.equal(viennaTrains.length, 1);
    assert.equal(viennaTrains[0]?.departureTime, "09:20");
    assert.equal(uMaliru?.startTime, "13:00");
    assert.equal(
      records.reviewQuestions.some(
        (question) =>
          question.status === "open" &&
          /train to vienna|u maliru/i.test(question.prompt)
      ),
      false
    );
  });

  test("return-day source-anchor repair is idempotent and keeps connecting flights separate", () => {
    const draft = createJan25ReturnFlightAnchorDraft();
    const firstRecords = createStructuredTripRecordsFromDraft({
      draft: cloneDraft(draft),
      fallbackTripName: "Central Europe",
      tripId: "return-flight-idempotency-a",
    });
    const secondRecords = createStructuredTripRecordsFromDraft({
      draft: cloneDraft(draft),
      fallbackTripName: "Central Europe",
      tripId: "return-flight-idempotency-b",
    });
    const first = createTripExtractionFingerprints(firstRecords);
    const second = createTripExtractionFingerprints(secondRecords);
    const jan25Flights = firstRecords.transport.filter(
      (item) => item.date === "2019-01-25" && item.transportType === "flight"
    );

    assert.equal(first.hash, second.hash);
    assert.deepEqual(first.sectionHashes, second.sectionHashes);
    assert.deepEqual(first.counts, second.counts);
    assert.equal(first.counts.transport, 2);
    assert.equal(first.counts.calls, 0);
    assert.equal(first.counts.openQuestions, 0);
    assert.equal(jan25Flights.length, 2);
    assert.ok(
      jan25Flights.some(
        (item) =>
          item.departureLocation === "FCO" &&
          item.arrivalLocation === "JFK" &&
          item.departureTime === "14:45" &&
          item.arrivalTime === "18:45"
      ),
      "expected Delta 1043 FCO to JFK to remain a separate traveler transport row"
    );
    assert.ok(
      jan25Flights.some(
        (item) =>
          item.departureLocation === "JFK" &&
          item.arrivalLocation === "DCA" &&
          item.departureTime === "20:30" &&
          item.arrivalTime === "21:50"
      ),
      "expected Delta 2934 JFK to DCA to remain a separate traveler transport row"
    );
  });
}
