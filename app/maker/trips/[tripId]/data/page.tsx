import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  FileText,
  LockKeyhole,
} from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
import { hasOpenAIExtractionConfig } from "@/lib/env";
import { getAsiaDemoTrip } from "@/lib/asia-trip";
import {
  getLatestTripDraftSnapshot,
  getLatestTripProcessingRun,
  type TripDraftSnapshot,
  type TripProcessingRun,
} from "@/lib/extraction/processing-runs";
import {
  getThemeDirection,
  type TripStyleSettings,
} from "@/lib/style-settings-config";
import { getTripStyleSettings } from "@/lib/style-settings";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads, type TripUpload } from "@/lib/uploads";

function formatUploadDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatSize(bytes: number | null) {
  if (!bytes) {
    return "Notes";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDraftCount(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record[key]) ? record[key].length : 0;
}

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

  const record = value as Record<string, unknown>;
  const child = record[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? (child as Record<string, unknown>)
    : null;
}

function getDraftString(value: Record<string, unknown> | null, key: string) {
  const child = value?.[key];
  return typeof child === "string" && child.trim() ? child.trim() : null;
}

function getTransportLabel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "transport";
  }

  const type = (value as Record<string, unknown>).type;
  return typeof type === "string" && type.trim() ? type.trim() : "transport";
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getReadableTextColor(backgroundColor: string) {
  const hex = backgroundColor.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const luminance =
    0.2126 * red ** 2.2 + 0.7152 * green ** 2.2 + 0.0722 * blue ** 2.2;

  return luminance > 0.52 ? "#201c16" : "#fffaf0";
}

