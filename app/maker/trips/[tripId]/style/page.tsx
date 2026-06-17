import { StyleSettingsPanel } from "@/components/style-settings-panel";
import { getMakerTrip } from "@/lib/trips";

export default async function StylePage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            App Style
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Make it feel like your trip
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Keep customization simple for V1: app name, primary color, and a
            theme direction.
          </p>
        </header>

        <StyleSettingsPanel initialAppName={trip.name} tripId={tripId} />
      </div>
    </main>
  );
}
