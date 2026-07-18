import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import { findIdentityProseSignals } from "@/lib/extraction/identity-prose";

// Arc B ground-truth fixture checks from LIVE run 7.18.3 (2026-07-18, trip
// 3cf92459…, docs/assembly-defect-docket-2026-07-18-run6.md). PB-1 privacy
// wave shapes: (a) the rental-car card shipped the traveler's name + home
// address + phone in cleartext because the identity scrub required
// "Customer:" WITH a colon; (b) "Ryanair FR8331 to Prague" survived as a
// Jan 14 activity carrying its confirmation code (no movement word, so the
// shadow gate never saw it); (c) the audit had NO detector for
// identity-shaped values in public prose and the redacted QA bundle made
// the run look clean.

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

const RENTAL_CAR_IDENTITY_PROSE =
  "Pick up car at 9:00 AM. Customer Eli kamerow. 1225 Harvard street nw, 20009 Washington, USA. Phone +1 202 555 0148. Reservation number 12693163. Return the car by Jan 18.";

export default async function run() {
  await test("ground truth run6 (PB-1a, RW-PRI-001): colon-less customer-identity block is scrubbed from rental-car prose; the reservation number stays public", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Thursday, January 17th", emptyStage({
          activities: [
            {
              category: "arrival_departure",
              city: "Prague",
              date: "2019-01-17",
              description: RENTAL_CAR_IDENTITY_PROSE,
              itemType: "activity",
              startTime: "09:00",
              title: "Pick up car at Prague Downtown",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const pickup = draft.activities.find((item) =>
      /pick up car/i.test(String(item.title))
    );

    assert.ok(pickup, "the rental pickup card survives");
    const prose = String(pickup?.description ?? "");
    assert.equal(/kamerow/i.test(prose), false, "no traveler name in prose");
    assert.equal(/harvard/i.test(prose), false, "no home street address in prose");
    assert.equal(/20009/.test(prose), false, "no home postal code in prose");
    assert.equal(/\+1 202/.test(prose), false, "no phone number in prose");
    assert.equal(
      /12693163/.test(prose),
      true,
      "the rental reservation number is public per the CEO ruling and stays"
    );
    assert.equal(
      findIdentityProseSignals(prose).length,
      0,
      "the shared identity predicates agree the scrubbed prose is clean"
    );
  });

  await test("ground truth run6 (PB-1b, RW-ASM-001): 'Ryanair FR8331 to Prague' with no movement word is still suppressed as a transport shadow", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 14th", emptyStage({
          activities: [
            {
              category: "arrival_departure",
              city: "Prague",
              confirmation: "SMLXKB",
              date: "2019-01-14",
              description: "Confirmation code SMLXKB. Departs 6:40 AM from Rome Ciampino.",
              itemType: "activity",
              title: "Ryanair FR8331 to Prague",
            },
            {
              category: "sightseeing",
              city: "Prague",
              date: "2019-01-14",
              description: "Walk across Charles Bridge in the evening.",
              itemType: "activity",
              title: "Charles Bridge",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
          ],
          transport: [
            {
              arrival: "Prague",
              arrivalTime: "08:30",
              confirmation: "SMLXKB",
              date: "2019-01-14",
              departure: "Rome",
              departureTime: "06:40",
              number: "FR8331",
              provider: "Ryanair",
              title: "Rome to Prague",
              type: "flight",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.activities.some((item) => /fr ?8331/i.test(String(item.title))),
      false,
      "the FR8331 duplicate activity is suppressed by the transport row"
    );
    const allProse = draft.activities
      .map((item) => `${item.title} ${item.description ?? ""}`)
      .join(" ");
    assert.equal(
      /SMLXKB/i.test(allProse),
      false,
      "the travel confirmation code never ships in public activity prose"
    );
    assert.equal(
      draft.activities.some((item) => /charles bridge/i.test(String(item.title))),
      true,
      "the real same-day activity is untouched"
    );
  });

  await test("ground truth run6 (PB-1b fallback, RW-PRI-001): a surviving transport-shaped activity still loses its travel confirmation from prose and fields", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 14th", emptyStage({
          activities: [
            {
              category: "arrival_departure",
              city: "Prague",
              confirmation: "QRZ7714",
              date: "2019-01-14",
              description:
                "Confirmation code QRZ7714. Meet the driver outside arrivals at 6:40 AM.",
              itemType: "activity",
              title: "Ryanair FR8331 to Prague",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const shadow = draft.activities.find((item) =>
      /fr ?8331/i.test(String(item.title))
    );

    if (shadow) {
      assert.equal(/QRZ7714/i.test(String(shadow.description ?? "")), false);
      assert.equal(shadow.confirmation ?? null, null);
    } else {
      // Suppression is an acceptable stronger outcome: the confirmation is
      // gone from public output either way.
      const allProse = draft.activities
        .map((item) => `${item.title} ${item.description ?? ""}`)
        .join(" ");
      assert.equal(/QRZ7714/i.test(allProse), false);
    }
  });

  await test("ground truth run6 (PB-1c, RW-AUD-001): the identity-leak P0 detector fires on unredacted public prose and stays quiet on clean records", () => {
    const records = createStructuredTripRecordsFromDraft({
      draft: {
        activities: [
          {
            category: "sightseeing",
            date: "2019-01-15",
            description: "Walk up Petrin Hill in the afternoon.",
            itemType: "activity",
            title: "Petrin Hill",
          },
        ],
        missingDetails: [],
        places: [
          { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
        ],
        sensitiveDetails: [],
        stays: [],
        transport: [],
        tripOverview: { dateRange: "January 12-25, 2019", title: "Central Europe" },
      },
      fallbackTripName: "Central Europe",
      tripId: "run6-identity-leak",
    });

    const cleanDiagnostics = createAuditDiagnostics({ lineage: [], records });
    assert.equal(
      cleanDiagnostics.some(
        (diagnostic) => diagnostic.code === "identity_value_in_public_prose"
      ),
      false,
      "clean prose raises nothing (known-good control)"
    );

    // Simulate a future scrub failure: the leak the detector exists for.
    const leaked = {
      ...records,
      items: records.items.map((item, index) =>
        index === 0
          ? {
              ...item,
              description:
                "Customer Eli kamerow. 1225 Harvard street nw, 20009 Washington, USA. Phone +1 202 555 0148.",
            }
          : item
      ),
    };
    const diagnostics = createAuditDiagnostics({ lineage: [], records: leaked });
    const identityLeak = diagnostics.find(
      (diagnostic) => diagnostic.code === "identity_value_in_public_prose"
    );

    assert.ok(identityLeak, "identity-shaped prose raises the new P0");
    assert.equal(identityLeak?.severity, "p0");
    assert.equal(
      /kamerow|harvard|202 555/i.test(identityLeak?.evidence.join(" ") ?? ""),
      false,
      "detector evidence names the signal shapes, never the identity values"
    );
    assert.equal(
      /role_labelled_name|street_address|phone/.test(
        identityLeak?.evidence.join(" ") ?? ""
      ),
      true,
      "detector evidence carries the matched signal names"
    );
  });

  await test("ground truth run6 (PB-4, RW-CLS-001): the Jan-21 recommendation dump stays city notes — no dated activity cards", () => {
    const JAN21_HEADING = "Monday, January 21st Train to Budapest // Budapest Bathing";
    const listCard = (title: string, category: string, description: string) => ({
      category,
      city: "Budapest",
      date: "2019-01-21",
      description,
      itemType: "activity",
      sourceHeadingPath: [JAN21_HEADING],
      sourceSectionLabel: JAN21_HEADING,
      title,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Monday, January 21st", emptyStage({
          activities: [
            listCard("Great Synagogue/ Jewish History", "art_culture", "Great Synagogue and Jewish history."),
            listCard("Hear gypsy music", "social", "Find a space to go hear gypsy music."),
            listCard("Konyv Bar", "food_dining", "Konyv Bar and drink Tokaji."),
            listCard("Mazel Tov restaurant", "food_dining", "Mazel Tov restaurant."),
            listCard("Oldest pastry shop", "food_dining", "Oldest pastry shop (Ruszwerm - roosworm) - serve lots of strudel."),
            listCard("Wine Cellar in the Hilton", "food_dining", "Wine Cellar in the Hilton."),
            listCard("Pinball Museum", "nightlife_entertainment", "Pinball Museum."),
            listCard("Popped up statue", "art_culture", "Popped up statue."),
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const promoted = draft.activities.filter((item) =>
      /synagogue|gypsy|konyv|mazel|pastry|wine cellar|pinball|popped/i.test(
        String(item.title)
      )
    );
    assert.equal(
      promoted.length,
      0,
      `idea-list entries never ship as dated cards (got ${promoted
        .map((item) => item.title)
        .join(", ")})`
    );
  });

  await test("ground truth run6 (PB-2, RW-CAN-001): a site and its 'X at site' component never merge — the palace survives", () => {
    const VIENNA_HEADING = "Friday, January 18th // Explore Vienna / Schonbrunn Palace";
    const sharedDescription =
      "Visit Schonbrunn Palace and the gardens, see the Palm House and the Gloriette on the grounds.";
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Saturday, January 19th", emptyStage({
          activities: [
            {
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: sharedDescription,
              itemType: "activity",
              sourceHeadingPath: [VIENNA_HEADING],
              sourceSectionLabel: VIENNA_HEADING,
              title: "Schonbrunn Palace visit",
            },
            {
              category: "art_culture",
              city: "Vienna",
              date: "2019-01-19",
              description: sharedDescription,
              itemType: "activity",
              sourceHeadingPath: [VIENNA_HEADING],
              sourceSectionLabel: VIENNA_HEADING,
              title: "Palm house at Schonbrunn",
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
    const palace = draft.activities.find((item) =>
      /schonbrunn palace/i.test(String(item.title))
    );
    assert.ok(
      palace,
      "the near-identical collapse refuses the site↔component pair; the palace card survives"
    );
  });

  await test("ground truth run6 (PB-7, RW-CAN-001): sequence-inherited repeat copies fold — no second Pinball card from dates alone", () => {
    const timedCard = (title: string, date: string, startTime: string) => ({
      category: "art_culture",
      city: "Budapest",
      date,
      description: `${title} at ${startTime}.`,
      itemType: "activity",
      startTime,
      title,
    });
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Tuesday, January 22nd", emptyStage({
          activities: [
            timedCard("Fisherman's Bastion", "2019-01-22", "09:00"),
            timedCard("Matthias Church", "2019-01-22", "09:45"),
            timedCard("Chain Bridge", "2019-01-22", "11:00"),
            {
              category: "nightlife_entertainment",
              city: "Budapest",
              date: "2019-01-22",
              description: "Pinball Museum.",
              itemType: "activity",
              title: "Pinball Museum",
            },
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
        stage("Wednesday, January 23rd", emptyStage({
          activities: [
            timedCard("House of Terror", "2019-01-23", "10:00"),
            timedCard("New York Cafe", "2019-01-23", "13:00"),
            timedCard("Parliament", "2019-01-23", "15:00"),
            {
              category: "nightlife_entertainment",
              city: "Budapest",
              date: "2019-01-23",
              description: "Pinball Museum.",
              itemType: "activity",
              title: "Pinball Museum",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const pinball = draft.activities.filter((item) =>
      /pinball/i.test(String(item.title))
    );
    assert.equal(
      pinball.length,
      1,
      "sequence-inheritance plus distinct dates is dates alone: one card, not two"
    );
  });

  await test("ground truth run6 (RW-CLS-001): 'if you want' is a hedge — Buda hills loop demotes without a question", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Wednesday, January 23rd", emptyStage({
          activities: [
            {
              category: "outdoor_adventure",
              city: "Budapest",
              date: "2019-01-23",
              description:
                "If you want to get out of the city, ride the children's train loop in the Buda hills.",
              itemType: "activity",
              title: "Buda hills loop",
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
    assert.equal(
      draft.activities.some((item) => /buda hills/i.test(String(item.title))),
      false,
      "the 'if you want' hedge demotes the loop to city notes silently"
    );
  });
}
