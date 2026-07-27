import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { assessTripPublishability } from "@/lib/trip-publish-policy";

// Arc G ship bar (docs/arc-g-scope-2026-07-27.md, locked with Eli).
//
// These are the fixture assertions the arc is judged on, not review
// questions and not aspirations:
//
//   G.1  trip range derives to 2019-01-12..2019-01-25 with two stray 2018
//        notes in the draft, and those notes become flaggable.
//   G.2  covered by tests/transport-field-repair.test.ts (zero transport
//        questions, GT-correct arrival values).
//   G.3  Schönbrunn groups all six stops; Prague Castle groups; the Jan-15
//        walking tour groups; Malá Strana can form; JAN 22 FORMS NO GROUP.
//
// The Jan-22 assertion is the trap the demotion-lane audit named: the
// same-site lane currently starves the walk lane, which ACCIDENTALLY
// suppresses a wrong walk group on a day the answer key says ships as ten
// individual cards. Freeing the walk lane must not turn that accident into
// a regression, so the guard is written down rather than relied upon.

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };
const MALA_STRANA_HEADING = "Wednesday, January 16th // Malá Strana & Hradčany";
const HRADCANY_HEADING = "Wednesday, January 16th // Hradcany";

function stage(label: string, value: Record<string, unknown>): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: `${label}.txt`,
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

// A geocoded record: verified coordinates AND the formatted address the
// lane now keeps (Arc G.3a).
function geocoded(lat: number, lng: number, formattedAddress: string) {
  return {
    _geoVerified: true,
    verifiedFormattedAddress: formattedAddress,
    verifiedLatitude: lat,
    verifiedLongitude: lng,
  };
}

function activity({
  area = null as string | null,
  category = "art_culture",
  date,
  description = null as string | null,
  itemType = "activity",
  startTime = null as string | null,
  title,
  extra = {} as Record<string, unknown>,
}: {
  area?: string | null;
  category?: string;
  date: string;
  description?: string | null;
  itemType?: string;
  startTime?: string | null;
  title: string;
  extra?: Record<string, unknown>;
}) {
  return {
    approxLatitude: null,
    approxLongitude: null,
    area,
    category,
    date,
    description,
    endTime: null,
    itemType,
    sourceFilename: "czech-out.pdf",
    startTime,
    title,
    ...extra,
  };
}

type Draft = {
  activities: Array<Record<string, unknown>>;
  missingDetails: Array<Record<string, unknown>>;
};

function parentedTitles(draft: Draft, parentTitleFragment: RegExp) {
  const parent = draft.activities.find(
    (item) =>
      parentTitleFragment.test(String(item.title ?? "")) &&
      (item._canonicalGroupRole === "parent" || !item._canonicalParentPieceId)
  );
  if (!parent) return { children: [] as string[], parent: null };
  const children = draft.activities
    .filter(
      (item) => item._canonicalParentPieceId === parent._canonicalPieceId
    )
    .map((item) => String(item.title));
  return { children, parent };
}

