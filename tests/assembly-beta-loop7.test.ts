import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { decideActivityCandidacy } from "@/lib/extraction/activity-classifier";
import { applyReviewDecision } from "@/lib/generated-trip-decisions";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";

function stage(
  label: string,
  sourceText: string,
  activities: Array<Record<string, unknown>>,
  missingDetails: Array<Record<string, unknown>> = []
): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: `${label}.txt`,
    sourceText,
    stage: {
      activities,
      missingDetails,
      places: [
        {
          arriveDate: "2030-04-11",
          city: "Sample City",
          country: "Example",
          leaveDate: "2030-04-14",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

function activity(
  title: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    category: "art_culture",
    city: "Sample City",
    date: "2030-04-12",
    description: `Visit ${title}.`,
    evidence: title,
    evidenceRole: "atomic_candidate",
    itemType: "activity",
    sourceHeadingPath: ["Friday, April 12th"],
    sourceSectionLabel: "Friday, April 12th",
    sourceSectionType: "dated_itinerary",
    title,
    ...overrides,
  };
}

function draftFor(result: ReturnType<typeof clusterExtractedEvidence>) {
  return result.draft as {
    activities: Array<Record<string, unknown>>;
    missingDetails: Array<Record<string, unknown>>;
  };
}

export default async function run() {
  const { test } = await import("node:test");

  await test("Loop 7 candidacy: a generic receipt label is accessory evidence, while an anchored tour remains an Activity", () => {
    const generic = decideActivityCandidacy({
      category: "tours_tickets",
      date: "2030-04-12",
      description: "Guided Tour / Prohlidka",
      evidenceRole: "atomic_candidate",
      itemType: "activity",
      sourceSectionType: "booking_detail",
      title: "Guided Tour / Prohlidka",
    });
    assert.equal(generic.destination, "accessory");
    assert.equal(generic.reasonCode, "GENERIC_BOOKING_LABEL");

    const anchored = decideActivityCandidacy({
      category: "tours_tickets",
      date: "2030-04-12",
      description: "Clock Tower guided tour starts at 14:30.",
      evidenceRole: "atomic_candidate",
      hasAuditedCommitment: true,
      itemType: "activity",
      sourceSectionType: "booking_detail",
      startTime: "14:30",
      title: "Clock Tower guided tour",
    });
    assert.equal(anchored.destination, "activity");
  });

  await test("Loop 7 review: researched alternatives become one reversible Question without consuming the explicit plan", () => {
    const sourceText = [
      "Friday, April 12th",
      "Check in and walk to North Gallery",
      "North Gallery",
      "State Archive (free-7) // Open until 6",
      "Time Museum (free-19) // Open until 8",
      "Upper and Lower Palace (free-20) // Open until 9",
    ].join("\n");
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("researched-options", sourceText, [
          activity("North Gallery", {
            evidence: "Check in and walk to North Gallery",
          }),
          activity("State Archive", {
            description: "State Archive (free-7) // Open until 6",
            evidence: "State Archive (free-7) // Open until 6",
          }),
          activity("Time Museum", {
            description: "Time Museum (free-19) // Open until 8",
            evidence: "Time Museum (free-19) // Open until 8",
          }),
          activity("Upper and Lower Palace", {
            description: "Upper and Lower Palace (free-20) // Open until 9",
            evidence: "Upper and Lower Palace (free-20) // Open until 9",
          }),
        ]),
      ],
      tripOverview: { dateRange: "April 11-14, 2030" },
    });
    const draft = draftFor(result);
    const questions = draft.missingDetails.filter(
      (detail) => detail._canonicalQuestionKind === "researched_list"
    );
    assert.equal(questions.length, 1);
    assert.match(String(questions[0].prompt), /state archive/i);
    assert.match(String(questions[0].prompt), /time museum/i);
    assert.match(String(questions[0].prompt), /upper and lower palace/i);
    assert.ok(
      draft.activities.some(
        (item) => item.itemType === "activity" && item.title === "North Gallery"
      ),
      "the independently committed anchor stays planned"
    );
    for (const researched of [
      "State Archive",
      "Time Museum",
      "Upper and Lower Palace",
    ]) {
      assert.equal(
        draft.activities.some(
          (item) =>
            item.itemType === "activity" && item.title === researched
        ),
        false,
        `${researched} waits in the reversible City Note home`
      );
    }
  });

  await test("Loop 7 classification: a reference-list disjunction cannot self-promote into a dated meal", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "meal-alternatives",
          "Friday, April 12th\nHave lunch at Cedar Bistro or Harbor Cafe.",
          [
            activity("Cedar Bistro or Harbor Cafe", {
              category: "food_dining",
              description: "Lunch at Cedar Bistro or Harbor Cafe.",
              evidence: "Have lunch at Cedar Bistro or Harbor Cafe.",
            }),
          ]
        ),
        stage(
          "food-reference",
          "Saturday, April 13th\nRestaurant options: Cedar Bistro, Harbor Cafe.",
          [
            activity("Restaurant options", {
              category: "food_dining",
              date: "2030-04-13",
              description: "Cedar Bistro, Harbor Cafe.",
              evidence: "Restaurant options: Cedar Bistro, Harbor Cafe.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              sourceHeadingPath: ["Sample City Notes"],
              sourceSectionLabel: "Sample City Notes",
              sourceSectionType: "city_reference",
            }),
          ]
        ),
      ],
      tripOverview: { dateRange: "April 11-14, 2030" },
    });
    const draft = draftFor(result);
    assert.equal(
      draft.activities.some(
        (item) =>
          item.itemType === "activity" &&
          /cedar bistro or harbor cafe/i.test(String(item.title))
      ),
      false,
      "reference alternatives keep their City Note home"
    );
    assert.ok(
      draft.activities.some(
        (item) =>
          item.itemType === "note" &&
          /cedar bistro/i.test(String(item.description)) &&
          /harbor cafe/i.test(String(item.description))
      )
    );
  });

  await test("Loop 7 review: a generic bathing slot survives identity and owns one two-venue Question", () => {
    const sourceText = [
      "Friday, April 12th // Sample City Bathing",
      "Baths",
      "Thermal baths: Azure and Cedar Baths",
    ].join("\n");
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("bathing-day", sourceText.split("\n").slice(0, 2).join("\n"), [
          activity("Baths", {
            category: "wellness_relaxation",
            description: "Go to Baths.",
            evidence: "Go to Baths",
            sourceHeadingPath: [
              "Friday, April 12th",
              "Sample City Bathing",
            ],
            sourceSectionLabel: "Sample City Bathing",
          }),
        ]),
        stage("bathing-reference", sourceText.split("\n").slice(2).join("\n"), [
          activity("Sample baths", {
            category: "wellness_relaxation",
            date: null,
            description: "Thermal baths: Azure and Cedar Baths.",
            evidence: "Thermal baths: Azure and Cedar Baths.",
            evidenceRole: "city_note_candidate",
            itemType: "note",
            sourceHeadingPath: ["Sample City Notes"],
            sourceSectionLabel: "Sample City Notes",
            sourceSectionType: "city_reference",
          }),
        ]),
      ],
      tripOverview: { dateRange: "April 11-14, 2030" },
    });
    const draft = draftFor(result);
    const bathCards = draft.activities.filter(
      (item) => item.itemType === "activity" && /bath/i.test(String(item.title))
    );
    const bathQuestions = draft.missingDetails.filter(
      (detail) => detail._canonicalQuestionKind === "day_label_slot"
    );
    assert.equal(bathCards.length, 1, "one generic slot card survives");
    assert.equal(bathCards[0].title, "Baths");
    assert.equal(bathQuestions.length, 1, "one material choice remains");
    assert.deepEqual(
      (bathQuestions[0].answerOptions as Array<Record<string, unknown>>)
        .map((option) => option.label)
        .sort(),
      ["Azure Baths", "Cedar Baths"]
    );
  });

  await test("Loop 7 review: bath choices collapse aliases and reject the city name", () => {
    const sourceText = [
      "Monday, January 21st // Budapest Bathing",
      "Baths",
      "Gellert Baths",
      "visit- Gellert Bath House",
      "Budapest baths",
      "Szechenyi Baths",
    ].join("\n");
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("bathing-day", sourceText, [
          activity("Baths", {
            city: "Budapest",
            description: "Baths.",
            evidence: "Baths",
            sourceHeadingPath: [
              "Monday, January 21st",
              "Budapest Bathing",
            ],
            sourceSectionLabel: "Budapest Bathing",
          }),
          activity("Gellert Baths", {
            city: "Budapest",
            description: "Gellert Baths.",
            evidence: "Gellert Baths",
          }),
          activity("visit- Gellert Bath House", {
            city: null,
            description: "visit- Gellert Bath House.",
            evidence: "visit- Gellert Bath House",
          }),
          activity("Budapest baths", {
            city: null,
            description: "Budapest baths.",
            evidence: "Budapest baths",
          }),
          activity("Szechenyi Baths", {
            city: "Budapest",
            description: "Szechenyi Baths.",
            evidence: "Szechenyi Baths",
          }),
        ]),
      ],
      tripOverview: { dateRange: "January 21-24, 2019" },
    });
    const draft = draftFor(result);
    const bathQuestions = draft.missingDetails.filter(
      (detail) => detail._canonicalQuestionKind === "day_label_slot"
    );

    assert.equal(bathQuestions.length, 1);
    assert.deepEqual(
      (bathQuestions[0].answerOptions as Array<Record<string, unknown>>).map(
        (option) => option.label
      ),
      ["Gellert Baths", "Szechenyi Baths"]
    );
    assert.doesNotMatch(String(bathQuestions[0].prompt), /keep as ideas/i);
    const bathCard = draft.activities.find((item) =>
      /Gellert Baths/i.test(String(item.description)) &&
      /Szechenyi Baths/i.test(String(item.description))
    );
    assert.ok(bathCard);
    assert.match(String(bathCard.description), /Gellert Baths/);
    assert.match(String(bathCard.description), /Szechenyi Baths/);
    assert.doesNotMatch(
      String(bathCard.description),
      /visit-|Budapest baths|Bath House/i,
      "rejected aliases and the city label never reach the traveler card"
    );

    const records = createStructuredTripRecordsFromDraft({
      draft: result.draft,
      fallbackTripName: "Budapest",
      tripId: "bath-choice-alias-regression",
    });
    const question = records.reviewQuestions.find((item) =>
      /which one\?/i.test(item.prompt)
    );
    assert.ok(question, "the material choice reaches the maker-facing records");
    const answered = applyReviewDecision(records, {
      action: "answer_question",
      answerValue: "Szechenyi Baths",
      createdAt: "2030-04-01T00:00:00.000Z",
      id: "choose-szechenyi",
      subjectId: question.id,
      subjectType: "review_question",
      tripId: "bath-choice-alias-regression",
    });
    assert.equal(
      answered.reviewQuestions.find((item) => item.id === question.id)?.status,
      "answered"
    );
    assert.match(
      answered.items.find((item) => item.id === question.subjectId)
        ?.description ?? "",
      /Szechenyi Baths/
    );
  });

  await test("Loop 7 conservation: a mixed note keeps the sibling venue in City Notes instead of attaching it to the planned card", () => {
    const sourceText = [
      "Friday, April 12th",
      "Cross River Chain Bridge at 11:00",
      "River Chain Bridge - beautiful at dusk, Harbor Deck is an outdoor bar with a great view.",
    ].join("\n");
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("mixed-note", sourceText, [
          activity("River Chain Bridge", {
            description: "Cross River Chain Bridge.",
            evidence: "Cross River Chain Bridge at 11:00",
            startTime: "11:00",
          }),
          activity("Sample note: River Chain Bridge / Harbor Deck", {
            category: "nightlife_entertainment",
            description: "beautiful at dusk",
            evidence:
              "River Chain Bridge - beautiful at dusk, Harbor Deck is an outdoor bar with a great view.",
            evidenceRole: "city_note_candidate",
            itemType: "note",
          }),
        ]),
      ],
      tripOverview: { dateRange: "April 11-14, 2030" },
    });
    const draft = draftFor(result);
    const bridge = draft.activities.find(
      (item) => item.itemType === "activity" && item.title === "River Chain Bridge"
    );
    const cityNoteText = draft.activities
      .filter((item) => item.itemType === "note")
      .map((item) => item.description)
      .join(" ");
    assert.ok(bridge);
    assert.doesNotMatch(String(bridge.description), /harbor deck/i);
    assert.match(cityNoteText, /harbor deck/i);
  });

  await test("Loop 7 identity: a multi-place route attaches only to its sole independently scheduled segment", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "route-composite",
          [
            "Friday, April 12th",
            "Funicular to River Chain Bridge / Grand Palace",
            "Cross River Chain Bridge at 11:00",
          ].join("\n"),
          [
            activity("Funicular to River Chain Bridge / Grand Palace", {
              description:
                "Take the funicular to River Chain Bridge / Grand Palace.",
              evidence:
                "Funicular to River Chain Bridge / Grand Palace",
            }),
            activity("River Chain Bridge", {
              description: "Cross River Chain Bridge.",
              evidence: "Cross River Chain Bridge at 11:00",
              startTime: "11:00",
            }),
          ]
        ),
      ],
      tripOverview: { dateRange: "April 11-14, 2030" },
    });
    const draft = draftFor(result);
    assert.equal(
      draft.activities.some((item) =>
        /funicular to .*\/.*palace/i.test(String(item.title))
      ),
      false,
      "the composite is evidence, not a second card"
    );
    assert.ok(
      draft.activities.some(
        (item) => item.itemType === "activity" && item.title === "River Chain Bridge"
      )
    );
    assert.ok(
      result.summary.identityLedger.decisions.some(
        (decision) =>
          decision.reasonCode === "route_composite_to_scheduled_entity"
      ),
      "served identity telemetry proves the route rule fired"
    );
  });
}
