import assert from "node:assert/strict";
import {
  createAssemblySemanticFingerprint,
  diffAssemblySemanticFingerprints,
} from "@/lib/extraction/assembly-semantic-fingerprint";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function records(ids: { child: string; parent: string; question: string }) {
  return {
    items: [
      {
        id: ids.parent,
        canonicalId: "generated-parent",
        itemType: "activity",
        date: "2030-04-12",
        description: "Visit the estate.",
        parentItemId: null,
        sortOrder: 10,
        status: "draft",
        title: "Sample Estate",
      },
      {
        id: ids.child,
        canonicalId: "generated-child",
        itemType: "activity",
        date: "2030-04-12",
        description: null,
        parentItemId: ids.parent,
        sortOrder: 11,
        status: "draft",
        title: "Garden stop",
      },
      {
        id: "note-generated",
        canonicalId: "note-canonical-generated",
        itemType: "note",
        date: null,
        description: "Museum idea. Wi-Fi password [redacted].",
        parentItemId: null,
        sortOrder: 20,
        status: "draft",
        title: "Sample City Notes",
      },
    ],
    legs: [{ status: "draft" }],
    reviewQuestions: [
      {
        id: ids.question,
        answerOptions: [
          { label: "Option A", value: "a" },
          { label: "Option B", value: "b" },
        ],
        answerType: "single_choice",
        decisionAnchor: {
          date: "2030-04-12",
          legKey: "sample-city",
          normalizedTitle: "sample estate ticket",
          sourceAnchorRef: null,
          subjectType: "review_question",
          version: 1,
        },
        evidence: "The source leaves the ticket open.",
        prompt: "Which ticket should be used?",
        reason: "The source asks the traveler to decide.",
        status: "open",
        subjectType: "item",
        targetField: "ticket",
      },
    ],
    stays: [{ status: "draft" }],
    transport: [{ status: "draft" }],
  } as unknown as StructuredTripRecords;
}

const legacy = {
  activeNotes: [
    "sample-city||Sample City Notes|sights|Sample City|Museum idea. Wi-Fi password [redacted].|draft",
  ],
  groupedStops: [
    "generated-parent|11|2030-04-12|garden stop|||sights|||draft",
  ],
};

export default function run() {
  test("semantic fingerprint ignores generated ids and record order", () => {
    const leftRecords = records({ child: "child-1", parent: "parent-1", question: "q-1" });
    const rightRecords = records({ child: "child-99", parent: "parent-99", question: "q-99" });
    rightRecords.items.reverse();
    const left = createAssemblySemanticFingerprint({ legacyFingerprints: legacy, records: leftRecords });
    const right = createAssemblySemanticFingerprint({ legacyFingerprints: legacy, records: rightRecords });
    assert.equal(diffAssemblySemanticFingerprints(left, right).equal, true);
  });

  test("semantic fingerprint changes for parent, review, note, and privacy semantics", () => {
    const baseRecords = records({ child: "child-1", parent: "parent-1", question: "q-1" });
    const base = createAssemblySemanticFingerprint({ legacyFingerprints: legacy, records: baseRecords });
    const changedRecords = records({ child: "child-1", parent: "parent-1", question: "q-1" });
    changedRecords.items[1]!.parentItemId = null;
    changedRecords.reviewQuestions[0]!.status = "dismissed";
    const changed = createAssemblySemanticFingerprint({
      legacyFingerprints: { ...legacy, activeNotes: [legacy.activeNotes[0]!.replace("Museum idea", "Different idea")] },
      records: changedRecords,
    });
    const difference = diffAssemblySemanticFingerprints(base, changed);
    assert.equal(difference.equal, false);
    assert.deepEqual(
      difference.sections.map((section) => section.section).sort(),
      ["cityNotes", "items", "review", "spine"]
    );
    assert.equal(base.sections.spine.publicProtectedValueCount, 1);
  });

  test("historical comparison omits unavailable answer options explicitly", () => {
    const leftRecords = records({ child: "child-1", parent: "parent-1", question: "q-1" });
    const rightRecords = records({ child: "child-1", parent: "parent-1", question: "q-1" });
    rightRecords.reviewQuestions[0]!.answerOptions = [{ label: "Different", value: "different" }];
    const left = createAssemblySemanticFingerprint({ legacyFingerprints: legacy, records: leftRecords, reviewAnswerOptionsAvailable: false });
    const right = createAssemblySemanticFingerprint({ legacyFingerprints: legacy, records: rightRecords, reviewAnswerOptionsAvailable: false });
    assert.equal(diffAssemblySemanticFingerprints(left, right).equal, true);
    assert.equal(left.fieldAvailability.reviewAnswerOptions, false);
  });
}