export default async function run() {
  const { test } = await import("node:test");

  await test("arc G.3a: Schönbrunn groups all six stops — the geocoder's own address reaches the Gloriette the 300 m radius refuses", () => {
    // Gloriette is ~790 m from the palace. The locked same-site radius is
    // 300 m and refuses it BY DESIGN (next-session.md line ~1133), and it
    // carries no "at Schönbrunn" title token either. Its ADDRESS names the
    // estate — which is the whole point of keeping the formatted address
    // instead of parsing it away.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Saturday, January 19th",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-19",
                description: "Schönbrunn Palace visit, about half a day.",
                extra: geocoded(
                  48.1845,
                  16.3122,
                  "Schloß Schönbrunn, Schönbrunner Schloßstraße 47, 1130 Wien, Austria"
                ),
                title: "Schönbrunn Palace",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.1774,
                  16.3121,
                  "Gloriette, Schönbrunner Schloßstraße 47, 1130 Wien, Austria"
                ),
                title: "Gloriette",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.1856,
                  16.3153,
                  "Orangeriegarten, Schönbrunner Schloßstraße, 1130 Wien, Austria"
                ),
                title: "Orangeriegarten at Schönbrunn",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.1861,
                  16.306,
                  "Palmenhaus, Schloßpark, 1130 Wien, Austria"
                ),
                title: "Palm House at Schönbrunn",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.184,
                  16.3125,
                  "Café Residenz, Schönbrunner Schloßstraße 47, 1130 Wien, Austria"
                ),
                title: "Apple Strudel Show",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.185,
                  16.31,
                  "Panoramabahn, Schönbrunner Schloßstraße, 1130 Wien, Austria"
                ),
                title: "Panorama Train",
              }),
              // Negative control on the same day: a real Vienna museum
              // 4 km away with a Vienna address. It must never join.
              activity({
                date: "2019-01-19",
                description: "Mumok or the Natural History Museum.",
                extra: geocoded(
                  48.203,
                  16.359,
                  "Museumsplatz 1, 1070 Wien, Austria"
                ),
                title: "Mumok or Natural History Museum",
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
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    const { children, parent } = parentedTitles(draft, /schönbrunn palace/i);

    assert.ok(parent, "the palace container survives as the parent card");
    assert.equal(
      children.length,
      5,
      `all five stops join the visit (got: ${children.join(", ")})`
    );
    assert.ok(
      children.some((title) => /gloriette/i.test(title)),
      "the Gloriette joins on its formatted address, ~790 m out"
    );
    assert.ok(
      children.every((title) => !/mumok|natural history/i.test(title)),
      "a Vienna museum 4 km away never joins the palace visit"
    );
  });

  await test("arc G.3a: an address in the same city is not an address at the same site", () => {
    // The token filter is what stops this: "palace" is a generic site noun
    // and "Vienna" is a trip city, so neither can ever carry containment.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Saturday, January 19th",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.2058,
                  16.3646,
                  "Hofburg Palace, Michaelerkuppel, 1010 Wien, Austria"
                ),
                title: "Hofburg Palace",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.2088,
                  16.3731,
                  "Stephansplatz 3, 1010 Wien, Austria"
                ),
                title: "St. Stephen's Cathedral",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.2154,
                  16.3591,
                  "Spittelau Palace Road, 1090 Wien, Austria"
                ),
                title: "Ring Tram Tour",
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
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    assert.equal(
      draft.activities.filter((item) => item._canonicalParentPieceId).length,
      0,
      "sharing a city — or the word 'palace' — is not sharing a site"
    );
  });

  await test("arc G.3: Prague Castle groups, and the Malá Strana walk still forms on the same day", () => {
    // Both lanes fire on Jan 16 in the answer key. This is the case the
    // claim ledger has to get right: the same-site visit takes its own
    // stops and the walk lane still gets the four adjacent untimed sights
    // it is entitled to, rather than whatever the site lane left behind.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Wednesday, January 16th",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-16",
                description:
                  "Prague Castle complex, about 2 hrs: Changing of the Guard, St. Vitus Cathedral, Golden Lane.",
                extra: geocoded(
                  50.09,
                  14.4,
                  "Prague Castle, Hradčany, 119 08 Praha 1, Czechia"
                ),
                title: "Prague Castle",
              }),
              activity({
                date: "2019-01-16",
                extra: geocoded(
                  50.0909,
                  14.4009,
                  "St. Vitus Cathedral, III. nádvoří 48/2, 119 01 Praha 1, Czechia"
                ),
                title: "St. Vitus Cathedral",
              }),
              activity({
                date: "2019-01-16",
                extra: geocoded(
                  50.0911,
                  14.3995,
                  "Hradčanské náměstí, 119 08 Praha 1, Czechia"
                ),
                startTime: "12:00",
                title: "Changing of the Guard",
              }),
              activity({
                date: "2019-01-16",
                extra: geocoded(
                  50.0921,
                  14.403,
                  "Zlatá ulička u Daliborky, 119 00 Praha 1, Czechia"
                ),
                title: "Golden Lane",
              }),
              activity({
                area: "Malá Strana",
                date: "2019-01-16",
                extra: {
                  ...geocoded(
                    50.09,
                    14.413,
                    "Vězeňská, 110 00 Praha 1-Josefov, Czechia"
                  ),
                  city: "Prague",
                  sourceHeadingPath: [MALA_STRANA_HEADING],
                  sourceSectionLabel: MALA_STRANA_HEADING,
                },
                description: "The Franz Kafka rotating head sculpture.",
                title: "Kafka statue",
              }),
              activity({
                area: "Malá Strana",
                date: "2019-01-16",
                extra: {
                  ...geocoded(
                    50.0865,
                    14.407,
                    "Velkopřevorské náměstí, 118 00 Malá Strana, Czechia"
                  ),
                  city: "Prague",
                  sourceHeadingPath: [MALA_STRANA_HEADING],
                  sourceSectionLabel: MALA_STRANA_HEADING,
                },
                description: "Graffiti wall covered in Beatles lyrics.",
                title: "John Lennon Wall",
              }),
              activity({
                area: "Malá Strana",
                date: "2019-01-16",
                extra: {
                  ...geocoded(
                    50.0872,
                    14.4085,
                    "U Lužického semináře 24, 118 00 Malá Strana, Czechia"
                  ),
                  city: "Prague",
                  sourceHeadingPath: [MALA_STRANA_HEADING],
                  sourceSectionLabel: MALA_STRANA_HEADING,
                },
                description: "The narrowest street in Prague.",
                title: "Vinárna Čertovka",
              }),
              activity({
                area: "Malá Strana",
                date: "2019-01-16",
                extra: {
                  ...geocoded(
                    50.0905,
                    14.395,
                    "Nový Svět, 118 00 Praha 1-Hradčany, Czechia"
                  ),
                  city: "Prague",
                  sourceHeadingPath: [MALA_STRANA_HEADING],
                  sourceSectionLabel: MALA_STRANA_HEADING,
                },
                description: "Quiet lane of small cottages behind the castle.",
                title: "Nový Svět",
              }),
              activity({
                category: "food_drink",
                date: "2019-01-16",
                startTime: "13:00",
                title: "Lunch at U Malířů",
              }),
              activity({
                date: "2019-01-16",
                description: "KGB Museum, about an hour.",
                title: "KGB Museum",
              }),
            ],
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                country: "Czechia",
                leaveDate: "2019-01-18",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    const castle = parentedTitles(draft, /prague castle/i);
    assert.ok(castle.parent, "the castle container survives");
    assert.ok(
      castle.children.length >= 2,
      `the castle visit owns its stops (got: ${castle.children.join(", ")})`
    );

    const walkParent = draft.activities.find((item) =>
      /walk/i.test(String(item.title ?? ""))
    );
    const walkChildren = walkParent
      ? draft.activities.filter(
          (item) => item._canonicalParentPieceId === walkParent._canonicalPieceId
        )
      : [];
    assert.ok(
      walkParent,
      "the Malá Strana walk can form — the site lane no longer starves it"
    );
    assert.ok(
      walkChildren.length >= 2,
      "the walk owns the adjacent untimed sights"
    );
    assert.ok(
      !castle.children.some((title) => /lennon|kafka|čertovka|nový svět/i.test(title)),
      "walk members never end up inside the castle visit"
    );
  });


  await test("arc G.3: the Jan-15 walking tour still groups its two stops", () => {
    // Not a same-site visit and not a discovered walk — this is the
    // resolver lane: a BOOKED tour that owns the stops the source names
    // inside it. The unified membership context must not disturb it, so
    // the third grouping path in the product gets an explicit guard.
    //
    // The stop is titled "Josefov", the source's own name for the Jewish
    // Quarter, deliberately: a card titled "Jewish Quarter" is folded into
    // this tour by the title-containment alias lane BEFORE grouping ever
    // sees it, which is a separate (and defensible) behavior — noted here
    // so a future reader does not mistake it for a grouping failure.
    const decisionId = "resolver-walking-tour-jan15";
    const result = clusterExtractedEvidence({
      groupingDecisions: [
        {
          callRequired: true,
          candidateIds: ["tour-1", "tour-2", "tour-3"],
          claim:
            "the source books this walking tour and names its two stops, so one route card owns them",
          containerCandidateId: null,
          decisionId,
          parentCandidateId: "tour-1",
          parentTitle: "Old Town and Jewish Quarter Hidden Secrets walking tour",
          source: "canonical_resolver",
        },
      ],
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Tuesday, January 15th",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-15",
                description:
                  "Booked walking tour, L272-181125-2, 395 CZK. Old Town Square, Josefov.",
                extra: {
                  _canonicalGroupingDecisionIds: [decisionId],
                  _resolverCandidateId: "tour-1",
                  city: "Prague",
                  confirmation: "L272-181125-2",
                },
                startTime: "09:00",
                title: "Old Town and Jewish Quarter Hidden Secrets walking tour",
              }),
              activity({
                date: "2019-01-15",
                description: "Old Town Square.",
                extra: { _resolverCandidateId: "tour-2", city: "Prague" },
                title: "Old Town Square",
              }),
              activity({
                date: "2019-01-15",
                description: "The Jewish Quarter.",
                extra: { _resolverCandidateId: "tour-3", city: "Prague" },
                title: "Josefov",
              }),
            ],
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                country: "Czechia",
                leaveDate: "2019-01-18",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    const { children, parent } = parentedTitles(draft, /hidden secrets/i);
    assert.ok(parent, "the booked tour survives as the parent card");
    assert.equal(
      children.length,
      2,
      `Old Town Square and Josefov are sub-stops, not separate cards (got: ${children.join(", ")})`
    );
  });

  await test("arc G.3 TRAP: Jan 22 forms NO group — ten individual cards, both lanes silent", () => {
    // The answer key: "a 9-card day with nothing groupable ships as 9
    // cards... it never forces a collapse or invents an illogical group."
    // Jan 22 is over the crowded threshold and fully sequenced, and the
    // demotion lane that would thin it is OUT of Arc G's scope — so this
    // day stays crowded and must still produce nothing.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Tuesday, January 22nd",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.5023,
                  19.0348,
                  "Szentháromság tér, 1014 Budapest, Hungary"
                ),
                startTime: "09:00",
                title: "Fisherman's Bastion",
              }),
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.502,
                  19.0339,
                  "Szentháromság tér 2, 1014 Budapest, Hungary"
                ),
                startTime: "09:45",
                title: "Matthias Church",
              }),
              activity({
                date: "2019-01-22",
                description: "Funicular up, viewpoint over the Danube.",
                extra: geocoded(
                  47.496,
                  19.0396,
                  "Szent György tér 2, 1014 Budapest, Hungary"
                ),
                startTime: "10:30",
                title: "Castle Hill and Buda Castle stroll",
              }),
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.4988,
                  19.0436,
                  "Széchenyi Lánchíd, 1051 Budapest, Hungary"
                ),
                startTime: "11:00",
                title: "Széchenyi Chain Bridge",
              }),
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.5008,
                  19.0537,
                  "Szent István tér 1, 1051 Budapest, Hungary"
                ),
                title: "St. Istvan's Basilica",
              }),
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.4966,
                  19.0505,
                  "Vörösmarty tér, 1051 Budapest, Hungary"
                ),
                title: "Vörösmarty Ter walk",
              }),
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.5044,
                  19.0459,
                  "Id. Antall József rkp., 1054 Budapest, Hungary"
                ),
                title: "Shoes on the Danube",
              }),
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.5072,
                  19.0456,
                  "Kossuth Lajos tér 1-3, 1055 Budapest, Hungary"
                ),
                title: "Parliament",
              }),
              activity({
                date: "2019-01-22",
                extra: geocoded(
                  47.4869,
                  19.0587,
                  "Vámház krt. 1-3, 1093 Budapest, Hungary"
                ),
                title: "Great Market Hall",
              }),
              activity({
                category: "food_drink",
                date: "2019-01-22",
                startTime: "20:00",
                title: "Borkonyha Wine Kitchen dinner",
              }),
            ],
            places: [
              {
                arriveDate: "2019-01-21",
                city: "Budapest",
                country: "Hungary",
                leaveDate: "2019-01-24",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    const parented = draft.activities.filter(
      (item) => item._canonicalParentPieceId
    );
    assert.deepEqual(
      parented.map((item) => String(item.title)),
      [],
      "no stop is absorbed into any group on Jan 22"
    );
    assert.equal(
      draft.activities.filter(
        (item) => item._canonicalGroupRole === "parent"
      ).length,
      0,
      "no parent card is invented on Jan 22"
    );
    assert.equal(
      draft.missingDetails.filter((detail) =>
        /one activity card|included stop|read cleaner as one route/i.test(
          String(detail.prompt ?? "")
        )
      ).length,
      0,
      "no grouping call is made on Jan 22"
    );
  });

  await test("arc G.1: a stray 2018 note cannot re-date the trip, and it no longer hides from review", () => {
    // Run 7.26.1: two `legId: null` notes carried 2018 dates, one of them
    // became trip.startDate verbatim, and the header read 2018 over a
    // 16-day trip. The spine (5 legs / 8 transport / 5 stays) was
    // GT-exact the whole time.
    const records = createStructuredTripRecordsFromDraft({
      draft: {
        activities: [
          {
            date: "2018-01-14",
            itemType: "note",
            title: "onion or garlic soup",
          },
          {
            date: "2018-01-22",
            itemType: "note",
            title: "St. Stephen's mummified right hand",
          },
          {
            date: "2019-01-13",
            itemType: "activity",
            title: "Colosseum",
            startTime: "14:00",
          },
          { itemType: "note", title: "Prague city note" },
        ],
        places: [
          { arriveDate: "2019-01-12", city: "Rome", leaveDate: "2019-01-14" },
          { arriveDate: "2019-01-14", city: "Prague", leaveDate: "2019-01-18" },
          { arriveDate: "2019-01-18", city: "Vienna", leaveDate: "2019-01-21" },
          { arriveDate: "2019-01-21", city: "Budapest", leaveDate: "2019-01-24" },
          { arriveDate: "2019-01-24", city: "Rome", leaveDate: "2019-01-25" },
        ],
        transport: [
          {
            date: "2019-01-12",
            title: "Delta 5925",
            type: "flight",
          },
          {
            date: "2019-01-25",
            title: "Delta 2934",
            type: "flight",
          },
        ],
      },
      fallbackTripName: "Czech out Eli's Colossal Eastern Europe Excursion",
      tripId: "trip-arc-g",
    });

    assert.equal(records.trip.startDate, "2019-01-12");
    assert.equal(records.trip.endDate, "2019-01-25");

    const strayNotes = records.items.filter((item) =>
      /soup|mummified/i.test(item.title)
    );
    assert.equal(strayNotes.length, 2);
    for (const note of strayNotes) {
      assert.equal(note.legId, null, "the stray note still anchors to no leg");
      assert.equal(
        note.reviewRequired,
        true,
        "a note with an unanchorable date is now flaggable"
      );
      assert.equal(note.status, "needs_review");
    }

    const cityNote = records.items.find((item) =>
      /prague city note/i.test(item.title)
    );
    assert.equal(
      cityNote?.reviewRequired,
      false,
      "an ordinary undated city note stays clean — undated is its normal shape"
    );
    assert.equal(cityNote?.status, "draft");

    // GT:269 — unresolved answers never block publishing. Flagging the
    // notes raises the review count and must not close the gate.
    const publish = assessTripPublishability(records);
    assert.equal(publish.canPublish, true, "publishing still never blocks");
  });

  await test("arc G.1: the spine window never shrinks a trip below its own days, and a fly-home note is not a defect", () => {
    // Two regressions the first cut of G.1 would have introduced, both
    // worse than the 2018 header it fixed:
    //   (a) a last leg with no leaveDate clipped the range BELOW the day
    //       records the same projection emits;
    //   (b) leg lookup is half-open (`date < leaveDate`), so the final day
    //       of every trip matches no leg — flagging on that alone put a
    //       needs_review badge on ordinary departure-day notes.
    const records = createStructuredTripRecordsFromDraft({
      draft: {
        activities: [
          { date: "2019-01-19", itemType: "activity", title: "Schönbrunn" },
          { date: "2019-01-20", itemType: "activity", title: "Cafe Central" },
          {
            date: "2019-01-21",
            itemType: "note",
            title: "Fly home — check out by 11",
          },
        ],
        places: [
          { arriveDate: "2019-01-12", city: "Prague", leaveDate: "2019-01-18" },
          { arriveDate: "2019-01-18", city: "Vienna", leaveDate: null },
        ],
        transport: [
          { date: "2019-01-12", title: "Delta 5925", type: "flight" },
        ],
      },
      fallbackTripName: "Trip",
      tripId: "trip-arc-g-slack",
    });

    assert.equal(records.trip.startDate, "2019-01-12");
    assert.equal(
      records.trip.endDate,
      "2019-01-21",
      "the range still covers the days the same projection emits"
    );
    const flyHome = records.items.find((item) => /fly home/i.test(item.title));
    assert.equal(
      flyHome?.reviewRequired,
      false,
      "a note on the last day of the trip is not a defect"
    );

    // And a single dated spine record is a point, not a window — it must
    // not clip a week of real activities down to one day.
    const sparse = createStructuredTripRecordsFromDraft({
      draft: {
        activities: [
          { date: "2026-04-02", itemType: "activity", title: "Shibuya" },
          { date: "2026-04-07", itemType: "activity", title: "Fly home" },
        ],
        places: [{ arriveDate: "2026-04-01", city: "Tokyo" }],
      },
      fallbackTripName: "Trip",
      tripId: "trip-arc-g-point",
    });
    assert.equal(sparse.trip.startDate, "2026-04-01");
    assert.equal(sparse.trip.endDate, "2026-04-07");
  });

  await test("arc G.3a: a generic site noun is not a shared site — Belvedere Palace never joins Schönbrunn", () => {
    // `SOURCE_SUPPORT_STOPWORDS` contains "castle" and "museum" but not
    // "palace", "complex", "grounds", "citadel", "fortress", "abbey" or
    // "monastery" — so an unfiltered container-token match read "Belvedere
    // Palace" as a source-confirmed member of the Schönbrunn Palace visit
    // five kilometres away, and the claim ledger would have recorded that
    // as HIERARCHY strength: permanently uncontestable.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Saturday, January 19th",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-19",
                description: "Schönbrunn Palace visit.",
                extra: geocoded(
                  48.1845,
                  16.3122,
                  "Schloß Schönbrunn, Schönbrunner Schloßstraße 47, 1130 Wien, Austria"
                ),
                title: "Schönbrunn Palace",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.1913,
                  16.3809,
                  "Prinz Eugen-Straße 27, 1030 Wien, Austria"
                ),
                title: "Belvedere Palace",
              }),
              activity({
                date: "2019-01-19",
                extra: geocoded(
                  48.1856,
                  16.3153,
                  "Orangeriegarten, Schönbrunner Schloßstraße, 1130 Wien, Austria"
                ),
                title: "Orangeriegarten at Schönbrunn",
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
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    const belvedere = draft.activities.find((item) =>
      /belvedere/i.test(String(item.title ?? ""))
    );
    assert.ok(belvedere, "Belvedere still ships");
    assert.equal(
      belvedere?._canonicalParentPieceId ?? null,
      null,
      "a palace 5 km away is not inside another palace"
    );
  });

  await test("arc G.3b: a walk that fails to form never ejects a stop from a site visit", () => {
    // The two-phase rule. The walk lane may consider proximity-only
    // members another lane holds, but releases are planned first and
    // committed only if a walk actually forms. Here the site can spare
    // exactly one stop and the walk needs two, so the walk dies — and the
    // site must be untouched, not one stop poorer for nothing.
    const inCourtyard = (title: string, lat: number, lng: number, area: string | null) =>
      activity({
        area,
        date: "2019-01-16",
        description: `${title}.`,
        extra: {
          ...geocoded(lat, lng, `${title}, 119 08 Praha 1, Czechia`),
          city: "Prague",
          ...(area
            ? {
                sourceHeadingPath: [HRADCANY_HEADING],
                sourceSectionLabel: HRADCANY_HEADING,
              }
            : {}),
        },
        title,
      });

    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Wednesday, January 16th",
          emptyStage({
            activities: [
              inCourtyard("Prague Castle", 50.09, 14.4, null),
              inCourtyard("St. Vitus Cathedral", 50.0909, 14.4009, "Hradcany"),
              inCourtyard("Old Royal Hall", 50.0905, 14.4014, "Hradcany"),
              inCourtyard("Basilica of St. George", 50.0911, 14.4021, null),
              // The only unclaimed walk candidate.
              inCourtyard("Nový Svět", 50.0905, 14.395, "Hradcany"),
              activity({ date: "2019-01-16", description: "KGB Museum.", title: "KGB Museum" }),
              activity({ date: "2019-01-16", description: "Trdelník.", title: "Trdelník breakfast" }),
              activity({ date: "2019-01-16", description: "Petrin funicular.", title: "Petrin Hill" }),
            ],
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                country: "Czechia",
                leaveDate: "2019-01-18",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    const castle = parentedTitles(draft, /prague castle/i);
    assert.ok(castle.parent, "the castle visit survives");
    assert.equal(
      castle.children.length,
      3,
      `the site keeps every stop when no walk forms (got: ${castle.children.join(", ")})`
    );
    assert.equal(
      draft.activities.filter((item) => /\bwalk\b/i.test(String(item.title ?? ""))).length,
      0,
      "and no walk was invented"
    );
  });

  await test("arc G.3: one geo-verified piece elsewhere cannot silently delete a resolver-proposed group", () => {
    // Geocoding is budget-limited and fail-soft, so partial verification is
    // normal. The deterministic lane refuses unverified parser coordinates
    // once the lane has run; a resolver decision was never built under that
    // rule, and applying it during verification deleted valid groups with
    // no call and no question.
    const decisionId = "resolver-site-jan16";
    const result = clusterExtractedEvidence({
      groupingDecisions: [
        {
          callRequired: true,
          candidateIds: ["site-1", "site-2", "site-3"],
          claim:
            "same-site visit: the source lists 2 stops inside Prague Castle's own visit, so one visit card owns them",
          containerCandidateId: "site-1",
          decisionId,
          parentCandidateId: "site-1",
          parentTitle: "Prague Castle visit",
          source: "canonical_resolver",
        },
      ],
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Wednesday, January 16th",
          emptyStage({
            activities: [
              activity({
                date: "2019-01-16",
                description:
                  "Prague Castle complex: St. Vitus Cathedral, Golden Lane.",
                extra: {
                  _canonicalGroupingDecisionIds: [decisionId],
                  _resolverCandidateId: "site-1",
                  approxLatitude: 50.0903,
                  approxLongitude: 14.4005,
                  city: "Prague",
                },
                title: "Prague Castle",
              }),
              activity({
                date: "2019-01-16",
                description: "St. Vitus Cathedral.",
                extra: {
                  _resolverCandidateId: "site-2",
                  approxLatitude: 50.0909,
                  approxLongitude: 14.4009,
                  city: "Prague",
                },
                title: "St. Vitus Cathedral",
              }),
              activity({
                date: "2019-01-16",
                description: "Golden Lane.",
                extra: {
                  _resolverCandidateId: "site-3",
                  approxLatitude: 50.0912,
                  approxLongitude: 14.4014,
                  city: "Prague",
                },
                title: "Golden Lane",
              }),
              // One unrelated card the geocode lane happened to resolve.
              activity({
                date: "2019-01-16",
                description: "KGB Museum.",
                extra: {
                  ...geocoded(50.088, 14.404, "Vlašská 13, 118 00 Malá Strana, Czechia"),
                  city: "Prague",
                },
                title: "KGB Museum",
              }),
            ],
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                country: "Czechia",
                leaveDate: "2019-01-18",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const draft = result.draft as Draft;
    const castle = parentedTitles(draft, /prague castle/i);
    assert.ok(castle.parent, "the resolver's container survives");
    assert.equal(
      castle.children.length,
      2,
      `the resolver group is verified under the rule it was built with (got: ${castle.children.join(", ")})`
    );
  });

  await test("arc G.1: the 16-day count — a stray note never mints a day of its own", () => {
    // The day list is built from ITEM dates, which is where run 7.26.1's
    // "16 days" actually came from: 14 real days plus one day record per
    // stray 2018 note. A day outside the trip's own range is not a day of
    // this trip.
    const records = createStructuredTripRecordsFromDraft({
      draft: {
        activities: [
          { date: "2018-01-14", itemType: "note", title: "onion or garlic soup" },
          { date: "2019-01-13", itemType: "activity", title: "Colosseum" },
        ],
        places: [
          { arriveDate: "2019-01-12", city: "Rome", leaveDate: "2019-01-14" },
          { arriveDate: "2019-01-14", city: "Prague", leaveDate: "2019-01-16" },
        ],
        transport: [{ date: "2019-01-12", title: "Delta 5925", type: "flight" }],
      },
      fallbackTripName: "Trip",
      tripId: "trip-arc-g-days",
    });

    assert.equal(
      records.days.some((day) => day.date.startsWith("2018")),
      false,
      "no 2018 day record is minted"
    );
    for (const day of records.days) {
      assert.ok(
        records.trip.startDate &&
          records.trip.endDate &&
          day.date >= records.trip.startDate &&
          day.date <= records.trip.endDate,
        `day ${day.date} sits inside the trip range`
      );
    }
  });

  await test("arc G.1: one dated spine record still refuses a stray year", () => {
    // A lone spine date is a point, not a range. Refusing to clip at all
    // there is how the 2018 header gets back in; the anchor window keeps
    // plausible trips intact and still refuses a date a year away.
    const records = createStructuredTripRecordsFromDraft({
      draft: {
        activities: [
          { date: "2026-04-02", itemType: "activity", title: "Shibuya" },
          { date: "2025-06-01", itemType: "note", title: "old note from last year" },
        ],
        places: [{ arriveDate: "2026-04-01", city: "Tokyo" }],
      },
      fallbackTripName: "Trip",
      tripId: "trip-arc-g-anchor",
    });

    assert.equal(records.trip.startDate, "2026-04-01");
    const stray = records.items.find((item) => /old note/i.test(item.title));
    assert.equal(stray?.reviewRequired, true, "and the stray note is flagged");
  });

}
