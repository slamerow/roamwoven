import assert from "node:assert/strict";
import type { EvidenceArtifactBundle } from "@/lib/extraction/evidence-artifacts";
import { createTripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit";
import { normalizeTripDate } from "@/lib/extraction/traveler-text";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const draft = {
  activities: [],
  missingDetails: [],
  places: [
    {
      arriveDate: "2019-01-18",
      city: "Vienna",
      country: "Austria",
      leaveDate: "2019-01-21",
    },
    {
      arriveDate: "2019-01-21",
      city: "Budapest",
      country: "Hungary",
      leaveDate: "2019-01-24",
    },
  ],
  sensitiveDetails: [],
  stays: [],
  transport: [
    {
      arrival: "Budapest-Keleti",
      arrivalTime: "13:19",
      confirmation: "VXFHXKCQEPHPUSNT",
      date: "2019-01-21",
      departure: "Wien HBF",
      departureTime: "10:42",
      provider: "OBB",
      title: "Train to Budapest",
      type: "train",
    },
    {
      arrival: "Vienna hotel",
      date: "2019-01-18",
      departure: "Vienna station",
      title: "Taxi to hotel",
      type: "transfer",
    },
  ],
  tripOverview: { title: "Central Europe" },
};

const trainArtifacts: EvidenceArtifactBundle = {
  observations: [
    {
      id: "observation-train",
      kind: "transport",
      ordinal: 0,
      payload: {
        arrival: "Budapest-Keleti",
        arrivalTime: "13:19",
        confirmation: "VXFHXKCQEPHPUSNT",
        date: "21.1.2019",
        departure: "Wien HBF",
        departureTime: "10:42",
        provider: "OBB",
        title: "Train to Budapest",
        type: "train",
      },
      role: "atomic_candidate",
      source: "model_chunk",
      sourceFilename: "central-europe.pdf",
      sourceLabel: "Monday, January 21",
      sourceProvenance: "text_layer",
      sourceStructure: {
        headingPath: ["Monday, January 21"],
        sectionLabel: "Monday, January 21",
        sectionType: "dated_itinerary",
      },
      sourceUploadId: "upload-1",
    },
  ],
  pieces: [
    {
      actions: [],
      confidence: "high",
      conflicts: [],
      fieldSources: {},
      fieldWinnerRanks: {},
      id: "fixture-transport-1",
      kind: "transport",
      mergeReasons: [],
      observationIds: ["observation-train"],
      outputEligible: true,
      payload: {
        arrival: "Budapest-Keleti",
        arrivalTime: "13:19",
        confirmation: "VXFHXKCQEPHPUSNT",
        date: "21.1.2019",
        departure: "Wien HBF",
        departureTime: "10:42",
        provider: "OBB",
        title: "Train to Budapest",
        type: "train",
      },
      role: "atomic_candidate",
    },
  ],
};

function onePieceArtifacts({
  id,
  kind,
  payload,
}: {
  id: string;
  kind: "activity" | "stay" | "transport";
  payload: Record<string, unknown>;
}): EvidenceArtifactBundle {
  const observationId = `observation-${id}`;
  return {
    observations: [{
      id: observationId,
      kind,
      ordinal: 0,
      payload,
      role: "atomic_candidate",
      source: "model_chunk",
      sourceFilename: "audit-fixture.txt",
      sourceLabel: "audit fixture",
      sourceProvenance: "text_layer",
      sourceStructure: {
        headingPath: [],
        sectionLabel: null,
        sectionType: "dated_itinerary",
      },
      sourceUploadId: "upload-audit-fixture",
    }],
    pieces: [{
      actions: [],
      confidence: "high",
      conflicts: [],
      fieldSources: {},
      fieldWinnerRanks: {},
      id,
      kind,
      mergeReasons: [],
      observationIds: [observationId],
      outputEligible: true,
      payload,
      role: "atomic_candidate",
    }],
  };
}

test("European dotted source dates normalize without asking the maker", () => {
  assert.equal(normalizeTripDate("17.1.2019"), "2019-01-17");
  assert.equal(normalizeTripDate("31.2.2019"), null);
});

test("auditor reconciles a broken canonical join using independent typed proof", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "audit-semantic-reconciliation",
  });
  const train = records.transport.find((item) => item.transportType === "train");

  assert.ok(train);
  train.canonicalId = "drifted-canonical-id";
  train.routeLabel = "Wien HBF – Budapest Keleti";
  records.transport.reverse();

  const report = createTripExtractionAuditReport({
    draft,
    evidenceArtifacts: trainArtifacts,
    records,
  });
  const trainLineage = report.lineage.find(
    (row) => row.canonicalPieceId === "fixture-transport-1"
  );

  assert.equal(trainLineage?.status, "compiled");
  assert.equal(trainLineage?.matchMethod, "semantic_fallback");
  assert.equal(report.detectorIncidents.length, 1);
  assert.equal(
    report.diagnostics.some(
      (diagnostic) => diagnostic.code === "critical_transport_not_travel_row"
    ),
    false
  );
});

test("auditor still raises P0 when the source-backed train is actually absent", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "audit-real-missing-train",
  });

  records.transport = records.transport.filter(
    (item) => item.transportType !== "train"
  );

  const report = createTripExtractionAuditReport({
    draft,
    evidenceArtifacts: trainArtifacts,
    records,
  });

  assert.equal(report.detectorIncidents.length, 0);
  assert.equal(
    report.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "critical_transport_not_travel_row" &&
        diagnostic.severity === "p0"
    ),
    true
  );
});

