import type {
  TripItemRecord,
  TripLegRecord,
  TripReviewQuestionRecord,
  TripSourceConfidence,
  TripStayRecord,
  TripTransportRecord,
} from "@/lib/generated-trip-model";
import {
  type DraftObject,
  getArray,
  getNumber,
  getString,
} from "@/lib/extraction/draft-value";
import {
  cleanTravelerText,
  formatReadableIsoDate,
  normalizeText,
} from "@/lib/extraction/traveler-text";
import { isDefaultPrivacyPolicyQuestion } from "@/lib/trip-privacy-policy";

function getConfidence(value: string | null): TripSourceConfidence {
  return value === "low" || value === "high" ? value : "medium";
}

function hasHumanConfidentEvidence(...values: Array<string | null>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();

  if (
    /\b(ambiguous|unclear|possible|probably|suggests|implies|might|maybe)\b/.test(
      text
    )
  ) {
    return false;
  }

  return (
    /\b(source|document|confirmation|reservation|itinerary|pdf)\s+(says|states|shows|lists|includes|explicitly)\b/.test(text) ||
    /\b(says|states|shows|lists|includes|explicitly)\b/.test(text) ||
    /\b\d+\s+night(s)?\b/.test(text) ||
    /\bcheck[-\s]?in\b/.test(text) ||
    /\bcheck[-\s]?out\b/.test(text) ||
    /\b(arrival|arrive|arrives|land|lands|departure|depart|departs|overnight flight|no hotel|bag drop|same day|sequence|follows|then|after|before|next)\b/.test(
      text
    )
  );
}

function isNonObviousCallEvidence(...values: Array<string | null>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();

  return (
    /\b(no hotel|overnight flight|bag drop|same day|sequence|follows|then|after|before|next|only one|route then moves|moves onward|left out|without a provider|without a company|not needed|enough for the traveler app)\b/.test(
      text
    ) &&
    !/\b(explicitly says|source says|source states|source lists|\d+\s+night(s)?)\b/.test(
      text
    )
  );
}

function isRoutineAssemblyFactCall(text: string) {
  if (
    /\b(grouped|merged|suppressed|hid|hidden|kept .* own date|chunk header|wrong[-\s]?city|conflict|conflicting|ticket choice|ticket decision|which ticket|needs review)\b/.test(
      text
    )
  ) {
    return false;
  }

  return (
    /\b(return flight day|trip end date|trip end|final [a-z0-9 ]*night|last [a-z0-9 ]*night|stay nights budget|landing and bag drop)\b/.test(
      text
    ) ||
    /\b(first trip day|trip start|trip starts|overnight flight|no hotel that night|no separate hotel night)\b/.test(
      text
    ) ||
    /\btreated\b.*\bstay\b.*\b(?:through|to|start|beginning)\b/.test(text) ||
    /\bstay\b.*\b(?:through|to)\b.*\bbased on\b.*\b(?:itinerary sequence|stay nights)\b/.test(
      text
    )
  );
}

function isObviousFactCall({
  confidence,
  evidence,
  guessedValue,
  prompt,
  reason,
  subjectId,
  targetField,
}: {
  confidence: TripSourceConfidence;
  evidence: string | null;
  guessedValue: string | null;
  prompt: string | null;
  reason: string | null;
  subjectId: string | null;
  targetField: string | null;
}) {
  if (!guessedValue || confidence === "low") {
    return false;
  }

  const text = [prompt, reason, evidence].filter(Boolean).join(" ").toLowerCase();
  const normalizedTarget = targetField?.toLowerCase() ?? "";
  const softLabelTarget =
    normalizedTarget.includes("title") || normalizedTarget.includes("name");
  const explicitFactEvidence =
    /\b(explicit|explicitly|source says|source states|source lists|clearly states|directly states|\d+\s+night(s)?)\b/.test(
      text
    );

  if (
    confidence !== "high" &&
    !explicitFactEvidence &&
    !softLabelTarget &&
    prompt &&
    (/\?\s*$/.test(prompt.trim()) ||
      /\b(is that correct|is that right|should we|do you want|please confirm)\b/.test(
        text
      ))
  ) {
    return false;
  }

  if (isRoutineAssemblyFactCall(text)) {
    return true;
  }

  if (isNonObviousCallEvidence(prompt, reason, evidence)) {
    return false;
  }

  return (
    explicitFactEvidence ||
    /\b\d+\s+night(s)?\b/.test(text) ||
    /\b(check[-\s]?in|check[-\s]?out|trip length|trip starts|trip ends|date range)\b/.test(
      text
    )
  );
}

