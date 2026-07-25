import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { createReviewQuestions } from "@/lib/extraction/review-question-policy";
import {
  applyReviewIdentityGate,
  asksForIdentityData,
  isIdentitySolicitingTargetField,
} from "@/lib/extraction/review-identity-gate";
import {
  dropIdentityProseSegments,
  findIdentityProseSignal,
} from "@/lib/extraction/identity-prose";

// Arc F.3 F1 — the review-surface identity gate (run 7.25.0 chain C,
// docket fixture assertion 3). Nothing here is invented: the two live
// off-contract questions are quoted from the run's QA bundle —
//   targetField `customer`             "What is the customer name or value
//                                       associated with this line?"
//   targetField `reserved_by_created`  "What are the reserved-by and created
//                                       values for this booking detail?"
// The run scrubs "Customer Eli Kamerow" out of card prose and then asks the
// maker to type it back in.
//
// CEO ruling (Eli, 2026-07-25): identity data "should absolutely be
// scrubbed, and should never be asked as a question. questions should be
// asked if there is something material that would impact the shape of a day
// (or the trip). asking the maker's name is never useful and should never be
// a question."
//
// Every assertion below is proven BOTH directions, and every negative control
// is a real review item this pipeline is required to keep asking.

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

function activity(overrides: Record<string, unknown> = {}) {
  return {
    category: "sightseeing",
    city: "Prague",
    date: "2019-01-16",
    description: null,
    itemType: "activity",
    title: "Prague Castle",
    ...overrides,
  };
}

type Detail = Record<string, unknown>;

// A PRODUCTION-shaped parser missingDetail: no `_canonicalReviewDisposition`
// and no `resolverDecisionId`. The parser's JSON schema is
// additionalProperties:false and declares neither, so this is the only shape
// that can actually arrive from a live parse.
function parserQuestion(overrides: Detail = {}): Detail {
  return {
    answerType: "text",
    confidence: "medium",
    evidence: "Page 6 of the car reservation.",
    guessedValue: null,
    prompt: "What is the missing detail?",
    reason: "The source leaves this unresolved.",
    targetField: "title",
    ...overrides,
  };
}

function draftDetails(missingDetails: Detail[]) {
  const result = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      stage("questions", emptyStage({ activities: [activity()], missingDetails })),
    ],
    tripOverview: TRIP_OVERVIEW,
  });
  return (result.draft as { missingDetails: Detail[] }).missingDetails;
}

function findByPrompt(details: Detail[], pattern: RegExp) {
  return details.find((detail) => pattern.test(String(detail.prompt ?? "")));
}

// The two live off-contract questions, verbatim.
const LIVE_CUSTOMER_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Customer Eli kamerow. 1225 Harvard street nw, 20009 Washington, USA.",
  guessedValue: null,
  prompt: "What is the customer name or value associated with this line?",
  reason: "The line names a customer field with no value captured.",
  targetField: "customer",
};

const LIVE_RESERVED_BY_QUESTION: Detail = {
  answerType: "text",
  confidence: "medium",
  evidence: "Reserved by: / Created:",
  guessedValue: null,
  prompt: "What are the reserved-by and created values for this booking detail?",
  reason: "The booking detail lists reserved-by and created fields.",
  targetField: "reserved_by_created",
};

