import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// Run 2 §4 — THE MISSED TARGET, root cause, settled from the pinned parse on
// 2026-07-31.
//
// What the model actually emitted (trip_extraction_parses, run-2 parse key
// 5d2ad2d66cba52f5…, VERBATIM):
//
//   title "Prague Castle visit"  date 2019-01-16  evidenceRole grouping_proposal
//                                itemType activity  sourceSectionType dated_itinerary
//                                sourceSectionLabel "Wednesday, January 16th"
//   title "Prague castle"        date 2019-01-16  evidenceRole grouping_proposal
//                                itemType activity  sourceSectionType dated_itinerary
//                                sourceSectionLabel "Wednesday, January 16th"
//
// The model was RIGHT, and the source agrees: `USE FOR TESTING CZECH.pdf`
// line 112 carries "Prague castle (2 hours)" inside the dated Jan-16 day
// section, under the heading "Lesser Town & Prague Castle", with "Changing of
// the Guard -12:00 PM" and "Need to decide which ticket to get" beneath it.
// The parser prompt's own grouping-proposal rule asks for exactly this shape.
//
// `reclassifySourceContainers` then converted both to context, because no
// grouping decision had been approved for them — the geocode lane could not
// place their children. Four symptoms, one line: the Jan-16 castle card
// disappeared; `recoverMissingNamedEvidence` synthesized an UNDATED
// `placeholder` for the now-orphaned ticket question; Jan 16 had zero dated
// containers, so `retryQueryFor` returned null for every Jan-16 card, which is
// the entirety of `retryCount: 0`; and grouping had no container either.
//
// Eli, 2026-07-28: a named site container carrying an unresolved decision
// survives as a DATED CARD *and* raises the question — not one or the other.
//
// The demotion itself stays: it is what keeps day/route headings out of the
// traveler's day (RW-ASM-001). Only a NAMED SITE container with a real date is
// rescued, judged by the same `SAME_SITE_CONTAINER_PATTERN` grouping uses.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function cluster(
  activities: Array<Record<string, unknown>>,
  missingDetails: Array<Record<string, unknown>> = []
) {
  return clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "USE FOR TESTING CZECH.pdf notes",
        source: "model_chunk",
        stage: {
          activities,
          missingDetails,
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
    activities: Array<{ date?: string | null; title: string }>;
    missingDetails: Array<{
      prompt?: string | null;
      relatedCanonicalPieceId?: string | null;
      relatedTitle?: string | null;
    }>;
  };
}

const DATED_SECTION = {
  city: "Prague",
  sourceSectionLabel: "Wednesday, January 16th",
  sourceSectionType: "dated_itinerary",
};

