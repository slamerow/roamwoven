// Storage for pinned extraction parses (Arc E). Kept separate from
// extraction-pinning.ts so the client-boundary memo module carries no
// Supabase/Next dependencies. Both load and save are FAIL-SOFT: pinning
// machinery may never block or alter an extraction run (RW-OPS-001) — a
// storage failure is telemetry, the run proceeds live.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PinnedModelCall } from "@/lib/extraction/extraction-pinning";

export async function loadPinnedExtractionParse({
  parseKey,
  tripId,
}: {
  parseKey: string;
  tripId: string;
}): Promise<{ calls: PinnedModelCall[] } | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("trip_extraction_parses")
      .select("calls_json")
      .eq("trip_id", tripId)
      .eq("parse_key", parseKey)
      .maybeSingle();
    if (error || !data) {
      if (error) {
        console.warn("trip_extraction_pin_load_failed", {
          message: error.message,
          parseKey,
          tripId,
        });
      }
      return null;
    }
    const calls = Array.isArray(data.calls_json)
      ? (data.calls_json as PinnedModelCall[]).filter(
          (call) => call && typeof call.h === "string"
        )
      : [];
    return { calls };
  } catch (error) {
    console.warn("trip_extraction_pin_load_failed", {
      message: error instanceof Error ? error.message : "Unknown error.",
      parseKey,
      tripId,
    });
    return null;
  }
}

export async function savePinnedExtractionParse({
  calls,
  materialFingerprints,
  model,
  parseKey,
  samplingParams,
  stats,
  tripId,
}: {
  calls: PinnedModelCall[];
  materialFingerprints: string[];
  model: string;
  parseKey: string;
  samplingParams: Record<string, unknown>;
  stats: Record<string, unknown>;
  tripId: string;
}): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("trip_extraction_parses").upsert(
      {
        calls_json: calls,
        extraction_model: model,
        material_fingerprints: materialFingerprints,
        parse_key: parseKey,
        sampling_params: samplingParams,
        stats_json: stats,
        trip_id: tripId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trip_id,parse_key" }
    );
    if (error) {
      console.warn("trip_extraction_pin_save_failed", {
        message: error.message,
        parseKey,
        tripId,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("trip_extraction_pin_save_failed", {
      message: error instanceof Error ? error.message : "Unknown error.",
      parseKey,
      tripId,
    });
    return false;
  }
}
