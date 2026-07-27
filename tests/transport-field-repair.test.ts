import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import {
  endpointTypeIsCompatible,
  isAirportCodeShape,
  isRailStationShape,
  normalizedRepairClockTime,
  repairTransportFieldBleed,
} from "@/lib/extraction/transport-field-repair";

// Arc G.2 — cross-record transport field bleed (run 7.26.1 chains).
//
// The two live defects and their ground-truth answers
// (docs/assembly-ground-truth-central-europe.md, travel cards 4 and 5):
//
//   transport[2] RegioJet RJ 1033  arr "JFK"        -> Wien Hbf 13:23
//   transport[3] ÖBB D 143         arrT == depT     -> Budapest-Keleti 13:19
//
// Both are fixture assertions here, not review questions. GT budget for
// this trip is 3 questions and none of them is about transport.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function anchor(overrides: Partial<SourceTransportAnchor>): SourceTransportAnchor {
  return {
    anchorId: "anchor-1",
    arrivalLocation: null,
    arrivalTime: null,
    confidence: "high",
    confirmation: null,
    date: null,
    departureLocation: null,
    departureTime: null,
    evidence: "source line",
    kind: "train",
    number: null,
    provenance: ["text_layer"],
    provider: null,
    routeLabel: "train",
    sourceFilename: null,
    sourceUploadId: null,
    ...overrides,
  };
}

const REGIOJET_ANCHOR = anchor({
  anchorId: "anchor-regiojet",
  arrivalLocation: "Wien Hbf",
  arrivalTime: "13:23",
  date: "2019-01-18",
  departureLocation: "Praha, Hlavní Nádraží",
  departureTime: "09:20",
  evidence: "RegioJet RJ 1033 Praha hl.n. 9:20 - Wien Hbf 13:23",
  number: "1033",
  provider: "RegioJet",
  routeLabel: "Praha hl.n. to Wien Hbf",
});

const OBB_ANCHOR = anchor({
  anchorId: "anchor-obb",
  arrivalLocation: "Budapest-Keleti",
  arrivalTime: "13:19",
  date: "2019-01-21",
  departureLocation: "Wien Hbf",
  departureTime: "10:42",
  evidence: "ÖBB D 143 Wien Hbf 10:42 - Budapest-Keleti 13:19",
  number: "143",
  provider: "ÖBB",
  routeLabel: "Wien Hbf to Budapest-Keleti",
});

function regioJetPayload(overrides: Record<string, unknown> = {}) {
  return {
    arrival: "JFK",
    arrivalTime: "13:23",
    confirmation: "1beb5005",
    date: "2019-01-18",
    departure: "Praha, Hlavní Nádraží",
    departureTime: "09:20",
    provider: "RegioJet",
    title: "Train to Vienna",
    type: "train",
    ...overrides,
  };
}

function obbPayload(overrides: Record<string, unknown> = {}) {
  return {
    arrival: "Budapest",
    arrivalTime: "10:42",
    confirmation: "VXFHXKCQEPHPUSNT",
    date: "2019-01-21",
    departure: "Wien Hbf",
    departureTime: "10:42",
    provider: "ÖBB",
    title: "Train to Budapest",
    type: "train",
    ...overrides,
  };
}

