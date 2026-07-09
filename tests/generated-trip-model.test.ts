import assert from "node:assert/strict";
import { consolidateTripDraft } from "@/lib/extraction/consolidate-trip-draft";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import {
  createActivityExtractionChunks,
  isSuspiciouslyEmptyActivityChunkResult,
} from "@/lib/extraction/openai-trip-parser";
import {
  createDraftAuditSnapshot,
  createTripExtractionAuditReport,
} from "@/lib/extraction/trip-extraction-audit";
import { parseOptionalEnvList } from "@/lib/env";
import {
  applyReviewDecision,
  applyReviewDecisions,
} from "@/lib/generated-trip-decisions";
import {
  formatStructuredDiscoverySummary,
  getStructuredReviewCount,
  getStructuredReviewSections,
} from "@/lib/generated-trip-review";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";
import {
  normalizeTripReviewDecisionRow,
  serializeTripReviewDecision,
} from "@/lib/review-decisions";
import {
  createPublishedPrivateDetails,
  createPublishedTripSnapshotPayload,
} from "@/lib/published-snapshots";
import {
  hashTravelerPassword,
  verifyTravelerPassword,
} from "@/lib/traveler-access";
import { classifyAddressSensitivity } from "@/lib/traveler-privacy";
import {
  createTravelerAppViewModel,
  getAsiaDemoStructuredTripRecords,
  getAsiaDemoTravelerAppViewModel,
} from "@/lib/traveler-view-model";
import { canEditTripMaterials } from "@/lib/trips";
import {
  getUnpaidStarterMaterialCleanupCutoff,
  UNPAID_STARTER_MATERIAL_RETENTION_DAYS,
} from "@/lib/uploads";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("activity extraction chunks preserve dated sections from the middle of long materials", () => {
  const sourceText = [
    "Saturday, January 12th",
    "Fly to Rome.",
    "Sunday, January 13th",
    "Colosseum at 2 PM.",
    "Monday, January 14th",
    "Prague walk.",
    "Tuesday, January 15th",
    "Klementinum 2:30 Tour.",
    "Wednesday, January 16th",
    "R2D2 far away.",
    "Thursday, January 17th",
    "Sedlec Ossuary, St. Barbara, Silver Mines.",
    "Friday, January 18th",
    "Albertina and Belvedere.",
    "Saturday, January 19th",
    "Schonbrunn Palace complex and Mumok.",
  ].join("\n");

  const chunks = createActivityExtractionChunks(
    [
      {
        filename: "central-europe.pdf",
        text: sourceText,
        type: "pdf_text",
      },
    ],
    500
  );

  assert.ok(chunks.length >= 8, "expected one chunk per dated section");
  assert.ok(
    chunks.some((chunk) => /January 17th/.test(chunk.label)),
    "expected middle day heading to survive as its own chunk"
  );
  assert.ok(
    chunks.some((chunk) => /Sedlec Ossuary/.test(chunk.materials[0]?.text ?? "")),
    "expected middle-day activities to survive chunking"
  );
});

test("activity chunks with source-backed activity signals cannot quietly return empty", () => {
  const [chunk] = createActivityExtractionChunks([
    {
      filename: "central-europe.pdf",
      text: [
        "Thursday, January 17th",
        "Pick up car at 9 am.",
        "Sedlec Ossuary, St. Barbara church, and Silver Mines.",
      ].join("\n"),
      type: "pdf_text",
    },
  ]);

  assert.ok(chunk, "expected an activity extraction chunk");
  assert.equal(
    isSuspiciouslyEmptyActivityChunkResult({
      chunk,
      stage: {
        activities: [],
        missingDetails: [],
        sensitiveDetails: [],
      },
    }),
    true,
    "dated named venues should trigger activity recovery"
  );
  assert.equal(
    isSuspiciouslyEmptyActivityChunkResult({
      chunk,
      stage: {
        activities: [
          {
            title: "Sedlec Ossuary",
          },
        ],
        missingDetails: [],
        sensitiveDetails: [],
      },
    }),
    false,
    "chunks with extracted cards should not be suspicious"
  );

  const [transportOnlyChunk] = createActivityExtractionChunks([
    {
      filename: "train-ticket.pdf",
      text: "Train ticket Vienna to Budapest. Departure station Wien Hbf. Seat 42.",
      type: "pdf_text",
    },
  ]);

  assert.ok(transportOnlyChunk, "expected a transport-only chunk");
  assert.equal(
    isSuspiciouslyEmptyActivityChunkResult({
      chunk: transportOnlyChunk,
      stage: {
        activities: [],
        missingDetails: [],
        sensitiveDetails: [],
      },
    }),
    false,
    "transport-only chunks should not trigger activity recovery"
  );

  const [foodTipsChunk] = createActivityExtractionChunks([
    {
      filename: "city-notes.pdf",
      text: [
        "Budapest",
        "Eat: langos, chimney cake, paprika.",
        "Beer halls: Szimpla Kert, For Sale Pub.",
      ].join("\n"),
      type: "pdf_text",
    },
  ]);

  assert.ok(foodTipsChunk, "expected a food tips chunk");
  assert.equal(
    isSuspiciouslyEmptyActivityChunkResult({
      chunk: foodTipsChunk,
      stage: {
        activities: [],
        missingDetails: [],
        sensitiveDetails: [],
      },
    }),
    true,
    "food recommendations should trigger city notes/tips recovery"
  );

  const [localNotesChunk] = createActivityExtractionChunks([
    {
      filename: "city-notes.pdf",
      text: [
        "Budapest notes",
        "Find gypsy music if there is time.",
        "Vaci Utca is skippable.",
      ].join("\n"),
      type: "pdf_text",
    },
  ]);

  assert.ok(localNotesChunk, "expected a local notes chunk");
  assert.equal(
    isSuspiciouslyEmptyActivityChunkResult({
      chunk: localNotesChunk,
      stage: {
        activities: [],
        missingDetails: [],
        sensitiveDetails: [],
      },
    }),
    true,
    "local notes should trigger city notes/tips recovery"
  );

  const [lodgingOnlyChunk] = createActivityExtractionChunks([
    {
      filename: "lodging.pdf",
      text: "Airbnb check-in after 3:00 PM. Host sends apartment access details.",
      type: "pdf_text",
    },
  ]);

  assert.ok(lodgingOnlyChunk, "expected a lodging-only chunk");
  assert.equal(
    isSuspiciouslyEmptyActivityChunkResult({
      chunk: lodgingOnlyChunk,
      stage: {
        activities: [],
        missingDetails: [],
        sensitiveDetails: [],
      },
    }),
    false,
    "lodging-only chunks should not trigger activity recovery"
  );

  const [weakTicketChunk] = createActivityExtractionChunks([
    {
      filename: "admin-note.pdf",
      text: "Ticket note: keep receipts together for later.",
      type: "note",
    },
  ]);

  assert.ok(weakTicketChunk, "expected a weak ticket note chunk");
  assert.equal(
    isSuspiciouslyEmptyActivityChunkResult({
      chunk: weakTicketChunk,
      stage: {
        activities: [],
        missingDetails: [],
        sensitiveDetails: [],
      },
    }),
    false,
    "weak ticket admin notes should not trigger activity recovery"
  );
});

test("draft consolidation suppresses duplicate travel activities without dropping local movement", () => {
  const { debug, draft } = consolidateTripDraft({
    activities: [
      {
        category: "arrival_departure",
        date: "2026-09-02",
        itemType: "activity",
        title: "Fly to Rome",
      },
      {
        category: "arrival_departure",
        date: "2026-09-02",
        description: "Take metro to the airport from Keleti at 2:30 PM.",
        itemType: "activity",
        startTime: "14:30",
        title: "Take metro to airport",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Budapest",
        leaveDate: "2026-09-03",
      },
    ],
    stays: [],
    transport: [
      {
        arrival: "Rome FCO",
        date: "2026-09-02",
        departure: "Budapest BUD",
        title: "Budapest to Rome",
        type: "flight",
      },
    ],
  }) as {
    debug: ReturnType<typeof consolidateTripDraft>["debug"];
    draft: { activities: Array<{ title?: string }> };
  };

  assert.deepEqual(
    draft.activities.map((activity) => activity.title),
    ["Take metro to airport"]
  );
  assert.equal(debug.suppressedTransportActivities[0]?.removedTitle, "Fly to Rome");
  assert.equal(
    debug.suppressedTransportActivities[0]?.matchedTransportTitle,
    "Budapest to Rome"
  );
});

test("draft consolidation keeps day-trip rental car pickup as an activity", () => {
  const { debug, draft } = consolidateTripDraft({
    activities: [
      {
        category: "arrival_departure",
        address: "Revolucni 1044/23",
        date: "2019-01-17",
        description: "Pick up car at 9 am. Reservation number: 81486.",
        itemType: "activity",
        startTime: "09:00",
        title: "Car pickup for Kutna Hora",
      },
      {
        category: "art_culture",
        date: "2019-01-17",
        itemType: "activity",
        title: "Sedlec Ossuary",
      },
    ],
    places: [
      {
        arriveDate: "2019-01-14",
        city: "Prague",
        leaveDate: "2019-01-18",
      },
    ],
    stays: [],
    transport: [
      {
        date: "2019-01-17",
        departure: "Revolucni 1044/23",
        title: "Car pickup for Kutna Hora",
        type: "rental_car",
      },
    ],
  }) as {
    debug: ReturnType<typeof consolidateTripDraft>["debug"];
    draft: {
      activities: Array<{
        address?: string;
        description?: string;
        startTime?: string;
        title?: string;
      }>;
      transport: Array<{ title?: string }>;
    };
  };

  assert.deepEqual(
    draft.activities.map((activity) => activity.title),
    ["Pick up rental car for Kutna Hora", "Sedlec Ossuary"]
  );
  assert.equal(draft.transport.length, 0);
  assert.equal(debug.suppressedTransportActivities.length, 0);
  assert.equal(debug.normalizedRentalCarPickups[0]?.title, "Pick up rental car for Kutna Hora");
  assert.equal(draft.activities[0]?.startTime, "09:00");
  assert.equal(draft.activities[0]?.address, "Revolucni 1044/23");
  assert.match(draft.activities[0]?.description ?? "", /Reservation number: 81486/);
  assert.match(draft.activities[0]?.description ?? "", /Pickup: Revolucni 1044\/23/);
});

test("draft consolidation promotes transport times from descriptions", () => {
  const { draft } = consolidateTripDraft({
    activities: [],
    places: [],
    stays: [],
    transport: [
      {
        arrival: "Vienna Hbf",
        date: "2019-01-18",
        departure: "Praha hl.n.",
        description:
          "RegioJet RJ 1033 leaves Praha Hlavni Nadrazi at 09:20 and arrives Wien Hbf at 13:23. Train code 1beb5005.",
        title: "Train to Vienna",
        type: "train",
      },
    ],
  }) as {
    draft: {
      transport: Array<{ arrivalTime?: string; departureTime?: string }>;
    };
  };

  assert.equal(draft.transport[0]?.departureTime, "09:20");
  assert.equal(draft.transport[0]?.arrivalTime, "13:23");
});

test("draft consolidation removes broad parent cards when named children cover them", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2026-09-02",
          description:
            "Old Town Square, Jewish Quarter, and Klementinum are listed for the day.",
          itemType: "activity",
          title: "Prague history sights",
        },
        {
          category: "tours_tickets",
          date: "2026-09-02",
          itemType: "activity",
          startTime: "09:00",
          title: "Old Town and Jewish Quarter Hidden Secrets",
        },
        {
          category: "tours_tickets",
          date: "2026-09-02",
          itemType: "activity",
          startTime: "14:30",
          title: "Klementinum Tour",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Prague",
          leaveDate: "2026-09-03",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Prague",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-parent-child-prune",
  });
  const titles = records.items.map((item) => item.title);

  assert.equal(titles.includes("Prague history sights"), false);
  assert.equal(titles.includes("Old Town and Jewish Quarter Hidden Secrets"), true);
  assert.equal(titles.includes("Klementinum Tour"), true);
  assert.equal(
    records.reviewQuestions.some((question) =>
      /removed Prague history sights/i.test(question.prompt)
    ),
    false
  );
});

test("draft consolidation keeps separate timed tickets while removing invented composite parents", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-15",
          description:
            "Composite row inferred from the day: walking tour in the morning and Klementinum at 2:30.",
          itemType: "activity",
          startTime: "09:00",
          title: "Prague walking tour and Klementinum",
        },
        {
          category: "tours_tickets",
          date: "2019-01-15",
          description: "Booking L272-181125-2 with LivingPragueTours.",
          itemType: "activity",
          startTime: "09:00",
          title: "Old Town and Jewish Quarter Hidden Secrets",
        },
        {
          category: "tours_tickets",
          date: "2019-01-15",
          description: "Separate Klementinum guided tour ticket.",
          itemType: "activity",
          startTime: "14:30",
          title: "Klementinum tour",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          leaveDate: "2019-01-18",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-prague-discrete-tickets",
  });
  const titles = records.items.map((item) => item.title);

  assert.equal(titles.includes("Prague walking tour and Klementinum"), false);
  assert.equal(titles.includes("Old Town and Jewish Quarter Hidden Secrets"), true);
  assert.equal(titles.includes("Klementinum tour"), true);
  assert.equal(
    records.reviewQuestions.some((question) =>
      /Prague walking tour and Klementinum/i.test(question.prompt)
    ),
    false
  );
});

test("extraction audit report compares raw candidates, assembly, and structured output", () => {
  const rawDraft = {
    activities: [
      {
        category: "art_culture",
        date: "2026-09-02",
        description:
          "Old Town Square, Jewish Quarter, and Klementinum are listed for the day.",
        itemType: "activity",
        title: "Prague history sights",
      },
      {
        category: "tours_tickets",
        date: "2026-09-02",
        itemType: "activity",
        startTime: "09:00",
        title: "Old Town and Jewish Quarter Hidden Secrets",
      },
      {
        category: "tours_tickets",
        date: "2026-09-02",
        itemType: "activity",
        startTime: "14:30",
        title: "Klementinum Tour",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Prague",
        country: "Czechia",
        leaveDate: "2026-09-03",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Prague",
    },
  };
  const { debug, draft } = consolidateTripDraft(rawDraft);
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-audit-report",
  });
  const report = createTripExtractionAuditReport({
    draft,
    records,
    usage: {
      openai: {
        activityChunks: {
          count: 1,
          failed: 0,
          rescued: 0,
          succeeded: 1,
        },
        audit: {
          assembledDraft: createDraftAuditSnapshot(draft),
          preAssemblyDraft: createDraftAuditSnapshot(rawDraft),
        },
        consolidation: debug,
        staged: true,
      },
    },
  });

  assert.equal(report.extraction.staged, true);
  assert.equal(report.extraction.activityChunks?.succeeded, 1);
  assert.equal(report.assembly.removedDuplicateParents, 1);
  assert.deepEqual(report.sourceComparison?.rawOnlyTitles, [
    "Prague history sights",
  ]);
  assert.equal(
    report.lineage.some(
      (row) =>
        row.title === "Prague history sights" &&
        row.status === "removed_in_assembly" &&
        row.assemblyActions.some(
          (action) => action.action === "removed_duplicate_parent"
        )
    ),
    true
  );
  assert.equal(report.structured.activeActivities, 2);
  assert.equal(report.structured.hardWarnings, 0);
});

