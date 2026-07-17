import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  extractSourceTransportAnchorsFromMaterials,
  sourceTransportAnchorMatchesRecord,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import { createTripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";
import { applyReviewDecision } from "@/lib/generated-trip-decisions";

// Ground-truth fixture checks from LIVE run 7.18.0 (2026-07-17, trip
// e0b06255…, docs/assembly-defect-docket-2026-07-17-run3.md). Every input
// shape below mirrors what the live parser actually emitted in that run.

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
  stays: Array<Record<string, unknown>>;
  transport: Array<Record<string, unknown>>;
};

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

export default async function run() {
  await test("ground truth run3 (RW-TRV-001): conflicting checkout chunks and a costs line make ONE Prague stay, Jan 14-18", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 14th", emptyStage({
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
          ],
          stays: [
            {
              address: "Michalska 431/5 Apartma, Praha 1",
              checkIn: "2019-01-14",
              checkInTime: "15:00",
              checkOut: "2019-01-17",
              city: "Prague",
              name: "Prague Airbnb",
            },
          ],
        })),
        stage("Czech out itinerary notes", emptyStage({
          stays: [
            {
              address: "Michalska 431/5 Apartma, Praha 1",
              checkIn: "2019-01-14",
              checkInTime: "15:00",
              checkOut: "2019-01-18",
              city: "Prague",
              name: "Prague Airbnb",
            },
          ],
        })),
        stage("January 15th Prague- $56 (airbnb)", emptyStage({
          stays: [
            {
              address: null,
              checkIn: "2019-01-15",
              checkOut: null,
              city: "Prague",
              name: "Prague Airbnb",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const pragueStays = draft.stays.filter((stay) =>
      /prague/i.test(String(stay.name ?? "")) || /prague/i.test(String(stay.city ?? ""))
    );

    assert.equal(pragueStays.length, 1, "one stay per venue per leg");
    assert.equal(pragueStays[0]?.checkIn, "2019-01-14");
    assert.equal(pragueStays[0]?.checkOut, "2019-01-18", "checkout reconciles to the leg boundary");
    assert.doesNotMatch(String(pragueStays[0]?.name), /\d{4}-\d{2}-\d{2}/, "no internal date-suffix in the stay name");
  });

  await test("ground truth run3 (RW-PRI-001): the check-in card with Wi-Fi password and door code never ships; credentials reach no public prose", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 14th", emptyStage({
          activities: [
            {
              address: "Michalska 431/5 Apartma, Praha 1, Hlavni mesto Praha 110 00",
              category: "arrival_departure",
              date: "2019-01-14",
              description:
                "Check in after 3:00 PM at the AirBNB. Wi-Fi password: WelcomeHome2017. Code HMRKX42RWB. Airbnb stay in Prague.",
              itemType: "activity",
              startTime: "15:00",
              title: "Check in to AirBNB",
            },
            {
              category: "social",
              date: "2019-01-14",
              description: "Hemingway Bar at 6:00 PM for 2 people.",
              itemType: "activity",
              startTime: "18:00",
              title: "Hemingway Bar",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
          ],
          stays: [
            {
              address: "Michalska 431/5 Apartma, Praha 1",
              checkIn: "2019-01-14",
              checkInTime: "15:00",
              checkOut: "2019-01-18",
              city: "Prague",
              name: "Prague Airbnb",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const titles = draft.activities.map((item) => String(item.title));

    assert.ok(!titles.includes("Check in to AirBNB"), "check-in duplicate folds into the stay");
    assert.ok(titles.includes("Hemingway Bar"), "real activities survive");
    const allProse = draft.activities
      .map((item) => `${item.title} ${item.description ?? ""} ${item.address ?? ""}`)
      .join(" ");
    assert.doesNotMatch(allProse, /WelcomeHome2017|HMRKX42RWB/i, "credentials never reach public card prose");
    assert.doesNotMatch(allProse, /Michalska 431/i, "the protected stay address never reaches public card prose");
  });

  await test("ground truth run3 (RW-ASM-001): a 'Vitae Hostel stay' card duplicating the stay row is suppressed", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 21st", emptyStage({
          activities: [
            {
              address: "Erzsebet korut 50, Budapest, Hungary",
              category: "arrival_departure",
              date: "2019-01-21",
              description: "Stay at Vitae Hostel.",
              itemType: "activity",
              title: "Vitae Hostel stay",
            },
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
          stays: [
            {
              address: "Erzsebet korut 50, Budapest",
              checkIn: "2019-01-21",
              checkOut: "2019-01-24",
              city: "Budapest",
              name: "Vitae Hostel",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.ok(
      !draft.activities.some((item) => /vitae/i.test(String(item.title))),
      "the stay row is the single home"
    );
  });

  await test("ground truth run3 (RW-ASM-001): mis-dated ticket re-emissions fold into their travel rows with one call each; booking codes reach no prose", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Thursday, January 24th", emptyStage({
          activities: [
            {
              category: "arrival_departure",
              date: "2019-01-24",
              description:
                "Train to Budapest. Fri, 18 Jan 2019 09:20 from Praha, Hlavni Nadrazi to Wien, Hauptbahnhof. Booking number 1bebb5005; travel code 0468406277; seat 4/11. Fare Business.",
              itemType: "activity",
              startTime: "09:20",
              title: "Train to Budapest",
            },
            {
              category: "arrival_departure",
              date: "2019-01-24",
              description:
                "OBB train from Wien Hbf to Budapest-Keleti on 21.01.2019, 10:42 to 13:19. Ticketcode 2 159 1990 1842 0436; booking 0648 7232 0822 6278; class 2; duration 2:37.",
              endTime: "13:19",
              itemType: "activity",
              startTime: "10:42",
              title: "Train Vienna to Budapest",
            },
            {
              category: "shopping_tailor",
              date: "2019-01-24",
              description: "Watches in Rome is located at Via della Fontanella Borghese 33.",
              itemType: "activity",
              title: "Watches in Rome",
            },
          ],
          places: [
            { arriveDate: "2019-01-24", city: "Rome", country: "Italy", leaveDate: "2019-01-25" },
          ],
          transport: [
            {
              arrival: "Wien Hauptbahnhof",
              arrivalTime: "13:23",
              confirmation: "1beb5005",
              date: "2019-01-18",
              departure: "Praha Hlavni Nadrazi",
              departureTime: "09:20",
              title: "Train Prague to Vienna",
              type: "train",
            },
            {
              arrival: "Budapest-Keleti",
              arrivalTime: "13:19",
              confirmation: "VXFHXKCQEPHPUSNT",
              date: "2019-01-21",
              departure: "Wien Hbf",
              departureTime: "10:42",
              title: "Train Vienna to Budapest",
              type: "train",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const activityTitles = draft.activities.map((item) => String(item.title));

    assert.ok(!activityTitles.includes("Train to Budapest"), "RegioJet ticket copy folds");
    assert.ok(!activityTitles.includes("Train Vienna to Budapest"), "OBB ticket copy folds");
    assert.ok(activityTitles.includes("Watches in Rome"), "real Jan 24 cards survive");
    const prose = draft.activities
      .map((item) => `${item.title} ${item.description ?? ""}`)
      .join(" ");
    assert.doesNotMatch(prose, /1beb|0468406277|Ticketcode|0648 7232/i, "no booking codes in public prose");
    const foldCalls = draft.missingDetails.filter((detail) =>
      /We merged the duplicate card/.test(String(detail.prompt ?? ""))
    );
    assert.equal(foldCalls.length, 2, "each cross-date fold gets one call");
  });

  await test("ground truth run3 (RW-ASM-001): Albertina survives a description that mentions the day's check-in", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Friday, January 18th", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-18",
              description: "Check in to hostel and walk to Albertina. Albertina (free-12.90) - Open until 6.",
              itemType: "activity",
              title: "Albertina",
            },
          ],
          places: [
            { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
          ],
          stays: [
            {
              checkIn: "2019-01-18",
              checkOut: "2019-01-21",
              city: "Vienna",
              name: "Wombats City Hostel Vienna - The Lounge",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.ok(
      draft.activities.some((item) => item.title === "Albertina"),
      "a named sight is never routine check-in evidence"
    );
  });

  await test("ground truth run3 (RW-CLS-001): the Jan 20 planned St. Stephen's visit beats the Jan 19 idea-list note copy", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Saturday, January 19th", emptyStage({
          activities: [
            {
              category: "art_culture",
              city: "Vienna",
              date: null,
              description:
                "Museum of Illusions, Mozarthaus, Ring Tram Tour, the Prater, Leopold Museum, St. Stephen's Cathedral.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              title: "Vienna sights list",
            },
          ],
          places: [
            { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
          ],
        })),
        stage("Sunday, January 20th", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-20",
              description: "St Stephens Cathedral",
              itemType: "activity",
              title: "St. Stephen's Cathedral",
            },
            {
              category: "food_dining",
              date: "2019-01-20",
              description: "Breakfast at Cafe Central.",
              itemType: "activity",
              title: "Cafe Central breakfast",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const cathedralCards = draft.activities.filter(
      (item) => item.itemType === "activity" && /stephen/i.test(String(item.title))
    );

    assert.equal(cathedralCards.length, 1, "the planned day-plan visit wins");
    assert.equal(cathedralCards[0]?.date, "2019-01-20");
    const notes = draft.activities.filter((item) => item.itemType === "note");
    const noteText = notes.map((note) => `${note.title} ${note.description ?? ""}`).join(" ");
    assert.doesNotMatch(noteText, /stephen/i, "the idea-list copy is removed");
    assert.match(noteText, /Leopold Museum/i, "other ideas keep their note home");
  });

  await test("ground truth run3 (RW-AUD-001): a Costs-section route line mints no transport anchor", () => {
    const anchors = extractSourceTransportAnchorsFromMaterials([
      {
        filename: "costs-appendix.pdf",
        sourceUploadId: "upload-costs",
        type: "pdf_text",
        text: [
          "Friday, January 25th",
          "Fly home.",
          "Costs",
          "Rome to Prague flight: ~$71.41",
          "Prague to Vienna train: $39 Business class",
          "Vienna to Budapest train: ($30-$50)",
          "Budapest to Rome flight: $76.26",
          "Hotel: (Budget $780- $65/night)",
        ].join("\n"),
      },
    ]);

    assert.equal(
      anchors.filter((anchor) => !anchor.departureTime && !anchor.number).length,
      0,
      "budget lines cannot become route-only anchors"
    );
  });

  await test("ground truth run3 (RW-AUD-001): a weak route-only anchor with a positional date still matches its real segment", () => {
    const weakAnchor: SourceTransportAnchor = {
      anchorId: "train-2019-01-25-train-prague-to-vienna-notime-25",
      arrivalLocation: "Vienna",
      arrivalTime: null,
      confidence: "medium",
      confirmation: null,
      date: "2019-01-25",
      departureLocation: "Prague",
      departureTime: null,
      evidence: "Prague to Vienna train: $39 Business class",
      kind: "train",
      number: null,
      provider: null,
      provenance: ["text_layer"],
      routeLabel: "Travel from Prague to Vienna",
      sourceFilename: "itinerary.pdf",
      sourceUploadId: "upload-1",
    };

    assert.equal(
      sourceTransportAnchorMatchesRecord(weakAnchor, {
        arrivalLocation: "Wien Hauptbahnhof",
        arrivalTime: "13:23",
        confirmationLabel: "1beb5005",
        date: "2019-01-18",
        departureLocation: "Praha Hlavni Nadrazi",
        departureTime: "09:20",
        provider: "RegioJet",
        routeLabel: "Train Prague to Vienna",
        transportType: "train",
      }),
      true,
      "an unreliable positional date cannot defeat route reconciliation"
    );
  });

  await test("ground truth run3 (RW-QUE-001): source-obvious transport questions reconcile against final travel rows", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Friday, January 18th", emptyStage({
          missingDetails: [
            {
              answerType: "text",
              evidence: '"Train to Vienna Train Code: 1beb5005"',
              prompt: "What is the departure time for the train from Prague to Vienna?",
              reason:
                "The train booking is present, but the departure time is not shown in this chunk and would complete the transport record.",
              subjectType: "trip",
              targetField: "departureTime",
            },
            {
              answerType: "text",
              evidence: '"Wizz Air Flight W6 2339 Confirmation RDGHMT Seat C1 Budapest (Terminal 2b)-> Rome Fiumicino"',
              prompt: "What is the confirmation number for the Budapest to Rome flight?",
              reason:
                "The source shows a confirmation-like field but it is not clearly separated from the flight header.",
              subjectType: "transport",
              targetField: "confirmation",
            },
          ],
          places: [
            { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
          ],
          transport: [
            {
              arrival: "Wien Hauptbahnhof",
              arrivalTime: "13:23",
              confirmation: "1beb5005",
              date: "2019-01-18",
              departure: "Praha Hlavni Nadrazi",
              departureTime: "09:20",
              title: "Train Prague to Vienna",
              type: "train",
            },
            {
              arrival: "Rome Fiumicino",
              arrivalTime: "14:10",
              confirmation: "RDGHMT",
              date: "2019-01-24",
              departure: "Budapest Terminal 2b",
              departureTime: "12:20",
              title: "Wizz Air Flight W6 2339",
              type: "flight",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const prompts = draft.missingDetails.map((detail) => String(detail.prompt ?? ""));

    assert.ok(
      !prompts.some((prompt) => /departure time for the train/i.test(prompt)),
      "the canonical row already has 09:20"
    );
    assert.ok(
      !prompts.some((prompt) => /confirmation number for the budapest/i.test(prompt)),
      "the canonical row already has RDGHMT"
    );
  });

  await test("ground truth run3 (RW-QUE-001): researched-list candidates hold as city ideas and promote end to end on 'planned'", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Friday, January 18th", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-18",
              description: "State Hall Library (free-7) - Open until 6.",
              itemType: "activity",
              title: "State Hall Library",
            },
            {
              category: "tours_tickets",
              date: "2019-01-18",
              description: "Time Travel Vienna (free-19.50) - Open until 8, last tour at 7.",
              itemType: "activity",
              title: "Time Travel Vienna",
            },
            {
              category: "art_culture",
              date: "2019-01-18",
              description: "Upper and lower Belvedere (free-20) - Open until 9 on Friday.",
              itemType: "activity",
              title: "Upper and lower Belvedere",
            },
          ],
          places: [
            { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft & { places: unknown[] };
    const cardTitles = draft.activities
      .filter((item) => item.itemType === "activity")
      .map((item) => String(item.title));

    assert.ok(
      !cardTitles.includes("State Hall Library") &&
        !cardTitles.includes("Time Travel Vienna"),
      "candidates hold as ideas while the question is open"
    );
    const question = draft.missingDetails.find((detail) =>
      /planned for the day, or just ideas/i.test(String(detail.prompt ?? ""))
    );
    assert.ok(question, "the planned-or-ideas question exists");
    const snapshots = (question?._canonicalMemberSnapshots ?? []) as Array<
      Record<string, unknown>
    >;
    assert.equal(snapshots.length, 3, "member snapshots ride on the question");

    // End-to-end answer: "planned" recreates the members as dated cards.
    const records = createStructuredTripRecordsFromDraft({
      draft: result.draft,
      fallbackTripName: "Run3",
      tripId: "trip-run3",
    });
    const reviewQuestion = records.reviewQuestions.find((candidate) =>
      /planned for the day/i.test(candidate.prompt)
    );
    assert.ok(reviewQuestion, "the question compiles into review records");
    assert.equal(reviewQuestion?.memberSnapshots?.length, 3);
    const answered = applyReviewDecision(records, {
      action: "answer_question",
      answerValue: "planned",
      createdAt: "2026-07-17T00:00:00.000Z",
      id: "decision-1",
      subjectId: reviewQuestion!.id,
      subjectType: "review_question",
      tripId: "trip-run3",
    });
    const promoted = answered.items.filter(
      (item) =>
        item.itemType === "activity" &&
        ["State Hall Library", "Time Travel Vienna", "Upper and lower Belvedere"].includes(
          item.title
        )
    );
    assert.equal(promoted.length, 3, "'planned' recreates all member cards");
    assert.ok(
      promoted.every((item) => item.date === "2019-01-18"),
      "promoted cards land on their source day"
    );
  });

  await test("ground truth run3 (RW-QUE-001): day-title slot options fold into ONE flexible card plus the question", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 21st // Budapest Bathing", emptyStage({
          activities: [
            {
              category: "wellness_relaxation",
              date: "2019-01-21",
              description: "Gellert Baths.",
              itemType: "activity",
              title: "Gellert Baths",
            },
            {
              category: "wellness_relaxation",
              date: "2019-01-23",
              description: "Baths.",
              itemType: "activity",
              title: "Baths",
            },
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const bathCards = draft.activities.filter(
      (item) => item.itemType === "activity" && /bath/i.test(String(item.title))
    );

    assert.equal(bathCards.length, 1, "one committed slot card owns the choice");
    assert.match(
      String(bathCards[0]?.description ?? ""),
      /gellert/i,
      "the folded venue is an option in the description"
    );
    assert.ok(
      draft.missingDetails.some((detail) =>
        /which one, or keep as ideas/i.test(String(detail.prompt ?? ""))
      ),
      "the slot question still fires"
    );
  });

  await test("ground truth run3 (RW-GRP-001): a fabricated 300 m same-site claim with unlisted children is rejected", () => {
    const decisionId = "resolver-royal-palace";
    const result = clusterExtractedEvidence({
      groupingDecisions: [{
        candidateIds: ["item-1", "item-2", "item-3"],
        claim:
          "same-site visit: 2 stops sit inside Royal Palace's grounds (within 300 m), so one visit card owns them",
        containerCandidateId: "item-1",
        decisionId,
        parentCandidateId: "item-1",
        parentTitle: "Royal Palace visit",
        source: "canonical_resolver",
      }],
      sourceTransportAnchors: [],
      stages: [
        stage("Tuesday, January 22nd", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-22",
              description:
                "Stroll through Castle Hill, Royal Palace, and enjoy the view from the terrace at the top of the funicular.",
              _canonicalGroupingDecisionIds: [decisionId],
              _resolverCandidateId: "item-1",
              itemType: "activity",
              title: "Royal Palace",
            },
            {
              category: "art_culture",
              date: "2019-01-22",
              description:
                "Take the funicular down to the Szechenyi Chain Bridge and walk across to the Pest side.",
              _resolverCandidateId: "item-2",
              itemType: "activity",
              startTime: "11:00",
              title: "Szechenyi Chain Bridge",
            },
            {
              category: "food_dining",
              date: "2019-01-22",
              description: "Quick break for coffee and pastry.",
              _resolverCandidateId: "item-3",
              itemType: "activity",
              title: "Gerbeaud's",
            },
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const roots = draft.activities.filter(
      (item) => item.itemType === "activity" && !item._canonicalParentPieceId
    );

    assert.equal(roots.length, 3, "no coordinates + not source-listed = no group");
    assert.ok(
      !draft.missingDetails.some((detail) =>
        /within 300 m/i.test(String(detail.evidence ?? ""))
      ),
      "no fabricated geo call survives"
    );
  });

  await test("ground truth run3 (RW-GRP-001): a container naming two sites cannot form one same-site visit", () => {
    const decisionId = "resolver-castle-lesser-town";
    const result = clusterExtractedEvidence({
      groupingDecisions: [{
        candidateIds: ["item-1", "item-2", "item-3", "item-4", "item-5"],
        claim:
          "same-site visit: the source lists 4 stops inside Prague Castle and Lesser Town visit's own visit, so one visit card owns them",
        containerCandidateId: "item-1",
        decisionId,
        parentCandidateId: "item-1",
        parentTitle: "Prague Castle and Lesser Town visit",
        source: "canonical_resolver",
      }],
      sourceTransportAnchors: [],
      stages: [
        stage("Wednesday, January 16th", emptyStage({
          activities: [
            {
              category: "tours_tickets",
              date: "2019-01-16",
              description:
                "Prague Castle for 2 hours. Changing of the Guard at 12:00 PM. St. Vitus Cathedral, Vinarna Certovka, John Lennon Wall, KGB museum for 1 hour, Novy Svet.",
              _canonicalGroupingDecisionIds: [decisionId],
              _resolverCandidateId: "item-1",
              itemType: "activity",
              title: "Prague Castle and Lesser Town visit",
            },
            {
              category: "art_culture",
              date: "2019-01-16",
              description: "John Lennon Wall.",
              _resolverCandidateId: "item-2",
              itemType: "activity",
              title: "John Lennon Wall",
            },
            {
              category: "art_culture",
              date: "2019-01-16",
              description: "KGB museum for 1 hour.",
              _resolverCandidateId: "item-3",
              itemType: "activity",
              title: "KGB museum",
            },
            {
              category: "art_culture",
              date: "2019-01-16",
              description: "Vinarna Certovka.",
              _resolverCandidateId: "item-4",
              itemType: "activity",
              title: "Vinarna Certovka",
            },
            {
              category: "admin_logistics",
              date: "2019-01-16",
              description: "$56 (airbnb)",
              _resolverCandidateId: "item-5",
              itemType: "activity",
              title: "Prague lodging note",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const grouped = draft.activities.filter((item) =>
      Boolean(item._canonicalParentPieceId)
    );

    assert.equal(grouped.length, 0, "a two-site container is not one site");
    assert.ok(
      !draft.activities.some(
        (item) =>
          Boolean(item._canonicalParentPieceId) &&
          /lodging note/i.test(String(item.title))
      ),
      "a lodging-cost fragment is never a tourist stop"
    );
  });

  await test("ground truth run3 (RW-CLS-001): city-note sections never orphan a 'St.' abbreviation and keep routed content", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Saturday, January 19th", emptyStage({
          activities: [
            {
              category: "art_culture",
              city: "Vienna",
              date: null,
              description:
                "Museum of Illusions, Mozarthaus, Ring Tram Tour, the Prater, Leopold Museum, St. Stephen's Cathedral.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              title: "Vienna sights list",
            },
            {
              category: "food_dining",
              city: "Vienna",
              date: null,
              description: "Eat: Sachertorte, Wiener schnitzel, tafelspitz, apfelstrudel.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              title: "Vienna food and cafe ideas",
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
    const note = draft.activities.find(
      (item) => item.itemType === "note" && /vienna/i.test(String(item.title))
    );

    assert.ok(note, "one Vienna note collection exists");
    const text = String(note?.description ?? "");
    assert.match(text, /St\. Stephen's Cathedral/, "abbreviations never split an entity");
    assert.doesNotMatch(text, /,\s*St\.\s*$/, "the note never ends on an orphaned abbreviation");
    assert.match(text, /Sachertorte/, "routed food content lands in the note");
    assert.match(text, /Leopold Museum/, "routed sights content lands in the note");
  });

  await test("ground truth run3 (RW-ASM-001): a multi-topic city tip naming another leg's venue keeps its city home", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Tuesday, January 22nd", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-15",
              description: "Klementinum tour at 2:30 PM.",
              itemType: "activity",
              startTime: "14:30",
              title: "Klementinum guided tour",
            },
            {
              category: "admin_logistics",
              city: "Budapest",
              date: null,
              description:
                "Buy a public transport ticket pack at the metro. Validate every tram ride. The Klementinum queue tip does not apply here.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              title: "Budapest public transportation tip",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const budapestNote = draft.activities.find(
      (item) => item.itemType === "note" && /budapest/i.test(String(item.title))
    );

    assert.ok(budapestNote, "the Budapest note survives");
    assert.match(
      String(budapestNote?.description ?? ""),
      /public transport|tram/i,
      "the transit tip stays in its city's notes"
    );
  });

  await test("ground truth run3 (AS-5): review, summary, fingerprints, and bundle share one count definition", () => {
    const records = createStructuredTripRecordsFromDraft({
      draft: {
        activities: [
          { date: "2019-01-17", itemType: "admin", title: "Pick up car", category: "admin_logistics" },
          { date: "2019-01-17", itemType: "activity", title: "Sedlec Ossuary", category: "nature_outdoors" },
          { date: null, itemType: "note", title: "Prague Notes & Tips", category: "food_dining" },
        ],
        missingDetails: [],
        places: [
          { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
        ],
        sensitiveDetails: [],
        stays: [],
        transport: [
          {
            date: "2019-01-18",
            departure: "Praha",
            departureTime: "09:20",
            arrival: "Wien",
            title: "Train Prague to Vienna",
            type: "train",
          },
        ],
        tripOverview: { title: "Counts" },
      },
      fallbackTripName: "Counts",
      tripId: "trip-counts",
    });
    const fingerprints = createTripExtractionFingerprints(records);
    const summary = createGeneratedTripSummaryView(records);

    assert.equal(
      fingerprints.counts.activeActivities,
      2,
      "fingerprints count every top-level card including admin"
    );
    assert.equal(summary.counts.activities, 2, "summary counts the same cards");
    assert.equal(
      summary.counts.plans,
      3,
      "Plans = top-level activity-umbrella cards + travel cards"
    );
  });
}
