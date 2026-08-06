// THE unified activity-vs-city-note / commitment classifier (Arc B, CEO
// decision A-6, 2026-07-18): ONE module judging source structure, list
// shape, and commitment language — never venue knowledge — that the
// parser-output layer, the clustering demotion rules, and the audit
// detectors all import. It replaces the four divergent implementations the
// 2026-07-18 code audit found (taxonomy lexicon, resolver hasPlanSignal,
// pipeline commitment model, audit detector copies — findings B1/B4).
//
// Acceptance criteria carried from live-run 7.18.3
// (docs/assembly-defect-docket-2026-07-18-run6.md):
// - PB-4: a dated idea list (Jan 21: Great Synagogue / Konyv Bar / Mazel
//   Tov / gypsy music / Pinball / Wine Cellar / Ruszwurm) stays City Notes.
// - PB-2: a site container and an "X at <site>" component are grouping
//   structure — sameEntity refuses the merge outright.
// - PB-8: doubt demotion may only fire on a piece's OWN observation text,
//   never on absorbed sibling residue.
// - PB-7: only explicitly committed copies (own time, booking, first-person
//   language) survive as a second visit; sequence-inherited copies fold.
// - "if you want" joins the hedge vocabulary (taxonomy).
// - PB-9: recovered lines route through this classification too.

import {
  classifyDraftActivityCard,
  hasCommitmentLanguage,
  hasLooseTipVocabulary,
  hasStandaloneActivityAnchor,
  SITE_CONTAINER_NOUN_PATTERN,
  type DraftActivityCardInput,
} from "@/lib/trip-card-taxonomy";
import { comparableTokens, normalizeText } from "@/lib/extraction/traveler-text";

export type MentionCommitment = "fixed" | "sequenced" | "none";

// One Activity-candidacy decision for every parser lane. The model emits two
// overlapping labels (`itemType` and `evidenceRole`), and production proved
// that treating either label as an unconditional Activity promotion leaks
// booking/admin fragments into the itinerary. This decision is deliberately
// pure: callers provide source-backed facts, and every caller receives the
// same destination, reason code, and contradiction verdict.
export type ActivityCandidacyEvidenceRole =
  | "accessory_detail"
  | "atomic_candidate"
  | "city_note_candidate"
  | "context"
  | "grouping_proposal"
  | "rejected";

export type ActivityCandidacyDestination =
  | "activity"
  | "accessory"
  | "city_note"
  | "context"
  | "rejected";

export type ActivityCandidacyReasonCode =
  | "AUDITED_COMMITMENT"
  | "BLOCK_AMBIGUOUS"
  | "BLOCK_IDEAS"
  | "BLOCK_PLAN"
  | "EXPLICIT_ACCESSORY"
  | "EXPLICIT_CONTEXT"
  | "EXPLICIT_REJECTED"
  | "GENERIC_OVERVIEW"
  | "ITEM_TYPE_ADMIN"
  | "ITEM_TYPE_NOTE"
  | "LOOSE_REFERENCE"
  | "MODEL_ACTIVITY_DEFAULT";

export type ActivityCandidacyDecision = {
  activityCandidate: boolean;
  contradiction: boolean;
  destination: ActivityCandidacyDestination;
  evidenceRole: ActivityCandidacyEvidenceRole;
  reasonCode: ActivityCandidacyReasonCode;
  winningSignal:
    | "audited_source_commitment"
    | "intent_block"
    | "item_type"
    | "model_default"
    | "source_structure";
};

export type ActivityCandidacyInput = DraftActivityCardInput & {
  evidenceRole?: string | null;
  hasAuditedCommitment?: boolean;
  intentBlockType?: IntentBlockType | null;
  isGenericOverview?: boolean;
  sourceSectionType?: string | null;
};

const ADMIN_ITEM_TYPE_PATTERN =
  /^(?:admin|administrative|accessory|evidence|logistics|receipt|ticket_detail)$/i;

