"use client";

import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";

export function CopyLinkButton({ shareUrl }: { shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(shareUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      <Copy size={16} />
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function RefreshAppButton() {
  const [state, setState] = useState("Published snapshot is current.");

  return (
    <>
      <p className="mt-2 text-sm leading-6 text-ink/60">{state}</p>
      <button
        className="mt-4 inline-flex items-center gap-2 rounded-md border border-ink/15 px-4 py-3 text-sm font-semibold text-ink"
        type="button"
        onClick={() => setState("Refresh queued. In production this creates a new snapshot.")}
      >
        <RefreshCw size={16} />
        Refresh app
      </button>
    </>
  );
}