test("extraction audit flags transport candidates that remain activity cards", () => {
  const draft = {
    activities: [
      {
        category: "arrival_departure",
        date: "2026-09-02",
        description: "Train to Vienna at 10:42 from Prague main station.",
        itemType: "activity",
        startTime: "10:42",
        title: "Train to Vienna",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Prague",
        country: "Czechia",
        leaveDate: "2026-09-02",
      },
      {
        arriveDate: "2026-09-02",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2026-09-04",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const snapshot = createDraftAuditSnapshot(draft);
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-audit-transport-diagnostic",
  });
  const report = createTripExtractionAuditReport({
    draft,
    records,
    usage: {
      openai: {
        audit: {
          assembledDraft: snapshot,
          preAssemblyDraft: snapshot,
        },
        consolidation: {},
        staged: true,
      },
    },
  });
  const transportDiagnostic = report.diagnostics.find(
    (diagnostic) => diagnostic.code === "critical_transport_not_travel_row"
  );

  assert.ok(transportDiagnostic);
  assert.equal(transportDiagnostic.severity, "p0");
  assert.deepEqual(transportDiagnostic.evidence, [
    "2026-09-02 - Train to Vienna",
  ]);
  assert.equal(
    report.lineage.some(
      (row) =>
        row.title === "Train to Vienna" &&
        row.finalRecords.some((record) => record.recordType === "item")
    ),
    true
  );
});

test("extraction audit does not require scenic rides or rental pickup as travel rows", () => {
  const draft = {
    activities: [
      {
        category: "arrival_departure",
        date: "2026-09-02",
        description: "Pick up rental car at 9 AM. Confirmation 81486.",
        itemType: "activity",
        startTime: "09:00",
        title: "Pick up rental car for day trip",
      },
      {
        category: "art_culture",
        date: "2026-09-03",
        description: "Panorama Train pass and Ferris wheel are optional Vienna sights.",
        itemType: "activity",
        title: "Panorama train and Ferris wheel",
      },
      {
        category: "nature_outdoors",
        date: "2026-09-03",
        description:
          "Buda hills loop with the children's train to Janoshegy and chairlift down.",
        itemType: "activity",
        title: "Buda hills",
      },
      {
        category: "arrival_departure",
        date: "2026-09-04",
        description:
          "From the train station take the metro and tram to the hostel. Buzzer number 25.",
        itemType: "activity",
        title: "Hostel arrival directions",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2026-09-04",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const snapshot = createDraftAuditSnapshot(draft);
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-audit-scenic-rental",
  });
  const report = createTripExtractionAuditReport({
    draft,
    records,
    usage: {
      openai: {
        audit: {
          assembledDraft: snapshot,
          preAssemblyDraft: snapshot,
        },
        consolidation: {},
        staged: true,
      },
    },
  });

  assert.equal(
    report.diagnostics.some(
      (diagnostic) => diagnostic.code === "critical_transport_not_travel_row"
    ),
    false
  );
});

test("extraction audit flags planned activity candidates buried in city notes", () => {
  const rawDraft = {
    activities: [
      {
        category: "art_culture",
        date: "2019-01-19",
        description:
          "Schonbrunn Palace, including Gloriette, Orangeriegarten, Palm House, Apple Strudel Show, and Panorama Train pass.",
        itemType: "activity",
        title: "Schonbrunn Palace",
      },
      {
        category: "art_culture",
        date: "2019-01-19",
        description: "Open until 11:45 PM.",
        itemType: "activity",
        title: "Ferris wheel",
      },
      {
        category: "art_culture",
        date: "2019-01-19",
        description: "Open until 7:00 PM.",
        itemType: "activity",
        title: "Mumok Museum",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-18",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2019-01-21",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const assembledDraft = {
    ...rawDraft,
    activities: [
      {
        category: "art_culture",
        date: null,
        description:
          "Possible Sights: Schonbrunn Palace, including Gloriette, Orangeriegarten, Palm House, Apple Strudel Show, and Panorama Train pass; Ferris wheel; Mumok Museum.",
        itemType: "note",
        title: "Vienna Notes & Tips",
      },
    ],
  };
  const records = createStructuredTripRecordsFromDraft({
    draft: assembledDraft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-audit-buried-planned-activity",
  });
  const report = createTripExtractionAuditReport({
    draft: assembledDraft,
    records,
    usage: {
      openai: {
        audit: {
          assembledDraft: createDraftAuditSnapshot(assembledDraft),
          preAssemblyDraft: createDraftAuditSnapshot(rawDraft),
        },
        consolidation: {},
        staged: true,
      },
    },
  });
  const buriedDiagnostic = report.diagnostics.find(
    (diagnostic) => diagnostic.code === "planned_activity_buried_in_city_notes"
  );

  assert.ok(buriedDiagnostic);
  assert.equal(buriedDiagnostic.severity, "p1");
  assert.deepEqual(buriedDiagnostic.evidence, [
    "2019-01-19 - Schonbrunn Palace",
  ]);
});

test("extraction audit flags missing and polluted critical transport rows", () => {
  const draft = {
    activities: [],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-18",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2019-01-21",
      },
      {
        arriveDate: "2019-01-21",
        city: "Budapest",
        country: "Hungary",
        leaveDate: "2019-01-24",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [
      {
        arrival: "Vienna",
        arrivalTime: null,
        confirmation: "1beb5005",
        date: "2019-01-18",
        departure: "Prague",
        departureTime: null,
        description: "Train to Vienna.",
        provider: null,
        title: "Train to Vienna",
        type: "train",
      },
      {
        arrival: "Budapest",
        arrivalTime: null,
        confirmation: "VXFHXKCQEPHPUSNT",
        date: "2019-01-21",
        departure: "Wien HBF",
        departureTime: "10:42",
        description:
          "Train to Budapest. Check in to Vitae Hostel. From Keleti International train station take the metro and tram to Kiraly Utca. Buzzer number 25.",
        provider: null,
        title: "Train to Budapest",
        type: "train",
      },
    ],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const snapshot = createDraftAuditSnapshot(draft);
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-audit-critical-transport-details",
  });
  const pollutedTransport = records.transport.find(
    (item) => item.routeLabel === "Train to Budapest"
  );

  if (pollutedTransport) {
    pollutedTransport.description =
      "Train to Budapest. Check in to Vitae Hostel. From Keleti International train station take the metro and tram to Kiraly Utca. Buzzer number 25.";
  }

  const report = createTripExtractionAuditReport({
    draft,
    records,
    usage: {
      openai: {
        audit: {
          assembledDraft: snapshot,
          preAssemblyDraft: snapshot,
        },
        consolidation: {},
        staged: true,
      },
    },
  });
  const missingDiagnostic = report.diagnostics.find(
    (diagnostic) => diagnostic.code === "critical_transport_missing_details"
  );
  const pollutedDiagnostic = report.diagnostics.find(
    (diagnostic) => diagnostic.code === "transport_description_contaminated"
  );

  assert.ok(missingDiagnostic);
  assert.equal(missingDiagnostic.severity, "p0");
  assert.deepEqual(missingDiagnostic.evidence, [
    "2019-01-18 - Train to Vienna: missing departure time",
  ]);
  assert.ok(pollutedDiagnostic);
  assert.deepEqual(pollutedDiagnostic.evidence, [
    "2019-01-21 - Train to Budapest",
  ]);
});

test("extraction audit flags visible day overview cards", () => {
  const draft = {
    activities: [
      {
        category: "art_culture",
        date: "2019-01-20",
        description:
          "Breakfast at Cafe Central; Jewish Museum; St. Stephen's Cathedral; Library; Bank Austria Kunstforum; Laundry.",
        itemType: "activity",
        title: "Vienna day plan",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-18",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2019-01-21",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const snapshot = createDraftAuditSnapshot(draft);
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-audit-day-plan",
  });
  const report = createTripExtractionAuditReport({
    draft,
    records,
    usage: {
      openai: {
        audit: {
          assembledDraft: snapshot,
          preAssemblyDraft: snapshot,
        },
        consolidation: {},
        staged: true,
      },
    },
  });
  const dayOverviewDiagnostic = report.diagnostics.find(
    (diagnostic) => diagnostic.code === "day_overview_activity_survived"
  );

  assert.ok(dayOverviewDiagnostic);
  assert.deepEqual(dayOverviewDiagnostic.evidence, [
    "2019-01-20 - Vienna day plan",
  ]);
});

test("extraction audit flags wrong-city items moved into city notes", () => {
  const draft = {
    activities: [],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-22",
        city: "Budapest",
        country: "Hungary",
        leaveDate: "2019-01-24",
      },
      {
        arriveDate: "2019-01-24",
        city: "Rome",
        country: "Italy",
        leaveDate: "2019-01-25",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const snapshot = createDraftAuditSnapshot(draft);
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-audit-wrong-city-note",
  });
  const report = createTripExtractionAuditReport({
    draft,
    records,
    usage: {
      openai: {
        audit: {
          assembledDraft: snapshot,
          preAssemblyDraft: snapshot,
        },
        consolidation: {
          wrongCityPlacements: [
            {
              action: "moved_to_city_notes",
              assignedCity: "Rome",
              date: "2019-01-22",
              explicitCity: "Budapest",
              title: "Shoes on the Danube",
            },
          ],
        },
        staged: true,
      },
    },
  });
  const wrongCityDiagnostic = report.diagnostics.find(
    (diagnostic) => diagnostic.code === "wrong_city_note_contamination"
  );

  assert.ok(wrongCityDiagnostic);
  assert.equal(wrongCityDiagnostic.severity, "p0");
  assert.deepEqual(wrongCityDiagnostic.evidence, [
    "2019-01-22 - Shoes on the Danube - Rome -> Budapest",
  ]);
});

test("draft consolidation suppresses day overview cards before summary surfaces", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Generic overview for the day.",
          itemType: "activity",
          title: "Vienna Day 3",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Timed palace visit.",
          itemType: "activity",
          startTime: "10:00",
          title: "Belvedere Palace",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          leaveDate: "2019-01-21",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-day-overview-suppression",
  });
  const titles = records.items.map((item) => item.title);

  assert.equal(titles.includes("Vienna Day 3"), false);
  assert.equal(titles.includes("Belvedere Palace"), true);
});

test("wrong-city loose mentions move to the explicitly named city note", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Prague Jewish Quarter as a thing to check out.",
          itemType: "activity",
          title: "Prague Jewish Quarter",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          leaveDate: "2019-01-18",
        },
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          leaveDate: "2019-01-21",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-wrong-city-loose",
  });
  const note = records.items.find((item) => item.title === "Prague Notes & Tips");

  assert.ok(note);
  assert.equal(note?.itemType, "note");
  assert.equal(note?.date, null);
  assert.match(note?.description ?? "", /Prague Jewish Quarter/i);
  assert.equal(getStructuredReviewCount(records), 0);
});

test("wrong-city notes honor explicit source city instead of the dated city", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          city: "Budapest",
          date: "2019-01-24",
          description:
            "Loose local tip from the Budapest source section.",
          itemType: "activity",
          title: "Budapest local note",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-21",
          city: "Budapest",
          leaveDate: "2019-01-24",
        },
        {
          arriveDate: "2019-01-24",
          city: "Rome",
          leaveDate: "2019-01-25",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-wrong-city-explicit-city-note",
  });
  const budapestNote = records.items.find(
    (item) => item.title === "Budapest Notes & Tips"
  );
  const romeNote = records.items.find(
    (item) => item.title === "Rome Notes & Tips"
  );

  assert.ok(budapestNote);
  assert.match(budapestNote?.description ?? "", /Budapest source section/i);
  assert.equal(Boolean(romeNote?.description?.includes("Budapest")), false);
  assert.equal(getStructuredReviewCount(records), 0);
});

test("wrong-city anchored activities become placement questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-19",
          description: "Prague tour ticket with provider confirmation.",
          itemType: "activity",
          startTime: "09:00",
          title: "Prague Castle timed tour",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          leaveDate: "2019-01-18",
        },
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          leaveDate: "2019-01-21",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-wrong-city-anchored",
  });
  const item = records.items.find((item) => item.title === "Prague Castle timed tour");
  const question = records.reviewQuestions.find((question) =>
    /Where should Prague Castle timed tour belong/i.test(question.prompt)
  );

  assert.ok(item);
  assert.equal(item?.date, null);
  assert.equal(item?.status, "needs_review");
  assert.ok(question);
  assert.equal(question?.status, "open");
  assert.equal(getStructuredReviewCount(records), 2);
});

test("city note merging removes places that already became scheduled activities", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "food_dining",
          date: "2026-09-02",
          description: "Mazel Tov, Konyv Bar, and Ruszwurm are food ideas.",
          itemType: "activity",
          title: "Budapest food ideas",
        },
        {
          category: "food_dining",
          date: "2026-09-03",
          description: "Dinner reservation.",
          itemType: "activity",
          startTime: "18:30",
          title: "Dinner at Mazel Tov",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Budapest",
          leaveDate: "2026-09-04",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Budapest",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-city-note-dedupe",
  });
  const note = records.items.find((item) => item.title === "Budapest Notes & Tips");

  assert.equal(note?.itemType, "note");
  assert.doesNotMatch(note?.description ?? "", /Mazel Tov/i);
  assert.match(note?.description ?? "", /Konyv Bar/i);
  assert.match(note?.description ?? "", /Ruszwurm/i);
  assert.equal(
    records.items.some((item) => item.title === "Dinner at Mazel Tov"),
    true
  );
});

test("city note merging preserves separate city notes with generic notes and tips titles", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "admin_logistics",
          date: null,
          description: "Prague cafes: Cafe Savoy; beer halls: U Fleku.",
          itemType: "note",
          title: "Prague Notes & Tips",
        },
        {
          category: "admin_logistics",
          date: null,
          description: "Vienna cafes: Cafe Central; museums: Albertina.",
          itemType: "note",
          title: "Vienna Notes & Tips",
        },
        {
          category: "admin_logistics",
          date: null,
          description: "Budapest food: Mazel Tov; shopping: Nanushka.",
          itemType: "note",
          title: "Budapest Notes & Tips",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          leaveDate: "2019-01-18",
        },
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          leaveDate: "2019-01-21",
        },
        {
          arriveDate: "2019-01-21",
          city: "Budapest",
          leaveDate: "2019-01-24",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-city-notes-separate",
  });
  const noteTitles = records.items
    .filter((item) => item.itemType === "note")
    .map((item) => item.title)
    .sort();

  assert.deepEqual(noteTitles, [
    "Budapest Notes & Tips",
    "Prague Notes & Tips",
    "Vienna Notes & Tips",
  ]);
  assert.equal(
    records.reviewQuestions.some((question) => /removed Vienna Notes/i.test(question.prompt)),
    false
  );
});

