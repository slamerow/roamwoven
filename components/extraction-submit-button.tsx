"use client";

import { useFormStatus } from "react-dom";

export function ExtractionSubmitButton({
  canExtract,
}: {
  canExtract: boolean;
}) {
  const { pending } = useFormStatus();
  const disabled = !canExtract || pending;

  return (
    <button
      className={
        disabled
          ? "inline-flex rounded-md bg-ink/30 px-4 py-3 text-sm font-semibold text-paper"
          : "inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
      }
      disabled={disabled}
      type="submit"
    >
      {pending ? "Building trip app..." : "Build my trip app"}
    </button>
  );
}