function isCorePlanningTarget({
  subjectType,
  targetField,
}: {
  subjectType: TripReviewQuestionRecord["subjectType"];
  targetField: string | null;
}) {
  const normalizedTarget = targetField?.toLowerCase() ?? "";

  if (subjectType === "stay") {
    return (
      normalizedTarget.includes("date") ||
      normalizedTarget.includes("checkin") ||
      normalizedTarget.includes("check-in") ||
      normalizedTarget.includes("checkout") ||
      normalizedTarget.includes("check-out")
    );
  }

  if (subjectType === "transport") {
    return (
      normalizedTarget.includes("date") ||
      normalizedTarget.includes("time") ||
      normalizedTarget.includes("departure") ||
      normalizedTarget.includes("arrival")
    );
  }

  if (subjectType === "item") {
    return normalizedTarget.includes("date") || normalizedTarget.includes("time");
  }

  if (subjectType === "leg") {
    return normalizedTarget.includes("date") || normalizedTarget.includes("city");
  }

  return false;
}

function isDismissibleOptionalMissingDetail({
  evidence,
  hasUsableAnchor,
  prompt,
  reason,
  subjectId,
  subjectType,
  targetField,
}: {
  evidence: string | null;
  hasUsableAnchor: boolean;
  prompt: string | null;
  reason: string | null;
  subjectId: string | null;
  subjectType: TripReviewQuestionRecord["subjectType"];
  targetField: string | null;
}) {
  const target = targetField?.toLowerCase().split("/").pop() ?? "";
  const text = [prompt, reason, evidence, targetField]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const hasTextualTransportAnchor =
    subjectType === "transport" &&
    /\b(address|airport|confirmation|location|pickup|pick up|reservation|route|station|\d{1,2}\s*(am|pm))\b/.test(
      text
    );
  const hasTextualItemAnchor =
    subjectType === "item" &&
    /\b(walking tour|guided tour|tour|museum|gallery|castle|cathedral|palace|restaurant|lunch|dinner|breakfast|meal|reservation|ticket|entry)\b/.test(
      text
    ) &&
    /\b(\d{1,2}(?::\d{2})?\s*(am|pm)|\$\d+|january|february|march|april|may|june|july|august|september|october|november|december|\d{4}-\d{2}-\d{2})\b/.test(
      text
    );

  const optionalLabelPattern =
    /\b(address|company|location|name|operator|provider|title|url|website)\b/;
  const materialGapPattern =
    /\b(cannot|can't|critical|essential|material|required|unusable|where)\b|not identifiable|hard to identify|can't identify|cannot identify/;
  const dismissibleItemLabelGap =
    hasTextualItemAnchor &&
    subjectType === "item" &&
    (target.includes("name") ||
      target.includes("title") ||
      /\b(name|title|provider|company|operator)\b/.test(text));

  if (
    (!subjectId && !hasTextualTransportAnchor && !hasTextualItemAnchor) ||
    (!hasUsableAnchor && !hasTextualTransportAnchor && !hasTextualItemAnchor) ||
    !optionalLabelPattern.test(`${target} ${text}`) ||
    (materialGapPattern.test(text) && !dismissibleItemLabelGap)
  ) {
    return false;
  }

  if (
    subjectType === "item" &&
    (target.includes("url") || target.includes("website"))
  ) {
    return true;
  }

  if (
    subjectType === "item" &&
    (target.includes("address") ||
      target.includes("location") ||
      target.includes("name") ||
      target.includes("title"))
  ) {
    return true;
  }

  return (
    subjectType === "transport" &&
    (target.includes("provider") ||
      target.includes("company") ||
      /\b(company|provider|operator)\b/.test(text))
  );
}

function getQuestionClusterKey(question: TripReviewQuestionRecord) {
  const target = question.targetField?.toLowerCase() ?? "";
  const text = `${target} ${question.prompt.toLowerCase()}`;

  if (
    text.includes("checkin") ||
    text.includes("check-in") ||
    text.includes("check in")
  ) {
    return "checkin-date";
  }

  if (
    text.includes("checkout") ||
    text.includes("check-out") ||
    text.includes("check out")
  ) {
    return "checkout-date";
  }

  if (target.includes("date")) {
    return "date";
  }

  if (
    target.includes("provider") ||
    target.includes("company") ||
    /\b(company|provider|operator)\b/i.test(question.prompt)
  ) {
    return "provider";
  }

  if (target.includes("name") || target.includes("title")) {
    return "title";
  }

  if (target.includes("time") || /\b(time|start time|pick a time)\b/i.test(question.prompt)) {
    return "time";
  }

  if (target.includes("ticket") || /\b(ticket|which ticket)\b/i.test(question.prompt)) {
    return "ticket";
  }

  if (target.includes("booking") || /\b(book|booking|reserve|reservation)\b/i.test(question.prompt)) {
    return "booking";
  }

  return (
    target ||
    question.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((token) => token.length > 3)
      .slice(0, 4)
      .join("-") ||
    "general"
  );
}

function hasSpecificTitle(value: string | null, genericPatterns: RegExp[]) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return false;
  }

  return !genericPatterns.some((pattern) => pattern.test(normalized));
}