export function decideActivityCandidacy(
  input: ActivityCandidacyInput
): ActivityCandidacyDecision {
  const explicitRole = input.evidenceRole;
  const itemType = normalizeText(input.itemType);
  const hasAuditedCommitment = input.hasAuditedCommitment === true;
  const roleSaysActivity =
    explicitRole === "atomic_candidate" || explicitRole === "grouping_proposal";
  const typeSaysActivity = itemType === "activity";
  const typeSaysNote = itemType === "note";
  const typeSaysAdmin =
    ADMIN_ITEM_TYPE_PATTERN.test(itemType) ||
    (typeSaysNote && input.sourceSectionType === "booking_detail" &&
      /(?:^|[_\s-])(?:admin|logistics?)(?:$|[_\s-])/i.test(
        input.category ?? ""
      ));
  const contradiction = Boolean(
    (roleSaysActivity && (typeSaysNote || typeSaysAdmin)) ||
      (explicitRole === "accessory_detail" && typeSaysActivity) ||
      (explicitRole === "city_note_candidate" && typeSaysActivity)
  );

  const activity = (
    reasonCode: ActivityCandidacyReasonCode,
    winningSignal: ActivityCandidacyDecision["winningSignal"]
  ): ActivityCandidacyDecision => ({
    activityCandidate: true,
    contradiction,
    destination: "activity",
    evidenceRole:
      explicitRole === "grouping_proposal"
        ? "grouping_proposal"
        : "atomic_candidate",
    reasonCode,
    winningSignal,
  });
  const refused = (
    destination: Exclude<ActivityCandidacyDestination, "activity">,
    evidenceRole: ActivityCandidacyEvidenceRole,
    reasonCode: ActivityCandidacyReasonCode,
    winningSignal: ActivityCandidacyDecision["winningSignal"]
  ): ActivityCandidacyDecision => ({
    activityCandidate: false,
    contradiction,
    destination,
    evidenceRole,
    reasonCode,
    winningSignal,
  });

  if (explicitRole === "rejected") {
    return refused("rejected", "rejected", "EXPLICIT_REJECTED", "source_structure");
  }
  if (explicitRole === "context") {
    return refused("context", "context", "EXPLICIT_CONTEXT", "source_structure");
  }
  if (input.isGenericOverview || classifyDraftActivityCard(input).isOverviewActivity) {
    return refused("context", "context", "GENERIC_OVERVIEW", "source_structure");
  }
  // Explicit audited source commitment is the only legal promotion path out
  // of note/admin/accessory material. The caller must prove it from source
  // structure or a resolver decision; model prose alone is not that proof.
  // Context/rejected/overview rows above are structural non-candidates, not
  // weak candidates, so a time or grouping claim can never resurrect them.
  if (hasAuditedCommitment) {
    return activity("AUDITED_COMMITMENT", "audited_source_commitment");
  }
  if (typeSaysAdmin) {
    return refused(
      "accessory",
      "accessory_detail",
      "ITEM_TYPE_ADMIN",
      "item_type"
    );
  }
  if (explicitRole === "accessory_detail") {
    return refused(
      "accessory",
      "accessory_detail",
      "EXPLICIT_ACCESSORY",
      "source_structure"
    );
  }
  if (input.intentBlockType === "ideas") {
    return refused(
      "city_note",
      "city_note_candidate",
      "BLOCK_IDEAS",
      "intent_block"
    );
  }
  if (input.intentBlockType === "ambiguous") {
    // Ambiguous is pending review, not a semantic home. Keep the candidate
    // alive so containment and identity can map source-backed structure.
    // The review phase gives any still-unresolved member its reversible City
    // Note home after grouping has consumed the frozen ledgers.
    return activity("BLOCK_AMBIGUOUS", "intent_block");
  }
  if (typeSaysNote) {
    return refused(
      "city_note",
      "city_note_candidate",
      "ITEM_TYPE_NOTE",
      "item_type"
    );
  }
  if (explicitRole === "city_note_candidate") {
    return refused(
      "city_note",
      "city_note_candidate",
      "LOOSE_REFERENCE",
      "source_structure"
    );
  }
  if (input.intentBlockType === "plan") {
    return activity("BLOCK_PLAN", "intent_block");
  }

  const classification = classifyDraftActivityCard(input);
  if (
    classification.suggestedKind === "city_note" &&
    (classification.isLooseTipActivity ||
      classification.hasWeakRecommendationMarker ||
      !input.date ||
      (!typeSaysActivity && !roleSaysActivity))
  ) {
    return refused(
      "city_note",
      "city_note_candidate",
      "LOOSE_REFERENCE",
      "source_structure"
    );
  }
  return activity("MODEL_ACTIVITY_DEFAULT", "model_default");
}

