"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

const processingSteps = [
  "Reading your materials",
  "Finding dates and places",
  "Reviewing flights and stays",
  "Sorting dining reservations",
  "Building the review list",
];

export function ExtractionSubmitButton({
  action,
  canExtract,
  isRetry = false,
}: {
  action: string;
  canExtract: boolean;
  isRetry?: boolean;
}) {
  const [pending, setPending] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch(action, {
        method: "POST",
      });

      window.location.assign(response.url || action.replace(/\/extract$/, ""));
    } catch {
      const fallbackUrl = new URL(window.location.href);
      fallbackUrl.searchParams.set("error", "extraction-failed");
      window.location.assign(fallbackUrl.toString());
    }
  }

  return (
    <form action={action} className="mt-5" method="post" onSubmit={handleSubmit}>
      <button
        className={
          disabled
            ? "inline-flex rounded-md bg-ink/30 px-4 py-3 text-sm font-semibold text-paper"
            : "inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
        }
        disabled={disabled}
        type="submit"
      >
        {pending
          ? "Building your draft..."
          : isRetry
            ? "Retry build"
            : "Build my trip app"}
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
          <p className="mt-1 text-xs leading-5 text-ink/50">
            This can take a minute. Keep this tab open while Roamwoven builds
            the first draft.
          </p>
        </div>
      ) : null}
    </form>
  );
}