function normalizedTitleMatches(a: string | null, b: string | null) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (!left || !right) {
    return false;
  }

  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }

  const leftTokens = left
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter(
      (token) =>
        ![
          "activity",
          "and",
          "card",
          "flight",
          "from",
          "guided",
          "self",
          "the",
          "ticket",
          "to",
          "tour",
          "train",
          "travel",
          "walking",
        ].includes(token)
    );
  const rightTokens = new Set(
    right
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .filter(
        (token) =>
          ![
            "activity",
            "and",
            "card",
            "flight",
            "from",
            "guided",
            "self",
            "the",
            "ticket",
            "to",
            "tour",
            "train",
            "travel",
            "walking",
          ].includes(token)
      )
  );

  return leftTokens.some((token) => rightTokens.has(token));
}

function normalizedTitleContains(a: string | null, b: string | null) {
  const left = normalizeText(a);
  const right = normalizeText(b);

  return Boolean(
    left && right && (left === right || left.includes(right) || right.includes(left))
  );
}

function hasUsableTransportAnchor(record: TripTransportRecord | null) {
  if (!record) {
    return false;
  }

  return Boolean(
    record.departureLocation ||
      record.arrivalLocation ||
      record.provider ||
      record.confirmationLabel ||
      hasSpecificTitle(record.routeLabel, [
        /^transport \d+$/,
        /^(car|rental car|train|flight|transfer|bus|drive|ferry)( pickup)?$/,
      ])
  );
}

function hasUsableItemAnchor(record: TripItemRecord | null) {
  if (!record) {
    return false;
  }

  return Boolean(
    record.address ||
      record.locationName ||
      hasSpecificTitle(record.title, [
        /^activity \d+$/,
        /^reservation$/,
        /^(dinner|lunch|breakfast|meal) reservation$/,
        /^(dinner|lunch|breakfast|meal)$/,
        /^pickup$/,
        /^tour$/,
        /^activity$/,
      ]) ||
      (record.description && normalizeText(record.description).length > 20)
  );
}

function getAnswerType(
  value: string | null
): TripReviewQuestionRecord["answerType"] {
  if (
    value === "choice" ||
    value === "date" ||
    value === "time" ||
    value === "visibility" ||
    value === "confirm"
  ) {
    return value;
  }

  return "text";
}

function getReviewSubjectType(
  value: string | null
): TripReviewQuestionRecord["subjectType"] {
  if (
    value === "day" ||
    value === "leg" ||
    value === "stay" ||
    value === "transport" ||
    value === "item"
  ) {
    return value;
  }

  return "trip";
}

