import Link from "next/link";
import { MakerProgress } from "@/components/maker-progress";
import { StyleSettingsPanel } from "@/components/style-settings-panel";
import { getTripStyleSettings } from "@/lib/style-settings";
import { getMakerTrip } from "@/lib/trips";

export default async function StylePage({
  params,
  searchParams
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ error?: string; scope?: string }>;
}) {
  const { tripId } = await params;
  const { error, scope } = await searchParams;
  const trip = await getMakerTrip(tripId);
  const settings = await getTripStyleSettings({
    fallbackAppName: trip.name,
    tripId,
  });

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <h1 className="text-4xl font-semibold text-ink">
            Make it feel like your trip
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Every design direction starts from a quiet luxury travel-app
            foundation, then changes the atmosphere around the traveler
            architecture the generated app will use.
          </p>
        </header>

        <MakerProgress
          completedSteps={settings.updatedAt ? 4 : 3}
          currentStep={4}
          detail="Color choices should show up immediately in previews and carry into draft review before the final traveler app is published."
          isPaid={trip.isDemo || trip.paymentStatus === "paid"}
          tripId={tripId}
        />

        {scope === "saved" ? (
          <p className="mt-6 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            Content choices saved.
          </p>
        ) : null}
        {error ? (
          <p className="mt-6 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
            Design choices could not be saved. Try again.
          </p>
        ) : null}

        <Link
          className="mt-6 inline-flex rounded-md border border-ink/15 px-4 py-3 text-sm font-semibold text-ink"
          href={`/maker/trips/${tripId}/review`}
        >
          Back to app setup
        </Link>

        <StyleSettingsPanel settings={settings} tripId={tripId} />
      </div>
    </main>
  );
}
