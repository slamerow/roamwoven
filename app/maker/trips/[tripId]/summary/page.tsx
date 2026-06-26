import Link from "next/link";
import type { CSSProperties } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Home,
  Palette,
  ShieldCheck,
  Sparkles,
  TrainFront,
} from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
import { getAppliedTripRecords } from "@/lib/applied-trip-records";
import {
  createGeneratedTripSummaryView,
  type GeneratedTripSummaryDay,
  type GeneratedTripSummaryDayEntry,
} from "@/lib/generated-trip-summary";
import { getTripStyleSettings } from "@/lib/style-settings";
import { getThemeDirection } from "@/lib/style-settings-config";
import { getMakerTrip } from "@/lib/trips";

const ENTRY_ICONS = {
  activity: Sparkles,
  review: AlertCircle,
  stay: Home,
  transport: TrainFront,
} satisfies Record<GeneratedTripSummaryDayEntry["kind"], typeof Sparkles>;

const ENTRY_LABELS = {
  activity: "Activity",
  review: "Needs review",
  stay: "Stay",
  transport: "Travel",
} satisfies Record<GeneratedTripSummaryDayEntry["kind"], string>;

function createDayCardStyle({
  accentColor,
  softColor,
}: {
  accentColor: string | null;
  softColor: string | null;
}): CSSProperties {
  return {
    background:
      softColor && accentColor
        ? `linear-gradient(180deg, ${softColor} 0%, #ffffff 44%)`
        : undefined,
    borderColor: accentColor ? `${accentColor}55` : undefined,
  };
}

