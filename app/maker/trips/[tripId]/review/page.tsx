import { MakerProgress } from "@/components/maker-progress";
import { ReviewFlowPanel } from "@/components/review-flow-panel";
import { getTripBuildSettings } from "@/lib/build-settings";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads } from "@/lib/uploads";

export default async function ReviewPage({
  params,
  searchParams
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { tripId } = await params;
  const { saved, error } = await searchParams;
  const trip = await getMakerTrip(tripId);
  const canReview = trip.isDemo || trip.paymentStatus === "paid";
  const uploads = canReview ? await listTripUploads(tripId) : [];
  const settings = await getTripBuildSettings(tripId);

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-ink/10 pb-6">
          <h1 className="text-4xl font-semibold text-ink">
            App setup
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Choose what belongs in {trip.name} before Roamwoven builds the
            first draft.
          </p>
        </header>

        <MakerProgress
          completedSteps={uploads.length > 0 ? 2 : 1}
          currentStep={3}
          detail="Choose the traveler-app sections before design. You can return here later from draft review if the app structure needs to change."
          isPaid={canReview}
          tripId={tripId}
        />

        <ReviewFlowPanel
          trip={trip}
          uploads={uploads}
          settings={settings}
          saved={saved === "settings"}
          error={Boolean(error)}
        />
      </div>
    </main>
  );
}
