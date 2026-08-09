import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  applySourceFactAssemblyAuthorityV1,
  isSourceFactAssemblyAuthorityEnabled,
  recoverMissingSourceFactCityNoteMembersV1,
  recoverMissingSourceFactCompositePlanMembersV1,
  recoverMissingSourceFactRelationshipMembersV1,
} from "@/lib/extraction/source-fact-assembly-authority";
import {
  buildSourceDocumentIndexV1,
  stableJsonStringify,
} from "@/lib/extraction/source-document-index";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";
import {
  HETEROGENEOUS_ASSEMBLY_FIXTURES,
  evidenceStageForFixture,
} from "@/tests/fixtures/assembly-decision-heterogeneous";

function buildFixture(name: (typeof HETEROGENEOUS_ASSEMBLY_FIXTURES)[number]["name"]) {
  const fixture = HETEROGENEOUS_ASSEMBLY_FIXTURES.find(
    (candidate) => candidate.name === name
  )!;
  const index = buildSourceDocumentIndexV1([
    {
      filename: fixture.filename,
      sourceProvenance: "sanitized_test",
      sourceUploadId: fixture.sourceUploadId,
      text: fixture.text,
      type: "text",
    },
  ]);
  const stage = evidenceStageForFixture(
    fixture,
    index.spans.map((span) => span.spanId)
  );
  const directLedger = buildSourceFactLedgerV1({ index, stages: [stage] });
  const authority = applySourceFactAssemblyAuthorityV1({
    index,
    stages: [stage],
  });
  const clustered = clusterExtractedEvidence({
    groupingDecisions: authority.groupingDecisions,
    sourceTransportAnchors: [],
    stages: authority.stages,
    tripOverview: fixture.tripOverview,
  });
  return { authority, clustered, directLedger, fixture };
}

function visibleTitles(value: ReturnType<typeof buildFixture>) {
  const draft = value.clustered.draft as {
    activities: Array<{
      _canonicalNoteSections?: Array<{ entries?: unknown }>;
      itemType?: unknown;
      title?: unknown;
    }>;
  };
  return {
    activities: draft.activities
      .filter((activity) => activity.itemType !== "note")
      .map((activity) => activity.title)
      .filter((title): title is string => typeof title === "string"),
    cityNotes: draft.activities
      .filter((activity) => activity.itemType === "note")
      .flatMap((activity) => activity._canonicalNoteSections ?? [])
      .flatMap((section) =>
        Array.isArray(section.entries) ? section.entries : []
      )
      .filter((entry): entry is string => typeof entry === "string"),
  };
}

function sourceRoleDecisionFor({
  activity,
  label = "sanitized source",
  text,
}: {
  activity: Record<string, unknown>;
  label?: string;
  text: string;
}) {
  const sourceUploadId = "source-authority-rule-test";
  const index = buildSourceDocumentIndexV1([
    {
      filename: "source-authority-rule-test.txt",
      sourceProvenance: "sanitized_test",
      sourceUploadId,
      text,
      type: "text",
    },
  ]);
  const authority = applySourceFactAssemblyAuthorityV1({
    index,
    stages: [
      {
        label,
        source: "model_chunk",
        sourceSpanIds: index.spans.map((span) => span.spanId),
        sourceText: text,
        sourceUploadId,
        stage: { activities: [activity] },
      },
    ],
  });
  const stage = authority.stages[0].stage as {
    activities?: Array<Record<string, unknown>>;
  };
  const record = stage.activities?.[0] ?? {};
  return {
    canonical: record._canonicalRoleDecision ?? null,
    source: record._sourceFactAuthorityDecision ?? null,
  };
}

