import Link from "next/link";
import type { ReactNode } from "react";
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
  Trash2,
} from "lucide-react";
import { MakerProgress } from "@/components/maker-progress";
import { hasOpenAIExtractionConfigForTrip } from "@/lib/env";
import { getAsiaDemoTrip } from "@/lib/asia-trip";
import {
  getLatestTripDraftSnapshot,
  getLatestTripProcessingRun,
  type TripDraftSnapshot,
  type TripProcessingRun,
} from "@/lib/extraction/processing-runs";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import {
  formatStructuredDiscoverySummary,
  getStructuredReviewCount,
  getStructuredReviewSections,
  type StructuredReviewEditField,
  type StructuredReviewItem,
  type StructuredReviewSection,
} from "@/lib/generated-trip-review";
import {
  applyReviewDecisions,
  type TripReviewDecision,
} from "@/lib/generated-trip-decisions";
import { listTripReviewDecisions } from "@/lib/review-decisions";
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

function canProtectReviewItem(item: StructuredReviewItem) {
  return (
    item.tone === "sensitive" ||
    item.subjectType === "private_detail" ||
    item.subjectType === "stay" ||
    item.subjectType === "transport"
  );
}

function ReviewDecisionButton({
  action,
  children,
  icon,
  item,
  tone = "neutral",
  tripId,
}: {
  action: "answer_question" | "confirm" | "delete" | "protect";
  children: ReactNode;
  icon: ReactNode;
  item: StructuredReviewItem;
  tone?: "neutral" | "positive" | "sensitive" | "destructive";
  tripId: string;
}) {
  const colorClasses =
    tone === "positive"
      ? "hover:border-moss/30 hover:text-moss"
      : tone === "sensitive"
        ? "hover:border-tide/30 hover:text-tide"
        : tone === "destructive"
          ? "hover:border-clay/30 hover:text-clay"
          : "hover:border-ink/25 hover:text-ink";

  return (
    <form action={`/maker/trips/${tripId}/data/decisions`} method="post">
      <input name="action" type="hidden" value={action} />
      <input name="subjectId" type="hidden" value={item.subjectId} />
      <input name="subjectType" type="hidden" value={item.subjectType} />
      {action === "answer_question" ? (
        <input
          name="answerValue"
          type="hidden"
          value="Marked answered in review."
        />
      ) : null}
      <button
        className={`inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-xs font-semibold text-ink/55 transition ${colorClasses}`}
        type="submit"
      >
        {icon}
        {children}
      </button>
    </form>
  );
}