// A named-site container noun. Shared with grouping (evidence-clustering
// re-exports this as SAME_SITE_CONTAINER_PATTERN) so the site↔component
// relation and same-site grouping can never diverge. Defined in
// lib/trip-card-taxonomy.ts (Task C2, 2026-08-04 work order) — this module
// already imports from that one, so defining it there instead of here
// avoids an import cycle. Re-exported under the same name so this module's
// own callers (evidence-clustering.ts, geocode-verification.ts) don't need
// to change their import path.
export { SITE_CONTAINER_NOUN_PATTERN };

// --- Own-text evidence ------------------------------------------------------

export type OwnTextEvidenceInput = DraftActivityCardInput & {
  confirmation?: string | null;
};

export type OwnTextClassification = {
  // True when any of the entity's OWN texts carries a hedge/doubt marker
  // ("maybe", "if time", "if you want", "(far away)").
  hasHedgeMarker: boolean;
  // True when any of the entity's OWN texts carries fixed commitment
  // evidence: a time, a confirmation, or first-person planned language.
  hasFixedCommitment: boolean;
};

// Judges an entity's OWN texts — its observations, before any merge could
// append absorbed sibling residue. Live-run 7.18.3 PB-8: Prague Castle was
// hedge-demoted because a doubt marker rode in on ABSORBED description
// fragments from Certovka/Lennon/Novy Svet; the doubt belonged to the
// siblings, not the castle.
export function classifyOwnTextEvidence(
  entries: OwnTextEvidenceInput[]
): OwnTextClassification {
  let hasHedgeMarker = false;
  let hasFixedCommitment = false;
  for (const entry of entries) {
    const classification = classifyDraftActivityCard(entry);
    if (classification.hasWeakRecommendationMarker) {
      hasHedgeMarker = true;
    }
    if (
      Boolean(entry.startTime) ||
      Boolean(entry.confirmation) ||
      classification.hasStrongPlannedActivityLanguage
    ) {
      hasFixedCommitment = true;
    }
  }
  return { hasFixedCommitment, hasHedgeMarker };
}

// --- Commitment rule of evidence (RW-CLS-001 / RW-CAN-001) ------------------

// A mention is FIXED when its own evidence carries a time, a booking, or
// first-person planned language. It is SEQUENCED when it is hedge-free (on
// its OWN text) inside a day with three or more explicitly timed
// activities. Everything else is NONE. Sequence inheritance is placement
// evidence, never repeat evidence: a sequenced copy can hold a card, but
// only FIXED copies survive as a second visit (RW-CAN-001 supersession —
// distinct dates alone are not affirmative repeat evidence; live-run
// 7.18.3 PB-7 kept a sixth-run Pinball duplicate on exactly that gap).
export function resolveMentionCommitment({
  date,
  hasFixedEvidence,
  ownTextHedge,
  timedCardCountForDate,
}: {
  date: string | null;
  hasFixedEvidence: boolean;
  ownTextHedge: boolean;
  timedCardCountForDate: number;
}): MentionCommitment {
  if (hasFixedEvidence) return "fixed";
  if (date && !ownTextHedge && timedCardCountForDate >= 3) return "sequenced";
  return "none";
}

// --- Site ↔ component relation (PB-2) ---------------------------------------

const COMPONENT_AT_SITE_PATTERN = /^(.{2,80}?)\s+(?:at|inside|within)\s+(.{2,80})$/i;

function titleTokenSet(value: string) {
  return new Set(comparableTokens(value));
}