function hasExplicitSourceTodoText(...values: Array<string | null>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();

  return /\b(need to decide|needs? to decide|still need to|to be decided|to decide|pick a time|choose (a |the |which )?(ticket|time|tour|option)|which ticket|book this|book later|reserve later|confirm later|decide later|not booked yet|ticket to get)\b/.test(
    text
  ) || (/\btbd\b/.test(text) && /\b(ticket|time|book|booking|reserve|reservation|option|tour)\b/.test(text));
}

function getExplicitTodoQuestionSubject(item: TripItemRecord) {
  const text = [item.description, item.title].filter(Boolean).join(" ");

  if (/\bticket\b/i.test(text)) {
    const colonSubject = text.match(
      /\b([A-Z][A-Za-z'&]+(?:\s+[A-Z][A-Za-z'&]+){0,5})\s*:\s*(?:[Nn]eed to decide|.*which ticket)/
    );
    const ticketSubject = text.match(
      /\b(?:which|what|choose|chosen)?\s*([A-Z][A-Za-z'&]+(?:\s+[A-Z][A-Za-z'&]+){0,5})\s+(?:ticket|tickets|tour option|tour options?)\b/
    );
    const subject =
      cleanTravelerText(colonSubject?.[1] ?? null) ??
      cleanTravelerText(ticketSubject?.[1] ?? null);

    if (subject) {
      return subject;
    }
  }

  return item.title;
}

function createExplicitTodoQuestionPrompt(item: TripItemRecord) {
  const text = [item.title, item.description].filter(Boolean).join(" ");

  if (/\bticket\b/i.test(text)) {
    return `Which ticket or tour option should be listed for ${getExplicitTodoQuestionSubject(item)}?`;
  }

  if (/\b(time|start)\b/i.test(text)) {
    return `Have you picked a time for ${item.title}?`;
  }

  if (/\b(book|reserve|reservation)\b/i.test(text)) {
    return `Have you booked ${item.title} yet?`;
  }

  return `Have you decided the remaining detail for ${item.title}?`;
}

function createExplicitTodoQuestionTargetField(item: TripItemRecord) {
  const text = [item.title, item.description].filter(Boolean).join(" ");

  if (/\bticket\b/i.test(text)) {
    return "description";
  }

  if (/\b(time|start)\b/i.test(text)) {
    return "startTime";
  }

  if (/\b(book|reserve|reservation)\b/i.test(text)) {
    return "description";
  }

  return "description";
}

