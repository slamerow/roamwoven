import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
import { getAsiaDemoTrip } from "@/lib/asia-trip";
import { getLatestTripDraftSnapshot } from "@/lib/extraction/processing-runs";
import { getMakerTrip } from "@/lib/trips";

function getDraftArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record[key]) ? record[key] : [];
}

function getDraftObject(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const child = (value as Record<string, unknown>)[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? (child as Record<string, unknown>)
    : null;
}

function getString(value: Record<string, unknown> | null, key: string) {
  const child = value?.[key];
  return typeof child === "string" && child.trim() ? child.trim() : null;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getDraftCounts(draft: unknown) {
  return {
    activities: getDraftArray(draft, "activities").length,
    places: getDraftArray(draft, "places").length,
    review:
      getDraftArray(draft, "missingDetails").length +
      getDraftArray(draft, "sensitiveDetails").length,
    stays: getDraftArray(draft, "stays").length,
    transport: getDraftArray(draft, "transport").length,
  };
}

export default async function TripSummaryPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const latestDraft = trip.isDemo
    ? null
    : await getLatestTripDraftSnapshot(tripId);
  const demoTrip = trip.isDemo ? getAsiaDemoTrip() : null;
  const draft = latestDraft?.draftJson ?? null;
  const overview = getDraftObject(draft, "tripOverview");
  const counts = demoTrip
    ? {
        activities: demoTrip.itemCount,
        places: demoTrip.legs.length,
        review: 9,
        stays: demoTrip.legs.filter((leg) => leg.stayName).length,
        transport: demoTrip.items.filter((item) =>
          ["flight", "transport", "transfer", "train", "rental"].some((token) =>
            `${item.category ?? ""} ${item.title}`.toLowerCase().includes(token)
          )
        ).length,
      }
    : getDraftCounts(draft);
  const title =
    getString(overview, "title") ?? demoTrip?.name ?? trip.name;
  const dateRange =
    getString(overview, "dateRange") ?? demoTrip?.dateRange ?? "Dates to confirm";
  const destination =
    getString(overview, "destinationSummary") ??
    demoTrip?.countries.slice(0, 5).join(", ") ??
    "Destinations to confirm";

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Trip Summary
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Does this look right?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            This is the review gate before the traveler app is generated or
            published. You should not need to inspect every activity one by one.
          </p>
        </header>

        <MakerProgress
          completedSteps={5}
          currentStep={6}
          detail="Confirm the trip spine and final app shape before publishing. Later documents should update this spine, not restart it."
          isPaid={trip.isDemo || trip.paymentStatus === "paid"}
          tripId={tripId}
        />

        <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold text-moss">{dateRange}</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{title}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
                {destination}
              </p>
            </div>
            <div className="rounded-md bg-moss/10 px-4 py-3 text-sm font-semibold text-moss">
              Ready for final review
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {[
              ["Places", counts.places],
              ["Transport", counts.transport],
              ["Stays", counts.stays],
              ["Activities", counts.activities],
              ["Review items", counts.review],
            ].map(([label, count]) => (
              <div key={label} className="rounded-md bg-paper p-4">
                <p className="text-2xl font-semibold text-ink">{count}</p>
                <p className="mt-1 text-sm text-ink/60">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-md bg-paper p-4">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-moss" size={18} />
              <p className="text-sm leading-6 text-ink/65">
                Roamwoven will keep review items separate from confident trip
                records. Confirm the shape here, then publish when the app
                preview feels right.
              </p>
            </div>
          </div>
        </section>

        {!trip.isDemo && !latestDraft ? (
          <p className="mt-5 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
            No parsed draft is saved yet. Go back and build the parsed draft
            before using this summary as a final gate.
          </p>
        ) : null}

        <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Link
            href={`/maker/trips/${tripId}/data`}
            className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink"
          >
            <ArrowLeft size={16} />
            Back to review queue
          </Link>
          <Link
            href={`/maker/trips/${tripId}/publish`}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
          >
            Continue to publish
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </main>
  );
}