export default async function run() {
  await test(
    "run-2 root cause: a dated NAMED SITE container survives a rejected grouping proposal, as a dated card",
    () => {
      const draft = cluster([
        {
          ...DATED_SECTION,
          date: "2019-01-16",
          description:
            "Changing of the Guard - 12:00 PM. Need to decide which ticket to get.",
          evidenceRole: "grouping_proposal",
          title: "Prague Castle visit",
        },
        {
          ...DATED_SECTION,
          date: "2019-01-16",
          description:
            "Changing of the Guard - 12:00 PM. Need to decide which ticket to get.",
          evidenceRole: "atomic_candidate",
          startTime: "12:00",
          title: "Changing of the Guard",
        },
      ]);

      // Regression coverage for Task A (2026-08-04): the sibling above needs
      // a real description — near-identical to the container's own — or
      // `collapseAlternativeSlotCards` Pass 1 bails at its minimum-
      // description-length check before ever reaching the merge decision,
      // and the guard below goes untested. With a description this close in
      // wording, Pass 1's near-identical-description test would otherwise
      // merge the dated "Prague Castle visit" container INTO this sibling
      // (exactly what happened live), deleting the castle a second time
      // after `reclassifySourceContainers` had already rescued it.
      const castle = draft.activities.find((activity) =>
        /castle/i.test(activity.title)
      );
      assert.ok(
        castle,
        "the container must survive: demoting it deletes the card AND the anchor the ticket decision hangs from"
      );
      assert.equal(
        castle.date,
        "2019-01-16",
        "and it must survive DATED — an undated survivor is the defect, not the fix"
      );
    }
  );

  await test(
    "negative control: a day-heading grouping proposal still demotes to context",
    () => {
      const draft = cluster([
        {
          city: "Vienna",
          date: "2019-01-19",
          evidenceRole: "grouping_proposal",
          sourceSectionLabel: "Saturday, January 19th",
          sourceSectionType: "dated_itinerary",
          title: "Explore Vienna",
        },
        {
          city: "Vienna",
          date: "2019-01-19",
          evidenceRole: "atomic_candidate",
          sourceSectionLabel: "Saturday, January 19th",
          sourceSectionType: "dated_itinerary",
          title: "Belvedere",
        },
      ]);

      assert.equal(
        draft.activities.some((activity) =>
          /explore vienna/i.test(activity.title)
        ),
        false,
        "this branch is load-bearing against day-heading cards and must stay so"
      );
    }
  );

  await test(
    "negative control: an UNDATED site container still demotes — the rescue requires a date",
    () => {
      const draft = cluster([
        {
          city: "Prague",
          date: null,
          evidenceRole: "grouping_proposal",
          sourceSectionLabel: null,
          sourceSectionType: "unknown",
          title: "Prague Castle visit",
        },
      ]);

      assert.equal(
        draft.activities.some((activity) => /castle/i.test(activity.title)),
        false
      );
    }
  );

  // The other half of Eli's 2026-07-28 ruling — "survives as a DATED CARD
  // *and* raises the question" — is NOT closed by this change, and this test
  // exists to say so honestly rather than let a green suite imply otherwise
  // (§Coverage honesty; same posture as
  // `tests/question-gate-production-shape.test.ts`, which pins the F.3
  // question-gate KNOWN_GAP).
  //
  // VERIFIED 2026-07-31 by running this exact shape: with the container dated
  // again, RW-QUE-001's one-venue-one-decision consolidation is REACHED — the
  // `if (!rootDate) continue` bail that blocked it in run 2 no longer fires —
  // but it still does not consolidate, for a DIFFERENT and pre-existing
  // reason: the two sub-stop questions come out of subject resolution with
  // `relatedCanonicalPieceId: null`, and the consolidation keys on that id.
  // The container's own question keeps its subject; the children lose theirs.
  //
  // So run 2's THREE castle questions were two independent defects stacked,
  // not one. Task 2 fixed the card and unblocked the date bail. Sub-stop
  // subject resolution is the remaining half and is deliberately NOT fixed
  // here: it is its own change, it belongs with the F.3 convergence work
  // RW-QUE-001 already tracks, and shipping it unexamined alongside a
  // classification change would be a second variable in one run (rule 1(d)).
  //
  // This assertion pins CURRENT production truth. It is expected to FAIL when
  // sub-stop subject resolution is fixed — that failure is the signal to
  // flip it to `1`, not a regression.
  await test(
    "KNOWN_GAP pin: the castle ticket decision still fragments, now on sub-stop subject resolution",
    () => {
      const draft = cluster(
        [
          {
            ...DATED_SECTION,
            date: "2019-01-16",
            description:
              "Changing of the Guard - 12:00 PM. St. Vitus Cathedral (stained glass inside).",
            evidenceRole: "grouping_proposal",
            title: "Prague Castle visit",
          },
          {
            ...DATED_SECTION,
            date: "2019-01-16",
            evidenceRole: "atomic_candidate",
            startTime: "12:00",
            title: "Changing of the Guard",
          },
          {
            ...DATED_SECTION,
            date: "2019-01-16",
            evidenceRole: "atomic_candidate",
            title: "St. Vitus Cathedral",
          },
        ],
        [
          {
            answerType: "text",
            evidence: "Need to decide which ticket to get.",
            prompt: "Which Prague Castle ticket should be listed?",
            relatedTitle: "Prague Castle visit",
            subjectType: "item",
            targetField: "ticketType",
          },
          {
            answerType: "text",
            evidence:
              "Changing of the Guard -12:00 PM. Need to decide which ticket to get.",
            prompt: "Which ticket covers the Changing of the Guard?",
            relatedTitle: "Changing of the Guard",
            subjectType: "item",
            targetField: "ticketType",
          },
          {
            answerType: "text",
            evidence: "St. Vitus Cathedral (stained glass inside) get tour?",
            prompt: "Should a St. Vitus Cathedral tour be booked?",
            relatedTitle: "St. Vitus Cathedral",
            subjectType: "item",
            targetField: "ticketType",
          },
        ]
      );

      // The card half IS fixed: all three survive as dated Jan-16 activities,
      // which is what the container rescue bought.
      assert.equal(
        draft.activities.filter((activity) => activity.date === "2019-01-16")
          .length,
        3
      );

      const ticketQuestions = draft.missingDetails.filter((detail) =>
        /ticket|tour/i.test(detail.prompt ?? "")
      );
      assert.equal(
        ticketQuestions.length,
        3,
        "CURRENT TRUTH, not the target. RW-QUE-001 wants ONE. When sub-stop subject resolution is fixed this becomes 1 and this assertion must be updated, not deleted."
      );
      assert.equal(
        ticketQuestions.filter(
          (detail) =>
            (detail as { relatedCanonicalPieceId?: string | null })
              .relatedCanonicalPieceId == null
        ).length,
        2,
        "and the reason is subject resolution: the two sub-stop questions carry no canonical subject, so the consolidation cannot key on them"
      );
    }
  );
}
