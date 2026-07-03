export function normalizeText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
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
