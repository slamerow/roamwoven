import type { TripExtractionAuditPayload } from "@/lib/extraction/trip-extraction-audit-view";

type AuditReport = NonNullable<TripExtractionAuditPayload["report"]>;
export type AuditLineageRow = AuditReport["lineage"][number];

function includesQuery(value: string | null | undefined, query: string) {
  return Boolean(value?.toLowerCase().includes(query));
}

function candidateDescription(
  item: AuditLineageRow["raw"] | AuditLineageRow["assembled"] | null
) {
  return item && "description" in item ? item.description : null;
}

function candidateEvidence(
  item: AuditLineageRow["raw"] | AuditLineageRow["assembled"] | null
) {
  return item && "evidence" in item ? item.evidence : null;
}

export function lineageMatchesQuery(row: AuditLineageRow, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    row.title,
    row.date,
    row.status,
    row.raw?.title,
    candidateDescription(row.raw),
    candidateEvidence(row.raw),
    row.assembled?.title,
    candidateDescription(row.assembled),
    candidateEvidence(row.assembled),
    ...row.assemblyActions.flatMap((action) => [action.action, action.detail]),
    ...row.diagnostics,
    ...row.finalRecords.flatMap((record) => [
      record.title,
      record.description,
      record.recordType,
      record.type,
    ]),
  ];

  return haystack.some((value) => includesQuery(value, query));
}

export function isDiagnosticLineageRow(row: AuditLineageRow) {
  return (
    row.status !== "survived" ||
    row.assemblyActions.length > 0 ||
    row.diagnostics.length > 0 ||
    row.finalRecords.length !== 1
  );
}

function candidateBits(
  item: AuditLineageRow["raw"] | AuditLineageRow["assembled"]
) {
  if (!item) {
    return [];
  }

  const bits = [item.date];

  if ("startTime" in item) {
    bits.push(item.startTime);
  }

  if ("departureTime" in item) {
    bits.push(item.departureTime);
  }

  if ("category" in item) {
    bits.push(item.category);
  }

  if ("type" in item) {
    bits.push(item.type);
  }

  if ("address" in item) {
    bits.push(item.address);
  }

  return bits.filter(Boolean) as string[];
}

function CandidateSummary({
  item,
}: {
  item: AuditLineageRow["raw"] | AuditLineageRow["assembled"];
}) {
  if (!item) {
    return <span className="text-ink/35">None</span>;
  }

  const bits = candidateBits(item);
  const description = candidateDescription(item);
  const evidence = candidateEvidence(item);

  return (
    <div>
      <p className="font-semibold text-ink">{item.title}</p>
      {bits.length ? (
        <p className="mt-1 text-xs leading-5 text-ink/55">
          {bits.join(" | ")}
        </p>
      ) : null}
      {description ? (
        <p className="mt-1 text-xs leading-5 text-ink/60">
          {description}
        </p>
      ) : null}
      {evidence ? (
        <p className="mt-1 text-xs leading-5 text-ink/45">
          Evidence: {evidence}
        </p>
      ) : null}
    </div>
  );
}

function FinalRecordsSummary({
  records,
}: {
  records: AuditLineageRow["finalRecords"];
}) {
  if (!records.length) {
    return <span className="text-ink/35">None</span>;
  }

  return (
    <div className="space-y-3">
      {records.map((record) => {
        const bits = [
          record.date,
          record.startTime,
          record.category,
          record.recordType,
          record.type,
        ].filter(Boolean);

        return (
          <div key={record.id}>
            <p className="font-semibold text-ink">{record.title}</p>
            {bits.length ? (
              <p className="mt-1 text-xs leading-5 text-ink/55">
                {bits.join(" | ")}
              </p>
            ) : null}
            {record.description ? (
              <p className="mt-1 text-xs leading-5 text-ink/60">
                {record.description}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function LineageTable({
  rows,
  title,
}: {
  rows: AuditLineageRow[];
  title: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-ink/45">No matching lineage rows.</p>;
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-ink/65">{title}</p>
      <div className="overflow-auto rounded-md border border-ink/10">
        <table className="min-w-[72rem] border-collapse text-left text-sm">
          <thead className="bg-paper text-xs font-semibold uppercase tracking-wide text-ink/45">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Raw</th>
              <th className="px-3 py-2">Assembly</th>
              <th className="px-3 py-2">Assembled</th>
              <th className="px-3 py-2">Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {rows.map((row) => (
              <tr key={row.identityKey} className="align-top">
                <td className="px-3 py-3 font-semibold text-ink">
                  {row.status}
                  {row.diagnostics.length ? (
                    <p className="mt-1 text-xs font-normal leading-5 text-clay">
                      {row.diagnostics.join(", ")}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-ink/55">{row.date ?? "None"}</td>
                <td className="px-3 py-3 text-ink/70">
                  <CandidateSummary item={row.raw} />
                </td>
                <td className="px-3 py-3 text-ink/70">
                  {row.assemblyActions.length ? (
                    <ul className="space-y-2">
                      {row.assemblyActions.map((action, index) => (
                        <li key={`${action.action}-${index}`}>
                          <span className="font-semibold text-ink">
                            {action.action}
                          </span>
                          <p className="text-xs leading-5 text-ink/55">
                            {action.detail}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-ink/35">None</span>
                  )}
                </td>
                <td className="px-3 py-3 text-ink/70">
                  <CandidateSummary item={row.assembled} />
                </td>
                <td className="px-3 py-3 text-ink/70">
                  <FinalRecordsSummary records={row.finalRecords} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
