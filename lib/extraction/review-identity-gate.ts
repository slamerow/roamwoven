// Review-surface identity gate (Arc F.3, live-run 7.25.0 chain C).
//
// Arc F put ONE identity gate over every public field of every RECORD kind.
// The QUESTION surface never got one: run 7.25.0 shipped open questions with
// targetField `customer` ("What is the customer name or value associated with
// this line?") and `reserved_by_created` ("What are the reserved-by and
// created values for this booking detail?"). The pipeline scrubs
// "Customer Eli Kamerow" out of card prose and then asks the maker to type it
// back in. Verified at 588ad33: identity-prose.ts had FIVE consumers, every
// one of them on `piece.payload` — nothing touched `prompt`, `reason`,
// `targetField`, `relatedTitle`, or `guessedValue` — and the review path kept
// an un-migrated PRIVATE copy (`scrubReviewEvidence`) carrying the exact
// colon-required bug the shared module was built to kill.
//
// CEO ruling (Eli, 2026-07-25, verbatim): "yeah that should absolutely be
// scrubbed, and should never be asked as a question. questions should be
// asked if there is something material that would impact the shape of a day
// (or the trip). asking the maker's name is never useful and should never be
// a question." That is RW-QUE-001's material-decision test plus RW-PRI-001's
// automatic-and-final posture, applied to the review surface.
//
// Dark-factory posture (AGENTS.md, and Eli's standing DO-NOT-BLOCK-THE-RUN
// directive): every outcome here is drop-or-scrub with an auditable
// disposition. No throw, no invariant, no quarantine, no hard warning. A
// dismissed item is RETAINED in place with its reason so audits can quote it
// (the run7 question-gate posture); it is never filtered out, because
// `validateStructuredTripRecords` requires every draft missingDetail to have
// a matching projected review record
// (draft-to-structured-trip.ts:846-851 — dropping one would fail a compile
// invariant and could kill an otherwise usable run).
//
// ONE module, TWO lanes (the F.2 C4 pattern — one classifier, both lanes):
// the draft boundary (`canonicalizeCanonicalReviewDetails`, which every
// rebuild also passes through) and the projection boundary
// (`createReviewQuestions`, the last stop before the maker sees it).

import {
  dropIdentityProseSegments,
  findIdentityProseSignals,
  type IdentityProseSignal,
} from "@/lib/extraction/identity-prose";

// A targetField that SOLICITS personal identity data. The parser's
// targetField is an unconstrained free string
// (openai-trip-parser.ts:217), so these are the shapes that actually
// arrive rather than an enum we wish existed.
//
// Deliberately NOT matched, because each is a material decision or a
// protected-but-legitimate field:
// - bare `name` / `title` (venue naming — run7's receipt-title question),
// - bare `address` (a stay address is PROTECTED class, not identity —
//   RW-PRI-001 Δ2 distinguishes the traveler's OWN home address from the
//   lodging address the traveler needs),
// - bare `guest` (identity-prose.ts excludes it by design: "Guest House
//   Prague" is a venue),
// - `sensitiveDetails` / `accessCode` (those belong to the question gate's
//   own rule at evidence-clustering.ts:1828 — see F3; this module does not
//   duplicate it).
const IDENTITY_TARGET_FIELD_PATTERNS = [
  /^(?:customer|client|renter|passenger|driver|booker|cardholder)(?:[_\s-]?(?:name|details?|info(?:rmation)?))?$/i,
  /^(?:account|card)[_\s-]?holder(?:[_\s-]?name)?$/i,
  /^lead[_\s-]?(?:travel?ler|guest)(?:[_\s-]?name)?$/i,
  /^(?:reserved|booked)[_\s-]?by(?:[_\s-].*)?$/i,
  /^(?:guest|travel?ler|passenger|customer|client)[_\s-]?(?:name|email|phone)$/i,
  /^(?:home|billing|mailing)[_\s-]?address$/i,
  /^(?:contact|personal)[_\s-]?(?:email|phone|number|details?|info(?:rmation)?)$/i,
  /^(?:email|e[_\s-]?mail|phone|telephone|mobile)(?:[_\s-]?(?:number|address))?$/i,
  /^name[_\s-]?on[_\s-]?(?:booking|reservation|ticket|card)$/i,
];

// Prose that ASKS for an identity attribute, for questions whose targetField
// is generic. The live "What is the customer name or value associated with
// this line?" carries no identity VALUE (nothing to scrub — "customer name"
// is lowercase, so the role-labelled-name predicate correctly does not
// match); it is the ASK itself that is off-contract.
//
// Scoped tightly on purpose: the identity word must come FIRST and the
// attribute within 40 characters, so "the name of the restaurant the guest
// chose" (attribute before the role word) and "Guest House Prague" (no
// attribute) are untouched. `guest` and bare `address` are excluded here for
// the same reason as above.
const IDENTITY_ASK_PATTERN =
  /\b(?:customer|client|renter|passenger|driver|travel?ler|booker|cardholder|account\s+holder|lead\s+(?:travel?ler|guest))\b[^.?!]{0,40}\b(?:names?|surname|e-?mails?|phone|telephone|mobile|contact\s+(?:details?|info(?:rmation)?|number))\b/i;

