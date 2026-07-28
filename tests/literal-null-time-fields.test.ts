import assert from "node:assert/strict";
import { normalizeParserStageArtifacts } from "@/lib/extraction/parser-artifact-normalization";
import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";

// Run 7.28.0, docket §G: 31 cards carried the LITERAL STRING "null" as their
// startTime and 14 as their endTime, and the summary surface rendered text
// such as "null · Art and culture."
//
// This is malformed output, not an unresolved decision, and it lands against
// AGENTS.md §Dark-factory: "A processing stage may be recorded as completed
// only after its output passes the validation required by the next persisted
// boundary." Assembly was recorded `completed` with output that fails the
// render boundary. The repair is therefore bounded, deterministic, silent and
// counted (RW-QA-001 / RW-OPS-001) — never a maker-facing question.
//
// Run-2 bar, MUST IMPROVE: zero literal-`null` start times.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function stageWith(stage: Record<string, unknown>): EvidenceStageInput {
  return {
    label: "Wednesday, January 16th",
    source: "model_chunk",
    stage: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      ...stage,
    },
  } as EvidenceStageInput;
}

function activitiesOf(result: { stages: EvidenceStageInput[] }) {
  const stage = result.stages[0].stage as Record<string, unknown>;
  return stage.activities as Array<Record<string, unknown>>;
}

function transportOf(result: { stages: EvidenceStageInput[] }) {
  const stage = result.stages[0].stage as Record<string, unknown>;
  return stage.transport as Array<Record<string, unknown>>;
}

export default async function run() {
  await test('docket §G: the literal string "null" is cleared to a real null on activity time fields', () => {
    const result = normalizeParserStageArtifacts([
      stageWith({
        activities: [
          {
            category: "art_culture",
            date: "2019-01-16",
            endTime: "null",
            itemType: "activity",
            startTime: "null",
            title: "Peklo",
          },
        ],
      }),
    ]);

    const [card] = activitiesOf(result);
    assert.equal(card.startTime, null, "a real null, not the four characters");
    assert.equal(card.endTime, null);
    assert.equal(
      typeof card.startTime,
      "object",
      'the render boundary must never see the string "null"'
    );
  });

  await test("docket §G: the repair is counted, never silent (RW-OPS-001 support telemetry)", () => {
    const result = normalizeParserStageArtifacts([
      stageWith({
        activities: [
          {
            date: "2019-01-16",
            itemType: "activity",
            startTime: "null",
            title: "Changing of the Guard",
          },
        ],
      }),
    ]);

    const repairs = result.repairs.filter(
      (repair) => repair.kind === "literal_null_time_field"
    );
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].title, "Changing of the Guard");
    assert.match(repairs[0].detail, /startTime/);
  });

  await test("docket §G: ordering is load-bearing — a null/null pair must not be eaten by the degenerate-pair rule", () => {
    // startTime "null" and endTime "null" compare EQUAL. If the degenerate
    // time-pair rule ran first it would clear endTime, return early, and
    // leave the literal "null" sitting in startTime — the exact field the
    // run-2 bar counts.
    const result = normalizeParserStageArtifacts([
      stageWith({
        activities: [
          {
            category: "art_culture",
            date: "2019-01-16",
            endTime: "null",
            itemType: "activity",
            startTime: "null",
            title: "Catacombs tour",
          },
        ],
      }),
    ]);

    const [card] = activitiesOf(result);
    assert.equal(card.startTime, null, "startTime is repaired, not skipped");
    assert.equal(card.endTime, null);
    assert.equal(
      result.repairs.filter((repair) => repair.kind === "degenerate_end_time")
        .length,
      0,
      "two literal nulls are not a degenerate time PAIR"
    );
  });

  await test('docket §G: "undefined" is the same stringified-nullish artifact and is cleared too', () => {
    const result = normalizeParserStageArtifacts([
      stageWith({
        activities: [
          {
            date: "2019-01-16",
            itemType: "activity",
            startTime: " UNDEFINED ",
            title: "Old Town Square",
          },
        ],
      }),
    ]);

    assert.equal(activitiesOf(result)[0].startTime, null);
  });

  await test("docket §G: real times, real nulls and absent fields are all untouched", () => {
    const result = normalizeParserStageArtifacts([
      stageWith({
        activities: [
          {
            date: "2019-01-16",
            itemType: "activity",
            startTime: "14:30",
            title: "Booked walking tour",
          },
          {
            date: "2019-01-16",
            endTime: null,
            itemType: "activity",
            startTime: null,
            title: "Wander Malá Strana",
          },
          { date: "2019-01-16", itemType: "activity", title: "Lunch" },
        ],
      }),
    ]);

    const [timed, explicitNull, absent] = activitiesOf(result);
    assert.equal(timed.startTime, "14:30", "a real time is never touched");
    assert.equal(explicitNull.startTime, null);
    assert.equal(absent.startTime, undefined, "an absent field stays absent");
    assert.equal(
      result.repairs.filter(
        (repair) => repair.kind === "literal_null_time_field"
      ).length,
      0,
      "clean input produces no repairs at all"
    );
  });

  await test("docket §G: a title that is legitimately the word Null is not a time field and is left alone", () => {
    // Bounded to TIME fields on purpose. A wider sweep over every string
    // field is a different change with a different blast radius, and nothing
    // in the run evidences it.
    const result = normalizeParserStageArtifacts([
      stageWith({
        activities: [
          {
            date: "2019-01-16",
            description: "null",
            itemType: "activity",
            title: "Null Island exhibit",
          },
        ],
      }),
    ]);

    const [card] = activitiesOf(result);
    assert.equal(card.title, "Null Island exhibit");
    assert.equal(card.description, "null", "description is out of scope");
  });

  await test("docket §G: transport time fields are covered — measured 0 affected, and a no-op on clean rows", () => {
    const result = normalizeParserStageArtifacts([
      stageWith({
        transport: [
          {
            arrivalTime: "null",
            date: "2019-01-17",
            departureTime: "08:12",
            routeLabel: "Prague to Vienna",
            type: "train",
          },
        ],
      }),
    ]);

    const [row] = transportOf(result);
    assert.equal(row.arrivalTime, null);
    assert.equal(row.departureTime, "08:12", "a real departure is untouched");
    assert.equal(
      result.repairs.filter(
        (repair) => repair.kind === "literal_null_time_field"
      )[0]?.title,
      "Prague to Vienna",
      "the repair names the route it touched"
    );
  });
}
