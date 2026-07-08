import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TripProcessingEventStatus =
  | "blocked"
  | "completed"
  | "failed"
  | "info"
  | "skipped"
  | "started";

export type TripProcessingEventInput = {
  details?: Record<string, unknown> | null;
  errorMessage?: string | null;
  processingRunId?: string | null;
  stage: string;
  status: TripProcessingEventStatus;
  tripId: string;
};

type TripProcessingEventRow = {
  created_at: string | null;
  details: unknown;
  error_message: string | null;
  id: string;
  processing_run_id: string | null;
  stage: string;
  status: string;
  trip_id: string;
};

export type TripProcessingEvent = {
  createdAt: string | null;
  details: Record<string, unknown>;
  errorMessage: string | null;
  id: string;
  processingRunId: string | null;
  stage: string;
  status: string;
  tripId: string;
};

const EVENT_DETAIL_STRING_LIMIT = 500;
const EVENT_DETAIL_ARRAY_LIMIT = 30;
const EVENT_DETAIL_OBJECT_LIMIT = 60;
const SENSITIVE_EVENT_DETAIL_KEY =
  /(address|booking|code|confirmation|content|door|email|key|lockbox|passcode|password|phone|pnr|private|raw|reference|secret|text|token|wifi|wi-fi)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeDetails(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeEvent(row: TripProcessingEventRow): TripProcessingEvent {
  return {
    createdAt: row.created_at,
    details: normalizeDetails(row.details),
    errorMessage: row.error_message,
    id: row.id,
    processingRunId: row.processing_run_id,
    stage: row.stage,
    status: row.status,
    tripId: row.trip_id,
  };
}

function truncateEventDetailString(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= EVENT_DETAIL_STRING_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, EVENT_DETAIL_STRING_LIMIT).trim()}...`;
}

function redactEventDetailString(value: string, includePrivate: boolean) {
  const truncated = truncateEventDetailString(value);

  if (includePrivate) {
    return truncated;
  }

  return truncated
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted email]"
    )
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted phone]")
    .replace(
      /\b(password|passcode|access code|door code|lockbox|wifi|wi-fi|confirmation|booking reference|reservation code|pnr)\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{2,}\b/gi,
      "$1 [redacted]"
    );
}

function redactEventDetailValue({
  includePrivate,
  key,
  value,
}: {
  includePrivate: boolean;
  key?: string;
  value: unknown;
}): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    if (!includePrivate && key && SENSITIVE_EVENT_DETAIL_KEY.test(key)) {
      return "[redacted value]";
    }

    return redactEventDetailString(value, includePrivate);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (!includePrivate && key && SENSITIVE_EVENT_DETAIL_KEY.test(key)) {
      return "[redacted list]";
    }

    const items = value
      .slice(0, EVENT_DETAIL_ARRAY_LIMIT)
      .map((item) =>
        redactEventDetailValue({ includePrivate, key: undefined, value: item })
      );

    if (value.length > EVENT_DETAIL_ARRAY_LIMIT) {
      items.push(`[truncated ${value.length - EVENT_DETAIL_ARRAY_LIMIT} items]`);
    }

    return items;
  }

  if (isRecord(value)) {
    if (!includePrivate && key && SENSITIVE_EVENT_DETAIL_KEY.test(key)) {
      return "[redacted object]";
    }

    const entries = Object.entries(value);
    const redactedEntries = entries
      .slice(0, EVENT_DETAIL_OBJECT_LIMIT)
      .map(([entryKey, entryValue]) => [
        entryKey,
        redactEventDetailValue({
          includePrivate,
          key: entryKey,
          value: entryValue,
        }),
      ]);

    if (entries.length > EVENT_DETAIL_OBJECT_LIMIT) {
      redactedEntries.push([
        "_truncatedKeys",
        entries.length - EVENT_DETAIL_OBJECT_LIMIT,
      ]);
    }

    return Object.fromEntries(redactedEntries);
  }

  return String(value);
}

export function createRedactedTripProcessingEvent(
  event: TripProcessingEvent,
  { includePrivate = false }: { includePrivate?: boolean } = {}
): TripProcessingEvent {
  return {
    ...event,
    details: redactEventDetailValue({
      includePrivate,
      value: event.details,
    }) as Record<string, unknown>,
    errorMessage: event.errorMessage
      ? redactEventDetailString(event.errorMessage, includePrivate)
      : null,
  };
}

export async function listTripProcessingEvents(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_processing_events")
    .select(
      "id,trip_id,processing_run_id,stage,status,details,error_message,created_at"
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return [];
    }

    throw new Error(`Unable to load processing events: ${error.message}`);
  }

  return ((data ?? []) as unknown as TripProcessingEventRow[]).map(
    normalizeEvent
  );
}

export async function recordTripProcessingEvent({
  details,
  errorMessage,
  processingRunId,
  stage,
  status,
  tripId,
}: TripProcessingEventInput) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("trip_processing_events").insert({
      details: details ?? {},
      error_message: errorMessage ? errorMessage.slice(0, 1000) : null,
      processing_run_id: processingRunId ?? null,
      stage,
      status,
      trip_id: tripId,
    });

    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      console.warn("trip_processing_event_record_failed", {
        message: error.message,
        stage,
        status,
        tripId,
      });
    }
  } catch (error) {
    console.warn("trip_processing_event_record_failed", {
      message: error instanceof Error ? error.message : "Unknown error.",
      stage,
      status,
      tripId,
    });
  }
}