// The reverse word order ("What phone number should the traveler be reached
// on?"). Deliberately much tighter than the forward rule: only PERSONAL
// CONTACT attributes (a venue's phone number is public trip content, so
// "What is the restaurant's phone number?" must survive) and only the
// unambiguous person words — `guest` and `client` are excluded, and `name`
// and bare `address` are excluded, so "the name of the restaurant the guest
// chose" is untouched.
const IDENTITY_ASK_REVERSE_PATTERN =
  /\b(?:e-?mail(?:\s+address)?|phone(?:\s+number)?|telephone|mobile(?:\s+number)?)\b[^.?!]{0,40}\b(?:customer|renter|passenger|driver|travel?ler|cardholder|account\s+holder)\b/i;

const IDENTITY_ASK_LABEL_PATTERN =
  /\b(?:reserved|booked)[-\s_]?by\b|\b(?:home|billing|mailing)\s+address\b|\bname\s+on\s+(?:the\s+)?(?:booking|reservation|ticket|card)\b/i;

export const REVIEW_IDENTITY_TARGET_FIELD_REASON =
  "the question solicits personal identity data, which is never trip content and never a maker decision (RW-PRI-001 + RW-QUE-001; Eli 2026-07-25)";

export const REVIEW_IDENTITY_ASK_REASON =
  "the question asks the maker to supply personal identity data, which the pipeline scrubs from every public field (RW-PRI-001 + RW-QUE-001; Eli 2026-07-25)";

export const REVIEW_IDENTITY_EMPTY_PROMPT_REASON =
  "the question's own prompt was nothing but personal identity data; suppressed whole rather than shown as a husk (RW-PRI-001, CEO decision 2 posture)";

export function isIdentitySolicitingTargetField(
  targetField: string | null | undefined
): boolean {
  if (!targetField) return false;
  const trimmed = targetField.trim();
  if (!trimmed) return false;
  return IDENTITY_TARGET_FIELD_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function asksForIdentityData(text: string | null | undefined): boolean {
  if (!text) return false;
  return (
    IDENTITY_ASK_PATTERN.test(text) ||
    IDENTITY_ASK_REVERSE_PATTERN.test(text) ||
    IDENTITY_ASK_LABEL_PATTERN.test(text)
  );
}

export type ReviewIdentityGateFields = {
  evidence?: string | null;
  guessedValue?: string | null;
  prompt?: string | null;
  reason?: string | null;
  relatedTitle?: string | null;
  targetField?: string | null;
};

export type ReviewIdentityGateResult = {
  // Non-null when the review item must not reach the maker as an open
  // question. The caller dismisses in place with this reason; it never
  // filters the record out and never throws.
  dismissalReason: string | null;
  // Text fields with identity segments removed. A key is present only when
  // its value actually changed, so callers can leave untouched fields alone
  // (and the "changed" signal stays honest for idempotency fixtures).
  scrubbed: Partial<Record<keyof ReviewIdentityGateFields, string | null>>;
  // The identity SHAPES that were removed — never the values, so this is
  // safe in redacted QA bundles and audit evidence (RW-AUD-001 posture,
  // matching evidence-clustering.ts:4624).
  removedSignals: IdentityProseSignal[];
};

const SCRUBBED_TEXT_FIELDS = [
  "prompt",
  "reason",
  "relatedTitle",
  "guessedValue",
  "evidence",
] as const;

// Judges and cleans ONE review detail. Pure: it returns what to change and
// never mutates its input, so the draft boundary and the projection boundary
// can both call it and agree by construction.
//
// Idempotent: a second pass over already-gated fields finds no signals and
// returns an empty `scrubbed` map (the retry/rebuild lane runs this twice —
// the C4 idempotency requirement).
export function applyReviewIdentityGate(
  fields: ReviewIdentityGateFields
): ReviewIdentityGateResult {
  const scrubbed: ReviewIdentityGateResult["scrubbed"] = {};
  const removedSignals: IdentityProseSignal[] = [];

  for (const field of SCRUBBED_TEXT_FIELDS) {
    const value = fields[field];
    if (typeof value !== "string" || !value) continue;
    const signals = findIdentityProseSignals(value);
    if (signals.length === 0) continue;
    const kept = dropIdentityProseSegments(value);
    if (kept === value) continue;
    scrubbed[field] = kept || null;
    for (const signal of signals) {
      if (!removedSignals.includes(signal)) removedSignals.push(signal);
    }
  }

  // Rule 1 — the target field IS the ask.
  if (isIdentitySolicitingTargetField(fields.targetField)) {
    return {
      dismissalReason: REVIEW_IDENTITY_TARGET_FIELD_REASON,
      removedSignals,
      scrubbed,
    };
  }

  // Rule 2 — a generic target field with identity-soliciting prose.
  if (
    asksForIdentityData(fields.prompt) ||
    asksForIdentityData(fields.reason)
  ) {
    return {
      dismissalReason: REVIEW_IDENTITY_ASK_REASON,
      removedSignals,
      scrubbed,
    };
  }

  // Rule 3 — scrubbing emptied the prompt: the question was nothing but an
  // identity value. Suppress whole rather than render a husk (CEO decision 2
  // applied to the review surface).
  const promptWasScrubbed = Object.prototype.hasOwnProperty.call(
    scrubbed,
    "prompt"
  );
  if (promptWasScrubbed && !scrubbed.prompt) {
    return {
      dismissalReason: REVIEW_IDENTITY_EMPTY_PROMPT_REASON,
      removedSignals,
      scrubbed,
    };
  }

  // Otherwise the decision is still material — the maker keeps the question,
  // minus the personal detail that was sitting in its wording.
  return { dismissalReason: null, removedSignals, scrubbed };
}
