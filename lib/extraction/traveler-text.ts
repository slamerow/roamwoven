export function normalizeText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
}

// Shared comparable fold (remediation Phase 1, audit finding B5): the
// NFKD-based fold previously copy-pasted into parser-artifact-normalization,
// source-coverage, and extraction-qa. One implementation, one tokenization \u2014
// divergent normalizers were producing phantom "uncovered"/"duplicate"
// findings when two modules disagreed about the same string.
export function foldComparableText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function comparableTokens(value: string | null | undefined) {
  return foldComparableText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

// Shared price/cost signal (remediation Phase 1, audit finding B5): the four
// previous price regexes each covered a different currency subset \u2014 the
// researched-list marker was missing \u00a3/gbp entirely and no pattern knew the
// forint "Ft" symbol. One detector, superset of every prior vocabulary.
export const PRICE_SIGNAL_PATTERN =
  /\b\d+(?:[.,]\d+)?\s*(?:eur(?:os?)?|czk|kc|korunas?|huf|ft|forints?|usd|dollars?|gbp|pounds?)\b|[\u20ac$\u00a3]\s?\d/i;

export function normalizeTripClockTime(
  value: string | null | undefined
) {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  // Dot-times ("14.30", European itineraries) are accepted alongside
  // colon-times (remediation Phase 1, audit finding B5: dot-times counted as
  // transport time EVIDENCE but parsed nowhere, manufacturing missing-time
  // P0s). Two digits are required after the separator, so "3.5" (a duration)
  // and "45.75" (a price) still fail closed.
  const timeOnly = raw.match(
    /^(?:at\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i
  );
  const isoDateTime = raw.match(
    /^\d{4}-\d{2}-\d{2}[T\s](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i
  );
  const match = timeOnly ?? isoDateTime;

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = timeOnly?.[3]?.toLowerCase();

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  if (suffix === "pm" && hour < 12) {
    hour += 12;
  } else if (suffix === "am" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const TRIP_DATE_MONTHS: Record<string, number> = {
  apr: 4,
  april: 4,
  aug: 8,
  august: 8,
  dec: 12,
  december: 12,
  feb: 2,
  february: 2,
  jan: 1,
  january: 1,
  jul: 7,
  july: 7,
  jun: 6,
  june: 6,
  mar: 3,
  march: 3,
  may: 5,
  nov: 11,
  november: 11,
  oct: 10,
  october: 10,
  sep: 9,
  sept: 9,
  september: 9,
};

function validIsoDate(year: number, month: number, day: number) {
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function isoDate(year: number, month: number, day: number) {
  return validIsoDate(year, month, day)
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}

export function normalizeTripDate(
  value: string | null | undefined,
  defaultYear: number | null = null
) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const existingIso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);

  if (existingIso) {
    return isoDate(
      Number(existingIso[1]),
      Number(existingIso[2]),
      Number(existingIso[3])
    );
  }
  // Numeric day-first dates accept both dot and slash separators
  // (remediation Phase 1, audit finding B5: "16/1/2026" day headings parsed
  // in transport anchors but not in activities, manufacturing date
  // disagreements between the two lanes). Two-digit years expand to 2000+.
  // Day-first is tried before month-first, matching the anchor parser.
  const numericDayFirst = /\b(\d{1,2})([./])(\d{1,2})\2(\d{2}|\d{4})\b/.exec(
    trimmed
  );

  if (numericDayFirst) {
    const rawYear = Number(numericDayFirst[4]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const dayFirstIso = isoDate(
      year,
      Number(numericDayFirst[3]),
      Number(numericDayFirst[1])
    );

    return (
      dayFirstIso ??
      isoDate(year, Number(numericDayFirst[1]), Number(numericDayFirst[3]))
    );
  }

  const monthFirst = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i.exec(
    trimmed
  );
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s+(\d{4}))?\b/i.exec(
    trimmed
  );
  const monthName = monthFirst?.[1] ?? dayFirst?.[2];
  const year = Number(monthFirst?.[3] ?? dayFirst?.[3] ?? defaultYear);
  const day = Number(monthFirst?.[2] ?? dayFirst?.[1]);
  const month = monthName ? TRIP_DATE_MONTHS[monthName.toLowerCase()] : null;

  return month && year ? isoDate(year, month, day) : null;
}

export function tripDatesMatch(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const leftYear = /\b((?:19|20)\d{2})\b/.exec(left ?? "")?.[1];
  const rightYear = /\b((?:19|20)\d{2})\b/.exec(right ?? "")?.[1];
  const normalizedLeft = normalizeTripDate(
    left,
    rightYear ? Number(rightYear) : null
  );
  const normalizedRight = normalizeTripDate(
    right,
    leftYear ? Number(leftYear) : null
  );

  if (normalizedLeft && normalizedRight) {
    return normalizedLeft === normalizedRight;
  }

  return Boolean(left && right && normalizeText(left) === normalizeText(right));
}

function ordinalSuffix(day: number) {
  if (day % 100 >= 11 && day % 100 <= 13) {
    return "th";
  }

  if (day % 10 === 1) {
    return "st";
  }

  if (day % 10 === 2) {
    return "nd";
  }

  if (day % 10 === 3) {
    return "rd";
  }

  return "th";
}

export function formatReadableDate(year: string, month: string, day: string) {
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);

  if (!validIsoDate(yearNumber, monthNumber, dayNumber)) {
    return `${year}${month}${day}`;
  }

  const parsed = new Date(
    Date.UTC(yearNumber, monthNumber - 1, dayNumber)
  );

  if (Number.isNaN(parsed.getTime())) {
    return `${year}-${month}-${day}`;
  }

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
  const parsedDayNumber = parsed.getUTCDate();

  return `${monthName} ${parsedDayNumber}${ordinalSuffix(parsedDayNumber)}, ${parsed.getUTCFullYear()}`;
}

export function cleanTravelerText(value: string | null) {
  return value
    ?.replace(/\b(\d{4})(\d{2})(\d{2})\b/g, (_match, year, month, day) =>
      formatReadableDate(year, month, day)
    )
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, year, month, day) =>
      formatReadableDate(year, month, day)
    )
    .replace(/\bsource notes?\b/gi, "trip notes")
    .trim() ?? null;
}
