import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  BedDouble,
  CheckCircle2,
  FileText,
  LockKeyhole,
  MapPinned,
  Route,
  Sparkles,
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
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { type TripStyleSettings } from "@/lib/style-settings-config";
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

function formatStructuredScannedSummary(
  records: ReturnType<typeof createStructuredTripRecordsFromDraft> | null
) {
  if (!records) {
    return [];
  }

  return [
    records.transport.length
      ? pluralize(records.transport.length, "transport item")
      : null,
    records.stays.length ? pluralize(records.stays.length, "stay") : null,
    records.items.length
      ? pluralize(records.items.length, "activity", "activities")
      : null,
    records.legs.length ? pluralize(records.legs.length, "place") : null,
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

function getStructuredReviewItems(
  records: ReturnType<typeof createStructuredTripRecordsFromDraft> | null
) {
  if (!records) {
    return [];
  }

  const questions = records.reviewQuestions.map((question) => ({
    detail: question.reason,
    id: question.id,
    meta: "Missing detail",
    title: question.prompt,
    tone: "question" as const,
  }));

  const sensitive = records.privateDetails
    .filter((detail) => detail.reviewRequired)
    .map((detail) => ({
      detail:
        detail.reason ??
        "This may need privacy protection before sharing.",
      id: detail.id,
      meta: detail.detailType,
      title: detail.label,
      tone: "sensitive" as const,
    }));

  return [...questions, ...sensitive];
}

function getStructuredReviewCount(records: StructuredTripRecords | null) {
  if (!records) {
    return 0;
  }

  return (
    records.reviewQuestions.length +
    records.privateDetails.filter((detail) => detail.reviewRequired).length +
    records.legs.filter((leg) => leg.reviewRequired).length +
    records.stays.filter((stay) => stay.reviewRequired).length +
    records.transport.filter((item) => item.reviewRequired).length +
    records.items.filter((item) => item.reviewRequired).length
  );
}

function getStructuredFoundParts(records: StructuredTripRecords | null) {
  if (!records) {
    return [];
  }

  const flights = records.transport.filter(
    (item) => item.transportType === "flight"
  ).length;
  const otherTransport = records.transport.length - flights;
  const restaurants = records.items.filter(
    (item) => item.itemType === "restaurant"
  ).length;
  const activities = records.items.filter(
    (item) => item.itemType === "activity"
  ).length;

  return [
    flights ? pluralize(flights, "flight") : null,
    otherTransport ? pluralize(otherTransport, "transport item") : null,
    records.stays.length ? pluralize(records.stays.length, "stay") : null,
    restaurants ? pluralize(restaurants, "restaurant") : null,
    activities ? pluralize(activities, "activity", "activities") : null,
  ].filter(Boolean);
}

function formatStructuredDiscoverySummary(
  records: StructuredTripRecords | null,
  reviewCount: number
) {
  if (!records) {
    return null;
  }

  const tripSpan =
    records.legs.length > 0 && records.days.length > 0
      ? `${pluralize(records.legs.length, "leg")} across ${pluralize(records.days.length, "day")}`
      : records.days.length > 0
        ? pluralize(records.days.length, "day")
        : records.legs.length > 0
          ? pluralize(records.legs.length, "leg")
          : null;
  const foundParts = getStructuredFoundParts(records);
  const foundText = tripSpan
    ? `We found ${tripSpan}${foundParts.length > 0 ? `, including ${foundParts.join(", ")}` : ""}.`
    : foundParts.length > 0
      ? `We found ${foundParts.join(", ")}.`
      : "We found a parsed trip draft.";
  const reviewText =
    reviewCount > 0
      ? `We need you to confirm ${pluralize(reviewCount, "thing")} before this becomes the traveler app.`
      : "Nothing needs confirmation before this becomes the traveler app.";

  return `${foundText} ${reviewText}`;
}

type StructuredReviewItem = {
  detail: string;
  id: string;
  meta: string;
  title: string;
  tone: "question" | "sensitive" | "warning";
};

type StructuredReviewSection = {
  count: number;
  description: string;
  emptyDetail: string;
  id: string;
  items: StructuredReviewItem[];
  title: string;
};

function getStructuredReviewSections(
  records: StructuredTripRecords
): StructuredReviewSection[] {
  return [
    {
      count: records.legs.length,
      description: "Route spine, dates, cities, languages, and map/weather anchors.",
      emptyDetail: "No route questions found.",
      id: "places",
      items: records.legs
        .filter((leg) => leg.reviewRequired)
        .map((leg) => ({
          detail:
            leg.summary ??
            "This place is missing a route-spine detail needed for the traveler app.",
          id: leg.id,
          meta: [leg.arriveDate, leg.leaveDate].filter(Boolean).join(" to "),
          title: leg.displayName,
          tone: "warning" as const,
        })),
      title: "Places",
    },
    {
      count: records.stays.length,
      description: "Lodging records with dates, public labels, addresses, and access privacy.",
      emptyDetail: "Stay records look usable for this draft.",
      id: "stays",
      items: records.stays
        .filter((stay) => stay.reviewRequired)
        .map((stay) => ({
          detail: "This stay needs enough check-in or location detail to support the Stay tool.",
          id: stay.id,
          meta: [stay.checkInDate, stay.checkOutDate].filter(Boolean).join(" to "),
          title: stay.name,
          tone: "warning" as const,
        })),
      title: "Stays",
    },
    {
      count: records.transport.length,
      description: "Flights, trains, transfers, drives, and other critical movement.",
      emptyDetail: "Transport records look usable for this draft.",
      id: "transport",
      items: records.transport
        .filter((item) => item.reviewRequired)
        .map((item) => ({
          detail:
            item.description ??
            "This transport record needs a date or route detail before it can be placed cleanly.",
          id: item.id,
          meta: item.transportType,
          title: item.routeLabel,
          tone: "warning" as const,
        })),
      title: "Transport",
    },
    {
      count: records.items.length,
      description: "Activities, restaurants, notes, rest days, and other traveler cards.",
      emptyDetail: "Traveler cards look usable for this draft.",
      id: "cards",
      items: records.items
        .filter((item) => item.reviewRequired)
        .map((item) => ({
          detail:
            item.description ??
            "This card needs a date or enough detail to place it in the traveler app.",
          id: item.id,
          meta: item.itemType,
          title: item.title,
          tone: "warning" as const,
        })),
      title: "Cards",
    },
    {
      count: records.privateDetails.length,
      description: "Sensitive addresses, confirmations, access notes, and private details.",
      emptyDetail: "Private details have default protection decisions.",
      id: "private-details",
      items: records.privateDetails
        .filter((detail) => detail.reviewRequired)
        .map((detail) => ({
          detail:
            detail.reason ??
            "This private detail should be reviewed before the app is shared.",
          id: detail.id,
          meta: detail.detailType,
          title: detail.label,
          tone: "sensitive" as const,
        })),
      title: "Private details",
    },
    {
      count: records.reviewQuestions.length,
      description: "Generated questions that materially affect the traveler app.",
      emptyDetail: "No missing-detail questions found.",
      id: "questions",
      items: records.reviewQuestions.map((question) => ({
        detail: question.reason,
        id: question.id,
        meta: "Missing detail",
        title: question.prompt,
        tone: "question" as const,
      })),
      title: "Questions",
    },
  ];
}

const sectionIcons: Record<string, typeof Sparkles> = {
  cards: Sparkles,
  places: MapPinned,
  "private-details": LockKeyhole,
  questions: AlertCircle,
  stays: BedDouble,
  transport: Route,
};

function toneIcon(tone: StructuredReviewItem["tone"]) {
  if (tone === "sensitive") {
    return LockKeyhole;
  }

  if (tone === "question") {
    return AlertCircle;
  }

  return FileText;
}

function StructuredRecordReview({
  sections,
}: {
  sections: StructuredReviewSection[];
}) {
  const reviewCount = sections.reduce(
    (count, section) => count + section.items.length,
    0
  );

  return (
    <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">
            Confirm what needs attention
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            Roamwoven keeps confident details quiet and only asks about the
            records that need a decision.
          </p>
        </div>
        <span className="text-sm font-semibold text-moss">
          {pluralize(reviewCount, "item")} to review
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {sections.map((section) => {
          const Icon = sectionIcons[section.id] ?? Sparkles;

          return (
            <section
              className="rounded-md border border-ink/10 bg-paper p-4"
              key={section.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {section.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink/55">
                    {section.description}
                  </p>
                </div>
                <Icon className="shrink-0 text-moss" size={18} />
              </div>
              <p className="mt-4 text-2xl font-semibold text-ink">
                {section.count}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
                {section.items.length > 0
                  ? `${section.items.length} to confirm`
                  : section.emptyDetail}
              </p>
            </section>
          );
        })}
      </div>

      <div className="mt-6 space-y-4">
        {sections.map((section) =>
          section.items.length > 0 ? (
            <section
              className="rounded-md border border-ink/10 bg-white p-4"
              key={section.id}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">
                  {section.title}
                </p>
                <span className="text-xs font-semibold text-moss">
                  {pluralize(section.items.length, "item")}
                </span>
              </div>
              <div className="mt-3 grid gap-3">
                {section.items.map((item) => {
                  const ItemIcon = toneIcon(item.tone);

                  return (
                    <div
                      className="flex gap-3 rounded-md bg-paper p-4"
                      key={item.id}
                    >
                      <ItemIcon
                        className={
                          item.tone === "sensitive"
                            ? "mt-0.5 shrink-0 text-tide"
                            : "mt-0.5 shrink-0 text-clay"
                        }
                        size={18}
                      />
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
                  );
                })}
              </div>
            </section>
          ) : null
        )}
      </div>

      {reviewCount === 0 ? (
        <div className="mt-6 flex gap-3 rounded-md bg-paper p-4">
          <CheckCircle2 className="mt-0.5 shrink-0 text-moss" size={18} />
          <div>
            <p className="text-sm font-semibold text-ink">
              No model-backed questions found
            </p>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              The adapter found enough structure to continue to the trip
              summary. The summary still needs to be the final shape check
              before publish.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
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
  const structuredDraft = draft
    ? createStructuredTripRecordsFromDraft({
        draft,
        fallbackTripName: tripName,
        tripId,
      })
    : null;
  const overview = getDraftObject(draft, "tripOverview");
  const reviewItems = structuredDraft
    ? getStructuredReviewItems(structuredDraft)
    : getReviewItems(draft);
  const structuredSections = structuredDraft
    ? getStructuredReviewSections(structuredDraft)
    : [];
  const structuredReviewCount = getStructuredReviewCount(structuredDraft);
  const structuredDiscoverySummary = formatStructuredDiscoverySummary(
    structuredDraft,
    structuredReviewCount
  );
  const scannedParts = structuredDraft
    ? formatStructuredScannedSummary(structuredDraft)
    : formatScannedSummary(draft);
  const scannedCount = structuredDraft
    ? structuredDraft.legs.length +
      structuredDraft.transport.length +
      structuredDraft.stays.length +
      structuredDraft.items.length
    : getDraftCount(draft, "places") +
      getDraftCount(draft, "transport") +
      getDraftCount(draft, "stays") +
      getDraftCount(draft, "activities");
  const overviewTitle =
    structuredDraft?.trip.travelerAppTitle ??
    getDraftString(overview, "title") ??
    style.appName ??
    tripName;
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
                : error === "processing-active"
                  ? "This trip is already processing. Wait for the current run to finish before starting another update."
                  : error === "spine-exists"
                    ? "The first trip spine already exists. Late documents should update the existing trip, not rebuild it from scratch."
                    : error === "missing-spine-basics"
                      ? "Roamwoven could not find enough basics to build a V1 trip spine. Add the missing dates, destinations, stays, transport, or anchor plans before trying again."
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
                  {structuredDiscoverySummary
                    ? structuredDiscoverySummary
                    : `We scanned ${pluralize(scannedCount, "item")} and found ${pluralize(reviewItems.length, "thing")} to review.`}
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

      {latestDraft && structuredDraft ? (
        <StructuredRecordReview sections={structuredSections} />
      ) : latestDraft ? (
        <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">
                Confirm what needs attention
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

function DemoStructuredData({ uploads }: { uploads: TripUpload[] }) {
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
            <h1 className="text-4xl font-semibold text-ink">
              Review what needs attention
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
              {makerTrip.isDemo
                ? "Review the details that need a decision before the trip app is built."
                : latestDraft
                  ? `Resolve the questions and flagged details for ${makerTrip.name}.`
                  : `Process ${makerTrip.name} into the first structured trip draft.`}
            </p>
          </div>
        </header>

        <MakerProgress
          completedSteps={latestDraft || makerTrip.isDemo ? 5 : 4}
          currentStep={latestDraft || makerTrip.isDemo ? 6 : 5}
          detail={
            latestDraft || makerTrip.isDemo
              ? "Review the questions and flagged details before continuing."
              : "Create the first structured draft from the confirmed materials."
          }
          isPaid={makerTrip.isDemo || makerTrip.paymentStatus === "paid"}
          tripId={tripId}
        />

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
          <DemoStructuredData uploads={uploads} />
        )}
      </div>
    </main>
  );
}
