import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function stage(
  label: string,
  activities: Array<Record<string, unknown>>
): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: "sanitized-itinerary.txt",
    stage: {
      activities,
      missingDetails: [],
      places: [{
        arriveDate: "2031-04-01",
        city: "Sample City",
        country: "Example",
        leaveDate: "2031-04-05",
      }],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

function activity({
  date,
  description,
  title,
  ...extra
}: {
  date: string;
  description: string;
  title: string;
} & Record<string, unknown>) {
  return {
    category: "temple_shrine",
    city: "Sample City",
    date,
    description,
    evidenceRole: "atomic_candidate",
    itemType: "activity",
    title,
    ...extra,
  };
}

function timedPeer(title: string, date: string, startTime: string) {
  return activity({
    category: "art_culture",
    date,
    description: `${title} at ${startTime}.`,
    startTime,
    title,
  });
}

export default async function run() {
  await test("identity keeps one same-day venue alias while a next-day component remains distinct", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Wednesday, April 2nd", [
          timedPeer("Old Square", "2031-04-02", "09:00"),
          timedPeer("River Walk", "2031-04-02", "10:00"),
          timedPeer("Lunch", "2031-04-02", "12:00"),
          activity({
            date: "2031-04-02",
            description:
              "Local Basilica is also called Central Basilica in the source.",
            title: "Local Basilica",
          }),
          activity({
            date: "2031-04-02",
            description:
              "Tour Local Basilica, the same Central Basilica venue.",
            title: "Central Basilica",
          }),
        ]),
        stage("Thursday, April 3rd", [
          timedPeer("History Museum", "2031-04-03", "09:00"),
          timedPeer("City Cafe", "2031-04-03", "12:00"),
          timedPeer("Parliament", "2031-04-03", "15:00"),
          activity({
            _canonicalSourceOccurrences: [
              {
                date: "2031-04-03",
                line: 20,
                sequencedDay: false,
                sourceIdentityHash: "sanitized-source",
                stageIndex: 1,
              },
            ],
            date: "2031-04-03",
            description: "Climb the tower for views across the river.",
            title: "Central Basilica Tower",
          }),
          activity({
            _canonicalSourceOccurrences: [
              {
                date: "2031-04-02",
                line: 30,
                sequencedDay: true,
                sourceIdentityHash: "sanitized-source",
                stageIndex: 0,
              },
              {
                date: "2031-04-03",
                line: 21,
                sequencedDay: false,
                sourceIdentityHash: "sanitized-source",
                stageIndex: 1,
              },
            ],
            date: "2031-04-03",
            description: "Climb the tower for views across the river.",
            title: "Central Basilica",
          }),
        ]),
      ],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const venues = draft.activities.filter(
      (item) =>
        item.itemType === "activity" &&
        /basilica/i.test(String(item.title))
    );

    assert.equal(
      venues.filter((item) => item.date === "2031-04-02").length,
      1,
      "localized same-day names have one venue carrier"
    );
    assert.deepEqual(
      venues
        .filter((item) => item.date === "2031-04-03")
        .map((item) => item.title),
      ["Central Basilica Tower"],
      "the component's own title evidence prevents an alias observation from re-dating it"
    );
    assert.equal(result.summary.identityLedger.unresolvedCarrierCount, 0);
    assert.equal(
      result.summary.identityLedger.decisions.every(
        (decision) =>
          decision.usefulFactDigests.length > 0 &&
          decision.usefulFactDigests.every((digest) =>
            decision.acceptedFactDigests.includes(digest)
          )
      ),
      true,
      "every loser observation has a carrier that accepted its useful facts"
    );
  });

  await test("two separately fixed bookings across dates remain two visits", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Wednesday, April 2nd", [
          activity({
            confirmation: "BOOKING-A",
            date: "2031-04-02",
            description: "Booked morning admission.",
            startTime: "09:00",
            title: "Sample Gallery",
          }),
        ]),
        stage("Thursday, April 3rd", [
          activity({
            confirmation: "BOOKING-B",
            date: "2031-04-03",
            description: "Booked return admission.",
            startTime: "14:00",
            title: "Sample Gallery",
          }),
        ]),
      ],
      tripOverview: { dateRange: "April 1-5, 2031" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const visits = draft.activities.filter(
      (item) => item.itemType === "activity" && item.title === "Sample Gallery"
    );

    assert.deepEqual(
      visits.map((item) => item.date).sort(),
      ["2031-04-02", "2031-04-03"]
    );
  });
}
