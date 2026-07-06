import Link from "next/link";
import { DeleteTripButton } from "@/components/delete-trip-button";
import { MakerProgress } from "@/components/maker-progress";
import { TripNameEditor } from "@/components/trip-name-editor";
import { getCurrentUser } from "@/lib/auth";
import { getPaidCheckoutTripId } from "@/lib/billing/stripe";
import { recordCheckoutPaymentAndMarkPaid } from "@/lib/billing/payment-events";
import { getMakerTrip } from "@/lib/trips";
import { getTripBuildSettings } from "@/lib/build-settings";
import {
  getMakerNextAction,
  getMakerProgressState,
  hasConfirmedBuildSettings,
  hasSavedStyleSettings,
} from "@/lib/maker-flow";
import { getTripStyleSettings } from "@/lib/style-settings";
import { listTripUploads } from "@/lib/uploads";

export default async function TripWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{
    checkout?: string;
    error?: string;
    making?: string;
    renamed?: string;
    saved?: string;
    session_id?: string;
    setup?: string;
  }>;
}) {
  const { tripId } = await params;
  const { checkout, error, making, renamed, saved, session_id: sessionId, setup } =
    await searchParams;
  let checkoutStatus: "verified" | "pending" | "cancelled" | null = null;

  if (checkout === "success" && sessionId) {
    try {
      const [paidSession, user] = await Promise.all([
        getPaidCheckoutTripId(sessionId),
        getCurrentUser(),
      ]);

      if (
        paidSession?.tripId === tripId &&
        paidSession.userId &&
        paidSession.userId === user?.id
      ) {
        await recordCheckoutPaymentAndMarkPaid({
          amountTotal: paidSession.amountTotal,
          checkoutSessionId: paidSession.checkoutSessionId,
          currency: paidSession.currency,
          customerEmail: paidSession.customerEmail,
          eventId: null,
          ownerUserId: paidSession.userId,
          paymentIntentId: paidSession.paymentIntentId,
          rawEvent: { source: "checkout_return", sessionId },
          status: "paid",
          tripId,
        });
        checkoutStatus = "verified";
      } else {
        checkoutStatus = "pending";
      }
    } catch (checkoutError) {
      console.warn("checkout_return_verification_failed", {
        message:
          checkoutError instanceof Error
            ? checkoutError.message
            : "Unknown checkout return error.",
        sessionId,
        tripId,
      });
      checkoutStatus = "pending";
    }
  } else if (checkout === "cancelled") {
    checkoutStatus = "cancelled";
  }

  const trip = await getMakerTrip(tripId);
  const isPaid = trip.paymentStatus === "paid" || Boolean(trip.isDemo);
  const uploads = trip.isDemo ? [] : await listTripUploads(tripId);
  const [buildSettings, styleSettings] = await Promise.all([
    getTripBuildSettings(tripId),
    getTripStyleSettings({ fallbackAppName: trip.name, tripId }),
  ]);
  const hasBuildSettings = hasConfirmedBuildSettings(buildSettings);
  const hasStyleSettings = hasSavedStyleSettings(styleSettings);
  const nextBuildStep = getMakerNextAction({
    hasBuildSettings,
    hasStyleSettings,
    isDemo: trip.isDemo,
    isPaid,
    uploadCount: uploads.length,
  });
  const progress = getMakerProgressState({
    hasBuildSettings,
    hasStyleSettings,
    isDemo: trip.isDemo,
    isPaid,
    uploadCount: uploads.length,
  });

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <TripNameEditor
            canRename={!trip.isDemo}
            name={trip.name}
            tripId={tripId}
          />
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            {trip.isDemo
              ? "Demo trip is seeded so the traveler-app flow stays testable before live extraction exists."
              : "Your app workspace is ready. Follow the steps below to move from trip idea to live traveler app."}
          </p>
        </header>

        {renamed ? (
          <p className="mt-6 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            Trip name updated.
          </p>
        ) : null}
        {saved ? (
          <p className="mt-6 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            Saved {saved} starter material{saved === "1" ? "" : "s"}.
          </p>
        ) : null}
        {error === "rename-failed" ? (
          <p className="mt-6 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
            Trip name could not be updated. Try again.
          </p>
        ) : null}

        {making ? (
          <section className="mt-8 rounded-md border border-moss/20 bg-white p-5">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                  First pass queued
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  Roamwoven is sketching the app shape.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
                  In beta this is a lightweight preview step: we show momentum,
                  then help you choose the app setup before the first build begins.
                </p>
              </div>
              <div className="w-full rounded-md bg-paper p-4 md:w-72">
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full w-2/3 rounded-full bg-moss" />
                </div>
                <div className="mt-4 space-y-2 text-sm text-ink/65">
                  <p>Reading trip context</p>
                  <p>Grouping files and notes</p>
                  <p>Preparing app setup</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {checkoutStatus ? (
          <section
            className={`mt-8 rounded-md border p-4 ${
              checkoutStatus === "cancelled"
                ? "border-clay/20 bg-clay/10 text-clay"
                : checkoutStatus === "verified"
                  ? "border-moss/20 bg-moss/10 text-moss"
                  : "border-tide/20 bg-tide/10 text-tide"
            }`}
          >
            <p className="text-sm font-semibold">
              {checkoutStatus === "verified"
                ? "Payment complete. You can process the first draft."
                : checkoutStatus === "cancelled"
                  ? "Checkout was cancelled. You can try again when you are ready."
                  : "Payment is still being confirmed. Refresh in a moment or continue once the webhook finishes."}
            </p>
          </section>
        ) : null}
        {setup === "ready" ? (
          <p className="mt-6 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            Design saved. Complete checkout to process your first draft.
          </p>
        ) : null}

        <MakerProgress
          completedSteps={progress.completedSteps}
          currentStep={progress.currentStep}
          detail="Each step turns the materials you already have into a polished traveler app you can share."
          maxAccessibleStep={progress.maxAccessibleStep}
          tripId={tripId}
        />

        <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                Next up
              </p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                {nextBuildStep.message}
              </h2>
              {checkout === "setup-required" ? (
                <p className="mt-3 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
                  Stripe Checkout is not configured yet. Add Stripe test keys and
                  a trip price ID to enable this button.
                </p>
              ) : null}
            </div>
            {nextBuildStep.kind === "checkout" ? (
              <form action={`/maker/trips/${tripId}/checkout`} method="post">
                <button
                  className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                  type="submit"
                >
                  {nextBuildStep.label}
                </button>
              </form>
            ) : (
              <Link
                href={`/maker/trips/${tripId}/${nextBuildStep.href}`}
                className="inline-flex justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
              >
                {nextBuildStep.label}
              </Link>
            )}
          </div>
        </section>

        {!trip.isDemo ? (
          <section className="mt-8 rounded-md border border-clay/20 bg-white p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                  Danger zone
                </p>
                <h2 className="mt-2 text-lg font-semibold text-ink">
                  Remove this trip
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
                  This removes the trip from your dashboard and traveler links.
                  You will need to contact support to restore a deleted trip.
                </p>
              </div>
              <DeleteTripButton trip={trip} />
            </div>
          </section>
        ) : null}

      </div>
    </main>
  );
}