export default async function run() {
  await test("a train cannot arrive at an IATA code — the source anchor supplies the station", () => {
    const payload = regioJetPayload();
    const result = repairTransportFieldBleed({
      anchors: [REGIOJET_ANCHOR],
      targets: [{ id: "piece-regiojet", payload }],
    });

    assert.equal(payload.arrival, "Wien Hbf");
    assert.equal(result.questions.length, 0);
    assert.equal(result.repairs.length, 1);
    assert.equal(result.repairs[0].defect, "endpoint_type_incompatible");
    assert.equal(result.repairs[0].outcome, "repaired_from_source_anchor");
    assert.equal(result.repairs[0].before, "JFK");
    assert.equal(result.repairs[0].anchorId, "anchor-regiojet");
  });

  await test("an arrival time equal to its own departure is repaired to the source arrival", () => {
    const payload = obbPayload();
    const result = repairTransportFieldBleed({
      anchors: [OBB_ANCHOR],
      targets: [{ id: "piece-obb", payload }],
    });

    assert.equal(payload.arrivalTime, "13:19");
    assert.equal(payload.departureTime, "10:42");
    assert.equal(result.questions.length, 0);
    assert.equal(result.repairs[0].defect, "arrival_time_equals_departure");
    assert.equal(result.repairs[0].outcome, "repaired_from_source_anchor");
  });

  await test("clock forms are compared as instants, not strings (10:42 vs 10.42 vs 10:42 AM)", () => {
    assert.equal(normalizedRepairClockTime("10:42"), "10:42");
    assert.equal(normalizedRepairClockTime("10.42"), "10:42");
    assert.equal(normalizedRepairClockTime("10:42 AM"), "10:42");
    assert.equal(normalizedRepairClockTime("1:19 pm"), "13:19");
    assert.equal(normalizedRepairClockTime("12:05 am"), "00:05");
    assert.equal(normalizedRepairClockTime("not a time"), null);

    const payload = obbPayload({ arrivalTime: "10.42" });
    repairTransportFieldBleed({
      anchors: [OBB_ANCHOR],
      targets: [{ id: "piece-obb", payload }],
    });
    assert.equal(payload.arrivalTime, "13:19");
  });

  await test("with no anchor to correct it, the impossible value is cleared and asked about exactly once", () => {
    const payload = regioJetPayload();
    const result = repairTransportFieldBleed({
      anchors: [],
      targets: [{ id: "piece-regiojet", payload }],
    });

    assert.equal(payload.arrival, null);
    assert.equal(result.repairs[0].outcome, "cleared_pending_review");
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].targetField, "arrival");
    assert.equal(result.questions[0].subjectType, "transport");
    assert.equal(result.questions[0].answerType, "text");
    assert.match(result.questions[0].prompt, /where does train to vienna arrive/i);
  });

  await test("a sparse row the source never described is left alone — sparseness is not corruption", () => {
    const payload = {
      arrival: "Budapest-Keleti",
      arrivalTime: null,
      date: "2019-01-21",
      departure: "Wien Hbf",
      departureTime: "10:42",
      title: "Train to Budapest",
      type: "train",
    };
    const result = repairTransportFieldBleed({ anchors: [], targets: [{ id: "p", payload }] });

    assert.equal(result.repairs.length, 0);
    assert.equal(result.questions.length, 0);
    assert.equal(payload.arrival, "Budapest-Keleti");
  });

  await test("airport transfers and flights keep their airport codes", () => {
    assert.equal(isAirportCodeShape("JFK"), true);
    assert.equal(isAirportCodeShape("JFK Terminal 4"), false);
    assert.equal(
      endpointTypeIsCompatible({ transportType: "flight", value: "JFK" }),
      true
    );
    assert.equal(
      endpointTypeIsCompatible({ transportType: "transfer", value: "JFK" }),
      true
    );
    assert.equal(
      endpointTypeIsCompatible({ transportType: "rental_car", value: "FCO" }),
      true
    );
    assert.equal(
      endpointTypeIsCompatible({ transportType: "train", value: "JFK" }),
      false
    );

    const payload = {
      arrival: "JFK",
      date: "2019-01-12",
      departure: "DCA",
      departureTime: "17:00",
      title: "Delta 5925",
      type: "flight",
    };
    const result = repairTransportFieldBleed({ anchors: [], targets: [{ id: "p", payload }] });
    assert.equal(result.repairs.length, 0);
    assert.equal(payload.arrival, "JFK");
  });

  await test("a flight cannot depart from a Hauptbahnhof, but an airport name is never a station", () => {
    assert.equal(isRailStationShape("Wien Hbf"), true);
    assert.equal(isRailStationShape("Praha, Hlavní Nádraží"), true);
    assert.equal(isRailStationShape("Budapest Airport Station"), false);
    assert.equal(
      endpointTypeIsCompatible({ transportType: "flight", value: "Wien Hbf" }),
      false
    );
    assert.equal(
      endpointTypeIsCompatible({ transportType: "train", value: "Wien Hbf" }),
      true
    );
  });

  await test("the repair is idempotent — the retry lane re-runs it as a no-op", () => {
    const payload = regioJetPayload();
    const first = repairTransportFieldBleed({
      anchors: [REGIOJET_ANCHOR],
      targets: [{ id: "piece-regiojet", payload }],
    });
    const second = repairTransportFieldBleed({
      anchors: [REGIOJET_ANCHOR],
      targets: [{ id: "piece-regiojet", payload }],
    });

    assert.equal(first.repairs.length, 1);
    assert.equal(second.repairs.length, 0);
    assert.equal(second.questions.length, 0);
    assert.equal(payload.arrival, "Wien Hbf");
  });

  await test("an anchor that would re-introduce the same defect is refused, not trusted", () => {
    const payload = regioJetPayload();
    const badAnchor = anchor({
      ...REGIOJET_ANCHOR,
      anchorId: "anchor-bad",
      arrivalLocation: "JFK",
    });
    const result = repairTransportFieldBleed({
      anchors: [badAnchor],
      targets: [{ id: "piece-regiojet", payload }],
    });

    assert.equal(payload.arrival, null);
    assert.equal(result.repairs[0].outcome, "cleared_pending_review");
    assert.equal(result.questions.length, 1);
  });


  await test("an adjacent leg's anchor can never supply this leg's values", () => {
    // Adjacent rail legs always share the interchange station, so the
    // audit-grade route join ("two shared tokens") matches the WRONG
    // anchor. Writing a value on that basis would turn a maker question
    // into silently wrong data on a traveler's card — strictly worse than
    // the defect being repaired.
    const legA = anchor({
      anchorId: "anchor-leg-a",
      arrivalLocation: "Salzburg Hbf",
      arrivalTime: "10:52",
      date: "2019-01-18",
      departureLocation: "Wien Hbf",
      departureTime: "08:30",
      evidence: "Wien Hbf 08:30 - Salzburg Hbf 10:52",
      routeLabel: "Wien Hbf to Salzburg Hbf",
    });
    const payload = {
      arrival: "Innsbruck Hbf",
      arrivalTime: "14:52",
      date: "2019-01-18",
      departure: "Salzburg Hbf",
      departureTime: "14:52",
      title: "Train to Innsbruck",
      type: "train",
    };
    const result = repairTransportFieldBleed({
      anchors: [legA],
      targets: [{ id: "leg-b", payload }],
    });

    assert.notEqual(
      payload.arrivalTime,
      "10:52",
      "the neighbouring leg's arrival time is never borrowed"
    );
    assert.equal(payload.arrivalTime, null);
    assert.equal(result.repairs[0].outcome, "cleared_pending_review");
    assert.equal(result.questions.length, 1);
  });

  await test("two corroborated anchors that disagree produce a question, not a guess", () => {
    const first = anchor({
      ...OBB_ANCHOR,
      anchorId: "anchor-obb-a",
      arrivalTime: "13:19",
    });
    const second = anchor({
      ...OBB_ANCHOR,
      anchorId: "anchor-obb-b",
      arrivalTime: "14:05",
    });
    const payload = obbPayload();
    const result = repairTransportFieldBleed({
      anchors: [first, second],
      targets: [{ id: "piece-obb", payload }],
    });

    assert.equal(payload.arrivalTime, null);
    assert.equal(result.repairs[0].outcome, "cleared_pending_review");
    assert.equal(result.questions.length, 1);
  });

  await test("two corroborated anchors that AGREE in different clock formats still repair silently", () => {
    const first = anchor({ ...OBB_ANCHOR, anchorId: "a", arrivalTime: "13:19" });
    const second = anchor({ ...OBB_ANCHOR, anchorId: "b", arrivalTime: "1:19 pm" });
    const payload = obbPayload();
    const result = repairTransportFieldBleed({
      anchors: [first, second],
      targets: [{ id: "piece-obb", payload }],
    });

    assert.equal(payload.arrivalTime, "13:19");
    assert.equal(result.questions.length, 0);
  });

  await test("airport buses and airport rail keep their airport codes", () => {
    const rows = [
      {
        arrival: "JFK",
        date: "2019-01-12",
        departure: "Grand Central",
        departureTime: "15:00",
        title: "NYC Airporter bus to JFK",
        type: "bus",
      },
      {
        arrival: "FRA",
        date: "2019-01-12",
        departure: "Köln Hbf",
        departureTime: "09:00",
        title: "ICE 1123 to Frankfurt Airport",
        type: "train",
      },
    ];
    const result = repairTransportFieldBleed({
      anchors: [],
      targets: rows.map((payload, index) => ({ id: `row-${index}`, payload })),
    });

    assert.equal(result.repairs.length, 0);
    assert.equal(result.questions.length, 0);
    assert.equal(rows[0].arrival, "JFK");
    assert.equal(rows[1].arrival, "FRA");
  });

  await test("a rejected value cannot walk back in through a sibling field", () => {
    // `finalizeCanonicalOutputFields` coalesces arrival ?? arrivalLocation
    // ?? dropOffLocation and arrivalTime ?? endTime.
    const payload: Record<string, unknown> = {
      arrival: "JFK",
      arrivalLocation: "JFK",
      arrivalTime: "10:42",
      date: "2019-01-21",
      departure: "Wien Hbf",
      departureTime: "10:42",
      dropOffLocation: "JFK",
      endTime: "10:42",
      title: "Train to Budapest",
      type: "train",
    };
    repairTransportFieldBleed({
      anchors: [OBB_ANCHOR],
      targets: [{ id: "p", payload }],
    });

    assert.equal(payload.arrival, "Budapest-Keleti");
    assert.equal(payload.arrivalLocation, "Budapest-Keleti");
    assert.equal(payload.dropOffLocation, "Budapest-Keleti");
    assert.equal(payload.arrivalTime, "13:19");
    assert.equal(payload.endTime, "13:19", "the coalesce source is repaired too");
  });

  await test("the conflict-question lane cannot re-ask about a repaired field", () => {
    // The ordering trap: `reconcileCanonicalConflicts` rebuilds conflicts
    // from the observations and recomputes `requiresReview`, so clearing
    // that flag is not enough on its own. Two stages disagreeing about the
    // same train's arrival is exactly the live shape.
    const stageWith = (label: string, transport: Record<string, unknown>) => ({
      label,
      source: "model_chunk" as const,
      stage: {
        activities: [],
        missingDetails: [],
        places: [
          { arriveDate: "2019-01-18", city: "Vienna", leaveDate: "2019-01-21" },
        ],
        sensitiveDetails: [],
        stays: [],
        transport: [transport],
      },
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [REGIOJET_ANCHOR],
      stages: [
        stageWith("chunk-a", regioJetPayload({ description: "RegioJet RJ 1033." })),
        stageWith(
          "chunk-b",
          regioJetPayload({
            arrival: "Wien Hbf",
            description: "RegioJet RJ 1033.",
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });

    const draft = result.draft as {
      missingDetails: Array<{ prompt?: string; targetField?: string }>;
      transport: Array<{ arrival?: string | null; title: string }>;
    };

    assert.equal(draft.transport[0]?.arrival, "Wien Hbf");
    assert.deepEqual(
      draft.missingDetails
        .filter((detail) => /which arrival|which arrivalTime/i.test(detail.prompt ?? ""))
        .map((detail) => detail.prompt),
      []
    );
  });

  await test("GT cards 4 and 5 assemble correctly through the cluster and raise ZERO transport questions", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [REGIOJET_ANCHOR, OBB_ANCHOR],
      stages: [
        {
          label: "arc-g2",
          source: "model_chunk",
          stage: {
            activities: [],
            missingDetails: [],
            places: [
              {
                arriveDate: "2019-01-18",
                city: "Vienna",
                leaveDate: "2019-01-21",
              },
              {
                arriveDate: "2019-01-21",
                city: "Budapest",
                leaveDate: "2019-01-24",
              },
            ],
            sensitiveDetails: [],
            stays: [],
            transport: [
              regioJetPayload({ description: "RegioJet RJ 1033." }),
              obbPayload({ description: "ÖBB D 143." }),
            ],
          },
        },
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });

    const draft = result.draft as {
      missingDetails: Array<{
        prompt?: string;
        subjectType?: string;
        targetField?: string;
      }>;
      transport: Array<{
        arrival?: string | null;
        arrivalTime?: string | null;
        departureTime?: string | null;
        title: string;
      }>;
    };

    const regioJet = draft.transport.find((row) =>
      /vienna/i.test(row.title)
    );
    const obb = draft.transport.find((row) => /budapest/i.test(row.title));

    assert.equal(regioJet?.arrival, "Wien Hbf");
    assert.equal(regioJet?.arrivalTime, "13:23");
    assert.equal(obb?.arrivalTime, "13:19");
    assert.equal(obb?.departureTime, "10:42");

    const transportQuestions = draft.missingDetails.filter(
      (detail) =>
        detail.subjectType === "transport" ||
        /arriv|depart|which arrival|which departure/i.test(detail.prompt ?? "")
    );
    assert.deepEqual(
      transportQuestions.map((detail) => detail.prompt ?? ""),
      []
    );
    assert.ok(result.summary.transportFieldRepairCount >= 1);
    assert.equal(result.summary.transportFieldRepairQuestionCount, 0);
  });

  await test("\"Terminal\" is not airport context — the detector stays awake on real rows", () => {
    // Every flight row in the shipped QA bundles says "Terminal 2b" or
    // similar, and a coach row can say "Vienna International Bus Terminal".
    // Treating that word as airport context would have exempted almost the
    // entire corpus and quietly disabled this arc.
    const busRow = {
      arrival: "JFK",
      date: "2019-01-12",
      departure: "Vienna",
      departureTime: "07:00",
      description: "Departs from Vienna International Bus Terminal.",
      title: "Coach to the coast",
      type: "bus",
    };
    const flightRow = {
      arrival: "FCO",
      date: "2019-01-24",
      departure: "Wien Hbf",
      departureTime: "12:20",
      description: "Wizz Air W6 2339 from Budapest (Terminal 2b) to Rome Fiumicino.",
      title: "Wizz Air W6 2339",
      type: "flight",
    };
    const result = repairTransportFieldBleed({
      anchors: [],
      targets: [
        { id: "bus", payload: busRow },
        { id: "flight", payload: flightRow },
      ],
    });

    assert.equal(busRow.arrival, null, "a bus still cannot arrive at an IATA code");
    assert.equal(
      flightRow.departure,
      null,
      "a flight still cannot depart from a Hauptbahnhof"
    );
    assert.equal(result.repairs.length, 2);
    assert.equal(result.questions.length, 2);
  });

  await test("a clock-format variant in a sibling field is cleared too", () => {
    // `endTime` feeds `arrivalTime` through the finalize coalesce. A plain
    // string compare left "10:42 AM" behind, and the retry lane would
    // re-coalesce and re-clear the field on every pass.
    const payload: Record<string, unknown> = {
      arrival: "Budapest-Keleti",
      arrivalTime: "10:42",
      date: "2019-01-21",
      departure: "Wien Hbf",
      departureTime: "10:42",
      endTime: "10:42 AM",
      title: "Train to Budapest",
      type: "train",
    };
    repairTransportFieldBleed({ anchors: [], targets: [{ id: "p", payload }] });

    assert.equal(payload.arrivalTime, null);
    assert.equal(payload.endTime, null, "the coalesce source is cleared as the same instant");
  });
}