function tokenOverlap(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

// "Palm House at Schonbrunn" vs "Schonbrunn Palace visit" are grouping
// structure (a component inside its site), never duplicates. Live-run
// 7.18.3 PB-2: the component beat the site in the near-identical collapse
// (3 component tokens outranked 2 site tokens on the specificity rung) and
// the fused piece then lost title containment because its title had
// drifted. sameEntity refuses the pair outright — no winner is ever picked.
export function isSiteComponentTitlePair(
  leftTitle: string | null | undefined,
  rightTitle: string | null | undefined
) {
  const left = normalizeText(leftTitle);
  const right = normalizeText(rightTitle);
  if (!left || !right) return false;

  const judge = (component: string, site: string) => {
    const match = COMPONENT_AT_SITE_PATTERN.exec(component);
    if (!match) return false;
    // A meal-prefix title ("Breakfast at Cafe Central") is venue aliasing,
    // not site structure — the 7.17.2 meal-prefix fold must keep working.
    if (/^(?:breakfast|brunch|lunch|dinner|coffee|drinks?|eat|meal)\b/i.test(match[1])) {
      return false;
    }
    const siteTail = titleTokenSet(match[2]);
    if (siteTail.size === 0) return false;
    const other = titleTokenSet(site);
    // The component's "at <site>" tail names the other card's entity.
    return tokenOverlap(siteTail, other) >= 1;
  };

  if (judge(left, right) || judge(right, left)) {
    // Component vs its named site — refuse. Also covers component vs
    // component of the same site ("Palm House at X" / "Orangerie at X").
    return true;
  }
  return false;
}

// --- Idea-list section detection (PB-4 / A-6) -------------------------------

export type IdeaListEntry = {
  id: string;
  category: string | null;
  date: string | null;
  sectionLabel: string | null;
  headingPath: string[] | null;
  title: string | null;
  description: string | null;
  // Fixed commitment on OWN evidence (time, booking, first-person).
  hasFixedEvidence: boolean;
  ownTextHedge: boolean;
};

// A dated day-plan section label ("Monday, January 21st …"). Dated cards
// whose source section is NOT a day-plan section are promoted list entries
// from a notes blob.
export const DAY_PLAN_LABEL_PATTERN =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i;

// Recommendation-family categories: RW-CLS-001's "a dated category-only
// list such as several restaurants under a day remains City Notes".
const RECOMMENDATION_CATEGORY_PATTERN =
  /food|dining|nightlife|drink|bar|cafe|shopping|social/i;

export function isRecommendationActivityCategory(category: string | null) {
  return RECOMMENDATION_CATEGORY_PATTERN.test(category ?? "");
}

function entryIdeaVocabularySignal(entry: IdeaListEntry) {
  return (
    entry.ownTextHedge ||
    hasLooseTipVocabulary(
      [entry.title ?? "", entry.description ?? ""].join(" ")
    )
  );
}

function sectionIdeaVocabularySignal(entry: IdeaListEntry) {
  return hasLooseTipVocabulary(
    [entry.sectionLabel ?? "", ...(entry.headingPath ?? [])].join(" ")
  );
}

// Source intent for a whole dated list (RW-CLS-001): "a dated category-only
// list … remains City Notes unless the source selects, sequences, books, or
// assigns a slot to an entry", "a source-authored … recommendation,
// category list, optional list, or background note belongs in City Notes",
// and "a loose ideas list after the itinerary remains City Notes".
//
// A same-day source section is an IDEA LIST when it holds three or more
// uncommitted entries, NONE of its entries carries fixed commitment, and
// any of these source-intent signals is present:
//   (a) idea/hedge vocabulary on the section or any entry;
//   (b) the entries' source section is NOT a day-plan section (dated cards
//       minted from a notes blob — labels are required evidence: unlabeled
//       sections are never judged, mirroring the source-truth posture);
//   (c) a recommendation-family majority — at least half the entries are
//       food/drink/nightlife/shopping/social (the live Jan-21 shape:
//       gypsy music + Konyv Bar + Mazel Tov + Wine Cellar + Ruszwurm
//       around Great Synagogue and Pinball).
// A section with even one fixed entry (a time, a booking, a meal slot,
// first-person language) is a day plan and every entry keeps the benefit
// of the doubt — the Jan 20 short deliberate list ("Breakfast at Cafe
// Central …") stays activities, and a crowded untimed SIGHTS day (the
// discovered-walk lane's whole candidate pool) is never demoted by shape
// alone.
export function classifyIdeaListSections(entries: IdeaListEntry[]) {
  const demote = new Set<string>();
  const groups = new Map<string, IdeaListEntry[]>();

  for (const entry of entries) {
    if (!entry.date) continue;
    // Day-plan labels unify per date (live-run 7.21.0, run7 PC-3): the
    // parser emitted "Monday, January 21st" for some entries and "Monday,
    // January 21st Train to Budapest // Budapest Bathing" for others,
    // fragmenting one source list below the 3-entry floor. Non-day-plan
    // labels (notes blobs) keep their identity — they are the evidence for
    // signal (b).
    const label = normalizeText(entry.sectionLabel) || "(none)";
    const key = DAY_PLAN_LABEL_PATTERN.test(entry.sectionLabel ?? "")
      ? `${entry.date}|(day-plan)`
      : `${entry.date}|${label}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  for (const group of groups.values()) {
    if (group.length < 3) continue;
    if (group.some((entry) => entry.hasFixedEvidence)) continue;

    const vocabularySignal = group.some(
      (entry) => entryIdeaVocabularySignal(entry) || sectionIdeaVocabularySignal(entry)
    );
    const labeled = group.filter((entry) =>
      Boolean(normalizeText(entry.sectionLabel))
    );
    const notesBlobSignal =
      labeled.length === group.length &&
      labeled.every(
        (entry) =>
          !DAY_PLAN_LABEL_PATTERN.test(
            [entry.sectionLabel ?? "", ...(entry.headingPath ?? [])].join(" ")
          )
      );
    const recommendationCount = group.filter((entry) =>
      isRecommendationActivityCategory(entry.category)
    ).length;
    const recommendationMajority =
      recommendationCount * 2 >= group.length;

    if (!vocabularySignal && !notesBlobSignal && !recommendationMajority) {
      continue;
    }

    for (const entry of group) {
      demote.add(entry.id);
    }
  }

  return demote;
}

// --- Coherent intent blocks (RW-CLS-001, 2026-08-05) ----------------------

export type IntentBlockType =
  | "plan"
  | "ideas"
  | "logistics"
  | "evidence"
  | "ambiguous";

export type IntentBlockEntry = {
  approxLatitude: number | null;
  approxLongitude: number | null;
  // True when intervening source observations change from candidate cards to
  // context/note material. A date heading alone is never a boundary or an
  // intent signal.
  boundaryBefore: boolean;
  category: string | null;
  date: string;
  hasExplicitChoice: boolean;
  hasFixedEvidence: boolean;
  hasHedgeMarker: boolean;
  // The immediately preceding source observation is already typed as note
  // or context. This is a local block-boundary fact, not a day-wide signal.
  ideaContextBefore?: boolean;
  ideaContextObservationId?: string | null;
  hasIdeaSignal: boolean;
  hasResearchEvidence: boolean;
  // A parser Activity belongs to a dated day-plan source section and carries
  // no local note/research/hedge evidence. This is weaker than a booking,
  // time, explicit source verb, or site-containment plan: block-level idea
  // evidence must get the first chance to refuse it.
  hasDayPlanMembership: boolean;
  // A hedge-free candidate sits on a day with enough fixed slots to infer
  // sequence. Like day-plan membership, this is weaker than block-level idea
  // evidence and therefore belongs in the neutral fallback, not strongIntent.
  hasSequencedDayPlan: boolean;
  // Source-supported site containment, not geographic proximity by itself.
  hasSourceSupportedPlan: boolean;
  // A recommendation-category majority is meaningful only inside an actual
  // source section. Parser arrays with no labels keep the benefit of doubt.
  hasSourceStructure: boolean;
  id: string;
  itemType: string | null;
  observationIds: string[];
  sourceKey: string;
  sourceOrder: number;
  title: string;
  verifiedLatitude: number | null;
  verifiedLongitude: number | null;
};

export type IntentBlockDecision = {
  blockId: string;
  date: string;
  memberIds: string[];
  memberTitles: string[];
  observationIds: string[];
  reason: string;
  type: IntentBlockType;
};

export type IntentBlockClassification = {
  blocks: IntentBlockDecision[];
  entryTypes: Map<string, IntentBlockType>;
};

const INTENT_BLOCK_RADIUS_KM = 2;
const DENSITY_REEVALUATION_FLOOR = 7;
const LOGISTICS_PATTERN = /admin|logistics|errand|laundry/i;
const EVIDENCE_PATTERN = /accessory|evidence|receipt|ticket_detail/i;

function finiteIntentCoordinate(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coordinateForIntent(
  entry: IntentBlockEntry,
  geocodeVerificationRan: boolean
) {
  const verifiedLat = finiteIntentCoordinate(entry.verifiedLatitude);
  const verifiedLng = finiteIntentCoordinate(entry.verifiedLongitude);
  if (verifiedLat !== null && verifiedLng !== null) {
    return { lat: verifiedLat, lng: verifiedLng };
  }
  // Once verification ran anywhere in the trip, production's locked policy
  // refuses parser coordinates. Classification follows the same rule: a
  // missing verified result means "no geographic evidence", not permission to
  // fall back to plausible-looking model numbers.
  if (geocodeVerificationRan) return null;
  const approxLat = finiteIntentCoordinate(entry.approxLatitude);
  const approxLng = finiteIntentCoordinate(entry.approxLongitude);
  return approxLat !== null && approxLng !== null
    ? { lat: approxLat, lng: approxLng }
    : null;
}

function intentDistanceKm(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const deltaLat = radians(right.lat - left.lat);
  const deltaLng = radians(right.lng - left.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sourceSegments(entries: IntentBlockEntry[]) {
  const groups = new Map<string, IntentBlockEntry[]>();
  for (const entry of entries) {
    const key = `${entry.date}|${entry.sourceKey}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  const segments: IntentBlockEntry[][] = [];
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder || left.id.localeCompare(right.id)
    );
    let current: IntentBlockEntry[] = [];
    for (const entry of group) {
      if (entry.boundaryBefore && current.length > 0) {
        segments.push(current);
        current = [];
      }
      current.push(entry);
    }
    if (current.length > 0) segments.push(current);
  }
  return segments;
}

