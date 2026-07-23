import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import { assembleCanonicalTripDraft } from "@/lib/extraction/canonical-trip-assembly";

// Live-run 7.23.1 terminal failure (trip cc2cd30f, assembly-recovery-
// required). Two defects, both reproduced here from the live event log:
//
//  1. initialError "activities identity order does not match canonical
//     evidence artifacts" — fired on THREE consecutive live parses: the
//     draft groups its activities collection (activity-kind pieces, then
//     note-kind), the artifact inspection expected the kinds interleaved
//     in raw piece order. Any eligible note piece ordered before an
//     eligible activity piece trips it.
//  2. retryError "missingDetails[3] changed canonical subject
//     piece_2a10274a… to <tripId>" — a question whose subject piece still
//     exists but lost output eligibility after minting: the draft kept
//     the dead subject id, the projection resolved to trip, and the
//     compile invariant refused the disagreement, killing the run.
//
// The dark-factory contract (AGENTS.md): once the parser has returned a
// usable draft plus evidence pieces, identity/manifest defects are
// internal recovery work and may NOT terminate in a technical recovery
// state. These fixtures hold assembly to that contract.

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

function stage(label: string, stageValue: Record<string, unknown>) {
  return { label, source: "model_chunk" as const, stage: stageValue };
}

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

export default async function run() {
  await test("7.23.1 defect 1: a note piece ordered before an activity piece assembles clean — no recovery corridor", () => {
    // The hedged copy ("maybe Museum X") intakes as a NOTE piece before
    // the later timed activity — an eligible note ahead of an eligible
    // activity in raw piece order, the exact interleaving that tripped
    // the order check on all three live runs.
    const evidence = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 14th", emptyStage({
          activities: [
            {
              title: "Prague ideas",
              itemType: "note",
              description: "maybe Museum of Communism",
              noteRole: "city_note_candidate",
            },
            {
              title: "Hemingway Bar",
              date: "2019-01-14",
              startTime: "18:00",
              category: "nightlife_entertainment",
              description: "Hemingway Bar at 6 PM.",
            },
            {
              title: "Charles Bridge",
              date: "2019-01-14",
              category: "art_culture",
              description: "Charles Bridge walk.",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const assembly = assembleCanonicalTripDraft({
      draft: evidence.draft,
      evidencePieces: evidence.pieces,
      fallbackTripName: "7.23.1 order fixture",
      tripId: "72310000-0000-0000-0000-000000000001",
    });

    // The contract: a usable parse ALWAYS compiles. The corridor is for
    // genuine corruption, not for the emitter's own documented ordering.
    assert.equal(
      assembly.recovery.status,
      "not_needed",
      `assembly took the recovery corridor: ${JSON.stringify(assembly.recovery)}`
    );
    assert.ok(assembly.records.items.length >= 2);
  });

  await test("7.23.1 defect 2: a question whose subject card dies after minting is dismissed + unbound, and the run completes", () => {
    // The subject activity exists but a suppression path takes its card
    // away after the question was minted (here: traveler movement
    // represented by canonical transport — the day-plan flight copy).
    const evidence = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Saturday, January 12th", emptyStage({
          activities: [
            {
              title: "Delta Flight 5925",
              date: "2019-01-12",
              category: "arrival_departure",
              description: "Delta Flight 5925 to JFK.",
            },
          ],
          transport: [
            {
              title: "Delta Flight 5925",
              date: "2019-01-12",
              type: "flight",
              departureLocation: "DCA",
              arrivalLocation: "JFK",
              departureTime: "17:00",
              arrivalTime: "18:41",
              provider: "Delta",
            },
          ],
          missingDetails: [
            {
              confidence: "medium",
              evidence: "Delta Flight 5925 to JFK.",
              guessedValue: null,
              prompt: "What seat is booked on Delta Flight 5925?",
              reason: "The source names the flight but not the seat.",
              relatedTitle: "Delta Flight 5925",
              subjectType: "item",
              targetField: "description",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const assembly = assembleCanonicalTripDraft({
      draft: evidence.draft,
      evidencePieces: evidence.pieces,
      fallbackTripName: "7.23.1 subject fixture",
      tripId: "72310000-0000-0000-0000-000000000002",
    });

    // However the question resolved — forwarded to a living subject or
    // dismissed with its dead one — the run compiles, and draft and
    // projection agree about every question's subject.
    for (const question of assembly.records.reviewQuestions) {
      assert.ok(
        question.subjectCanonicalId,
        "every question record carries a resolved subject"
      );
    }
    const items = assembly.records.items.map((item) => item.canonicalId);
    const rows = assembly.records.transport.map((row) => row.canonicalId);
    for (const question of assembly.records.reviewQuestions) {
      if (question.subjectType === "item") {
        assert.ok(items.includes(question.subjectCanonicalId));
      }
      if (question.subjectType === "transport") {
        assert.ok(rows.includes(question.subjectCanonicalId));
      }
    }
  });
}
