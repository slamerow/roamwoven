import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// Arc A ground-truth fixture checks from LIVE run 7.18.2 (2026-07-18, trip
// 51d3bc5f…, docs/assembly-defect-docket-2026-07-18-run5.md). Input shapes
// mirror what the live parser emitted in that run: PB-3 (Schönbrunn deleted
// by a heading-fragment merge winner) and PB-4 (geo grouping membership
// broken by 2-decimal quantized coordinates, a passing-mention container,
// and model-invented area labels).

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

type Draft = {
  activities: Array<Record<string, unknown>>;
  missingDetails: Array<Record<string, unknown>>;
};

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

const VIENNA_HEADING =
  "Friday, January 18th // Explore Vienna / Pick up Card / Schonbrunn Palace";

export default async function run() {
  await test("ground truth run5 (PB-3, RW-CAN-001): Schönbrunn survives — the 'Explore Vienna' heading fragment can never win the merge", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Friday, January 18th", emptyStage({
          activities: [
            {
              // The 7.18.2 killer: a heading-fragment card whose description
              // summarizes the day (and carries an "or"), which the old
              // length-based winner scoring let beat the named venue.
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description:
                "Visit Schonbrunn Palace and the gardens, see the Gloriette, lunch at Cafe Pierrot or Pest-Buda.",
              itemType: "activity",
              sourceHeadingPath: [VIENNA_HEADING],
              sourceSectionLabel: VIENNA_HEADING,
              title: "Explore Vienna",
            },
            {
              approxLatitude: 48.1849,
              approxLongitude: 16.3122,
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description:
                "Visit Schonbrunn Palace and the gardens, see the Gloriette, and walk the grounds.",
              itemType: "activity",
              sourceHeadingPath: [VIENNA_HEADING],
              sourceSectionLabel: VIENNA_HEADING,
              title: "Schonbrunn Palace",
            },
            {
              approxLatitude: 48.1832,
              approxLongitude: 16.3105,
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: "Hilltop gloriette above the palace gardens.",
              itemType: "activity",
              sourceHeadingPath: [VIENNA_HEADING],
              sourceSectionLabel: VIENNA_HEADING,
              title: "Gloriette",
            },
            {
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: "Palm House at Schonbrunn.",
              itemType: "activity",
              sourceHeadingPath: [VIENNA_HEADING],
              sourceSectionLabel: VIENNA_HEADING,
              title: "Palm House at Schonbrunn",
            },
            {
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: "Orangeriegarten at Schonbrunn. 12 EUR entry.",
              itemType: "activity",
              sourceHeadingPath: [VIENNA_HEADING],
              sourceSectionLabel: VIENNA_HEADING,
              title: "Orangeriegarten at Schonbrunn",
            },
          ],
          places: [
            { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const titles = draft.activities.map((item) => String(item.title));

    const palace = draft.activities.find((item) =>
      /schonbrunn palace/i.test(String(item.title))
    );
    assert.ok(palace, "Schonbrunn Palace survives as a card");
    assert.equal(
      titles.some((title) => /^explore vienna$/i.test(title)),
      false,
      "the 'Explore Vienna' heading fragment never ships as a card"
    );

    // The palace groups its stops: Gloriette via precise coordinates,
    // "X at Schonbrunn" components via container-token membership.
    const children = draft.activities.filter(
      (item) => item._canonicalGroupRole === "child"
    );
    assert.ok(
      children.length >= 2,
      `palace visit owns at least 2 stops (got ${children.length})`
    );

    // The orphaned-component leak: no planned-or-ideas question may hold
    // "X at Site" component titles hostage (7.18.2 shipped Orangeriegarten
    // inside a bogus researched-list question).
    const researchedList = draft.missingDetails.find(
      (item) =>
        item._canonicalQuestionKind === "researched_list" &&
        /orangeriegarten|palm house/i.test(String(item.prompt ?? ""))
    );
    assert.equal(
      researchedList,
      undefined,
      "no researched-list question over Schönbrunn components"
    );
  });

  await test("ground truth run5 (PB-3): a researched-list question never claims an 'X at Site' component title", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Saturday, January 19th", emptyStage({
          activities: [
            {
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: "Orangeriegarten at Schonbrunn. 12 EUR entry, open until 17:00.",
              itemType: "activity",
              title: "Orangeriegarten at Schonbrunn",
            },
            {
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: "Kunsthistorisches Museum. 21 EUR, open until 18:00.",
              itemType: "activity",
              title: "Kunsthistorisches Museum",
            },
            {
              // The site itself survives only as a hedged mention (the live
              // 7.18.2 shape: the container was suppressed when its
              // components leaked into the question).
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: "Maybe Schonbrunn Palace if time.",
              itemType: "activity",
              title: "Schonbrunn Palace",
            },
          ],
          places: [
            { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const researched = draft.missingDetails.filter(
      (item) => item._canonicalQuestionKind === "researched_list"
    );

    for (const question of researched) {
      assert.equal(
        /orangeriegarten/i.test(String(question.prompt ?? "")),
        false,
        "'X at Site' component titles are grouping structure, not researched ideas"
      );
    }
  });

  await test("ground truth run5 (PB-4, RW-GRP-001): a 'Quick look' passing mention with 2-decimal coordinates claims nothing", () => {
    // The live 7.18.2 shape: "Quick look inside the Gresham Palace" matched
    // the container noun pattern, and 2-decimal coordinates (~1.1 km
    // quantization) collapsed half of central Pest onto shared points, so
    // St. Istvan's Basilica (~650 m away) and the TIMED Chain Bridge passed
    // the "300 m" rule.
    const located = (
      title: string,
      lat: number,
      lng: number,
      extra: Record<string, unknown> = {}
    ) => ({
      approxLatitude: lat,
      approxLongitude: lng,
      category: "art_culture",
      city: "Budapest",
      date: "2019-01-22",
      description: `${title}.`,
      itemType: "activity",
      ...extra,
      title,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Tuesday, January 22nd", emptyStage({
          activities: [
            located("Quick look inside the Gresham Palace", 47.5, 19.05),
            located("St. Istvan's Basilica", 47.5, 19.05),
            located("Vorosmarty Ter", 47.5, 19.05),
            located("Gerbeaud's", 47.5, 19.05, { category: "food_dining" }),
            located("Szechenyi Chain Bridge", 47.5, 19.04, {
              startTime: "11:00",
            }),
            located("Pontoon", 47.5, 19.05, {
              category: "nightlife_entertainment",
            }),
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const grouped = draft.activities.filter(
      (item) =>
        item._canonicalGroupRole === "parent" ||
        item._canonicalGroupRole === "child"
    );

    assert.equal(
      grouped.length,
      0,
      `nothing may group on a passing-mention container with quantized coordinates (got ${grouped
        .map((item) => item.title)
        .join(", ")})`
    );
    const bridge = draft.activities.find((item) =>
      /chain bridge/i.test(String(item.title))
    );
    assert.ok(bridge, "the timed Chain Bridge crossing stays standalone");
  });

  await test("ground truth run5 (PB-4, RW-GRP-001): walk members need a source-supported area label; invented areas stay out", () => {
    const oldTownHeading = "Tuesday, January 15th // Old Town wandering";
    const newTownHeading = "Tuesday, January 15th // New Town stops";
    const walker = (
      title: string,
      lat: number,
      lng: number,
      sectionLabel: string,
      extra: Record<string, unknown> = {}
    ) => ({
      approxLatitude: lat,
      approxLongitude: lng,
      area: "Old Town",
      category: "art_culture",
      city: "Prague",
      date: "2019-01-15",
      description: `${title}.`,
      itemType: "activity",
      sourceHeadingPath: [sectionLabel],
      sourceSectionLabel: sectionLabel,
      ...extra,
      title,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Tuesday, January 15th", emptyStage({
          activities: [
            walker("Old Town Square", 50.0875, 14.4213, oldTownHeading),
            walker("Astronomical Clock", 50.087, 14.4207, oldTownHeading),
            walker("Church of Our Lady before Tyn", 50.0877, 14.4227, oldTownHeading),
            walker("Powder Tower", 50.0872, 14.4278, oldTownHeading),
            // Dancing House is in Nové Město: the model labeled its area
            // "Old Town" anyway (the 7.18.2 shape). Its own source section
            // says New Town, so the label is unsupported and it stays out.
            walker("Dancing House", 50.0755, 14.4144, newTownHeading),
            walker("Lucerna Arcade", 50.0812, 14.4254, newTownHeading),
            // Untimed filler cards to make the day crowded (>6 visible).
            walker("Kavarna Slavia", 50.0813, 14.4135, newTownHeading, {
              area: null,
              category: "food_dining",
            }),
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const parent = draft.activities.find(
      (item) =>
        item._canonicalGroupRole === "parent" &&
        /old town walk/i.test(String(item.title))
    );
    assert.ok(parent, "the Old Town walk forms from source-supported members");

    const children = draft.activities.filter(
      (item) => item._canonicalGroupRole === "child"
    );
    const childTitles = children.map((item) => String(item.title));
    assert.equal(
      childTitles.some((title) => /dancing house|lucerna/i.test(title)),
      false,
      `New Town sights never join the Old Town walk (got ${childTitles.join(", ")})`
    );
  });
}