function SummaryEntry({ entry }: { entry: GeneratedTripSummaryDayEntry }) {
  const Icon = ENTRY_ICONS[entry.kind];
  const detailLabel =
    entry.kind === "activity" || entry.kind === "review"
      ? "Description"
      : "Details";

  return (
    <div className="grid gap-2 px-4 py-3 md:grid-cols-[128px_1fr]">
      <div className="flex items-start gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
        <Icon className="mt-0.5 shrink-0" size={15} />
        {ENTRY_LABELS[entry.kind]}
      </div>
      <div className="min-w-0">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <p className="text-sm font-semibold text-ink">{entry.title}</p>
          {entry.meta ? (
            <p className="shrink-0 text-xs font-semibold text-ink/45">
              {entry.meta}
            </p>
          ) : null}
        </div>
        {entry.detail ? (
          <details className="mt-2">
            <summary className="cursor-pointer list-none text-xs font-semibold text-moss">
              {detailLabel}
            </summary>
            <p className="mt-1 text-sm leading-6 text-ink/60">{entry.detail}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function SummaryDayCard({
  day,
  style,
}: {
  day: GeneratedTripSummaryDay;
  style: CSSProperties;
}) {
  const stayEntries = day.entries.filter((entry) => entry.kind === "stay");
  const travelEntries = day.entries.filter((entry) => entry.kind === "transport");
  const activityEntries = day.entries.filter(
    (entry) => entry.kind === "activity" || entry.kind === "review"
  );

  return (
    <details
      className="group rounded-md border border-ink/10 bg-white shadow-[0_10px_34px_rgba(29,34,28,0.06)]"
      open
      style={style}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 border-b border-ink/10 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
            {day.label}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink">{day.title}</h3>
          {day.needsReview ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-clay/10 px-2 py-1 text-xs font-semibold text-clay">
              <AlertCircle size={14} />
              Has something to confirm
            </p>
          ) : null}
        </div>
        <ChevronDown
          className="mt-1 shrink-0 text-ink/45 transition group-open:rotate-180"
          size={18}
        />
      </summary>

      <div className="divide-y divide-ink/10">
        {stayEntries.length > 0 ? (
          <div>
            {stayEntries.map((entry) => (
              <SummaryEntry entry={entry} key={entry.id} />
            ))}
          </div>
        ) : null}
        {travelEntries.length > 0 ? (
          <div>
            {travelEntries.map((entry) => (
              <SummaryEntry entry={entry} key={entry.id} />
            ))}
          </div>
        ) : null}
        {activityEntries.length > 0 ? (
          <div>
            {activityEntries.map((entry) => (
              <SummaryEntry entry={entry} key={entry.id} />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function DesignPreviewStrip({
  colors,
  themeName,
}: {
  colors: string[];
  themeName: string;
}) {
  return (
    <div className="rounded-md bg-paper px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Palette size={16} />
        {themeName}
      </div>
      <div className="mt-3 flex gap-2">
        {colors.map((color) => (
          <span
            aria-hidden="true"
            className="h-5 w-5 rounded-full border border-ink/10"
            key={color}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

function DayByDaySummary({
  days,
  style,
}: {
  days: GeneratedTripSummaryDay[];
  style: CSSProperties;
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
            Day-by-day app shape
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            Here&apos;s what we&apos;ve got for you
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-ink/60">
          Check each day the way travelers read an itinerary: where you are,
          where you&apos;re staying, how you move, and what you&apos;ll do.
        </p>
      </div>

      {days.length > 0 ? (
        <div className="mt-5 space-y-4">
          {days.map((day) => (
            <SummaryDayCard day={day} key={day.id} style={style} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-md bg-white p-4 text-sm text-ink/60">
          No day-by-day records are ready yet.
        </div>
      )}
    </section>
  );
}

function QuietSummarySection({
  privateDetailCount,
  reviewCount,
}: {
  privateDetailCount: number;
  reviewCount: number;
}) {
  return (
    <section className="mt-6 grid gap-3 md:grid-cols-2">
      <div className="rounded-md border border-ink/10 bg-white p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-moss" size={18} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Sensitive details protected
            </p>
            <p className="mt-1 text-sm leading-6 text-ink/60">
              {privateDetailCount === 1
                ? "1 detail will stay behind traveler mode."
                : `${privateDetailCount} details will stay behind traveler mode.`}
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-md border border-ink/10 bg-white p-4">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-moss" size={18} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Short review queue stays separate
            </p>
            <p className="mt-1 text-sm leading-6 text-ink/60">
              {reviewCount === 0
                ? "No unresolved review decisions remain."
                : `${reviewCount} ${
                    reviewCount === 1 ? "decision" : "decisions"
                  } still need attention before publishing.`}
            </p>
          </div>
        </div>
      </div>
    </section>
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
  const style = await getTripStyleSettings({
    fallbackAppName: summary?.title ?? trip.name,
    tripId,
  });
  const theme = getThemeDirection(style.themeDirection);
  const colors = [
    style.primaryColor,
    style.secondaryColor,
    style.accentColor,
    style.softColor,
  ].filter((color): color is string => Boolean(color));
  const dayCardStyle = createDayCardStyle({
    accentColor: style.accentColor,
    softColor: style.softColor,
  });

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <h1 className="text-4xl font-semibold text-ink">
            Does this look right?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            This is the final shape check before Roamwoven publishes the
            traveler app.
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
                {style.appName || summary?.title || trip.name}
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

          <div className="mt-6 grid gap-3 md:grid-cols-6">
            {[
              ["Days", summary?.days.length ?? 0],
              ["Legs", summary?.counts.places ?? 0],
              ["Transport", summary?.counts.transport ?? 0],
              ["Stays", summary?.counts.stays ?? 0],
              ["Plans", summary?.counts.plans ?? 0],
              ["Review", summary?.counts.review ?? 0],
            ].map(([label, count]) => (
              <div key={label} className="rounded-md bg-paper p-4">
                <p className="text-2xl font-semibold text-ink">{count}</p>
                <p className="mt-1 text-sm text-ink/60">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3 rounded-md bg-paper p-4">
              <CalendarDays className="mt-0.5 shrink-0 text-moss" size={18} />
              <p className="text-sm leading-6 text-ink/65">
                If a day, stay, transfer, or activity feels wrong here, go back
                to the review queue before publishing.
              </p>
            </div>
            <DesignPreviewStrip colors={colors} themeName={theme.name} />
          </div>
        </section>

        {summary ? (
          <>
            <DayByDaySummary days={summary.days} style={dayCardStyle} />
            <QuietSummarySection
              privateDetailCount={summary.counts.privateDetails}
              reviewCount={summary.counts.review}
            />
          </>
        ) : null}

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
