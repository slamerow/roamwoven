import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/env";

export type MakerTrip = {
  id: string;
  name: string;
  destinationSummary: string | null;
  status: string;
  paymentStatus: string;
  processingStatus: string;
  themePack: string;
  travelerPasswordEnabled: boolean;
  photoCount: number;
  photoStorageBytes: number;
  createdAt: string | null;
  isDemo?: boolean;
};

type TripRow = {
  id: string;
  name: string;
  destination_summary: string | null;
  status: string | null;
  payment_status: string | null;
  processing_status: string | null;
  theme_pack: string | null;
  traveler_password_enabled: boolean | null;
  photo_count: number | null;
  photo_storage_bytes: number | null;
  created_at: string | null;
};

const demoTrip: MakerTrip = {
  id: "demo-trip",
  name: "Wren's Adventure",
  destinationSummary: "Asia workbook reference trip",
  status: "preview_ready",
  paymentStatus: "demo",
  processingStatus: "seeded",
  themePack: "quiet_luxury",
  travelerPasswordEnabled: true,
  photoCount: 0,
  photoStorageBytes: 0,
  createdAt: null,
  isDemo: true,
};

function hasSupabaseServerConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

function normalizeTrip(row: TripRow): MakerTrip {
  return {
    id: row.id,
    name: row.name,
    destinationSummary: row.destination_summary,
    status: row.status ?? "draft",
    paymentStatus: row.payment_status ?? "unpaid",
    processingStatus: row.processing_status ?? "not_started",
    themePack: row.theme_pack ?? "quiet_luxury",
    travelerPasswordEnabled: Boolean(row.traveler_password_enabled),
    photoCount: row.photo_count ?? 0,
    photoStorageBytes: row.photo_storage_bytes ?? 0,
    createdAt: row.created_at,
  };
}

export async function listMakerTrips(): Promise<MakerTrip[]> {
  if (!hasSupabaseServerConfig()) {
    return [demoTrip];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      [
        "id",
        "name",
        "destination_summary",
        "status",
        "payment_status",
        "processing_status",
        "theme_pack",
        "traveler_password_enabled",
        "photo_count",
        "photo_storage_bytes",
        "created_at",
      ].join(",")
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load trips: ${error.message}`);
  }

  return ((data ?? []) as unknown as TripRow[]).map(normalizeTrip);
}

export async function getMakerTrip(tripId: string): Promise<MakerTrip> {
  if (tripId === demoTrip.id || !hasSupabaseServerConfig()) {
    return demoTrip;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      [
        "id",
        "name",
        "destination_summary",
        "status",
        "payment_status",
        "processing_status",
        "theme_pack",
        "traveler_password_enabled",
        "photo_count",
        "photo_storage_bytes",
        "created_at",
      ].join(",")
    )
    .eq("id", tripId)
    .single();

  if (error || !data) {
    throw new Error(`Unable to load trip: ${error?.message ?? "No row"}`);
  }

  return normalizeTrip(data as unknown as TripRow);
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "trip";
}

export async function createMakerTrip(input: {
  name: string;
  destinationSummary?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const slug = `${slugify(input.name)}-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("trips")
    .insert({
      name: input.name,
      slug,
      destination_summary: input.destinationSummary || null,
      status: "awaiting_payment",
      payment_status: "unpaid",
      processing_status: "not_started",
      theme_pack: "quiet_luxury",
      traveler_password_enabled: true,
      photo_sharing_enabled: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Unable to create trip: ${error?.message ?? "No row"}`);
  }

  return String(data.id);
}

export function canPersistTrips() {
  return hasSupabaseServerConfig();
}
