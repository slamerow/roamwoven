import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

function stage({
  activities = [],
  label,
  places = [],
  sourceText,
}: {
  activities?: Array<Record<string, unknown>>;
  label: string;
  places?: Array<Record<string, unknown>>;
  sourceText: string;
}): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: "sanitized-itinerary.txt",
    sourceText,
    stage: {
      activities,
      missingDetails: [],
      places,
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

function sourcePosition({
  blockId,
  line,
  relationshipSignal = false,
  stageIndex = 0,
}: {
  blockId: string;
  line: number;
  relationshipSignal?: boolean;
  stageIndex?: number;
}) {
  return {
    blockIds: [blockId],
    line,
    relationshipSignal,
    sourceIdentityHash: "sanitized-source",
    stageIndex,
  };
}

function plannedActivity({
  category = "art_culture",
  city = "Sample City",
  date,
  description,
  evidence,
  extra = {},
  startTime = null,
  title,
}: {
  category?: string;
  city?: string;
  date: string;
  description: string | null;
  evidence: string;
  extra?: Record<string, unknown>;
  startTime?: string | null;
  title: string;
}) {
  return {
    category,
    city,
    date,
    description,
    evidence,
    evidenceRole: "atomic_candidate",
    itemType: "activity",
    sourceHeadingPath: [date],
    sourceSectionType: "dated_itinerary",
    startTime,
    title,
    ...extra,
  };
}

function draftActivities(result: ReturnType<typeof clusterExtractedEvidence>) {
  const draft = result.draft as {
    activities?: Array<Record<string, unknown>>;
  };
  return draft.activities ?? [];
}

export default async function run() {
  const { test } = await import("node:test");

  await test("a named timed multi-stop route survives identity and owns its source-listed stops without resolver help", () => {
    const routeBlock = "source-block-route";
    const section = "Walking tour / history / free time";
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          label: "Saturday, April 12th",
          sourceText: [
            "Saturday, April 12th",
            "9:00 AM Market Square and Heritage Quarter Hidden Stories tour",
            "Includes Market Square and Heritage Quarter.",
            "Market Square",
            "Heritage Quarter",
          ].join("\n"),
          activities: [
            plannedActivity({
              date: "2030-04-12",
              description:
                "Morning walking tour: Market Square and Heritage Quarter Hidden Stories. Includes Market Square and Heritage Quarter.",
              evidence: "Walking tour in the morning at 9:00 AM.",
              startTime: "09:00",
              title: "Market Square and Heritage Quarter Hidden Stories",
              extra: {
                _canonicalSourcePosition: sourcePosition({
                  blockId: routeBlock,
                  line: 2,
                }),
                sourceSectionLabel: section,
              },
            }),
            plannedActivity({
              date: "2030-04-12",
              description: "Visit Market Square.",
              evidence: "Market Square",
              title: "Market Square",
              extra: {
                _canonicalSourcePosition: sourcePosition({
                  blockId: routeBlock,
                  line: 4,
                  relationshipSignal: true,
                }),
                sourceSectionLabel: section,
              },
            }),
            plannedActivity({
              date: "2030-04-12",
              description: "Visit Heritage Quarter.",
              evidence: "Heritage Quarter",
              title: "Heritage Quarter",
              extra: {
                _canonicalSourcePosition: sourcePosition({
                  blockId: routeBlock,
                  line: 5,
                  relationshipSignal: true,
                }),
                sourceSectionLabel: section,
              },
            }),
          ],
        }),
      ],
      tripOverview: { dateRange: "April 12-13, 2030" },
    });
    const activities = draftActivities(result);
    const parent = activities.find((item) =>
      /hidden stories/i.test(String(item.title))
    );

    assert.ok(parent, "the source-named tour remains the parent card");
    assert.equal(parent._canonicalGroupRole, "parent");
    assert.deepEqual(
      activities
        .filter(
          (item) => item._canonicalParentPieceId === parent._canonicalPieceId
        )
        .map((item) => item.title),
      ["Market Square", "Heritage Quarter"]
    );
  });

  await test("an anaphoric same-block site detail folds into the named visit while the next-day component remains distinct", () => {
    const visitBlock = "source-block-site-visit";
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          label: "Saturday, April 12th",
          sourceText: [
            "Saturday, April 12th",
            "Szent Imre basilica",
            "Tour the Basilica and climb the dome for views.",
          ].join("\n"),
          activities: [
            plannedActivity({
              category: "art_culture",
              date: "2030-04-12",
              description: "Visit Szent Imre Basilica and consider the dome.",
              evidence: "Szent Imre basilica",
              title: "Szent Imre Basilica",
              extra: {
                _canonicalSourcePosition: sourcePosition({
                  blockId: visitBlock,
                  line: 2,
                }),
                sourceSectionLabel: "Saturday, April 12th",
              },
            }),
            plannedActivity({
              category: "temple_shrine",
              date: "2030-04-12",
              description: null,
              evidence: "Tour the Basilica and climb the dome for views.",
              title: "St. Emery Basilica",
              extra: {
                _canonicalSourcePosition: sourcePosition({
                  blockId: visitBlock,
                  line: 3,
                }),
                sourceSectionLabel: "Saturday, April 12th",
              },
            }),
          ],
        }),
        stage({
          label: "Sunday, April 13th",
          sourceText: "Sunday, April 13th\nSt. Emery Basilica tower for the view",
          activities: [
            plannedActivity({
              date: "2030-04-13",
              description: "See the tower for the view.",
              evidence: "St. Emery Basilica tower for the view",
              title: "St. Emery Basilica tower",
              extra: {
                _canonicalSourcePosition: sourcePosition({
                  blockId: "source-block-next-day",
                  line: 2,
                  stageIndex: 1,
                }),
                sourceSectionLabel: "Sunday, April 13th",
              },
            }),
          ],
        }),
      ],
      tripOverview: { dateRange: "April 12-13, 2030" },
    });
    const activities = draftActivities(result);

    assert.equal(
      activities.filter(
        (item) =>
          item.date === "2030-04-12" && /basilica/i.test(String(item.title))
      ).length,
      1,
      "one named site visit survives on the first day"
    );
    assert.equal(
      activities.filter(
        (item) =>
          item.date === "2030-04-13" && /basilica tower/i.test(String(item.title))
      ).length,
      1,
      "the separately authored next-day component keeps its own date"
    );
  });

  await test("a day-trip town note derives its City Note home from the dated parent leg", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          label: "Saturday, April 12th",
          sourceText:
            "Saturday, April 12th\nDaytrip Village\nReturn to Capital City by 5 for an evening idea.",
          places: [
            {
              arriveDate: "2030-04-11",
              city: "Capital City",
              country: "Sampleland",
              leaveDate: "2030-04-14",
            },
          ],
          activities: [
            {
              category: "admin_logistics",
              city: "Daytrip Village",
              date: "2030-04-12",
              description: "Return to Capital City by 5 for an evening idea.",
              evidence: "Return to Capital City by 5 for an evening idea.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              sourceHeadingPath: ["Saturday, April 12th", "Daytrip Village"],
              sourceSectionLabel: "Daytrip Village",
              sourceSectionType: "dated_itinerary",
              title: "Daytrip Village note",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-14, 2030" },
    });
    const notes = draftActivities(result).filter(
      (item) => item.itemType === "note"
    );

    assert.equal(notes.length, 1);
    assert.equal(notes[0].city, "Capital City");
    assert.equal(notes[0].title, "Capital City Notes & Tips");
  });

  await test("a dated return-city note follows agreeing source text and leg date instead of a stale parser city", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          label: "Saturday, April 12th",
          sourceText:
            "Saturday, April 12th\nTravel back to Return City and eat some noodles.",
          places: [
            {
              arriveDate: "2030-04-10",
              city: "Origin City",
              country: "Sampleland",
              leaveDate: "2030-04-12",
            },
            {
              arriveDate: "2030-04-12",
              city: "Return City",
              country: "Sampleland",
              leaveDate: "2030-04-14",
            },
          ],
          activities: [
            {
              category: "food_drink",
              city: "Origin City",
              date: "2030-04-12",
              description: "Travel back to Return City and eat some noodles.",
              evidence: "Travel back to Return City and eat some noodles.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              sourceHeadingPath: [
                "Saturday, April 12th",
                "Travel back to Return City and eat some noodles.",
              ],
              sourceSectionLabel:
                "Travel back to Return City and eat some noodles.",
              sourceSectionType: "dated_itinerary",
              title: "Return City dinner note",
            },
          ],
        }),
      ],
      tripOverview: { dateRange: "April 10-14, 2030" },
    });
    const notes = draftActivities(result).filter(
      (item) => item.itemType === "note"
    );

    assert.equal(notes.length, 1);
    assert.equal(notes[0].city, "Return City");
    assert.equal(notes[0].title, "Return City Notes & Tips");
    assert.match(String(notes[0].description), /noodles/i);
  });

  await test("an unexplained lower-case source token stays visible as a provisional plan with an applicable title question", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage({
          label: "Saturday, April 12th",
          sourceText:
            "Saturday, April 12th\nGet back by 5 to go to drimko and maybe the history museum.",
          places: [
            {
              arriveDate: "2030-04-11",
              city: "Capital City",
              country: "Sampleland",
              leaveDate: "2030-04-14",
            },
          ],
          activities: [
            plannedActivity({
              category: "admin_logistics",
              city: "Capital City",
              date: "2030-04-12",
              description: "Go to drimko.",
              evidence:
                "Get back by 5 to go to drimko and maybe the history museum.",
              title: "drimko",
              extra: {
                _canonicalSourcePosition: sourcePosition({
                  blockId: "source-block-unresolved-token",
                  line: 2,
                }),
                sourceSectionLabel: "Saturday, April 12th",
              },
            }),
          ],
        }),
      ],
      tripOverview: { dateRange: "April 11-14, 2030" },
    });
    const plan = draftActivities(result).find((item) =>
      /drimko/i.test(String(item.title))
    );
    const questions = (
      result.draft as {
        missingDetails?: Array<Record<string, unknown>>;
      }
    ).missingDetails ?? [];

    assert.ok(plan, "the intended action remains visible");
    assert.match(String(plan.title), /^Unidentified plan:/i);
    assert.equal(plan._recoveryRequired, true);
    assert.ok(
      questions.some(
        (question) =>
          question.relatedCanonicalPieceId === plan._canonicalPieceId &&
          question.targetField === "title" &&
          /drimko/i.test(String(question.prompt))
      ),
      "the maker can resolve the token on the actual plan record"
    );
  });
}