// Geography identifies where a source-contiguous run stops being coherent;
// it never establishes intent. Connected components avoid one bad adjacent
// lookup cutting a legitimate run in two. A single isolated point beside a
// 3+ member component is treated as the expected anomalous lookup, not as a
// new block (work-order production guard).
function geographicComponents(
  entries: IntentBlockEntry[],
  geocodeVerificationRan: boolean
) {
  if (entries.length < 2) return [entries];
  const coordinates = entries.map((entry) =>
    coordinateForIntent(entry, geocodeVerificationRan)
  );
  const positioned = coordinates
    .map((coordinate, index) => (coordinate ? index : -1))
    .filter((index) => index >= 0);
  if (positioned.length < 2) return [entries];

  const parent = entries.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let left = 0; left < positioned.length; left += 1) {
    for (let right = left + 1; right < positioned.length; right += 1) {
      const leftIndex = positioned[left];
      const rightIndex = positioned[right];
      if (
        intentDistanceKm(
          coordinates[leftIndex] as { lat: number; lng: number },
          coordinates[rightIndex] as { lat: number; lng: number }
        ) <= INTENT_BLOCK_RADIUS_KM
      ) {
        union(leftIndex, rightIndex);
      }
    }
  }

  const rootByPositionedIndex = new Map<number, number>();
  for (const index of positioned) rootByPositionedIndex.set(index, find(index));
  // Missing verified coordinates inherit the nearest source neighbor's
  // component. This preserves source coherence without converting missing
  // geography into positive geographic evidence.
  for (let index = 0; index < entries.length; index += 1) {
    if (coordinates[index]) continue;
    const nearest = positioned.reduce(
      (best, candidate) =>
        best === null || Math.abs(candidate - index) < Math.abs(best - index)
          ? candidate
          : best,
      null as number | null
    );
    if (nearest !== null) rootByPositionedIndex.set(index, find(nearest));
  }

  const components = new Map<number, IntentBlockEntry[]>();
  for (let index = 0; index < entries.length; index += 1) {
    const root = rootByPositionedIndex.get(index) ?? index;
    const component = components.get(root);
    if (component) component.push(entries[index]);
    else components.set(root, [entries[index]]);
  }
  const split = [...components.values()].sort(
    (left, right) => left[0].sourceOrder - right[0].sourceOrder
  );
  const singletons = split.filter((component) => component.length === 1);
  const large = split.filter((component) => component.length >= 3);
  if (split.length === 2 && singletons.length === 1 && large.length === 1) {
    return [[...entries]];
  }
  return split;
}

