export function normalizeText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
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
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day))
  );

  if (Number.isNaN(parsed.getTime())) {
    return `${year}-${month}-${day}`;
  }

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
  const dayNumber = parsed.getUTCDate();

  return `${monthName} ${dayNumber}${ordinalSuffix(dayNumber)}, ${parsed.getUTCFullYear()}`;
}

export function formatReadableIsoDate(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value ?? "";
  }

  return formatReadableDate(match[1], match[2], match[3]);
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
