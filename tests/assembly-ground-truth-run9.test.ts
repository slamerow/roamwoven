import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

// Live-run 7.22.4 (trip 59ccd1e3, build f1b8ab1) regression fixtures —
// Arc E fold guard. Shapes are drawn from the run's QA-bundle lineage
// (docs/assembly-defect-docket-2026-07-22-run-7.22.4.md), not invented:
// the PDF lists the Schönbrunn sights twice (day plan + trailing notes
// blob), the parse gave the copies no times, and every card in the family
// was folded into the suppressed "Schönbrunn visit" note with reason
// "repeated but never committed: the city-note copy is the single home".

const NOTES_BLOB_LABEL =
  "Czech out Eli's Colossal Eastern Europe Excursion (1).pdf notes";
const JAN_19_LABEL = "Saturday, January 19th";

function activity({
  city = "Vienna" as string | null,
  date = "2019-01-19" as string | null,
  description = null as string | null,
  itemType = "activity",
  sectionLabel = JAN_19_LABEL as string | null,
  title,
  extra = {} as Record<string, unknown>,
}: {
  city?: string | null;
  date?: string | null;
  description?: string | null;
  itemType?: string;
  sectionLabel?: string | null;
  title: string;
  extra?: Record<string, unknown>;
}) {
  return {
    address: null,
    category: "art_culture",
    city,
    date,
    description,
    endTime: null,
    itemType,
    sourceFilename: "czech-out.pdf",
    sourceSectionLabel: sectionLabel,
    startTime: null,
    title,
    ...extra,
  };
}

function stage(label: string, value: Record<string, unknown>): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: "czech-out.pdf",
    stage: value,
  };
}

function emptyStage(overrides: Record<string, unknown> = {}) {
  return {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    ...overrides,
  };
}

type Draft = {
  activities: Array<Record<string, unknown>>;
  missingDetails: Array<Record<string, unknown>>;
};

function cards(draft: Draft, pattern: RegExp) {
  return draft.activities.filter(
    (item) =>
      item.itemType !== "note" && pattern.test(String(item.title ?? ""))
  );
}