test("city note merging creates one note per city with multiple loose note sources", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "admin_logistics",
          date: null,
          description: "Metro line tips and ticket machines.",
          itemType: "note",
          title: "Budapest transport and shopping notes",
        },
        {
          category: "food_dining",
          date: null,
          description: "Food: Mazel Tov; Drinks: Szimpla Kert.",
          itemType: "note",
          title: "Budapest Notes & Tips",
        },
        {
          category: "art_culture",
          date: "2019-01-22",
          description: "Reserved visit.",
          itemType: "activity",
          startTime: "10:00",
          title: "Dohany Street Synagogue",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-21",
          city: "Budapest",
          leaveDate: "2019-01-24",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-one-city-note",
  });
  const cityNotes = records.items.filter((item) => item.itemType === "note");

  assert.equal(cityNotes.length, 1);
  assert.equal(cityNotes[0]?.title, "Budapest Notes & Tips");
  assert.match(cityNotes[0]?.description ?? "", /Metro line tips/i);
  assert.match(cityNotes[0]?.description ?? "", /Mazel Tov/i);
  assert.match(cityNotes[0]?.description ?? "", /Szimpla Kert/i);
  assert.equal(getStructuredReviewCount(records), 0);
});

test("draft consolidation does not reassemble an already assembled city-note draft", () => {
  const first = consolidateTripDraft({
    activities: [
      {
        category: "admin_logistics",
        date: null,
        description: "Metro line tips and ticket machines.",
        itemType: "note",
        title: "Budapest transport and shopping notes",
      },
      {
        category: "food_dining",
        date: null,
        description: "Food: Mazel Tov; Drinks: Szimpla Kert.",
        itemType: "note",
        title: "Budapest Notes & Tips",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-21",
        city: "Budapest",
        leaveDate: "2019-01-24",
      },
    ],
    stays: [],
    transport: [],
  });
  const second = consolidateTripDraft(first.draft);

  assert.strictEqual(second.draft, first.draft);
  assert.deepEqual(second.debug, first.debug);
});

test("summary can move an activity into city tips", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "food_dining",
          date: "2026-09-02",
          description: "Breakfast at Cafe Central.",
          itemType: "activity",
          startTime: "09:00",
          title: "Cafe Central breakfast",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2026-09-04",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Vienna",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-move-to-city-tip",
  });
  const source = records.items.find((item) => item.title === "Cafe Central breakfast");
  assert.ok(source);

  const updated = applyReviewDecision(records, {
    action: "move_to_city_tip",
    createdAt: "2026-06-18T12:00:00.000Z",
    id: "decision-move-city-tip",
    subjectId: source.id,
    subjectType: "item",
    targetLegId: records.legs[0]?.id,
    tripId: "trip-move-to-city-tip",
  });
  const moved = updated.items.find((item) => item.id === source.id);
  const summary = createGeneratedTripSummaryView(updated);
  const viewModel = createTravelerAppViewModel(updated);

  assert.equal(moved?.itemType, "note");
  assert.equal(moved?.date, null);
  assert.equal(moved?.legId, records.legs[0]?.id);
  assert.equal(moved?.title, "Vienna Notes & Tips");
  assert.match(moved?.description ?? "", /Cafe Central/i);
  assert.equal(summary.counts.activities, 0);
  assert.equal(
    summary.days.some((day) =>
      day.entries.some((entry) => /Cafe Central/i.test(entry.title))
    ),
    false
  );
  assert.equal(viewModel.legs[0]?.tips[0]?.title, "Vienna Notes & Tips");
});

test("Asia seed compiles into structured records and traveler view model", () => {
  const records = getAsiaDemoStructuredTripRecords();
  const viewModel = getAsiaDemoTravelerAppViewModel();

  assert.equal(records.trip.id, "demo-trip");
  assert.ok(records.legs.length > 20, "expected Wren route spine");
  assert.ok(records.items.length > 300, "expected activity/card records");
  assert.ok(records.days.length > 80, "expected generated day records");
  assert.ok(records.stays.length > 20, "expected linked stays");
  assert.ok(
    records.privateDetails.some(
      (detail) =>
        detail.detailType === "private_address" &&
        detail.visibility === "traveler_password"
    ),
    "expected exact stay addresses to be protected"
  );

  assert.equal(viewModel.trip.id, records.trip.id);
  assert.equal(
    records.trip.destinationSummary,
    "Seattle · Maui (Kihei) · Hana · Honolulu · Sapporo (CTS)"
  );
  assert.equal(viewModel.trip.dateRange, "June 27 - November 8, 2026");
  assert.equal(viewModel.trip.destinationSummary, records.trip.destinationSummary);
  assert.equal(viewModel.cards.length, records.items.length);
  assert.equal(viewModel.days[0]?.cards[0]?.title, "Fly to Seattle");
  assert.equal(viewModel.days[0]?.legName, "Seattle");
  assert.ok(
    viewModel.categories.some((category) => category.id === "arrival_departure"),
    "expected category cards from seed categories"
  );
  assert.equal(
    viewModel.privacy.privateDetailCount,
    records.privateDetails.length
  );
});

test("starter materials can be edited before checkout until processing starts", () => {
  assert.equal(
    canEditTripMaterials({
      isDemo: false,
      paymentStatus: "unpaid",
      processingStatus: "draft",
    }),
    true
  );
  assert.equal(
    canEditTripMaterials({
      isDemo: false,
      paymentStatus: "paid",
      processingStatus: "parsed",
    }),
    false
  );
  assert.equal(
    canEditTripMaterials({
      isDemo: true,
      paymentStatus: "demo",
      processingStatus: "demo",
    }),
    false
  );
});

test("unpaid starter material cleanup uses the beta retention window", () => {
  assert.equal(UNPAID_STARTER_MATERIAL_RETENTION_DAYS, 14);
  assert.equal(
    getUnpaidStarterMaterialCleanupCutoff({
      now: new Date("2026-06-19T12:00:00.000Z"),
    }),
    "2026-06-05T12:00:00.000Z"
  );
});

test("draft parser output compiles into structured records", () => {
  const draft = {
    activities: [
      {
        address: "Old Town Square",
        date: "2026-09-02",
        description: "Walk the old town and find dinner.",
        endTime: null,
        sourceFilename: "central-europe.pdf",
        startTime: "17:00",
        title: "Old Town walk",
      },
      {
        address: null,
        category: "food_dining",
        date: null,
        description: "A flexible cafe stop.",
        endTime: null,
        itemType: "activity",
        sourceFilename: "central-europe.pdf",
        startTime: null,
        title: "Cafe TBD",
      },
    ],
    missingDetails: [
      {
        prompt: "Which day is Cafe TBD?",
        reason: "The traveler app needs a date to place the card.",
        relatedTitle: "Cafe TBD",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Prague",
        country: "Czechia",
        leaveDate: "2026-09-04",
      },
      {
        arriveDate: "2026-09-04",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2026-09-06",
      },
    ],
    sensitiveDetails: [
      {
        detailType: "door_code",
        reason: "Door codes should stay behind traveler mode.",
        title: "Apartment access code",
      },
    ],
    stays: [
      {
        address: "Private apartment address",
        checkIn: "2026-09-01",
        checkOut: "2026-09-04",
        name: "Prague apartment",
        sourceFilename: "central-europe.pdf",
      },
    ],
    transport: [
      {
        arrival: "Prague",
        confirmation: "ABC123",
        date: "2026-09-01",
        departure: "New York",
        departureTime: "18:30",
        provider: "Example Air",
        sourceFilename: "central-europe.pdf",
        title: "Fly to Prague",
        type: "flight",
      },
    ],
    tripOverview: {
      confidence: "medium",
      dateRange: "Sep 1-6, 2026",
      destinationSummary: "Prague and Vienna",
      title: "Central Europe",
    },
  };

  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-1",
  });
  const viewModel = createTravelerAppViewModel(records);
  const summary = createGeneratedTripSummaryView(records);

  assert.equal(records.trip.travelerAppTitle, "Central Europe");
  assert.equal(records.legs.length, 2);
  assert.equal(records.stays[0]?.legId, records.legs[0]?.id);
  assert.equal(records.transport[0]?.transportType, "flight");
  assert.equal(records.transport[0]?.confirmationVisibility, "traveler_password");
  assert.equal(records.items.length, 2);
  assert.equal(records.items[1]?.itemType, "activity");
  assert.equal(records.items[1]?.categoryId, "food_dining");
  assert.ok(
    summary.days.some((day) =>
      day.entries.some(
        (entry) =>
          entry.kind === "stay" &&
          entry.title === "Staying: Prague apartment"
      )
    )
  );
  assert.ok(
    records.categories.some((category) => category.categoryKey === "food_dining"),
    "expected dining activities to use the food and dining category"
  );
  assert.equal(records.items[1]?.reviewRequired, true);
  assert.equal(records.reviewQuestions.length, 1);
  assert.ok(
    records.privateDetails.some(
      (detail) =>
        detail.detailType === "confirmation_number" &&
        detail.visibility === "traveler_password"
    ),
    "expected confirmation numbers to become private details"
  );
  assert.ok(
    records.privateDetails.some((detail) => detail.detailType === "door_code"),
    "expected parser-sensitive details to become private details"
  );
  assert.ok(records.days.length >= 2, "expected days from records");
  assert.equal(viewModel.trip.title, "Central Europe");
  assert.equal(viewModel.cards.length, 2);
});

test("trip dates start with first actual travel day before first lodging leg", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-13",
          city: "Rome",
          country: "Italy",
          leaveDate: "2019-01-14",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: "Via Palestro 44",
          checkIn: "2019-01-13",
          checkInTime: "14:30",
          checkOut: "2019-01-14",
          checkOutTime: null,
          firstNightDate: "2019-01-13",
          name: "The Yellow",
          nights: 1,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [
        {
          arrival: "JFK",
          arrivalTime: "18:41",
          confirmation: "GHFHPG",
          date: "2019-01-12",
          departure: "DCA",
          departureTime: "17:00",
          description: null,
          provider: "Delta",
          sourceFilename: "central-europe.pdf",
          title: "Flight to JFK",
          type: "flight",
        },
      ],
      tripOverview: {
        confidence: "high",
        dateRange: "January 12-14, 2019",
        destinationSummary: "Rome",
        title: "test",
      },
    },
    fallbackTripName: "test",
    tripId: "date-range-regression",
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.equal(records.trip.startDate, "2019-01-12");
  assert.equal(summary.dateRange, "January 12-14, 2019");
});

test("unrecovered activity chunk gaps remain open review blockers", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "low",
          evidence: "Thursday, January 17th",
          guessedValue: null,
          prompt:
            "Roamwoven could not confidently extract activities from Thursday, January 17th. Review this source section and add any missing activities before publishing.",
          reason:
            "Automatic extraction and a second pass returned no traveler cards even though this source section appears to contain activity or notes/tips details.",
          relatedTitle: null,
          subjectType: "trip",
          targetField: null,
        },
      ],
      places: [
        {
          arriveDate: "2019-01-17",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-18",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        confidence: "medium",
        dateRange: "January 17-18, 2019",
        destinationSummary: "Prague",
        title: "test",
      },
    },
    fallbackTripName: "test",
    tripId: "chunk-blocker",
  });

  assert.equal(getStructuredReviewCount(records), 1);
  assert.equal(records.reviewQuestions[0]?.status, "open");
  assert.match(records.reviewQuestions[0]?.prompt ?? "", /could not confidently extract/i);
});

test("city notes and tips attach to legs without becoming activity cards", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "food_dining",
          date: "2026-09-02",
          description:
            "Prague food ideas: cafes, casual restaurants, and beer halls to consider.",
          itemType: "activity",
          title: "Prague food ideas",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-city-tips",
  });
  const viewModel = createTravelerAppViewModel(records);
  const summary = createGeneratedTripSummaryView(records);
  const sections = getStructuredReviewSections(records);
  const tip = records.items.find((item) => item.title === "Prague Notes & Tips");

  assert.equal(tip?.itemType, "note");
  assert.equal(tip?.date, null);
  assert.equal(tip?.legId, records.legs[0]?.id);
  assert.equal(tip?.reviewRequired, false);
  assert.equal(viewModel.cards.some((card) => card.title === "Prague Notes & Tips"), false);
  assert.equal(viewModel.legs[0]?.tips[0]?.title, "Prague Notes & Tips");
  assert.equal(sections.find((section) => section.id === "activities")?.count, 0);
  assert.equal(sections.find((section) => section.id === "city-tips")?.count, 1);
  assert.match(
    sections.find((section) => section.id === "city-tips")?.summaryItems[0] ?? "",
    /Prague · Prague Notes & Tips/
  );
  assert.match(tip?.description ?? "", /cafes/i);
  assert.match(tip?.description ?? "", /beer halls/i);
  assert.equal(summary.counts.activities, 0);
  assert.equal(
    summary.days.some((day) =>
      day.entries.some((entry) => entry.title === "Prague Notes & Tips")
    ),
    false
  );
});

test("food reservations stay activities while loose food lists become tips", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "food_dining",
          date: "2026-09-02",
          description: "Reserved dinner table at 7 PM.",
          itemType: "activity",
          startTime: "19:00",
          title: "Dinner at Bellevue",
        },
        {
          category: "food_dining",
          date: "2026-09-02",
          description:
            "Some good beer halls are U Fleku, Lokal, and Strahov Monastery Brewery.",
          itemType: "activity",
          title: "Prague beer hall ideas",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-food-tips",
  });
  const viewModel = createTravelerAppViewModel(records);
  const sections = getStructuredReviewSections(records);

  assert.equal(
    records.items.find((item) => item.title === "Dinner at Bellevue")?.itemType,
    "activity"
  );
  assert.equal(
    records.items.find((item) => item.title === "Dinner at Bellevue")?.date,
    "2026-09-02"
  );
  assert.equal(
    records.items.find((item) => item.title === "Prague Notes & Tips")
      ?.itemType,
    "note"
  );
  assert.equal(sections.find((section) => section.id === "activities")?.count, 1);
  assert.equal(sections.find((section) => section.id === "city-tips")?.count, 1);
  assert.equal(viewModel.cards.map((card) => card.title).includes("Dinner at Bellevue"), true);
  assert.equal(
    viewModel.cards.map((card) => card.title).includes("Prague Notes & Tips"),
    false
  );
  assert.equal(viewModel.legs[0]?.tips[0]?.title, "Prague Notes & Tips");
});

test("loose day-specific sightseeing ideas become city notes and tips", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2026-09-02",
          description:
            "Great Synagogue, Jewish history, Gellert Baths, Pinball Museum, Konyv Bar, Tokaji, Mazel Tov restaurant, and the Hilton wine cellar are listed for the first Budapest day.",
          itemType: "activity",
          title: "Budapest first-day ideas",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Budapest",
          country: "Hungary",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-day-specific-ideas",
  });
  const sections = getStructuredReviewSections(records);
  const item = records.items[0];

  assert.equal(item?.title, "Budapest Notes & Tips");
  assert.equal(item?.itemType, "note");
  assert.equal(item?.date, null);
  assert.equal(sections.find((section) => section.id === "city-tips")?.count, 1);
  assert.equal(sections.find((section) => section.id === "activities")?.count, 0);
});

