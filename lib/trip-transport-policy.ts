export type TransportCompletenessField =
  | "arrivalLocation"
  | "arrivalTime"
  | "departureLocation"
  | "departureTime";

export type TransportCompletenessSeverity =
  | "requiredForReview"
  | "softCompleteness";

export type TransportCompletenessIssue = {
  field: TransportCompletenessField;
  label: string;
  severity: TransportCompletenessSeverity;
  sourceBacked: boolean;
};

export type TransportCompletenessRecord = {
  arrivalLocation: string | null;
  arrivalTime: string | null;
  confirmationLabel?: string | null;
  departureLocation: string | null;
  departureTime: string | null;
  description?: string | null;
  provider?: string | null;
  routeLabel: string;
  transportType: string | null;
};

const criticalTransportTypes = new Set([
  "bus",
  "ferry",
  "flight",
  "train",
]);

const conditionallyCriticalTransportTypes = new Set([
  "rental_car",
  "transfer",
]);

const issueLabels: Record<TransportCompletenessField, string> = {
  arrivalLocation: "arrival location",
  arrivalTime: "arrival time",
  departureLocation: "departure location",
  departureTime: "departure time",
};

function evidenceText(record: TransportCompletenessRecord) {
  return [
    record.routeLabel,
    record.departureLocation,
    record.arrivalLocation,
    record.provider,
    record.confirmationLabel,
    record.description,
    record.transportType?.replaceAll("_", " "),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasBookedOrLogisticalEvidence(record: TransportCompletenessRecord) {
  return /\b(booking|booked|confirmation|driver|pickup|pick[-\s]?up|reservation|reserved|ticket|transfer|voucher)\b/i.test(
    evidenceText(record)
  );
}

export function isCriticalTransportRecord(record: TransportCompletenessRecord) {
  const type = record.transportType ?? "";

  if (criticalTransportTypes.has(type)) {
    return true;
  }

  if (conditionallyCriticalTransportTypes.has(type)) {
    return hasBookedOrLogisticalEvidence(record);
  }

  return false;
}

export function hasTransportTimeEvidence(record: TransportCompletenessRecord) {
  return /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*(am|pm)\b/i.test(
    evidenceText(record)
  );
}

export function hasTransportArrivalTimeEvidence(
  record: TransportCompletenessRecord
) {
  const text = evidenceText(record);

  if (record.departureTime && /\b(arriv|land|reach|->|\u2192)\b/i.test(text)) {
    return hasTransportTimeEvidence(record);
  }

  const timeMatches = text.match(/\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*(am|pm)\b/gi);
  return (timeMatches?.length ?? 0) >= 2;
}

export function hasSpecificTransportLocationEvidence(
  record: TransportCompletenessRecord
) {
  return /\b(airport|bahnhof|gare|gate|hbf|hl\.?\s?n\.?|main station|platform|station|terminal)\b/i.test(
    evidenceText(record)
  );
}

function issue({
  field,
  severity,
  sourceBacked,
}: {
  field: TransportCompletenessField;
  severity: TransportCompletenessSeverity;
  sourceBacked: boolean;
}): TransportCompletenessIssue {
  return {
    field,
    label: issueLabels[field],
    severity,
    sourceBacked,
  };
}

export function getSourceBackedRequiredTransportIssues(
  record: TransportCompletenessRecord
) {
  if (!isCriticalTransportRecord(record)) {
    return [];
  }

  const issues: TransportCompletenessIssue[] = [];

  if (!record.departureTime && hasTransportTimeEvidence(record)) {
    issues.push(
      issue({
        field: "departureTime",
        severity: "requiredForReview",
        sourceBacked: true,
      })
    );
  }

  if (hasSpecificTransportLocationEvidence(record)) {
    if (!record.departureLocation) {
      issues.push(
        issue({
          field: "departureLocation",
          severity: "requiredForReview",
          sourceBacked: true,
        })
      );
    }

    if (!record.arrivalLocation) {
      issues.push(
        issue({
          field: "arrivalLocation",
          severity: "requiredForReview",
          sourceBacked: true,
        })
      );
    }
  }

  return issues;
}

export function getSoftTransportCompletenessIssues(
  record: TransportCompletenessRecord
) {
  if (!isCriticalTransportRecord(record)) {
    return [];
  }

  if (!record.arrivalTime && hasTransportArrivalTimeEvidence(record)) {
    return [
      issue({
        field: "arrivalTime",
        severity: "softCompleteness",
        sourceBacked: true,
      }),
    ];
  }

  return [];
}

export function getSourceBackedTransportFieldGaps({
  record,
  source,
}: {
  record: TransportCompletenessRecord;
  source: Partial<Record<TransportCompletenessField, string | null>>;
}) {
  const issues: TransportCompletenessIssue[] = [];

  if (source.departureTime && !record.departureTime) {
    issues.push(
      issue({
        field: "departureTime",
        severity: "requiredForReview",
        sourceBacked: true,
      })
    );
  }

  if (source.departureLocation && !record.departureLocation) {
    issues.push(
      issue({
        field: "departureLocation",
        severity: "requiredForReview",
        sourceBacked: true,
      })
    );
  }

  if (source.arrivalLocation && !record.arrivalLocation) {
    issues.push(
      issue({
        field: "arrivalLocation",
        severity: "requiredForReview",
        sourceBacked: true,
      })
    );
  }

  if (source.arrivalTime && !record.arrivalTime) {
    issues.push(
      issue({
        field: "arrivalTime",
        severity: "softCompleteness",
        sourceBacked: true,
      })
    );
  }

  return issues;
}
