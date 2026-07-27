import {
  sourceTransportAnchorMatchesRecord,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";

// Arc G.2 — cross-record transport field bleed.
//
// Run 7.26.1 shipped two transport rows the source itself contradicts:
//
//   transport[2]  RegioJet  dep "Praha, Hlavní Nádraží" 09:20  arr "JFK"
//   transport[3]  ÖBB       dep "Wien Hbf" 10:42  arr "Budapest" arrT 10:42
//
// "JFK" is legitimate on the four Delta rows in the same trip; it bled
// across records during observation merge, where `locationQuality` scores
// any three-letter token maximally and knows nothing about the record it
// is scoring. The ÖBB row copied its own departure time into arrival.
// Both reached the maker as "equally authoritative source evidence
// conflicts" questions — but neither is a genuine conflict. A train cannot
// arrive at an IATA code, an arrival cannot equal its own departure, and
// the source text states both right answers (Wien Hbf 13:23,
// Budapest-Keleti 13:19). They are deterministic repairs, and a
// deterministic repair must never spend a maker's attention.
//
// Posture (AGENTS.md dark-factory readiness):
// - PURE + COMPOSABLE. This module owns the defect predicates and the
//   repair decision. It takes payload bags and source anchors, never a
//   pipeline object, so it is testable in isolation and re-runnable — the
//   retry lane calls it a second time and a repaired row is a no-op.
// - BOUNDED TERMINATION. Every detected defect ends in exactly one of:
//   repaired from the matching source anchor, or the bad value CLEARED
//   with one typed question raised. It never throws, never suppresses the
//   row, and never leaves a value it has judged wrong in place.
// - EVIDENCE-PRESERVING. Repairs are reported for support telemetry; the
//   maker only ever sees the question raised for case two.
// - QUESTION DISCIPLINE (Eli's ruling 2026-07-27). We ask ONLY when we
//   destroyed a value we know existed. A source that simply never stated
//   an arrival stays silent, exactly as today — otherwise every sparse
//   transport row on every other trip grows a new question.

export type TransportFieldDefect =
  | "arrival_time_equals_departure"
  | "endpoint_type_incompatible";

export type TransportFieldRepairOutcome =
  | "cleared_pending_review"
  | "repaired_from_source_anchor";

export type TransportRepairField = "arrival" | "arrivalTime" | "departure";

export type TransportFieldRepair = {
  after: string | null;
  anchorId: string | null;
  before: string;
  defect: TransportFieldDefect;
  field: TransportRepairField;
  outcome: TransportFieldRepairOutcome;
  pieceId: string;
  routeLabel: string;
  transportType: string | null;
};

export type TransportRepairQuestion = {
  _canonicalReviewDisposition: "question";
  answerType: "text" | "time";
  confidence: "medium";
  evidence: string;
  guessedValue: null;
  prompt: string;
  reason: string;
  relatedCanonicalPieceId: string;
  relatedTitle: string;
  subjectType: "transport";
  targetField: TransportRepairField;
};

export type TransportRepairTarget = {
  id: string;
  payload: Record<string, unknown>;
};

function stringField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Local clock normalizer: this module must not depend on a private helper
// inside the 11k-line clustering file, and "10:42" vs "10:42 AM" vs
// "10.42" must all read as the same instant before we call an arrival a
// copy of its departure.
export function normalizedRepairClockTime(value: string | null) {
  if (!value) return null;
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute > 59) return null;
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// A bare three-letter token IS the IATA shape. Deliberately narrow: only
// a value that is nothing but the code. "JFK Terminal 4" is a real place a
// ground transfer can reach and is left alone.
export function isAirportCodeShape(value: string | null) {
  return Boolean(value && /^[A-Za-z]{3}$/.test(value.trim()));
}

const RAIL_STATION_MARKER =
  /\b(?:hbf|hauptbahnhof|bahnhof|nadrazi|hlavni|keleti|nyugati|termini|gare|station)\b/;

// Diacritics are folded BEFORE the marker test: `\b` is ASCII-only in
// JavaScript, so "Hlavní Nádraží" never matches an accented alternation —
// the word boundary after "í" does not exist. Fold first, match second.
function foldForMarkerMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isRailStationShape(value: string | null) {
  if (!value) return false;
  const folded = foldForMarkerMatch(value);
  if (/\bairport\b/.test(folded)) return false;
  return RAIL_STATION_MARKER.test(folded);
}

// Types on which an IATA code is never a real endpoint. `transfer`,
// `rental_car` and `drive` are excluded ON PURPOSE — an airport transfer
// to JFK and a car returned at FCO are both ordinary trip content.
const GROUND_RAIL_TYPES = new Set(["bus", "ferry", "train"]);

// Airport buses and airport long-distance rail are ordinary trip content:
// "NYC Airporter to JFK" and "ICE 1123 to Frankfurt Airport" legitimately
// end at an airport code, so a GROUND row whose own text names an airport
// keeps its code.
//
// "terminal" is deliberately NOT in this list. Every flight row in the
// shipped QA bundles says "Terminal 2b" or similar, and a bus row can say
// "Vienna International Bus Terminal" — including it would have exempted
// essentially every transport row in the corpus and quietly disabled the
// detector this arc exists to add.
const AIRPORT_CONTEXT_PATTERN =
  /\b(?:airport|airporter|flughafen|aeroport|aeroporto|aeropuerto|air[- ]?rail)\b/i;

export function endpointTypeIsCompatible({
  recordText = null,
  transportType,
  value,
}: {
  recordText?: string | null;
  transportType: string | null;
  value: string | null;
}) {
  if (!value) return true;
  const type = transportType?.trim().toLowerCase() ?? null;
  if (!type) return true;
  if (GROUND_RAIL_TYPES.has(type) && isAirportCodeShape(value)) {
    return Boolean(recordText && AIRPORT_CONTEXT_PATTERN.test(recordText));
  }
  // The flight side needs no prose exemption at all: `isRailStationShape`
  // already refuses any value that names an airport, so the judgement rests
  // on the ENDPOINT, not on the row's prose — which on a flight row almost
  // always mentions an airport and would exempt everything.
  if (type === "flight" && isRailStationShape(value)) return false;
  return true;
}

// The audit join (`sourceTransportAnchorMatchesRecord`) is deliberately
// generous: its job is "is this row represented in the source at all", and
// it accepts two shared route tokens. That is far too loose to WRITE a
// value with. Adjacent rail legs always share the interchange station, so
// a Wien→Salzburg anchor matches the Salzburg→Innsbruck row and would
// happily supply Salzburg as its arrival — turning a maker question into
// silently wrong data on a traveler's card, which is strictly worse than
// the defect being repaired.
//
// A repair therefore needs CORROBORATION: the anchor must agree with the
// row on something we are NOT repairing.
function anchorCorroboratesRecord(
  anchor: SourceTransportAnchor,
  payload: Record<string, unknown>
) {
  const departureTime = normalizedRepairClockTime(
    stringField(payload, "departureTime")
  );
  if (
    departureTime &&
    normalizedRepairClockTime(anchor.departureTime) === departureTime
  ) {
    return true;
  }

  const confirmation = stringField(payload, "confirmation");
  if (
    confirmation &&
    anchor.confirmation &&
    confirmation.toLowerCase() === anchor.confirmation.toLowerCase()
  ) {
    return true;
  }

  if (anchor.number) {
    const recordText = [
      stringField(payload, "title"),
      stringField(payload, "description"),
      stringField(payload, "provider"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (recordText.includes(anchor.number.toLowerCase())) return true;
  }

  return false;
}

function corroboratedAnchors(
  anchors: SourceTransportAnchor[],
  payload: Record<string, unknown>
) {
  const record = {
    arrivalLocation: stringField(payload, "arrival"),
    arrivalTime: stringField(payload, "arrivalTime"),
    confirmationLabel: stringField(payload, "confirmation"),
    date: stringField(payload, "date"),
    departureLocation: stringField(payload, "departure"),
    departureTime: stringField(payload, "departureTime"),
    provider: stringField(payload, "provider"),
    routeLabel: stringField(payload, "title") ?? "",
    transportType: stringField(payload, "type"),
  };

  return anchors.filter(
    (anchor) =>
      sourceTransportAnchorMatchesRecord(anchor, record) &&
      anchorCorroboratesRecord(anchor, payload)
  );
}

type DefectPlan = {
  // How two anchor offers are compared for agreement. Times compare as
  // instants ("13:19" and "1:19 pm" are one answer, not two); locations
  // compare case-insensitively.
  comparableValue: (value: string) => string;
  currentValue: string;
  defect: TransportFieldDefect;
  field: TransportRepairField;
  replacement: (anchor: SourceTransportAnchor) => string | null;
  replacementIsValid: (value: string) => boolean;
};

function planDefects(payload: Record<string, unknown>): DefectPlan[] {
  const transportType = stringField(payload, "type");
  const departureTime = stringField(payload, "departureTime");
  const recordText = [
    stringField(payload, "title"),
    stringField(payload, "description"),
    stringField(payload, "provider"),
  ]
    .filter(Boolean)
    .join(" ");
  const plans: DefectPlan[] = [];

  for (const field of ["arrival", "departure"] as const) {
    const value = stringField(payload, field);
    if (!value) continue;
    if (endpointTypeIsCompatible({ recordText, transportType, value })) continue;
    plans.push({
      comparableValue: (candidate) => candidate.trim().toLowerCase(),
      currentValue: value,
      defect: "endpoint_type_incompatible",
      field,
      replacement: (anchor) =>
        field === "arrival" ? anchor.arrivalLocation : anchor.departureLocation,
      replacementIsValid: (candidate) =>
        endpointTypeIsCompatible({
          recordText,
          transportType,
          value: candidate,
        }),
    });
  }

  const arrivalTime = stringField(payload, "arrivalTime");
  const normalizedArrival = normalizedRepairClockTime(arrivalTime);
  const normalizedDeparture = normalizedRepairClockTime(departureTime);
  if (
    arrivalTime &&
    normalizedArrival &&
    normalizedDeparture &&
    normalizedArrival === normalizedDeparture
  ) {
    plans.push({
      comparableValue: (candidate) =>
        normalizedRepairClockTime(candidate) ?? candidate.trim().toLowerCase(),
      currentValue: arrivalTime,
      defect: "arrival_time_equals_departure",
      field: "arrivalTime",
      replacement: (anchor) => anchor.arrivalTime,
      replacementIsValid: (candidate) =>
        normalizedRepairClockTime(candidate) !== normalizedDeparture,
    });
  }

  return plans;
}

function questionForCleared({
  field,
  pieceId,
  payload,
  routeLabel,
}: {
  field: TransportRepairField;
  pieceId: string;
  payload: Record<string, unknown>;
  routeLabel: string;
}): TransportRepairQuestion {
  const prompt =
    field === "arrivalTime"
      ? `What time does ${routeLabel} arrive?`
      : field === "arrival"
        ? `Where does ${routeLabel} arrive?`
        : `Where does ${routeLabel} depart from?`;

  return {
    _canonicalReviewDisposition: "question",
    answerType: field === "arrivalTime" ? "time" : "text",
    confidence: "medium",
    evidence: [
      routeLabel,
      stringField(payload, "provider"),
      stringField(payload, "departure"),
      stringField(payload, "departureTime"),
    ]
      .filter(Boolean)
      .join(" "),
    guessedValue: null,
    prompt,
    reason:
      "Roamwoven found a value here that cannot belong to this travel card and removed it, and the source text does not state the right one. Leave this unanswered if it is not booked yet.",
    relatedCanonicalPieceId: pieceId,
    relatedTitle: routeLabel,
    subjectType: "transport",
    targetField: field,
  };
}

export function repairTransportFieldBleed({
  anchors = [],
  targets,
}: {
  anchors?: SourceTransportAnchor[];
  targets: TransportRepairTarget[];
}): {
  questions: TransportRepairQuestion[];
  repairs: TransportFieldRepair[];
  resolvedFields: Array<{ field: TransportRepairField; pieceId: string }>;
} {
  const questions: TransportRepairQuestion[] = [];
  const repairs: TransportFieldRepair[] = [];
  const resolvedFields: Array<{
    field: TransportRepairField;
    pieceId: string;
  }> = [];

  for (const target of targets) {
    const plans = planDefects(target.payload);
    if (plans.length === 0) continue;

    const routeLabel = stringField(target.payload, "title") ?? "this travel";
    const transportType = stringField(target.payload, "type");
    const candidateAnchors = corroboratedAnchors(anchors, target.payload);

    for (const plan of plans) {
      // Every corroborated anchor that actually carries a usable value for
      // this field. If two of them DISAGREE, the source is genuinely
      // ambiguous and guessing would be the same failure in a new costume:
      // clear the value and ask.
      const offers = candidateAnchors
        .map((anchor) => ({
          anchor,
          value: plan.replacement(anchor)?.trim() ?? null,
        }))
        .filter(
          (offer): offer is { anchor: SourceTransportAnchor; value: string } =>
            Boolean(offer.value) && plan.replacementIsValid(offer.value as string)
        );
      const distinctValues = new Set(
        offers.map((offer) => plan.comparableValue(offer.value))
      );
      const usable = distinctValues.size === 1 ? offers[0] : null;

      if (usable) {
        applyRepairedValue(
          target.payload,
          plan.field,
          plan.currentValue,
          usable.value,
          plan.comparableValue
        );
        repairs.push({
          after: usable.value,
          anchorId: usable.anchor.anchorId,
          before: plan.currentValue,
          defect: plan.defect,
          field: plan.field,
          outcome: "repaired_from_source_anchor",
          pieceId: target.id,
          routeLabel,
          transportType,
        });
        resolvedFields.push({ field: plan.field, pieceId: target.id });
        continue;
      }

      applyRepairedValue(
        target.payload,
        plan.field,
        plan.currentValue,
        null,
        plan.comparableValue
      );
      repairs.push({
        after: null,
        anchorId: null,
        before: plan.currentValue,
        defect: plan.defect,
        field: plan.field,
        outcome: "cleared_pending_review",
        pieceId: target.id,
        routeLabel,
        transportType,
      });
      resolvedFields.push({ field: plan.field, pieceId: target.id });
      questions.push(
        questionForCleared({
          field: plan.field,
          payload: target.payload,
          pieceId: target.id,
          routeLabel,
        })
      );
    }
  }

  return { questions, repairs, resolvedFields };
}

// Writing the field is not enough: `finalizeCanonicalOutputFields` coalesces
// `arrival ?? arrivalLocation ?? dropOffLocation` and
// `arrivalTime ?? endTime`, so a bad value left in a sibling field can walk
// straight back in. Only siblings still holding the REJECTED value are
// touched — an unrelated `endTime` or `dropOffLocation` keeps its own
// meaning.
function applyRepairedValue(
  payload: Record<string, unknown>,
  field: TransportRepairField,
  rejectedValue: string,
  nextValue: string | null,
  comparableValue: (value: string) => string
) {
  payload[field] = nextValue;
  // The sibling comparison uses the SAME comparator the field itself uses,
  // so "10:42 AM" sitting in `endTime` is recognized as the same instant as
  // the "10:42" being rejected. A plain string compare left the variant
  // behind, and the retry lane would re-coalesce it and re-clear the field
  // on every pass.
  const rejected = comparableValue(rejectedValue);
  for (const alias of TRANSPORT_REPAIR_FIELD_ALIASES[field]) {
    if (alias === field) continue;
    const current = payload[alias];
    if (typeof current === "string" && comparableValue(current) === rejected) {
      payload[alias] = nextValue;
    }
  }
}

// The conflict-question lane names fields by their observation aliases.
// A field this module has decided is repaired must not also arrive as a
// "which value should we use?" question.
// Two jobs: telling the conflict-question lane which field names mean the
// same decided field, and naming the whole coalesce chain
// `finalizeCanonicalOutputFields` reads, so a rejected value cannot
// reappear through a sibling.
export const TRANSPORT_REPAIR_FIELD_ALIASES: Record<
  TransportRepairField,
  string[]
> = {
  arrival: ["arrival", "arrivalLocation", "dropOffLocation"],
  arrivalTime: ["arrivalTime", "endTime"],
  departure: ["departure", "departureLocation", "pickupLocation"],
};
