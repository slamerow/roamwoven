import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import {
  clusterExtractedEvidence,
  EVIDENCE_CLUSTER_VERSION,
} from "@/lib/extraction/evidence-clustering";
import {
  getStructuredReviewCount,
  getStructuredReviewSections,
} from "@/lib/generated-trip-review";
import {
  canonicalizeSourceTransportAnchors,
  extractSourceTransportAnchorsFromMaterials,
  SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import { createTripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const embeddedTrainMaterial = {
  filename: "mixed-source.pdf",
  sourceUploadId: "upload-1",
  text: [
    "[PDF text layer]",
    "Friday, January 18th",
    "Train to Vienna",
    "Train Code: 1beb5005",
    "[OCR text from embedded images]",
    "Outbound - Jan 18, 2019",
    "09:20",
    "Praha, Hlavni Nadrazi",
    "04:03h",
    "RegioJet | RJ 1033",
    "13:23",
    "Wien, Hauptbahnhof",
  ].join("\n"),
  type: "pdf_text" as const,
};

const longMergedFlightMaterial = {
  filename: "return-flights.pdf",
  sourceUploadId: "upload-return",
  text: [
    "[PDF text layer]",
    "Central Europe January 2019",
    [
      "Thursday, January 24th Fly back to Rome Wizz Air Flight W6 2339 Confirmation RDGHMT Seat C1 Budapest (Terminal 2b)-> Rome Fiumicino 12:20 PM -> 2:10 PM",
      "Friday, January 25th Home Delta Flight 1043 (Operated by Alitalia) Confirmation #GHFHPG FCO -> JFK (10 hours) 14J 2:45 -> 6:45 Delta Flight 2934 (Operated by Alitalia) JFK-> DCA 13D 8:30 PM -> 9:50 PM",
    ].join(" "),
  ].join("\n"),
  type: "pdf_text" as const,
};

function createBaseDraft(
  sourceAnchors: SourceTransportAnchor[],
  options: { confirmation?: string | null } = {}
) {
  const confirmation =
    Object.prototype.hasOwnProperty.call(options, "confirmation")
      ? options.confirmation
      : "1beb5005";

  return {
    [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
      transport: sourceAnchors,
    },
    activities: [],
    missingDetails: [
      {
        answerType: "time",
        confidence: "medium",
        evidence: "Train to Vienna. Train Code: 1beb5005.",
        guessedValue: null,
        prompt: "What time does Train to Vienna depart?",
        reason: "The departure time is needed for the travel row.",
        relatedTitle: "Train to Vienna",
        subjectType: "transport",
        targetField: "departureTime",
      },
    ],
    places: [
      {
        arriveDate: "2019-01-14",
        city: "Prague",
        country: "Czech Republic",
        leaveDate: "2019-01-18",
      },
      {
        arriveDate: "2019-01-18",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2019-01-21",
      },
    ],
    sensitiveDetails: [],
    stays: [
      {
        checkIn: "2019-01-14",
        checkOut: "2019-01-18",
        city: "Prague",
        name: "Prague lodging",
      },
      {
        checkIn: "2019-01-18",
        checkOut: "2019-01-21",
        city: "Vienna",
        name: "Vienna lodging",
      },
    ],
    transport: [
      {
        arrival: null,
        arrivalTime: null,
        confirmation,
        date: "2019-01-18",
        departure: null,
        departureTime: null,
        description: null,
        provider: null,
        title: "Train to Vienna",
        type: "train",
      },
    ],
    tripOverview: {
      dateRange: "January 2019",
      destinationSummary: "Central Europe",
      title: "Central Europe",
    },
  };
}

function canonicalizeWithAnchors(
  draft: Record<string, unknown>,
  anchors: SourceTransportAnchor[]
) {
  return clusterExtractedEvidence({
    sourceTransportAnchors: anchors,
    stages: [
      {
        label: "test model evidence",
        source: "model_spine",
        stage: draft,
      },
    ],
    tripOverview: draft.tripOverview ?? {},
  }).draft;
}

test("source anchors split merged PDF text into separate flight legs", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    longMergedFlightMaterial,
  ]);
  const budapestToRome = anchors.find(
    (anchor) => anchor.kind === "flight" && anchor.number === "W6 2339"
  );
  const fcoToJfk = anchors.find(
    (anchor) =>
      anchor.kind === "flight" &&
      anchor.number === "1043" &&
      anchor.departureLocation === "FCO" &&
      anchor.arrivalLocation === "JFK"
  );
  const jfkToDca = anchors.find(
    (anchor) =>
      anchor.kind === "flight" &&
      anchor.number === "2934" &&
      anchor.departureLocation === "JFK" &&
      anchor.arrivalLocation === "DCA"
  );

  assert.ok(budapestToRome, "expected Wizz Air Budapest to Rome anchor");
  assert.equal(budapestToRome.departureLocation, "Budapest");
  assert.equal(budapestToRome.arrivalLocation, "Rome Fiumicino");
  assert.ok(fcoToJfk, "expected Delta 1043 FCO to JFK anchor");
  assert.equal(fcoToJfk.date, "2019-01-25");
  assert.equal(fcoToJfk.confirmation, "GHFHPG");
  assert.equal(fcoToJfk.departureTime, "14:45");
  assert.equal(fcoToJfk.arrivalTime, "18:45");
  assert.ok(jfkToDca, "expected Delta 2934 JFK to DCA anchor");
  assert.equal(jfkToDca.date, "2019-01-25");
  assert.equal(jfkToDca.departureTime, "20:30");
  assert.equal(jfkToDca.arrivalTime, "21:50");
});

