import Link from "next/link";
import {
  CheckCircle2,
  CreditCard,
  FileUp,
  Palette,
  Share2,
  TableProperties,
  WandSparkles
} from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
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
      message: "Checkout unlocks upload and the app build workflow.",
    };
  }

  if (uploadCount === 0) {
    return {
      href: "upload",
      label: "Continue building",
      message: "Step 2 is done. Upload your trip materials to begin intake.",
    };
  }

  if (!hasBuildSettings) {
    return {
      href: "review",
      label: "Continue building",
      message: "Your materials are saved. Confirm what belongs in the app.",
    };
  }

  if (!hasStyleSettings) {
    return {
      href: "style",
      label: "Continue building",
      message: "Content choices are saved. Choose the app's design direction.",
    };
  }

  return {
    href: "data",
    label: "Continue building",
    message: "Design choices are saved. Review the first structured draft.",
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
    return { completedSteps: 2, currentStep: 3 };
  }

  if (!hasBuildSettings) {
    return { completedSteps: 3, currentStep: 4 };
  }

  if (!hasStyleSettings) {
    return { completedSteps: 4, currentStep: 5 };
  }

  return { completedSteps: 5, currentStep: 6 };
}

const betaLinks = [
  { label: "Upload", step: "upload", icon: FileUp },
  { label: "Review", step: "review", icon: WandSparkles },
  { label: "Check data", step: "data", icon: TableProperties },
  { label: "Style", step: "style", icon: Palette },
  { label: "Summary", step: "summary", icon: CheckCircle2 },
  { label: "Publish", step: "publish", icon: Share2 }
];

export default async function TripWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{
    checkout?: string;
    making?: string;
    session_id?: string;
  }>;
}) {
  const { tripId } = await params;
  const { checkout, making, session_id: sessionId } = await searchParams;
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
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Trip Workspace
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            {trip.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            {trip.isDemo
              ? "Demo trip is seeded from Wren's Adventure so the traveler-app flow stays testable before live extraction exists."
              : "Your app workspace is ready. Follow the steps below to move from trip idea to live traveler app."}
          </p>
        </header>

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
                  then move into secure checkout before any expensive processing
                  starts.
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
          <section className="mt-8 rounded-md border border-moss/20 bg-moss/10 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-moss" size={22} />
                <div>
                  <h2 className="text-base font-semibold text-moss">
                    Checkout complete
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-ink/65">
                    {nextBuildStep.message}
                  </p>
                </div>
              </div>
              <Link
                href={`/maker/trips/${tripId}/${nextBuildStep.href}`}
                className="inline-flex justify-center rounded-md bg-moss px-4 py-3 text-sm font-semibold text-white"
              >
                {nextBuildStep.label}
              </Link>
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-xl font-semibold text-ink">
              {trip.isDemo ? "Demo flow enabled" : "Checkout required"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
              {trip.isDemo
                ? "This seeded trip can continue straight to upload while the product is still using mocked beta state."
                : "Checkout unlocks the real build. Stripe can support cards and wallet-style express checkout once those payment methods are enabled."}
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

        <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">Beta flow shortcuts</h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            Jump to any step while the product is still using mocked beta state.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {betaLinks.map((link) => {
              const Icon = link.icon;
              const href =
                link.step === "upload"
                  ? `/maker/trips/${tripId}/upload`
                  : link.step === "review"
                    ? `/maker/trips/${tripId}/review`
                    : link.step === "data"
                      ? `/maker/trips/${tripId}/data`
                      : link.step === "style"
                        ? `/maker/trips/${tripId}/style`
                        : link.step === "summary"
                          ? `/maker/trips/${tripId}/summary`
                          : `/maker/trips/${tripId}/publish`;

              return (
                <Link
                  key={link.step}
                  href={href}
                  className="rounded-md border border-ink/10 bg-paper p-4"
                >
                  <Icon className="text-tide" size={20} />
                  <p className="mt-3 text-sm font-semibold text-ink">
                    {link.label}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
