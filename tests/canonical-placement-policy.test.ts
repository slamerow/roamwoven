import assert from "node:assert/strict";
import { resolveStructuralActivityDates } from "@/lib/extraction/canonical-placement-policy";
import type {
  CanonicalEvidencePiece,
  EvidenceObservation,
} from "@/lib/extraction/evidence-clustering";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

let counter = 0;

function observation(
  overrides: Partial<EvidenceObservation> & { payload?: Record<string, unknown> }
): EvidenceObservation {
  counter += 1;
  return {
    id: `obs_${counter}`,
    kind: "activity",
    ordinal: counter,
    payload: {},
    role: "atomic_candidate",
    source: "model_chunk",
    sourceFilename: null,
    sourceLabel: "source",
    sourceProvenance: null,
    sourceStructure: { headingPath: [], sectionLabel: null, sectionType: "unknown" },
    sourceUploadId: null,
    ...overrides,
  };
}

function piece(
  observationIds: string[],
  payload: Record<string, unknown>,
  kind: CanonicalEvidencePiece["kind"] = "activity"
): CanonicalEvidencePiece {
  counter += 1;
  return {
    actions: [],
    confidence: "high",
    conflicts: [],
    fieldSources: {},
    fieldWinnerRanks: {},
    id: `piece_${counter}`,
    kind,
    mergeReasons: [],
    observationIds,
    outputEligible: true,
    payload,
    role: "atomic_candidate",
  };
}

const addAction = (
  target: CanonicalEvidencePiece,
  action: { reason: string; type: "recovered"; absorbedTitles: string[]; observationIds: string[] }
) => {
  target.actions.push({ ...action });
};

const bounds = { max: "2019-01-25", min: "2019-01-12" };

test("undated piece inherits its date from a dated section label", () => {
  const obs = observation({
    sourceLabel: "Thursday, January 17th - Kutna Hora day trip",
    sourceStructure: {
      headingPath: [],
      sectionLabel: "Thursday, January 17th - Kutna Hora day trip",
      sectionType: "unknown",
    },
  });
  const target = piece([obs.id], { itemType: "activity", title: "Silver mines" });

  resolveStructuralActivityDates({
    addAction,
    observations: [obs],
    pieces: [target],
    tripBounds: bounds,
    tripYear: 2019,
  });

  assert.equal(target.payload.date, "2019-01-17");
  assert.equal(target.actions.length, 1);
  assert.match(target.actions[0].reason, /source section/);
});

test("undated piece inherits the nearest dated neighbor from the same section", () => {
  const dated = observation({
    payload: { date: "2019-01-17", title: "Sedlec Ossuary" },
    sourceLabel: "Kutna Hora notes",
  });
  const undatedObs = observation({ sourceLabel: "Kutna Hora notes" });
  const target = piece([undatedObs.id], { itemType: "activity", title: "Koscom" });

  resolveStructuralActivityDates({
    addAction,
    observations: [dated, undatedObs],
    pieces: [target],
    tripBounds: bounds,
    tripYear: 2019,
  });

  assert.equal(target.payload.date, "2019-01-17");
  assert.match(target.actions[0].reason, /adjacent evidence/);
});

test("a structural date outside the piece's own city leg is rejected", () => {
  const obs = observation({
    sourceLabel: "Thursday, January 17th",
    sourceStructure: {
      headingPath: [],
      sectionLabel: "Thursday, January 17th",
      sectionType: "unknown",
    },
  });
  const rome = piece(
    [],
    { arriveDate: "2019-01-24", city: "Rome", leaveDate: "2019-01-25" },
    "place"
  );
  const target = piece([obs.id], {
    city: "Rome",
    itemType: "activity",
    title: "Watches in Rome",
  });

  resolveStructuralActivityDates({
    addAction,
    observations: [obs],
    pieces: [rome, target],
    tripBounds: bounds,
    tripYear: 2019,
  });

  assert.equal(target.payload.date, undefined, "Jan 17 is not a Rome day");
});

test("dated pieces and notes are never touched", () => {
  const obs = observation({
    sourceLabel: "Monday, January 21st",
    sourceStructure: {
      headingPath: [],
      sectionLabel: "Monday, January 21st",
      sectionType: "dated_itinerary",
    },
  });
  const dated = piece([obs.id], {
    date: "2019-01-22",
    itemType: "activity",
    title: "Parliament",
  });
  const note = piece([obs.id], { itemType: "note", title: "Budapest tips" });

  resolveStructuralActivityDates({
    addAction,
    observations: [obs],
    pieces: [dated, note],
    tripBounds: bounds,
    tripYear: 2019,
  });

  assert.equal(dated.payload.date, "2019-01-22");
  assert.equal(note.payload.date, undefined);
});
