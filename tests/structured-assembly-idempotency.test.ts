import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { createTripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";
import { createCentralEuropeFirstHalfDraft } from "@/tests/fixtures/central-europe-extraction-qa";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function cloneDraft<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export default function run() {
  test("structured assembly fingerprint is stable across recomputation and trip ids", () => {
    const draft = createCentralEuropeFirstHalfDraft();
    const firstRecords = createStructuredTripRecordsFromDraft({
      draft: cloneDraft(draft),
      fallbackTripName: "Central Europe",
      tripId: "assembly-idempotency-a",
    });
    const secondRecords = createStructuredTripRecordsFromDraft({
      draft: cloneDraft(draft),
      fallbackTripName: "Central Europe",
      tripId: "assembly-idempotency-b",
    });
    const first = createTripExtractionFingerprints(firstRecords);
    const second = createTripExtractionFingerprints(secondRecords);

    assert.equal(first.hash, second.hash);
    assert.deepEqual(first.sectionHashes, second.sectionHashes);
    assert.deepEqual(first.counts, second.counts);
    assert.equal(first.counts.transport, 5);
    assert.equal(first.counts.openQuestions, 1);
  });

  test("structured assembly fingerprint changes when traveler-visible transport changes", () => {
    const draft = createCentralEuropeFirstHalfDraft();
    const changedDraft = cloneDraft(draft);
    const train = changedDraft.transport.find(
      (item) => item.title === "Train to Vienna"
    );

    assert.ok(train, "expected Train to Vienna in fixture");
    (train as { departureTime: string | null }).departureTime = "10:20";

    const original = createTripExtractionFingerprints(
      createStructuredTripRecordsFromDraft({
        draft,
        fallbackTripName: "Central Europe",
        tripId: "assembly-fingerprint-original",
      })
    );
    const changed = createTripExtractionFingerprints(
      createStructuredTripRecordsFromDraft({
        draft: changedDraft,
        fallbackTripName: "Central Europe",
        tripId: "assembly-fingerprint-changed",
      })
    );

    assert.notEqual(original.hash, changed.hash);
    assert.notEqual(
      original.sectionHashes.transport,
      changed.sectionHashes.transport
    );
    assert.equal(original.sectionHashes.activeActivities, changed.sectionHashes.activeActivities);
  });

  test("central europe P0 anchors stay visible without source-obvious review questions", () => {
    const records = createStructuredTripRecordsFromDraft({
      draft: createCentralEuropeFirstHalfDraft(),
      fallbackTripName: "Central Europe",
      tripId: "central-europe-p0-anchors",
    });
    const viennaTrains = records.transport.filter(
      (transport) =>
        transport.date === "2019-01-18" &&
        transport.transportType === "train" &&
        /vienna/i.test(transport.routeLabel)
    );
    const uMaliru = records.items.find((item) => /u maliru/i.test(item.title));

    assert.equal(viennaTrains.length, 1);
    assert.equal(viennaTrains[0]?.departureTime, "09:20");
    assert.equal(uMaliru?.startTime, "13:00");
    assert.equal(
      records.reviewQuestions.some(
        (question) =>
          question.status === "open" &&
          /train to vienna|u maliru/i.test(question.prompt)
      ),
      false
    );
  });
}
