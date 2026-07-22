import assert from "node:assert/strict";
import { injectVerbatimActivityEvidence } from "@/lib/extraction/evidence-injection";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

// Arc E deterministic verbatim-evidence injection — shapes from live run
// 7.22.4 (0/140 lineage rows carried evidence; Prague Castle doubt-demoted
// on R2D2's absorbed "(far away)"; koscom's line carries "maybe communism
// museum"). See docs/assembly-defect-docket-2026-07-22-run-7.22.4.md.

const CHUNK_SOURCE = [
  "Wednesday, January 16th Lesser Town & Prague Castle",
  "Prague Castle complex — need to decide which ticket to get (350-880 CZK)",
  "R2D2 (far away)",
  "Get back by 5 to go to koscom and maybe communism museum",
  "",
  "Czech notes",
  "Prague Castle complex is huge, maybe skip the gardens in winter",
].join("\n");

function payload(overrides: Record<string, unknown>) {
  return {
    confirmation: null,
    evidence: null,
    itemType: "activity",
    startTime: null,
    ...overrides,
  } as Record<string, unknown>;
}

export default async function run() {
  const { test } = await import("node:test");

  await test("injection: an untimed unbooked card receives its own verbatim source line", () => {
    const record = payload({
      sourceSectionLabel: "Wednesday, January 16th Lesser Town & Prague Castle",
      title: "R2D2",
    });
    const provenance = injectVerbatimActivityEvidence(record, CHUNK_SOURCE);
    assert.equal(provenance, "line_match_injected");
    assert.equal(record.evidence, "R2D2 (far away)");
  });

  await test("injection: a multi-entity source line lands on the entity whose tokens it carries", () => {
    const record = payload({ title: "Museum of Communism" });
    const provenance = injectVerbatimActivityEvidence(record, CHUNK_SOURCE);
    assert.equal(provenance, "line_match_injected");
    assert.match(String(record.evidence), /maybe communism museum/);
  });

  await test("injection: ambiguous matches resolve via the payload's own section label, else nothing is injected", () => {
    // "Prague Castle complex" matches a day-plan line AND a notes line
    // (the notes copy carries a hedge that must not land on the plan copy).
    const labeled = payload({
      sourceSectionLabel: "Wednesday, January 16th Lesser Town & Prague Castle",
      title: "Prague Castle complex",
    });
    assert.equal(
      injectVerbatimActivityEvidence(labeled, CHUNK_SOURCE),
      "line_match_injected"
    );
    assert.match(String(labeled.evidence), /need to decide which ticket/);
    assert.doesNotMatch(String(labeled.evidence), /maybe skip/);

    const unlabeled = payload({ title: "Prague Castle complex" });
    assert.equal(
      injectVerbatimActivityEvidence(unlabeled, CHUNK_SOURCE),
      "absent"
    );
    assert.equal(unlabeled.evidence, null, "no injection on ambiguity");
  });

  await test("injection: verbatim model evidence is kept untouched; timed/booked cards are out of scope", () => {
    const verbatim = payload({
      evidence: "R2D2 (far away)",
      title: "R2D2",
    });
    assert.equal(
      injectVerbatimActivityEvidence(verbatim, CHUNK_SOURCE),
      "model_verbatim"
    );
    assert.equal(verbatim.evidence, "R2D2 (far away)");

    const timed = payload({ startTime: "14:00", title: "R2D2" });
    assert.equal(injectVerbatimActivityEvidence(timed, CHUNK_SOURCE), null);
    assert.equal(timed.evidence, null);

    const noSource = payload({ title: "R2D2" });
    assert.equal(injectVerbatimActivityEvidence(noSource, null), null);
  });

  await test("injection end-to-end: own-text stamping judges the injected quote — castle survives absorbed hedges, R2D2 still demotes", () => {
    const stage: EvidenceStageInput = {
      label: "Wednesday, January 16th",
      source: "model_chunk",
      sourceFilename: "czech-out.pdf",
      sourceText: CHUNK_SOURCE,
      stage: {
        activities: [
          {
            category: "art_culture",
            city: "Prague",
            date: "2019-01-16",
            // The parser strips the hedge and invents prose (run7 shape);
            // evidence is nulled (run 7.22.4 shape).
            description: "Visit R2D2.",
            evidence: null,
            itemType: "activity",
            sourceSectionLabel:
              "Wednesday, January 16th Lesser Town & Prague Castle",
            startTime: null,
            title: "R2D2",
          },
          {
            category: "art_culture",
            city: "Prague",
            date: "2019-01-16",
            description: "Explore the castle complex.",
            evidence: null,
            itemType: "activity",
            sourceSectionLabel:
              "Wednesday, January 16th Lesser Town & Prague Castle",
            startTime: null,
            title: "Prague Castle complex",
          },
        ],
        missingDetails: [],
        places: [
          {
            arriveDate: "2019-01-14",
            city: "Prague",
            country: "Czech Republic",
            leaveDate: "2019-01-18",
          },
        ],
        sensitiveDetails: [],
        stays: [],
        transport: [],
      },
    };
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [stage],
      tripOverview: { dateRange: "January 12-25, 2019" },
    });
    const draft = result.draft as {
      activities: Array<Record<string, unknown>>;
    };
    const castle = draft.activities.filter(
      (item) =>
        item.itemType !== "note" &&
        /^prague castle complex$/i.test(String(item.title ?? ""))
    );
    assert.equal(castle.length, 1, "castle ships as a dated card");
    const r2d2 = draft.activities.filter(
      (item) =>
        item.itemType !== "note" && /r2d2/i.test(String(item.title ?? ""))
    );
    assert.equal(
      r2d2.length,
      0,
      "R2D2's own injected '(far away)' hedge demotes it silently"
    );
  });
}