test("eat and food list headers can become city notes and tips", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "food_dining",
          date: "2026-09-02",
          description:
            "Eat: Country Life, trdelnik, Mistral Cafe, Malostranska Beseda, Cafe Louvre. Food: garlic soup or onion soup.",
          itemType: "activity",
          title: "Prague food notes",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-eat-food-tip",
  });
  const sections = getStructuredReviewSections(records);
  const item = records.items[0];

  assert.equal(item?.itemType, "note");
  assert.equal(item?.date, null);
  assert.equal(sections.find((section) => section.id === "city-tips")?.count, 1);
});

test("loose food ideas without a clear leg do not become city notes or tips", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "food_dining",
          date: null,
          description: "Food ideas: check out foods like dumplings and noodles.",
          itemType: "activity",
          title: "Food ideas",
        },
      ],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "City notes test",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-city-tip-review",
  });
  const sections = getStructuredReviewSections(records);
  const activities = sections.find((section) => section.id === "activities");

  assert.equal(records.items[0]?.itemType, "activity");
  assert.equal(records.items[0]?.status, "needs_review");
  assert.equal(getStructuredReviewCount(records), 1);
  assert.equal(sections.find((section) => section.id === "city-tips")?.count, 0);
  assert.equal(activities?.count, 1);
  assert.equal(activities?.items[0]?.title, "Food ideas");
  assert.deepEqual(
    activities?.items[0]?.editFields.map((field) => field.name),
    [
      "title",
      "itemType",
      "date",
      "startTime",
      "endTime",
      "locationName",
      "address",
      "url",
      "description",
    ]
  );
});

test("full-day overview cards are suppressed while specific activities remain", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2026-09-02",
          description:
            "Morning coffee, silver mines, lunch in town, and an evening train.",
          itemType: "activity",
          title: "Day 6 overview",
        },
        {
          category: "art_culture",
          date: "2026-09-02",
          description: "Tour the historic silver mines.",
          itemType: "activity",
          title: "Silver Mines",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Kutna Hora",
          country: "Czechia",
          leaveDate: "2026-09-03",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-overview-card",
  });
  const viewModel = createTravelerAppViewModel(records);
  const summary = createGeneratedTripSummaryView(records);

  assert.equal(
    records.items.some((item) => item.title === "Day 6 overview"),
    false
  );
  assert.equal(viewModel.cards.length, 1);
  assert.equal(viewModel.cards[0]?.title, "Silver Mines");
  assert.equal(summary.counts.activities, 1);
});

test("sightseeing route cards with named stops are not silently ignored", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2026-09-02",
          description:
            "Buda morning sightseeing with Fisherman's Bastion, Matthias Church, Castle Hill, and Shoes on the Danube listed as stops.",
          itemType: "activity",
          title: "Budapest morning sightseeing day",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Budapest",
          country: "Hungary",
          leaveDate: "2026-09-03",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-sightseeing-route-card",
  });
  const viewModel = createTravelerAppViewModel(records);

  assert.equal(records.items[0]?.status, "draft");
  assert.equal(viewModel.cards.length, 1);
  assert.equal(viewModel.cards[0]?.title, "Budapest morning sightseeing day");
  assert.match(viewModel.cards[0]?.description ?? "", /Fisherman's Bastion/);
});

test("lodging arrival cards prevent duplicate synthetic check-ins", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "arrival_departure",
          date: "2026-09-02",
          description: "Arrive in Rome and drop bags at the hostel.",
          itemType: "admin",
          title: "Arrive in Rome and drop bags",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-02",
          city: "Rome",
          country: "Italy",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2026-09-02",
          checkOut: "2026-09-04",
          name: "The Yellow Hostel",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Rome",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-drop-bags",
  });

  assert.equal(
    records.items.some((item) => item.title === "Check in: The Yellow Hostel"),
    false
  );
  assert.equal(records.items.length, 0);
});

test("checkout stays in stay details instead of day summary entries", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Paris",
          country: "France",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2026-09-01",
          checkInTime: "15:00",
          checkOut: "2026-09-04",
          checkOutTime: "10:00",
          name: "Left Bank Hotel",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Paris",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-checkout-summary",
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.equal(
    summary.days.some((day) =>
      day.entries.some((entry) => entry.title.startsWith("Check out:"))
    ),
    false
  );
  assert.equal(records.stays[0]?.checkOutTime, "10:00");
});

test("transport times and readable description text are preserved", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2026-09-03",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Vienna Hbf",
          arrivalTime: "12:10",
          date: "2026-09-01",
          departure: "Prague hl.n.",
          departureTime: "08:44",
          description: "Train on 20260901 with seat details in the booking.",
          provider: "Railjet",
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-transport-times",
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.equal(records.transport[0]?.departureTime, "08:44");
  assert.equal(records.transport[0]?.arrivalTime, "12:10");
  assert.equal(
    records.transport[0]?.description,
    "Train on September 1st, 2026 with seat details in the booking."
  );
  assert.match(summary.days[0]?.entries[0]?.detail ?? "", /8:44 AM - 12:10 PM/);
});

test("summary flags critical trains when source-backed details are missing", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Vienna",
          confirmation: "1beb5005",
          date: "2019-01-18",
          departure: "Prague",
          description:
            "Train to Vienna departs 09:20 from Praha hl.n. Train code: 1beb5005.",
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-critical-transport-warning",
  });
  const transport = records.transport[0];
  assert.ok(transport);
  transport.departureTime = null;
  transport.departureLocation = null;
  const summary = createGeneratedTripSummaryView(records);

  assert.ok(
    summary.warnings.some((warning) =>
      /Train to Vienna is missing critical travel details/.test(warning.title)
    )
  );
  assert.equal(summary.isReadyForPublishReview, false);
});

test("missing critical transport departure time becomes review even when source lacks it", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Vienna",
          confirmation: "1beb5005",
          date: "2019-01-18",
          departure: "Prague",
          description: "Train to Vienna. Train code: 1beb5005.",
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-critical-transport-source-incomplete",
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.equal(
    summary.warnings.some((warning) =>
      /Train to Vienna is missing critical travel details/.test(warning.title)
    ),
    false
  );
  assert.equal(summary.isReadyForPublishReview, false);
  assert.ok(
    records.reviewQuestions.some(
      (question) =>
        question.status === "open" &&
        /what time does train to vienna depart/i.test(question.prompt)
    )
  );
});

test("summary does not hard-warn when only train arrival time is missing", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Vienna Hbf",
          date: "2019-01-18",
          departure: "Praha hl.n.",
          departureTime: "09:20",
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-missing-arrival-time-ok",
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.equal(
    summary.warnings.some((warning) => /Train to Vienna/.test(warning.title)),
    false
  );
  assert.equal(summary.isReadyForPublishReview, true);
});

test("summary orders timed transport before invisible day-part activity sorting", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "nightlife_entertainment",
          date: "2019-01-15",
          description: "Planned nightcap after dinner.",
          itemType: "activity",
          title: "Hemingway Bar",
        },
        {
          category: "art_culture",
          date: "2019-01-15",
          itemType: "activity",
          title: "Old Town sightseeing",
        },
        {
          category: "food_dining",
          date: "2019-01-15",
          itemType: "activity",
          title: "Cafe breakfast",
        },
        {
          category: "food_dining",
          date: "2019-01-15",
          itemType: "activity",
          startTime: "18:00",
          title: "Bellevue dinner",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          leaveDate: "2019-01-18",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          date: "2019-01-15",
          departure: "Hotel",
          departureTime: "08:00",
          title: "Morning transfer",
          type: "transfer",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-summary-sorting",
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.deepEqual(
    summary.days[0]?.entries.map((entry) => entry.title),
    [
      "Morning transfer",
      "Cafe breakfast",
      "Old Town sightseeing",
      "Bellevue dinner",
      "Hemingway Bar",
    ]
  );
});

test("summary flags days with seven or more visible activities", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: Array.from({ length: 7 }, (_value, index) => ({
        category: "art_culture",
        date: "2026-09-02",
        description: `Planned museum visit ${index + 1}.`,
        itemType: "activity",
        title: `Museum stop ${index + 1}`,
      })),
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Vienna",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-bloat-warning",
  });
  const summary = createGeneratedTripSummaryView(records);
  const warning = summary.warnings.find((warning) =>
    /has a lot of visible cards/.test(warning.title)
  );
  assert.ok(warning);
  assert.equal(warning.severity, "quiet");
  assert.equal(summary.isReadyForPublishReview, true);
  const resolved = applyReviewDecision(records, {
    action: "confirm",
    createdAt: "2026-06-18T12:00:00.000Z",
    id: "decision-confirm-bloat-warning",
    subjectId: warning.subjectId,
    subjectType: warning.subjectType,
    tripId: "trip-bloat-warning",
  });
  const resolvedSummary = createGeneratedTripSummaryView(resolved);

  assert.equal(resolvedSummary.warnings.length, 0);
});

test("summary hard-blocks surviving stay and transport duplicate collisions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "arrival_departure",
          date: "2026-09-02",
          description:
            "Arrive and drop bags at Central Station Hotel before check-in.",
          itemType: "activity",
          title: "Drop bags at Central Station Hotel",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-02",
          city: "Paris",
          country: "France",
          leaveDate: "2026-09-03",
        },
        {
          arriveDate: "2026-09-03",
          city: "Lyon",
          country: "France",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2026-09-02",
          checkOut: "2026-09-03",
          name: "Central Station Hotel",
        },
      ],
      transport: [
        {
          arrival: "Lyon Part-Dieu",
          arrivalTime: "12:00",
          date: "2026-09-03",
          departure: "Paris Gare de Lyon",
          departureTime: "10:00",
          title: "Train to Lyon",
          type: "train",
        },
      ],
      tripOverview: {
        title: "France",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-summary-health-collisions",
  });
  records.items.push({
    address: null,
    categoryId: "arrival_departure",
    date: "2026-09-02",
    description: "Arrive and drop bags at Central Station Hotel before check-in.",
    endTime: null,
    id: "manual-stay-duplicate",
    itemType: "activity",
    latitude: null,
    legId: records.legs[0]?.id ?? null,
    locationName: null,
    longitude: null,
    parentItemId: null,
    reviewRequired: false,
    sortOrder: 98,
    sourceConfidence: "high",
    startTime: null,
    status: "draft",
    summary: null,
    title: "Drop bags at Central Station Hotel",
    tripId: records.trip.id,
    url: null,
  });
  records.items.push({
    address: null,
    categoryId: "arrival_departure",
    date: "2026-09-03",
    description: "Take train from Paris to Lyon.",
    endTime: null,
    id: "manual-transport-duplicate",
    itemType: "activity",
    latitude: null,
    legId: records.legs[1]?.id ?? null,
    locationName: null,
    longitude: null,
    parentItemId: null,
    reviewRequired: false,
    sortOrder: 99,
    sourceConfidence: "high",
    startTime: "10:00",
    status: "draft",
    summary: null,
    title: "Train to Lyon",
    tripId: records.trip.id,
    url: null,
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.ok(
    summary.warnings.some(
      (warning) =>
        warning.severity === "hard" &&
        /Drop bags at Central Station Hotel duplicates a stay row/.test(
          warning.title
        )
    )
  );
  assert.ok(
    summary.warnings.some(
      (warning) =>
        warning.severity === "hard" &&
        /Train to Lyon duplicates a travel row/.test(warning.title)
    )
  );
  assert.equal(summary.isReadyForPublishReview, false);

  const resolved = summary.warnings
    .filter((warning) => warning.severity === "hard")
    .reduce(
      (currentRecords, warning, index) =>
        applyReviewDecision(currentRecords, {
          action: "confirm",
          createdAt: `2026-06-18T12:00:0${index}.000Z`,
          id: `decision-confirm-${warning.id}`,
          subjectId: warning.subjectId,
          subjectType: warning.subjectType,
          tripId: records.trip.id,
        }),
      records
    );
  const resolvedSummary = createGeneratedTripSummaryView(resolved);

  assert.equal(
    resolvedSummary.warnings.some((warning) => warning.severity === "hard"),
    false
  );
  assert.equal(resolvedSummary.isReadyForPublishReview, true);
});

test("summary does not hard-block separate luggage storage before hotel check-in", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "arrival_departure",
          date: "2026-09-02",
          description:
            "Store bags at Central Station luggage storage before going to the hotel.",
          itemType: "activity",
          title: "Store bags at Central Station luggage storage",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-02",
          city: "Paris",
          country: "France",
          leaveDate: "2026-09-03",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2026-09-02",
          checkOut: "2026-09-03",
          name: "Central Station Hotel",
        },
      ],
      transport: [],
      tripOverview: {
        title: "France",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-summary-health-luggage-storage",
  });
  const summary = createGeneratedTripSummaryView(records);

  assert.ok(
    !summary.warnings.some((warning) =>
      /Store bags at Central Station luggage storage duplicates a stay row/.test(
        warning.title
      )
    )
  );
  assert.equal(summary.isReadyForPublishReview, true);
});

test("category taxonomy canonicalizes old aliases and avoids generic buckets", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "wellness_&_relaxation",
          date: "2026-09-02",
          itemType: "activity",
          title: "Sauna reservation",
        },
        {
          category: "transport",
          date: "2026-09-03",
          description: "Pick up bags at the station after arrival.",
          itemType: "admin",
          title: "Station arrival and bag pickup",
        },
        {
          category: "activity",
          date: "2026-09-04",
          description: "Visit a wildlife sanctuary.",
          itemType: "activity",
          title: "Wildlife sanctuary",
        },
      ],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Taxonomy test",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-category-taxonomy",
  });

  assert.deepEqual(
    records.items.map((item) => item.categoryId),
    ["wellness_relaxation", "arrival_departure", "animal_experience"]
  );
  assert.equal(
    records.categories.some((category) =>
      ["activity", "note", "transport"].includes(category.categoryKey)
    ),
    false
  );
});

test("walking-route anchors keep untimed stops on one traveler card", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-14",
          description:
            "Self-guided walking route with Charles Bridge, Astronomical Clock, Lucerna Arcade, and Dancing House as stroll-by stops.",
          itemType: "activity",
          title: "Prague self-guided walking tour",
        },
        {
          category: "tours_tickets",
          date: "2019-01-14",
          description: "Timed/ticketed tour listed separately from the walking route.",
          itemType: "activity",
          startTime: "15:00",
          title: "Catacombs tour",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-15",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-walking-anchor",
  });

  assert.equal(records.items.length, 2);
  assert.equal(records.items[0]?.title, "Prague self-guided walking tour");
  assert.match(records.items[0]?.description ?? "", /Charles Bridge/);
  assert.match(records.items[0]?.description ?? "", /Dancing House/);
  assert.equal(records.items[1]?.title, "Catacombs tour");
  assert.equal(records.items[1]?.startTime, "15:00");
});

test("same-site activity clusters stay on one card with included stops", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-19",
          description:
            "Include the Gloriette, Orangeriegarten, Palm House, Apple Strudel Show, and Panorama Train Pass during the same palace visit.",
          itemType: "activity",
          title: "Schonbrunn Palace",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-same-site-cluster",
  });

  assert.equal(records.items.length, 1);
  assert.equal(records.items[0]?.categoryId, "tours_tickets");
  assert.match(records.items[0]?.description ?? "", /Apple Strudel Show/);
  assert.match(records.items[0]?.description ?? "", /Panorama Train Pass/);
});

