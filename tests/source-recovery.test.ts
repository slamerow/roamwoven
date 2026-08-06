import assert from "node:assert/strict";
import {
  applySourceRecoveryToCoverage,
  buildSourceRecoveryFailureStage,
  buildSourceRecoveryStage,
  planSourceRecoveryBatch,
  runBoundedSourceRecovery,
  SOURCE_RECOVERY_STAGE_LABEL,
} from "@/lib/extraction/source-recovery";
import type { SourceCoverageSummary } from "@/lib/extraction/source-coverage";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// RW-EVD-001 bounded recovery call (Arc A). The koscom / Szechenyi Baths
// shapes are the 4-run chronic parser drops from live runs 7.17.x-7.18.2.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function coverageWith(
  stages: SourceCoverageSummary["stages"]
): SourceCoverageSummary {
  const uncoveredLineCount = stages.reduce(
    (sum, stage) => sum + stage.uncoveredLines.length,
    0
  );

  return {
    crossStageCoveredLineCount: 0,
    daySectionCount: stages.length,
    meaningfulLineCount: uncoveredLineCount + 5,
    stages,
    uncoveredLineCount,
    weakCreditLines: [],
    version: 3,
  };
}

const KOSCOM_COVERAGE = coverageWith([
  {
    dayHeading: "Thursday, January 17th",
    label: "Thursday, January 17th",
    meaningfulLineCount: 6,
    uncoveredLines: [
      { excerpt: "go to koscom", lineIndex: 4, uncoveredClauses: ["go to koscom"] },
      {
        excerpt: "maybe communism museum",
        lineIndex: 5,
        uncoveredClauses: ["maybe communism museum"],
      },
    ],
  },
  {
    dayHeading: "Monday, January 21st // Budapest Bathing",
    label: "Monday, January 21st",
    meaningfulLineCount: 4,
    uncoveredLines: [
      {
        excerpt: "Szechenyi Baths or Gellert - 6500 Ft",
        lineIndex: 2,
        uncoveredClauses: ["Szechenyi Baths", "Gellert - 6500 Ft"],
      },
    ],
  },
]);

