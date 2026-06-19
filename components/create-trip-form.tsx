"use client";

import { useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  FileImage,
  FileSpreadsheet,
  FileText,
  UploadCloud,
} from "lucide-react";

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

export function CreateTripForm({ error }: { error?: string }) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      action="/maker/trips/create"
      className="mt-8 space-y-5 rounded-md border border-ink/10 bg-white p-5"
      encType="multipart/form-data"
      method="post"
    >
      <label className="block">
        <span className="text-sm font-semibold text-ink">Trip name</span>
        <input
          className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
          name="name"
          placeholder="The Millers in Japan"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Description</span>
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-ink/15 px-3 py-3 text-sm leading-6"
          name="description"
          placeholder="A short description of the trip, who it is for, and what kind of app you want."
        />
      </label>

      <label
        className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center transition ${
          isDragging ? "border-moss bg-moss/10" : "border-ink/20 bg-paper"
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
          {isDragging ? "Drop them here" : "Drag files here or choose files"}
        </span>
        <span className="mt-2 max-w-md text-sm leading-6 text-ink/60">
          Start with PDFs, screenshots, confirmations, docs, spreadsheets, or
          notes. Roamwoven saves these now and waits until checkout to process
          them.
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
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">
              {files.length} files ready
            </p>
            <p className="text-sm text-ink/55">{formatSize(totalSize)}</p>
          </div>
          <div className="space-y-2">
            {files.map((file) => {
              const Icon = iconForFile(file);

              return (
                <div
                  className="flex items-center justify-between rounded-md bg-white px-3 py-2"
                  key={`${file.name}-${file.size}`}
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

      <label className="block">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ClipboardList size={18} />
          Paste loose notes
        </span>
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-ink/15 bg-white px-3 py-3 text-sm leading-6"
          name="notes"
          placeholder="Anything not in a file can go here: restaurant ideas, booking snippets, family preferences, or reminders."
        />
      </label>

      {error === "missing-name" ? (
        <p className="rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
          Add a trip name before continuing.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="inline-flex justify-center rounded-md bg-ink px-5 py-3 text-sm font-semibold text-paper"
          type="submit"
        >
          Save trip materials
        </button>
        <p className="text-sm leading-6 text-ink/55">
          Processing starts only after checkout.
        </p>
      </div>
    </form>
  );
}
