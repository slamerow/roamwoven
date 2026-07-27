import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import { SITE_CONTAINER_NOUN_PATTERN } from "@/lib/extraction/activity-classifier";

// Geocoding verification lane (Arc B; standing CEO decision recorded
// 2026-07-17/18 after four runs of unusable model-emitted coordinates).
//
// Posture (RW-EVD-001 / RW-GRP-001):
// - ENV-KEYED: no GEOCODE_VERIFICATION_API_KEY → the lane is disabled and
//   the pipeline behaves exactly as before.
// - HARD PER-TRIP BUDGET: at most maxLookups lookups per build; overflow is
//   counted in telemetry, never silently dropped.
// - FAIL-SOFT: any fetch/HTTP/parse error ends the lane with outcome
//   "failed"; the usable draft always survives on parser coordinates.
// - PROXIMITY-ONLY: results attach as verifiedLatitude/verifiedLongitude
//   with provenance and are consumed ONLY by grouping-proximity checks.
//   Lookups never change intent, type, date, city, title, or booking state.
// - V1 STORAGE: results ride on the run's usage JSON (and the stage records
//   in memory); no new DB tables — durable caching is a later additive
//   migration alongside extraction pinning.

export type GeocodeVerificationConfig = {
  apiKey: string | null;
  endpoint: string;
  maxLookups: number;
  timeoutMs: number;
};

// Arc E: bounded lookup batching. 8 concurrent requests against a
// commercial geocoding endpoint is well inside normal QPS allowances; the
// rollback is this one constant.
const GEOCODE_LOOKUP_CONCURRENCY = 8;

export type GeocodeVerificationUsage = {
  budget: number;
  candidateCount: number;
  endpointHost: string | null;
  error: string | null;
  failedCount: number;
  // Arc G.3a: how many resolved lookups also returned a formatted address.
  // Env-verification is run telemetry, never the console — a zero here on
  // a completed lane means the container-token path had nothing to work
  // with and grouping fell back to the radius.
  formattedAddressCount: number;
  // Arc E: batch width actually used — env-verification is run telemetry,
  // never the console (AGENTS.md env-surgery protocol).
  lookupConcurrency: number;
  lookupCount: number;
  outcome: "disabled" | "completed" | "failed" | "no_candidates";
  resolvedCount: number;
  skippedOverBudgetCount: number;
  version: 1;
};

export type GeocodeCandidate = {
  query: string;
  record: Record<string, unknown>;
  rank: number;
};

