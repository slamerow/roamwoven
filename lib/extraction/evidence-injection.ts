// Deterministic verbatim-evidence injection (Arc E, live-run 7.22.4).
//
// The parser prompt makes `evidence` a schema-required verbatim quote for
// every untimed, unbooked activity card, because own-text hedge/commitment
// stamping (RW-CLS-001 Arc C) judges the source's own words. gpt-5.4-mini
// nulls the field anyway: run 7.22.4 shipped 0/140 lineage rows with
// evidence, own-text stamping fell back to merged prose, and Prague Castle
// was doubt-demoted on a "(far away)" hedge that belongs to R2D2's absorbed
// description fragment.
//
// This module fills the field WITHOUT model cooperation: at intake, while a
// payload still belongs to its producing chunk, the activity's distinctive
// title tokens are line-matched against that chunk's OWN source text and
// the matched source line is injected verbatim. Guard rails:
//   - model-provided evidence that verifies as a verbatim excerpt is kept
//     untouched ("model_verbatim" — the audit rider tells us if mini ever
//     complies on its own);
//   - a line must contain EVERY distinctive title token — a hedge line for
//     another venue can never land on this card;
//   - an ambiguous match (several lines, e.g. day-plan + notes-blob copies)
//     is only resolved when the payload's own sourceSectionLabel locates
//     its section in the chunk; otherwise nothing is injected — a wrong
//     hedge injection would misclassify a card, absence just preserves
//     today's behavior (RW-OPS-001: the no-match outcome is the status quo,
//     never a new failure state);
//   - injection annotates (`_evidenceProvenance`); it never creates
//     observations, never changes dispositions (RW-EVD-001), never retries.

import { isBoilerplateSourceLine, distinctiveLineTokens } from "@/lib/extraction/source-coverage";

export type EvidenceProvenance =
  | "model_verbatim"
  | "line_match_injected"
  | "model_unverified"
  | "absent";

const MAX_INJECTED_EVIDENCE_CHARS = 500;

function foldForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stringField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function injectVerbatimActivityEvidence(
  payload: Record<string, unknown>,
  sourceText: string | null | undefined
): EvidenceProvenance | null {
  // Scope: untimed, unbooked activity-shaped payloads — the exact set the
  // prompt's evidence rule covers. Timed/booked cards may set null
  // legitimately; note payloads are judged by the note pipeline.
  if (stringField(payload, "itemType") === "note") return null;
  if (stringField(payload, "startTime")) return null;
  if (stringField(payload, "confirmation")) return null;
  const title = stringField(payload, "title");
  if (!title) return null;

  const stamp = (provenance: EvidenceProvenance) => {
    payload._evidenceProvenance = provenance;
    return provenance;
  };

  const modelEvidence = stringField(payload, "evidence");
  const foldedSource = sourceText ? foldForMatch(sourceText) : "";

  if (modelEvidence) {
    if (
      foldedSource.length > 0 &&
      foldForMatch(modelEvidence).length >= 4 &&
      foldedSource.includes(foldForMatch(modelEvidence))
    ) {
      return stamp("model_verbatim");
    }
    // Paraphrased/unverifiable model evidence is kept (it may still carry a
    // real hedge) but marked, so the bundle shows the compliance picture.
    if (!sourceText) return null;
    // fall through: a verbatim own line beats a paraphrase when one is
    // unambiguously found.
  }

  if (!sourceText) {
    // Spine/fixture stages are never judged (source-truth posture).
    return modelEvidence ? null : null;
  }

  const titleTokens = distinctiveLineTokens(title);
  if (titleTokens.length === 0) {
    return stamp(modelEvidence ? "model_unverified" : "absent");
  }

  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isBoilerplateSourceLine(line));

  const matches: number[] = [];
  const lineTokenSets = lines.map((line) => new Set(distinctiveLineTokens(line)));
  lines.forEach((line, index) => {
    const tokens = lineTokenSets[index];
    if (titleTokens.every((token) => tokens.has(token))) {
      matches.push(index);
    }
  });

  let chosen: number | null = null;
  if (matches.length === 1) {
    chosen = matches[0];
  } else if (matches.length > 1) {
    // Disambiguate by the payload's own section: the first heading-ish line
    // that carries the section label opens the section; the first match at
    // or after it is the own-section copy. Unresolvable → inject nothing.
    const label = stringField(payload, "sourceSectionLabel");
    const foldedLabel = label ? foldForMatch(label) : "";
    if (foldedLabel.length >= 4) {
      const headingIndex = lines.findIndex((line) => {
        const folded = foldForMatch(line);
        return (
          folded.length >= 4 &&
          (folded.includes(foldedLabel) || foldedLabel.includes(folded))
        );
      });
      if (headingIndex >= 0) {
        chosen = matches.find((index) => index >= headingIndex) ?? null;
      }
    }
  }

  if (chosen === null) {
    return stamp(modelEvidence ? "model_unverified" : "absent");
  }

  payload.evidence = lines[chosen].slice(0, MAX_INJECTED_EVIDENCE_CHARS);
  return stamp("line_match_injected");
}
