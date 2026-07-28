import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import { SITE_CONTAINER_NOUN_PATTERN } from "@/lib/extraction/activity-classifier";
import { comparableTokens } from "@/lib/extraction/traveler-text";

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

// G4.2 (scope §G4.2, decision D2). The lane's worst failure is not a
// missing coordinate — it is a CONFIDENT WRONG one. Run 7.28.0 stamped the
// Prague city centroid `50.0755381,14.4378005` onto three unrelated venues
// (Catacombs tour Jan 14; Peklo and Changing of the Guard Jan 16) as
// `geoVerified: true`, putting Changing of the Guard 3,108 m from the
// Prague Castle it happens inside, and leaving 31 activities holding
// verified coordinates across only 29 distinct points.
//
// The configured endpoint is the Google Geocoding API (lib/env.ts), which
// says outright whether it resolved a PLACE or a VENUE. Reject on result
// types. Chosen over the broader `location_type: APPROXIMATE` rule, which
// would also reject legitimate venues Google merely approximates and would
// make the >=2 member floor harder to clear.
//
// A rejected result is NOT an error. The lane stays fail-soft; the piece
// simply keeps no verified coordinate, exactly as if its lookup had never
// been budgeted. Note this guard ALONE does not fix Prague Castle — it
// converts Changing of the Guard from wrongly-verified to unverified, which
// makes the data honest and the grouping no better. G4.3 is the part that
// recovers it.
const LOCALITY_GRANULARITY_TYPES = new Set([
  "country",
  "locality",
  "political",
  "postal_code",
]);
const ADMINISTRATIVE_AREA_TYPE_PREFIX = "administrative_area_level_";

export type GeocodeGranularity = "locality" | "venue";

// G4.4 (scope §G4.4). Per-candidate rank + outcome did not exist ANYWHERE
// before this — only aggregate counts. St. Vitus Cathedral lost its lookup
// in run 7.28.0 (it sits on a crowded day, it is a same-day component of a
// container, and eight of its twelve day-mates resolved) and nobody could
// say why, because this record did not exist (docket §C).
//
// It is also what makes shipping G4.1, G4.2 and G4.3 in ONE run legitimate
// under AGENTS.md rule 1: for every candidate you can now read whether it
// was ranked, looked up, rejected as locality, retried, or resolved, so a
// run-2 failure is attributable to a specific change rather than to "the
// geocoder pass".
export type GeocodeCandidateOutcome =
  // Verified coordinates attached.
  | "resolved"
  // The lookup succeeded, the endpoint returned a place rather than a
  // venue, and no retry recovered it (G4.2).
  | "rejected_locality"
  // A container-context retry returned a venue, but outside the day's city
  // bounds — a wrong coordinate is worse than none (bar item 7).
  | "rejected_out_of_city"
  // Transport/HTTP/parse failure, or a response carrying no usable point.
  | "failed"
  // Ranked below the cut at the configured budget. This is the outcome
  // that would have named St. Vitus in run 7.28.0.
  | "skipped_over_budget"
  // Inside the budget, but the lane ended fail-soft before reaching it.
  // Never survives on a `completed` lane.
  | "not_attempted";

export type GeocodeCandidateTelemetry = {
  granularity: GeocodeGranularity | null;
  outcome: GeocodeCandidateOutcome;
  query: string;
  rank: number;
  retried: boolean;
  retryQuery: string | null;
};

export type GeocodeVerificationUsage = {
  budget: number;
  // G4.4: the whole candidate pool, in rank order, with what happened to
  // each one. Additive, read-only; consumed by the audit snapshot only.
  candidates: GeocodeCandidateTelemetry[];
  candidateCount: number;
  endpointHost: string | null;
  error: string | null;
  failedCount: number;
  // Arc G.3a: how many resolved lookups also returned a formatted address.
  // Env-verification is run telemetry, never the console — a zero here on
  // a completed lane means the container-token path had nothing to work
  // with and grouping fell back to the radius.
  formattedAddressCount: number;
  // G4.2: lookups whose result named a place, not a venue, and were
  // therefore NOT stamped verified. These are run 7.28.0's centroids.
  localityRejectedCount: number;
  // Arc E: batch width actually used — env-verification is run telemetry,
  // never the console (AGENTS.md env-surgery protocol).
  lookupConcurrency: number;
  lookupCount: number;
  outcome: "disabled" | "completed" | "failed" | "no_candidates";
  resolvedCount: number;
  // G4.3: container-context retries issued, accepted, and refused for
  // falling outside the day's city bounds.
  retryAcceptedCount: number;
  retryCount: number;
  retryOutOfCityCount: number;
  // G4.3 + D3: retries the lane wanted but could not afford, because
  // retries count against the same hard cap. Non-zero here means the CAP,
  // not the guard, is what bounded recovery.
  retrySkippedOverBudgetCount: number;
  skippedOverBudgetCount: number;
  version: 1;
};

