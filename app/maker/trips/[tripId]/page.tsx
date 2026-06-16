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
import { getStripeSetupState } from "@/lib/billing/stripe";
import { getMakerTrip } from "@/lib/trips";

function getStages(isPaid: boolean) {
  return [
    {
      title: "Create trip",
      description: "Trip shell is ready.",
      state: "complete",
      icon: CheckCircle2
    },
    {
      title: "Pay once",
      description: "Required before AI review starts.",
      state: isPaid ? "complete" : "current",
      icon: CreditCard
    },
    {
      title: "Upload materials",
      description: "PDFs, screenshots, docs, sheets, and notes.",
      state: isPaid ? "current" : "locked",
      icon: FileUp
    },
    {
      title: "Generate app",
      description: "Review questions, preview, and publish.",
      state: isPaid ? "available" : "locked",
      icon: WandSparkles
    }
  ];
}

const betaLinks = [
  { label: "Upload", step: "upload", icon: FileUp },
  { label: "Review", step: "review", icon: WandSparkles },
  { label: "Clean data", step: "data", icon: TableProperties },
  { label: "Style", step: "style", icon: Palette },
  { label: "Publish", step: "publish", icon: Share2 }
];

export default async function TripWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ checkout?: string; making?: string }>;
}) {
  const { tripId } = await params;
  const { checkout, making } = await searchParams;
  const trip = await getMakerTrip(tripId);
  const stripeSetup = getStripeSetupState();
  const isPaid = trip.paymentStatus === "paid" || Boolean(trip.isDemo);
  const stages = getStages(isPaid);

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
              : "Trip shell is saved. Next up is Stripe Checkout with promo-code support before upload processing begins."}
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

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.title}
                className="rounded-md border border-ink/10 bg-white p-4"
              >
                <Icon
                  className={
                    stage.state === "complete"
                      ? "text-moss"
                      : stage.state === "current"
                        ? "text-clay"
                        : stage.state === "available"
                          ? "text-tide"
                          : "text-ink/30"
                  }
                  size={22}
                />
                <p className="mt-4 text-sm font-semibold text-ink">
                  {stage.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  {stage.description}
                </p>
              </div>
            );
          })}
        </section>

        <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">
            {trip.isDemo
              ? "Demo flow enabled"
              : isPaid
                ? "Payment complete"
                : "Checkout required"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            {trip.isDemo
              ? "This seeded trip can continue straight to upload while the product is still using mocked beta state."
                : isPaid
                  ? "This trip is paid, so upload and processing can begin."
                  : "Checkout unlocks the real build. Stripe can support cards and wallet-style express checkout once those payment methods are enabled."}
          </p>
          {checkout === "setup-required" ? (
            <p className="mt-4 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
              Stripe Checkout is not configured yet. Add Stripe test keys and a
              trip price ID to enable this button.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            {isPaid ? (
              <Link
                href={`/maker/trips/${tripId}/upload`}
                className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
              >
                Continue to upload
              </Link>
            ) : (
              <form action={`/maker/trips/${tripId}/checkout`} method="post">
                <button
                  className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                  type="submit"
                >
                  Continue to payment
                </button>
              </form>
            )}
          </div>
          {!trip.isDemo && !isPaid ? (
            <div className="mt-5 grid gap-2 text-xs text-ink/50 md:grid-cols-3">
              <p>Stripe key: {stripeSetup.hasSecretKey ? "set" : "missing"}</p>
              <p>Price ID: {stripeSetup.hasTripPriceId ? "set" : "missing"}</p>
              <p>
                Webhook secret:{" "}
                {stripeSetup.hasWebhookSecret ? "set" : "needed before launch"}
              </p>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">Beta flow shortcuts</h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            Jump to any step while the product is still using mocked beta state.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
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
