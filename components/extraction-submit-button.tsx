"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

const processingSteps = [
  "Reading your materials",
  "Finding dates and places",
  "Reviewing flights and stays",
  "Sorting dining reservations",
  "Building the review list",
];

export function ExtractionSubmitButton({
  canExtract,
}: {
  canExtract: boolean;
}) {
  const { pending } = useFormStatus();
  const [stepIndex, setStepIndex] = useState(0);
  const disabled = !canExtract || pending;

  useEffect(() => {
    if (!pending) {
      setStepIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % processingSteps.length);
    }, 900);

    return () => window.clearInterval(interval);
  }, [pending]);

  return (
    <div>
      <button
        className={
          disabled
            ? "inline-flex rounded-md bg-ink/30 px-4 py-3 text-sm font-semibold text-paper"
            : "inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
        }
        disabled={disabled}
        type="submit"
      >
        {pending ? "Building your draft..." : "Build my trip app"}
      </button>
      {pending ? (
        <div className="mt-4 max-w-md rounded-md border border-ink/10 bg-paper p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
            <span>Processing</span>
            <span>{stepIndex + 1}/{processingSteps.length}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-moss transition-all duration-500"
              style={{
                width: `${((stepIndex + 1) / processingSteps.length) * 100}%`,
              }}
            />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">
            {processingSteps[stepIndex]}
          </p>
        </div>
      ) : null}
    </div>
  );
}
