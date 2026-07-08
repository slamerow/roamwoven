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