test("sparse dated sightseeing lists keep visible day options after same-site grouping", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-19",
          description: "Same-site visit including the palace grounds.",
          itemType: "activity",
          title: "Schonbrunn Palace complex",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "During the same palace visit.",
          itemType: "activity",
          title: "Schonbrunn gardens",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Open until 11:45 PM.",
          itemType: "activity",
          title: "Ferris wheel",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          itemType: "activity",
          title: "Hundertwasser Haus",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Open until 7:00 PM.",
          itemType: "activity",
          title: "Mumok Museum",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Open until 8:30 PM.",
          itemType: "activity",
          title: "Natural History Museum",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-weak-vienna-day-list",
  });
  const activityTitles = records.items
    .filter((item) => item.itemType === "activity")
    .map((item) => item.title);
  const note = records.items.find((item) => item.itemType === "note");
  const summary = createGeneratedTripSummaryView(records);

  assert.deepEqual(activityTitles, [
    "Schonbrunn Palace complex",
    "Ferris wheel",
    "Hundertwasser Haus",
    "Museum visit: Mumok or Natural History",
  ]);
  assert.match(records.items[0]?.description ?? "", /Schonbrunn gardens/);
  assert.equal(note, undefined);
  assert.match(records.items[3]?.description ?? "", /Possible stops:/);
  assert.match(records.items[3]?.description ?? "", /Mumok Museum - Open until 7:00 PM/);
  assert.match(records.items[3]?.description ?? "", /Natural History Museum - Open until 8:30 PM/);
  assert.equal(summary.cityNotes.length, 0);
  assert.ok(
    records.reviewQuestions.some((question) =>
      /We grouped Mumok Museum, Natural History Museum into Museum visit/i.test(
        question.prompt
      )
    )
  );
});

test("same-site grouping folds child cards into the surviving visit card", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-19",
          description: "Same-site visit including the palace grounds.",
          itemType: "activity",
          title: "Schonbrunn Palace complex",
        },
        {
          category: "tours_tickets",
          date: "2019-01-19",
          description: "Timed show inside the palace visit.",
          itemType: "activity",
          startTime: "11:00",
          title: "Schonbrunn Apple Strudel Show",
        },
        {
          category: "art_culture",
          date: "2019-01-19",
          description: "Walk the gardens during the same visit.",
          itemType: "activity",
          title: "Schonbrunn gardens",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-schonbrunn-grouping",
  });
  const titles = records.items.map((item) => item.title);
  const call = records.reviewQuestions.find((question) =>
    /We grouped/i.test(question.prompt)
  );

  assert.deepEqual(titles, ["Schonbrunn Palace complex"]);
  assert.equal(records.items[0]?.startTime, "11:00");
  assert.match(records.items[0]?.description ?? "", /Apple Strudel Show/);
  assert.match(records.items[0]?.description ?? "", /gardens/);
  assert.ok(call);
  assert.equal(call?.status, "noted");
  assert.match(call?.prompt ?? "", /Apple Strudel Show/);
  assert.match(call?.prompt ?? "", /gardens/);
});

test("open-day loose lists become one flexible explore card instead of city notes", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2019-01-14",
          description: "Prague Castle and nearby sights: KGB Museum, Kafka Statue, and Peklo.",
          itemType: "activity",
          title: "Prague Castle and nearby sights",
        },
        {
          category: "art_culture",
          date: "2019-01-14",
          itemType: "activity",
          title: "KGB Museum",
        },
        {
          category: "art_culture",
          date: "2019-01-14",
          itemType: "activity",
          title: "Kafka Statue",
        },
        {
          category: "food_dining",
          date: "2019-01-14",
          itemType: "activity",
          title: "Peklo",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-16",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-nearby-sights-not-same-site",
  });
  const titles = records.items.map((item) => item.title);
  const note = records.items.find((item) => item.itemType === "note");
  const call = records.reviewQuestions.find((question) =>
    /We grouped/i.test(question.prompt)
  );

  assert.deepEqual(titles, ["Explore Prague"]);
  assert.equal(titles.includes("Prague Castle and nearby sights"), false);
  assert.equal(note, undefined);
  assert.match(records.items[0]?.description ?? "", /Possible stops:/);
  assert.match(records.items[0]?.description ?? "", /KGB Museum/);
  assert.match(records.items[0]?.description ?? "", /Kafka Statue/);
  assert.match(records.items[0]?.description ?? "", /Peklo/);
  assert.ok(call);
});

test("single bare venue on an open day keeps the venue plus free time", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2026-09-04",
          itemType: "activity",
          title: "City Museum",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-04",
          city: "Paris",
          country: "France",
          leaveDate: "2026-09-06",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Paris",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-open-day-one-venue",
  });

  assert.deepEqual(
    records.items.map((item) => item.title),
    ["City Museum", "Free time in Paris"]
  );
  assert.equal(records.items[0]?.itemType, "activity");
  assert.equal(records.items[1]?.categoryId, "admin_logistics");
});

test("planned area blocks group included untimed stops without subcards", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "art_culture",
          date: "2026-09-04",
          description:
            "Wander through Condesa with Parque Mexico, Avenida Amsterdam, and Cafe Toscano as optional stops.",
          itemType: "activity",
          title: "Explore Condesa morning",
        },
        {
          category: "art_culture",
          date: "2026-09-04",
          itemType: "activity",
          title: "Parque Mexico",
        },
        {
          category: "art_culture",
          date: "2026-09-04",
          itemType: "activity",
          title: "Avenida Amsterdam",
        },
        {
          category: "food_dining",
          date: "2026-09-04",
          itemType: "activity",
          title: "Cafe Toscano",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-04",
          city: "Mexico City",
          country: "Mexico",
          leaveDate: "2026-09-06",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Mexico City",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-planned-area-block",
  });
  const call = records.reviewQuestions.find((question) =>
    /We grouped/i.test(question.prompt)
  );

  assert.deepEqual(
    records.items.map((item) => item.title),
    ["Explore Condesa morning"]
  );
  assert.match(records.items[0]?.description ?? "", /Parque Mexico/);
  assert.match(records.items[0]?.description ?? "", /Avenida Amsterdam/);
  assert.match(records.items[0]?.description ?? "", /Cafe Toscano/);
  assert.ok(call);
  assert.match(call?.prompt ?? "", /Parque Mexico/);
});

test("draft consolidation does not reassemble an already assembled same-site grouping", () => {
  const first = consolidateTripDraft({
    activities: [
      {
        category: "tours_tickets",
        date: "2019-01-19",
        description: "Same-site visit including the palace grounds.",
        itemType: "activity",
        title: "Schonbrunn Palace complex",
      },
      {
        category: "tours_tickets",
        date: "2019-01-19",
        description: "Timed show inside the palace visit.",
        itemType: "activity",
        startTime: "11:00",
        title: "Schonbrunn Apple Strudel Show",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-18",
        city: "Vienna",
        leaveDate: "2019-01-21",
      },
    ],
    stays: [],
    transport: [],
  });
  const second = consolidateTripDraft(first.draft);

  assert.strictEqual(second.draft, first.draft);
  assert.deepEqual(second.debug, first.debug);
});

test("stay rows carry check-in flow without synthetic check-in cards", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "arrival_departure",
          date: "2019-01-13",
          description: "Arrive in Rome and drop bags at the hostel.",
          itemType: "admin",
          title: "Arrive in Rome and drop bags",
        },
        {
          category: "arrival_departure",
          date: "2019-01-13",
          description: "Check in at 2:30 PM.",
          itemType: "admin",
          startTime: "14:30",
          title: "Check in to The Yellow",
        },
        {
          category: "arrival_departure",
          date: "2019-01-13",
          description: "Drop bags before afternoon sightseeing.",
          itemType: "admin",
          title: "Drop bags at The Yellow",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-13",
          city: "Rome",
          country: "Italy",
          leaveDate: "2019-01-14",
        },
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-15",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: "Via Palestro 44, Rome",
          checkIn: "2019-01-13",
          checkInTime: "14:30",
          checkOut: "2019-01-14",
          firstNightDate: "2019-01-13",
          name: "The Yellow",
          nights: 1,
        },
        {
          address: "Private apartment address",
          checkIn: "2019-01-14",
          checkInTime: "15:00",
          checkOut: "2019-01-15",
          firstNightDate: "2019-01-14",
          name: "Prague Airbnb",
          nights: 1,
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-check-in-cards",
  });
  const summary = createGeneratedTripSummaryView(records);

  const checkInCards = records.items.filter(
    (item) => item.categoryId === "arrival_departure"
  );

  assert.equal(checkInCards.length, 0);
  assert.ok(
    summary.days.some((day) =>
      day.entries.some(
        (entry) =>
          entry.kind === "stay" &&
          entry.title === "Staying: The Yellow" &&
          /2:30 PM|14:30/.test(entry.meta)
      )
    )
  );
});

test("early timed bag drop stays visible when it changes traveler movement", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "arrival_departure",
          date: "2019-01-13",
          description: "Drop bags at the hostel at 9:00 AM before sightseeing.",
          itemType: "admin",
          startTime: "09:00",
          title: "Drop bags at The Yellow",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-13",
          city: "Rome",
          country: "Italy",
          leaveDate: "2019-01-14",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2019-01-13",
          checkInTime: "14:30",
          checkOut: "2019-01-14",
          name: "The Yellow",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-early-bag-drop",
  });

  assert.equal(
    records.items.some((item) => item.title === "Drop bags at The Yellow"),
    true
  );
});

test("separate luggage storage survives when it is not the stay check-in flow", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "arrival_departure",
          date: "2019-01-13",
          description: "Store bags at Roma Termini luggage storage before sightseeing.",
          itemType: "admin",
          title: "Store bags at Roma Termini luggage storage",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-13",
          city: "Rome",
          country: "Italy",
          leaveDate: "2019-01-14",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2019-01-13",
          checkInTime: "14:30",
          checkOut: "2019-01-14",
          name: "The Yellow",
          nights: 1,
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-separate-luggage-storage",
  });

  assert.equal(
    records.items.some(
      (item) => item.title === "Store bags at Roma Termini luggage storage"
    ),
    true
  );
});

test("explicit stay nights infer checkout without review", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: null,
          checkIn: null,
          checkOut: null,
          firstNightDate: "2019-01-18",
          name: "Wombats City Hostel Vienna - The Lounge",
          nights: 3,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        confidence: "medium",
        dateRange: "Jan 18-21, 2019",
        destinationSummary: "Vienna",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-stay-nights",
  });
  const stay = records.stays[0];

  assert.equal(stay?.checkInDate, "2019-01-18");
  assert.equal(stay?.checkOutDate, "2019-01-21");
  assert.equal(stay?.reviewRequired, false);
  assert.equal(getStructuredReviewCount(records), 0);
});

test("explicit stay nights infer check-in from checkout", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "Wombats City Hostel Vienna - The Lounge ... 3 nights",
          guessedValue: "3 nights",
          prompt: "Is the Vienna hostel stay definitely 3 nights, ending on January 21?",
          reason: "The source explicitly says 3 nights.",
          relatedTitle: "Wombats City Hostel Vienna - The Lounge",
          subjectType: "stay",
          targetField: "item/date",
        },
      ],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: null,
          checkIn: null,
          checkInTime: null,
          checkOut: "2019-01-21",
          checkOutTime: null,
          firstNightDate: null,
          name: "Wombats City Hostel Vienna - The Lounge",
          nights: 3,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        confidence: "medium",
        dateRange: "Jan 18-21, 2019",
        destinationSummary: "Vienna",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-stay-checkin",
  });
  const stay = records.stays[0];
  assert.equal(stay?.checkInDate, "2019-01-18");
  assert.equal(stay?.checkOutDate, "2019-01-21");
  assert.equal(stay?.reviewRequired, false);
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
});

test("strong lodging title guesses become stay names instead of questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The Yellow: Check in: 2:30 PM #743-410652363",
          guessedValue: "The Yellow Hostel",
          prompt: "Is this the correct lodging title for the Rome stay on January 13?",
          reason: "The source has check-in instructions and address.",
          relatedTitle: "Rome stay",
          subjectType: "stay",
          targetField: "item/title",
        },
      ],
      places: [
        {
          arriveDate: "2019-01-13",
          city: "Rome",
          country: "Italy",
          leaveDate: "2019-01-14",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          address: null,
          checkIn: "2019-01-13",
          checkInTime: "14:30",
          checkOut: "2019-01-14",
          checkOutTime: null,
          firstNightDate: "2019-01-13",
          name: "Rome stay",
          nights: 1,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        confidence: "medium",
        dateRange: "Jan 13-14, 2019",
        destinationSummary: "Rome",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-yellow",
  });
  const stay = records.stays[0];

  assert.equal(stay?.name, "The Yellow Hostel");
  assert.equal(stay?.checkInTime, "14:30");
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
});

test("commercial stay addresses remain public", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [
        {
          detailType: "address",
          reason: "The source includes the hostel address.",
          title: "Wombats City Hostel address",
        },
      ],
      stays: [
        {
          address: "Mariahilfer Strasse 137, Vienna, Austria",
          checkIn: "2019-01-18",
          checkOut: "2019-01-21",
          firstNightDate: "2019-01-18",
          name: "Wombats City Hostel Vienna - The Lounge",
          nights: 3,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-hostel-address",
  });

  assert.equal(records.stays[0]?.addressVisibility, "public");
  assert.equal(records.privateDetails.length, 0);
});

test("private rental stay addresses remain protected", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [
        {
          address: "Private apartment address",
          checkIn: "2019-01-14",
          checkOut: "2019-01-15",
          firstNightDate: "2019-01-14",
          name: "Prague Airbnb",
          nights: 1,
          sourceFilename: "central-europe.pdf",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-airbnb-address",
  });

  assert.equal(records.stays[0]?.addressVisibility, "traveler_password");
  assert.equal(records.privateDetails[0]?.detailType, "private_address");
});

test("medium-confidence core date guesses stay questions without explicit evidence", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-13",
          itemType: "activity",
          title: "Rome walk after bag drop",
        },
      ],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "Surrounding itinerary suggests this framing.",
          guessedValue: "2019-01-13",
          prompt: "Is the Rome walk really on January 13?",
          reason: "The source context implies the date but does not state it directly.",
          relatedTitle: "Rome walk after bag drop",
          subjectType: "item",
          targetField: "date",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Rome",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-contextual-date",
  });

  assert.equal(records.reviewQuestions[0]?.status, "open");
  assert.equal(getStructuredReviewCount(records), 1);
});