export default async function run() {
  // ---------------------------------------------------------------------
  // 1. Predicate level — target fields.
  // ---------------------------------------------------------------------
  test("F1 predicates: identity-soliciting target fields are recognized, material ones are not", () => {
    for (const field of [
      "customer",
      "customer_name",
      "customerName",
      "reserved_by_created",
      "reserved_by",
      "bookedBy",
      "passenger_name",
      "lead_traveler",
      "cardholder",
      "home_address",
      "billing address",
      "contact_email",
      "phone",
      "email",
      "name_on_booking",
    ]) {
      assert.equal(
        isIdentitySolicitingTargetField(field),
        true,
        `${field} solicits identity data`
      );
    }
    // Negative controls — every one of these is a real target field this
    // pipeline must keep asking about (RW-QUE-001 material decisions).
    for (const field of [
      "title",
      "name",
      "date",
      "checkIn",
      "checkOut",
      "time",
      "type",
      "ticketType",
      "bookingStatus",
      "confirmation",
      "restaurant",
      "address", // a STAY address is protected class, not identity (Δ2)
      "guestCount",
      "sourceRecovery",
      "sensitiveDetails", // owned by the question gate's own rule (see F3)
      "accessCode",
      "",
    ]) {
      assert.equal(
        isIdentitySolicitingTargetField(field),
        false,
        `${field} is a material or protected-class field, not an identity ask`
      );
    }
  });

  test("F1 predicates: identity-soliciting prose is recognized without eating venue prose", () => {
    assert.equal(
      asksForIdentityData(
        "What is the customer name or value associated with this line?"
      ),
      true
    );
    assert.equal(
      asksForIdentityData(
        "What are the reserved-by and created values for this booking detail?"
      ),
      true
    );
    assert.equal(
      asksForIdentityData("What phone number should the traveler be reached on?"),
      true
    );
    // Negative controls. The identity word must come FIRST and the attribute
    // within 40 characters, so an attribute that precedes the role word, a
    // venue containing "Guest", and "booked or chosen" (not "booked by") are
    // all untouched.
    for (const safe of [
      "Which ticket or entry option was chosen for the Prague Castle visit?",
      "Was a tour of St. Vitus Cathedral actually booked or chosen?",
      "What date should be used for the Rome sightseeing day?",
      "Which day does Museum of Communism happen?",
      "What is the name of the restaurant the guest chose?",
      "Is the Guest House Prague booking still the plan?",
      "What is the travel mode for the 9:00 AM pick-up?",
      "Should Szechenyi Baths be planned for this day, or is it just an idea?",
      // A VENUE's phone number is public trip content, not identity: the
      // reverse-order rule requires a person word, so this survives.
      "What is the restaurant's phone number for the Borkonyha reservation?",
    ]) {
      assert.equal(
        asksForIdentityData(safe),
        false,
        `material question survives: ${safe}`
      );
    }
  });

  // ---------------------------------------------------------------------
  // 1b. The shared predicate's date-range false positive (found by applying
  //     it to the review surface; it was live in the card lane too).
  // ---------------------------------------------------------------------
  test("shared predicate: a date range is not a phone number, but every real phone shape still is", () => {
    // NEGATIVE controls — itinerary dates. Before the fix,
    // TRAILING_PHONE_PATTERN matched the run "2038-04-05" and the whole
    // segment was deleted as an identity leak.
    for (const dateProse of [
      "Paris leg 2038-04-02 to 2038-04-05",
      "The Prague leg runs 2019-01-14 to 2019-01-17.",
      "Trip window January 12-25, 2019",
      "Checkout is 25.01.2019",
      "Season 2019 - 2020",
    ]) {
      assert.equal(
        findIdentityProseSignal(dateProse),
        null,
        `dates are itinerary content, not a private contact: ${dateProse}`
      );
      assert.equal(
        dropIdentityProseSegments(dateProse),
        dateProse,
        "the segment survives untouched"
      );
    }
    // POSITIVE controls — every real contact shape is still caught, so the
    // exemption narrowed nothing that matters.
    for (const [prose, expected] of [
      ["Phone: +420 123 456 789", "phone"],
      ["Reach me on +1 202 555 0143 any time", "phone"],
      ["Call 202-555-0143 for the key", "phone"],
      ["Mobile 07700 900123", "phone"],
      ["The host number is 202 555 0143", "phone"],
      ["Contact eli.kamerow@example.com", "email"],
      ["Customer Eli kamerow", "role_labelled_name"],
      ["1225 Harvard street nw, 20009 Washington, USA", "street_address"],
    ] as const) {
      assert.equal(
        findIdentityProseSignal(prose),
        expected,
        `real identity shape still detected: ${prose}`
      );
    }
  });

  test("F1 gate is pure and idempotent (retry/rebuild lane runs it twice)", () => {
    const fields = {
      evidence:
        "Customer Eli kamerow. 1225 Harvard street nw, 20009 Washington, USA. Pick up at 9:00 AM.",
      guessedValue: null,
      prompt: "Which ticket or entry option was chosen?",
      reason: "The source says a ticket decision is still needed.",
      targetField: "ticketType",
    };
    const first = applyReviewIdentityGate(fields);
    assert.equal(first.dismissalReason, null, "a material question survives");
    assert.ok(
      first.removedSignals.includes("role_labelled_name"),
      "the identity shape is named"
    );
    assert.ok(
      first.removedSignals.includes("street_address"),
      "the postal home address is named"
    );
    assert.equal(
      /kamerow|harvard/i.test(String(first.scrubbed.evidence ?? "")),
      false,
      "the identity block is gone from the evidence"
    );
    assert.match(
      String(first.scrubbed.evidence ?? ""),
      /Pick up at 9:00 AM\./,
      "the material sentence survives"
    );
    // Idempotent: a second pass finds nothing left to change.
    const second = applyReviewIdentityGate({
      ...fields,
      evidence: first.scrubbed.evidence ?? null,
    });
    assert.deepEqual(second.scrubbed, {}, "second pass changes nothing");
    assert.equal(second.removedSignals.length, 0);
    // Purity: the input object was not mutated.
    assert.match(fields.evidence, /Customer Eli kamerow/);
  });

  // ---------------------------------------------------------------------
  // 2. Draft boundary — on the PRODUCTION parser shape.
  // ---------------------------------------------------------------------
  test("F1 draft boundary: the two live identity questions never ship as open questions", () => {
    const details = draftDetails([
      LIVE_CUSTOMER_QUESTION,
      LIVE_RESERVED_BY_QUESTION,
    ]);

    const customer = findByPrompt(details, /customer name or value/i);
    assert.ok(customer, "the record is RETAINED in place, never filtered out");
    assert.equal(
      customer?._canonicalReviewDisposition,
      "dismissed",
      "targetField `customer` is dismissed, not asked"
    );
    assert.match(
      String(customer?._canonicalQuestionGate ?? ""),
      /identity data/i,
      "the dismissal carries an auditable reason"
    );
    // The reason names the SHAPE, never the value (safe in redacted bundles).
    assert.equal(
      /kamerow|harvard|20009/i.test(String(customer?._canonicalQuestionGate ?? "")),
      false
    );
    assert.equal(
      /kamerow|harvard|20009/i.test(String(customer?.evidence ?? "")),
      false,
      "the identity block is scrubbed from the evidence too"
    );

    const reservedBy = findByPrompt(details, /reserved-by and created/i);
    assert.ok(reservedBy, "retained in place");
    assert.equal(reservedBy?._canonicalReviewDisposition, "dismissed");

    const open = details.filter(
      (detail) => detail._canonicalReviewDisposition === "question"
    );
    assert.equal(
      open.some((detail) => /customer name|reserved-by/i.test(String(detail.prompt))),
      false,
      "neither identity ask reaches the maker"
    );
  });

  test("F1 draft boundary: a material question keeps its ask and loses only the identity value", () => {
    const details = draftDetails([
      parserQuestion({
        evidence:
          "Wednesday, January 16th Lesser Town & Prague Castle: 'Need to decide which ticket to get'. Customer Eli kamerow.",
        prompt: "Which ticket or entry option was chosen for the Prague Castle visit?",
        reason: "The source says a ticket decision is still needed.",
        relatedTitle: "Prague Castle",
        targetField: "ticketType",
      }),
    ]);
    const ticket = findByPrompt(details, /ticket or entry option/i);
    assert.ok(ticket, "the material question survives");
    assert.equal(
      ticket?._canonicalReviewDisposition,
      "question",
      "a material decision is still asked (RW-QUE-001)"
    );
    assert.equal(
      /kamerow/i.test(String(ticket?.evidence ?? "")),
      false,
      "the identity value is gone from the wording"
    );
    assert.match(
      String(ticket?.evidence ?? ""),
      /which ticket to get/i,
      "the source evidence that justifies the ask survives"
    );
    assert.deepEqual(ticket?._canonicalReviewIdentitySignals, [
      "role_labelled_name",
    ]);
  });

  test("F1 draft boundary: nothing blocks, nothing is dropped, the run completes", () => {
    // Every F.3 outcome is scrub-or-dismiss. A draft carrying only identity
    // asks still produces a usable draft (Eli's standing do-not-block rule).
    const details = draftDetails([
      LIVE_CUSTOMER_QUESTION,
      LIVE_RESERVED_BY_QUESTION,
      parserQuestion({
        prompt: "What is the home address on the rental agreement?",
        reason: "The agreement lists a home address.",
        targetField: "home_address",
      }),
    ]);
    assert.ok(details.length >= 3, "all three records are retained for audit");
    for (const pattern of [
      /customer name or value/i,
      /reserved-by and created/i,
      /home address on the rental/i,
    ]) {
      const detail = findByPrompt(details, pattern);
      assert.ok(detail, `record retained: ${pattern}`);
      assert.equal(detail?._canonicalReviewDisposition, "dismissed");
    }
  });

  // ---------------------------------------------------------------------
  // 3. Projection boundary — defense in depth, dismiss never drop.
  // ---------------------------------------------------------------------
  test("F1 projection boundary: an identity ask from a stale draft is dismissed, never dropped", () => {
    // A draft persisted by an OLDER build reaches projection with the
    // question still open. The compile invariant
    // (draft-to-structured-trip.ts:846) requires one projected record per
    // draft missingDetail, so the gate must dismiss in place.
    const draft = {
      missingDetails: [
        {
          ...LIVE_CUSTOMER_QUESTION,
          _canonicalReviewDisposition: "question",
          _canonicalReviewId: "review_stale_customer",
        },
        {
          ...parserQuestion({
            prompt: "Which ticket or entry option was chosen?",
            targetField: "ticketType",
            evidence: "Need to decide which ticket to get. Customer Eli kamerow.",
          }),
          _canonicalReviewDisposition: "question",
          _canonicalReviewId: "review_stale_ticket",
        },
      ],
    };
    const questions = createReviewQuestions({
      draft,
      items: [],
      legs: [],
      stays: [],
      transport: [],
      tripId: "trip_1",
    });
    assert.equal(
      questions.length,
      2,
      "one projected record per draft detail — the compile invariant holds"
    );
    const customer = questions.find((question) =>
      /customer name or value/i.test(question.prompt)
    );
    assert.ok(customer);
    assert.equal(customer?.status, "dismissed", "never open to the maker");
    assert.match(String(customer?.dismissalReason ?? ""), /identity data/i);
    assert.equal(
      /kamerow|harvard|20009/i.test(String(customer?.evidence ?? "")),
      false,
      "identity is scrubbed at projection too"
    );

    const ticket = questions.find((question) =>
      /ticket or entry option/i.test(question.prompt)
    );
    assert.ok(ticket);
    assert.equal(ticket?.status, "open", "the material decision still reaches the maker");
    assert.equal(
      /kamerow/i.test(String(ticket?.evidence ?? "")),
      false,
      "but its wording is clean"
    );
  });

  test("F1 projection boundary: a Call is never dismissed for identity, only cleaned", () => {
    // RW-REV-001: a Call is a statement, not an ask. It keeps its
    // disposition and loses only the identity value.
    const questions = createReviewQuestions({
      draft: {
        missingDetails: [
          {
            _canonicalReviewDisposition: "call",
            _canonicalReviewId: "review_call_1",
            answerType: "confirm",
            evidence: "Customer Eli kamerow. We folded the ticket copies together.",
            prompt: "We merged two copies of the same train ticket.",
            reason: "Both copies named the same segment.",
            targetField: "presentation",
          },
        ],
      },
      items: [],
      legs: [],
      stays: [],
      transport: [],
      tripId: "trip_1",
    });
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.status, "noted", "the Call survives as a Call");
    assert.equal(questions[0]?.dismissalReason, null);
    assert.equal(
      /kamerow/i.test(String(questions[0]?.evidence ?? "")),
      false,
      "the identity value is still cleaned out"
    );
  });
}
