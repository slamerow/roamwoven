import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// Task B7 (2026-08-04/05 restructure work order) — City Note content-loss
// coverage. The first two diagnoses below were NOT the pinned R2D2 root
// cause: that record already had `city: "Prague"`, and its real description
// did not sanitize to empty. They remain valuable latent-correctness tests
// for two adjacent silent-loss shapes: date-only city resolution (B7) and a
// title fallback after an empty sanitized description (B7.1).
//
// The measured pinned root cause is B7.2. R2D2 entered the Prague group and
// initially rendered under Sights & Culture. Final output sanitization then
// split prose only on sentence punctuation, not newlines. It treated the
// R2D2 section and a later phone-bearing Getting Around section as one
// segment, so the privacy gate correctly detected the phone but deleted the
// entire combined segment. Sanitizing each newline-delimited City Note
// section independently preserves R2D2 while still removing the phone.
//
// Ferris wheel, Apple Studel Show, and Schönbrunn visit remain a separate
// survivor-chain mechanism in canonical-accessory-routing.ts; this test file
// deliberately makes no claim that B7.2 fixes those records.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function cluster(activities: Array<Record<string, unknown>>) {
  return clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "prague notes",
        source: "model_chunk",
        stage: {
          activities,
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
        },
      },
    ],
    tripOverview: { dateRange: "January 12-25, 2019" },
  }).draft as {
    activities: Array<{
      description?: string | null;
      itemType?: string | null;
      title: string;
    }>;
  };
}

export default async function run() {
  await test(
    "B7: a hedge-demoted mention with no explicit city keeps its city-note home and its content ships",
    () => {
      // No `city` field on the activity, on purpose — R2D2's own text never
      // says "Prague" either. The only signal available is `date`, which
      // demoteCanonicalPieceToCityNote must capture before nulling it.
      // The identifying text lives in `description`, not just `title`:
      // cityNoteCollectionSections reads `description ?? title`, so a note
      // whose description never names the venue would fail this assertion
      // for a reason unrelated to the fix under test.
      const draft = cluster([
        {
          date: "2019-01-16",
          description:
            "R2D2 Retro Cafe is themed and fun, but far away from downtown so only if we have time.",
          itemType: "activity",
          title: "R2D2 Retro Cafe",
        },
      ]);

      const card = draft.activities.find(
        (item) => item.itemType !== "note" && /r2d2/i.test(item.title)
      );
      assert.equal(
        card,
        undefined,
        "the doubt marker demotes this: it must never ship as a dated activity card"
      );

      const notes = draft.activities.filter((item) => item.itemType === "note");
      assert.equal(
        notes.length,
        1,
        `demotion with no resolvable city ships zero city notes instead of one: ${notes.length}`
      );
      assert.equal(notes[0]?.title, "Prague Notes & Tips");
      assert.ok(
        /r2d2/i.test(notes[0]?.description ?? ""),
        "filed means filed: the note that shipped must actually contain the demoted content, " +
          `not just carry an action reason claiming it was routed there (got: ${JSON.stringify(notes[0]?.description)})`
      );
    }
  );

  await test(
    "negative control: an explicit city on the piece already worked, and still does",
    () => {
      const draft = cluster([
        {
          city: "Prague",
          date: "2019-01-16",
          description:
            "Explicit City Cafe is themed and fun, but far away, if we have time.",
          itemType: "activity",
          title: "Explicit City Cafe",
        },
      ]);

      const notes = draft.activities.filter((item) => item.itemType === "note");
      assert.equal(notes.length, 1);
      assert.equal(notes[0]?.title, "Prague Notes & Tips");
      assert.ok(/explicit city cafe/i.test(notes[0]?.description ?? ""));
    }
  );

  await test(
    "B7.1: a note whose description sanitizes to nothing still lands via its title",
    () => {
      // R2D2's measured shape: explicit city (so the B7 fix above is a
      // no-op here), and a description that carries a signal
      // `sanitizeCityNoteText` strips to empty (an 8+ digit run) rather
      // than a title-echoing hedge phrase. Before description-derived
      // candidates land nothing, neither the front-door render nor the
      // (pre-B7.1) restore loop ever produces a candidate for the
      // classifier to see — total silent loss, with no disposition either.
      const draft = cluster([
        {
          city: "Prague",
          date: "2019-01-15",
          description: "Trdelnik stand near the square, if time allows try the pastry.",
          category: "food_dining",
          itemType: "activity",
          title: "Trdelnik stand",
        },
        {
          area: "Lesser Town",
          category: "art_culture",
          city: "Prague",
          date: "2019-01-16",
          description: "88888888",
          evidence: "R2D2, far away, 88888888",
          itemType: "activity",
          title: "R2D2",
        },
      ]);

      const notes = draft.activities.filter((item) => item.itemType === "note");
      assert.equal(
        notes.length,
        1,
        `expected one Prague Notes & Tips collection, got ${notes.length}`
      );
      assert.ok(
        /r2d2/i.test(notes[0]?.description ?? ""),
        "filed means filed: a note whose description sanitizes to nothing must still " +
          `ship via its title, not vanish with no content and no disposition (got: ${JSON.stringify(notes[0]?.description)})`
      );
    }
  );

  await test(
    "B7.2: a sensitive later City Note section cannot delete an unrelated earlier section",
    () => {
      // Pinned run 8.1.0 shape: R2D2 initially renders under Sights &
      // Culture. A later Getting Around section carries a phone number.
      // The generic output sanitizer must remove the sensitive section
      // without treating both newline-separated sections as one sentence
      // and deleting R2D2 with it.
      const draft = cluster([
        {
          category: "art_culture",
          city: "Prague",
          date: "2019-01-16",
          description: "R2D2 (far away)",
          evidence: "R2D2 (far away)",
          itemType: "activity",
          title: "R2D2",
        },
        {
          category: "admin_logistics",
          city: "Prague",
          date: null,
          description:
            "Prague Downtown, fictional phone +1 202 555 0198, opening hours 8:00 - 20:00",
          itemType: "note",
          title: "Prague Downtown note",
        },
      ]);

      const note = draft.activities.find((item) => item.itemType === "note");
      assert.ok(note, "the Prague City Note collection must ship");
      assert.match(
        note.description ?? "",
        /r2d2/i,
        "privacy sanitization of a later section must not delete an unrelated demoted sight"
      );
      assert.doesNotMatch(
        note.description ?? "",
        /202\s+555\s+0198/,
        "the phone-bearing section remains scrubbed from public note prose"
      );
    }
  );
}