test("strong contextual date calls become notes instead of questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-13",
          itemType: "activity",
          title: "Rome walk after bag drop",
        },
      ],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence:
            "This follows the Rome arrival, bag drop, then check-in sequence on the same day.",
          guessedValue: "2019-01-13",
          prompt: "We placed the Rome walk on January 13 after arrival and bag drop.",
          reason:
            "A reasonable trip planner would place this on the Rome arrival day from the surrounding sequence.",
          relatedTitle: "Rome walk after bag drop",
          subjectType: "item",
          targetField: "date",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Rome",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-strong-contextual-date",
  });

  assert.equal(records.reviewQuestions[0]?.status, "noted");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("explicit stay night calls are dismissed as facts", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The source says Wombats City Hostel Vienna is 3 nights.",
          guessedValue: "3 nights",
          prompt: "We treated the Vienna stay as 3 nights. Is that right?",
          reason:
            "The stay text lists Wombats City Hostel Vienna and 3 nights.",
          relatedTitle: null,
          subjectType: "stay",
          targetField: "nights",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2019-01-18",
          checkOut: "2019-01-21",
          name: "Wombats City Hostel Vienna",
          nights: 3,
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-explicit-nights-call",
  });

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("commercial activity addresses do not become private details", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          address: "10 Via Roma",
          date: "2019-01-13",
          itemType: "activity",
          title: "Watches in Rome",
        },
      ],
      missingDetails: [],
      places: [],
      sensitiveDetails: [
        {
          detailType: "address",
          reason: "The source includes a watch shop address.",
          title: "Watch shop in Rome address",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Rome",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-commercial-address",
  });

  assert.equal(records.privateDetails.length, 0);
  assert.equal(
    classifyAddressSensitivity({
      address: "10 Via Roma",
      context: "Watches in Rome shop",
    }),
    null
  );
  assert.equal(
    classifyAddressSensitivity({
      address: "10 Via Roma",
      context: "Airbnb apartment",
    })?.kind,
    "private_residence"
  );
});

test("commercial stay address privacy prompts are dismissed", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence:
            "Vitae Hostel lists Erzsebet korut 50 and a reservation number.",
          guessedValue: "Show hostel address publicly; protect reservation number",
          prompt:
            "The Budapest hostel address appears to be a private/booking-specific lodging address. Please confirm if it should be treated as sensitive/private in the draft.",
          reason:
            "Hotel and hostel addresses are public venue information; reservation numbers remain protected.",
          relatedTitle: "Vitae Hostel",
          subjectType: "stay",
          targetField: "address",
        },
      ],
      places: [],
      sensitiveDetails: [
        {
          detailType: "address",
          reason: "Hostel address is public venue information.",
          title: "Vitae Hostel address",
        },
        {
          detailType: "reservation_number",
          reason: "Reservation numbers should stay behind the trip password.",
          title: "Vitae Hostel reservation number",
        },
      ],
      stays: [
        {
          address: "Erzsebet korut 50, Budapest, Hungary",
          checkIn: "2019-01-21",
          checkOut: "2019-01-24",
          name: "Vitae Hostel",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-hostel-privacy",
  });

  assert.equal(records.stays[0]?.addressVisibility, "public");
  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(
    records.privateDetails.some((detail) => detail.label === "Vitae Hostel address"),
    false
  );
  assert.ok(
    records.privateDetails.some(
      (detail) => detail.detailType === "reservation_number"
    )
  );
});

test("logistics-only sensitive details do not become private notes", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [
        {
          detailType: "sensitive_detail",
          reason: "The source mentions a pickup logistics item.",
          title: "Pick up rental car",
        },
        {
          detailType: "host_phone",
          reason: "Host contact details should stay private.",
          title: "Prague Airbnb host phone",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-logistics-sensitive",
  });

  assert.equal(records.privateDetails.length, 1);
  assert.equal(records.privateDetails[0]?.detailType, "host_phone");
});

test("privacy policy prompts are handled by the privacy recommendation", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "visibility",
          confidence: "medium",
          evidence: "The source has an Airbnb address, access code, and Wi-Fi password.",
          guessedValue: "Keep behind traveler password",
          prompt:
            "What is the exact visibility / handling for the Prague Airbnb address and access code?",
          reason:
            "The rental address, access code, Wi-Fi network, and password are private rental details.",
          relatedTitle: "Prague Airbnb",
          subjectType: "stay",
          targetField: "addressVisibility",
        },
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The source includes access codes and reservation numbers.",
          guessedValue: "Store as sensitive details",
          prompt:
            "Should the booking references and access details be stored as sensitive details?",
          reason:
            "Access codes, Wi-Fi passwords, and reservation numbers should not be exposed casually.",
          relatedTitle: null,
          subjectType: "trip",
          targetField: "sensitiveDetails",
        },
      ],
      places: [],
      sensitiveDetails: [
        {
          detailType: "wifi_password",
          reason: "Wi-Fi passwords should stay behind the trip password.",
          title: "Prague Airbnb",
        },
        {
          detailType: "wifi_password",
          reason: "Wi-Fi passwords should stay behind the trip password.",
          title: "Sleep at Prague Airbnb",
        },
        {
          detailType: "access_code",
          reason: "Access codes should stay behind the trip password.",
          title: "Prague Airbnb",
        },
        {
          detailType: "access_code",
          reason: "Access codes should stay behind the trip password.",
          title: "Sleep at Prague Airbnb",
        },
      ],
      stays: [
        {
          address: "Michalská 431/5",
          checkIn: "2019-01-14",
          checkOut: "2019-01-15",
          name: "Prague Airbnb",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-privacy-policy",
  });
  const sections = getStructuredReviewSections(records);
  const questions = sections.find((section) => section.id === "questions");
  const privacy = sections.find((section) => section.id === "private-details");
  const privacyItem = privacy?.items[0];

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(records.reviewQuestions[1]?.status, "dismissed");
  assert.equal(questions?.items.length, 0);
  assert.equal(privacy?.items.length, 1);
  assert.equal(privacyItem?.title, "Confirm recommended privacy");
  assert.equal(privacyItem?.childItems?.length, 1);
  assert.equal(
    privacyItem?.childItems?.[0]?.meta,
    "Access codes and arrival instructions"
  );
  assert.equal(getStructuredReviewCount(records), 1);
});

test("complete cards ignore stale record-level review flags", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-15",
          description: "Guided Klementinum tour at 2:30 PM.",
          itemType: "activity",
          startTime: "14:30",
          title: "Klementinum Tour",
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
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-stale-review-flag",
  });
  const item = records.items[0];

  assert.ok(item);
  item.reviewRequired = true;
  item.status = "needs_review";

  const sections = getStructuredReviewSections(records);
  const summary = createGeneratedTripSummaryView(records);
  const summaryReviewSection = summary.sections.find(
    (section) => section.id === "review"
  );
  const itemDay = summary.days.find((day) =>
    day.entries.some((entry) => entry.subjectId === item.id)
  );
  const itemEntry = itemDay?.entries.find((entry) => entry.subjectId === item.id);

  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(sections.find((section) => section.id === "activities")?.items.length, 0);
  assert.equal(sections.find((section) => section.id === "questions")?.items.length, 0);
  assert.equal(summary.counts.review, 0);
  assert.equal(summaryReviewSection?.items.length, 0);
  assert.equal(itemDay?.needsReview, false);
  assert.equal(itemEntry?.kind, "activity");
  assert.equal(itemEntry?.needsReview, false);
});

test("critical transport departure gaps are owned by one open question", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-18",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-19",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Vienna",
          date: "2019-01-18",
          departure: "Prague",
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-critical-transport-review",
  });
  const train = records.transport[0];

  assert.ok(train);
  train.reviewRequired = true;
  train.status = "needs_review";

  const sections = getStructuredReviewSections(records);
  const questions = sections.find((section) => section.id === "questions");

  assert.equal(getStructuredReviewCount(records), 1);
  assert.equal(sections.find((section) => section.id === "transport")?.items.length, 0);
  assert.equal(questions?.items.length, 1);
  assert.match(questions?.items[0]?.title ?? "", /Train to Vienna depart/i);
});

test("optional transport provider gaps with usable anchors stay out of review", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence: "The source has pickup time and location, but no provider.",
          guessedValue: null,
          prompt: "We created the rental car pickup without a company name.",
          reason:
            "The pickup details are enough for the traveler app; the company name can be added later if needed.",
          relatedTitle: "Rental car pickup",
          subjectType: "transport",
          targetField: "provider",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          date: "2019-01-17",
          departure: "Revolucni 1044/23",
          title: "Rental car pickup",
          type: "rental_car",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-rental-car-provider",
  });
  const notes = getStructuredReviewSections(records).find(
    (section) => section.id === "notes"
  );

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(notes?.count, 0);
});

test("optional transport provider gaps can dismiss without an exact related title", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence:
            "Thursday, January 17th Kutna Hora. Pick up car at 9 am. Reservation number: 81486. Revolucni 1044/23.",
          guessedValue: "car pickup at Revolucni 1044/23",
          prompt:
            "The car pickup has an address but no provider name. Use the pickup location as given and leave provider null.",
          reason:
            "The source gives the pickup time, reservation number, and address, but not the rental company.",
          relatedTitle: null,
          subjectType: "transport",
          targetField: "provider",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          date: "2019-01-17",
          departure: "Revolucni 1044/23",
          title: "Rental car pickup",
          type: "rental_car",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-provider-no-related-title",
  });

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("optional train operator gaps with usable anchors stay out of review", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence: "The source has train route and times, but no operator.",
          guessedValue: null,
          prompt: "We created the train without an operator.",
          reason:
            "The route and times are enough for the traveler app; the operator can be added later if needed.",
          relatedTitle: "Vienna to Budapest train",
          subjectType: "transport",
          targetField: "provider",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Budapest Keleti",
          arrivalTime: "13:19",
          date: "2019-01-21",
          departure: "Wien Hbf",
          departureTime: "10:42",
          title: "Vienna to Budapest train",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-train-provider",
  });

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("generic time-bound reservation without an anchor stays a question", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          address: null,
          date: "2019-01-14",
          description: null,
          itemType: "activity",
          startTime: "18:30",
          title: "Dinner reservation",
        },
      ],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence: "The source only says dinner reservation at 6:30.",
          guessedValue: null,
          prompt: "What is the restaurant name or address for dinner?",
          reason:
            "The card has a time, but no name, address, confirmation, or other identifier.",
          relatedTitle: "Dinner reservation",
          subjectType: "item",
          targetField: "locationName",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-generic-dinner",
  });

  assert.equal(records.reviewQuestions[0]?.status, "open");
  assert.equal(getStructuredReviewCount(records), 1);
});

test("already-filled activity times suppress stale model time questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-16",
          description: "Reservation detail for U Maliru.",
          itemType: "activity",
          startTime: "13:00",
          title: "Lunch at U Maliru",
        },
      ],
      missingDetails: [
        {
          answerType: "time",
          confidence: "medium",
          evidence:
            "Lunch: U Maliru 1:00 PM. Reservation detail lists Restaurant U Maliru 1543.",
          guessedValue: null,
          prompt:
            "What time was the Restaurant U Maliru 1543 reservation on January 2019-01-16?",
          reason:
            "The parser produced a stale missing-detail question even though the activity already has a start time.",
          relatedTitle: "Restaurant U Maliru 1543",
          subjectType: "item",
          targetField: "startTime",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-known-activity-time",
  });

  assert.equal(records.items[0]?.startTime, "13:00");
  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("usable walking tour cards suppress missing brand or title questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-15",
          description: "Walking tour in the morning 9:00 AM ($20).",
          itemType: "activity",
          startTime: "09:00",
          title: "Morning walking tour",
        },
      ],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence:
            "Walking tour in the morning 9:00 AM ($20). The source gives a time and price but no tour name or provider.",
          guessedValue: null,
          prompt: "What is the name of the morning walking tour on January 15th?",
          reason:
            "The source gives a time and price but no tour name or provider, so the activity is not fully identifiable.",
          relatedTitle: "Walking tour in the morning",
          subjectType: "item",
          targetField: "title",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-walking-tour-optional-title",
  });

  assert.equal(records.items[0]?.title, "Morning walking tour");
  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("anchored time-bound card missing optional address stays out of review", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          address: null,
          date: "2019-01-16",
          description: null,
          itemType: "activity",
          startTime: "10:00",
          title: "Széchenyi Baths",
        },
      ],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence: "The source names Széchenyi Baths and gives a time, but no address.",
          guessedValue: null,
          prompt: "We created Széchenyi Baths without an address.",
          reason:
            "The named place is enough to identify the card; the address can be added later if needed.",
          relatedTitle: "Széchenyi Baths",
          subjectType: "item",
          targetField: "address",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-anchored-baths",
  });

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("duplicate open questions for the same record and field collapse", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          date: "2019-01-14",
          itemType: "activity",
          title: "Prague walking plan",
        },
      ],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The source context suggests this but does not lock it.",
          guessedValue: "2019-01-14",
          prompt: "Is Prague walking plan on January 14?",
          reason: "The date is not explicit.",
          relatedTitle: "Prague walking plan",
          subjectType: "item",
          targetField: "date",
        },
        {
          answerType: "confirm",
          confidence: "medium",
          evidence: "The same source context suggests this date.",
          guessedValue: "2019-01-14",
          prompt: "Should Prague walking plan also be on January 14?",
          reason: "This is the same underlying date uncertainty.",
          relatedTitle: "Prague walking plan",
          subjectType: "item",
          targetField: "date",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-duplicate-question",
  });

  assert.equal(
    records.reviewQuestions.filter((question) => question.status === "open")
      .length,
    1
  );
  assert.equal(getStructuredReviewCount(records), 1);
});

test("structured review summary uses maker-facing counts", () => {
  const draft = {
    activities: [
      {
        date: "2026-09-02",
        itemType: "activity",
        title: "Museum visit",
      },
      {
        date: null,
        itemType: "activity",
        category: "food_dining",
        title: "Dinner TBD",
      },
    ],
    missingDetails: [
      {
        prompt: "Which day is Dinner TBD?",
        reason: "The traveler app needs a date to place the card.",
        relatedTitle: "Dinner TBD",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    stays: [
      {
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        name: "Left Bank Hotel",
      },
    ],
    transport: [
      {
        date: "2026-09-01",
        departure: "New York",
        departureTime: "19:00",
        arrival: "Paris",
        title: "Fly to Paris",
        type: "flight",
      },
    ],
    tripOverview: {
      title: "Paris test",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-2",
  });
  const summaryView = createGeneratedTripSummaryView(records);
  const reviewCount = getStructuredReviewCount(records);
  const summary = formatStructuredDiscoverySummary(records, reviewCount);
  const sections = getStructuredReviewSections(records);

  assert.equal(
    summary,
    "We found 1 leg across 3 days, including 1 transport item (1 flight), 1 stay, 2 activities (1 food and dining). We need you to confirm 2 things before this becomes the traveler app."
  );
  assert.equal(reviewCount, 2);
  assert.equal(summaryView.counts.plans, 2);
  assert.equal(sections.length, 8);
  assert.deepEqual(
    sections.map((section) => section.id),
    [
      "legs",
      "stays",
      "transport",
      "activities",
      "city-tips",
      "notes",
      "questions",
      "private-details",
    ]
  );
  assert.deepEqual(
    sections.find((section) => section.id === "legs")?.summaryItems,
    ["Paris · September 1-3, 2026"]
  );
  assert.deepEqual(
    sections.find((section) => section.id === "stays")?.summaryItems,
    [
      "Left Bank Hotel\nCheck-in September 1, 2026 · Check-out September 3, 2026",
    ]
  );
  assert.deepEqual(
    sections.find((section) => section.id === "transport")?.summaryItems,
    ["Fly to Paris · September 1, 2026"]
  );
  assert.equal(sections.find((section) => section.id === "notes")?.count, 0);
});

test("structured discovery summary respects blocking summary warnings", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      stays: [],
      transport: [
        {
          date: "2026-09-01",
          description: "Train departs 09:20 from Praha hl.n.",
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Train test",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-discovery-blocking-warning",
  });
  const transport = records.transport[0];
  assert.ok(transport);
  transport.departureTime = null;
  const summaryView = createGeneratedTripSummaryView(records);
  const summary = formatStructuredDiscoverySummary(records, 0, {
    blockingIssueCount: summaryView.warnings.filter(
      (warning) => warning.severity === "hard"
    ).length,
  });

  assert.match(summary ?? "", /summary warning/);
  assert.doesNotMatch(summary ?? "", /Nothing needs confirmation/);
});

test("leg leave dates infer from the next leg arrival when missing", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Prague",
          country: "Czechia",
        },
        {
          arriveDate: "2026-09-04",
          city: "Vienna",
          country: "Austria",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-leg-inferred-leave",
  });
  const sections = getStructuredReviewSections(records);

  assert.equal(records.legs[0]?.leaveDate, "2026-09-04");
  assert.deepEqual(sections.find((section) => section.id === "legs")?.summaryItems, [
    "Prague · September 1-4, 2026",
    "Vienna · September 4, 2026",
  ]);
});