test("prep-note times never become flight segment times (live 7.17.1 regression)", () => {
  // Exact text shape from production run 7.17.1: the anchor previously bound
  // departure 14:30 ("Leave for Airport: 2:30 PM") and arrival 17:00 (the
  // real 5:00 PM departure), shifting every time one field backward.
  const anchors = extractSourceTransportAnchorsFromMaterials([
    {
      filename: "outbound-flights.pdf",
      sourceUploadId: "upload-outbound",
      text: [
        "[PDF text layer]",
        "Central Europe January 2019",
        "Saturday, January 12th Fly to Rome Leave for Airport: 2:30 PM Delta Flight 5925- Confirmation #GHFHPG DCA -> JFK 11C 5:00 PM -> 6:41 PM Delta Flight 444 JFK-> FCO (8.5 hours) 30F 7:46 PM -> 10:15 AM",
      ].join("\n"),
      type: "pdf_text" as const,
    },
  ]);
  const dcaToJfk = anchors.find(
    (anchor) => anchor.kind === "flight" && anchor.number === "5925"
  );
  const jfkToFco = anchors.find(
    (anchor) => anchor.kind === "flight" && anchor.number === "444"
  );

  assert.ok(dcaToJfk, "expected Delta 5925 anchor");
  assert.equal(dcaToJfk.departureTime, "17:00");
  assert.equal(dcaToJfk.arrivalTime, "18:41");
  assert.equal(dcaToJfk.date, "2019-01-12");
  assert.ok(jfkToFco, "expected Delta 444 anchor");
  assert.equal(jfkToFco.departureTime, "19:46");
  assert.equal(jfkToFco.arrivalTime, "10:15");
});

test("canonical source anchors enrich existing flights but never create a missing leg", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    longMergedFlightMaterial,
  ]);
  const records = createStructuredTripRecordsFromDraft({
    draft: canonicalizeWithAnchors({
      [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
        transport: anchors,
      },
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-24",
          city: "Rome",
          leaveDate: "2019-01-25",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "DCA",
          arrivalTime: "21:50",
          confirmation: "GHFHPG",
          date: "2019-01-25",
          departure: "JFK",
          departureTime: "20:30",
          provider: "Delta",
          title: "JFK to DCA",
          type: "flight",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    }, anchors),
    fallbackTripName: "Central Europe",
    tripId: "return-flight-anchor-repair",
  });

  assert.equal(
    records.transport.some(
      (item) =>
        item.transportType === "flight" &&
        item.departureLocation === "FCO" &&
        item.arrivalLocation === "JFK"
    ),
    false,
    "source-anchor diagnostics must not manufacture a missing FCO to JFK row"
  );
  assert.ok(
    records.transport.some(
      (item) =>
        item.transportType === "flight" &&
        item.departureLocation === "JFK" &&
        item.arrivalLocation === "DCA"
    ),
    "expected existing JFK to DCA flight to remain separate"
  );
  const jan25ReturnRoutes = records.transport.filter(
    (item) =>
      item.date === "2019-01-25" &&
      item.transportType === "flight" &&
      ((item.departureLocation === "FCO" && item.arrivalLocation === "JFK") ||
        (item.departureLocation === "JFK" && item.arrivalLocation === "DCA"))
  );

  assert.equal(
    jan25ReturnRoutes.length,
    1,
    "expected only the model-produced JFK to DCA flight on January 25"
  );
});

