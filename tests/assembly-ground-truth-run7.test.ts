import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { selectGeocodeCandidates } from "@/lib/extraction/geocode-verification";
import {
  classifyIdeaListSections,
  classifyOwnTextEvidence,
} from "@/lib/extraction/activity-classifier";

// Live-run 7.21.0 (planned "7.18.4", trip d45bb01b, run eb5cb832) regression
// fixtures — Arc C. Shapes are drawn from the run's audit payload
// (run-7.21.0-audit-payload lineage), not invented.

function activity({
  category = "art_culture",
  city = null as string | null,
  date = "2019-01-22",
  description = null as string | null,
  lat = null as number | null,
  lng = null as number | null,
  startTime = null as string | null,
  title,
  extra = {} as Record<string, unknown>,
}: {
  category?: string;
  city?: string | null;
  date?: string;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  startTime?: string | null;
  title: string;
  extra?: Record<string, unknown>;
}) {
  return {
    address: null,
    approxLatitude: lat,
    approxLongitude: lng,
    category,
    city,
    date,
    description,
    endTime: null,
    itemType: "activity",
    sourceFilename: "czech-out.pdf",
    startTime,
    title,
    ...extra,
  };
}

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

export default async function run() {
  const { test } = await import("node:test");

  await test("run7 PC-2: fabricated parser coordinates cannot mint a same-site mega-container once the geocode lane ran", () => {
    // The live shape: gpt-5.4-mini emitted ~one point (47.497/19.040) at
    // 3-decimal precision for the whole guided day; "Gresham Palace" (own
    // description: "Take a peek inside…") claimed 6 stops "within 300 m",
    // including the TIMED Chain Bridge crossing and Buda Castle — another
    // site container across the river.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-22",
          emptyStage({
            activities: [
              activity({
                title: "Gresham Palace",
                description:
                  "Take a peek inside the Four Seasons Hotel / Gresham Palace.",
                lat: 47.497,
                lng: 19.039,
              }),
              activity({
                title: "Szechenyi Chain Bridge",
                description: "Walk across the Szechenyi Chain Bridge.",
                startTime: "11:00",
                lat: 47.499,
                lng: 19.041,
              }),
              activity({
                title: "St. Istvan's Basilica",
                description: "Tour St. Istvan's Basilica.",
                lat: 47.498,
                lng: 19.04,
              }),
              activity({
                title: "Shoes on the Danube",
                description: "Visit Shoes on the Danube memorial.",
                lat: 47.496,
                lng: 19.04,
              }),
              activity({
                title: "Parliament",
                description: "Take a tour of Parliament.",
                lat: 47.497,
                lng: 19.042,
              }),
              activity({
                title: "Buda Castle",
                description: "Buda Castle national history museum.",
                lat: 47.498,
                lng: 19.039,
              }),
              // One lane-verified piece elsewhere in the build marks the
              // lane as having run — radius rules must then require
              // verified coordinates, which none of the members carry.
              activity({
                title: "Fisherman's Bastion",
                startTime: "09:00",
                lat: 47.504,
                lng: 19.025,
                extra: {
                  _geoVerified: true,
                  verifiedLatitude: 47.5022,
                  verifiedLongitude: 19.0348,
                },
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    const parented = draft.activities.filter(
      (item) => item._canonicalParentPieceId
    );
    assert.equal(
      parented.length,
      0,
      "no member joins a same-site visit on fabricated parser coordinates"
    );
    const groupingCall = draft.missingDetails.find(
      (item) =>
        item._canonicalReviewDisposition === "call" &&
        /included stop/i.test(String(item.prompt ?? ""))
    );
    assert.equal(groupingCall, undefined, "no grouping call is minted");
  });

  await test("run7 PC-2: a passing-mention description disqualifies a container even lane-off", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-22-off",
          emptyStage({
            activities: [
              activity({
                title: "Gresham Palace",
                description:
                  "Take a peek inside the Four Seasons Hotel / Gresham Palace.",
                lat: 47.4989,
                lng: 19.0459,
              }),
              activity({
                title: "St. Istvan's Basilica",
                lat: 47.4987,
                lng: 19.0461,
              }),
              activity({
                title: "Vorosmarty Ter",
                lat: 47.4985,
                lng: 19.0458,
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    assert.equal(
      draft.activities.filter((item) => item._canonicalParentPieceId).length,
      0,
      "a 'take a peek inside' card never owns a visit"
    );
  });

  await test("run7 PC-2: verified coordinates still group a true same-site visit when the lane ran", () => {
    const verified = (lat: number, lng: number) => ({
      _geoVerified: true,
      verifiedLatitude: lat,
      verifiedLongitude: lng,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-19",
          emptyStage({
            activities: [
              activity({
                title: "Schönbrunn Palace",
                date: "2019-01-19",
                description: "Schönbrunn Palace visit.",
                lat: 48.184,
                lng: 16.312,
                extra: verified(48.1845, 16.3122),
              }),
              activity({
                title: "Gloriette",
                date: "2019-01-19",
                lat: 48.183,
                lng: 16.311,
                extra: verified(48.1832, 16.3111),
              }),
              activity({
                title: "Palm House at Schönbrunn",
                date: "2019-01-19",
                lat: 48.185,
                lng: 16.303,
                extra: verified(48.1852, 16.3033),
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const parent = draft.activities.find(
      (item) => String(item.title) === "Schönbrunn Palace"
    );
    const kids = draft.activities.filter(
      (item) => item._canonicalParentPieceId
    );
    assert.ok(parent, "the palace container survives");
    assert.equal(kids.length, 2, "both verified stops join the visit");
  });

  await test("run7 geocode lane: site containers and crowded-day members are verified even with precise-looking parser coordinates", () => {
    const day = "2019-01-22";
    const member = (title: string) => ({
      approxLatitude: 47.497,
      approxLongitude: 19.04,
      date: day,
      itemType: "activity",
      title,
    });
    const stages = [
      {
        label: "jan-22",
        source: "model_chunk",
        sourceFilename: "jan-22.txt",
        stage: {
          activities: [
            member("Gresham Palace"),
            member("Szechenyi Chain Bridge"),
            member("St. Istvan's Basilica"),
            member("Shoes on the Danube"),
            member("Parliament"),
            member("Buda Castle"),
            // Rank-2 background record with precise coords: still skipped.
            {
              approxLatitude: 41.8902,
              approxLongitude: 12.4922,
              date: "2019-01-13",
              itemType: "activity",
              title: "Colosseum",
            },
          ],
          missingDetails: [],
          places: [],
          sensitiveDetails: [],
          stays: [],
          transport: [],
        },
      },
    ] as EvidenceStageInput[];
    const candidates = selectGeocodeCandidates(stages);
    const titles = candidates.map((candidate) => candidate.query);
    assert.ok(
      titles.some((query) => /gresham/i.test(query)),
      "the site container is a lookup candidate despite precise parser coords"
    );
    assert.ok(
      titles.some((query) => /parliament/i.test(query)),
      "crowded-day members are lookup candidates despite precise parser coords"
    );
    assert.ok(
      !titles.some((query) => /colosseum/i.test(query)),
      "background records with precise parser coords still skip the budget"
    );
  });

  await test("run7 walk rules: source-narrated routes and tours never re-parent into a discovered walk", () => {
    const located = (
      title: string,
      description: string | null,
      extra: Record<string, unknown> = {}
    ) =>
      activity({
        title,
        date: "2019-01-14",
        description,
        lat: 50.087,
        lng: 14.42,
        extra: { area: "Old Town", sourceSectionLabel: "Monday, January 14th Old Town", ...extra },
      });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-14",
          emptyStage({
            activities: [
              located("Charles Bridge", "Walk across Charles Bridge."),
              located(
                "Astronomical Clock",
                "Stop by the astronomical clock on the hour."
              ),
              located("Lucerna Arcade", "Visit Lucerna Arcade near Wenceslas Square."),
              located("Dancing House", "Walk by the Dancing House."),
              located("Catacombs tour", "Catacombs tour.", {
                category: "tours_tickets",
              }),
              located("Hemingway Bar", "Hemingway Bar at 6:00 PM.", {
                category: "food_dining",
                startTime: "18:00",
              }),
              located("Museum of Communism", "Visit the Museum of Communism."),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    const walkCall = draft.missingDetails.find(
      (item) =>
        item._canonicalReviewDisposition === "call" &&
        /discovered walk/i.test(String(item.reason ?? item.prompt ?? ""))
    );
    assert.equal(
      walkCall,
      undefined,
      "the source-narrated Jan-14 evening route ships ungrouped (approved answer key)"
    );
    const catacombs = draft.activities.find((item) =>
      /catacombs/i.test(String(item.title))
    );
    assert.ok(catacombs, "the catacombs tour survives standalone");
    assert.equal(
      catacombs._canonicalParentPieceId ?? null,
      null,
      "a tour is never a walk stop"
    );
  });

  await test("run7 PC-1: a day-heading-committed entity never demotes to a planned-or-ideas question", () => {
    // Exact live shapes: the castle's own section is "Lesser Town & Prague
    // Castle"; its prose carries a planned duration ("2 hours") and an
    // explicit ticket decision. 7.21.0 held it "as a city idea pending the
    // maker's planned-or-ideas answer" and shipped the day without a castle
    // card.
    const day = (title: string, description: string, extra: Record<string, unknown> = {}) => ({
      address: null,
      category: "art_culture",
      city: null,
      date: "2019-01-16",
      description,
      endTime: null,
      itemType: "activity",
      sourceFilename: "czech-out.pdf",
      sourceHeadingPath: ["Wednesday, January 16th", "Lesser Town & Prague Castle"],
      sourceSectionLabel: "Wednesday, January 16th Lesser Town & Prague Castle",
      startTime: null,
      title,
      ...extra,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-16",
          emptyStage({
            activities: [
              day(
                "Prague Castle Changing of the Guard",
                "Prague castle visit for 2 hours. Changing of the Guard at 12:00 PM. Need to decide which ticket to get.",
                { category: "tours_tickets" }
              ),
              day("KGB museum", "1 hour"),
              day("St. Vitus Cathedral", "Stained glass inside; get tour?"),
              day("Trdelnik for breakfast", "Breakfast: trdelnik", {
                category: "food_dining",
              }),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    const castle = draft.activities.find((item) =>
      /prague castle/i.test(String(item.title))
    );
    const kgb = draft.activities.find((item) => /kgb/i.test(String(item.title)));
    assert.ok(castle, "the castle survives as an activity card");
    assert.ok(kgb, "the KGB museum survives as an activity card");
    const plannedOrIdeas = draft.missingDetails.find((item) =>
      /planned for the day, or just ideas/i.test(String(item.prompt ?? ""))
    );
    assert.equal(
      plannedOrIdeas,
      undefined,
      "no planned-or-ideas question is minted for committed day content"
    );
  });

  await test("run7 PC-3: parser-invented meal prose cannot stamp fixed commitment (Jan-21 idea list demotes as a unit)", () => {
    // Exact live shapes, including the mixed section labels the parser
    // emitted for one source list and the "Dinner at Mazel Tov restaurant."
    // prose the parser invented for a bare list entry.
    const LONG = "Monday, January 21st Train to Budapest // Budapest Bathing";
    const SHORT = "Monday, January 21st";
    const live = [
      { id: "synagogue", title: "Great Synagogue / Jewish History", description: "Visit the Great Synagogue and explore Jewish history.", category: "art_culture", sec: LONG },
      { id: "konyv", title: "Konyv Bar", description: "Drink Tokaji at Konyv Bar.", category: "food_dining", sec: LONG },
      { id: "mazel", title: "Mazel Tov restaurant", description: "Dinner at Mazel Tov restaurant.", category: "food_dining", sec: LONG },
      { id: "ruszwurm", title: "Oldest pastry shop", description: "Oldest pastry shop (Ruszwerm / roosworm) — serve lots of strudel.", category: "food_dining", sec: SHORT },
      { id: "pinball", title: "Pinball Museum", description: "Visit the Pinball Museum.", category: "art_culture", sec: LONG },
      { id: "wine", title: "Wine Cellar in the Hilton", description: "Wine Cellar in the Hilton.", category: "food_dining", sec: SHORT },
    ];
    const entries = live.map((item) => {
      const own = classifyOwnTextEvidence([
        { title: item.title, description: item.description, date: "2019-01-21" },
      ]);
      return {
        id: item.id,
        category: item.category,
        date: "2019-01-21",
        sectionLabel: item.sec,
        headingPath: [item.sec],
        title: item.title,
        description: item.description,
        hasFixedEvidence: own.hasFixedCommitment,
        ownTextHedge: own.hasHedgeMarker,
      };
    });
    assert.equal(
      entries.filter((entry) => entry.hasFixedEvidence).length,
      0,
      "no entry is fixed by parser-invented meal prose"
    );
    const demoted = classifyIdeaListSections(entries);
    assert.equal(demoted.size, 6, "the whole list demotes despite split labels");
  });

  await test("run7 PC-3: a real title-anchored meal keeps its day-plan benefit (Jan-20 deliberate list stays)", () => {
    const own = classifyOwnTextEvidence([
      {
        title: "Breakfast at Cafe Central",
        description: "Breakfast at Cafe Central.",
        date: "2019-01-20",
      },
    ]);
    assert.equal(own.hasFixedCommitment, true, "a source meal TITLE is fixed");
    const entries = [
      { id: "central", title: "Breakfast at Cafe Central", description: null, category: "food_dining" },
      { id: "jewish", title: "Jewish Museum", description: null, category: "art_culture" },
      { id: "library", title: "Library", description: null, category: "art_culture" },
      { id: "kunstforum", title: "Bank Austria Kunstforum", description: null, category: "art_culture" },
    ].map((item, index) => ({
      id: item.id,
      category: item.category,
      date: "2019-01-20",
      sectionLabel: "Sunday, January 20th",
      headingPath: ["Sunday, January 20th"],
      title: item.title,
      description: item.description,
      hasFixedEvidence: index === 0,
      ownTextHedge: false,
    }));
    assert.equal(
      classifyIdeaListSections(entries).size,
      0,
      "one fixed entry keeps the whole section a day plan"
    );
  });

  await test("run7 PC-4: receipt-field shards die at the parser-artifact layer; booked cards with menu details stay", () => {
    const shard = (title: string, description: string | null = null, extra: Record<string, unknown> = {}) => ({
      address: null,
      category: "tours_tickets",
      city: null,
      date: "2019-01-15",
      description: description ?? title,
      endTime: null,
      itemType: "activity",
      sourceFilename: "czech-out.pdf",
      startTime: null,
      title,
      ...extra,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-15",
          emptyStage({
            activities: [
              shard("Adult 16+ x 1 x 395CZK"),
              shard("TOTAL 395CZK"),
              shard("Status: paid (PayPal)", null, { category: "admin_logistics" }),
              shard("LivingPragueTours"),
              shard(
                "Restaurant Peklo",
                "Menu description: 3 festival meals + 2 glasses of wine or 2 glasses of beer + 1 bottle of natural water"
              ),
              // A real booked dinner whose description carries menu detail
              // stays an activity (Bellevue shape).
              shard(
                "Bellevue dinner reservation",
                "Menu description: five-course tasting.",
                { category: "food_dining", startTime: "18:30" }
              ),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const titles = draft.activities.map((item) => String(item.title));
    for (const gone of [
      /adult 16/i,
      /total 395/i,
      /paypal/i,
      /livingpraguetours/i,
      /peklo/i,
    ]) {
      assert.equal(
        titles.some((title) => gone.test(title)),
        false,
        `receipt shard ${gone} never ships as an activity`
      );
    }
    assert.ok(
      titles.some((title) => /bellevue/i.test(title)),
      "the booked dinner with menu detail survives"
    );
  });

  await test("run7: admission evidence attaches by entity affinity, never date+time coincidence", () => {
    const card = (title: string, description: string, extra: Record<string, unknown> = {}) => ({
      address: null,
      category: "art_culture",
      city: null,
      date: "2019-01-15",
      description,
      endTime: null,
      itemType: "activity",
      sourceFilename: "czech-out.pdf",
      startTime: "14:30",
      title,
      ...extra,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "jan-15-affinity",
          emptyStage({
            activities: [
              card("Klementinum Tour", "Visit Klementinum at 2:30 PM. Guided Tour."),
              // The Colosseum receipt page's own label carries the PURCHASE
              // date/time (15.01 14:30), which collided with Klementinum's
              // slot in 7.21.0.
              card(
                "Colosseum skip-the-line ticket",
                "Skip-the-line admission ticket.",
                { category: "tours_tickets" }
              ),
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const klementinum = draft.activities.find((item) =>
      /klementinum/i.test(String(item.title))
    );
    assert.ok(klementinum, "Klementinum survives");
    assert.equal(
      /colosseum/i.test(String(klementinum.description ?? "")),
      false,
      "a Rome venue's ticket never lands inside a Prague tour's description"
    );
  });

  await test("run7 PC-5: a route-less time-less ticket fragment never mints a travel row or a departure-time question", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "recovery",
          emptyStage({
            transport: [
              // The live GOEURO shape: recovered receipt boilerplate with a
              // provider and nothing else.
              {
                arrival: null,
                arrivalTime: null,
                confirmation: "GOEURO",
                date: "2019-01-24",
                departure: null,
                departureTime: null,
                itemType: "transport",
                provider: "Österreichische Bundesbahnen AG",
                sourceFilename: "czech-out.pdf",
                title: "GOEURO",
                type: "train",
              },
              // A real segment stays.
              {
                arrival: "Rome Fiumicino",
                arrivalTime: "14:10",
                confirmation: "RDGHMT",
                date: "2019-01-24",
                departure: "Budapest",
                departureTime: "12:20",
                itemType: "transport",
                provider: "Wizz Air",
                sourceFilename: "czech-out.pdf",
                title: "Wizz Air Flight W6 2339",
                type: "flight",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      transport: Array<Record<string, unknown>>;
      missingDetails: Array<Record<string, unknown>>;
    };
    assert.equal(draft.transport.length, 1, "only the real segment ships");
    assert.equal(
      /goeuro/i.test(String(draft.transport[0].title ?? draft.transport[0].provider ?? "")),
      false,
      "the fragment is not the surviving row"
    );
    const timeQuestion = draft.missingDetails.find((item) =>
      /goeuro/i.test(String(item.prompt ?? ""))
    );
    assert.equal(timeQuestion, undefined, "no departure-time question rides on a dead fragment");
  });

  await test("run7 PC-8: off-contract question families are dismissed and the Δ2 same-section fold holds", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "questions",
          emptyStage({
            activities: [
              // The Rome day is already firmly dated — the guessed-date
              // question below is the settled/bogus case, not genuine
              // uncertainty.
              activity({
                title: "Colosseum",
                date: "2019-01-13",
                startTime: "14:00",
                lat: 41.89,
                lng: 12.492,
              }),
            ],
            missingDetails: [
              {
                answerType: "date",
                confidence: "medium",
                evidence:
                  "Sunday, January 13th Explore Rome // Land at 10:15 and tour.",
                guessedValue: "January 13th",
                prompt: "What date should be used for the Rome sightseeing day?",
                reason: "The spine needs one explicit date value.",
                targetField: "date",
                _canonicalReviewDisposition: "question",
                resolverDecisionId: "q-date",
              },
              {
                answerType: "text",
                confidence: "medium",
                evidence: "Thursday, January 17th Kutna Hora: 'Pick up car at 9 am'",
                guessedValue: "rental car pickup",
                prompt: "What is the travel mode for the 9:00 AM pick-up?",
                reason: "The exact transport type is not named.",
                targetField: "type",
                _canonicalReviewDisposition: "question",
                resolverDecisionId: "q-type",
              },
              {
                answerType: "text",
                confidence: "medium",
                evidence: "Page 6 lists '",
                guessedValue: null,
                prompt:
                  "Should the customer contact details from the car reservation be stored as sensitive details?",
                reason: "Personal contact information appears on the page.",
                targetField: "sensitiveDetails",
                _canonicalReviewDisposition: "question",
                resolverDecisionId: "q-sensitive",
              },
              {
                answerType: "text",
                confidence: "medium",
                evidence:
                  "Adult 16+ x 1 x 395CZK / TOTAL 395CZK / Status: paid (PayPal) / [private contact removed]",
                guessedValue: null,
                prompt: "What is the title/name of the booked item referenced by these lines?",
                reason: "The excerpt lists payment details but not a title.",
                targetField: "title",
                _canonicalReviewDisposition: "question",
                resolverDecisionId: "q-receipt",
              },
              {
                answerType: "text",
                confidence: "medium",
                evidence:
                  "Wednesday, January 16th Lesser Town & Prague Castle: 'Need to decide which ticket to get'",
                guessedValue: null,
                prompt: "Which ticket or entry option was chosen for the Prague Castle visit?",
                reason: "The source says a ticket decision is still needed.",
                relatedTitle: "Prague Castle",
                targetField: "ticketType",
                _canonicalReviewDisposition: "question",
                resolverDecisionId: "q-castle-ticket",
              },
              {
                answerType: "text",
                confidence: "medium",
                evidence:
                  "Wednesday, January 16th Lesser Town & Prague Castle: 'St. Vitus Cathedral (stained glass inside) get tour?'",
                guessedValue: null,
                prompt: "Was a tour of St. Vitus Cathedral actually booked or chosen?",
                reason: "The source leaves the cathedral visit unresolved.",
                relatedTitle: "St. Vitus Cathedral",
                targetField: "bookingStatus",
                _canonicalReviewDisposition: "question",
                resolverDecisionId: "q-vitus",
              },
            ],
          })
        ),
      ],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const details = (result.draft as { missingDetails: Array<Record<string, unknown>> })
      .missingDetails;
    const open = details.filter(
      (item) =>
        item._canonicalReviewDisposition === "question" &&
        // The empty-fixture spine question is unrelated scaffolding.
        !/first trip draft/i.test(String(item.prompt ?? ""))
    );
    const openPrompts = open.map((item) => String(item.prompt ?? ""));
    assert.equal(
      openPrompts.length,
      1,
      `only the castle ticket question stays open (got: ${openPrompts.join(" | ")})`
    );
    assert.match(openPrompts[0], /ticket or entry option/i);
    const vitus = details.find((item) => /st\. vitus/i.test(String(item.prompt ?? "")));
    assert.equal(
      vitus?._canonicalReviewDisposition,
      "dismissed",
      "the St. Vitus angle folds into the castle decision (Δ2)"
    );
  });
}