test("stay summaries can use guessed check-in and inferred checkout with confirmation questions", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "date",
          confidence: "medium",
          evidence:
            "The lodging is listed under the arrival day but does not spell out first night separately.",
          guessedValue: "2026-09-01",
          prompt:
            "This looks like Left Bank Hotel starts on September 1. Is that the correct check-in date?",
          reason: "The traveler app needs a check-in date for the stay.",
          relatedTitle: "Left Bank Hotel",
          subjectType: "stay",
          targetField: "checkIn",
        },
      ],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Paris",
          country: "France",
        },
        {
          arriveDate: "2026-09-04",
          city: "Lyon",
          country: "France",
        },
      ],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: null,
          checkOut: null,
          name: "Left Bank Hotel",
          nights: null,
        },
      ],
      transport: [],
      tripOverview: {
        title: "France",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-stay-date-guesses",
  });
  const sections = getStructuredReviewSections(records);
  const stay = records.stays[0];
  const questions = records.reviewQuestions.filter(
    (question) => question.status === "open"
  );

  assert.equal(stay?.checkInDate, "2026-09-01");
  assert.equal(stay?.checkOutDate, "2026-09-04");
  assert.deepEqual(sections.find((section) => section.id === "stays")?.summaryItems, [
    "Left Bank Hotel\nCheck-in September 1, 2026 · Check-out September 4, 2026",
  ]);
  assert.equal(questions.length, 2);
  assert.equal(questions[0]?.targetField, "checkIn");
  assert.equal(questions[1]?.targetField, "checkOutDate");
  assert.match(questions[1]?.prompt ?? "", /checks out on September 4th, 2026/i);
});

test("high-confidence parser calls become notes instead of review questions", () => {
  const draft = {
    activities: [],
    missingDetails: [
      {
        answerType: "confirm",
        confidence: "high",
        evidence:
          "Outbound overnight flight departs on January 12 and there is no hotel that night.",
        guessedValue: "Trip starts January 12",
        prompt:
          "This looks like the first trip day starting with the overnight flight on January 12. Is that right?",
        reason:
          "The route starts with an overnight flight and no separate hotel night.",
        relatedTitle: null,
        subjectType: "trip",
        targetField: "dateRange",
      },
    ],
    places: [
      {
        arriveDate: "2019-01-12",
        city: "Rome",
        country: "Italy",
        leaveDate: "2019-01-15",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [
      {
        date: "2019-01-12",
        departure: "Washington, DC",
        departureTime: "17:00",
        arrival: "Rome",
        provider: "Delta",
        title: "Fly to Rome",
        type: "flight",
      },
    ],
    tripOverview: {
      title: "Central Europe",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-note",
  });
  const sections = getStructuredReviewSections(records);
  const notes = sections.find((section) => section.id === "notes");
  const questions = sections.find((section) => section.id === "questions");

  assert.equal(getStructuredReviewCount(records), 0);
  assert.equal(records.reviewQuestions[0]?.status, "noted");
  assert.equal(notes?.count, 1);
  assert.equal(questions?.count, 0);
  assert.match(notes?.summaryItems[0] ?? "", /overnight flight/i);
  assert.equal(
    notes?.items[0]?.title,
    "We treated the first trip day as starting with the overnight flight on January 12."
  );
});

test("routine assembly facts stay out of maker-facing calls", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "high",
          evidence:
            "The final transport on January 25th is the return flight home.",
          guessedValue: "2019-01-25",
          prompt: "We treated the return flight day as the trip end date.",
          reason:
            "The itinerary sequence ends with the home flight, so no maker decision is needed.",
          relatedTitle: null,
          subjectType: "trip",
          targetField: "endDate",
        },
        {
          answerType: "confirm",
          confidence: "high",
          evidence:
            "Budget lines and the itinerary sequence place Budapest from January 21st through January 24th.",
          guessedValue: "2019-01-21 to 2019-01-24",
          prompt:
            "We treated the Budapest stay as January 21st through January 24th based on the itinerary sequence and listed stay nights budget lines.",
          reason:
            "The stay dates are source-backed routine assembly, not a presentation choice.",
          relatedTitle: "Budapest stay",
          subjectType: "stay",
          targetField: "dateRange",
        },
        {
          answerType: "confirm",
          confidence: "high",
          evidence:
            "The Rome landing and bag drop are the first Rome logistics on January 13th.",
          guessedValue: "2019-01-13",
          prompt:
            "We treated the Rome landing and bag drop as the start of the Rome stay on January 13th.",
          reason:
            "The source sequence makes this routine stay context.",
          relatedTitle: "Rome stay",
          subjectType: "stay",
          targetField: "checkInDate",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-routine-calls",
  });
  const sections = getStructuredReviewSections(records);

  assert.deepEqual(
    records.reviewQuestions.map((question) => question.status),
    ["dismissed", "dismissed", "dismissed"]
  );
  assert.equal(sections.find((section) => section.id === "notes")?.count, 0);
  assert.equal(getStructuredReviewCount(records), 0);
});

test("question-shaped stay prompts stay questions instead of calls", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "high",
          evidence:
            "The Prague Airbnb check-in appears after 3:00 PM on Monday, January 14th.",
          guessedValue: "2019-01-14",
          prompt:
            "The Prague Airbnb check-in is after 3:00 PM on Monday, January 14th. Should we treat January 14th as the first night in Prague.",
          reason:
            "The source implies this from check-in sequence but asks for treatment as first night.",
          relatedTitle: "Prague Airbnb",
          subjectType: "stay",
          targetField: "checkInDate",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [
        {
          checkIn: "2019-01-14",
          name: "Prague Airbnb",
        },
      ],
      transport: [],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-question-shaped-call",
  });

  assert.equal(records.reviewQuestions[0]?.status, "open");
  assert.equal(getStructuredReviewCount(records), 1);
});

test("routine DCA JFK FCO transport label prompts are dismissed", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence:
            "Saturday, January 12th: DCA -> JFK 5:00 PM -> 6:41 PM. Delta Flight 444 JFK -> FCO 7:46 PM -> 10:15 AM Sunday, January 13th.",
          guessedValue:
            "Washington, D.C. area airport departure before the JFK connection.",
          prompt:
            "The first flight begins at DCA and connects through JFK. What should we use as the departure airport/city for the trip overview or transport record?",
          reason:
            "The source shows DCA, but not the city label or any broader airport naming beyond the code.",
          relatedTitle: "DCA to JFK",
          subjectType: "transport",
          targetField: "departure",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "JFK",
          date: "2019-01-12",
          departure: "DCA",
          departureTime: "17:00",
          title: "DCA to JFK",
          type: "flight",
        },
        {
          arrival: "FCO",
          date: "2019-01-12",
          departure: "JFK",
          departureTime: "19:46",
          title: "JFK to FCO",
          type: "flight",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-routine-dca-jfk-fco",
  });

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("ordinary airport moves before flights are ignored when the flight card is enough", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "arrival_departure",
          date: "2019-01-14",
          description: "Ryanair FR8331 Rome Ciampino to Prague, 9:20 AM.",
          itemType: "activity",
          title: "Fly Rome to Prague",
        },
      ],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "medium",
          evidence:
            "Wake at 6:00 AM to take public transport to Rome Ciampino before the Ryanair flight.",
          guessedValue: "airport transfer/public transport to Rome Ciampino",
          prompt:
            "We treated the 6:00 AM move as an airport transfer to Rome Ciampino before the Ryanair flight. Is that the right interpretation?",
          reason:
            "The source says to take public transport to the airport before the flight.",
          relatedTitle: "Airport transfer to Rome Ciampino",
          subjectType: "transport",
          targetField: "description",
        },
      ],
      places: [
        {
          arriveDate: "2019-01-13",
          city: "Rome",
          country: "Italy",
          leaveDate: "2019-01-14",
        },
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-18",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Rome Ciampino Airport",
          arrivalTime: null,
          confirmation: null,
          date: "2019-01-14",
          departure: null,
          departureTime: "06:00",
          description:
            "Wake at 6:00 AM to take public transport to Rome Ciampino before the Ryanair flight.",
          provider: null,
          title: "Airport transfer to Rome Ciampino",
          type: "transfer",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-airport-transfer-noise",
  });

  assert.equal(records.transport[0]?.status, "ignored");
  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("clear train leg transitions do not ask for prior origin city", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [
        {
          answerType: "text",
          confidence: "medium",
          evidence:
            "Friday, January 18 says Train to Vienna and the next stay is in Vienna.",
          guessedValue: "Prague to Vienna train",
          prompt:
            "We have the Vienna train but not the exact route details in the source. What city did this train depart from?",
          reason:
            "The city transition and that the next stay is in Vienna are clear, but the exact route is not in the train line itself.",
          relatedTitle: "Train to Vienna",
          subjectType: "transport",
          targetField: "departure",
        },
      ],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-18",
        },
        {
          arriveDate: "2019-01-18",
          city: "Vienna",
          country: "Austria",
          leaveDate: "2019-01-21",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [
        {
          arrival: "Vienna",
          arrivalTime: null,
          confirmation: "1beb5005",
          date: "2019-01-18",
          departure: "Prague",
          departureTime: null,
          description: "Train to Vienna. Train code: 1beb5005.",
          provider: null,
          title: "Train to Vienna",
          type: "train",
        },
      ],
      tripOverview: {
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-train-origin-noise",
  });

  assert.equal(records.reviewQuestions[0]?.status, "dismissed");
  assert.equal(getStructuredReviewCount(records), 0);
});