export default function run() {
  assert.equal(isSourceFactAssemblyAuthorityEnabled({}), false);
  assert.equal(
    isSourceFactAssemblyAuthorityEnabled({
      SOURCE_FACT_ASSEMBLY_AUTHORITY: "0",
    }),
    false
  );
  assert.equal(
    isSourceFactAssemblyAuthorityEnabled({
      SOURCE_FACT_ASSEMBLY_AUTHORITY: "1",
    }),
    true
  );
  const authoritySource = fs.readFileSync(
    path.join(
      process.cwd(),
      "lib/extraction/source-fact-assembly-authority.ts"
    ),
    "utf8"
  );
  assert.doesNotMatch(authoritySource, /createOpenAIStructuredResponse|\bfetch\s*\(/);
  assert.doesNotMatch(authoritySource, /resolveCanonicalEvidenceStages\s*\(/);

  const recommendation = buildFixture("recommendation_heavy");
    const recommendationTitles = visibleTitles(recommendation);
    assert.ok(recommendationTitles.cityNotes.includes("Design Museum"));
    assert.ok(recommendationTitles.activities.includes("Design Tour"));
    assert.equal(
      recommendation.authority.metrics.unresolvedBehaviorCandidateCount,
      0,
      "every behavior-bearing recommendation fixture candidate must resolve from source facts"
    );

    const spreadsheet = buildFixture("spreadsheet_like");
    assert.deepEqual(
      visibleTitles(spreadsheet).activities.filter(
        (title) => title === "Gallery Row"
      ),
      ["Gallery Row", "Gallery Row"],
      "same title on separate dates must remain two committed visits"
    );

    const freeform = buildFixture("freeform");
    assert.ok(
      visibleTitles(freeform).cityNotes.includes("Old Observatory"),
      "a source hedge must remain a city note"
    );
    assert.equal(freeform.authority.groupingDecisions.length, 1);
    assert.equal(freeform.authority.groupingDecisions[0].source, "source_fact");
    assert.equal(
      freeform.authority.groupingDecisions[0].callRequired,
      false,
      "a source-authored route is silent review, not a system grouping Call"
    );

    const booking = buildFixture("booking_heavy");
    const bookingFactPayloadText = booking.authority.sourceLedger.factSet.facts
      .map((fact) => JSON.stringify(fact.payload))
      .join("\n");
    assert.doesNotMatch(
      bookingFactPayloadText,
      /ZX91-QP77|4412|Door code/i,
      "source fact payloads may not persist booking or access secrets"
    );

    assert.equal(
      sourceRoleDecisionFor({
        activity: {
          date: "2019-01-14",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Monday, January 14th",
          sourceSectionType: "dated_itinerary",
          title: "Museum Example",
        },
        text: "Monday, January 14th\nMaybe Museum Example",
      }).canonical,
      "city_note",
      "the shortest source occurrence may demote an explicitly uncertain item"
    );

    assert.notEqual(
      sourceRoleDecisionFor({
        activity: {
          date: "2019-01-14",
          evidence: "Museum Example",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Monday, January 14th",
          sourceSectionType: "dated_itinerary",
          title: "Museum Example",
        },
        text:
          "Monday, January 14th\nMuseum Example\nMaybe Museum Example if time",
      }).canonical,
      "city_note",
      "a separate recommendation occurrence cannot poison an exact planned occurrence"
    );

    assert.equal(
      sourceRoleDecisionFor({
        activity: {
          date: null,
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionType: "unknown",
          title: "Cafe Choice or Bistro Choice",
        },
        label: "source recovery",
        text:
          "Wednesday, January 23rd\nFood recommendations:\nCafe Choice or Bistro Choice",
      }).canonical,
      "city_note",
      "an undated recovery duplicate in a local recommendation block routes to notes"
    );

    assert.equal(
      sourceRoleDecisionFor({
        activity: {
          date: null,
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionType: "unknown",
          title: "Cafe Example",
        },
        label: "source recovery",
        text:
          "Wednesday, January 23rd\nWe recommend Cafe Example\n\nCafe Example",
      }).canonical,
      "city_note",
      "an explicit recommendation verb is source authority without changing the legacy resolver vocabulary"
    );

    assert.notEqual(
      sourceRoleDecisionFor({
        activity: {
          date: null,
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionType: "unknown",
          title: "Walk to Museum Example",
        },
        label: "source recovery",
        text:
          "Wednesday, January 23rd\nWalk to Museum Example\nIndependent plan\nIndependent plan\nIndependent plan\nFood recommendations:",
      }).canonical,
      "city_note",
      "a later recommendation header cannot retype an earlier recovery plan"
    );

    assert.equal(
      sourceRoleDecisionFor({
        activity: {
          category: "food_dining",
          city: "Example City",
          date: "2019-01-22",
          description: "Have lunch at Bistro One or Cafe Two.",
          evidence: "Have lunch at Bistro One or Cafe Two.",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Tuesday, January 22nd",
          sourceSectionType: "dated_itinerary",
          title: "Lunch at Bistro One or Cafe Two",
        },
        text: [
          "Tuesday, January 22nd",
          "Food recommendations:",
          "Have lunch at Bistro One or Cafe Two.",
        ].join("\n"),
      }).canonical,
      "city_note",
      "a source-backed unselected meal choice in a recommendation block is a City Note, not a settled Activity"
    );

    {
      const sourceUploadId = "source-exact-note-identity";
      const text = "Vienna\nMuseum of Illusions";
      const index = buildSourceDocumentIndexV1([
        {
          filename: "source-exact-note-identity.txt",
          sourceProvenance: "sanitized_test",
          sourceUploadId,
          text,
          type: "text",
        },
      ]);
      const authority = applySourceFactAssemblyAuthorityV1({
        index,
        stages: [
          {
            label: "Vienna",
            source: "model_chunk",
            sourceSpanIds: index.spans.map((span) => span.spanId),
            sourceText: text,
            sourceUploadId,
            stage: {
              activities: [
                {
                  city: "Vienna",
                  date: null,
                  evidence: "Museum of Illusions",
                  evidenceRole: "city_note_candidate",
                  itemType: "note",
                  sourceSectionLabel: "Vienna",
                  sourceSectionType: "city_reference",
                  title: "Vienna museum note",
                },
              ],
            },
          },
        ],
      });
      const record = (
        authority.stages[0].stage as {
          activities: Array<Record<string, unknown>>;
        }
      ).activities[0];
      assert.equal(record.title, "Museum of Illusions");
      assert.equal(record._canonicalRoleDecision, "city_note");
    }

    {
      const sourceUploadId = "source-city-note-recovery";
      const text = [
        "Wednesday, January 16th",
        "Explore Example City",
        "Popular spots for beer are Known Bar, Missing Cafe, and Third Tavern.",
        "Customer: Private Person",
        "Address: 123 Private Street",
        "Food recommendations from a friend:",
        "Old Town: Bistro One or Bistro Two",
        "River District: Cafe Three",
        "Walk to the station, turn left, and take the tram.",
      ].join("\n");
      const material = {
        filename: "source-city-note-recovery.txt",
        sourceProvenance: "sanitized_test",
        sourceUploadId,
        text,
        type: "text",
      };
      const index = buildSourceDocumentIndexV1([material]);
      const stages = [
        {
          label: "Wednesday, January 16th",
          source: "model_chunk" as const,
          sourceFilename: material.filename,
          sourceProvenance: material.sourceProvenance,
          sourceSpanIds: index.spans.map((span) => span.spanId),
          sourceText: text,
          sourceUploadId,
          stage: {
            activities: [
              {
                category: "food_dining",
                city: "Example City",
                date: null,
                evidence: "Known Bar",
                evidenceRole: "city_note_candidate",
                itemType: "note",
                title: "Known Bar",
              },
            ],
          },
        },
      ];
      const recovered = recoverMissingSourceFactCityNoteMembersV1({
        index,
        materials: [material],
        stages,
      });
      const recoveredActivities = (
        recovered.stages[0].stage as {
          activities: Array<Record<string, unknown>>;
        }
      ).activities.filter(
        (activity) => activity._sourceFactCityNoteRecovery === true
      );
      assert.deepEqual(
        recoveredActivities.map((activity) => activity.title),
        [
          "Missing Cafe",
          "Third Tavern",
          "Bistro One",
          "Bistro Two",
          "Cafe Three",
        ],
        "explicit named recommendation lists recover only missing atomic City Note facts"
      );
      assert.equal(
        recoveredActivities.every(
          (activity) =>
            activity.itemType === "note" &&
            activity.evidenceRole === "city_note_candidate" &&
            activity.city === "Example City"
        ),
        true
      );
      assert.doesNotMatch(
        JSON.stringify(recoveredActivities),
        /Private Person|Private Street|Walk to the station/,
        "contact details, addresses, and arbitrary directions cannot mint note facts"
      );
      assert.equal(recovered.recoveredCandidateCount, 5);
      assert.equal(recovered.recoveredCollectionCount, 3);
      const repeated = recoverMissingSourceFactCityNoteMembersV1({
        index,
        materials: [material],
        stages: recovered.stages,
      });
      assert.equal(
        repeated.recoveredCandidateCount,
        0,
        "deterministic City Note recovery is idempotent"
      );
    }

    {
      const sourceUploadId = "source-composite-plan-recovery";
      const text = [
        "Tuesday, January 22nd",
        "River Bridge",
        "Take a peek inside Gresham Palace.",
        "From Gresham Palace, walk to St. Istvan's Basilica. Tour the Basilica and climb the dome.",
      ].join("\n");
      const index = buildSourceDocumentIndexV1([
        {
          filename: "source-composite-plan-recovery.txt",
          sourceProvenance: "sanitized_test",
          sourceUploadId,
          text,
          type: "text",
        },
      ]);
      const stages = [
        {
          label: "Tuesday, January 22nd",
          source: "model_chunk" as const,
          sourceFilename: "source-composite-plan-recovery.txt",
          sourceProvenance: "sanitized_test",
          sourceSpanIds: index.spans.map((span) => span.spanId),
          sourceText: text,
          sourceUploadId,
          stage: {
            activities: [
              {
                category: "art_culture",
                city: "Example City",
                date: "2019-01-22",
                evidence: text.split("\n").slice(1).join("\n"),
                evidenceRole: "grouping_proposal",
                itemType: "activity",
                sourceSectionLabel: "Tuesday, January 22nd",
                sourceSectionType: "dated_itinerary",
                title: "River Bridge / Gresham Palace / St. Istvan's Basilica",
              },
              {
                category: "sightseeing",
                city: "Example City",
                date: "2019-01-22",
                evidence: "River Bridge",
                evidenceRole: "atomic_candidate",
                itemType: "activity",
                title: "River Bridge",
              },
            ],
          },
        },
      ];
      const recovered = recoverMissingSourceFactCompositePlanMembersV1({
        index,
        stages,
      });
      const recoveredActivities = (
        recovered.stages[0].stage as {
          activities: Array<Record<string, unknown>>;
        }
      ).activities.filter(
        (activity) => activity._sourceFactCompositePlanRecovery === true
      );
      assert.deepEqual(
        recoveredActivities.map((activity) => activity.title),
        ["St. Istvan's Basilica"],
        "an explicit tour action recovers the missing venue while a passing Palace peek does not"
      );
      assert.equal(recovered.recoveredCandidateCount, 1);
      const authority = applySourceFactAssemblyAuthorityV1({
        index,
        stages: recovered.stages,
      });
      const recoveredRecord = (
        authority.stages[0].stage as {
          activities: Array<Record<string, unknown>>;
        }
      ).activities.find(
        (activity) => activity._sourceFactCompositePlanRecovery === true
      );
      assert.equal(
        recoveredRecord?._canonicalRoleDecision,
        "keep_activity",
        "exact composite-plan recovery receives an explicit source-authority Activity decision"
      );
    }

    {
      const sourceUploadId = "source-relationship-recovery";
      const text = [
        "Saturday, January 19th",
        "Explore Example Palace",
        "Example Palace",
        "North Gallery",
        "Orangery at Example Palace",
        "Palm House at Example Palace",
        "Cooking Show",
        "Panorama Train pass",
        "Ferris wheel",
        "Open until 11:45pm",
      ].join("\n");
      const index = buildSourceDocumentIndexV1([
        {
          filename: "source-relationship-recovery.txt",
          sourceProvenance: "sanitized_test",
          sourceUploadId,
          text,
          type: "text",
        },
      ]);
      const stages = [
        {
          label: "Saturday, January 19th",
          source: "model_chunk" as const,
          sourceFilename: "source-relationship-recovery.txt",
          sourceProvenance: "sanitized_test",
          sourceSpanIds: index.spans.map((span) => span.spanId),
          sourceText: text,
          sourceUploadId,
          stage: {
            activities: [
              {
                category: "art_culture",
                city: "Example City",
                date: "2019-01-19",
                description: text.split("\n").slice(2).join("; "),
                evidence: text.split("\n").slice(2).join("\n"),
                evidenceRole: "grouping_proposal",
                itemType: "activity",
                sourceSectionLabel: "Saturday, January 19th",
                sourceSectionType: "dated_itinerary",
                title: "Explore Example Palace area",
              },
              {
                category: "art_culture",
                city: "Example City",
                date: "2019-01-19",
                evidence: "Example Palace",
                evidenceRole: "atomic_candidate",
                itemType: "activity",
                sourceSectionLabel: "Saturday, January 19th",
                sourceSectionType: "dated_itinerary",
                title: "Example Palace",
              },
              {
                category: "art_culture",
                city: "Example City",
                date: "2019-01-19",
                evidence: "North Gallery",
                evidenceRole: "atomic_candidate",
                itemType: "activity",
                sourceSectionLabel: "Saturday, January 19th",
                sourceSectionType: "dated_itinerary",
                title: "North Gallery",
              },
            ],
          },
        },
      ];
      const recovered = recoverMissingSourceFactRelationshipMembersV1({
        index,
        stages,
      });
      const recoveredActivities = (
        recovered.stages[0].stage as {
          activities: Array<Record<string, unknown>>;
        }
      ).activities;
      assert.deepEqual(
        recoveredActivities
          .filter(
            (activity) =>
              activity._sourceFactRelationshipRecovery === true
          )
          .map((activity) => activity.title),
        [
          "Orangery at Example Palace",
          "Palm House at Example Palace",
          "Cooking Show",
          "Panorama Train pass",
          "Ferris wheel",
        ],
        "only exact unresolved entity lines from the anchored relationship are recovered"
      );
      assert.equal(recovered.recoveredCandidateCount, 5);
      assert.equal(recovered.recoveredRelationshipCount, 1);
      const repeated = recoverMissingSourceFactRelationshipMembersV1({
        index,
        stages: recovered.stages,
      });
      assert.equal(
        repeated.recoveredCandidateCount,
        0,
        "deterministic relationship recovery is idempotent"
      );

      const recoveryRecords = (
        recovered.stages[0].stage as {
          activities: Array<Record<string, unknown>>;
        }
      ).activities;
      for (const record of recoveryRecords) {
        if (record.title === "Example Palace") {
          record._geoVerified = true;
          record.verifiedFormattedAddress = "Example Palace Estate";
          record.verifiedLatitude = 50;
          record.verifiedLongitude = 10;
        }
        if (record._sourceFactRelationshipRecovery === true) {
          record._sourceFactGeocodeOutcome =
            record.title === "Cooking Show" ||
            record.title === "Panorama Train pass"
              ? "rejected_locality"
              : "resolved";
        }
        if (
          record.title === "Orangery at Example Palace" ||
          record.title === "Palm House at Example Palace"
        ) {
          record._geoVerified = true;
          record.verifiedFormattedAddress = "Example Palace Estate";
          record.verifiedLatitude = 50.001;
          record.verifiedLongitude = 10.001;
        }
        if (record.title === "Ferris wheel") {
          record._geoVerified = true;
          record.verifiedFormattedAddress = "Independent Fairground";
          record.verifiedLatitude = 50;
          record.verifiedLongitude = 11;
        }
      }
      const safeAuthority = applySourceFactAssemblyAuthorityV1({
        index,
        stages: recovered.stages,
      });
      const safeCluster = clusterExtractedEvidence({
        groupingDecisions: safeAuthority.groupingDecisions,
        sourceTransportAnchors: [],
        stages: safeAuthority.stages,
        tripOverview: {
          confidence: "high",
          dateRange: "January 19, 2019",
          destinationSummary: "Example City",
          title: "Example trip",
        },
      });
      const siteDecision = safeCluster.summary.containmentLedger?.decisions.find(
        (decision) => decision.containerTitle.includes("Example Palace")
      );
      assert.ok(siteDecision, "the recovered same-site visit is assembled");
      assert.deepEqual(
        siteDecision.members.map((member) => member.title).sort(),
        [
          "Cooking Show",
          "North Gallery",
          "Orangery at Example Palace",
          "Panorama Train pass",
          "Palm House at Example Palace",
        ].sort(),
        "verified off-site boundary stops a recovered source run before the Ferris wheel"
      );
    }

    for (const built of [recommendation, spreadsheet, freeform, booking]) {
      assert.equal(
        built.authority.metrics.unresolvedBehaviorCandidateCount,
        0,
        `source authority left behavior-bearing decisions unresolved for ${built.fixture.name}`
      );
      assert.deepEqual(
        built.authority.diagnostics.unresolvedBehaviorCandidates,
        [],
        `source authority diagnostics must be empty for ${built.fixture.name}`
      );
      assert.equal(
        stableJsonStringify(built.authority.sourceLedger.factSet),
        stableJsonStringify(built.directLedger.factSet),
        "authority must consume Source Fact Ledger V1 without changing its bytes"
      );
      assert.doesNotMatch(
        JSON.stringify(built.clustered.draft),
        /_resolverCandidateId|source_fact_commitment|source_fact_reference/
      );
    }
}
