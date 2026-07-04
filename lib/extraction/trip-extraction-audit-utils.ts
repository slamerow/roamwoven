import type { DraftObject } from "@/lib/extraction/trip-extraction-audit-types";

export function asRecord(value: unknown): DraftObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DraftObject)
    : {};
}

export function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function getString(record: DraftObject, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getStringFromKeys(record: DraftObject, keys: string[]) {
  for (const key of keys) {
    const value = getString(record, key);

    if (value) {
      return value;
    }
  }

  return null;
}

export function getArrayCount(record: DraftObject, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value.length : 0;
}

export function titleFrom(
  record: DraftObject,
  keys: string[],
  fallback: string
) {
  for (const key of keys) {
    const value = getString(record, key);

    if (value) {
      return value;
    }
  }

  return fallback;
}

export function truncate(value: string | null, maxLength = 280) {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function findOpenAIUsage(usage: unknown) {
  const record = asRecord(usage);

  return asRecord(record.openai ?? usage);
}

export function normalizeAuditIdentity(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(
      /\b(at|the|a|an|guided|guide|tour|visit|optional|breakfast|lunch|dinner|meal|fly|flight)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function textForAudit(value: {
  address?: string | null;
  arrival?: string | null;
  category?: string | null;
  departure?: string | null;
  description?: string | null;
  evidence?: string | null;
  locationName?: string | null;
  provider?: string | null;
  title: string;
  type?: string | null;
}) {
  return [
    value.title,
    value.category,
    value.type,
    value.description,
    value.evidence,
    value.locationName,
    value.address,
    value.departure,
    value.arrival,
    value.provider,
  ]
    .filter(Boolean)
    .join(" ");
}