function strongIntent(entry: IntentBlockEntry): IntentBlockType | null {
  // Parser category is presentation metadata, not commitment. Production's
  // Jan-20 Laundry row was an explicit Activity in a dated plan but carried
  // category `admin_logistics`; treating that category as a role silently
  // inverted the source. Only the item role itself may force logistics or
  // evidence here. The shared candidacy decision has already resolved any
  // itemType/evidenceRole contradiction before this block judgement.
  const roleText = entry.itemType ?? "";
  if (LOGISTICS_PATTERN.test(roleText)) return "logistics";
  if (EVIDENCE_PATTERN.test(roleText)) return "evidence";
  if (
    entry.hasFixedEvidence ||
    entry.hasSourceSupportedPlan ||
    entry.hasExplicitChoice
  ) {
    return "plan";
  }
  if (
    entry.hasHedgeMarker ||
    entry.hasIdeaSignal ||
    entry.ideaContextBefore
  ) return "ideas";
  return null;
}

function recommendationMajority(entries: IntentBlockEntry[]) {
  const candidates = entries.filter(
    (entry) => strongIntent(entry) !== "logistics" && strongIntent(entry) !== "evidence"
  );
  if (candidates.length < 3) return false;
  if (!candidates.every((entry) => entry.hasSourceStructure)) return false;
  const recommendationCount = candidates.filter((entry) =>
    isRecommendationActivityCategory(entry.category)
  ).length;
  return recommendationCount * 2 >= candidates.length;
}

