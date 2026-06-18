import Link from "next/link";
import { MakerProgress } from "@/components/maker-progress";
import { TripNameEditor } from "@/components/trip-name-editor";
import { getCurrentUser } from "@/lib/auth";
import {
  getPaidCheckoutTripId,
  getStripeSetupState,
} from "@/lib/billing/stripe";
import { getMakerTrip, markTripPaid } from "@/lib/trips";
import {
  BUILD_CONFIRMATIONS,
  getTripBuildSettings,
} from "@/lib/build-settings";
import { getTripStyleSettings } from "@/lib/style-settings";
import { listTripUploads } from "@/lib/uploads";

function getNextBuildStep({
  hasBuildSettings,
  hasStyleSettings,
  isPaid,
  uploadCount,
}: {
  hasBuildSettings: boolean;
  hasStyleSettings: boolean;
  isPaid: boolean;
  uploadCount: number;
}) {
  if (!isPaid) {
    return {
      href: "",
      label: "Continue to payment",
      message: "Complete checkout to start building the private trip app.",
    };
  }

  if (uploadCount === 0) {
    return {
      href: "upload",
      label: "Continue building: Add materials",
      message: "Next: add the materials Roamwoven should use.",
    };
  }

  if (!hasBuildSettings) {
    return {
      href: "review",
      label: "Continue building: App setup",
      message: "Next: choose what belongs in the traveler app.",
    };
  }

  if (!hasStyleSettings) {
    return {
      href: "style",
      label: "Continue building: Design",
      message: "Next: choose the app's design direction.",
    };
  }

  return {
    href: "data",
    label: "Continue building: Process draft",
    message: "Next: process the first draft and review what needs attention.",
  };
}

function getProgressState({
  hasBuildSettings,
  hasStyleSettings,
  isPaid,
  uploadCount,
}: {
  hasBuildSettings: boolean;
  hasStyleSettings: boolean;
  isPaid: boolean;
  uploadCount: number;
}) {
  if (!isPaid) {
    return { completedSteps: 1, currentStep: 2 };
  }

  if (uploadCount === 0) {
    return { completedSteps: 1, currentStep: 2 };
  }

  if (!hasBuildSettings) {
    return { completedSteps: 2, currentStep: 3 };
  }

  if (!hasStyleSettings) {
    return { completedSteps: 3, currentStep: 4 };
  }

  return { completedSteps: 4, currentStep: 5 };
}

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
    session_id?: string;
  }>;
}) {
  const { tripId } = await params;
  const { checkout, error, making, renamed, session_id: sessionId } =
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
        await markTripPaid(tripId);
        checkoutStatus = "verified";
      } else {
        checkoutStatus = "pending";
      }
    } catch {
      checkoutStatus = "pending";
    }
  } else if (checkout === "cancelled") {
    checkoutStatus = "cancelled";
  }

  const trip = await getMakerTrip(tripId);
  const stripeSetup = getStripeSetupState();
  const isPaid = trip.paymentStatus === "paid" || Boolean(trip.isDemo);
  const [uploads, buildSettings, styleSettings] = isPaid
    ? await Promise.all([
        listTripUploads(tripId),
        getTripBuildSettings(tripId),
        getTripStyleSettings({ fallbackAppName: trip.name, tripId }),
      ])
    : [[], null, null];
  const hasBuildSettings =
    Boolean(buildSettings?.updatedAt) &&
    BUILD_CONFIRMATIONS.every(
      (confirmation) => buildSettings?.confirmations[confirmation.key]
    );
  const hasStyleSettings = Boolean(styleSettings?.updatedAt);
  const nextBuildStep = getNextBuildStep({
    hasBuildSettings,
    hasStyleSettings,
    isPaid,
    uploadCount: uploads.length,
  });
  const progress = getProgressState({
    hasBuildSettings,
    hasStyleSettings,
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
              ? "Demo trip is seeded from Wren's Adventure so the traveler-app flow stays testable before live extraction exists."
              : "Your app workspace is ready. Follow the steps below to move from trip idea to live traveler app."}
          </p>
        </header>

        {renamed ? (
          <p className="mt-6 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            Trip name updated.
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
                  then move into secure checkout before the app build begins.
                </p>
              </div>
              <div className="w-full rounded-md bg-paper p-4 md:w-72">
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full w-2/3 rounded-full bg-moss" />
                </div>
                <div className="mt-4 space-y-2 text-sm text-ink/65">
                  <p>Reading trip context</p>
                  <p>Grouping files and notes</p>
                  <p>Preparing secure checkout</p>
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
                ? "Payment complete. Upload is unlocked."
                : checkoutStatus === "cancelled"
                  ? "Checkout was cancelled. You can try again when you are ready."
                  : "Payment is still being confirmed. Refresh in a moment or continue once the webhook finishes."}
            </p>
          </section>
        ) : null}

        <MakerProgress
          completedSteps={progress.completedSteps}
          currentStep={progress.currentStep}
          detail="Each step turns the materials you already have into a polished traveler app you can share."
          isPaid={isPaid}
          tripId={tripId}
        />

        {isPaid ? (
          <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                  Next up
                </p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  {nextBuildStep.message}
                </h2>
              </div>
              <Link
                href={`/maker/trips/${tripId}/${nextBuildStep.href}`}
                className="inline-flex justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
              >
                {nextBuildStep.label}
              </Link>
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-xl font-semibold text-ink">
              {trip.isDemo ? "Demo flow enabled" : "Start building"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
              {trip.isDemo
                ? "This seeded trip can continue straight to upload while the product is still using mocked beta state."
                : "Complete checkout once, then add the trip materials Roamwoven will turn into a private traveler app."}
            </p>
            {checkout === "setup-required" ? (
              <p className="mt-4 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
                Stripe Checkout is not configured yet. Add Stripe test keys and
                a trip price ID to enable this button.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <form action={`/maker/trips/${tripId}/checkout`} method="post">
                <button
                  className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                  type="submit"
                >
                  Continue to payment
                </button>
              </form>
            </div>
            {!trip.isDemo ? (
              <div className="mt-5 grid gap-2 text-xs text-ink/50 md:grid-cols-3">
                <p>
                  Stripe key: {stripeSetup.hasSecretKey ? "set" : "missing"}
                </p>
                <p>
                  Price ID: {stripeSetup.hasTripPriceId ? "set" : "missing"}
                </p>
                <p>
                  Webhook secret:{" "}
                  {stripeSetup.hasWebhookSecret
                    ? "set"
                    : "needed before launch"}
                </p>
              </div>
            ) : null}
          </section>
        )}

      </div>
    </main>
  );
}