export function createReviewQuestions({
  draft,
  items,
  legs,
  stays,
  tripId,
  transport,
}: {
  draft: unknown;
  items: TripItemRecord[];
  legs: TripLegRecord[];
  stays: TripStayRecord[];
  tripId: string;
  transport: TripTransportRecord[];
}): TripReviewQuestionRecord[] {
  function getTargetValue({
    subjectId,
    subjectType,
    targetField,
  }: {
    subjectId: string | null;
    subjectType: TripReviewQuestionRecord["subjectType"];
    targetField: string | null;
  }) {
    if (!subjectId || !targetField) {
      return null;
    }

    const record =
      subjectType === "item"
        ? items.find((item) => item.id === subjectId)
        : subjectType === "stay"
          ? stays.find((stay) => stay.id === subjectId)
          : subjectType === "transport"
            ? transport.find((item) => item.id === subjectId)
            : subjectType === "leg"
              ? legs.find((leg) => leg.id === subjectId)
              : null;

    if (!record || !(targetField in record)) {
      return null;
    }

    const value = record[targetField as keyof typeof record];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function hasUsableSubjectAnchor({
    subjectId,
    subjectType,
  }: {
    subjectId: string | null;
    subjectType: TripReviewQuestionRecord["subjectType"];
  }) {
    if (subjectType === "transport") {
      return hasUsableTransportAnchor(
        transport.find((item) => item.id === subjectId) ?? null
      );
    }

    if (subjectType === "item") {
      return hasUsableItemAnchor(
        items.find((item) => item.id === subjectId) ?? null
      );
    }

    return Boolean(subjectId);
  }

  function isRoutineTransportExtractionDetail({
    evidence,
    hasUsableAnchor,
    prompt,
    reason,
    subjectType,
    targetField,
  }: {
    evidence: string | null;
    hasUsableAnchor: boolean;
    prompt: string | null;
    reason: string | null;
    subjectType: TripReviewQuestionRecord["subjectType"];
    targetField: string | null;
  }) {
    if (subjectType !== "transport") {
      return false;
    }

    const target = targetField?.toLowerCase() ?? "";
    const text = [prompt, reason, evidence, targetField]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const hasTextualTransportAnchor =
      /\b(airport|bus|confirmation|connection|connects?|drive|ferry|flight|pickup|pick up|reservation|route|station|train|transfer|dca|jfk|fco)\b/.test(
        text
      );

    if (!hasUsableAnchor && !hasTextualTransportAnchor) {
      return false;
    }

    if (/\b(no hotel|first night|first trip night|sleep on|overnight)\b/.test(text)) {
      return false;
    }

    if (
      (target.includes("departure") || target.includes("arrival")) &&
      /\b(airport\/city|broader airport|city label|airport naming|beyond the code|airport code)\b/.test(
        text
      )
    ) {
      return true;
    }

    if (
      /\b(two flight cards|two flight legs|split|connection|connects? through|kept .* legs?)\b/.test(
        text
      ) && /\b(airport|flight|dca|jfk|fco)\b/.test(text)
    ) {
      return true;
    }

    if (
      target.includes("description") &&
      /\b(airport transfer|public transport|move to airport|go to airport|leave for airport)\b/.test(
        text
      ) &&
      /\b(flight|fly|ryanair|delta|departure|before)\b/.test(text)
    ) {
      return true;
    }

    if (
      (target.includes("departure") || target.includes("arrival")) &&
      /\b(train|rail)\b/.test(text) &&
      /\b(route transition|city transition|next stay|previous stay|current city|current leg|next leg|train to)\b/.test(
        text
      ) &&
      /\b(guessed|suggested|answer|source|evidence|route)\b/.test(text)
    ) {
      return true;
    }

    return false;
  }

  function isAlreadyAnsweredByStructuredRecord({
    confidence,
    evidence,
    prompt,
    reason,
    subjectId,
    subjectType,
    targetField,
  }: {
    confidence: TripSourceConfidence;
    evidence: string | null;
    prompt: string | null;
    reason: string | null;
    subjectId: string | null;
    subjectType: TripReviewQuestionRecord["subjectType"];
    targetField: string | null;
  }) {
    if (!targetField || !subjectId) {
      return false;
    }

    if (!isCorePlanningTarget({ subjectType, targetField })) {
      return false;
    }

    const hasTargetValue = Boolean(
      getTargetValue({
        subjectId,
        subjectType,
        targetField,
      })
    );

    if (!hasTargetValue) {
      return false;
    }

    if (subjectType === "transport") {
      return true;
    }

    if (subjectType === "item") {
      const target = targetField.toLowerCase();

      if (target.includes("time")) {
        return true;
      }

      if (target.includes("date")) {
        return (
          !isQuestionShapedPrompt(prompt) &&
          (confidence === "high" || hasHumanConfidentEvidence(prompt, reason, evidence))
        );
      }
    }

    return false;
  }

  function isMakerUsefulPresentationCall({
    answerType,
    evidence,
    guessedValue,
    prompt,
    reason,
    targetField,
  }: {
    answerType: TripReviewQuestionRecord["answerType"];
    evidence: string | null;
    guessedValue: string | null;
    prompt: string | null;
    reason: string | null;
    targetField: string | null;
  }) {
    if (!guessedValue || !prompt || /\?\s*$/.test(prompt.trim())) {
      return false;
    }

    const text = normalizeText(
      [prompt, reason, evidence, targetField].filter(Boolean).join(" ")
    );
    const target = normalizeText(targetField);

    if (
      /\b(duplicate|moved|return flight|source backed|source obvious|stale|suppressed|trip end|used the listed|wrong city)\b/.test(
        text
      )
    ) {
      return false;
    }

    if (!target.includes("presentation")) {
      return false;
    }

    if (
      !/\b(grouped|combined|turned|bundled)\b/.test(text) ||
      !/\b(bar crawl|crawl|dinner options?|explore|flexible|museum visit|option|options|outing|route|walk)\b/.test(
        text
      )
    ) {
      return false;
    }

    return (
      answerType === "confirm" ||
      /\b(call|presentation)\b/.test(text)
    );
  }

  function isQuestionShapedPrompt(prompt: string | null) {
    if (!prompt) {
      return false;
    }

    const normalizedPrompt = normalizeText(prompt);

    return (
      /\?\s*$/.test(prompt.trim()) ||
      /\b(should we|do you want|what should we use|would you like|can we treat|should roamwoven)\b/.test(
        normalizedPrompt
      )
    );
  }

  function isLegacyConfirmableCallPrompt(prompt: string | null) {
    return Boolean(
      prompt &&
        /^this looks like\b/i.test(prompt.trim()) &&
        /\bis that right\?\s*$/i.test(prompt.trim())
    );
  }

  function shouldTreatAsNote({
    answerType,
    confidence,
    evidence,
    guessedValue,
    prompt,
    reason,
    targetField,
  }: {
    answerType: TripReviewQuestionRecord["answerType"];
    confidence: TripSourceConfidence;
    evidence: string | null;
    guessedValue: string | null;
    prompt: string | null;
    reason: string | null;
    targetField: string | null;
  }) {
    if (
      isQuestionShapedPrompt(prompt) &&
      !(confidence === "high" && isLegacyConfirmableCallPrompt(prompt))
    ) {
      return false;
    }

    return isMakerUsefulPresentationCall({
      answerType,
      evidence,
      guessedValue,
      prompt,
      reason,
      targetField,
    });
  }

  const findSubjectId = (
    subjectType: TripReviewQuestionRecord["subjectType"],
    relatedTitle: string | null
  ) => {
    if (!relatedTitle) {
      return null;
    }

    if (subjectType === "item") {
      return (
        items.find((item) => normalizedTitleContains(item.title, relatedTitle))?.id ??
        items.find((item) => normalizedTitleMatches(item.title, relatedTitle))?.id ??
        null
      );
    }

    if (subjectType === "stay") {
      return (
        stays.find((stay) => normalizedTitleContains(stay.name, relatedTitle))?.id ??
        stays.find((stay) => normalizedTitleMatches(stay.name, relatedTitle))?.id ??
        null
      );
    }

    if (subjectType === "transport") {
      return (
        transport.find((item) =>
          normalizedTitleContains(
            [
              item.routeLabel,
              item.departureLocation,
              item.arrivalLocation,
              item.provider,
            ]
              .filter(Boolean)
              .join(" "),
            relatedTitle
          )
        )?.id ??
        transport.find((item) =>
          normalizedTitleMatches(
            [
              item.routeLabel,
              item.departureLocation,
              item.arrivalLocation,
              item.provider,
            ]
              .filter(Boolean)
              .join(" "),
            relatedTitle
          )
        )?.id ??
        null
      );
    }

    if (subjectType === "leg") {
      return (
        legs.find((leg) => normalizedTitleContains(leg.displayName, relatedTitle))?.id ??
        legs.find((leg) => normalizedTitleMatches(leg.displayName, relatedTitle))?.id ??
        null
      );
    }

    return null;
  };

  const draftQuestions = getArray(draft, "missingDetails").flatMap((item, index) => {
    const detail = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const relatedTitle = getString(detail, "relatedTitle");
    const rawSubjectType = getString(detail, "subjectType");
    let subjectType = getReviewSubjectType(rawSubjectType);
    let subjectId = findSubjectId(subjectType, relatedTitle);

    if (!rawSubjectType && relatedTitle && !subjectId) {
      for (const candidateSubjectType of [
        "item",
        "stay",
        "transport",
        "leg",
      ] satisfies Array<TripReviewQuestionRecord["subjectType"]>) {
        const candidateSubjectId = findSubjectId(
          candidateSubjectType,
          relatedTitle
        );

        if (candidateSubjectId) {
          subjectType = candidateSubjectType;
          subjectId = candidateSubjectId;
          break;
        }
      }
    }

    const answerType = getAnswerType(getString(detail, "answerType"));
    const confidence = getConfidence(getString(detail, "confidence"));
    const evidence = getString(detail, "evidence");
    const guessedValue = getString(detail, "guessedValue");
    const prompt = getString(detail, "prompt");
    const reason = getString(detail, "reason");
    const targetField = getString(detail, "targetField");
    const isExplicitSourceTodo = hasExplicitSourceTodoText(
      prompt,
      reason,
      evidence,
      guessedValue,
      relatedTitle
    );

    const dismissOptionalDetail = isDismissibleOptionalMissingDetail({
      evidence,
      hasUsableAnchor: hasUsableSubjectAnchor({ subjectId, subjectType }),
      prompt,
      reason,
      subjectId,
      subjectType,
      targetField,
    });
    const dismissRoutineTransportDetail = isRoutineTransportExtractionDetail({
      evidence,
      hasUsableAnchor: hasUsableSubjectAnchor({ subjectId, subjectType }),
      prompt,
      reason,
      subjectType,
      targetField,
    });
    const alreadyAnsweredByRecord = isAlreadyAnsweredByStructuredRecord({
      confidence,
      evidence,
      prompt,
      reason,
      subjectId,
      subjectType,
      targetField,
    });
    const obviousFactCall = isObviousFactCall({
      confidence,
      evidence,
      guessedValue,
      prompt,
      reason,
      subjectId,
      targetField,
    });
    const privacyPolicyQuestion = isDefaultPrivacyPolicyQuestion({
      prompt,
      reason,
      subjectType,
      targetField,
    });
    const makerUsefulCall = shouldTreatAsNote({
      answerType,
      confidence,
      evidence,
      guessedValue,
      prompt,
      reason,
      targetField,
    });
    let status: TripReviewQuestionRecord["status"] = "open";

    if (
      alreadyAnsweredByRecord ||
      obviousFactCall ||
      privacyPolicyQuestion ||
      dismissRoutineTransportDetail ||
      (dismissOptionalDetail && !isExplicitSourceTodo)
    ) {
      status = "dismissed";
    } else if (isExplicitSourceTodo) {
      status = "open";
    } else if (makerUsefulCall) {
      status = "noted";
    }

    return [{
      answerType,
      answerValue: null,
      createdAt: null,
      evidence,
      guessedValue,
      id: `${tripId}-question-${index + 1}`,
      prompt: prompt ?? "Confirm a missing detail",
      reason:
        reason ??
        "This detail affects the generated traveler app.",
      resolvedAt: null,
      sourceConfidence: confidence,
      status,
      subjectId,
      subjectType,
      targetField,
      tripId,
    }];
  });
  const questionKeys = new Set(
    draftQuestions.map(
      (question) => `${question.subjectType}:${question.subjectId}:${getQuestionClusterKey(question)}`
    )
  );
  const hasRelatedOpenPlacementQuestion = (item: TripItemRecord) => {
    const title = normalizeText(item.title);

    if (!title) {
      return false;
    }

    return draftQuestions.some((question) => {
      if (question.status !== "open") {
        return false;
      }

      if (question.subjectId === item.id) {
        return true;
      }

      const questionText = normalizeText(
        [question.prompt, question.reason, question.evidence, question.guessedValue]
          .filter(Boolean)
          .join(" ")
      );

      return (
        questionText.includes(title) &&
        /\b(day|date|where|belong|place|placement|appear)\b/.test(questionText)
      );
    });
  };
  const rawStays = getArray(draft, "stays");
  const inferredStayCheckOutQuestions = stays.flatMap((stay, index) => {
    const rawStay = rawStays[index];
    const stayDraft =
      rawStay && typeof rawStay === "object" && !Array.isArray(rawStay)
        ? (rawStay as DraftObject)
        : null;
    const rawCheckOut = getString(stayDraft, "checkOut");
    const rawNights = getNumber(stayDraft, "nights");

    if (
      rawCheckOut ||
      rawNights ||
      !stay.checkInDate ||
      !stay.checkOutDate ||
      stay.checkOutDate <= stay.checkInDate
    ) {
      return [];
    }

    const question: TripReviewQuestionRecord = {
      answerType: "date",
      answerValue: null,
      createdAt: null,
      evidence: `The stay starts on ${formatReadableIsoDate(stay.checkInDate)} and the next leg begins on ${formatReadableIsoDate(stay.checkOutDate)}.`,
      guessedValue: stay.checkOutDate,
      id: `${tripId}-inferred-stay-checkout-${index + 1}`,
      prompt: `This looks like ${stay.name} checks out on ${formatReadableIsoDate(stay.checkOutDate)}. Is that correct?`,
      reason:
        "Roamwoven inferred the checkout date from the next leg so the stay can show a complete date range.",
      resolvedAt: null,
      sourceConfidence: "medium",
      status: "open",
      subjectId: stay.id,
      subjectType: "stay",
      targetField: "checkOutDate",
      tripId,
    };
    const key = `${question.subjectType}:${question.subjectId}:${getQuestionClusterKey(question)}`;

    if (questionKeys.has(key)) {
      return [];
    }

    questionKeys.add(key);
    return [question];
  });
  const explicitTodoQuestions = items
    .filter((item) => hasExplicitSourceTodoText(item.title, item.description))
    .flatMap((item, index): TripReviewQuestionRecord[] => {
      const targetField = createExplicitTodoQuestionTargetField(item);
      const prompt = createExplicitTodoQuestionPrompt(item);
      const question: TripReviewQuestionRecord = {
        answerType: "text",
        answerValue: null,
        createdAt: null,
        evidence: item.description,
        guessedValue: null,
        id: `${tripId}-explicit-todo-question-${index + 1}`,
        prompt,
        reason:
          "The source marks this activity detail as undecided, so this needs your choice.",
        resolvedAt: null,
        sourceConfidence: "medium",
        status: "open",
        subjectId: item.id,
        subjectType: "item",
        targetField,
        tripId,
      };
      const key = `${question.subjectType}:${question.subjectId}:${getQuestionClusterKey(question)}`;

      return questionKeys.has(key) ? [] : [question];
    });
  const missingItemDateQuestions = items
    .filter(
      (item) =>
        item.status !== "ignored" &&
        item.itemType !== "note" &&
        !item.date &&
        !hasRelatedOpenPlacementQuestion(item)
    )
    .flatMap((item, index): TripReviewQuestionRecord[] => {
      const question: TripReviewQuestionRecord = {
        answerType: "date",
        answerValue: null,
        createdAt: null,
        evidence: item.description,
        guessedValue: null,
        id: `${tripId}-item-placement-question-${index + 1}`,
        prompt: `Which day should ${item.title} appear on?`,
        reason:
          "This card is source-backed but does not have a clear date, so Roamwoven needs one placement decision.",
        resolvedAt: null,
        sourceConfidence: "medium",
        status: "open",
        subjectId: item.id,
        subjectType: "item",
        targetField: "date",
        tripId,
      };
      const key = `${question.subjectType}:${question.subjectId}:${getQuestionClusterKey(question)}`;

      return questionKeys.has(key) ? [] : [question];
    });

  return [
    ...draftQuestions,
    ...inferredStayCheckOutQuestions,
    ...explicitTodoQuestions,
    ...missingItemDateQuestions,
  ].filter((question, index, questions) => {
    if (question.status !== "open" && question.status !== "noted") {
      return true;
    }

    return (
      questions.findIndex(
        (candidate) =>
          candidate.status === question.status &&
          candidate.subjectId === question.subjectId &&
          candidate.subjectType === question.subjectType &&
          getQuestionClusterKey(candidate) === getQuestionClusterKey(question)
      ) === index
    );
  });
}