test("canonical source anchors cannot split a generic flight into new connection rows", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    longMergedFlightMaterial,
  ]);
  const canonicalDraft = canonicalizeWithAnchors({
    [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
      transport: anchors,
    },
    activities: [],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-24",
        city: "Rome",
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
        provider: "Delta",
        title: "Return flight home",
        type: "flight",
      },
    ],
    tripOverview: {
      title: "Central Europe",
    },
  }, anchors);
  const records = createStructuredTripRecordsFromDraft({
    draft: canonicalDraft,
    fallbackTripName: "Central Europe",
    tripId: "return-flight-generic-anchor-repair",
  });
  const jan25ReturnFlights = records.transport.filter(
    (item) => item.date === "2019-01-25" && item.transportType === "flight"
  );
  assert.equal(
    jan25ReturnFlights.length,
    1,
    "expected one model-produced row after source-anchor enrichment"
  );
  assert.ok(
    jan25ReturnFlights.some(
      (item) =>
        item.departureLocation === "FCO" &&
        item.arrivalLocation === "JFK" &&
        item.departureTime === "14:45"
    ),
    "expected FCO to JFK to remain visible"
  );
  assert.equal(
    jan25ReturnFlights.some(
      (item) =>
        item.departureLocation === "JFK" &&
        item.arrivalLocation === "DCA" &&
        item.departureTime === "20:30"
    ),
    false,
    "the unmatched connecting anchor must not create another traveler row"
  );
});

test("canonical evidence versions never reactivate legacy anchor row creation", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    longMergedFlightMaterial,
  ]);
  for (const version of [2, EVIDENCE_CLUSTER_VERSION + 1]) {
    const records = createStructuredTripRecordsFromDraft({
      draft: {
        _evidence: {
          canonicalPieceIds: [],
          observationIds: [],
          version,
        },
        [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: { transport: anchors },
        activities: [],
        missingDetails: [],
        places: [
          {
            arriveDate: "2019-01-24",
            city: "Rome",
            leaveDate: "2019-01-25",
          },
        ],
        stays: [],
        transport: [],
        tripOverview: { title: "Central Europe" },
      },
      fallbackTripName: "Central Europe",
      tripId: `canonical-boundary-${version}`,
    });

    assert.equal(records.transport.length, 0);
  }
});

test("source anchors extract embedded visual train times from mixed PDF text", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const train = anchors.find((anchor) => anchor.kind === "train");

  assert.ok(train, "expected train anchor");
  assert.equal(train.date, "2019-01-18");
  assert.equal(train.departureTime, "09:20");
  assert.equal(train.arrivalTime, "13:23");
  assert.equal(train.departureLocation, "Praha, Hlavni Nadrazi");
  assert.equal(train.arrivalLocation, "Wien, Hauptbahnhof");
  assert.equal(train.provider, "RegioJet");
  assert.equal(train.number, "RJ 1033");
  assert.equal(train.confirmation, "1beb5005");
  assert.deepEqual(train.provenance.sort(), ["ocr", "text_layer"]);
});

