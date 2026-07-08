import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileJson,
  GitCompareArrows,
  ListChecks,
  Search,
} from "lucide-react";
import {
  getTripExtractionAuditPayload,
  type TripExtractionAuditPayload,
} from "@/lib/extraction/trip-extraction-audit-view";
import {
  isDiagnosticLineageRow,
  lineageMatchesQuery,
  LineageTable,
} from "./audit-lineage-table";

type AuditReport = NonNullable<TripExtractionAuditPayload["report"]>;
type ProcessingEvent = TripExtractionAuditPayload["processingEvents"][number];

const assemblyLabels: Array<[keyof AuditReport["assembly"], string]> = [
  ["foldedLodgingNotes", "Stay-flow folds"],
  ["mergedCityNotes", "City-note merges"],
  ["removedDuplicateParents", "Duplicate parents removed"],
  ["removedGroupedChildren", "Grouped children removed"],
  ["suppressedDayOverviews", "Day overviews suppressed"],
  ["suppressedTransportActivities", "Transport activities suppressed"],
  ["wrongCityPlacements", "Wrong-city placements"],
];

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRunId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "None";
}

function formatStage(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getEventStatusClass(status: string) {
  if (status === "failed" || status === "blocked") {
    return "bg-clay/10 text-clay";
  }

  if (status === "completed") {
    return "bg-moss/10 text-moss";
  }

  if (status === "started") {
    return "bg-ink/10 text-ink";
  }

  return "bg-paper text-ink/60";
}

function StatCard({
  detail,
  label,
  value,
}: {
  detail?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-md bg-white p-4 shadow-sm ring-1 ring-ink/10">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
        {label}
      </p>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-ink/55">{detail}</div> : null}
    </div>
  );
}

function Section({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
      <div className="flex items-center gap-2">
        {icon ? <span className="text-moss">{icon}</span> : null}
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SmallMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <p className="text-xs font-semibold text-ink/45">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function TitleList({
  emptyLabel = "None",
  items,
  title,
}: {
  emptyLabel?: string;
  items: string[];
  title: string;
}) {
  const visibleItems = items.slice(0, 16);
  const remainingCount = items.length - visibleItems.length;

  return (
    <div className="rounded-md bg-paper p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {visibleItems.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-5 text-ink/70">
          {visibleItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {remainingCount > 0 ? (
            <li className="font-semibold text-ink/45">
              {remainingCount} more
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink/45">{emptyLabel}</p>
      )}
    </div>
  );
}

function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-md bg-moss/10 px-4 py-3 text-sm font-semibold text-moss">
        <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
        <p>No audit notices.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-md bg-clay/10 px-4 py-3 text-sm font-semibold text-clay">
      <div className="flex items-center gap-2">
        <AlertCircle size={18} />
        <p>Audit notices</p>
      </div>
      <ul className="mt-3 space-y-2">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </div>
  );
}

function ProcessingTimeline({ events }: { events: ProcessingEvent[] }) {
  return (
    <Section icon={<ListChecks size={18} />} title="Processing timeline">
      {events.length ? (
        <ol className="max-h-[32rem] space-y-3 overflow-auto pr-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-md border border-ink/10 bg-paper p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">
                      {formatStage(event.stage)}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${getEventStatusClass(
                        event.status
                      )}`}
                    >
                      {event.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink/45">
                    {formatDateTime(event.createdAt)} - Run{" "}
                    {formatRunId(event.processingRunId)} - Event{" "}
                    {formatRunId(event.id)}
                  </p>
                  {event.errorMessage ? (
                    <p className="mt-3 text-sm font-semibold leading-5 text-clay">
                      {event.errorMessage}
                    </p>
                  ) : null}
                </div>
                <details className="w-full rounded-md bg-white px-3 py-2 text-xs text-ink/65 ring-1 ring-ink/10 md:max-w-xl">
                  <summary className="cursor-pointer font-semibold text-ink/60">
                    Details
                  </summary>
                  <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap leading-5">
                    {JSON.stringify(event.details, null, 2)}
                  </pre>
                </details>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm font-semibold text-ink/45">
          No processing events have been recorded for this trip.
        </p>
      )}
    </Section>
  );
}

export default async function TripExtractionAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { tripId } = await params;
  const { q = "" } = await searchParams;
  const lineageQuery = q.trim().toLowerCase();
  const payload = await getTripExtractionAuditPayload(tripId);
  const report = payload.report;
  const chunks = report?.extraction.activityChunks;
  const searchableRows =
    report?.lineage.filter((row) => lineageMatchesQuery(row, lineageQuery)) ?? [];
  const diagnosticLineageRows =
    report?.lineage
      .filter(isDiagnosticLineageRow)
      .slice(0, 80) ?? [];
  const visibleSearchRows = lineageQuery ? searchableRows.slice(0, 80) : [];

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-ink/10 pb-6">
          <Link
            href={`/maker/trips/${tripId}/data`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink/60 hover:text-ink"
          >
            <ArrowLeft size={16} />
            Back to review queue
          </Link>
          <h1 className="mt-5 text-4xl font-semibold text-ink">
            Extraction audit
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            {payload.trip.name}
          </p>
        </header>

        <Notices notices={payload.notices} />

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <StatCard
            detail={`Run ${formatRunId(payload.reportRun?.id)}`}
            label="Report run"
            value={payload.reportRun?.status ?? "No run"}
          />
          <StatCard
            detail={`Snapshot ${formatRunId(payload.snapshot?.id)}`}
            label="Draft snapshot"
            value={payload.snapshot?.source ?? "No draft"}
          />
          <StatCard
            detail={payload.reportRun?.model ?? "No model"}
            label="Input"
            value={payload.reportRun?.inputCharCount ?? 0}
          />
          <StatCard
            detail={`Latest run ${formatRunId(payload.latestRun?.id)}`}
            label="Processing"
            value={payload.trip.processingStatus}
          />
        </div>

        <ProcessingTimeline events={payload.processingEvents} />

        {report ? (
          <>
            <Section icon={<ListChecks size={18} />} title="Extraction">
              <div className="grid gap-3 md:grid-cols-5">
                <SmallMetric label="Staged" value={report.extraction.staged ? "Yes" : "No"} />
                <SmallMetric label="Chunks" value={chunks?.count ?? 0} />
                <SmallMetric label="Succeeded" value={chunks?.succeeded ?? 0} />
                <SmallMetric label="Rescued" value={chunks?.rescued ?? 0} />
                <SmallMetric label="Failed" value={chunks?.failed ?? 0} />
              </div>
            </Section>

            <Section icon={<GitCompareArrows size={18} />} title="Assembly">
              <div className="grid gap-3 md:grid-cols-4">
                {assemblyLabels.map(([key, label]) => (
                  <SmallMetric
                    key={key}
                    label={label}
                    value={report.assembly[key]}
                  />
                ))}
              </div>
            </Section>

            <Section icon={<AlertCircle size={18} />} title="Diagnostics">
              {report.diagnostics.length ? (
                <div className="overflow-hidden rounded-md border border-ink/10">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-paper text-xs font-semibold uppercase tracking-wide text-ink/45">
                      <tr>
                        <th className="px-3 py-2">Severity</th>
                        <th className="px-3 py-2">Issue</th>
                        <th className="px-3 py-2">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {report.diagnostics.map((diagnostic) => (
                        <tr key={diagnostic.code} className="align-top">
                          <td className="px-3 py-3 font-semibold uppercase text-clay">
                            {diagnostic.severity}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-ink">
                              {diagnostic.title}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-ink/55">
                              {diagnostic.code}
                            </p>
                            <p className="mt-2 text-sm leading-5 text-ink/65">
                              {diagnostic.detail}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-ink/65">
                            <ul className="space-y-2">
                              {diagnostic.evidence.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm font-semibold text-moss">
                  No structural audit diagnostics.
                </p>
              )}
            </Section>

            <Section icon={<Search size={18} />} title="Anchor search">
              <form className="flex flex-col gap-3 md:flex-row">
                <input
                  className="min-h-11 flex-1 rounded-md border border-ink/15 bg-white px-3 text-sm text-ink outline-none ring-moss/30 focus:ring-4"
                  defaultValue={q}
                  name="q"
                  placeholder="Search titles, evidence, assembly actions, or final cards"
                  type="search"
                />
                <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-4 text-sm font-semibold text-paper">
                  Search
                </button>
              </form>
              {lineageQuery ? (
                <div className="mt-5">
                  <LineageTable
                    rows={visibleSearchRows}
                    title={`${searchableRows.length} lineage rows match "${q.trim()}". Showing ${visibleSearchRows.length}.`}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink/45">
                  Search for anchors like Train to Vienna, Klementinum, rental car,
                  or a hotel name.
                </p>
              )}
            </Section>

            <Section title="Lineage review">
              <LineageTable
                rows={diagnosticLineageRows}
                title={`Showing ${diagnosticLineageRows.length} non-boring lineage rows out of ${report.lineage.length}.`}
              />
            </Section>

            <Section title="Source comparison">
              <div className="grid gap-4 lg:grid-cols-3">
                <TitleList
                  items={report.sourceComparison?.rawOnlyTitles ?? []}
                  title="Raw-only titles"
                />
                <TitleList
                  items={report.sourceComparison?.assembledOnlyTitles ?? []}
                  title="Assembled-only titles"
                />
                <TitleList
                  items={report.sourceComparison?.sharedTitles ?? []}
                  title="Shared titles"
                />
              </div>
            </Section>

            <Section title="Structured output">
              <div className="grid gap-3 md:grid-cols-4">
                <SmallMetric
                  label="Activities"
                  value={report.structured.activeActivities}
                />
                <SmallMetric label="Notes" value={report.structured.activeNotes} />
                <SmallMetric label="Stays" value={report.structured.stays} />
                <SmallMetric label="Transport" value={report.structured.transport} />
                <SmallMetric
                  label="Open questions"
                  value={report.structured.openQuestions}
                />
                <SmallMetric
                  label="Hard warnings"
                  value={report.structured.hardWarnings}
                />
                <SmallMetric
                  label="Quiet warnings"
                  value={report.structured.quietWarnings}
                />
                <SmallMetric
                  label="Generated"
                  value={formatDateTime(payload.snapshot?.createdAt)}
                />
              </div>
            </Section>

            <Section title="Summary warnings">
              {report.warnings.length ? (
                <div className="overflow-hidden rounded-md border border-ink/10">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-paper text-xs font-semibold uppercase tracking-wide text-ink/45">
                      <tr>
                        <th className="px-3 py-2">Severity</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Title</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {report.warnings.map((warning) => (
                        <tr key={`${warning.subjectId}-${warning.title}`}>
                          <td className="px-3 py-2 font-semibold text-ink">
                            {warning.severity}
                          </td>
                          <td className="px-3 py-2 text-ink/60">
                            {warning.subjectType}
                          </td>
                          <td className="px-3 py-2 text-ink/70">
                            {warning.title}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm font-semibold text-moss">
                  No Summary warnings.
                </p>
              )}
            </Section>

            <Section icon={<FileJson size={18} />} title="JSON payload">
              <div className="mb-3 flex flex-wrap gap-3 text-sm">
                <Link
                  className="font-semibold text-moss hover:text-ink"
                  href={`/maker/trips/${tripId}/data/audit/qa-bundle`}
                >
                  Open redacted QA bundle
                </Link>
                <Link
                  className="font-semibold text-ink/45 hover:text-ink"
                  href={`/maker/trips/${tripId}/data/audit/qa-bundle?includePrivate=1`}
                >
                  Include private details
                </Link>
              </div>
              <details className="rounded-md bg-ink p-4 text-paper">
                <summary className="cursor-pointer text-sm font-semibold">
                  Audit payload
                </summary>
                <pre className="mt-4 max-h-[36rem] overflow-auto whitespace-pre-wrap text-xs leading-5">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </details>
            </Section>
          </>
        ) : (
          <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
            <p className="text-sm font-semibold text-ink">
              No audit report is available yet.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
