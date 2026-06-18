"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";

export function TripNameEditor({
  canRename,
  name,
  tripId,
}: {
  canRename: boolean;
  name: string;
  tripId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!canRename) {
    return <h1 className="text-4xl font-semibold text-ink">{name}</h1>;
  }

  if (isEditing) {
    return (
      <form
        action={`/maker/trips/${tripId}/settings`}
        className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center"
        method="post"
      >
        <input
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-ink/15 bg-white px-3 py-3 text-2xl font-semibold text-ink"
          defaultValue={name}
          name="name"
        />
        <button
          aria-label="Save trip name"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-ink text-paper"
          type="submit"
        >
          <Check size={18} />
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <h1 className="text-4xl font-semibold text-ink">{name}</h1>
      <button
        aria-label="Edit trip name"
        className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-white text-ink transition hover:border-ink/25"
        type="button"
        onClick={() => setIsEditing(true)}
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}
