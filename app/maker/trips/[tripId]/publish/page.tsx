import Link from "next/link";
import { ExternalLink, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
import { CopyLinkButton, RefreshAppButton } from "@/components/publish-actions";
import { getAppUrl } from "@/lib/env";
import { getMakerTrip } from "@/lib/trips";

export default async function PublishPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ error?: string; published?: string }>;
}) {
  const { tripId } = await params;
  const { error, published } = await searchParams;
  const trip = await getMakerTrip(tripId);
  const token = trip.publishedAppToken ?? (trip.isDemo ? "demo" : null);
  const shareUrl = token ? `${getAppUrl()}/t/${token}` : null;

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <h1 className="text-4xl font-semibold text-ink">
            Share the traveler app
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Create a traveler snapshot from the current trip records, then
            share the private link when it is ready.
          </p>
        </header>

        <MakerProgress
          completedSteps={6}
          currentStep={7}
          detail="The app is ready to share. Future late documents should be handled as small updates to the existing trip spine."
          maxAccessibleStep={7}
          tripId={tripId}
        />

        {error ? (
          <p className="mt-6 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
            {error === "checkout-required"
              ? "Checkout must be complete before publishing."
              : error === "publish-failed"
                ? "Publishing failed. Check that the snapshot database table exists before trying again."
                : "Publishing could not be completed. Please try again."}
          </p>
        ) : null}
        {published ? (
          <p className="mt-6 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            {published === "demo"
              ? "Demo preview is available."
              : "Published snapshot saved."}
          </p>
        ) : null}

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-moss" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-ink">
                  Private app is ready
                </h2>
                <p className="mt-1 text-sm text-ink/60">
                  {shareUrl
                    ? "Anyone with the link can view this beta preview."
                    : "Create the first snapshot to get a private share link."}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-ink/10 bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                Share URL
              </p>
              <p className="mt-2 break-all text-sm font-semibold text-ink">
                {shareUrl ?? "Not published yet"}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {shareUrl ? <CopyLinkButton shareUrl={shareUrl} /> : null}
              {shareUrl ? (
                <Link
                  href={`/t/${token}`}
                  className="inline-flex items-center gap-2 rounded-md border border-ink/15 px-4 py-3 text-sm font-semibold text-ink"
                >
                  <ExternalLink size={16} />
                  Open preview
                </Link>
              ) : null}
              <form action={`/maker/trips/${tripId}/publish/snapshot`} method="post">
                <button
                  className="inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                  type="submit"
                >
                  {shareUrl ? "Refresh snapshot" : "Create snapshot"}
                </button>
              </form>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-md border border-ink/10 bg-white p-5">
              <RotateCcw className="text-tide" size={22} />
              <h2 className="mt-4 text-lg font-semibold text-ink">
                Refresh status
              </h2>
              <RefreshAppButton />
            </div>

            <div className="rounded-md border border-ink/10 bg-white p-5">
              <Smartphone className="text-clay" size={22} />
              <h2 className="mt-4 text-lg font-semibold text-ink">
                Add to home screen
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                The traveler app is designed as a PWA, so travelers can save it
                on their phone without an app-store install.
              </p>
            </div>

            <div className="rounded-md border border-ink/10 bg-white p-5">
              <RotateCcw className="text-ink/60" size={22} />
              <h2 className="mt-4 text-lg font-semibold text-ink">
                Privacy controls
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Public launch should support unpublish and rotate-link actions.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
