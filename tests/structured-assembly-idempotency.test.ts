import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import { createTripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";
import { createTripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit";
import { assessTripDraftQuality } from "@/lib/extraction/trip-quality-assessment";
import {
  createCentralEuropeFirstHalfDraft,
  createCentralEuropeGoldenDraft,
} from "@/tests/fixtures/central-europe-extraction-qa";

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

  const draft = {
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
    stays: [
      {
        checkIn: "2019-01-21",
        checkOut: "2019-01-24",
        city: "Budapest",
        name: "Budapest lodging",
      },
      {
        checkIn: "2019-01-24",
        checkOut: "2019-01-25",
        city: "Rome",
        name: "Rome lodging",
      },
    ],
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

  return clusterExtractedEvidence({
    sourceTransportAnchors: anchors,
    stages: [
      {
        label: "return flight model evidence",
        source: "model_spine",
        stage: draft,
      },
    ],
    tripOverview: draft.tripOverview,
  }).draft;
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

  test("Central Europe golden extraction preserves visit, stay, and transport invariants", () => {
    const golden = createCentralEuropeGoldenDraft();
    const clustered = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        {
          label: "Central Europe golden source",
          source: "model_spine",
          stage: golden,
        },
        {
          label: "Central Europe repeated chunk evidence",
          source: "model_chunk",
          stage: cloneDraft(golden),
        },
      ],
      tripOverview: golden.tripOverview,
    });
    const records = createStructuredTripRecordsFromDraft({
      draft: clustered.draft,
      fallbackTripName: "Central Europe",
      tripId: "central-europe-golden",
    });
    const viennaTrain = records.transport.find(
      (item) =>
        item.date === "2019-01-18" && item.transportType === "train"
    );

    assert.equal(records.legs.length, 5);
    assert.deepEqual(
      records.legs.map((leg) => leg.city),
      ["Rome", "Prague", "Vienna", "Budapest", "Rome"]
    );
    assert.deepEqual(
      records.legs.map((leg) => [leg.arriveDate, leg.leaveDate]),
      [
        ["2019-01-13", "2019-01-14"],
        ["2019-01-14", "2019-01-18"],
        ["2019-01-18", "2019-01-21"],
        ["2019-01-21", "2019-01-24"],
        ["2019-01-24", "2019-01-25"],
      ]
    );
    assert.equal(records.stays.length, 5);
    assert.deepEqual(
      records.stays.map((stay) => stay.name),
      [
        "The Yellow",
        "Prague Airbnb",
        "Wombats City Hostel Vienna",
        "Vitae Hostel",
        "The RomeHello Hostel",
      ]
    );
    assert.equal(records.transport.length, 8);
    assert.equal(viennaTrain?.departureTime, "09:20");
    assert.equal(
      assessTripDraftQuality({ draft: clustered.draft, records }).report.diagnostics.some(
        (diagnostic) => diagnostic.severity === "p0"
      ),
      false
    );
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

  test("canonical assembly does not manufacture a city-wide Explore group", () => {
    const clustered = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        {
          label: "Budapest day",
          source: "model_chunk",
          stage: {
            activities: [
              {
                category: "art_culture",
                date: "2019-01-22",
                description:
                  "House of Terror Museum, New York Cafe, Gellert Baths, and Great Market Hall.",
                itemType: "activity",
                title: "Explore Budapest",
              },
              {
                category: "art_culture",
                date: "2019-01-22",
                itemType: "activity",
                title: "House of Terror Museum",
              },
              {
                category: "food_dining",
                date: "2019-01-22",
                itemType: "activity",
                title: "New York Cafe lunch",
              },
              {
                category: "art_culture",
                date: "2019-01-22",
                itemType: "activity",
                title: "Gellert Baths",
              },
              {
                category: "art_culture",
                date: "2019-01-22",
                itemType: "activity",
                title: "Great Market Hall",
              },
            ],
            missingDetails: [],
            places: [
              {
                arriveDate: "2019-01-21",
                city: "Budapest",
                country: "Hungary",
                leaveDate: "2019-01-24",
              },
            ],
            stays: [],
            transport: [],
          },
        },
      ],
      tripOverview: { title: "Central Europe" },
    });
    const records = createStructuredTripRecordsFromDraft({
      draft: clustered.draft,
      fallbackTripName: "Central Europe",
      tripId: "canonical-no-budapest-overgroup",
    });
    const titles = records.items
      .filter((item) => item.itemType === "activity")
      .map((item) => item.title);

    assert.equal(titles.includes("Explore Budapest"), false);
    assert.ok(titles.includes("House of Terror Museum"));
    assert.ok(titles.includes("New York Cafe lunch"));
    assert.ok(titles.includes("Gellert Baths"));
    assert.ok(titles.includes("Great Market Hall"));
  });

  test("canonical source-anchor enrichment is idempotent without creating connection rows", () => {
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
    assert.equal(first.counts.transport, 1);
    assert.equal(first.counts.calls, 0);
    assert.equal(first.counts.openQuestions, 0);
    assert.equal(jan25Flights.length, 1);
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
    assert.equal(
      jan25Flights.some(
        (item) =>
          item.departureLocation === "JFK" &&
          item.arrivalLocation === "DCA" &&
          item.departureTime === "20:30" &&
          item.arrivalTime === "21:50"
      ),
      false,
      "an unmatched source anchor cannot create the Delta 2934 connection row"
    );
  });

  test("canonical system grouping survives assembly as one visible FYI Call", () => {
    const decisionId = "group_test_schonbrunn_assembly";
    const clustered = clusterExtractedEvidence({
      groupingDecisions: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2"],
        claim: "The source block and venue evidence identify one palace-complex visit.",
        decisionId,
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Schönbrunn Palace complex",
        source: "canonical_resolver",
      }],
      sourceTransportAnchors: [],
      stages: [
        {
          label: "same-site source",
          source: "model_chunk",
          stage: {
            activities: [
              {
                category: "art_culture",
                date: "2019-01-19",
                description:
                  "Same-site Schönbrunn visit including Schönbrunn gardens.",
                _canonicalGroupingDecisionIds: [decisionId],
                _resolverCandidateId: "stage-1-item-1",
                itemType: "activity",
                title: "Schönbrunn Palace complex",
              },
              {
                category: "art_culture",
                date: "2019-01-19",
                description: "Walk through the gardens.",
                _resolverCandidateId: "stage-1-item-2",
                itemType: "activity",
                title: "Schönbrunn gardens",
              },
            ],
            missingDetails: [],
            places: [
              {
                arriveDate: "2019-01-18",
                city: "Vienna",
                leaveDate: "2019-01-21",
              },
            ],
            sensitiveDetails: [],
            stays: [{
              checkIn: "2019-01-18",
              checkOut: "2019-01-21",
              city: "Vienna",
              name: "Vienna lodging",
            }],
            transport: [],
          },
        },
      ],
      tripOverview: { title: "Central Europe" },
    });
    const records = createStructuredTripRecordsFromDraft({
      draft: clustered.draft,
      fallbackTripName: "Central Europe",
      tripId: "canonical-grouping-call",
    });
    const call = records.reviewQuestions.find((question) =>
      /We grouped Schönbrunn gardens into Schönbrunn Palace complex/.test(
        question.prompt
      )
    );

    assert.deepEqual(
      records.items.map((item) => item.title),
      ["Schönbrunn Palace complex"]
    );
    assert.ok(call);
    assert.equal(call.status, "noted");
    assert.equal(
      records.reviewQuestions.filter((question) => question.status === "open").length,
      0
    );

    const report = createTripExtractionAuditReport({
      draft: clustered.draft,
      evidenceArtifacts: {
        observations: clustered.observations,
        pieces: clustered.pieces,
      },
      records,
    });
    const groupedLineage = report.lineage.find((row) =>
      row.actions.some((action) => action.type === "grouped") &&
      row.observations.some(
        (observation) => observation.title === "Schönbrunn gardens"
      )
    );

    assert.ok(groupedLineage);
    assert.ok(
      groupedLineage.actions.some((action) => action.type === "grouped")
    );
    assert.ok(
      groupedLineage.actions
        .filter((action) => action.type === "grouped")
        .every((action) => action.decisionId === decisionId)
    );
    assert.equal(groupedLineage.finalRecords.length, 1);
  });
}