test("review decisions update structured records", () => {
  const draft = {
    activities: [
      {
        date: null,
        description: "Duplicate dinner note.",
        title: "Dinner TBD",
      },
      {
        date: "2026-09-02",
        description: "Dinner reservation.",
        title: "Dinner reservation",
      },
    ],
    missingDetails: [
      {
        prompt: "Which day is Dinner TBD?",
        reason: "The traveler app needs a date to place the card.",
        relatedTitle: "Dinner TBD",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    sensitiveDetails: [
      {
        detailType: "door_code",
        reason: "Door codes should stay behind traveler mode.",
        title: "Apartment access",
      },
    ],
    stays: [
      {
        address: "Private apartment address",
        checkIn: null,
        checkOut: "2026-09-03",
        name: "Paris apartment",
      },
    ],
    transport: [],
    tripOverview: {
      title: "Paris review",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-3",
  });
  const stay = records.stays[0];
  const detail = records.privateDetails.find(
    (item) => item.detailType === "door_code"
  );
  const sourceItem = records.items.find((item) => item.title === "Dinner TBD");
  const targetItem = records.items.find(
    (item) => item.title === "Dinner reservation"
  );
  const question = records.reviewQuestions[0];

  assert.ok(stay);
  assert.ok(detail);
  assert.ok(sourceItem);
  assert.ok(targetItem);
  assert.ok(question);

  const updated = applyReviewDecisions(records, [
    {
      action: "edit",
      changes: {
        checkInDate: "2026-09-01",
        reviewRequired: false,
        status: "confirmed",
      },
      createdAt: "2026-06-18T12:00:00.000Z",
      id: "decision-edit-stay",
      subjectId: stay.id,
      subjectType: "stay",
      tripId: "trip-3",
    },
    {
      action: "protect",
      createdAt: "2026-06-18T12:01:00.000Z",
      id: "decision-protect-detail",
      subjectId: detail.id,
      subjectType: "private_detail",
      tripId: "trip-3",
    },
    {
      action: "combine",
      createdAt: "2026-06-18T12:02:00.000Z",
      id: "decision-combine-dinner",
      mergedChanges: {
        description: "Dinner reservation with the duplicate note folded in.",
      },
      sourceIds: [sourceItem.id],
      subjectId: targetItem.id,
      subjectType: "item",
      targetId: targetItem.id,
      tripId: "trip-3",
    },
    {
      action: "answer_question",
      answerValue: "Use the dinner reservation on Sep 2.",
      createdAt: "2026-06-18T12:03:00.000Z",
      id: "decision-answer-question",
      resolvedAction: "combine",
      subjectId: question.id,
      subjectType: "review_question",
      tripId: "trip-3",
    },
  ]);

  const updatedStay = updated.stays.find((item) => item.id === stay.id);
  const updatedDetail = updated.privateDetails.find(
    (item) => item.id === detail.id
  );
  const updatedSourceItem = updated.items.find(
    (item) => item.id === sourceItem.id
  );
  const updatedTargetItem = updated.items.find(
    (item) => item.id === targetItem.id
  );
  const updatedQuestion = updated.reviewQuestions.find(
    (item) => item.id === question.id
  );

  assert.equal(updatedStay?.checkInDate, "2026-09-01");
  assert.equal(updatedStay?.reviewRequired, false);
  assert.equal(updatedStay?.status, "confirmed");
  assert.equal(updatedDetail?.visibility, "traveler_password");
  assert.equal(updatedDetail?.reviewRequired, false);
  assert.equal(updatedSourceItem?.status, "ignored");
  assert.equal(updatedSourceItem?.parentItemId, targetItem.id);
  assert.equal(updatedTargetItem?.status, "confirmed");
  assert.equal(
    updatedTargetItem?.description,
    "Dinner reservation with the duplicate note folded in."
  );
  assert.equal(updatedQuestion?.answerValue, "Use the dinner reservation on Sep 2.");
  assert.equal(updatedQuestion?.status, "answered");

  const deleted = applyReviewDecision(updated, {
    action: "delete",
    createdAt: "2026-06-18T12:04:00.000Z",
    id: "decision-delete-dinner",
    subjectId: targetItem.id,
    subjectType: "item",
    tripId: "trip-3",
  });

  assert.equal(
    deleted.items.find((item) => item.id === targetItem.id)?.status,
    "ignored"
  );
});

test("answering a targeted question updates the structured record", () => {
  const draft = {
    activities: [
      {
        category: "food_dining",
        date: null,
        description: "Dinner reservation listed under Sep 2 notes.",
        itemType: "activity",
        title: "Dinner at Septime",
      },
    ],
    missingDetails: [
      {
        answerType: "date",
        confidence: "medium",
        evidence: "The reservation appears in the Sep 2 section.",
        guessedValue: "2026-09-02",
        prompt: "This looks like dinner on September 2nd. Is that right?",
        reason: "The traveler app needs a date to place the dinner card.",
        relatedTitle: "Dinner at Septime",
        subjectType: "item",
        targetField: "date",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Paris question",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-targeted-question",
  });
  const dinner = records.items[0];
  const question = records.reviewQuestions[0];

  assert.ok(dinner);
  assert.ok(question);
  assert.equal(question.subjectId, dinner.id);
  assert.equal(question.targetField, "date");
  assert.equal(question.guessedValue, "2026-09-02");

  const updated = applyReviewDecision(records, {
    action: "answer_question",
    answerValue: "2026-09-02",
    createdAt: "2026-06-18T15:00:00.000Z",
    id: "decision-targeted-answer",
    resolvedAction: "edit",
    subjectId: question.id,
    subjectType: "review_question",
    tripId: "trip-targeted-question",
  });
  const updatedDinner = updated.items[0];
  const updatedQuestion = updated.reviewQuestions[0];

  assert.equal(updatedDinner?.date, "2026-09-02");
  assert.equal(updatedDinner?.reviewRequired, false);
  assert.equal(updatedDinner?.status, "confirmed");
  assert.equal(updatedQuestion?.answerValue, "2026-09-02");
  assert.equal(updatedQuestion?.status, "answered");
  assert.equal(getStructuredReviewCount(updated), 0);
});

test("answering an open description question folds the answer into the activity card", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2026-09-02",
          description:
            "Prague Castle visit. Need to decide which ticket or tour option to get.",
          itemType: "activity",
          title: "Prague Castle",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2026-09-01",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2026-09-04",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: {
        title: "Prague",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-description-answer",
  });
  const castle = records.items[0];
  const question = records.reviewQuestions[0];

  assert.ok(castle);
  assert.ok(question);
  assert.equal(question.targetField, "description");

  const updated = applyReviewDecision(records, {
    action: "answer_question",
    answerValue: "Use Prague Castle Circuit B and keep St. Vitus as optional.",
    createdAt: "2026-06-18T16:00:00.000Z",
    id: "decision-description-answer",
    resolvedAction: "edit",
    subjectId: question.id,
    subjectType: "review_question",
    tripId: "trip-description-answer",
  });
  const updatedCastle = updated.items[0];
  const updatedQuestion = updated.reviewQuestions[0];

  assert.match(
    updatedCastle?.description ?? "",
    /Need to decide which ticket or tour option/
  );
  assert.match(updatedCastle?.description ?? "", /Circuit B/);
  assert.equal(updatedCastle?.reviewRequired, false);
  assert.equal(updatedCastle?.status, "confirmed");
  assert.equal(updatedQuestion?.status, "answered");
});

test("explicit source todo language on activity cards becomes an open review question", () => {
  const draft = {
    activities: [
      {
        category: "art_culture",
        date: "2019-01-16",
        description:
          "Plan for about 2 hours. Changing of the Guard is at 12:00 PM. Need to decide which ticket to get.",
        itemType: "activity",
        sourceFilename: "central-europe.pdf",
        title: "Prague Castle",
      },
    ],
    missingDetails: [],
    places: [
      {
        arriveDate: "2019-01-15",
        city: "Prague",
        country: "Czechia",
        leaveDate: "2019-01-18",
      },
    ],
    stays: [],
    transport: [],
    tripOverview: {
      destinationSummary: "Prague",
      title: "Central Europe",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-explicit-todo",
  });
  const castle = records.items[0];
  const question = records.reviewQuestions[0];

  assert.ok(castle);
  assert.ok(question);
  assert.equal(castle.title, "Prague Castle");
  assert.equal(castle.date, "2019-01-16");
  assert.equal(castle.reviewRequired, false);
  assert.equal(question.status, "open");
  assert.equal(question.subjectId, castle.id);
  assert.equal(question.subjectType, "item");
  assert.equal(question.targetField, "description");
  assert.equal(
    question.prompt,
    "Which ticket or tour option should be listed for Prague Castle?"
  );
  assert.equal(
    question.reason,
    "The source marks this activity detail as undecided, so this needs your choice."
  );
  assert.equal(getStructuredReviewCount(records), 1);
});

test("grouped route cards keep specific unresolved ticket questions recoverable", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [
        {
          category: "tours_tickets",
          date: "2019-01-16",
          description:
            "Walking route through Lesser Town, St. Vitus Cathedral, and Prague Castle. Prague Castle: Need to decide which ticket to get.",
          itemType: "activity",
          title: "Prague Castle and Lesser Town",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-15",
          city: "Prague",
          country: "Czechia",
          leaveDate: "2019-01-18",
        },
      ],
      stays: [],
      transport: [],
      tripOverview: {
        destinationSummary: "Prague",
        title: "Central Europe",
      },
    },
    fallbackTripName: "Fallback trip",
    tripId: "trip-grouped-prague-ticket",
  });

  assert.equal(records.reviewQuestions.length, 1);
  assert.equal(records.reviewQuestions[0]?.status, "open");
  assert.equal(
    records.reviewQuestions[0]?.prompt,
    "Which ticket or tour option should be listed for Prague Castle?"
  );
});

test("model-supplied source todo questions stay open and do not duplicate fallback questions", () => {
  const draft = {
    activities: [
      {
        category: "art_culture",
        date: "2019-01-16",
        description:
          "Plan for about 2 hours. Changing of the Guard is at 12:00 PM. Need to decide which ticket to get.",
        itemType: "activity",
        sourceFilename: "central-europe.pdf",
        title: "Prague Castle",
      },
    ],
    missingDetails: [
      {
        answerType: "text",
        confidence: "medium",
        evidence: "The itinerary says: Need to decide which ticket to get.",
        guessedValue: null,
        prompt: "Have you chosen which Prague Castle ticket to get?",
        reason: "The source explicitly marks the ticket choice as undecided.",
        relatedTitle: "Prague Castle",
        subjectType: "item",
        targetField: "ticketType",
      },
    ],
    places: [
      {
        arriveDate: "2019-01-15",
        city: "Prague",
        country: "Czechia",
        leaveDate: "2019-01-18",
      },
    ],
    stays: [],
    transport: [],
    tripOverview: {
      destinationSummary: "Prague",
      title: "Central Europe",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-explicit-todo-model-question",
  });
  const castle = records.items[0];

  assert.ok(castle);
  assert.equal(records.reviewQuestions.length, 1);
  assert.equal(records.reviewQuestions[0]?.status, "open");
  assert.equal(records.reviewQuestions[0]?.subjectId, castle.id);
  assert.equal(records.reviewQuestions[0]?.targetField, "ticketType");
});

test("review decisions serialize through the persistence payload contract", () => {
  const serialized = serializeTripReviewDecision({
    action: "combine",
    createdAt: null,
    id: "decision-1",
    mergedChanges: {
      description: "Merged dinner plan.",
      title: "Dinner reservation",
    },
    note: "Duplicate parser output.",
    sourceIds: ["item-2"],
    subjectId: "item-1",
    subjectType: "item",
    targetId: "item-1",
    tripId: "trip-4",
  });

  assert.deepEqual(serialized, {
    action: "combine",
    decision_key: "trip-4:item:item-1:combine",
    id: "decision-1",
    note: "Duplicate parser output.",
    payload_json: {
      mergedChanges: {
        description: "Merged dinner plan.",
        title: "Dinner reservation",
      },
      sourceIds: ["item-2"],
      targetId: "item-1",
    },
    subject_id: "item-1",
    subject_type: "item",
    trip_id: "trip-4",
  });

  const normalized = normalizeTripReviewDecisionRow({
    action: "combine",
    created_at: "2026-06-18T13:00:00.000Z",
    decision_key: serialized.decision_key,
    id: "decision-1",
    note: "Duplicate parser output.",
    payload_json: serialized.payload_json,
    subject_id: "item-1",
    subject_type: "item",
    trip_id: "trip-4",
  });

  assert.deepEqual(normalized, {
    action: "combine",
    createdAt: "2026-06-18T13:00:00.000Z",
    id: "decision-1",
    mergedChanges: {
      description: "Merged dinner plan.",
      title: "Dinner reservation",
    },
    note: "Duplicate parser output.",
    sourceIds: ["item-2"],
    subjectId: "item-1",
    subjectType: "item",
    targetId: "item-1",
    tripId: "trip-4",
  });

  const moveSerialized = serializeTripReviewDecision({
    action: "move_to_city_tip",
    createdAt: null,
    id: "decision-2",
    subjectId: "item-3",
    subjectType: "item",
    targetLegId: "leg-vienna",
    tripId: "trip-4",
  });

  assert.deepEqual(moveSerialized, {
    action: "move_to_city_tip",
    decision_key: "trip-4:item:item-3:move_to_city_tip",
    id: "decision-2",
    note: null,
    payload_json: {
      targetLegId: "leg-vienna",
    },
    subject_id: "item-3",
    subject_type: "item",
    trip_id: "trip-4",
  });
  assert.deepEqual(
    normalizeTripReviewDecisionRow({
      action: "move_to_city_tip",
      created_at: "2026-06-18T13:00:00.000Z",
      decision_key: moveSerialized.decision_key,
      id: "decision-2",
      note: null,
      payload_json: moveSerialized.payload_json,
      subject_id: "item-3",
      subject_type: "item",
      trip_id: "trip-4",
    }),
    {
      action: "move_to_city_tip",
      createdAt: "2026-06-18T13:00:00.000Z",
      id: "decision-2",
      note: null,
      subjectId: "item-3",
      subjectType: "item",
      targetLegId: "leg-vienna",
      tripId: "trip-4",
    }
  );
});

test("generated trip summary uses applied structured records", () => {
  const draft = {
    activities: [
      {
        date: "2026-09-02",
        title: "Museum visit",
      },
      {
        date: null,
        title: "Loose duplicate note",
      },
    ],
    missingDetails: [
      {
        prompt: "Where does the loose note belong?",
        reason: "The traveler app needs placement.",
        relatedTitle: "Loose duplicate note",
      },
    ],
    places: [
      {
        arriveDate: "2026-09-01",
        city: "Paris",
        country: "France",
        leaveDate: "2026-09-03",
      },
    ],
    stays: [],
    transport: [],
    tripOverview: {
      title: "Paris summary",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Fallback trip",
    tripId: "trip-5",
  });
  const duplicate = records.items.find(
    (item) => item.title === "Loose duplicate note"
  );
  const keeper = records.items.find((item) => item.title === "Museum visit");
  const question = records.reviewQuestions[0];

  assert.ok(duplicate);
  assert.ok(keeper);
  assert.ok(question);

  const updated = applyReviewDecisions(records, [
    {
      action: "combine",
      createdAt: "2026-06-18T14:00:00.000Z",
      id: "decision-combine-summary",
      sourceIds: [duplicate.id],
      subjectId: keeper.id,
      subjectType: "item",
      targetId: keeper.id,
      tripId: "trip-5",
    },
    {
      action: "answer_question",
      answerValue: "Combined into Museum visit.",
      createdAt: "2026-06-18T14:01:00.000Z",
      id: "decision-answer-summary",
      resolvedAction: "combine",
      subjectId: question.id,
      subjectType: "review_question",
      tripId: "trip-5",
    },
  ]);
  const summary = createGeneratedTripSummaryView(updated);

  assert.equal(summary.title, "Paris summary");
  assert.equal(summary.counts.activities, 1);
  assert.equal(summary.counts.review, 0);
  assert.equal(summary.isReadyForPublishReview, true);
  assert.equal(summary.dateRange, "September 1-3, 2026");
  assert.equal(
    summary.sections.find((section) => section.id === "legs")?.items[0]?.meta,
    "September 1-3, 2026"
  );
  assert.equal(
    summary.sections.find((section) => section.id === "activities")?.items[0]
      ?.group,
    "Art and culture"
  );
  assert.equal(summary.days.length, 1);
  assert.equal(summary.days[0]?.label, "Day 2 · September 2");
  assert.equal(summary.days[0]?.title, "Paris");
  assert.equal(summary.days[0]?.entries[0]?.title, "Museum visit");
  assert.equal(summary.days[0]?.entries[0]?.detail, undefined);
});

test("published snapshot payload compiles traveler app view model", () => {
  const records = getAsiaDemoStructuredTripRecords();
  const payload = createPublishedTripSnapshotPayload(records);

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.createdFrom, "structured_trip_records");
  assert.equal(payload.travelerApp.trip.id, records.trip.id);
  assert.equal(payload.recordsSummary.cardCount, payload.travelerApp.cards.length);
  assert.equal(payload.recordsSummary.dayCount, payload.travelerApp.days.length);
  assert.equal(payload.recordsSummary.legCount, payload.travelerApp.legs.length);
  assert.equal(
    payload.recordsSummary.privateDetailCount,
    payload.travelerApp.privacy.privateDetailCount
  );
  assert.ok(payload.travelerApp.days.length > 80);
});

test("published snapshot payload redacts protected traveler details", () => {
  const records = getAsiaDemoStructuredTripRecords();
  const privateStay = records.stays.find(
    (stay) => stay.address && stay.addressVisibility !== "public"
  );

  assert.ok(privateStay);

  const payload = createPublishedTripSnapshotPayload(records);
  const redactedLeg = payload.travelerApp.legs.find(
    (leg) => leg.id === privateStay.legId
  );

  assert.equal(redactedLeg?.stayAddress, null);
  assert.equal(
    JSON.stringify(payload).includes(privateStay.address ?? ""),
    false
  );

  const privateDetails = createPublishedPrivateDetails(records);
  assert.ok(
    privateDetails.some((detail) => detail.value === privateStay.address),
    "expected server-only published private details to retain protected value"
  );
});

test("traveler password verification is explicit about missing configuration", () => {
  const passwordHash = hashTravelerPassword("traveler");

  assert.equal(
    verifyTravelerPassword({
      password: "traveler",
      passwordEnabled: true,
      passwordHash,
    }),
    "valid"
  );
  assert.equal(
    verifyTravelerPassword({
      password: "wrong",
      passwordEnabled: true,
      passwordHash,
    }),
    "invalid"
  );
  assert.equal(
    verifyTravelerPassword({
      password: "traveler",
      passwordEnabled: true,
      passwordHash: null,
    }),
    "missing_hash"
  );
  assert.equal(
    verifyTravelerPassword({
      password: "",
      passwordEnabled: false,
      passwordHash: null,
    }),
    "disabled"
  );
});

test("env allowlist parser trims empty values", () => {
  assert.deepEqual(parseOptionalEnvList(null), []);
  assert.deepEqual(parseOptionalEnvList(" trip-1,trip-2, , trip-3 "), [
    "trip-1",
    "trip-2",
    "trip-3",
  ]);
});
