// Shared identity-prose predicates (RW-PRI-001 content hygiene, RW-AUD-001
// detector parity). Personal identity data — a traveler's name block, home
// street address, phone number, or email — is not trip content at all; it is
// scrubbed from public card prose as content hygiene, not gated behind
// privacy. The pipeline scrub (evidence-clustering's output-boundary
// sanitizer) and the audit's identity-leak P0 detector must judge the SAME
// shapes, so both import these predicates instead of keeping private copies
// (detector drift was audit finding B4; live-run 7.18.3 PB-1 proved the
// cost: the scrub's private pattern required "Customer:" with a colon, so
// "Customer Eli kamerow. 1225 Harvard street nw, 20009 Washington, USA."
// shipped verbatim in rental-car activity prose and NO detector raised).
//
// Scope notes (Δ2 privacy ruling, 2026-07-17): reservation and booking
// numbers are deliberately NOT identity shapes — activity/tour/rental
// booking references are public. These predicates target the identity block
// itself: role-labelled names, postal home addresses, phones, emails.

// A booking template's role label introducing a person's name — with OR
// without the colon ("Customer: Eli" and "Customer Eli kamerow" are the
// same leak; 7.18.3 shipped the colon-less form). The colon-less branch
// requires a capitalized name-shaped token after the role word so prose
// like "driver will meet you" is untouched. Bare "guest" stays out of the
// role list ("Guest House Prague" is a venue, not an identity block).
const IDENTITY_ROLE_NAME_PATTERN =
  /\b(?:[Cc]ustomer|[Rr]enter|[Dd]river|[Pp]assenger|[Ll]ead\s+(?:[Tt]raveler|[Gg]uest))\s*(?::|\s+[A-Z][\w'’-]+)/;

// Postal home-address shape: a street number, street words, a street-type
// word, and a 4-6 digit postal code later in the same segment
// ("1225 Harvard street nw, 20009 Washington, USA"). Requiring the postal
// code keeps sight titles like "221B Baker Street" out of scope — a
// landmark mention does not carry the writer's postal code beside it.
const STREET_ADDRESS_PATTERN =
  /\b\d{1,5}[a-z]?\s+(?:[A-Za-z][\w'’.-]*\s+){1,4}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|square|sq|terrace|ter|way)\b[^,;:]{0,20}[,;]?[^,;:]{0,30}\b\d{4,6}\b/i;

// Phone shapes: a labelled phone anywhere in the segment, an
// international-prefixed number anywhere, a US-styled number anywhere, or
// the legacy trailing digit-run (kept for continuity with the wave-1 scrub).
const LABELLED_PHONE_PATTERN =
  /\b(?:phone|tel(?:ephone)?|mobile|cell)\b\s*[:.]?\s*\+?\d[\d\s().-]{6,}/i;
const INTERNATIONAL_PHONE_PATTERN = /\+\d[\d\s().-]{7,}\d/;
const US_PHONE_PATTERN = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;
const TRAILING_PHONE_PATTERN = /(?:\+?\d[\d\s().-]{8,}\d)\s*$/;

const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;

export type IdentityProseSignal =
  | "email"
  | "phone"
  | "role_labelled_name"
  | "street_address";

// Returns the identity shape a prose segment carries, or null. Callers that
// only need a boolean can use segmentCarriesIdentityValues; the audit
// detector reports the signal name as reconciliation evidence.
export function findIdentityProseSignal(
  segment: string
): IdentityProseSignal | null {
  if (!segment) return null;
  if (EMAIL_PATTERN.test(segment)) return "email";
  if (IDENTITY_ROLE_NAME_PATTERN.test(segment)) return "role_labelled_name";
  if (STREET_ADDRESS_PATTERN.test(segment)) return "street_address";
  if (
    LABELLED_PHONE_PATTERN.test(segment) ||
    INTERNATIONAL_PHONE_PATTERN.test(segment) ||
    US_PHONE_PATTERN.test(segment) ||
    TRAILING_PHONE_PATTERN.test(segment)
  ) {
    return "phone";
  }
  return null;
}

export function segmentCarriesIdentityValues(segment: string) {
  return findIdentityProseSignal(segment) !== null;
}

// Sentence segmentation shared with the pipeline scrub so the audit detector
// judges the same segment boundaries ("St. Stephen's" never splits at the
// abbreviation — the live-run 7.18.0 truncation).
export const IDENTITY_PROSE_SEGMENT_SPLIT =
  /(?<=[.!?])(?<!\b(?:st|mt|dr|mr|mrs|ms|vs|no|approx)\.)\s+/i;

// Scans whole prose (not a single segment) and reports every identity
// signal found, deduplicated, in segment order. Used by the audit's
// identity-leak P0 detector, which must run on UNREDACTED prose — the QA
// bundle's redaction markers made live-run 7.18.3 LOOK clean to the
// auditor while the real card text carried the full identity block.
export function findIdentityProseSignals(prose: string): IdentityProseSignal[] {
  if (!prose) return [];
  const signals: IdentityProseSignal[] = [];
  for (const segment of prose.split(IDENTITY_PROSE_SEGMENT_SPLIT)) {
    const signal = findIdentityProseSignal(segment.trim());
    if (signal && !signals.includes(signal)) {
      signals.push(signal);
    }
  }
  return signals;
}
