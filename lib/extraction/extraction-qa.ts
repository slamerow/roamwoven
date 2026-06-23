import type { StructuredTripRecords } from "@/lib/generated-trip-model";

type TimelineRecordType = "callout" | "item" | "question" | "stay" | "transport";

export type ExpectedTimelineRecord = {
  categoryId?: string;
  date: string | null;
  forbiddenKeywords?: readonly string[];
  id: string;
  label: string;
  recordTypes?: readonly TimelineRecordType[];
  requiredKeywords: readonly string[];
  requiredTitleKeywords?: readonly string[];
};

export type ExtractionQaCandidate = {
  categoryId: string | null;
  date: string | null;
  id: string;
  label: string;
  labelSearchText: string;
  recordType: TimelineRecordType;
  searchText: string;
};

export type ExtractionQaMissingRecord = {
  date: string | null;
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

export type ExtractionQaContentMismatch = {
  actualId: string;
  actualLabel: string;
  forbiddenKeywords: readonly string[];
  expectedId: string;
  expectedLabel: string;
};

export type ExtractionQaOverCompressedRecord = {
  actualId: string;
  actualLabel: string;
  expectedIds: string[];
  expectedLabels: string[];
};

export type ExtractionQaReport = {
  actualCountByDate: Record<string, number>;
  categoryMismatches: ExtractionQaCategoryMismatch[];
  contentMismatches: ExtractionQaContentMismatch[];
  expectedCountByDate: Record<string, number>;
  matched: Array<{
    actualId: string;
    actualLabel: string;
    expectedId: string;
    expectedLabel: string;
  }>;
  missing: ExtractionQaMissingRecord[];
  overCompressed: ExtractionQaOverCompressedRecord[];
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
  return records.flatMap((recordSet) => {
    const itemById = new Map(recordSet.items.map((item) => [item.id, item]));
    const stayById = new Map(recordSet.stays.map((stay) => [stay.id, stay]));
    const transportById = new Map(
      recordSet.transport.map((item) => [item.id, item])
    );
    const legById = new Map(recordSet.legs.map((leg) => [leg.id, leg]));

    function questionDate(question: StructuredTripRecords["reviewQuestions"][number]) {
      if (!question.subjectId) {
        return null;
      }

      if (question.subjectType === "item") {
        return itemById.get(question.subjectId)?.date ?? null;
      }

      if (question.subjectType === "stay") {
        return stayById.get(question.subjectId)?.checkInDate ?? null;
      }

      if (question.subjectType === "transport") {
        return transportById.get(question.subjectId)?.date ?? null;
      }

      if (question.subjectType === "leg") {
        return legById.get(question.subjectId)?.arriveDate ?? null;
      }

      return null;
    }

    return [
      ...recordSet.items
      .filter((item) => item.status !== "ignored")
      .map((item) => ({
        categoryId: item.categoryId,
        date: item.date,
        id: item.id,
        label: item.title,
        labelSearchText: normalizeSearchText(item.title),
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
        labelSearchText: normalizeSearchText(item.routeLabel),
        recordType: "transport" as const,
        searchText: normalizeSearchText(
          [
            item.routeLabel,
            item.departureLocation,
            item.arrivalLocation,
            item.provider,
            item.description,
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
        labelSearchText: normalizeSearchText(stay.name),
        recordType: "stay" as const,
        searchText: normalizeSearchText(
          [stay.name, stay.publicLocationLabel, stay.address].filter(Boolean).join(" ")
        ),
      })),
      ...recordSet.reviewQuestions
        .filter((question) => question.status === "open" || question.status === "noted")
        .map((question) => ({
          categoryId: null,
          date: questionDate(question),
          id: question.id,
          label: question.prompt,
          labelSearchText: normalizeSearchText(question.prompt),
          recordType: question.status === "open" ? "question" as const : "callout" as const,
          searchText: normalizeSearchText(
            [
              question.prompt,
              question.reason,
              question.evidence,
              question.guessedValue,
              question.targetField,
            ]
              .filter(Boolean)
              .join(" ")
          ),
        })),
    ];
  });
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
    (expectation.requiredTitleKeywords?.every((keyword) =>
      containsKeyword(candidate.labelSearchText, keyword)
    ) ??
      true) &&
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
  const contentMismatches: ExtractionQaContentMismatch[] = [];
  const usedCandidateIds = new Set<string>();
  const overCompressed = candidates
    .map((candidate) => ({
      candidate,
      expectations: expectations.filter((expectation) =>
        matchesExpectation(candidate, expectation)
      ),
    }))
    .filter((match) => match.expectations.length > 1)
    .map((match) => ({
      actualId: match.candidate.id,
      actualLabel: match.candidate.label,
      expectedIds: match.expectations.map((expectation) => expectation.id),
      expectedLabels: match.expectations.map((expectation) => expectation.label),
    }));

  for (const expectation of expectations) {
    const candidate = candidates.find(
      (item) =>
        !usedCandidateIds.has(item.id) && matchesExpectation(item, expectation)
    );

    if (!candidate) {
      missing.push({
        date: expectation.date,
        expectedId: expectation.id,
        label: expectation.label,
        requiredKeywords: expectation.requiredKeywords,
      });
      continue;
    }

    usedCandidateIds.add(candidate.id);
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

    const forbiddenMatches = expectation.forbiddenKeywords?.filter((keyword) =>
      containsKeyword(candidate.searchText, keyword)
    );

    if (forbiddenMatches?.length) {
      contentMismatches.push({
        actualId: candidate.id,
        actualLabel: candidate.label,
        forbiddenKeywords: forbiddenMatches,
        expectedId: expectation.id,
        expectedLabel: expectation.label,
      });
    }
  }

  return {
    actualCountByDate: countByDate(candidates.map((item) => item.date)),
    categoryMismatches,
    contentMismatches,
    expectedCountByDate: countByDate(expectations.map((item) => item.date)),
    matched,
    missing,
    overCompressed,
    score: expectations.length > 0 ? matched.length / expectations.length : 1,
  };
}
