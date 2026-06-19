"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

const processingSteps = [
  "Checking trip dates and places",
  "Checking flights and trains",
  "Checking hotels and lodging",
  "Checking dinner reservations",
  "Checking museums and tours",
  "Checking other activities and notes",
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const disabled = !canExtract || pending;

  useEffect(() => {
    if (!pending) {
      setElapsedSeconds(0);
      setStepIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [pending]);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const nextStep = Math.min(
      processingSteps.length - 1,
      Math.floor(elapsedSeconds / 22)
    );
    setStepIndex(nextStep);
  }, [elapsedSeconds, pending]);

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
            <span>{Math.min(95, 12 + elapsedSeconds)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-moss transition-all duration-1000"
              style={{
                width: `${Math.min(95, 12 + elapsedSeconds)}%`,
              }}
            />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">
            {processingSteps[stepIndex]}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/50">
            This can take up to 5 minutes. Keep this tab open; go grab water and
            Roamwoven should be ready when you're back.
          </p>
        </div>
      ) : null}
    </form>
  );
}