test("ticket dates parse in day-month and numeric formats without crossing PDF pages", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    {
      filename: "tickets-and-lockbox.pdf",
      sourceUploadId: "upload-ticket-pages",
      text: [
        "[OCR text from embedded images]",
        "=== Page 16 ===",
        "Fri, 18 Jan 2019 09:20",
        "RegioJet | RJ 1033",
        "09:20 Praha, Hlavni Nadrazi",
        "13:23 Wien, Hauptbahnhof",
        "=== Page 17 ===",
        "OBB Personenverkehr AG",
        "DATUM: 21.01",
        "ZEIT: 10:42",
        "Train to Budapest",
        "10:42 WIEN HBF",
        "13:19 BUDAPEST",
        "=== Page 18 ===",
        "Lockbox code 2580",
        "The key will be prepared on the day of arrival at 3 PM.",
      ].join("\n"),
      type: "pdf_text" as const,
    },
  ]);

  assert.ok(anchors.some((item) => item.date === "2019-01-18"));
  assert.ok(anchors.some((item) => item.date === "2019-01-21"));
  assert.equal(
    anchors.some(
      (item) => item.confirmation === "2580" || item.departureTime === "15:00"
    ),
    false
  );
});

test("flight duration decimals cannot become trip dates", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    {
      filename: "flight.pdf",
      sourceUploadId: "upload-flight-duration",
      text: [
        "Saturday, January 12th, 2019",
        "Delta Flight 444 JFK -> FCO (8.5 hours) 30F 7:46 PM -> 10:15 AM",
      ].join("\n"),
      type: "pdf_text" as const,
    },
  ]);
  const flight = anchors.find((anchor) => anchor.number === "444");

  assert.ok(flight);
  assert.equal(flight.date, "2019-01-12");
  assert.equal(anchors.some((anchor) => anchor.date === "2019-05-08"), false);
});

test("source anchors repair transport and suppress already-answered time questions", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const records = createStructuredTripRecordsFromDraft({
    draft: canonicalizeWithAnchors(createBaseDraft(anchors), anchors),
    fallbackTripName: "Central Europe",
    tripId: "source-anchor-repair",
  });
  const train = records.transport.find(
    (item) => item.routeLabel === "Train to Vienna"
  );

  assert.ok(train, "expected train transport");
  assert.equal(train.departureTime, "09:20");
  assert.equal(train.arrivalTime, "13:23");
  assert.equal(train.departureLocation, "Praha, Hlavni Nadrazi");
  assert.equal(train.arrivalLocation, "Wien, Hauptbahnhof");
  assert.equal(train.provider, "RegioJet");
  assert.equal(
    records.reviewQuestions.some(
      (question) =>
        question.status === "open" &&
        question.prompt.includes("Train to Vienna")
    ),
    false
  );

  const fingerprints = createTripExtractionFingerprints(records);
  assert.equal(
    fingerprints.openQuestions.some((question) => question.includes("train to vienna")),
    false
  );
  assert.equal(fingerprints.transport.length, 1);
});

test("source anchor repair traces stay internal instead of becoming calls", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const draft = {
    ...createBaseDraft(anchors),
    missingDetails: [
      {
        answerType: "confirm",
        confidence: "high",
        evidence:
          "Source anchors repaired Train to Vienna with the OCR-backed 09:20 departure and 13:23 arrival.",
        guessedValue: "Train to Vienna",
        prompt:
          "We repaired Train to Vienna from source anchors and kept the traveler travel row.",
        reason:
          "Source-anchor repair is an internal audit trace, not a maker-facing presentation decision.",
        relatedTitle: "Train to Vienna",
        subjectType: "transport",
        targetField: "sourceAnchorRepair",
      },
    ],
  };
  const records = createStructuredTripRecordsFromDraft({
    draft: canonicalizeWithAnchors(draft, anchors),
    fallbackTripName: "Central Europe",
    tripId: "source-anchor-repair-internal",
  });
  const sections = getStructuredReviewSections(records);

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(sections.find((section) => section.id === "notes")?.count, 0);
  assert.equal(sections.find((section) => section.id === "questions")?.count, 0);
});

