import type {
  TripItemRecord,
  TripLegRecord,
} from "@/lib/generated-trip-model";
import { normalizeText } from "@/lib/extraction/traveler-text";

type CityNoteIdentityRecord = Pick<TripItemRecord, "legId"> & {
  cityNoteKey?: string | null;
};

function keyPart(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, "-");
}

export function cityNoteKeyForLocation(
  city: string | null | undefined,
  country: string | null | undefined
) {
  const cityKey = keyPart(city);
  if (!cityKey) return null;

  const countryKey = keyPart(country);
  return countryKey ? `city:${cityKey}:${countryKey}` : `city:${cityKey}`;
}

export function cityNoteKeyForLeg(leg: Pick<TripLegRecord, "city" | "country">) {
  return cityNoteKeyForLocation(leg.city, leg.country);
}

/**
 * Resolve a note's durable city identity. `legId` is a read-only compatibility
 * path for structured snapshots written before city-keyed notes existed.
 */
export function cityNoteKeyForRecord(
  legs: TripLegRecord[],
  record: CityNoteIdentityRecord
) {
  if (record.cityNoteKey) return record.cityNoteKey;
  const legacyLeg = record.legId
    ? legs.find((leg) => leg.id === record.legId)
    : null;
  return legacyLeg ? cityNoteKeyForLeg(legacyLeg) : null;
}

/**
 * Every matching leg is a display anchor for one city-owned note. New records
 * use `cityNoteKey`; old records fall back to the city of their stored leg.
 */
export function cityNoteLegsForRecord(
  legs: TripLegRecord[],
  record: CityNoteIdentityRecord
) {
  const key = cityNoteKeyForRecord(legs, record);
  if (!key) return [];

  return legs.filter((leg) => cityNoteKeyForLeg(leg) === key);
}

export function firstCityNoteLeg(
  legs: TripLegRecord[],
  record: CityNoteIdentityRecord
) {
  return cityNoteLegsForRecord(legs, record)[0] ?? null;
}
