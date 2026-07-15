import assert from "node:assert/strict";
import {
  inspectCanonicalEvidenceResolutionPlan,
} from "@/lib/extraction/canonical-evidence-resolver";
import {
  clusterExtractedEvidence,
  EVIDENCE_CLUSTER_VERSION,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import {
  createStructuredTripRecordsFromDraft,
} from "@/lib/extraction/draft-to-structured-trip";
import { CanonicalIdentityInvariantError } from "@/lib/extraction/canonical-identity";
import { applyReviewDecision } from "@/lib/generated-trip-decisions";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
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

function activity({
  category = "art_culture",
  city,
  date,
  description = null,
  sourceSectionType = "dated_itinerary",
  startTime = null,
  title,
}: {
  category?: string;
  city: string;
  date: string;
  description?: string | null;
  sourceSectionType?: "booking_detail" | "city_reference" | "dated_itinerary";
  startTime?: string | null;
  title: string;
}) {
  return {
    category,
    city,
    date,
    description,
    endTime: null,
    evidenceRole: "atomic_candidate",
    itemType: "activity",
    sourceHeadingPath: [date, city],
    sourceSectionLabel: city,
    sourceSectionType,
    startTime,
    title,
  };
}

function stage({
  label,
  sourceText,
  value,
}: {
  label: string;
  sourceText?: string;
  value: Record<string, unknown>;
}): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: `${label}.txt`,
    sourceText,
    sourceUploadId: `upload-${label}`,
    stage: value,
  };
}

function clusterAndCompile(stages: EvidenceStageInput[], tripId: string) {
  const result = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages,
    tripOverview: { title: tripId },
  });
  const records = createStructuredTripRecordsFromDraft({
    draft: result.draft,
    fallbackTripName: tripId,
    tripId,
  });

  return { draft: result.draft as Record<string, unknown>, records, result };
}