test("source anchors enrich generic transport rows instead of duplicating them", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const canonicalDraft = canonicalizeWithAnchors(
    createBaseDraft(anchors, { confirmation: null }),
    anchors
  );
  const records = createStructuredTripRecordsFromDraft({
    draft: canonicalDraft,
    fallbackTripName: "Central Europe",
    tripId: "source-anchor-generic-repair",
  });
  const trains = records.transport.filter(
    (item) => item.transportType === "train"
  );
  const train = trains[0];

  assert.equal(trains.length, 1);
  assert.ok(train, "expected generic train row to survive as the repaired row");
  assert.equal(train.routeLabel, "Train to Vienna");
  assert.equal(train.departureTime, "09:20");
  assert.equal(train.arrivalTime, "13:23");
  assert.equal(train.departureLocation, "Praha, Hlavni Nadrazi");
  assert.equal(train.arrivalLocation, "Wien, Hauptbahnhof");
  assert.equal(train.provider, "RegioJet");
  assert.equal(
    records.reviewQuestions.some(
      (question) =>
        question.status === "open" &&
        question.prompt.includes("Train to Vienna")
    ),
    false
  );
});

test("audit flags source-backed transport anchors missing from final records", () => {
  const [anchor] = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: { title: "Empty" },
    },
    fallbackTripName: "Empty",
    tripId: "source-anchor-missing",
  });
  const diagnostics = createAuditDiagnostics({
    lineage: [],
    records,
    sourceTransportAnchors: [anchor],
  });

  assert.ok(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "critical_transport_source_anchor_missing" &&
        diagnostic.severity === "p0"
    )
  );
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(
    getStructuredReviewSections(records).find((section) => section.id === "questions")
      ?.count,
    0
  );
});

test("audit reconciles alternate date formats and exact segment times", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      stays: [],
      transport: [
        {
          arrival: "DCA",
          arrivalTime: "21:50",
          date: "January 25th",
          departure: "JFK",
          departureTime: "20:30",
          title: "Flight JFK to DCA",
          type: "flight",
        },
      ],
      tripOverview: {
        dateRange: "January 12-25, 2019",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Central Europe",
    tripId: "source-anchor-alternate-date",
  });
  const diagnostics = createAuditDiagnostics({
    lineage: [],
    records,
    sourceTransportAnchors: [
      {
        anchorId: "corrupt-costs-anchor",
        arrivalLocation: "Costs",
        arrivalTime: "21:50",
        confidence: "medium",
        confirmation: null,
        date: "2019-01-25",
        departureLocation: "Flight",
        departureTime: "20:30",
        evidence: "8:30 PM Costs 9:50 PM",
        kind: "flight",
        number: "2934",
        provider: "Delta",
        provenance: ["ocr"],
        routeLabel: "Flight",
        sourceFilename: "central-europe.pdf",
        sourceUploadId: "upload-return",
      },
    ],
  });

  assert.equal(
    diagnostics.some(
      (diagnostic) => diagnostic.code === "critical_transport_source_anchor_missing"
    ),
    false
  );
});

test("diagnostics assess canonical anchor groups instead of raw text and OCR variants", () => {
  const variants = canonicalizeSourceTransportAnchors([
    {
      anchorId: "generic-vienna-train",
      arrivalLocation: "Vienna",
      arrivalTime: null,
      confidence: "high",
      confirmation: "1beb5005",
      date: "2019-01-18",
      departureLocation: "Train",
      departureTime: null,
      evidence: "Train to Vienna. Train Code 1beb5005.",
      kind: "train",
      number: null,
      provider: null,
      provenance: ["text_layer"],
      routeLabel: "Train Train to Vienna",
      sourceFilename: "trip.pdf",
      sourceUploadId: "upload-1",
    },
    {
      anchorId: "specific-vienna-train",
      arrivalLocation: "Wien Hauptbahnhof",
      arrivalTime: "13:23",
      confidence: "high",
      confirmation: "1beb5005",
      date: "2019-01-18",
      departureLocation: "Praha Hlavni Nadrazi",
      departureTime: "09:20",
      evidence: "RJ 1033 Praha to Wien 09:20 to 13:23.",
      kind: "train",
      number: "RJ 1033",
      provider: "RegioJet",
      provenance: ["ocr"],
      routeLabel: "Train Prague to Vienna",
      sourceFilename: "trip.pdf",
      sourceUploadId: "upload-1",
    },
  ]);

  assert.equal(variants.length, 1);
  assert.equal(variants[0]?.departureTime, "09:20");
  assert.deepEqual(
    new Set(variants[0]?.provenance),
    new Set(["text_layer", "ocr"])
  );
});
