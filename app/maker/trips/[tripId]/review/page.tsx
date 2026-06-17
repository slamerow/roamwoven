import { ReviewFlowPanel } from "@/components/review-flow-panel";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads } from "@/lib/uploads";

export default async function ReviewPage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const canReview = trip.isDemo || trip.paymentStatus === "paid";
  const uploads = canReview ? await listTripUploads(tripId) : [];

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-ink/10 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Intake Review
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Confirm the important stuff
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Review the materials for {trip.name} and choose what belongs in the
            traveler app before clean trip data is generated.
          </p>
        </header>

        <ReviewFlowPanel trip={trip} uploads={uploads} />
      </div>
    </main>
  );
}
