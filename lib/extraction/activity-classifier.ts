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
  type DraftActivityCardInput,
} from "@/lib/trip-card-taxonomy";
import { comparableTokens, normalizeText } from "@/lib/extraction/traveler-text";

export type MentionCommitment = "fixed" | "sequenced" | "none";

// A named-site container noun. Shared with grouping (evidence-clustering
// re-exports this as SAME_SITE_CONTAINER_PATTERN) so the site↔component
// relation and same-site grouping can never diverge.
export const SITE_CONTAINER_NOUN_PATTERN =
  /\b(?:castle|palace|complex|grounds|citadel|fortress|acropolis|abbey|monastery)\b/i;

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
      RECOMMENDATION_CATEGORY_PATTERN.test(entry.category ?? "")
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

// --- Recovered-line classification (PB-9) -----------------------------------

// A recovered line with loose-tip vocabulary or a hedge and no standalone
// anchor is a city-note candidate, exactly like parser output would be
// ("Budapest food ideas" and "Eat some 'Za" shipped as loose-tip cards in
// 7.18.3 because recovery records skipped this judgement).
export function classifyRecoveredLineRole(
  input: OwnTextEvidenceInput
): "city_note_candidate" | null {
  const classification = classifyDraftActivityCard(input);
  if (hasStandaloneActivityAnchor(input) || input.confirmation) {
    return null;
  }
  if (
    classification.isLooseTipActivity ||
    classification.hasWeakRecommendationMarker
  ) {
    return "city_note_candidate";
  }
  return null;
}

// --- Shared commitment language (B1) ----------------------------------------

// Re-exported so the LLM resolver and any detector judge commitment with
// the taxonomy's own lexicon instead of a private bare-sight-verb copy.
export { hasCommitmentLanguage };
