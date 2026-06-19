import { createHash } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TRIP_MATERIALS_BUCKET = "trip-materials";
export const UNPAID_STARTER_MATERIAL_RETENTION_DAYS = 14;
const MAX_FILES_PER_UPLOAD = 20;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_UPLOADS_PER_TRIP = 100;
const MAX_TRIP_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_NOTE_BYTES = 250 * 1024;
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

const mimeTypeByExtension: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export type TripUpload = {
  id: string;
  tripId: string;
  originalFilename: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  contentSha256: string | null;
  storagePath: string | null;
  sourceKind: string;
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
  content_sha256: string | null;
  storage_path: string | null;
  source_kind: string | null;
  user_note: string | null;
  processing_status: string | null;
  created_at: string | null;
};

type AbandonedUploadCleanupRow = {
  id: string;
  storage_path: string | null;
  trip_id: string;
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
    contentSha256: row.content_sha256,
    storagePath: row.storage_path,
    sourceKind: row.source_kind ?? (row.storage_path ? "file" : "note"),
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

function getUploadContentType(file: File) {
  if (allowedMimeTypes.has(file.type)) {
    return file.type;
  }

  return mimeTypeByExtension[getExtension(file.name)] ?? null;
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

function getByteCount(value: string) {
  return new Blob([value]).size;
}

function sha256Hex(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function getFileHash(file: File) {
  return sha256Hex(Buffer.from(await file.arrayBuffer()));
}

function getNoteHash(value: string) {
  return sha256Hex(Buffer.from(value, "utf8"));
}

type IncomingFileIdentity = {
  file: File;
  sha256: string;
};

async function validateTripUploadCapacity({
  tripId,
  fileIdentities,
  incomingCount,
  incomingBytes,
  noteHash,
  notes,
}: {
  fileIdentities: IncomingFileIdentity[];
  tripId: string;
  incomingCount: number;
  incomingBytes: number;
  noteHash: string | null;
  notes: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_uploads")
    .select("original_filename,file_size_bytes,content_sha256,user_note")
    .eq("trip_id", tripId);

  if (error) {
    throw new Error(`Unable to check upload limits: ${error.message}`);
  }

  const existingUploads = data ?? [];
  const existingBytes = existingUploads.reduce(
    (sum, upload) => sum + Number(upload.file_size_bytes ?? 0),
    0
  );
  const existingFileKeys = new Set(
    existingUploads
      .filter((upload) => upload.user_note === null)
      .map(
        (upload) =>
          `${String(upload.original_filename).trim().toLowerCase()}:${Number(
            upload.file_size_bytes ?? 0
          )}`
      )
  );
  const existingHashes = new Set(
    existingUploads
      .map((upload) =>
        typeof upload.content_sha256 === "string"
          ? upload.content_sha256.trim()
          : ""
      )
      .filter(Boolean)
  );
  const incomingFileKeys = new Set<string>();
  const incomingHashes = new Set<string>();

  for (const { file, sha256 } of fileIdentities) {
    const key = `${file.name.trim().toLowerCase()}:${file.size}`;

    if (
      incomingHashes.has(sha256) ||
      existingHashes.has(sha256) ||
      incomingFileKeys.has(key) ||
      existingFileKeys.has(key)
    ) {
      throw new UploadValidationError(
        "duplicate-material",
        `${file.name} already appears to be attached to this trip.`
      );
    }

    incomingFileKeys.add(key);
    incomingHashes.add(sha256);
  }

  if (
    noteHash &&
    (existingHashes.has(noteHash) || incomingHashes.has(noteHash))
  ) {
    throw new UploadValidationError(
      "duplicate-material",
      "These pasted notes already appear to be attached to this trip."
    );
  }

  if (
    notes &&
    existingUploads.some(
      (upload) => upload.user_note?.trim().toLowerCase() === notes.toLowerCase()
    )
  ) {
    throw new UploadValidationError(
      "duplicate-material",
      "These pasted notes already appear to be attached to this trip."
    );
  }

  if (existingUploads.length + incomingCount > MAX_UPLOADS_PER_TRIP) {
    throw new UploadValidationError(
      "trip-file-limit",
      `This trip can include up to ${MAX_UPLOADS_PER_TRIP} saved materials.`
    );
  }

  if (existingBytes + incomingBytes > MAX_TRIP_UPLOAD_BYTES) {
    throw new UploadValidationError(
      "trip-storage-limit",
      "This trip has reached the beta upload storage limit."
    );
  }
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
        "content_sha256",
        "storage_path",
        "source_kind",
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
  const noteBytes = trimmedNotes ? getByteCount(trimmedNotes) : 0;

  if (files.length === 0 && !trimmedNotes) {
    throw new UploadValidationError(
      "empty-upload",
      "Add at least one file or note."
    );
  }

  validateFiles(files);
  if (noteBytes > MAX_NOTE_BYTES) {
    throw new UploadValidationError(
      "notes-too-large",
      "Pasted notes are too large for one upload."
    );
  }

  const fileIdentities = await Promise.all(
    files.map(async (file) => ({ file, sha256: await getFileHash(file) }))
  );
  const noteHash = trimmedNotes ? getNoteHash(trimmedNotes) : null;

  await validateTripUploadCapacity({
    fileIdentities,
    tripId,
    incomingCount: files.length + (trimmedNotes ? 1 : 0),
    incomingBytes:
      files.reduce((sum, file) => sum + file.size, 0) + noteBytes,
    noteHash,
    notes: trimmedNotes,
  });

  const supabase = await createSupabaseServerClient();
  const createdUploads: TripUpload[] = [];

  for (const { file, sha256 } of fileIdentities) {
    const uploadId = crypto.randomUUID();
    const contentType = getUploadContentType(file);
    const storagePath = [
      user.id,
      tripId,
      uploadId,
      getStoredFilename(file.name),
    ].join("/");

    const { error: storageError } = await supabase.storage
      .from(TRIP_MATERIALS_BUCKET)
      .upload(storagePath, file, {
        contentType: contentType ?? undefined,
        upsert: false,
      });

    if (storageError) {
      console.error("trip_material_storage_upload_failed", {
        tripId,
        fileName: file.name,
        fileType: file.type || null,
        contentType,
        message: storageError.message,
      });
      throw new Error(`Unable to store ${file.name}: ${storageError.message}`);
    }

    const { data, error: rowError } = await supabase
      .from("trip_uploads")
      .insert({
        trip_id: tripId,
        original_filename: file.name,
        file_type: contentType,
        file_size_bytes: file.size,
        content_sha256: sha256,
        storage_path: storagePath,
        source_kind: "file",
        processing_status: "uploaded",
      })
      .select(
        [
          "id",
          "trip_id",
          "original_filename",
          "file_type",
          "file_size_bytes",
          "content_sha256",
          "storage_path",
          "source_kind",
          "user_note",
          "processing_status",
          "created_at",
        ].join(",")
      )
      .single();

    if (rowError || !data) {
      await supabase.storage.from(TRIP_MATERIALS_BUCKET).remove([storagePath]);
      if (rowError?.code === "23505") {
        throw new UploadValidationError(
          "duplicate-material",
          `${file.name} already appears to be attached to this trip.`
        );
      }
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
        file_size_bytes: noteBytes,
        content_sha256: noteHash,
        storage_path: null,
        source_kind: "note",
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
          "content_sha256",
          "storage_path",
          "source_kind",
          "user_note",
          "processing_status",
          "created_at",
        ].join(",")
      )
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new UploadValidationError(
          "duplicate-material",
          "These pasted notes already appear to be attached to this trip."
        );
      }
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

export function getUnpaidStarterMaterialCleanupCutoff({
  now = new Date(),
  retentionDays = UNPAID_STARTER_MATERIAL_RETENTION_DAYS,
}: {
  now?: Date;
  retentionDays?: number;
} = {}) {
  const boundedRetentionDays = Math.max(1, Math.floor(retentionDays));
  return new Date(
    now.getTime() - boundedRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
}

export async function cleanupAbandonedUnpaidStarterMaterials({
  dryRun = true,
  limit = 200,
  retentionDays = UNPAID_STARTER_MATERIAL_RETENTION_DAYS,
}: {
  dryRun?: boolean;
  limit?: number;
  retentionDays?: number;
} = {}) {
  const supabase = createSupabaseAdminClient();
  const cutoff = getUnpaidStarterMaterialCleanupCutoff({ retentionDays });
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 1000));
  const { data, error } = await supabase
    .from("trip_uploads")
    .select(
      [
        "id",
        "trip_id",
        "storage_path",
        "trips!inner(id,payment_status,processing_status,status,created_at)",
      ].join(",")
    )
    .eq("trips.payment_status", "unpaid")
    .eq("trips.processing_status", "not_started")
    .neq("trips.status", "deleted")
    .lt("created_at", cutoff)
    .limit(boundedLimit);

  if (error) {
    throw new Error(
      `Unable to find abandoned unpaid starter materials: ${error.message}`
    );
  }

  const rows = (data ?? []) as unknown as AbandonedUploadCleanupRow[];
  const storagePaths = rows
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  const uploadIds = rows.map((row) => row.id);

  if (dryRun || rows.length === 0) {
    return {
      cutoff,
      deletedFileCount: 0,
      deletedUploadCount: 0,
      dryRun,
      foundFileCount: storagePaths.length,
      foundUploadCount: rows.length,
    };
  }

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(TRIP_MATERIALS_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      throw new Error(
        `Unable to delete abandoned material files: ${storageError.message}`
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("trip_uploads")
    .delete()
    .in("id", uploadIds);

  if (deleteError) {
    throw new Error(
      `Unable to delete abandoned material rows: ${deleteError.message}`
    );
  }

  return {
    cutoff,
    deletedFileCount: storagePaths.length,
    deletedUploadCount: uploadIds.length,
    dryRun,
    foundFileCount: storagePaths.length,
    foundUploadCount: rows.length,
  };
}