export default async function run() {
  await test("recovery plan: one batched excerpt-only input under hard caps, dropped lines counted (never silent)", () => {
    const plan = planSourceRecoveryBatch({
      coverage: KOSCOM_COVERAGE,
      maxInputChars: 4000,
      maxLines: 60,
    });

    assert.ok(plan, "uncovered lines produce a plan");
    assert.equal(plan.batchedLineCount, 3);
    assert.equal(plan.droppedLineCount, 0);
    assert.match(plan.input, /go to koscom/);
    assert.match(plan.input, /Szechenyi Baths or Gellert/);
    assert.match(plan.input, /Day heading: Thursday, January 17th/);

    const capped = planSourceRecoveryBatch({
      coverage: KOSCOM_COVERAGE,
      maxInputChars: 4000,
      maxLines: 2,
    });
    assert.ok(capped);
    assert.equal(capped.batchedLineCount, 2);
    assert.equal(capped.droppedLineCount, 1, "over-cap lines are counted");

    assert.equal(
      planSourceRecoveryBatch({
        coverage: coverageWith([]),
        maxInputChars: 4000,
        maxLines: 60,
      }),
      null,
      "no uncovered lines, no plan, no model call"
    );
  });

  await test("recovery call: exactly ONE model request, usage recorded separately, coverage reconciled", async () => {
    let calls = 0;
    const result = await runBoundedSourceRecovery({
      caps: {
        maxInputChars: 4000,
        maxLines: 60,
        maxOutputTokens: 8000,
        model: "recovery-model-x",
      },
      coverage: KOSCOM_COVERAGE,
      requestRecovery: async (request) => {
        calls += 1;
        assert.equal(request.model, "recovery-model-x");
        assert.equal(request.maxOutputTokens, 8000);
        return {
          json: {
            activities: [
              {
                category: "art_culture",
                city: "Prague",
                date: "2019-01-17",
                description: "go to koscom",
                itemType: "activity",
                title: "koscom",
              },
              {
                category: "tours_tickets",
                city: "Budapest",
                date: "2019-01-21",
                description: "Szechenyi Baths or Gellert - 6500 Ft",
                itemType: "activity",
                title: "Szechenyi Baths or Gellert",
              },
            ],
            missingDetails: [],
            places: [],
            sensitiveDetails: [],
            stays: [],
            transport: [],
          },
          model: "recovery-model-x",
          usage: { total_tokens: 1234 },
        };
      },
      stages: [],
    });

    assert.equal(calls, 1, "one bounded call per build, never retried");
    assert.ok(result.stage, "success synthesizes a recovery stage");
    assert.equal(result.stage.label, SOURCE_RECOVERY_STAGE_LABEL);
    assert.equal(
      (result.stage.stage as Record<string, unknown>)._sourceRecovery,
      true
    );
    assert.equal(result.usage.outcome, "recovered");
    assert.equal(result.usage.batchedLineCount, 3);
    assert.equal(result.usage.deterministicResidualLineCount, 0);
    assert.equal(result.usage.tokenUsage !== null, true);
    assert.equal(
      result.usage.recoveredLineCount,
      2,
      "koscom and the baths line reconcile as recovered"
    );
    assert.equal(
      result.usage.residualUncoveredLineCount,
      1,
      "the unrecovered 'maybe communism museum' line stays precisely flagged"
    );
    assert.equal(result.coverage.uncoveredLineCount, 1);
  });

  await test("successful recovery conserves still-missed reference lines as notes but never converts a planned line", () => {
    const referenceCoverage = coverageWith([
      {
        dayHeading: "Tuesday, January 22nd, 2019",
        label: "Tuesday, January 22nd",
        meaningfulLineCount: 8,
        uncoveredLines: [
          {
            excerpt: "2) Thermal baths - we recommend them",
            lineIndex: 1,
            uncoveredClauses: ["2) Thermal baths - we recommend them"],
          },
          {
            excerpt: "Dohany street synagogue",
            lineIndex: 2,
            uncoveredClauses: ["Dohany street synagogue"],
          },
          {
            excerpt: "3) Buda hills - if you want a loop, take the children's train",
            lineIndex: 3,
            uncoveredClauses: ["3) Buda hills - if you want a loop, take the children's train"],
          },
          {
            excerpt: "4) Public transportation - super easy, buy a pack of tickets",
            lineIndex: 4,
            uncoveredClauses: ["4) Public transportation - super easy, buy a pack of tickets"],
          },
          {
            excerpt: "My best meal was a Russian restaurant",
            lineIndex: 5,
            uncoveredClauses: ["My best meal was a Russian restaurant"],
          },
          {
            excerpt: "http://example-restaurant.test/en/",
            lineIndex: 6,
            uncoveredClauses: ["http://example-restaurant.test/en/"],
          },
          {
            excerpt: "Tour the museum at 3:00 PM",
            lineIndex: 7,
            uncoveredClauses: ["Tour the museum at 3:00 PM"],
          },
        ],
      },
    ]);
    const plan = planSourceRecoveryBatch({
      coverage: referenceCoverage,
      maxInputChars: 4000,
      maxLines: 60,
    });
    assert.ok(plan);
    const recoveryStage = buildSourceRecoveryStage(
      {
        activities: [
          {
            city: "Example City",
            date: "2019-01-22",
            description: "2) Thermal baths - we recommend them",
            evidenceRole: "city_note_candidate",
            itemType: "note",
            title: "Thermal baths",
          },
        ],
      },
      plan
    );
    const stage = recoveryStage.stage as {
      _deterministicResidualLineCount: number;
      activities: Array<Record<string, unknown>>;
    };
    assert.equal(stage._deterministicResidualLineCount, 5);
    assert.equal(
      stage.activities.some((activity) =>
        /tour the museum/i.test(String(activity.description))
      ),
      false,
      "timed planned evidence remains residual instead of being silently recast as a note"
    );
    for (const token of [
      "Dohany",
      "children's train",
      "Public transportation",
      "Russian restaurant",
      "example-restaurant",
    ]) {
      const recovered = stage.activities.find((activity) =>
        JSON.stringify(activity).includes(token)
      );
      assert.ok(recovered, `${token} receives a deterministic evidence carrier`);
      assert.equal(recovered.itemType, "note");
      assert.equal(recovered.evidenceRole, "city_note_candidate");
      assert.equal(recovered.date, "2019-01-22");
    }
  });

  await test("recovery call: one per build — a prior recovery stage means no second call", async () => {
    let calls = 0;
    const priorStage = buildSourceRecoveryStage(
      { activities: [] },
      planSourceRecoveryBatch({
        coverage: KOSCOM_COVERAGE,
        maxInputChars: 4000,
        maxLines: 60,
      })!
    );
    const result = await runBoundedSourceRecovery({
      caps: {
        maxInputChars: 4000,
        maxLines: 60,
        maxOutputTokens: 8000,
        model: "recovery-model-x",
      },
      coverage: KOSCOM_COVERAGE,
      requestRecovery: async () => {
        calls += 1;
        throw new Error("must not be called");
      },
      stages: [priorStage],
    });

    assert.equal(calls, 0);
    assert.equal(result.stage, null);
  });

  await test("recovery failure: the draft survives with ONE precise maker question (targetField sourceRecovery)", async () => {
    const result = await runBoundedSourceRecovery({
      caps: {
        maxInputChars: 4000,
        maxLines: 60,
        maxOutputTokens: 8000,
        model: "recovery-model-x",
      },
      coverage: KOSCOM_COVERAGE,
      requestRecovery: async () => {
        throw new Error("OpenAI request failed with 500.");
      },
      stages: [],
    });

    assert.equal(result.usage.outcome, "failed");
    assert.equal(result.usage.error?.message, "OpenAI request failed with 500.");
    assert.ok(result.stage, "failure ships a question stage, not a dead run");
    const stage = result.stage.stage as {
      activities: unknown[];
      missingDetails: Array<Record<string, unknown>>;
    };
    assert.equal(stage.activities.length, 0, "no placeholder cards");
    assert.equal(stage.missingDetails.length, 1, "at most ONE maker question");
    assert.equal(stage.missingDetails[0].targetField, "sourceRecovery");
    assert.equal(stage.missingDetails[0].subjectType, "trip");
    assert.match(
      String(stage.missingDetails[0].prompt),
      /go to koscom/,
      "the question is precise about what could not be read"
    );
  });

  await test("recovered observations enter assembly as a normal late stage (clustering + source-truth verification)", () => {
    const plan = planSourceRecoveryBatch({
      coverage: KOSCOM_COVERAGE,
      maxInputChars: 4000,
      maxLines: 60,
    })!;
    const recoveryStage = buildSourceRecoveryStage(
      {
        activities: [
          {
            category: "art_culture",
            city: "Prague",
            date: "2019-01-17",
            description: "go to koscom",
            itemType: "activity",
            sourceSectionType: "dated_itinerary",
            title: "koscom",
          },
          {
            // Not supported by any excerpt: source-truth verification must
            // treat a fabricated recovery record like any other unsupported
            // record instead of trusting the recovery lane.
            category: "art_culture",
            city: "Prague",
            date: "2019-01-17",
            description: "Invented palace nobody mentioned.",
            itemType: "activity",
            sourceSectionType: "dated_itinerary",
            title: "Zlaty Fabricated Palace",
          },
        ],
        missingDetails: [],
        places: [],
        sensitiveDetails: [],
        stays: [],
        transport: [],
      },
      plan
    );
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        {
          label: "Thursday, January 17th",
          source: "model_chunk" as const,
          sourceText:
            "Thursday, January 17th\nSilver mines tour at 10:00\ngo to koscom",
          stage: {
            activities: [
              {
                category: "tours_tickets",
                city: "Prague",
                date: "2019-01-17",
                description: "Silver mines tour.",
                itemType: "activity",
                startTime: "10:00",
                title: "Silver mines tour",
              },
            ],
            missingDetails: [],
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                country: "Czechia",
                leaveDate: "2019-01-18",
              },
            ],
            sensitiveDetails: [],
            stays: [],
            transport: [],
          },
        },
        recoveryStage,
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const koscom = draft.activities.find((item) =>
      /koscom/i.test(String(item.title))
    );

    assert.ok(koscom, "the recovered koscom line becomes a normal card");
    assert.equal(koscom.date, "2019-01-17");
    assert.equal(
      draft.activities.some((item) => /fabricated/i.test(String(item.title))),
      false,
      "a recovery record with no excerpt support is suppressed"
    );
  });

  await test("run6 PB-9: a recovered record's date is BOUND to its excerpt's own day heading", () => {
    const plan = planSourceRecoveryBatch({
      coverage: coverageWith([
        {
          dayHeading: "Thursday, January 17th",
          label: "Thursday, January 17th",
          meaningfulLineCount: 4,
          uncoveredLines: [
            {
              excerpt: "Train to/from Cesky Krumlov",
              lineIndex: 3,
              uncoveredClauses: ["Train to/from Cesky Krumlov"],
            },
          ],
        },
      ]),
      maxInputChars: 4000,
      maxLines: 60,
    });
    assert.ok(plan, "plan exists");
    const recoveryStage = buildSourceRecoveryStage(
      {
        activities: [
          {
            category: "arrival_departure",
            city: "Cesky Krumlov",
            // The model mis-dated the recovered line into the Rome leg
            // (live-run 7.18.3 shipped it as a Jan 25 Rome-day activity).
            date: "2019-01-25",
            description: "Train to and from Cesky Krumlov.",
            itemType: "activity",
            title: "Train to/from Cesky Krumlov",
          },
        ],
      },
      plan
    );
    const stage = recoveryStage.stage as { activities: Array<Record<string, unknown>> };

    assert.equal(
      stage.activities[0].date,
      "2019-01-17",
      "the date is bound to the excerpt's own day heading"
    );
  });

  await test("run6 PB-9: a recovered date matching no excerpt heading clears instead of shipping", () => {
    const plan = planSourceRecoveryBatch({
      coverage: coverageWith([
        {
          dayHeading: "Thursday, January 17th",
          label: "Thursday, January 17th",
          meaningfulLineCount: 4,
          uncoveredLines: [
            {
              excerpt: "go to koscom",
              lineIndex: 4,
              uncoveredClauses: ["go to koscom"],
            },
          ],
        },
      ]),
      maxInputChars: 4000,
      maxLines: 60,
    });
    assert.ok(plan, "plan exists");
    const recoveryStage = buildSourceRecoveryStage(
      {
        activities: [
          {
            category: "sightseeing",
            city: "Rome",
            date: "2019-01-25",
            description: "A place the excerpts never mention.",
            itemType: "activity",
            title: "Unattributable extra",
          },
        ],
      },
      plan
    );
    const stage = recoveryStage.stage as { activities: Array<Record<string, unknown>> };

    assert.equal(
      stage.activities[0].date,
      null,
      "an unattributable model date outside every excerpt heading clears"
    );
  });
}
