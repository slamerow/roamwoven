"use client";

import { useMemo, useRef, useState } from "react";
import { ClipboardList, FileImage, FileSpreadsheet, FileText, UploadCloud } from "lucide-react";

type QueuedFile = {
  name: string;
  size: number;
  type: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconForFile(file: QueuedFile) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".csv")) {
    return FileSpreadsheet;
  }

  if (file.type.startsWith("image/")) {
    return FileImage;
  }

  return FileText;
}

export function UploadIntakePanel({ tripId }: { tripId: string }) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canStart = files.length > 0 || notes.trim().length > 0;
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );

  function queueFiles(fileList: FileList | null) {
    const selected = Array.from(fileList ?? []).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    }));

    setFiles(selected);
  }

  return (
    <form
      action={`/maker/trips/${tripId}/upload/materials`}
      className="rounded-md border border-dashed border-ink/20 bg-white p-6"
      encType="multipart/form-data"
      method="post"
    >
      <div className="flex items-center gap-3">
        <UploadCloud className="text-moss" size={26} />
        <div>
          <h2 className="text-xl font-semibold text-ink">
            Upload trip materials
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Saved materials stay attached to this trip for review.
          </p>
        </div>
      </div>

      <label
        className={`mt-6 flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center transition ${
          isDragging
            ? "border-moss bg-moss/10"
            : "border-ink/20 bg-paper"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          queueFiles(event.dataTransfer.files);

          if (fileInputRef.current) {
            fileInputRef.current.files = event.dataTransfer.files;
          }
        }}
      >
        <UploadCloud className="text-tide" size={34} />
        <span className="mt-4 text-base font-semibold text-ink">
          {isDragging
            ? "Drop them here"
            : files.length > 0
              ? "Add more files"
              : "Drop files here or choose files"}
        </span>
        <span className="mt-2 max-w-md text-sm leading-6 text-ink/60">
          {files.length > 0
            ? "Your materials are queued below. Add another PDF, screenshot, image, text file, or note if needed."
            : "For this parser pass, use PDFs, screenshots/images, text files, or pasted notes."}
        </span>
        <input
          ref={fileInputRef}
          className="sr-only"
          multiple
          name="materials"
          type="file"
          onChange={(event) => queueFiles(event.target.files)}
        />
      </label>

      {files.length > 0 ? (
        <div className="mt-4 rounded-md border border-ink/10 bg-paper p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">
              {files.length} files queued
            </p>
            <p className="text-sm text-ink/55">{formatSize(totalSize)}</p>
          </div>
          <div className="space-y-2">
            {files.map((file) => {
              const Icon = iconForFile(file);
              return (
                <div
                  key={`${file.name}-${file.size}`}
                  className="flex items-center justify-between rounded-md bg-white px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="shrink-0 text-tide" size={18} />
                    <span className="truncate text-sm font-semibold text-ink">
                      {file.name}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-ink/50">
                    {formatSize(file.size)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <label className="mt-5 block">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ClipboardList size={18} />
          Paste loose notes
        </span>
        <textarea
          className="mt-2 min-h-36 w-full rounded-md border border-ink/15 bg-white px-3 py-3 text-sm leading-6"
          name="notes"
          placeholder="Paste itinerary notes, booking snippets, restaurant ideas, or anything that did not come as a file."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {canStart ? (
          <button
            className="inline-flex justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
            type="submit"
          >
            Save materials
          </button>
        ) : (
          <button
            className="rounded-md bg-ink/30 px-4 py-3 text-sm font-semibold text-paper"
            disabled
            type="button"
          >
            Start intake review
          </button>
        )}
        <p className="text-sm text-ink/55">
          {canStart
            ? "Ready to save securely."
            : "Add at least one file or note to continue."}
        </p>
      </div>
    </form>
  );
}
