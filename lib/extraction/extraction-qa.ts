import type { StructuredTripRecords } from "@/lib/generated-trip-model";

type TimelineRecordType = "item" | "stay" | "transport";

export type ExpectedTimelineRecord = {
  categoryId?: string;
  date: string;
  id: string;
  label: string;
  recordTypes?: readonly TimelineRecordType[];
  requiredKeywords: readonly string[];
};

export type ExtractionQaCandidate = {
  categoryId: string | null;
  date: string | null;
  id: string;
  label: string;
  recordType: TimelineRecordType;
  searchText: string;
};

export type ExtractionQaMissingRecord = {
  date: string;
  expectedId: string;
  label: string;
  requiredKeywords: readonly string[];
};

export type ExtractionQaCategoryMismatch = {
  actualCategoryId: string | null;
  actualLabel: string;
  expectedCategoryId: string;
  expectedId: string;
  expectedLabel: string;
};

export type ExtractionQaReport = {
  actualCountByDate: Record<string, number>;
  categoryMismatches: ExtractionQaCategoryMismatch[];
  expectedCountByDate: Record<string, number>;
  matched: Array<{
    actualId: string;
    actualLabel: string;
    expectedId: string;
    expectedLabel: string;
  }>;
  missing: ExtractionQaMissingRecord[];
  score: number;
};

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsKeyword(searchText: string, keyword: string) {
  return searchText.includes(normalizeSearchText(keyword));
}

function countByDate(
  dates: Array<string | null | undefined>
): Record<string, number> {
  return dates.reduce<Record<string, number>>((counts, date) => {
    if (!date) {
      return counts;
    }

    counts[date] = (counts[date] ?? 0) + 1;
    return counts;
  }, {});
}

function createCandidates(records: StructuredTripRecords[]): ExtractionQaCandidate[] {
  return records.flatMap((recordSet) => [
    ...recordSet.items
      .filter((item) => item.status !== "ignored")
      .map((item) => ({
        categoryId: item.categoryId,
        date: item.date,
        id: item.id,
        label: item.title,
        recordType: "item" as const,
        searchText: normalizeSearchText(
          [
            item.title,
            item.description,
            item.locationName,
            item.address,
            item.categoryId,
          ]
            .filter(Boolean)
            .join(" ")
        ),
      })),
    ...recordSet.transport
      .filter((item) => item.status !== "ignored")
      .map((item) => ({
        categoryId: null,
        date: item.date,
        id: item.id,
        label: item.routeLabel,
        recordType: "transport" as const,
        searchText: normalizeSearchText(
          [
            item.routeLabel,
            item.departureLocation,
            item.arrivalLocation,
            item.provider,
            item.transportType,
          ]
            .filter(Boolean)
            .join(" ")
        ),
      })),
    ...recordSet.stays
      .filter((stay) => stay.status !== "ignored")
      .map((stay) => ({
        categoryId: null,
        date: stay.checkInDate,
        id: stay.id,
        label: stay.name,
        recordType: "stay" as const,
        searchText: normalizeSearchText(
          [stay.name, stay.publicLocationLabel, stay.address].filter(Boolean).join(" ")
        ),
      })),
  ]);
}

function matchesExpectation(
  candidate: ExtractionQaCandidate,
  expectation: ExpectedTimelineRecord
) {
  const allowedRecordTypes = expectation.recordTypes ?? [
    "item",
    "stay",
    "transport",
  ];

  return (
    candidate.date === expectation.date &&
    allowedRecordTypes.includes(candidate.recordType) &&
    expectation.requiredKeywords.every((keyword) =>
      containsKeyword(candidate.searchText, keyword)
    )
  );
}

export function evaluateTripExtractionCoverage({
  expectations,
  records,
}: {
  expectations: ExpectedTimelineRecord[];
  records: StructuredTripRecords | StructuredTripRecords[];
}): ExtractionQaReport {
  const recordSets = Array.isArray(records) ? records : [records];
  const candidates = createCandidates(recordSets);
  const matched: ExtractionQaReport["matched"] = [];
  const missing: ExtractionQaMissingRecord[] = [];
  const categoryMismatches: ExtractionQaCategoryMismatch[] = [];

  for (const expectation of expectations) {
    const candidate = candidates.find((item) => matchesExpectation(item, expectation));

    if (!candidate) {
      missing.push({
        date: expectation.date,
        expectedId: expectation.id,
        label: expectation.label,
        requiredKeywords: expectation.requiredKeywords,
      });
      continue;
    }

    matched.push({
      actualId: candidate.id,
      actualLabel: candidate.label,
      expectedId: expectation.id,
      expectedLabel: expectation.label,
    });

    if (
      expectation.categoryId &&
      candidate.recordType === "item" &&
      candidate.categoryId !== expectation.categoryId
    ) {
      categoryMismatches.push({
        actualCategoryId: candidate.categoryId,
        actualLabel: candidate.label,
        expectedCategoryId: expectation.categoryId,
        expectedId: expectation.id,
        expectedLabel: expectation.label,
      });
    }
  }

  return {
    actualCountByDate: countByDate(candidates.map((item) => item.date)),
    categoryMismatches,
    expectedCountByDate: countByDate(expectations.map((item) => item.date)),
    matched,
    missing,
    score: expectations.length > 0 ? matched.length / expectations.length : 1,
  };
}
