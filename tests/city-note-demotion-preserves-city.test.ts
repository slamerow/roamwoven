import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// Task B7 (2026-08-04 restructure work order) — the City Notes content-loss
// defect. Live run: R2D2 ("(far away)") and the Jan-19 Vienna idea list
// (St. Stephen's Cathedral, Ferris wheel, Apple Strudel Show, Schönbrunn
// visit) were each demoted to City Notes by a documented, correctly-firing
// rule, and then absent from the note that shipped — not as a stray card,
// not anywhere.
//
// Root cause: demoteCanonicalPieceToCityNote nulls a piece's `date` (so it
// can never resurface as a dated card). mergeCanonicalCityNotes resolves a
// note's city from an explicit `city` field, from a place name inside the
// note's own text, or from that same `date` falling inside a place's
// arrive/leave range. A piece demoted with no explicit city and no city
// name in its own title/description had exactly one path to a city — the
// date — and this function deleted it before city resolution ever ran. The
// piece resolves no city, mergeCanonicalCityNotes's `if (!city) continue`
// drops it from every group, and it ships nowhere: gone, with no
// disposition recording it. One call site (createResearchedListQuestions)
// had already patched around this locally by stamping `city` before
// calling in — proof the failure mode was known — but the other six call
// sites of the shared function had not, which is why R2D2 escaped a fix
// that (from the outside) looked like it should have applied trip-wide.
//
// This test reproduces the single-mention hedge-demotion shape (R2D2)
// against `demoteHedgedSingleUncommittedMentions`. To see it fail, comment
// out the `if (!stringValue(piece.payload, "city"))` block at the top of
// `demoteCanonicalPieceToCityNote` in lib/extraction/evidence-clustering.ts
// — with the date nulled and no fallback, the assertion that the note
// contains "R2D2" goes red (the note becomes empty or absent, exactly the
// live defect).
//
// B7.1 (2026-08-04, same day, second pass at this bug): the fix above was
// NOT the live defect. The measured pinned-parse R2D2 record already
// carries an explicit `city` — the "no city" branch this file's first test
// exercises never runs for it, which is exactly why that fix moved nothing
// on the scorecard. `mergeCanonicalCityNotes`'s restore loop
// (lib/extraction/evidence-clustering.ts, "Collection integrity") only
// records a rescue when at least one of a note's description-derived
// candidates matches something the check already treats as covered —
// already rendered, already excluded with a disposition, or freshly
// restored. A note whose description sanitizes/splits down to nothing
// (here: an 8+ digit run that `sanitizeCityNoteText` strips to empty) never
// produces a candidate the classifier even sees, so it carries neither
// content nor a disposition — silent loss, one step upstream of the
// 7.18.0 shape the check was built for. The B7.1 fix adds a title
// fallback, tried through the IDENTICAL safety/section gate, only when the
// description-derived candidates land nothing. To see THIS test fail,
// disable the fallback: change `if (!landed && !isNoteEntry)` to
// `if (false)` around line 6195 of evidence-clustering.ts (the "B7.1"
// comment marks the block) — the note ships with only the Food section,
// missing R2D2 entirely, matching the measured defect exactly.

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
}