export type GeocodeCandidate = {
  // G4.3 context. `city` is the day's city (the record's own, else the one
  // its day-mates agree on). `containerTitle` is the single named-site
  // container on this candidate's day — null when the day has none, has
  // more than one (ambiguous context is worse than no context), or when
  // this candidate IS that container.
  city: string | null;
  containerTitle: string | null;
  date: string | null;
  query: string;
  record: Record<string, unknown>;
  rank: number;
  title: string;
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
  // G4.3: the container title(s) and the city seen on each day. A day with
  // exactly one container gives an unambiguous retry context
  // ("Changing of the Guard, Prague Castle"); a day with two or more gives
  // none, because guessing which container a stop belongs to is exactly the
  // kind of confident-wrong answer G4.2 exists to stop.
  const containerTitlesByDate = new Map<string, Set<string>>();
  const cityNamesByDate = new Map<string, Set<string>>();
  for (const entry of records) {
    if (!entry.date) continue;
    dayCounts.set(entry.date, (dayCounts.get(entry.date) ?? 0) + 1);
    const title = stringField(entry.record, "title");
    if (title && SITE_CONTAINER_NOUN_PATTERN.test(title)) {
      siteContainerDates.add(entry.date);
      const titles = containerTitlesByDate.get(entry.date) ?? new Set<string>();
      titles.add(title);
      containerTitlesByDate.set(entry.date, titles);
    }
    const city =
      stringField(entry.record, "city") ?? stringField(entry.record, "area");
    if (city) {
      const cities = cityNamesByDate.get(entry.date) ?? new Set<string>();
      cities.add(city);
      cityNamesByDate.set(entry.date, cities);
    }
  }

  const candidates: GeocodeCandidate[] = [];
  for (const entry of records) {
    const record = entry.record;
    const title = stringField(record, "title");
    if (!title) continue;
    const city = stringField(record, "city") ?? stringField(record, "area");
    // Run8: the candidate pool ballooned past the budget (145/191 vs 50)
    // and the walk pool starved. The ranks below are the two pools that
    // ARBITRATE GROUPING, ordered so the budget cut is DELIBERATE rather
    // than alphabetical:
    //
    //   0  named-site containers
    //   1  same-day companions of a container — the same-site pool. These
    //      are the only records that can join a visit by address, and the
    //      address is the only route in for a stop that carries no title
    //      token and sits outside 300 m (Schönbrunn's Gloriette).
    //   2  crowded-day members carrying a source area label — the
    //      discovered-walk pool (run8's rank 1).
    //   3  everything else, skipped outright when the parser already
    //      supplied precise-looking coordinates.
    //
    // MEASURED, and the earlier "this adds no lookups" note was WRONG:
    // promoting companions moves them out of the rank-3 skip, so on a
    // 7.26.1-shaped corpus candidates go 20 -> 41 and lookups rise with
    // them. They stay hard-capped at maxLookups, and ranks 0/1 now take
    // the slots first, so the stops the ship bar depends on cannot lose
    // their lookup to an alphabetically luckier card.
    const isContainer = SITE_CONTAINER_NOUN_PATTERN.test(title);
    const isSiteCompanion = Boolean(
      entry.date && siteContainerDates.has(entry.date)
    );
    const isWalkPoolMember = Boolean(
      entry.date &&
        (dayCounts.get(entry.date) ?? 0) >= 6 &&
        stringField(record, "area")
    );
    const rank = isContainer
      ? 0
      : isSiteCompanion
        ? 1
        : isWalkPoolMember
          ? 2
          : 3;
    // Live-run 7.21.0: the parser now fabricates 3-decimal coordinates (the
    // whole Jan-22 guided day collapsed onto one point near Gresham Palace,
    // passing the precision gate the run5 calibration assumed only real
    // coordinates could pass). Precise-LOOKING parser coordinates are
    // therefore nothing to trust for grouping: site containers and
    // crowded-day members — the records radius rules actually consume —
    // are verified regardless; only background records (rank 2) skip
    // verification when the parser already supplied precise coordinates.
    if (rank === 3 && hasPreciseParserCoordinates(record)) continue;
    // G4.3 context, collected here because this is the only place that
    // already knows the day's shape. Nothing about ranking or selection
    // changes — these fields are inert until a lookup comes back
    // locality-granularity.
    const dayContainers = entry.date
      ? Array.from(containerTitlesByDate.get(entry.date) ?? [])
      : [];
    const containerTitle =
      dayContainers.length === 1 && dayContainers[0] !== title
        ? dayContainers[0]
        : null;
    const dayCities = entry.date
      ? Array.from(cityNamesByDate.get(entry.date) ?? [])
      : [];
    const dayCity = city ?? (dayCities.length === 1 ? dayCities[0] : null);
    candidates.push({
      city: dayCity,
      containerTitle,
      date: entry.date,
      query: city ? `${title}, ${city}` : title,
      rank,
      record,
      title,
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
export type GeocodeViewport = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export type GeocodeVerificationResult = {
  formattedAddress: string | null;
  // G4.2: "venue" is attachable, "locality" is not.
  granularity: GeocodeGranularity;
  lat: number;
  lng: number;
  // G4.3 bounds fallback: the locality names Google itself attached to this
  // result, from `address_components`.
  localityNames: string[];
  types: string[];
  // G4.3 bounds primary: for a locality result this IS the city's bounding
  // box, and it arrives in the response we already paid for. No extra
  // lookup is made to obtain it.
  viewport: GeocodeViewport | null;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

// G4.2 / decision D2: reject when the endpoint's own result types say it
// resolved a place rather than a venue.
function isLocalityGranularity(types: string[]) {
  return types.some(
    (type) =>
      LOCALITY_GRANULARITY_TYPES.has(type) ||
      type.startsWith(ADMINISTRATIVE_AREA_TYPE_PREFIX)
  );
}

function parseViewport(geometry: Record<string, unknown> | null) {
  const viewport =
    geometry?.viewport && typeof geometry.viewport === "object"
      ? (geometry.viewport as Record<string, unknown>)
      : null;
  const northeast =
    viewport?.northeast && typeof viewport.northeast === "object"
      ? (viewport.northeast as Record<string, unknown>)
      : null;
  const southwest =
    viewport?.southwest && typeof viewport.southwest === "object"
      ? (viewport.southwest as Record<string, unknown>)
      : null;
  const north = finiteCoordinate(northeast?.lat);
  const east = finiteCoordinate(northeast?.lng);
  const south = finiteCoordinate(southwest?.lat);
  const west = finiteCoordinate(southwest?.lng);
  if (north === null || east === null || south === null || west === null) {
    return null;
  }
  return { east, north, south, west };
}

// Locality names Google attached to the result itself. Used only as the
// G4.3 bounds fallback when a viewport is absent.
function parseLocalityNames(first: Record<string, unknown> | null) {
  const components = Array.isArray(first?.address_components)
    ? first.address_components
    : [];
  const names: string[] = [];
  for (const component of components) {
    if (!component || typeof component !== "object") continue;
    const record = component as Record<string, unknown>;
    const types = stringList(record.types);
    if (
      !types.includes("locality") &&
      !types.some((type) => type.startsWith(ADMINISTRATIVE_AREA_TYPE_PREFIX))
    ) {
      continue;
    }
    for (const key of ["long_name", "short_name"]) {
      const name = stringField(record, key);
      if (name) names.push(name);
    }
  }
  return names;
}

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
  const types = stringList(first?.types);
  return {
    formattedAddress,
    granularity: isLocalityGranularity(types) ? "locality" : "venue",
    lat,
    lng,
    localityNames: parseLocalityNames(first),
    types,
    viewport: parseViewport(geometry),
  };
}

function withinViewport(viewport: GeocodeViewport, lat: number, lng: number) {
  if (lat < viewport.south || lat > viewport.north) return false;
  // Google viewports crossing the antimeridian have west > east.
  return viewport.west <= viewport.east
    ? lng >= viewport.west && lng <= viewport.east
    : lng >= viewport.west || lng <= viewport.east;
}

// One shared fold, not a fourth hand-rolled one (traveler-text.ts B5).
function foldName(value: string) {
  return comparableTokens(value).join(" ");
}

// G4.3, expected failure mode 2 (scope §3): the retry finds a DIFFERENT
// venue of the same name — "Peklo, Prague" landing on some other Peklo.
// That costs a wrong coordinate, which is worse than none because grouping
// trusts verified points (bar item 7).
//
// The mitigation is free: the locality result we just rejected IS the city,
// and Google returned its bounding box in the same response. Check the
// retry against that box; fall back to comparing the locality names Google
// attached to each result; and if NEITHER is available, refuse the retry.
// This predicate fails CLOSED on purpose.
function retryIsWithinCityBounds(
  localityResult: GeocodeVerificationResult,
  retryResult: GeocodeVerificationResult
) {
  if (localityResult.viewport) {
    return withinViewport(
      localityResult.viewport,
      retryResult.lat,
      retryResult.lng
    );
  }
  if (
    localityResult.localityNames.length > 0 &&
    retryResult.localityNames.length > 0
  ) {
    const expected = new Set(localityResult.localityNames.map(foldName));
    return retryResult.localityNames.some((name) => expected.has(foldName(name)));
  }
  return false;
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
    candidates: [],
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
    localityRejectedCount: 0,
    lookupConcurrency: 0,
    lookupCount: 0,
    outcome: "disabled",
    resolvedCount: 0,
    retryAcceptedCount: 0,
    retryCount: 0,
    retryOutOfCityCount: 0,
    retrySkippedOverBudgetCount: 0,
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

  // G4.4: one telemetry row per candidate, in rank order, INCLUDING the
  // ones that never got a lookup — "why did this stop not resolve?" is a
  // question about the pool, not about the lookups.
  const telemetryByCandidate = new Map<
    GeocodeCandidate,
    GeocodeCandidateTelemetry
  >();
  const budgetCut = withinBudget.length;
  candidates.forEach((candidate, index) => {
    const row: GeocodeCandidateTelemetry = {
      granularity: null,
      outcome: index < budgetCut ? "not_attempted" : "skipped_over_budget",
      query: candidate.query,
      rank: candidate.rank,
      retried: false,
      retryQuery: null,
    };
    telemetryByCandidate.set(candidate, row);
    usage.candidates.push(row);
  });

  // G4.3 + decision D3: retries COUNT against the same hard cap, so the cap
  // stays a true ceiling and the scope §2 arithmetic holds exactly as
  // written. The initial pool takes its slots first; whatever the cap has
  // left is the retry allowance. At candidateCount >= budget there is no
  // retry allowance at all, and `retrySkippedOverBudgetCount` says so out
  // loud rather than letting the cap look like the guard.
  let retryBudget = Math.max(0, config.maxLookups - withinBudget.length);

  // Arc E parallelization: lookups run in bounded batches instead of one
  // strictly serial chain (run 7.22.4 spent 50 serial round-trips; Arc C/D
  // made runs 50-100% slower and the lane is the second-largest wall-time
  // item after chunk calls). Semantics are unchanged: one hard transport
  // failure still ends the lane and the draft survives on parser
  // coordinates — in-flight results from the failing batch are kept.
  const lookupQuery = async (query: string) => {
    const url = new URL(config.endpoint);
    url.searchParams.set("address", query);
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

  const attachResult = (
    candidate: GeocodeCandidate,
    result: GeocodeVerificationResult,
    query: string
  ) => {
    // Proximity-only attachment: verified coordinates + provenance. No
    // other field is ever written.
    candidate.record.verifiedLatitude = result.lat;
    candidate.record.verifiedLongitude = result.lng;
    if (result.formattedAddress) {
      candidate.record.verifiedFormattedAddress = result.formattedAddress;
      usage.formattedAddressCount += 1;
    }
    candidate.record._geoVerified = true;
    candidate.record._geoVerification = {
      provider: "geocode",
      query,
    };
    usage.resolvedCount += 1;
  };

  // G4.3: the retry context. Prefer the day's single named-site container
  // ("Changing of the Guard, Prague Castle") — that is the string that
  // identifies a venue the geocoder could not resolve standalone. Fall back
  // to the day's city ONLY when the original query did not already carry
  // it, because re-asking with the same city is what produced the centroid
  // in the first place.
  const retryQueryFor = (candidate: GeocodeCandidate) => {
    const alreadyInQuery = (value: string) =>
      foldName(candidate.query).includes(foldName(value));
    if (candidate.containerTitle && !alreadyInQuery(candidate.containerTitle)) {
      return `${candidate.title}, ${candidate.containerTitle}`;
    }
    if (candidate.city && !alreadyInQuery(candidate.city)) {
      return `${candidate.title}, ${candidate.city}`;
    }
    return null;
  };

  type PendingRetry = {
    candidate: GeocodeCandidate;
    localityResult: GeocodeVerificationResult;
    query: string;
  };
  const pendingRetries: PendingRetry[] = [];

  usage.lookupConcurrency = GEOCODE_LOOKUP_CONCURRENCY;

  // Wave engine. Retries are queued into their OWN waves rather than run
  // inline: a retry issued inside its parent's wave costs that wave two
  // sequential round-trips, and scope §2's `waves = ceil(lookups / 8)` at
  // 4 s per wave silently stops holding. Queued, total waves stay
  // ceil(totalLookups / 8) and the measured 70.5 % headroom is exact.
  const runWaves = async <T extends { query: string }>(
    items: T[],
    handle: (item: T, result: GeocodeVerificationResult | null) => void
  ) => {
    for (
      let start = 0;
      start < items.length;
      start += GEOCODE_LOOKUP_CONCURRENCY
    ) {
      const batch = items.slice(start, start + GEOCODE_LOOKUP_CONCURRENCY);
      usage.lookupCount += batch.length;
      const settled = await Promise.allSettled(
        batch.map((item) => lookupQuery(item.query))
      );
      let transportError: unknown = null;
      settled.forEach((outcome, index) => {
        if (outcome.status === "rejected") {
          usage.failedCount += 1;
          transportError = transportError ?? outcome.reason;
          handle(batch[index], null);
          return;
        }
        handle(batch[index], outcome.value);
      });
      if (transportError !== null) {
        usage.error =
          transportError instanceof Error
            ? transportError.message
            : "Unknown geocode error.";
        // Fail-soft: one hard transport failure ends the lane — the draft
        // survives on parser coordinates.
        return false;
      }
    }
    return true;
  };

  const initialCompleted = await runWaves(withinBudget, (candidate, result) => {
    const row = telemetryByCandidate.get(candidate);
    if (!result) {
      if (row) row.outcome = "failed";
      return;
    }
    if (row) row.granularity = result.granularity;
    if (result.granularity === "venue") {
      if (row) row.outcome = "resolved";
      attachResult(candidate, result, candidate.query);
      return;
    }
    // G4.2: a place, not a venue. NOT an error, and NOT attached — this is
    // the branch that stops the Prague centroid being stamped verified.
    usage.localityRejectedCount += 1;
    if (row) row.outcome = "rejected_locality";
    const retryQuery = retryQueryFor(candidate);
    if (!retryQuery) return;
    if (retryBudget <= 0) {
      usage.retrySkippedOverBudgetCount += 1;
      return;
    }
    retryBudget -= 1;
    pendingRetries.push({ candidate, localityResult: result, query: retryQuery });
  });

  if (!initialCompleted) {
    usage.outcome = "failed";
    return { usage };
  }

  usage.retryCount = pendingRetries.length;

  const retriesCompleted = await runWaves(pendingRetries, (pending, result) => {
    const row = telemetryByCandidate.get(pending.candidate);
    if (row) {
      row.retried = true;
      row.retryQuery = pending.query;
    }
    if (!result) {
      if (row) row.outcome = "failed";
      return;
    }
    if (row) row.granularity = result.granularity;
    // Accept ONLY a non-locality result (G4.2's criterion, applied again to
    // the retry) that also sits inside the day's city bounds (scope §3
    // failure mode 2). Either check failing leaves the piece with no
    // verified coordinate, which is the honest outcome.
    if (result.granularity !== "venue") return;
    if (!retryIsWithinCityBounds(pending.localityResult, result)) {
      usage.retryOutOfCityCount += 1;
      if (row) row.outcome = "rejected_out_of_city";
      return;
    }
    usage.retryAcceptedCount += 1;
    if (row) row.outcome = "resolved";
    attachResult(pending.candidate, result, pending.query);
  });

  if (!retriesCompleted) {
    usage.outcome = "failed";
    return { usage };
  }

  usage.outcome = "completed";
  return { usage };
}