export function classifyIntentBlocks(
  entries: IntentBlockEntry[],
  {
    geocodeVerificationRan,
  }: {
    geocodeVerificationRan: boolean;
  }
): IntentBlockClassification {
  const entryTypes = new Map<string, IntentBlockType>();
  const blocks: IntentBlockDecision[] = [];
  const datedCandidates = entries.filter((entry) => Boolean(entry.date));
  const strongPlanDates = new Set(
    datedCandidates
      .filter((entry) => strongIntent(entry) === "plan")
      .map((entry) => entry.date)
  );
  const candidateCountByDate = new Map<string, number>();
  for (const entry of datedCandidates) {
    const strong = strongIntent(entry);
    if (strong === "logistics" || strong === "evidence") continue;
    candidateCountByDate.set(
      entry.date,
      (candidateCountByDate.get(entry.date) ?? 0) + 1
    );
  }

  const components = sourceSegments(datedCandidates).flatMap((segment) =>
    geographicComponents(segment, geocodeVerificationRan)
  );
  components.sort(
    (left, right) =>
      left[0].date.localeCompare(right[0].date) ||
      left[0].sourceOrder - right[0].sourceOrder ||
      left[0].id.localeCompare(right[0].id)
  );

  components.forEach((component, componentIndex) => {
    const strongById = new Map(
      component.map((entry) => [entry.id, strongIntent(entry)])
    );
    // Fixed/sequence evidence and an explicit source choice can commit their
    // coherent peers. Site containment is intentionally item-scoped: verified
    // proximity alone may split blocks but may never turn an unrelated nearby
    // venue into part of the plan (the geocoder echo failure this arc pins).
    const hasPropagatingPlanAnchor = component.some(
      (entry) =>
        entry.hasSourceStructure &&
        (entry.hasFixedEvidence || entry.hasExplicitChoice)
    );
    const hasIdeaAnchor = component.some(
      (entry) => strongById.get(entry.id) === "ideas"
    );
    const researchCount = component.filter(
      (entry) => entry.hasResearchEvidence
    ).length;
    const date = component[0].date;
    let neutralType: IntentBlockType;
    let neutralReason: string;
    if (hasPropagatingPlanAnchor) {
      neutralType = "plan";
      neutralReason =
        "source-contiguous block inherits fixed, sequenced, explicit-choice, or source-supported site-plan evidence";
    } else if (hasIdeaAnchor || recommendationMajority(component)) {
      neutralType = "ideas";
      neutralReason =
        "source-contiguous block carries hedge, recommendation, category-list, or city-reference evidence";
    } else if (researchCount >= 2) {
      neutralType = "ambiguous";
      neutralReason =
        "multiple researched alternatives carry no source-supported selection; preserve pending one consolidated decision";
    } else if (
      component.some(
        (entry) => entry.hasDayPlanMembership || entry.hasSequencedDayPlan
      )
    ) {
      neutralType = "plan";
      neutralReason =
        "source-contiguous parser Activities carry day-plan membership or sequenced-day evidence with no contrary idea, hedge, or research evidence";
    } else if (
      strongPlanDates.has(date) &&
      (candidateCountByDate.get(date) ?? 0) >= DENSITY_REEVALUATION_FLOOR
    ) {
      neutralType = "ideas";
      neutralReason =
        "density re-evaluation found a separate uncommitted block beside a source-supported plan block";
    } else {
      neutralType = "ambiguous";
      neutralReason =
        "source evidence does not distinguish selected plan from ideas; preserve rather than infer";
    }

    const finalByType = new Map<IntentBlockType, IntentBlockEntry[]>();
    for (const entry of component) {
      const strong = strongById.get(entry.id);
      const finalType = strong ?? neutralType;
      entryTypes.set(entry.id, finalType);
      const group = finalByType.get(finalType);
      if (group) group.push(entry);
      else finalByType.set(finalType, [entry]);
    }
    for (const [type, members] of finalByType) {
      const reason =
        type === "logistics"
          ? "item carries source-supported logistics/admin role"
          : type === "evidence"
            ? "item carries accessory/evidence role"
            : type === "plan" && members.some((entry) => strongIntent(entry) === "plan")
              ? "block contains fixed, sequenced, explicit-choice, or source-supported site-plan evidence"
              : type === "ideas" && members.some((entry) => strongIntent(entry) === "ideas")
                ? "item or block carries explicit hedge/idea evidence"
                : neutralReason;
      blocks.push({
        blockId: `intent-${date}-${componentIndex + 1}-${type}`,
        date,
        memberIds: members.map((entry) => entry.id),
        memberTitles: members.map((entry) => entry.title),
        observationIds: Array.from(
          new Set(members.flatMap((entry) => entry.observationIds))
        ),
        reason,
        type,
      });
    }
  });

  return { blocks, entryTypes };
}

