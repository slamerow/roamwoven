import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  LockKeyhole,
  MapPinned,
  TrainFront,
} from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
import { getAppliedTripRecords } from "@/lib/applied-trip-records";
import {
  createGeneratedTripSummaryView,
  type GeneratedTripSummarySection,
} from "@/lib/generated-trip-summary";
import { getMakerTrip } from "@/lib/trips";

const SUMMARY_ICONS = {
  activities: CalendarDays,
  legs: MapPinned,
  "private-details": LockKeyhole,
  review: CheckCircle2,
  stays: MapPinned,
  transport: TrainFront,
} satisfies Record<GeneratedTripSummarySection["id"], typeof CalendarDays>;

function groupSectionItems(section: GeneratedTripSummarySection) {
  if (section.id !== "activities") {
    return [
      {
        group: null,
        items: section.items,
      },
    ];
  }

  const groups = new Map<string, typeof section.items>();

  for (const item of section.items) {
    const group = item.group ?? "Other plans";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }

  return Array.from(groups, ([group, items]) => ({ group, items }));
}

function SummarySectionCard({
  section,
}: {
  section: GeneratedTripSummarySection;
}) {
  const Icon = SUMMARY_ICONS[section.id];
  const previewLimit = section.id === "activities" ? 12 : 8;
  const previewItems = section.items.slice(0, previewLimit);
  const hiddenCount = Math.max(section.items.length - previewItems.length, 0);
  const previewSection = { ...section, items: previewItems };
  const groupedItems = groupSectionItems(previewSection);

  return (
    <details
      className="group border-t border-ink/10 py-4 first:border-t-0"
      open={section.id !== "activities"}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-moss/10 text-moss">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{section.title}</h3>
            <p className="mt-1 text-sm text-ink/55">
              {section.count === 1
                ? "1 item"
                : `${section.count} items`}
              {hiddenCount > 0 ? ` · showing ${previewItems.length}` : ""}
            </p>
          </div>
        </div>
        <ChevronDown
          className="mt-1 shrink-0 text-ink/45 transition group-open:rotate-180"
          size={18}
        />
      </summary>

      <div className="mt-4 space-y-4 pl-0 md:pl-12">
        {previewItems.length > 0 ? (
          groupedItems.map((group) => (
            <div key={group.group ?? section.id}>
              {group.group ? (
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                  {group.group}
                </p>
              ) : null}
              <div className="divide-y divide-ink/10 rounded-md border border-ink/10 bg-paper">
                {group.items.map((item) => (
                  <div key={`${item.title}-${item.meta}`} className="p-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <p className="text-sm font-semibold text-ink">
                        {item.title}
                      </p>
                      {item.meta ? (
                        <p className="shrink-0 text-xs font-semibold text-ink/45">
                          {item.meta}
                        </p>
                      ) : null}
                    </div>
                    {item.detail ? (
                      <p className="mt-1 text-sm leading-6 text-ink/60">
                        {item.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-md bg-paper px-3 py-2 text-sm text-ink/55">
            Nothing in this section needs a final shape check.
          </p>
        )}
        {hiddenCount > 0 ? (
          <p className="text-sm font-semibold text-ink/55">
            +{hiddenCount} more included in the generated app.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export default async function TripSummaryPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const { latestDraft, records } = await getAppliedTripRecords({
    fallbackTripName: trip.name,
    isDemo: trip.isDemo,
    tripId,
  });
  const summary = records ? createGeneratedTripSummaryView(records) : null;

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <h1 className="text-4xl font-semibold text-ink">
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
              <p className="text-sm font-semibold text-moss">
                {summary?.dateRange ?? "Dates to confirm"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                {summary?.title ?? trip.name}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
                {summary?.destination ?? "Destinations to confirm"}
              </p>
            </div>
            <div
              className={
                summary?.isReadyForPublishReview
                  ? "rounded-md bg-moss/10 px-4 py-3 text-sm font-semibold text-moss"
                  : "rounded-md bg-clay/10 px-4 py-3 text-sm font-semibold text-clay"
              }
            >
              {summary?.isReadyForPublishReview
                ? "Ready for final review"
                : "Needs review decisions"}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {[
              ["Legs", summary?.counts.places ?? 0],
              ["Transport", summary?.counts.transport ?? 0],
              ["Stays", summary?.counts.stays ?? 0],
              ["Activities", summary?.counts.activities ?? 0],
              ["Review items", summary?.counts.review ?? 0],
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

          {summary ? (
            <div className="mt-6 rounded-md border border-ink/10 bg-white px-4">
              {summary.sections.map((section) => (
                <SummarySectionCard key={section.id} section={section} />
              ))}
            </div>
          ) : null}
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