export default async function run() {
  const { test } = await import("node:test");

  const PALACE_DESCRIPTION =
    "Schonbrunn palace (free with pass-20) // Open til 5. On the grounds: " +
    "Gloriette, Orangeriegarten, Palm House, Apple Strudel Show, Panorama " +
    "Train pass.";

  const dayPlanActivities = [
    activity({
      description: PALACE_DESCRIPTION,
      title: "Schönbrunn Palace",
    }),
    activity({
      description: "Hilltop view above the palace gardens (free-4).",
      title: "Gloriette",
    }),
    activity({
      description: "Formal orangery on the grounds (free with pass).",
      title: "Orangeriegarten at Schönbrunn",
    }),
    activity({
      description: "Palm House (free-7) // Open til 6.",
      title: "Palm House at Schönbrunn",
    }),
    activity({
      description: "Apple strudel demonstration (free-8).",
      title: "Apple Strudel Show",
    }),
    activity({
      description: "Panorama Train pass (free-9).",
      title: "Panorama Train pass",
    }),
    // The idea set: same fold shape in 7.22.4, but NOT grouping structure
    // and NOT heading-named — the guard must leave these to the note copy.
    activity({
      description: "Giant wheel (free-12) // Open until 8.",
      title: "Ferris wheel",
    }),
    activity({
      description: "Historic amusement park, free to wander.",
      title: "The Prater",
    }),
  ];

  const notesBlobStage = stage(
    NOTES_BLOB_LABEL,
    emptyStage({
      activities: [
        // The parser re-emits the whole family from the trailing notes
        // blob (7.22.4: every family member had exactly two observations).
        ...dayPlanActivities.map((item) => ({
          ...item,
          sourceSectionLabel: NOTES_BLOB_LABEL,
        })),
        // The reference copy that became the "single home" in 7.22.4.
        activity({
          date: null,
          description:
            "Schönbrunn Palace, Gloriette, Orangeriegarten, Palm House, " +
            "Apple Strudel Show, Panorama Train pass, Ferris wheel, The " +
            "Prater — Vienna sights.",
          itemType: "note",
          sectionLabel: NOTES_BLOB_LABEL,
          title: "Schönbrunn visit",
        }),
      ],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
    })
  );

  await test("run9 fold guard: the Schönbrunn family survives its notes-blob reference copy and the idea set does not", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(JAN_19_LABEL, emptyStage({ activities: dayPlanActivities })),
        notesBlobStage,
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as Draft;

    // Grouping structure survives: the container and its source-hierarchy
    // members ship as dated cards (ship-bar floor: survive AND group).
    for (const pattern of [
      /^schönbrunn palace$/i,
      /gloriette/i,
      /orangeriegarten/i,
      /palm house/i,
    ]) {
      const matches = cards(draft, pattern);
      assert.equal(
        matches.length,
        1,
        `${pattern} ships exactly one dated card (7.22.4 shipped zero)`
      );
      assert.equal(
        matches[0].date,
        "2019-01-19",
        `${pattern} keeps its day-plan date`
      );
    }

    // The idea set keeps the 7.22.4 behavior: the note copy is the single
    // home; the guard must not resurrect it (answer key: Jan 19 "everything
    // else" is Vienna city notes).
    for (const pattern of [/ferris wheel/i, /^the prater$/i]) {
      assert.equal(
        cards(draft, pattern).length,
        0,
        `${pattern} stays with its city-note copy, never a dated card`
      );
    }

    // Survive AND group: the components parent under the container-named
    // site via source hierarchy (at-site titles + container description).
    const palace = cards(draft, /^schönbrunn palace$/i)[0];
    const children = draft.activities.filter(
      (item) => item._canonicalParentPieceId
    );
    assert.ok(
      children.length >= 2,
      `at least two stops join the Schönbrunn visit (got ${children.length})`
    );
    assert.ok(
      palace._canonicalGroupRole === "parent" ||
        children.every(
          (child) => child._canonicalParentPieceId === palace._canonicalPieceId
        ),
      "the palace is the visit's parent"
    );
  });

  await test("run9 fold guard: a heading-committed entity never folds into its note copy, a hedged copy still does", () => {
    const CASTLE_LABEL = "Wednesday, January 16th Lesser Town & Prague Castle";
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          CASTLE_LABEL,
          emptyStage({
            activities: [
              activity({
                city: "Prague",
                date: "2019-01-16",
                description:
                  "Need to decide which ticket to get (350-880 CZK).",
                sectionLabel: CASTLE_LABEL,
                title: "Prague Castle",
              }),
              // Doubt markers stay authoritative (RW-CLS-001): a hedged
              // copy is never a protected plan copy.
              activity({
                city: "Prague",
                date: "2019-01-16",
                description: "R2D2 (far away)",
                sectionLabel: CASTLE_LABEL,
                title: "R2D2",
              }),
            ],
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                country: "Czech Republic",
                leaveDate: "2019-01-18",
              },
            ],
          })
        ),
        stage(
          NOTES_BLOB_LABEL,
          emptyStage({
            activities: [
              activity({
                city: "Prague",
                date: null,
                description:
                  "Prague Castle, St. Vitus Cathedral, R2D2, Kafka statue — " +
                  "Lesser Town sights.",
                itemType: "note",
                sectionLabel: NOTES_BLOB_LABEL,
                title: "Prague note",
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as Draft;

    const castle = cards(draft, /^prague castle$/i);
    assert.equal(
      castle.length,
      1,
      "the day heading names the castle: it never yields to the note copy"
    );
    assert.equal(castle[0].date, "2019-01-16", "castle keeps its day");

    assert.equal(
      cards(draft, /r2d2/i).length,
      0,
      "the hedged copy still folds/demotes — doubt markers stay authoritative"
    );
  });
}
