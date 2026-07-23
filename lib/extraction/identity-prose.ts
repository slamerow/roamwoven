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

// ---------------------------------------------------------------------------
// Prose-side protected-code shapes (Arc F, run 7.23.2 chain 3).
//
// The output-boundary sweep's deny list is built from CAPTURED protected
// values (stay/transport fields + sensitive-detail code tokens). Run 7.23.2
// proved that protection fails silently under parse variance: the parser
// captured NEITHER "travel code 0468406277" (RegioJet) nor "ticket code
// 2159 1990 1842 0436" (OBB) in any protected slot, the deny list came up
// empty for them, and both GT-protected codes shipped in real transport
// descriptions. These predicates judge the PROSE ITSELF, so protection no
// longer depends on the parse having also captured the value elsewhere.
//
// Scope (RW-PRI-001, Delta-2 privacy ruling): this pass exists for the
// protected classes — stay and inter-city travel prose. Activity booking
// references are deliberately PUBLIC; callers must not apply these shapes
// to ordinary activity/note prose.
//
// Exemptions (7.23.1 handoff, CEO item 2): flight-code shapes ("FR8331",
// "RJ1033"), date shapes, and clock times are itinerary content, never
// protected codes. Pure-letter all-caps runs ("UNESCO", "FCO", shouted
// words) are also exempt HERE — unlike captured sensitive values, prose
// acronyms are overwhelmingly not booking locators, and the capture-side
// deny list still sweeps letter-only locators it has actually seen.

const CODE_TOKEN_FLIGHT_PATTERN = /^[A-Z]{1,2}\d{3,4}$/;
const CODE_TOKEN_DATE_PATTERNS = [
  /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/,
  /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/,
];
const CODE_TOKEN_CLOCK_PATTERN =
  /^\d{1,2}[:.]\d{2}(?:\s*[-–]\s*\d{1,2}[:.]\d{2})?$/;

function isExemptCodeToken(token: string) {
  return (
    CODE_TOKEN_FLIGHT_PATTERN.test(token) ||
    CODE_TOKEN_DATE_PATTERNS.some((pattern) => pattern.test(token)) ||
    CODE_TOKEN_CLOCK_PATTERN.test(token)
  );
}

// Every protected-code-shaped token in a prose string, in order:
// - spaced/dashed digit runs with >= 7 digits ("0468406277",
//   "2159 1990 1842 0436") that are not date or clock shapes;
// - mixed letter+digit tokens of >= 5 chars ("2159A990X") that are not
//   flight-code or date shapes.
export function findProtectedCodeShapedTokens(prose: string): string[] {
  if (!prose) return [];
  const tokens: string[] = [];
  for (const match of prose.matchAll(/\+?\d[\d ()./-]{5,}\d/g)) {
    const token = match[0].trim();
    const digitCount = (token.match(/\d/g) ?? []).length;
    if (digitCount >= 7 && !isExemptCodeToken(token)) {
      tokens.push(token);
    }
  }
  for (const match of prose.matchAll(/#?\b[A-Za-z0-9-]{5,}\b/g)) {
    const token = match[0].replace(/^#/, "");
    if (
      /[A-Za-z]/.test(token) &&
      /\d/.test(token) &&
      !isExemptCodeToken(token) &&
      !tokens.some((existing) => existing.includes(token))
    ) {
      tokens.push(token);
    }
  }
  return tokens;
}

// Dangling code-label phrases left behind once their token is removed
// ("travel code", "Ticketcode:") — swept so scrubbed prose reads clean.
const DANGLING_CODE_LABEL_PATTERN =
  /\b(?:travel|ticket|booking|confirmation)\s*[- ]?code\s*[:#]?\s*(?=[.,;:)\]]|$)/gi;

// Removes every protected-code-shaped token from prose and tidies the
// leftovers. Returns the input unchanged when nothing matches. Callers:
// the output-boundary sweep (transport/stay prose) and nothing else — the
// audit detector reports tokens via findProtectedCodeShapedTokens instead
// of mutating.
export function scrubProtectedCodeShapedTokens(prose: string): string {
  const tokens = findProtectedCodeShapedTokens(prose);
  if (tokens.length === 0) return prose;
  let result = prose;
  for (const token of tokens.sort((a, b) => b.length - a.length)) {
    let index = result.indexOf(token);
    while (index !== -1) {
      const hadHash = result[index - 1] === "#";
      const start = hadHash ? index - 1 : index;
      result = `${result.slice(0, start)}${result.slice(index + token.length)}`;
      index = result.indexOf(token);
    }
  }
  return result
    .replace(DANGLING_CODE_LABEL_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}