function DraftDesignPreview({
  style,
  tripId,
}: {
  style: TripStyleSettings;
  tripId: string;
}) {
  const theme = getThemeDirection(style.themeDirection);
  const primary = style.primaryColor;
  const secondary = style.secondaryColor ?? primary;
  const accent = style.accentColor ?? secondary;
  const soft = style.softColor ?? theme.surface;

  return (
    <section
      className="mt-8 overflow-hidden rounded-md border border-ink/10 p-5"
      style={{ backgroundColor: theme.text, color: theme.surface }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: accent }}
          >
            Design applied
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            {style.appName}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 opacity-75">
            Draft review now shows the selected palette inside the Wren-style
            traveler shell before the final app is published.
          </p>
        </div>
        <Link
          className="inline-flex justify-center rounded-md px-4 py-3 text-sm font-semibold"
          href={`/maker/trips/${tripId}/style`}
          style={{ backgroundColor: soft, color: theme.text }}
        >
          Edit design
        </Link>
      </div>

      <div
        className="mt-5 rounded-[26px] border p-4"
        style={{
          backgroundColor: theme.surface,
          borderColor: secondary,
          color: theme.text,
          fontFamily: theme.fontFamily,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="rounded-lg px-3 py-2 text-xs font-bold uppercase"
            style={{ backgroundColor: soft }}
          >
            Traveler mode
          </span>
          <div className="flex gap-1">
            {["Photos", "Stay", "Search", "Map"].map((label, index) => (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold"
                key={label}
                style={{
                  backgroundColor: index === 0 ? primary : soft,
                  color: index === 0 ? getReadableTextColor(primary) : theme.text,
                }}
              >
                {label.slice(0, 1)}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["Today", "Stay", "Dinner"].map((label, index) => (
            <div
              className="rounded-[20px] border p-4"
              key={label}
              style={{
                backgroundColor:
                  index === 0 ? soft : index === 1 ? theme.surface : primary,
                borderColor: index === 2 ? accent : secondary,
                color: index === 2 ? getReadableTextColor(primary) : theme.text,
              }}
            >
              <p className="text-xs font-bold uppercase">{label}</p>
              <p className="mt-8 text-lg font-semibold">
                {index === 0
                  ? "Morning plan"
                  : index === 1
                    ? "Check-in details"
                    : "Reservation card"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatScannedSummary(draft: unknown) {
  const transport = getDraftArray(draft, "transport");
  const transportByType = transport.reduce<Record<string, number>>((acc, item) => {
    const label = getTransportLabel(item);
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const transportParts = Object.entries(transportByType).map(([type, count]) =>
    pluralize(count, type)
  );
  const stayCount = getDraftCount(draft, "stays");
  const activityCount = getDraftCount(draft, "activities");

  return [
    ...transportParts,
    stayCount ? pluralize(stayCount, "stay") : null,
    activityCount ? pluralize(activityCount, "activity", "activities") : null,
  ].filter(Boolean);
}

function getReviewItems(draft: unknown) {
  const missing = getDraftArray(draft, "missingDetails").map((item, index) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    return {
      detail:
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim()
          : "This detail affects the final trip app.",
      id: `missing-${index}`,
      meta:
        typeof record.relatedTitle === "string" && record.relatedTitle.trim()
          ? record.relatedTitle.trim()
          : "Missing detail",
      title:
        typeof record.prompt === "string" && record.prompt.trim()
          ? record.prompt.trim()
          : "Confirm a missing detail",
      tone: "question" as const,
    };
  });

  const sensitive = getDraftArray(draft, "sensitiveDetails").map((item, index) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    return {
      detail:
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim()
          : "This may need privacy protection before sharing.",
      id: `sensitive-${index}`,
      meta:
        typeof record.detailType === "string" && record.detailType.trim()
          ? record.detailType.trim()
          : "Sensitive detail",
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : "Protect a private detail",
      tone: "sensitive" as const,
    };
  });

  return [...missing, ...sensitive];
}

function formatRunDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function RealTripFirstPass({
  error,
  extractionEnabled,
  extractionStatus,
  latestDraft,
  latestRun,
  tripId,
  tripName,
  uploads,
  style,
}: {
  error?: string;
  extractionEnabled: boolean;
  extractionStatus?: string;
  latestDraft: TripDraftSnapshot | null;
  latestRun: TripProcessingRun | null;
  tripId: string;
  tripName: string;
  uploads: TripUpload[];
  style: TripStyleSettings;
}) {
  const noteCount = uploads.filter((upload) => upload.storagePath === null).length;
  const fileCount = uploads.length - noteCount;
  const textMaterialCount = uploads.filter(
    (upload) =>
      upload.userNote?.trim() ||
      (upload.storagePath &&
        ((upload.fileType === "text/plain" &&
          Number(upload.fileSizeBytes ?? 0) <= 250 * 1024) ||
          (upload.fileType === "application/pdf" &&
            Number(upload.fileSizeBytes ?? 0) <= 10 * 1024 * 1024)))
  ).length;
  const canExtract = extractionEnabled && textMaterialCount > 0;
  const draft = latestDraft?.draftJson ?? null;
  const overview = getDraftObject(draft, "tripOverview");
  const reviewItems = getReviewItems(draft);
  const scannedParts = formatScannedSummary(draft);
  const scannedCount =
    getDraftCount(draft, "places") +
    getDraftCount(draft, "transport") +
    getDraftCount(draft, "stays") +
    getDraftCount(draft, "activities");
  const overviewTitle = getDraftString(overview, "title") ?? style.appName ?? tripName;
  const dateRange = getDraftString(overview, "dateRange");

  return (
    <>
      {error ? (
        <p className="mt-6 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
          {error === "extraction-disabled"
            ? "AI extraction is disabled. Add the OpenAI key and enable the extraction flag before parsing."
            : error === "no-text-materials"
              ? "No pasted notes, plain text files, or readable text-based PDFs are available for this parser pass."
              : error === "checkout-required"
                ? "Checkout must be complete before parsing."
                : "Parsing failed. Check the processing run details and try again with a smaller text input."}
        </p>
      ) : null}
      {extractionStatus === "completed" ? (
        <p className="mt-6 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
          Parsed draft saved.
        </p>
      ) : null}

      <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
        {latestDraft ? (
          <>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-moss">
                  {dateRange ?? "Trip draft"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">
                  {overviewTitle}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
                  We scanned {pluralize(scannedCount, "item")} and found{" "}
                  {pluralize(reviewItems.length, "thing")} to review.
                </p>
              </div>
              <div className="rounded-md bg-paper px-4 py-3 text-sm font-semibold text-ink">
                {latestRun?.status === "completed"
                  ? "Processed"
                  : latestRun?.status ?? "Pending"}
              </div>
            </div>
            <div className="mt-5 rounded-md bg-paper px-4 py-3 text-sm leading-6 text-ink/70">
              {scannedParts.length > 0
                ? scannedParts.join(" · ")
                : "No structured records were found yet."}
            </div>
            {latestRun ? (
              <p className="mt-3 text-xs text-ink/45">
                Parsed {formatRunDate(latestDraft.createdAt)} ·{" "}
                {latestRun.model ?? "unknown model"} ·{" "}
                {latestRun.inputCharCount} input characters
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-ink">
                  Ready to process your materials
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
                  {uploads.length > 0
                    ? `${pluralize(fileCount, "file")} and ${pluralize(noteCount, "note")} are saved for ${tripName}.`
                    : `Add source materials for ${tripName}, then Roamwoven will build a review queue from anything uncertain or private.`}
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
                  If the saved materials do not contain enough basics for a V1
                  trip spine, the build should stop and ask for the missing
                  dates, destinations, stays, transport, or anchor plans instead
                  of generating a thin app.
                </p>
              </div>
              <span className="rounded-md bg-paper px-4 py-3 text-sm font-semibold text-ink/70">
                {latestRun?.status ?? "Not processed"}
              </span>
            </div>
            <form
              action={`/maker/trips/${tripId}/data/extract`}
              className="mt-5"
              method="post"
            >
              <button
                className={
                  canExtract
                    ? "inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                    : "inline-flex rounded-md bg-ink/30 px-4 py-3 text-sm font-semibold text-paper"
                }
                disabled={!canExtract}
                type="submit"
              >
                Build parsed draft
              </button>
            </form>
            <p className="mt-3 text-sm leading-6 text-ink/55">
              {extractionEnabled
                ? "This first parser pass reads pasted notes, plain text files, and readable text-based PDFs."
                : "AI extraction is still disabled in this environment."}
              {" "}Once a trip spine exists, later docs should update that spine instead of rebuilding from scratch.
            </p>
          </>
        )}
      </section>

      {latestDraft ? (
        <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">
                Review queue
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Only details that need a decision are shown here.
              </p>
            </div>
            <span className="text-sm font-semibold text-moss">
              {pluralize(reviewItems.length, "item")}
            </span>
          </div>

          {reviewItems.length > 0 ? (
            <div className="mt-5 grid gap-3">
              {reviewItems.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-md bg-paper p-4"
                >
                  {item.tone === "sensitive" ? (
                    <LockKeyhole className="mt-0.5 shrink-0 text-tide" size={18} />
                  ) : (
                    <AlertCircle className="mt-0.5 shrink-0 text-clay" size={18} />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
                      {item.meta}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-ink/60">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex gap-3 rounded-md bg-paper p-4">
              <FileText className="mt-0.5 shrink-0 text-moss" size={18} />
              <div>
                <p className="text-sm font-semibold text-ink">
                  No questions found
                </p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  The parser did not flag missing or sensitive details in this
                  pass. Continue to the trip summary to review the overall shape.
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <SourceMaterials uploads={uploads} />

      <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/maker/trips/${tripId}/review`}
            className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink"
          >
            <ArrowLeft size={16} />
            Edit app setup
          </Link>
          <Link
            href={`/maker/trips/${tripId}/style`}
            className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink"
          >
            Edit design
          </Link>
        </div>
        <Link
          href={`/maker/trips/${tripId}/summary`}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
        >
          Continue to trip summary
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}

function SourceMaterials({ uploads }: { uploads: TripUpload[] }) {
  return (
    <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Source materials</h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            These are the saved inputs attached to this trip.
          </p>
        </div>
        <span className="text-sm font-semibold text-moss">
          {uploads.length} saved
        </span>
      </div>

      {uploads.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {uploads.map((upload) => (
            <div key={upload.id} className="rounded-md bg-paper p-4">
              <p className="truncate text-sm font-semibold text-ink">
                {upload.originalFilename}
              </p>
              <p className="mt-1 text-xs text-ink/50">
                {formatUploadDate(upload.createdAt)} ·{" "}
                {formatSize(upload.fileSizeBytes)}
              </p>
              <p className="mt-1 text-xs font-semibold capitalize text-moss">
                {upload.processingStatus}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-md bg-paper p-4 text-sm text-ink/60">
          No saved materials yet.
        </p>
      )}
    </section>
  );
}

function DemoStructuredData({
  style,
  uploads,
}: {
  style: TripStyleSettings;
  uploads: TripUpload[];
}) {
  const trip = getAsiaDemoTrip();
  const stayLegs = trip.legs.filter((leg) => leg.stayName);
  const missingItems = trip.items.filter((item) =>
    [item.title, item.description, item.address].some((value) =>
      value?.toLowerCase().includes("tbd")
    )
  );
  const transportItems = trip.items.filter((item) =>
    ["flight", "transport", "transfer", "train", "rental"].some((token) =>
      `${item.category ?? ""} ${item.title}`.toLowerCase().includes(token)
    )
  );
  const sensitiveItems = [
    ...stayLegs
      .filter((leg) => leg.stayAddress)
      .slice(0, 4)
      .map((leg) => ({
        id: `sensitive-${leg.id}`,
        title: leg.stayName ?? `${leg.city} stay`,
        meta: `${leg.city ?? "Stay"} address`,
        detail:
          "Exact lodging address can be password-protected inside the card details.",
        status: "protected" as const,
      })),
    ...trip.items
      .filter((item) =>
        `${item.title} ${item.description ?? ""}`.toLowerCase().includes("code")
      )
      .slice(0, 2)
      .map((item) => ({
        id: `sensitive-${item.id}`,
        title: item.title,
        meta: item.category ?? "card detail",
        detail:
          "Codes, private notes, and confirmation details should be reviewed before sharing.",
        status: "protected" as const,
      })),
  ];
  const activityCount = trip.itemCount - transportItems.length;
  const reviewQueue = [
    ...missingItems.slice(0, 6).map((item) => ({
      detail: item.description ?? "Needs clearer details before publish.",
      id: `missing-${item.id}`,
      meta: item.category ?? "review",
      title: item.title,
      tone: "question" as const,
    })),
    ...sensitiveItems.slice(0, 6).map((item) => ({
      detail: item.detail,
      id: item.id,
      meta: item.meta,
      title: item.title,
      tone: "sensitive" as const,
    })),
  ];
  const summaryParts = [
    pluralize(transportItems.length, "transport item"),
    pluralize(stayLegs.length, "stay"),
    pluralize(activityCount, "activity", "activities"),
  ];

  return (
    <>
      <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-moss">{trip.dateRange}</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {trip.name}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
              We scanned {pluralize(trip.itemCount, "item")} across your{" "}
              {trip.dayCount}-day trip and found{" "}
              {pluralize(reviewQueue.length, "thing")} to review.
            </p>
          </div>
          <div className="rounded-md bg-paper px-4 py-3 text-sm font-semibold text-ink">
            Processed
          </div>
        </div>
        <div className="mt-5 rounded-md bg-paper px-4 py-3 text-sm leading-6 text-ink/70">
          {summaryParts.join(" · ")}
        </div>
      </section>

      <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-ink">Review queue</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Only details that need a decision are shown here.
            </p>
          </div>
          <span className="text-sm font-semibold text-moss">
            {pluralize(reviewQueue.length, "item")}
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {reviewQueue.map((item) => (
            <div key={item.id} className="flex gap-3 rounded-md bg-paper p-4">
              {item.tone === "sensitive" ? (
                <LockKeyhole className="mt-0.5 shrink-0 text-tide" size={18} />
              ) : (
                <AlertCircle className="mt-0.5 shrink-0 text-clay" size={18} />
              )}
              <div>
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
                  {item.meta}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <DraftDesignPreview style={style} tripId="demo-trip" />

      {uploads.length > 0 ? <SourceMaterials uploads={uploads} /> : null}
      <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/maker/trips/demo-trip/review"
            className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink"
          >
            <ArrowLeft size={16} />
            Edit app setup
          </Link>
          <Link
            href="/maker/trips/demo-trip/style"
            className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink"
          >
            Edit design
          </Link>
        </div>
        <Link
          href="/maker/trips/demo-trip/summary"
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
        >
          Continue to trip summary
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}

export default async function StructuredDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ error?: string; extraction?: string; style?: string }>;
}) {
  const { tripId } = await params;
  const { error, extraction } = await searchParams;
  const makerTrip = await getMakerTrip(tripId);
  const canShowUploads = makerTrip.isDemo || makerTrip.paymentStatus === "paid";
  const uploads = canShowUploads ? await listTripUploads(tripId) : [];
  const [style, latestRun, latestDraft] = await Promise.all([
    getTripStyleSettings({
      fallbackAppName: makerTrip.name,
      tripId,
    }),
    makerTrip.isDemo ? Promise.resolve(null) : getLatestTripProcessingRun(tripId),
    makerTrip.isDemo ? Promise.resolve(null) : getLatestTripDraftSnapshot(tripId),
  ]);

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-ink/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
              Draft Review
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-ink">
              Review what needs attention
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
              {makerTrip.isDemo
                ? "Review the details that need a decision before the trip app is built."
                : `Check the review queue for ${makerTrip.name}.`}
            </p>
          </div>
        </header>

        <MakerProgress
          completedSteps={5}
          currentStep={6}
          detail="Review the draft, jump back to app setup or design if needed, then continue to summary and publish."
          isPaid={makerTrip.isDemo || makerTrip.paymentStatus === "paid"}
          tripId={tripId}
        />

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <Link
            href={`/maker/trips/${tripId}/upload`}
            className="rounded-md border border-ink/10 bg-white p-4 text-sm font-semibold text-ink"
          >
            Add or review source materials
            <span className="mt-2 block text-sm font-normal leading-6 text-ink/60">
              Use this before the first build; later docs should be treated as
              limited updates.
            </span>
          </Link>
          <Link
            href={`/maker/trips/${tripId}/review`}
            className="rounded-md border border-ink/10 bg-white p-4 text-sm font-semibold text-ink"
          >
            Edit app setup
            <span className="mt-2 block text-sm font-normal leading-6 text-ink/60">
              Change sections like photos, phrases, maps, or travel.
            </span>
          </Link>
          <Link
            href={`/maker/trips/${tripId}/style`}
            className="rounded-md border border-ink/10 bg-white p-4 text-sm font-semibold text-ink"
          >
            Edit design
            <span className="mt-2 block text-sm font-normal leading-6 text-ink/60">
              Update colors and see them applied in the Wren-style shell.
            </span>
          </Link>
        </section>

        <DraftDesignPreview style={style} tripId={tripId} />

        {!makerTrip.isDemo ? (
          <RealTripFirstPass
            error={error}
            extractionEnabled={hasOpenAIExtractionConfig()}
            extractionStatus={extraction}
            latestDraft={latestDraft}
            latestRun={latestRun}
            tripId={tripId}
            tripName={makerTrip.name}
            uploads={uploads}
            style={style}
          />
        ) : (
          <DemoStructuredData style={style} uploads={uploads} />
        )}
      </div>
    </main>
  );
}
