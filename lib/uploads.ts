import { getCurrentUser } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TRIP_MATERIALS_BUCKET = "trip-materials";
const MAX_FILES_PER_UPLOAD = 20;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const NOTE_FILENAME = "Pasted notes";

const allowedExtensions = new Set([
  "csv",
  "doc",
  "docx",
  "jpeg",
  "jpg",
  "pdf",
  "png",
  "txt",
  "webp",
  "xls",
  "xlsx",
]);

const allowedMimeTypes = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
]);

export type TripUpload = {
  id: string;
  tripId: string;
  originalFilename: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  storagePath: string | null;
  userNote: string | null;
  processingStatus: string;
  createdAt: string | null;
};

type TripUploadRow = {
  id: string;
  trip_id: string;
  original_filename: string;
  file_type: string | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  user_note: string | null;
  processing_status: string | null;
  created_at: string | null;
};

export type UploadTripMaterialsInput = {
  tripId: string;
  files: File[];
  notes?: string;
};

export class UploadValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function hasSupabaseServerConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

function normalizeUpload(row: TripUploadRow): TripUpload {
  return {
    id: row.id,
    tripId: row.trip_id,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    fileSizeBytes: row.file_size_bytes,
    storagePath: row.storage_path,
    userNote: row.user_note,
    processingStatus: row.processing_status ?? "pending",
    createdAt: row.created_at,
  };
}

function getExtension(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function getStoredFilename(filename: string) {
  const sanitized = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 120);

  return sanitized || "upload";
}

function isSupportedFile(file: File) {
  const extension = getExtension(file.name);
  return allowedMimeTypes.has(file.type) || allowedExtensions.has(extension);
}

function validateFiles(files: File[]) {
  if (files.length > MAX_FILES_PER_UPLOAD) {
    throw new UploadValidationError(
      "too-many-files",
      `Upload ${MAX_FILES_PER_UPLOAD} files or fewer at a time.`
    );
  }

  files.forEach((file) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new UploadValidationError(
        "file-too-large",
        `${file.name} is larger than the 25 MB beta limit.`
      );
    }

    if (!isSupportedFile(file)) {
      throw new UploadValidationError(
        "unsupported-file",
        `${file.name} is not a supported beta file type.`
      );
    }
  });
}

export async function listTripUploads(tripId: string): Promise<TripUpload[]> {
  if (!hasSupabaseServerConfig() || tripId === "demo-trip") {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_uploads")
    .select(
      [
        "id",
        "trip_id",
        "original_filename",
        "file_type",
        "file_size_bytes",
        "storage_path",
        "user_note",
        "processing_status",
        "created_at",
      ].join(",")
    )
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load uploads: ${error.message}`);
  }

  return ((data ?? []) as unknown as TripUploadRow[]).map(normalizeUpload);
}

export async function uploadTripMaterials({
  tripId,
  files,
  notes = "",
}: UploadTripMaterialsInput) {
  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase server config is missing.");
  }

  const user = await getCurrentUser();

  if (!user) {
    throw new UploadValidationError(
      "auth-required",
      "You must be signed in to upload files."
    );
  }

  const trimmedNotes = notes.trim();

  if (files.length === 0 && !trimmedNotes) {
    throw new UploadValidationError(
      "empty-upload",
      "Add at least one file or note."
    );
  }

  validateFiles(files);

  const supabase = await createSupabaseServerClient();
  const createdUploads: TripUpload[] = [];

  for (const file of files) {
    const uploadId = crypto.randomUUID();
    const storagePath = [
      user.id,
      tripId,
      uploadId,
      getStoredFilename(file.name),
    ].join("/");

    const { error: storageError } = await supabase.storage
      .from(TRIP_MATERIALS_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (storageError) {
      throw new Error(`Unable to store ${file.name}: ${storageError.message}`);
    }

    const { data, error: rowError } = await supabase
      .from("trip_uploads")
      .insert({
        trip_id: tripId,
        original_filename: file.name,
        file_type: file.type || null,
        file_size_bytes: file.size,
        storage_path: storagePath,
        processing_status: "uploaded",
      })
      .select(
        [
          "id",
          "trip_id",
          "original_filename",
          "file_type",
          "file_size_bytes",
          "storage_path",
          "user_note",
          "processing_status",
          "created_at",
        ].join(",")
      )
      .single();

    if (rowError || !data) {
      await supabase.storage.from(TRIP_MATERIALS_BUCKET).remove([storagePath]);
      throw new Error(
        `Unable to save upload record: ${rowError?.message ?? "No row"}`
      );
    }

    createdUploads.push(normalizeUpload(data as unknown as TripUploadRow));
  }

  if (trimmedNotes) {
    const { data, error } = await supabase
      .from("trip_uploads")
      .insert({
        trip_id: tripId,
        original_filename: NOTE_FILENAME,
        file_type: "text/plain",
        file_size_bytes: new Blob([trimmedNotes]).size,
        storage_path: null,
        user_note: trimmedNotes,
        processing_status: "uploaded",
      })
      .select(
        [
          "id",
          "trip_id",
          "original_filename",
          "file_type",
          "file_size_bytes",
          "storage_path",
          "user_note",
          "processing_status",
          "created_at",
        ].join(",")
      )
      .single();

    if (error || !data) {
      throw new Error(`Unable to save notes: ${error?.message ?? "No row"}`);
    }

    createdUploads.push(normalizeUpload(data as unknown as TripUploadRow));
  }

  return createdUploads;
}

export async function deleteTripUpload({
  tripId,
  uploadId,
}: {
  tripId: string;
  uploadId: string;
}) {
  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase server config is missing.");
  }

  const user = await getCurrentUser();

  if (!user) {
    throw new UploadValidationError(
      "auth-required",
      "You must be signed in to delete materials."
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: loadError } = await supabase
    .from("trip_uploads")
    .select("id,storage_path")
    .eq("id", uploadId)
    .eq("trip_id", tripId)
    .single();

  if (loadError || !data) {
    throw new Error(`Unable to load upload: ${loadError?.message ?? "No row"}`);
  }

  const { error: deleteError } = await supabase
    .from("trip_uploads")
    .delete()
    .eq("id", uploadId)
    .eq("trip_id", tripId);

  if (deleteError) {
    throw new Error(`Unable to delete upload: ${deleteError.message}`);
  }

  const storagePath = String(data.storage_path ?? "");

  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from(TRIP_MATERIALS_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      throw new Error(`Unable to delete stored file: ${storageError.message}`);
    }
  }
}