export default async function run() {
  await test("a clean city break projects one-to-one without collapsing activities", () => {
    const activities = [
      activity({ city: "Florence", date: "2032-05-02", title: "Uffizi Gallery" }),
      activity({
        category: "food_dining",
        city: "Florence",
        date: "2032-05-02",
        title: "Mercato Centrale lunch",
      }),
      activity({
        category: "nature_outdoors",
        city: "Florence",
        date: "2032-05-02",
        title: "Piazzale Michelangelo sunset",
      }),
    ];
    const { draft, records } = clusterAndCompile([
      stage({
        label: "florence-clean",
        sourceText: activities.map((item) => item.title).join("\n\n"),
        value: emptyStage({
          activities,
          places: [{
            arriveDate: "2032-05-01",
            city: "Florence",
            country: "Italy",
            leaveDate: "2032-05-04",
          }],
          stays: [{
            address: "12 Via Example, Florence",
            checkIn: "2032-05-01",
            checkOut: "2032-05-04",
            city: "Florence",
            name: "Hotel Arno",
            stayType: "hotel",
          }],
          transport: [{
            arrival: "Florence Airport",
            arrivalTime: "10:40",
            date: "2032-05-01",
            departure: "Paris CDG",
            departureTime: "08:35",
            title: "Flight to Florence",
            type: "flight",
          }],
        }),
      }),
    ], "clean-city-break");

    assert.deepEqual(
      records.items.map((item) => item.title),
      activities.map((item) => item.title)
    );
    assert.equal(records.stays.length, 1);
    assert.equal(records.transport.length, 1);
    assert.equal(records.reviewQuestions.length, 0);
    assert.equal((draft.activities as unknown[]).length, records.items.length);
    assert.ok(records.items.every((item) => item.id.includes("item-piece_")));
  });

  await test("repeat visits on different dates stay separate in a clean itinerary", () => {
    const { records } = clusterAndCompile([
      stage({
        label: "repeat-visits",
        sourceText: "National Gallery\n\nNational Gallery",
        value: emptyStage({
          activities: [
            activity({ city: "London", date: "2033-06-02", title: "National Gallery" }),
            activity({ city: "London", date: "2033-06-05", title: "National Gallery" }),
          ],
          places: [{
            arriveDate: "2033-06-01",
            city: "London",
            country: "United Kingdom",
            leaveDate: "2033-06-07",
          }],
        }),
      }),
    ], "repeat-visit-trip");

    assert.equal(records.items.length, 2);
    assert.deepEqual(records.items.map((item) => item.date), ["2033-06-02", "2033-06-05"]);
  });

  await test("resolver discovery opens complex windows but not blank-separated clean plans", () => {
    const complexTitles = [
      "Schonbrunn Palace",
      "Gloriette",
      "Orangeriegarten",
      "Palm House",
      "Apple Strudel Show",
      "Panorama Train pass",
    ];
    const complexActivities = complexTitles.map((title) =>
      activity({ city: "Vienna", date: "2034-04-02", title })
    );
    const complexPlan = inspectCanonicalEvidenceResolutionPlan([
      stage({
        label: "palace-complex",
        sourceText: complexTitles.join("\n"),
        value: emptyStage({ activities: complexActivities }),
      }),
    ]);
    const cleanTitles = ["Albertina", "St. Stephen's Cathedral", "Prater Ferris Wheel"];
    const cleanPlan = inspectCanonicalEvidenceResolutionPlan([
      stage({
        label: "clean-separated",
        sourceText: cleanTitles.join("\n\n"),
        value: emptyStage({
          activities: cleanTitles.map((title) =>
            activity({ city: "Vienna", date: "2034-04-03", title })
          ),
        }),
      }),
    ]);

    assert.equal(complexPlan.requiresLookup, true);
    assert.ok(complexPlan.windows.some((window) => window.titles.length >= 2));
    assert.equal(cleanPlan.requiresLookup, false);
    assert.equal(cleanPlan.windows.length, 0);

    const twoPartPlan = inspectCanonicalEvidenceResolutionPlan([
      stage({
        label: "two-part-site",
        sourceText: "Hilltop Palace\nPalace Gardens",
        value: emptyStage({
          activities: [
            activity({ city: "Sample City", date: "2034-04-04", title: "Hilltop Palace" }),
            activity({ city: "Sample City", date: "2034-04-04", title: "Palace Gardens" }),
          ],
        }),
      }),
    ]);
    assert.equal(twoPartPlan.requiresLookup, true);
  });

  await test("dense ambiguous day context reaches the bounded resolver without imposing a cap", () => {
    const titles = [
      "Booked museum entry",
      "Dinner reservation",
      ...Array.from({ length: 10 }, (_, index) => `Possible venue ${index + 1}`),
    ];
    const activities = titles.map((title, index) =>
      activity({
        city: "Vienna",
        date: "2034-04-05",
        startTime: index < 2 ? (index === 0 ? "10:00" : "20:00") : null,
        title,
      })
    );
    const plan = inspectCanonicalEvidenceResolutionPlan([
      stage({
        label: "dense-ambiguous-day",
        sourceText: titles.join("\n"),
        value: emptyStage({ activities }),
      }),
    ]);

    assert.equal(plan.requiresLookup, true);
    assert.ok(plan.windows.some((window) => window.titles.length === titles.length));
  });

  await test("same-city and intercity rentals resolve on the canonical side", () => {
    const { records } = clusterAndCompile([
      stage({
        label: "rental-boundaries",
        value: emptyStage({
          places: [
            { arriveDate: "2035-07-01", city: "Prague", leaveDate: "2035-07-04" },
            { arriveDate: "2035-07-04", city: "Vienna", leaveDate: "2035-07-07" },
          ],
          transport: [
            {
              arrival: "Prague Airport",
              arrivalDate: "2035-07-02",
              date: "2035-07-02",
              departure: "Prague Downtown",
              departureDate: "2035-07-02",
              departureTime: "09:00",
              title: "Prague rental car pickup and return",
              type: "rental_car",
            },
            {
              arrival: "Vienna Downtown",
              arrivalDate: "2035-07-05",
              date: "2035-07-04",
              departure: "Prague Airport",
              departureDate: "2035-07-04",
              departureTime: "08:00",
              title: "One-way rental car from Prague to Vienna",
              type: "rental_car",
            },
          ],
        }),
      }),
    ], "rental-route");

    assert.deepEqual(records.items.map((item) => item.title), [
      "Prague rental car pickup and return",
    ]);
    assert.deepEqual(records.transport.map((item) => item.routeLabel), [
      "One-way rental car from Prague to Vienna",
    ]);
  });

  await test("source hierarchy wins silently while equal-authority conflicts ask once", () => {
    const dated = activity({
      city: "Paris",
      date: "2036-09-03",
      startTime: "09:00",
      title: "Louvre timed entry",
    });
    const booking = activity({
      city: "Paris",
      date: "2036-09-03",
      sourceSectionType: "booking_detail",
      startTime: "10:00",
      title: "Louvre timed entry",
    });
    const preferred = clusterAndCompile([
      stage({ label: "dated-plan", value: emptyStage({ activities: [dated] }) }),
      stage({ label: "booking-receipt", value: emptyStage({ activities: [booking] }) }),
    ], "source-precedence");

    assert.equal(preferred.records.items[0]?.startTime, "10:00");
    assert.equal(preferred.records.reviewQuestions.length, 0);

    const conflicted = clusterAndCompile([
      stage({ label: "dated-plan-a", value: emptyStage({ activities: [dated] }) }),
      stage({
        label: "dated-plan-b",
        value: emptyStage({ activities: [{ ...dated, startTime: "11:00" }] }),
      }),
    ], "equal-source-conflict");
    const openQuestions = conflicted.records.reviewQuestions.filter(
      (question) => question.status === "open"
    );

    assert.equal(openQuestions.length, 1);
    assert.equal(openQuestions[0]?.targetField, "startTime");
  });

  await test("multiple unnamed same-city rentals stay distinct and never expose address in title", () => {
    const { records } = clusterAndCompile([
      stage({
        label: "two-lisbon-rentals",
        value: emptyStage({
          places: [{
            arriveDate: "2037-10-01",
            city: "Lisbon",
            leaveDate: "2037-10-09",
          }],
          stays: [
            {
              address: "10 Rua Alpha, Alfama, Lisbon",
              checkIn: "2037-10-01",
              checkOut: "2037-10-04",
              city: "Lisbon",
              name: "Airbnb",
              stayType: "private_rental",
            },
            {
              address: "20 Rua Beta, Estrela, Lisbon",
              checkIn: "2037-10-05",
              checkOut: "2037-10-09",
              city: "Lisbon",
              name: "Airbnb",
              stayType: "private_rental",
            },
          ],
        }),
      }),
    ], "two-rentals");

    assert.equal(records.stays.length, 2);
    assert.equal(new Set(records.stays.map((stay) => stay.name)).size, 2);
    assert.ok(records.stays.every((stay) => stay.name.startsWith("Lisbon Airbnb")));
    assert.ok(records.stays.every((stay) => !/Rua Alpha|Rua Beta/i.test(stay.name)));
    assert.ok(records.stays.every((stay) => stay.addressVisibility === "traveler_password"));
  });

  await test("home endpoints are not legs while overnight destinations remain legs", () => {
    const { records } = clusterAndCompile([
      stage({
        label: "home-boundaries",
        value: emptyStage({
          activities: [
            activity({ city: "Rome", date: "2037-11-02", title: "Roman Forum" }),
            activity({ city: "Paris", date: "2037-11-05", title: "Louvre Museum" }),
          ],
          places: [
            { arriveDate: "2037-11-01", city: "Washington", leaveDate: "2037-11-02" },
            { arriveDate: "2037-11-02", city: "Rome", leaveDate: "2037-11-04" },
            { arriveDate: "2037-11-04", city: "Paris", leaveDate: "2037-11-07" },
            { arriveDate: "2037-11-07", city: "Washington", leaveDate: null },
          ],
          stays: [
            { checkIn: "2037-11-02", checkOut: "2037-11-04", name: "Hotel Roma" },
            { checkIn: "2037-11-04", checkOut: "2037-11-07", name: "Hotel Paris" },
          ],
          transport: [
            {
              arrival: "Rome",
              date: "2037-11-01",
              departure: "Washington",
              departureTime: "18:00",
              title: "Flight to Rome",
              type: "flight",
            },
            {
              arrival: "Washington",
              date: "2037-11-07",
              departure: "Paris",
              departureTime: "10:00",
              title: "Flight home to Washington",
              type: "flight",
            },
          ],
        }),
      }),
    ], "home-boundaries");

    assert.deepEqual(records.legs.map((leg) => leg.city), ["Rome", "Paris"]);
  });

  await test("an overnight destination without lodging remains a leg and asks once", () => {
    const { records } = clusterAndCompile([
      stage({
        label: "missing-paris-stay",
        value: emptyStage({
          activities: [activity({ city: "Paris", date: "2038-04-03", title: "Musee d'Orsay" })],
          places: [{ arriveDate: "2038-04-02", city: "Paris", leaveDate: "2038-04-05" }],
          transport: [{
            arrival: "Paris",
            date: "2038-04-02",
            departure: "Boston",
            departureTime: "19:00",
            title: "Flight to Paris",
            type: "flight",
          }],
        }),
      }),
    ], "missing-paris-stay");

    assert.deepEqual(records.legs.map((leg) => leg.city), ["Paris"]);
    assert.equal(
      records.reviewQuestions.filter((question) =>
        question.prompt === "Where are you staying in Paris?"
      ).length,
      1
    );
    const question = records.reviewQuestions.find((candidate) =>
      candidate.prompt === "Where are you staying in Paris?"
    );
    assert.ok(question);
    const answered = applyReviewDecision(records, {
      action: "answer_question",
      answerValue: "Hotel du Louvre",
      createdAt: "2038-01-01T00:00:00.000Z",
      id: "decision-paris-stay",
      subjectId: question.id,
      subjectType: "review_question",
      tripId: "missing-paris-stay",
    });
    assert.deepEqual(
      answered.stays.map((stay) => ({
        checkIn: stay.checkInDate,
        checkOut: stay.checkOutDate,
        legId: stay.legId,
        name: stay.name,
        visibility: stay.addressVisibility,
      })),
      [{
        checkIn: "2038-04-02",
        checkOut: "2038-04-05",
        legId: records.legs[0]?.id,
        name: "Hotel du Louvre",
        visibility: "traveler_password",
      }]
    );
  });

  await test("fresh canonical records without stable identity fail closed", () => {
    assert.throws(
      () => createStructuredTripRecordsFromDraft({
        draft: {
          _evidence: {
            canonicalPieceIds: [],
            observationIds: [],
            version: EVIDENCE_CLUSTER_VERSION,
          },
          activities: [{
            category: "art_culture",
            date: "2038-01-02",
            itemType: "activity",
            title: "Museum",
          }],
          missingDetails: [],
          places: [],
          sensitiveDetails: [],
          stays: [],
          transport: [],
          tripOverview: { title: "Invalid canonical draft" },
        },
        fallbackTripName: "Invalid canonical draft",
        tripId: "invalid-canonical",
      }),
      CanonicalIdentityInvariantError
    );
  });
}