// --- Recovered-line classification (PB-9) -----------------------------------

// A recovered line with loose-tip vocabulary or a hedge and no standalone
// anchor is a city-note candidate, exactly like parser output would be
// ("Budapest food ideas" and "Eat some 'Za" shipped as loose-tip cards in
// 7.18.3 because recovery records skipped this judgement).
export function classifyRecoveredLineRole(
  input: OwnTextEvidenceInput
): "city_note_candidate" | null {
  const decision = decideRecoveredActivityCandidacy(input);
  return decision.destination === "city_note" ? "city_note_candidate" : null;
}

export function decideRecoveredActivityCandidacy(
  input: OwnTextEvidenceInput & { evidenceRole?: string | null }
) {
  const roleOrTypeRefusesPromotion = Boolean(
    input.evidenceRole === "accessory_detail" ||
      input.evidenceRole === "city_note_candidate" ||
      normalizeText(input.itemType) === "note" ||
      ADMIN_ITEM_TYPE_PATTERN.test(normalizeText(input.itemType))
  );
  return decideActivityCandidacy({
    ...input,
    evidenceRole: input.evidenceRole,
    hasAuditedCommitment:
      !roleOrTypeRefusesPromotion &&
      Boolean(
        input.confirmation ||
          input.startTime ||
          classifyDraftActivityCard(input).hasStrongPlannedActivityLanguage
      ),
  });
}

// --- Shared commitment language (B1) ----------------------------------------

// Re-exported so the LLM resolver and any detector judge commitment with
// the taxonomy's own lexicon instead of a private bare-sight-verb copy.
export { hasCommitmentLanguage };
