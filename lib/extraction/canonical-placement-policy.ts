/**
 * Canonical placement policy — extracted stage (2026-07-17 evening pass).
 *
 * Undated activity pieces must inherit their day from the SOURCE before any
 * leg-level fallback is allowed to guess (RW-EVD-001 / RW-PLC-001; live-run
 * 7.17.2 PB-3: "Silver mines" and "Koscom" sat inside the Jan 17 Kutná Hora
 * day section but were provisionally placed on Jan 15 "using the matching
 * city leg" and produced date questions the source already answers).
 *
 * Resolution order per undated activity piece:
 *   1. Structural date — a parseable date in the piece's own source section
 *      label / heading path / chunk label.
 *   2. Section-neighbor date — the nearest dated observation from the SAME
 *      source section (source sequencing: an undated line inside a dated
 *      day block belongs to that day).
 *   3. Nothing — the caller's leg fallback + date question remains the last
 *      resort.
 *
 * Every adopted date must fall inside the trip's date bounds, and inside the
 * piece's own city leg range when the city is known.
 */

import type {
  CanonicalEvidencePiece,
  EvidenceObservation,
} from "@/lib/extraction/evidence-clustering";
import { normalizeTripDate } from "@/lib/extraction/traveler-text";

type AddAction = (
  piece: CanonicalEvidencePiece,
  action: {
    absorbedTitles: string[];
    observationIds: string[];
    reason: string;
    type: "recovered";
  }
) => void;

type CityRange = { arrive: string; city: string; leave: string };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function stringField(
  payload: Record<string, unknown>,
  field: string
): string | null {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedCity(value: string | null) {
  return value
    ? value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

function cityRangesFromPieces(pieces: CanonicalEvidencePiece[]): CityRange[] {
  const ranges: CityRange[] = [];
  for (const piece of pieces) {
    if (piece.kind !== "place") continue;
    const city = normalizedCity(stringField(piece.payload, "city"));
    const arrive =
      stringField(piece.payload, "arriveDate") ??
      stringField(piece.payload, "arrivalDate");
    const leave =
      stringField(piece.payload, "leaveDate") ??
      stringField(piece.payload, "departureDate");
    if (city && arrive && leave) ranges.push({ arrive, city, leave });
  }
  return ranges;
}

function dateWithinBounds(
  date: string,
  bounds: { max: string | null; min: string | null }
) {
  if (bounds.min && date < bounds.min) return false;
  if (bounds.max && date > bounds.max) return false;
  return true;
}

function dateAllowedForCity(
  date: string,
  city: string | null,
  ranges: CityRange[]
) {
  const normalized = normalizedCity(city);
  if (!normalized) return true;
  const cityRanges = ranges.filter((range) => range.city === normalized);
  if (cityRanges.length === 0) return true;
  return cityRanges.some(
    (range) => date >= range.arrive && date <= range.leave
  );
}

function structuralDateCandidates(observation: EvidenceObservation): string[] {
  const candidates: string[] = [];
  if (observation.sourceStructure.sectionLabel) {
    candidates.push(observation.sourceStructure.sectionLabel);
  }
  candidates.push(...observation.sourceStructure.headingPath);
  if (observation.sourceLabel) candidates.push(observation.sourceLabel);
  const payloadLabel = stringField(observation.payload, "sourceSectionLabel");
  if (payloadLabel) candidates.push(payloadLabel);
  return candidates;
}

export function resolveStructuralActivityDates({
  addAction,
  observations,
  pieces,
  tripBounds,
  tripYear,
}: {
  addAction: AddAction;
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
  tripBounds: { max: string | null; min: string | null };
  tripYear: number | null;
}) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const cityRanges = cityRangesFromPieces(pieces);
  const acceptable = (date: string | null, city: string | null): date is string =>
    Boolean(
      date &&
        ISO_DATE_PATTERN.test(date) &&
        dateWithinBounds(date, tripBounds) &&
        dateAllowedForCity(date, city, cityRanges)
    );

  for (const piece of pieces) {
    if (
      !piece.outputEligible ||
      piece.kind !== "activity" ||
      stringField(piece.payload, "date") ||
      stringField(piece.payload, "itemType") === "note"
    ) {
      continue;
    }

    const city = stringField(piece.payload, "city");
    const pieceObservations = piece.observationIds
      .map((id) => observationById.get(id))
      .filter((value): value is EvidenceObservation => Boolean(value));

    // 1. Structural date from the piece's own source section.
    let resolved: string | null = null;
    let reason: string | null = null;
    for (const observation of pieceObservations) {
      for (const candidate of structuralDateCandidates(observation)) {
        const date = normalizeTripDate(candidate, tripYear);
        if (acceptable(date, city)) {
          resolved = date;
          reason = `date resolved from source section "${candidate}"`;
          break;
        }
      }
      if (resolved) break;
    }

    // 2. Nearest dated observation from the same source section.
    if (!resolved) {
      for (const observation of pieceObservations) {
        const neighbors = observations
          .filter(
            (candidate) =>
              candidate.sourceLabel === observation.sourceLabel &&
              candidate.id !== observation.id
          )
          .map((candidate) => ({
            date: stringField(candidate.payload, "date"),
            distance: Math.abs(candidate.ordinal - observation.ordinal),
          }))
          .filter(
            (candidate): candidate is { date: string; distance: number } =>
              acceptable(candidate.date, city)
          )
          .sort((left, right) => left.distance - right.distance);
        const nearest = neighbors[0];
        if (nearest) {
          resolved = nearest.date;
          reason = `date inherited from adjacent evidence in "${observation.sourceLabel}"`;
          break;
        }
      }
    }

    if (!resolved || !reason) continue;

    piece.payload.date = resolved;
    addAction(piece, {
      absorbedTitles: [],
      observationIds: [...piece.observationIds],
      reason,
      type: "recovered",
    });
  }
}