function stringField(record: Record<string, unknown>, field: string) {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coordinateDecimalCount(value: number) {
  const text = String(value);
  if (text.includes("e") || text.includes("E")) return 0;
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function hasPreciseParserCoordinates(record: Record<string, unknown>) {
  const lat = finiteCoordinate(record.approxLatitude);
  const lng = finiteCoordinate(record.approxLongitude);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return false;
  return coordinateDecimalCount(lat) >= 3 || coordinateDecimalCount(lng) >= 3;
}

// Deterministic candidate selection under the budget: (1) named-site
// containers (the ship-bar groups — castle, Schönbrunn), (2) activities on
// crowded days (6+ same-day cards — the discovered-walk pool), (3) the
// rest. Only activity records with a title; records that already carry
// precise parser coordinates are skipped (nothing to verify — radius rules
// can already use them); notes never geocode.
export function selectGeocodeCandidates(
  stages: EvidenceStageInput[]
): GeocodeCandidate[] {
  const records: Array<{ record: Record<string, unknown>; date: string | null }> = [];
  for (const stageInput of stages) {
    const stage =
      stageInput.stage && typeof stageInput.stage === "object"
        ? (stageInput.stage as Record<string, unknown>)
        : {};
    const activities = Array.isArray(stage.activities) ? stage.activities : [];
    for (const item of activities) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      if (stringField(record, "itemType") === "note") continue;
      if (typeof record.evidenceRole === "string" && record.evidenceRole !== "atomic_candidate" && record.evidenceRole) {
        continue;
      }
      if (!stringField(record, "title")) continue;
      records.push({ date: stringField(record, "date"), record });
    }
  }

  const dayCounts = new Map<string, number>();
  // Arc G.3a pre-flight: days that contain a named-site container. A card
  // sharing a day with one is a candidate MEMBER of that site visit, and
  // membership is exactly what this lane exists to arbitrate.
  //
  // Without this, the address path is unreachable for the stops that need
  // it most. Schönbrunn's Gloriette, Apple Strudel Show and Panorama Train
  // carry no "at Schönbrunn" title token and sit outside the 300 m radius,
  // so the geocoded address is their ONLY route into the visit — and as
  // rank 2 they were skipped outright whenever the parser had supplied
  // precise-looking coordinates (which run 7.21.0 proved it fabricates).
  // Run 7.26.1 grouped exactly the two components that had title tokens.
  const siteContainerDates = new Set<string>();
  for (const entry of records) {
    if (!entry.date) continue;
    dayCounts.set(entry.date, (dayCounts.get(entry.date) ?? 0) + 1);
    const title = stringField(entry.record, "title");
    if (title && SITE_CONTAINER_NOUN_PATTERN.test(title)) {
      siteContainerDates.add(entry.date);
    }
  }

  const candidates: GeocodeCandidate[] = [];
  for (const entry of records) {
    const record = entry.record;
    const title = stringField(record, "title");
    if (!title) continue;
    const city = stringField(record, "city") ?? stringField(record, "area");
    // Run8: the candidate pool ballooned past the budget (145/191 vs 50)
    // and the walk pool starved. Rank 1 is the pool that ARBITRATES
    // GROUPING, so the lookups that decide membership always fit inside
    // budget: crowded-day members carrying a source area label (the
    // discovered-walk pool) and, since Arc G.3a, same-day companions of a
    // named-site container (the same-site pool). Both are bounded by the
    // day they sit on — this re-prioritizes the existing pool, it does not
    // grow it, and it adds no lookups.
    const rank = SITE_CONTAINER_NOUN_PATTERN.test(title)
      ? 0
      : entry.date &&
          ((siteContainerDates.has(entry.date) ||
            ((dayCounts.get(entry.date) ?? 0) >= 6 &&
              Boolean(stringField(record, "area")))))
        ? 1
        : 2;
    // Live-run 7.21.0: the parser now fabricates 3-decimal coordinates (the
    // whole Jan-22 guided day collapsed onto one point near Gresham Palace,
    // passing the precision gate the run5 calibration assumed only real
    // coordinates could pass). Precise-LOOKING parser coordinates are
    // therefore nothing to trust for grouping: site containers and
    // crowded-day members — the records radius rules actually consume —
    // are verified regardless; only background records (rank 2) skip
    // verification when the parser already supplied precise coordinates.
    if (rank === 2 && hasPreciseParserCoordinates(record)) continue;
    candidates.push({
      query: city ? `${title}, ${city}` : title,
      rank,
      record,
    });
  }

  candidates.sort(
    (left, right) =>
      left.rank - right.rank || left.query.localeCompare(right.query)
  );
  return candidates;
}

// Arc G.3a: the response ALREADY carries the formatted address and this
// parser threw it away — the lane paid for a lookup and kept two numbers
// out of it. The address is what actually names a site
// ("Schloß Schönbrunn, Schönbrunner Schloßstraße 47, 1130 Wien"), which is
// the evidence a radius cannot supply: Schönbrunn's Gloriette is ~800 m
// from the palace and the locked ~300 m same-site radius refuses it BY
// DESIGN, while its address names the estate outright. This is the "geo
// coordinate + logic" rider Eli approved on 2026-07-23.
//
// Still PROXIMITY-ONLY in posture: the address is consumed exclusively by
// grouping containment checks. It never changes intent, type, date, city,
// title or booking state, and no extra lookup is made to obtain it.
export type GeocodeVerificationResult = {
  formattedAddress: string | null;
  lat: number;
  lng: number;
};

function parseGeocodeResponse(json: unknown): GeocodeVerificationResult | null {
  const record =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const results = Array.isArray(record.results) ? record.results : [];
  const first =
    results[0] && typeof results[0] === "object"
      ? (results[0] as Record<string, unknown>)
      : null;
  const geometry =
    first?.geometry && typeof first.geometry === "object"
      ? (first.geometry as Record<string, unknown>)
      : null;
  const location =
    geometry?.location && typeof geometry.location === "object"
      ? (geometry.location as Record<string, unknown>)
      : null;
  const lat = finiteCoordinate(location?.lat);
  const lng = finiteCoordinate(location?.lng);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
  const formattedAddress = first ? stringField(first, "formatted_address") : null;
  return { formattedAddress, lat, lng };
}

export async function runGeocodeVerification({
  config,
  fetchImpl = fetch,
  stages,
}: {
  config: GeocodeVerificationConfig;
  fetchImpl?: typeof fetch;
  stages: EvidenceStageInput[];
}): Promise<{ usage: GeocodeVerificationUsage }> {
  const usage: GeocodeVerificationUsage = {
    budget: config.maxLookups,
    candidateCount: 0,
    endpointHost: (() => {
      try {
        return new URL(config.endpoint).host;
      } catch {
        return null;
      }
    })(),
    error: null,
    failedCount: 0,
    formattedAddressCount: 0,
    lookupConcurrency: 0,
    lookupCount: 0,
    outcome: "disabled",
    resolvedCount: 0,
    skippedOverBudgetCount: 0,
    version: 1,
  };

  if (!config.apiKey) {
    return { usage };
  }

  const candidates = selectGeocodeCandidates(stages);
  usage.candidateCount = candidates.length;

  if (candidates.length === 0) {
    usage.outcome = "no_candidates";
    return { usage };
  }

  const withinBudget = candidates.slice(0, Math.max(0, config.maxLookups));
  usage.skippedOverBudgetCount = candidates.length - withinBudget.length;

  // Arc E parallelization: lookups run in bounded batches instead of one
  // strictly serial chain (run 7.22.4 spent 50 serial round-trips; Arc C/D
  // made runs 50-100% slower and the lane is the second-largest wall-time
  // item after chunk calls). Semantics are unchanged: one hard transport
  // failure still ends the lane and the draft survives on parser
  // coordinates — in-flight results from the failing batch are kept, and
  // no per-candidate retry policy is introduced. Width is telemetry-visible.
  const lookupOne = async (candidate: (typeof withinBudget)[number]) => {
    const url = new URL(config.endpoint);
    url.searchParams.set("address", candidate.query);
    url.searchParams.set("key", config.apiKey as string);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`geocode endpoint returned ${response.status}`);
    }
    return parseGeocodeResponse(await response.json());
  };

  usage.lookupConcurrency = GEOCODE_LOOKUP_CONCURRENCY;
  for (
    let start = 0;
    start < withinBudget.length;
    start += GEOCODE_LOOKUP_CONCURRENCY
  ) {
    const batch = withinBudget.slice(start, start + GEOCODE_LOOKUP_CONCURRENCY);
    usage.lookupCount += batch.length;
    const settled = await Promise.allSettled(
      batch.map((candidate) => lookupOne(candidate))
    );
    let transportError: unknown = null;
    settled.forEach((outcome, index) => {
      if (outcome.status === "rejected") {
        usage.failedCount += 1;
        transportError = transportError ?? outcome.reason;
        return;
      }
      const coords = outcome.value;
      if (!coords) {
        usage.failedCount += 1;
        return;
      }
      const candidate = batch[index];
      // Proximity-only attachment: verified coordinates + provenance. No
      // other field is ever written.
      candidate.record.verifiedLatitude = coords.lat;
      candidate.record.verifiedLongitude = coords.lng;
      if (coords.formattedAddress) {
        candidate.record.verifiedFormattedAddress = coords.formattedAddress;
        usage.formattedAddressCount += 1;
      }
      candidate.record._geoVerified = true;
      candidate.record._geoVerification = {
        provider: "geocode",
        query: candidate.query,
      };
      usage.resolvedCount += 1;
    });
    if (transportError !== null) {
      usage.error =
        transportError instanceof Error
          ? transportError.message
          : "Unknown geocode error.";
      // Fail-soft: one hard transport failure ends the lane — the draft
      // survives on parser coordinates.
      usage.outcome = "failed";
      return { usage };
    }
  }

  usage.outcome = "completed";
  return { usage };
}