test("activity identity drift reconciles from venue identity plus date", () => {
  const activityDraft = {
    ...draft,
    activities: [{
      category: "art_culture",
      date: "2019-01-19",
      itemType: "activity",
      startTime: "10:00",
      title: "Tokyo National Museum",
    }],
    stays: [],
    transport: [],
  };
  const records = createStructuredTripRecordsFromDraft({
    draft: activityDraft,
    fallbackTripName: "Tokyo",
    tripId: "audit-activity-identity-drift",
  });
  records.items[0].canonicalId = "drifted-activity-id";
  records.items[0].title = "Tokyo National Museum!";
  const artifacts = onePieceArtifacts({
    id: "canonical-activity",
    kind: "activity",
    payload: activityDraft.activities[0],
  });
  const report = createTripExtractionAuditReport({
    draft: activityDraft,
    evidenceArtifacts: artifacts,
    records,
  });

  const lineage = report.lineage.find(
    (row) => row.canonicalPieceId === "canonical-activity"
  );
  assert.equal(lineage?.status, "compiled");
  assert.equal(lineage?.matchMethod, "semantic_fallback");
  assert.equal(report.detectorIncidents.length, 1);
});

test("a similar activity title cannot hide a truly missing venue", () => {
  const sourceActivity = {
    category: "art_culture",
    date: "2019-01-19",
    itemType: "activity",
    title: "Tokyo National Museum",
  };
  const wrongDraft = {
    ...draft,
    activities: [{
      ...sourceActivity,
      title: "Tokyo Metropolitan Art Museum",
    }],
    stays: [],
    transport: [],
  };
  const records = createStructuredTripRecordsFromDraft({
    draft: wrongDraft,
    fallbackTripName: "Tokyo",
    tripId: "audit-activity-negative-control",
  });
  const report = createTripExtractionAuditReport({
    draft: wrongDraft,
    evidenceArtifacts: onePieceArtifacts({
      id: "canonical-missing-activity",
      kind: "activity",
      payload: sourceActivity,
    }),
    records,
  });

  assert.equal(
    report.lineage.find(
      (row) => row.canonicalPieceId === "canonical-missing-activity"
    )?.status,
    "missing_from_structured"
  );
  assert.equal(report.detectorIncidents.length, 0);
});

test("stay identity drift requires two typed agreements", () => {
  const stay = {
    address: "1-2-3 Marunouchi, Tokyo",
    checkIn: "2019-01-18",
    checkOut: "2019-01-21",
    name: "Marunouchi Hotel",
  };
  const stayDraft = {
    ...draft,
    activities: [],
    stays: [stay],
    transport: [],
  };
  const records = createStructuredTripRecordsFromDraft({
    draft: stayDraft,
    fallbackTripName: "Tokyo",
    tripId: "audit-stay-identity-drift",
  });
  records.stays[0].canonicalId = "drifted-stay-id";
  const report = createTripExtractionAuditReport({
    draft: stayDraft,
    evidenceArtifacts: onePieceArtifacts({
      id: "canonical-stay",
      kind: "stay",
      payload: stay,
    }),
    records,
  });

  assert.equal(report.lineage[0]?.status, "compiled");
  assert.equal(report.lineage[0]?.matchMethod, "semantic_fallback");

  records.stays[0].checkInDate = "2019-02-18";
  records.stays[0].address = null;
  const negative = createTripExtractionAuditReport({
    draft: stayDraft,
    evidenceArtifacts: onePieceArtifacts({
      id: "canonical-stay",
      kind: "stay",
      payload: stay,
    }),
    records,
  });
  assert.equal(negative.lineage[0]?.status, "missing_from_structured");
});

test("a unique exact booking locator can reconcile transport by itself", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Central Europe",
    tripId: "audit-unique-locator",
  });
  const train = records.transport.find((item) => item.transportType === "train");
  assert.ok(train);
  train.canonicalId = "drifted-train-id";
  train.date = null;
  train.departureLocation = null;
  train.arrivalLocation = null;
  train.departureTime = null;
  train.arrivalTime = null;
  train.provider = null;
  train.routeLabel = "Rail booking";
  const report = createTripExtractionAuditReport({
    draft,
    evidenceArtifacts: trainArtifacts,
    records,
  });

  const trainLineage = report.lineage.find(
    (row) => row.canonicalPieceId === "fixture-transport-1"
  );
  assert.equal(trainLineage?.status, "compiled");
  assert.equal(trainLineage?.matchMethod, "semantic_fallback");
});

test("a shared locator without a second typed fact remains unresolved", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Central Europe",
    tripId: "audit-shared-locator",
  });
  for (const item of records.transport) {
    item.canonicalId = `drifted-${item.id}`;
    item.confirmationLabel = "VXFHXKCQEPHPUSNT";
    item.date = null;
    item.departureLocation = null;
    item.arrivalLocation = null;
    item.departureTime = null;
    item.arrivalTime = null;
    item.provider = null;
    item.routeLabel = "Shared booking";
  }
  const report = createTripExtractionAuditReport({
    draft,
    evidenceArtifacts: trainArtifacts,
    records,
  });

  assert.equal(
    report.lineage.find(
      (row) => row.canonicalPieceId === "fixture-transport-1"
    )?.status,
    "missing_from_structured"
  );
  assert.equal(report.detectorIncidents.length, 0);
});
