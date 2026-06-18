import Link from "next/link";
import { ExternalLink, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
import { CopyLinkButton, RefreshAppButton } from "@/components/publish-actions";

const shareUrl = "https://roamwoven.com/t/demo";

export default async function PublishPage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Publish
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Share the traveler app
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Trip `{tripId}` has a beta publish screen. In production this will
            create a private snapshot and share token.
          </p>
        </header>

        <MakerProgress
          completedSteps={6}
          currentStep={7}
          detail="The app is ready to share. Future late documents should be handled as small updates to the existing trip spine."
          isPaid
          tripId={tripId}
        />

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-moss" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-ink">
                  Private app is ready
                </h2>
                <p className="mt-1 text-sm text-ink/60">
                  Anyone with the link can view this beta preview.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-md border border-ink/10 bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                Share URL
              </p>
              <p className="mt-2 break-all text-sm font-semibold text-ink">
                {shareUrl}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <CopyLinkButton shareUrl={shareUrl} />
              <Link
                href="/t/demo"
                className="inline-flex items-center gap-2 rounded-md border border-ink/15 px-4 py-3 text-sm font-semibold text-ink"
              >
                <ExternalLink size={16} />
                Open preview
              </Link>
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