function EditFieldInput({ field }: { field: StructuredReviewEditField }) {
  const baseClass =
    "mt-1 w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-moss/40";

  if (field.type === "textarea") {
    return (
      <textarea
        className={`${baseClass} min-h-24 leading-6`}
        defaultValue={field.value}
        name={`field:${field.name}`}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        className={baseClass}
        defaultValue={field.value}
        name={`field:${field.name}`}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className={baseClass}
      defaultValue={field.value}
      name={`field:${field.name}`}
      type={field.type}
    />
  );
}

function ReviewEditForm({
  item,
  tripId,
}: {
  item: StructuredReviewItem;
  tripId: string;
}) {
  if (item.editFields.length === 0) {
    return null;
  }

  return (
    <details className="mt-4 rounded-md border border-ink/10 bg-white p-3">
      <summary className="cursor-pointer text-xs font-semibold text-ink/60">
        Edit details
      </summary>
      <form
        action={`/maker/trips/${tripId}/data/decisions`}
        className="mt-3 grid gap-3 md:grid-cols-2"
        method="post"
      >
        <input name="action" type="hidden" value="edit" />
        <input name="subjectId" type="hidden" value={item.subjectId} />
        <input name="subjectType" type="hidden" value={item.subjectType} />
        {item.editFields.map((field) => (
          <label
            className={field.type === "textarea" ? "md:col-span-2" : ""}
            key={field.name}
          >
            <span className="text-xs font-semibold text-ink/55">
              {field.label}
            </span>
            <EditFieldInput field={field} />
            {field.helpText ? (
              <span className="mt-1 block text-xs leading-5 text-ink/45">
                {field.helpText}
              </span>
            ) : null}
          </label>
        ))}
        <div className="md:col-span-2">
          <button
            className="inline-flex rounded-md bg-ink px-3 py-2 text-xs font-semibold text-paper"
            type="submit"
          >
            Save edit
          </button>
        </div>
      </form>
    </details>
  );
}

function ReviewCombineForm({
  item,
  tripId,
}: {
  item: StructuredReviewItem;
  tripId: string;
}) {
  if (item.subjectType !== "item" || item.combineOptions.length === 0) {
    return null;
  }

  return (
    <details className="mt-3 rounded-md border border-ink/10 bg-white p-3">
      <summary className="cursor-pointer text-xs font-semibold text-ink/60">
        Combine cards
      </summary>
      <form
        action={`/maker/trips/${tripId}/data/decisions`}
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
        method="post"
      >
        <input name="action" type="hidden" value="combine" />
        <input name="subjectId" type="hidden" value={item.subjectId} />
        <input name="subjectType" type="hidden" value={item.subjectType} />
        <input name="targetId" type="hidden" value={item.subjectId} />
        <label className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-ink/55">
            Fold another card into this one
          </span>
          <select
            className="mt-1 w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-moss/40"
            name="sourceId"
          >
            {item.combineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="inline-flex rounded-md bg-ink px-3 py-2 text-xs font-semibold text-paper"
          type="submit"
        >
          Combine
        </button>
      </form>
    </details>
  );
}

function StructuredRecordReview({
  sections,
  tripId,
}: {
  sections: StructuredReviewSection[];
  tripId: string;
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
                        <ReviewEditForm item={item} tripId={tripId} />
                        <ReviewCombineForm item={item} tripId={tripId} />
                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.subjectType === "review_question" ? (
                            <ReviewDecisionButton
                              action="answer_question"
                              icon={<CheckCircle2 size={14} />}
                              item={item}
                              tone="positive"
                              tripId={tripId}
                            >
                              Mark answered
                            </ReviewDecisionButton>
                          ) : (
                            <ReviewDecisionButton
                              action="confirm"
                              icon={<CheckCircle2 size={14} />}
                              item={item}
                              tone="positive"
                              tripId={tripId}
                            >
                              Confirm
                            </ReviewDecisionButton>
                          )}
                          {canProtectReviewItem(item) ? (
                            <ReviewDecisionButton
                              action="protect"
                              icon={<LockKeyhole size={14} />}
                              item={item}
                              tone="sensitive"
                              tripId={tripId}
                            >
                              Protect
                            </ReviewDecisionButton>
                          ) : null}
                          <ReviewDecisionButton
                            action="delete"
                            icon={<Trash2 size={14} />}
                            item={item}
                            tone="destructive"
                            tripId={tripId}
                          >
                            Ignore
                          </ReviewDecisionButton>
                        </div>
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
  reviewDecisions,
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
  reviewDecisions: TripReviewDecision[];
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
  const reviewedStructuredDraft = structuredDraft
    ? applyReviewDecisions(structuredDraft, reviewDecisions)
    : null;
  const overview = getDraftObject(draft, "tripOverview");
  const reviewItems = reviewedStructuredDraft
    ? getStructuredReviewItems(reviewedStructuredDraft)
    : getReviewItems(draft);
  const structuredSections = reviewedStructuredDraft
    ? getStructuredReviewSections(reviewedStructuredDraft)
    : [];
  const structuredReviewCount = getStructuredReviewCount(reviewedStructuredDraft);
  const structuredDiscoverySummary = formatStructuredDiscoverySummary(
    reviewedStructuredDraft,
    structuredReviewCount
  );
  const scannedParts = reviewedStructuredDraft
    ? formatStructuredScannedSummary(reviewedStructuredDraft)
    : formatScannedSummary(draft);
  const scannedCount = reviewedStructuredDraft
    ? reviewedStructuredDraft.legs.length +
      reviewedStructuredDraft.transport.length +
      reviewedStructuredDraft.stays.length +
      reviewedStructuredDraft.items.length
    : getDraftCount(draft, "places") +
      getDraftCount(draft, "transport") +
      getDraftCount(draft, "stays") +
      getDraftCount(draft, "activities");
  const overviewTitle =
    reviewedStructuredDraft?.trip.travelerAppTitle ??
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
            : error === "extraction-not-allowed"
              ? "AI extraction is enabled only for selected test trips in this environment."
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
                : "AI extraction is not enabled for this trip in this environment."}
              {" "}Once a trip spine exists, later docs should update that spine instead of rebuilding from scratch.
            </p>
          </>
        )}
      </section>

      {latestDraft && reviewedStructuredDraft ? (
        <StructuredRecordReview sections={structuredSections} tripId={tripId} />
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
  const reviewDecisions = makerTrip.isDemo
    ? []
    : await listTripReviewDecisions(tripId);

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
            extractionEnabled={hasOpenAIExtractionConfigForTrip(tripId)}
            extractionStatus={extraction}
            latestDraft={latestDraft}
            latestRun={latestRun}
            reviewDecisions={reviewDecisions}
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
