import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import type {
  StructuredTripRecords,
  TripStayRecord,
  TripTransportRecord,
} from "@/lib/generated-trip-model";

// Arc F identity output gate — live-run 7.23.2 shapes (docket chains 1-3,
// fixture assertions 1 and 3). Nothing here is invented: the email-titled
// card, the two uncaptured ticket codes, and the garbled "Operator"
// confirmation label are quoted from the run's QA bundle
// (docs/assembly-defect-docket-2026-07-24-run-7.23.2.md).

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

function stage(label: string, value: Record<string, unknown>): EvidenceStageInput {
  return { label, source: "model_chunk", stage: value };
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
  transport: Array<Record<string, unknown>>;
};

export default async function run() {
  test("chain 1: an email-titled card is suppressed whole with an auditable disposition, no question, no husk", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Thursday, January 17th",
          emptyStage({
            activities: [
              {
                city: "Kutna Hora",
                date: "2019-01-17",
                description: "Rental voucher contact.",
                itemType: "admin",
                sourceSectionLabel: "Thursday, January 17th",
                // The live 7.23.2 shape verbatim: records.items[66] was an
                // activity card TITLED the rental-voucher contact email.
                title: "Eli.kamerow@fiscalnote.com",
              },
              {
                city: "Kutna Hora",
                date: "2019-01-17",
                description: "Gothic church on the hill above the ossuary.",
                itemType: "activity",
                sourceSectionLabel: "Thursday, January 17th",
                title: "Church of St Barbara",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.activities.some((item) =>
        /@/.test(`${item.title ?? ""}`)
      ),
      false,
      "no public card ships with an email-shaped title"
    );
    assert.equal(
      draft.activities.some((item) =>
        /st barbara/i.test(`${item.title ?? ""}`)
      ),
      true,
      "the real sight on the same day still ships"
    );
    // No scrubbed husk: the record is gone, not blanked.
    assert.equal(
      draft.activities.some(
        (item) => !item.title && /rental voucher/i.test(`${item.description ?? ""}`)
      ),
      false,
      "the suppressed card does not survive as a title-less husk"
    );
    // The suppression is auditable: the piece exists, is output-ineligible,
    // and carries the gate's reason.
    const suppressed = result.pieces.find((piece) =>
      piece.actions.some((action) =>
        /identity-shaped value \(email\) in public title/.test(action.reason)
      )
    );
    assert.ok(suppressed, "the gate records an auditable suppression action");
    assert.equal(suppressed?.outputEligible, false);
    // No maker review item is minted for the suppression (CEO decision 2).
    const details = (result.draft as Draft).missingDetails ?? [];
    assert.equal(
      details.some((detail) =>
        /eli\.kamerow|identity/i.test(
          `${detail.prompt ?? ""} ${detail.evidence ?? ""}`
        )
      ),
      false,
      "no maker question or call references the suppressed identity card"
    );
  });

  test("chain 3: uncaptured ticket codes are swept from transport prose by shape, with an empty deny list", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Friday, January 18th",
          emptyStage({
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Prague",
                country: "Czech Republic",
                leaveDate: "2019-01-18",
              },
              {
                arriveDate: "2019-01-18",
                city: "Vienna",
                country: "Austria",
                leaveDate: "2019-01-21",
              },
            ],
            transport: [
              {
                arrival: "Vienna",
                arrivalTime: "13:23",
                date: "2019-01-18",
                departure: "Prague",
                departureTime: "09:20",
                // The RegioJet code the parser captured NOWHERE protected —
                // deny list empty for it, prose still must come out clean.
                description:
                  "RegioJet RJ 1033 via Brno. travel code 0468406277. Seats 61-62.",
                provider: "RegioJet",
                title: "Prague to Vienna",
                type: "train",
              },
              {
                arrival: "Budapest",
                arrivalTime: "13:19",
                // The garbled label the live run shipped instead of the
                // real locator VXFHXKCQEPHPUSNT (never captured).
                confirmation: "Operator",
                date: "2019-01-21",
                departure: "Vienna",
                departureTime: "10:42",
                description:
                  "OBB Railjet. ticket code 2159 1990 1842 0436. Zugbindung applies on 21.1.2019.",
                provider: "OBB",
                title: "Vienna to Budapest",
                type: "train",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const transportProse = draft.transport
      .map((row) => `${row.description ?? ""}`)
      .join(" ");

    assert.equal(draft.transport.length, 2, "both real rows keep shipping");
    assert.equal(
      /0468406277|2159\s*1990\s*1842\s*0436/.test(transportProse),
      false,
      "neither GT-protected code ships in transport prose"
    );
    assert.equal(
      /travel code|ticket code/i.test(transportProse),
      false,
      "dangling code labels are tidied away with their tokens"
    );
    // Exemptions hold: itinerary content survives the code-shape pass.
    assert.match(transportProse, /RJ 1033/, "train number survives");
    assert.match(transportProse, /via Brno/, "route prose survives");
    assert.match(transportProse, /21\.1\.2019/, "date shapes survive");
    const regiojet = draft.transport.find((row) =>
      /RegioJet/i.test(`${row.description ?? ""} ${row.provider ?? ""}`)
    );
    assert.ok(regiojet, "the RegioJet row itself is never suppressed");
  });

  test("detector parity: identity and code-shape P0s now see stays and transport", () => {
    const stay: TripStayRecord = {
      accessDetailsVisibility: "traveler_password",
      address: null,
      addressVisibility: "traveler_password",
      bookingUrl: null,
      canonicalId: "canonical-stay-leak",
      checkInDate: "2019-01-14",
      checkInTime: null,
      checkOutDate: "2019-01-18",
      checkOutTime: null,
      confirmationLabel: null,
      confirmationVisibility: "traveler_password",
      id: "stay-leak",
      latitude: null,
      legId: null,
      longitude: null,
      // A predicate-visible identity value in a stay's public name — the
      // record kind the old detector never scanned (chain 2 hole c).
      name: "Booking contact Eli.kamerow@fiscalnote.com",
      privateDetailIds: [],
      publicLocationLabel: null,
      reviewRequired: false,
      sourceConfidence: "high",
      status: "confirmed",
      stayType: "hostel",
      tripId: "trip-gate",
    };
    const transport: TripTransportRecord = {
      arrivalLocation: "Budapest",
      arrivalTime: "13:19",
      bookingUrl: null,
      bookingUrlVisibility: "public",
      canonicalId: "canonical-transport-leak",
      confirmationLabel: "VXFHXKCQEPHPUSNT",
      confirmationVisibility: "traveler_password",
      date: "2019-01-21",
      departureLocation: "Vienna",
      departureTime: "10:42",
      description: "ticket code 2159 1990 1842 0436",
      fromLegId: null,
      id: "transport-leak",
      legId: null,
      privateDetailIds: [],
      provider: "OBB",
      reviewRequired: false,
      routeLabel: "Vienna to Budapest",
      sourceConfidence: "high",
      status: "confirmed",
      toLegId: null,
      transportType: "train",
      tripId: "trip-gate",
    };
    const records: StructuredTripRecords = {
      categories: [],
      days: [],
      items: [],
      legs: [],
      photos: [],
      phrases: [],
      privateDetails: [],
      reviewQuestions: [],
      stays: [stay],
      transport: [transport],
      trip: {
        destinationSummary: null,
        endDate: null,
        id: "trip-gate",
        name: "Gate parity",
        startDate: null,
        travelerAppTitle: "Gate parity",
      },
      weatherHooks: [],
    };

    const diagnostics = createAuditDiagnostics({ lineage: [], records });
    const identity = diagnostics.find(
      (diagnostic) => diagnostic.code === "identity_value_in_public_prose"
    );
    assert.ok(identity, "stay-name identity leak raises the P0");
    assert.match(identity?.evidence.join(" ") ?? "", /stay /);
    const codeShape = diagnostics.find(
      (diagnostic) => diagnostic.code === "protected_code_shape_in_public_prose"
    );
    assert.ok(codeShape, "transport code-shape leak raises the P0");
    assert.equal(
      /2159/.test(codeShape?.evidence.join(" ") ?? ""),
      false,
      "the diagnostic never quotes the token value (redaction-safe)"
    );

    // Known-good control (RW-AUD-001 metamorphic discipline): clean rows
    // raise neither privacy P0.
    const cleanDiagnostics = createAuditDiagnostics({
      lineage: [],
      records: {
        ...records,
        stays: [{ ...stay, name: "Vitae Hostel" }],
        transport: [
          {
            ...transport,
            description: "Railjet via Bratislava, seats 61-62.",
          },
        ],
      },
    });
    assert.equal(
      cleanDiagnostics.some(
        (diagnostic) =>
          diagnostic.code === "identity_value_in_public_prose" ||
          diagnostic.code === "protected_code_shape_in_public_prose"
      ),
      false
    );
  });
}
