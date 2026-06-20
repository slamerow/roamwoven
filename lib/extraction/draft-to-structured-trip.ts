import type {
  StructuredTripRecords,
  TripCategoryRecord,
  TripItemRecord,
  TripLegRecord,
  TripPrivateDetailRecord,
  TripReviewQuestionRecord,
  TripStayRecord,
  TripSummaryRecord,
  TripTransportRecord,
  TripTransportType,
  TripItemType,
  TripSourceConfidence,
  TripWeatherHookRecord,
} from "@/lib/generated-trip-model";
import {
  canonicalizeTripCategoryId,
  getTripCategoryEmoji,
  getTripCategoryLabel,
} from "@/lib/trip-categories";

type DraftObject = Record<string, unknown>;

function getObject(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const child = (value as DraftObject)[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? (child as DraftObject)
    : null;
}

function getArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const child = (value as DraftObject)[key];
  return Array.isArray(child) ? child : [];
}

function getString(value: DraftObject | null, key: string) {
  const child = value?.[key];
  return typeof child === "string" && child.trim() ? child.trim() : null;
}

function getNumber(value: DraftObject | null, key: string) {
  const child = value?.[key];

  if (typeof child === "number" && Number.isFinite(child)) {
    return child;
  }

  if (typeof child === "string" && child.trim()) {
    const parsed = Number(child);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

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

function isObviousFactCall({
  confidence,
  evidence,
  guessedValue,
  prompt,
  reason,
  subjectId,
}: {
  confidence: TripSourceConfidence;
  evidence: string | null;
  guessedValue: string | null;
  prompt: string | null;
  reason: string | null;
  subjectId: string | null;
}) {
  if (!guessedValue || confidence === "low") {
    return false;
  }

  const text = [prompt, reason, evidence].filter(Boolean).join(" ").toLowerCase();

  if (isNonObviousCallEvidence(prompt, reason, evidence)) {
    return false;
  }

  return (
    /\b(explicit|explicitly|source says|source states|source lists|clearly states|directly states)\b/.test(
      text
    ) ||
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

function isPrivacyPolicyQuestion({
  prompt,
  reason,
  subjectType,
  targetField,
}: {
  prompt: string | null;
  reason: string | null;
  subjectType: TripReviewQuestionRecord["subjectType"];
  targetField: string | null;
}) {
  const target = targetField?.toLowerCase() ?? "";
  const text = [prompt, reason, targetField].filter(Boolean).join(" ").toLowerCase();

  if (
    /\b(ambiguous|can't tell|cannot tell|unclear|not sure|private versus public|public or private|hotel or private|rental or hotel)\b/.test(
      text
    )
  ) {
    return false;
  }

  return (
    target.includes("sensitive") ||
    target.includes("visibility") ||
    target.includes("privacy") ||
    target.includes("addressvisibility") ||
    ((target.includes("address") ||
      target.includes("booking") ||
      target.includes("confirmation")) &&
      /\b(private|privacy|sensitive|visibility)\b/.test(text)) ||
    (subjectType === "trip" &&
      /\b(access code|booking reference|confirmation|password|privacy|private|sensitive|visibility|wifi|wi-fi)\b/.test(
        text
      ))
  );
}

function isDismissibleOptionalMissingDetail({
  hasUsableAnchor,
  prompt,
  reason,
  subjectId,
  subjectType,
  targetField,
}: {
  hasUsableAnchor: boolean;
  prompt: string | null;
  reason: string | null;
  subjectId: string | null;
  subjectType: TripReviewQuestionRecord["subjectType"];
  targetField: string | null;
}) {
  if (!subjectId) {
    return false;
  }

  const target = targetField?.toLowerCase().split("/").pop() ?? "";
  const text = [prompt, reason, targetField].filter(Boolean).join(" ").toLowerCase();

  const optionalLabelPattern =
    /\b(address|company|location|name|operator|provider|title|url|website)\b/;
  const materialGapPattern =
    /\b(cannot|can't|critical|essential|material|required|unusable|where)\b|not identifiable|hard to identify|can't identify|cannot identify/;

  if (
    !hasUsableAnchor ||
    !optionalLabelPattern.test(`${target} ${text}`) ||
    materialGapPattern.test(text)
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

function isPublicVenueAddressDetail({
  detailType,
  title,
}: {
  detailType: string;
  title: string;
}) {
  const normalizedType = detailType.toLowerCase();

  if (
    !normalizedType.includes("address") &&
    !normalizedType.includes("location")
  ) {
    return false;
  }

  const normalizedTitle = title.toLowerCase();
  const publicVenuePattern =
    /\b(bar|bistro|boutique|cafe|café|church|gallery|jewelry|jewellery|landmark|market|museum|restaurant|retail|shop|shopping|showroom|station|store|venue)\b/;
  const commercialStayPattern = /\b(hotel|hostel|inn|motel|resort|lodge)\b/;
  const privateControlPattern =
    /\b(access|booking|code|confirmation|door|gate|lock|password|room)\b/;
  const privatePlacePattern =
    /\b(airbnb|apartment|flat|home|host|lodging|rental|residence|stay)\b/;

  return (
    (publicVenuePattern.test(normalizedTitle) ||
      commercialStayPattern.test(normalizedTitle)) &&
    !privateControlPattern.test(normalizedTitle) &&
    !privatePlacePattern.test(normalizedTitle)
  );
}

function isGenericNonPrivateLogisticsDetail({
  detailType,
  reason,
  title,
}: {
  detailType: string;
  reason: string | null;
  title: string;
}) {
  const text = [detailType, title, reason].filter(Boolean).join(" ").toLowerCase();
  const sensitivePattern =
    /\b(access|booking|child|code|confirmation|contact|door|email|emergency|family|gate|guest|host|id|identity|lock|medical|passport|password|payment|phone|private|reference|reservation|room|safety|ticket|wifi|wi-fi)\b/;
  const logisticsPattern =
    /\b(arrival|bus|car|drive|drop[-\s]?off|ferry|flight|parking|pickup|pick[-\s]?up|rental|station|taxi|train|transfer|transport)\b/;

  return logisticsPattern.test(text) && !sensitivePattern.test(text);
}

function isActionableSensitiveDetail({
  detailType,
  reason,
  title,
}: {
  detailType: string;
  reason: string | null;
  title: string;
}) {
  const text = [detailType, title, reason].filter(Boolean).join(" ").toLowerCase();

  if (isGenericNonPrivateLogisticsDetail({ detailType, reason, title })) {
    return false;
  }

  return /\b(access|address|booking|child|code|confirmation|contact|door|email|emergency|family|gate|guest|host|id|identity|lock|medical|note|passport|password|payment|phone|private|reference|reservation|room|safety|ticket|wifi|wi-fi)\b/.test(
    text
  );
}

function getQuestionClusterKey(question: TripReviewQuestionRecord) {
  const target = question.targetField?.toLowerCase() ?? "";

  if (
    target.includes("date") ||
    target.includes("checkin") ||
    target.includes("check-in") ||
    target.includes("checkout") ||
    target.includes("check-out")
  ) {
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

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "record";
}

function normalizeTransportType(value: string | null): TripTransportType {
  if (value === "flight" || value === "train" || value === "ferry") {
    return value;
  }

  if (value === "car") {
    return "drive";
  }

  if (value === "transfer") {
    return "transfer";
  }

  return "other";
}

function normalizeItemType(value: string | null, title: string, description: string | null): TripItemType {
  if (
    value === "activity" ||
    value === "note" ||
    value === "admin" ||
    value === "rest_day" ||
    value === "social" ||
    value === "placeholder"
  ) {
    return value;
  }

  const text = `${title} ${description ?? ""}`.toLowerCase();

  if (
    /\b(restaurant|dinner|lunch|brunch|breakfast|cafe|café|bar|tapas|winery)\b/.test(
      text
    )
  ) {
    return "activity";
  }

  if (/\b(tbd|to confirm|placeholder)\b/.test(text)) {
    return "placeholder";
  }

  return "activity";
}

function normalizeCategoryId({
  category,
  description,
  itemType,
  title,
}: {
  category: string | null;
  description: string | null;
  itemType: TripItemType;
  title: string;
}) {
  const canonicalCategory = canonicalizeTripCategoryId(category);

  if (canonicalCategory) {
    return canonicalCategory;
  }

  const text = `${title} ${description ?? ""}`.toLowerCase();

  if (/\b(check[-\s]?in|check[-\s]?out|drop bags?|bag drop|arrival|departure|airport|station|flight|land|lands)\b/.test(text)) {
    return "arrival_departure";
  }

  if (itemType === "rest_day") {
    return "rest_day";
  }

  if (itemType === "social" || /\b(friend|family|meetup|meet up|visit with)\b/.test(text)) {
    return "social";
  }

  if (/\b(cooking class|cookery|food tour|market tour|tasting class)\b/.test(text)) {
    return "food_class";
  }

  if (/\b(restaurant|dinner|lunch|brunch|breakfast|cafe|café|bar|tapas|winery|brewery|beer hall|food hall|market|meal)\b/.test(text)) {
    return "food_dining";
  }

  if (/\b(pottery|calligraphy|batik|silk|workshop|craft class|art class|hands[-\s]?on)\b/.test(text)) {
    return "art_class";
  }

  if (/\b(temple|shrine|church|cathedral|basilica|mosque|synagogue|religious|st vitus|st\. vitus)\b/.test(text)) {
    return "temple_shrine";
  }

  if (/\b(ticket|tickets|tour|guided|entry|reservation|pass|timed|time travel|walking tour|catacombs|castle|palace)\b/.test(text)) {
    return "tours_tickets";
  }

  if (/\b(museum|gallery|exhibit|exhibition|library|monument|statue|landmark|art|culture|historic|history|communism|kgb|belvedere|albertina|mumok|kafka)\b/.test(text)) {
    return "art_culture";
  }

  if (/\b(zoo|wildlife|sanctuary|aquarium|animal|elephant|whale shark|whale|dolphin)\b/.test(text)) {
    return "animal_experience";
  }

  if (/\b(beach|swim|snorkel|pool|water|boat|kayak|surf|reef)\b/.test(text)) {
    return "beach_water";
  }

  if (/\b(hike|park|garden|trail|mountain|nature|outdoors|viewpoint|scenic spot|gloriette|palm house)\b/.test(text)) {
    return "nature_outdoors";
  }

  if (/\b(shop|shopping|market|tailor|tailoring|souvenir|mall|boutique)\b/.test(text)) {
    return "shopping_tailor";
  }

  if (/\b(spa|massage|sauna|yoga|wellness|relaxation|baths?)\b/.test(text)) {
    return "wellness_relaxation";
  }

  if (/\b(playground|kid|kids|child|children|family[-\s]?friendly|toddler|wren)\b/.test(text)) {
    return "kid_activity";
  }

  if (/\b(show|concert|theater|theatre|performance|ferris wheel|nightlife|club|cocktail|hemingway bar)\b/.test(text)) {
    return "nightlife_entertainment";
  }

  if (/\b(train ride|boat ride|scenic ride|road trip|drive|ferry|cruise|panorama train)\b/.test(text)) {
    return "scenic_ride";
  }

  if (/\b(laundry|grocery|groceries|pack|packing|sim card|pharmacy|errand|admin)\b/.test(text)) {
    return "admin_logistics";
  }

  if (itemType === "admin" || itemType === "note" || itemType === "placeholder") {
    return "admin_logistics";
  }

  return "art_culture";
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function subtractDays(value: string, days: number) {
  return addDays(value, -days);
}

function normalizeText(value: string | null) {
  return value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim() ?? "";
}

function hasExplicitSourceTodoText(...values: Array<string | null>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();

  return /\b(need to decide|needs? to decide|still need to|to be decided|to decide|pick a time|choose (a |the |which )?(ticket|time|tour|option)|which ticket|book this|book later|reserve later|confirm later|decide later|not booked yet|ticket to get)\b/.test(
    text
  ) || (/\btbd\b/.test(text) && /\b(ticket|time|book|booking|reserve|reservation|option|tour)\b/.test(text));
}

function createExplicitTodoQuestionPrompt(item: TripItemRecord) {
  const text = [item.title, item.description].filter(Boolean).join(" ");

  if (/\bticket\b/i.test(text)) {
    return `Have you chosen which ticket to get for ${item.title}?`;
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

function isGenericStayName(value: string) {
  const normalized = normalizeText(value);
  return (
    /^stay \d+$/.test(normalized) ||
    /^[a-z]+ stay$/.test(normalized) ||
    normalized.includes("hostel stay") ||
    normalized.includes("lodging")
  );
}

function isCommercialStayName(value: string | null) {
  const normalized = normalizeText(value);

  return /\b(hotel|hostel|inn|motel|resort|lodge)\b/.test(normalized);
}

function shouldProtectStayAddress(stay: { address: string | null; name: string }) {
  if (!stay.address) {
    return false;
  }

  return !isCommercialStayName(stay.name);
}

function getStayNameGuess({
  draft,
  fallbackName,
}: {
  draft: unknown;
  fallbackName: string;
}) {
  const normalizedFallback = normalizeText(fallbackName);
  const candidates = getArray(draft, "missingDetails")
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as DraftObject)
        : null
    )
    .filter((item): item is DraftObject => Boolean(item))
    .filter((item) => {
      const subjectType = getString(item, "subjectType");
      const targetField = normalizeText(getString(item, "targetField"));
      const guessedValue = getString(item, "guessedValue");
      const text = normalizeText(
        [
          getString(item, "prompt"),
          getString(item, "reason"),
          getString(item, "evidence"),
          getString(item, "relatedTitle"),
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        Boolean(guessedValue) &&
        (subjectType === "stay" ||
          text.includes("lodging") ||
          text.includes("hostel") ||
          text.includes("hotel") ||
          text.includes("check in")) &&
        (targetField.includes("title") ||
          targetField.includes("name") ||
          text.includes("lodging title") ||
          text.includes("correct lodging"))
      );
    });

  const matchingCandidate = candidates.find((item) => {
    const relatedTitle = normalizeText(getString(item, "relatedTitle"));
    const prompt = normalizeText(getString(item, "prompt"));
    const reason = normalizeText(getString(item, "reason"));

    return (
      Boolean(normalizedFallback) &&
      (relatedTitle.includes(normalizedFallback) ||
        normalizedFallback.includes(relatedTitle) ||
        prompt.includes(normalizedFallback) ||
        reason.includes(normalizedFallback))
    );
  });

  return (
    getString(matchingCandidate ?? null, "guessedValue") ??
    (isGenericStayName(fallbackName) && candidates.length === 1
      ? getString(candidates[0], "guessedValue")
      : null)
  );
}

function datesBetweenExclusiveEnd(startDate: string | null, endDate: string | null) {
  if (!isIsoDate(startDate)) {
    return [];
  }

  if (!isIsoDate(endDate) || endDate <= startDate) {
    return [startDate];
  }

  const dates: string[] = [];
  for (let date = startDate; date < endDate; date = addDays(date, 1)) {
    dates.push(date);
  }

  return dates;
}

function getFinalLeaveDate(legs: TripLegRecord[]) {
  return legs
    .map((leg) => leg.leaveDate)
    .filter(isIsoDate)
    .sort()
    .at(-1) ?? null;
}

function createTripRecord({
  draft,
  fallbackTripName,
  tripId,
}: {
  draft: unknown;
  fallbackTripName: string;
  tripId: string;
}): TripSummaryRecord {
  const overview = getObject(draft, "tripOverview");
  const title = getString(overview, "title") ?? fallbackTripName;
  const dateRange = getString(overview, "dateRange");

  return {
    destinationSummary: getString(overview, "destinationSummary"),
    endDate: null,
    id: tripId,
    name: fallbackTripName,
    startDate: null,
    travelerAppTitle: title,
  };
}

function createLegRecords({
  draft,
  tripId,
}: {
  draft: unknown;
  tripId: string;
}): TripLegRecord[] {
  return getArray(draft, "places").map((item, index) => {
    const place = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const city = getString(place, "city") ?? `Stop ${index + 1}`;
    const country = getString(place, "country");
    const key = slugify([city, country].filter(Boolean).join("-"));

    return {
      arriveDate: getString(place, "arriveDate"),
      city,
      country,
      displayName: city,
      id: `${tripId}-leg-${key}-${index + 1}`,
      language: null,
      latitude: null,
      leaveDate: getString(place, "leaveDate"),
      legKey: key,
      longitude: null,
      region: null,
      reviewRequired: false,
      sortOrder: index,
      sourceConfidence: "medium",
      status: "draft",
      summary: null,
      timezone: null,
      tripId,
    };
  });
}

function findLegForDate(legs: TripLegRecord[], date: string | null) {
  if (!date) {
    return null;
  }

  return (
    legs.find(
      (leg) =>
        leg.arriveDate &&
        leg.leaveDate &&
        date >= leg.arriveDate &&
        date < leg.leaveDate
    ) ?? legs.find((leg) => leg.arriveDate === date) ?? null
  );
}

function createStayRecords({
  draft,
  legs,
  tripId,
}: {
  draft: unknown;
  legs: TripLegRecord[];
  tripId: string;
}): TripStayRecord[] {
  return getArray(draft, "stays").map((item, index) => {
    const stay = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const fallbackName = getString(stay, "name") ?? `Stay ${index + 1}`;
    const name =
      getStayNameGuess({ draft, fallbackName }) ?? fallbackName;
    const nights = getNumber(stay, "nights");
    const rawCheckOut = getString(stay, "checkOut");
    const checkIn =
      getString(stay, "checkIn") ??
      getString(stay, "firstNightDate") ??
      (rawCheckOut && nights && nights > 0 ? subtractDays(rawCheckOut, nights) : null);
    const checkOut =
      rawCheckOut ??
      (checkIn && nights && nights > 0 ? addDays(checkIn, nights) : null);
    const leg = findLegForDate(legs, checkIn);

    return {
      accessDetailsVisibility: "traveler_password",
      address: getString(stay, "address"),
      addressVisibility: shouldProtectStayAddress({ address: getString(stay, "address"), name })
        ? "traveler_password"
        : "public",
      bookingUrl: null,
      checkInDate: checkIn,
      checkInTime: getString(stay, "checkInTime"),
      checkOutDate: checkOut,
      checkOutTime: getString(stay, "checkOutTime"),
      confirmationLabel: null,
      confirmationVisibility: "traveler_password",
      id: `${tripId}-stay-${slugify(name)}-${index + 1}`,
      latitude: null,
      legId: leg?.id ?? null,
      longitude: null,
      name,
      privateDetailIds: [],
      publicLocationLabel: leg?.displayName ?? null,
      reviewRequired: !checkIn,
      sourceConfidence: "medium",
      status: "draft",
      stayType: null,
      tripId,
    };
  });
}

function createTransportRecords({
  draft,
  legs,
  tripId,
}: {
  draft: unknown;
  legs: TripLegRecord[];
  tripId: string;
}): TripTransportRecord[] {
  return getArray(draft, "transport").map((item, index) => {
    const transport = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = getString(transport, "title") ?? `Transport ${index + 1}`;
    const date = getString(transport, "date");
    const leg = findLegForDate(legs, date);

    return {
      arrivalLocation: getString(transport, "arrival"),
      arrivalTime: null,
      bookingUrl: null,
      bookingUrlVisibility: "traveler_password",
      confirmationLabel: getString(transport, "confirmation"),
      confirmationVisibility: getString(transport, "confirmation")
        ? "traveler_password"
        : "public",
      date,
      departureLocation: getString(transport, "departure"),
      departureTime: null,
      description: null,
      fromLegId: null,
      id: `${tripId}-transport-${slugify(title)}-${index + 1}`,
      legId: leg?.id ?? null,
      privateDetailIds: [],
      provider: getString(transport, "provider"),
      reviewRequired: !date,
      routeLabel: title,
      sourceConfidence: "medium",
      status: "draft",
      toLegId: null,
      transportType: normalizeTransportType(getString(transport, "type")),
      tripId,
    };
  });
}

function createItemRecords({
  draft,
  legs,
  tripId,
}: {
  draft: unknown;
  legs: TripLegRecord[];
  tripId: string;
}): TripItemRecord[] {
  return getArray(draft, "activities").map((item, index) => {
    const activity = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = getString(activity, "title") ?? `Activity ${index + 1}`;
    const description = getString(activity, "description");
    const date = getString(activity, "date");
    const leg = findLegForDate(legs, date);
    const itemType = normalizeItemType(
      getString(activity, "itemType"),
      title,
      description
    );
    const categoryId = normalizeCategoryId({
      category: getString(activity, "category"),
      description,
      itemType,
      title,
    });

    return {
      address: getString(activity, "address"),
      categoryId,
      date,
      description,
      endTime: getString(activity, "endTime"),
      id: `${tripId}-item-${slugify(title)}-${index + 1}`,
      itemType,
      latitude: null,
      legId: leg?.id ?? null,
      locationName: null,
      longitude: null,
      parentItemId: null,
      reviewRequired: !date,
      sortOrder: index,
      sourceConfidence: "medium",
      startTime: getString(activity, "startTime"),
      status: !date ? "needs_review" : "draft",
      summary: null,
      title,
      tripId,
      url: null,
    };
  });
}

function hasStayCheckInCard({
  items,
  stay,
}: {
  items: TripItemRecord[];
  stay: TripStayRecord;
}) {
  const stayName = normalizeText(stay.name);

  return items.some((item) => {
    if (item.date !== stay.checkInDate) {
      return false;
    }

    const text = normalizeText(
      [item.title, item.description, item.locationName].filter(Boolean).join(" ")
    );

    return (
      /\b(check in|check out|drop bags|bag drop|bags)\b/.test(text) &&
      (!stayName || text.includes(stayName) || stayName.includes(text))
    );
  });
}

function createStayCheckInItemRecords({
  items,
  stays,
  tripId,
}: {
  items: TripItemRecord[];
  stays: TripStayRecord[];
  tripId: string;
}): TripItemRecord[] {
  return stays.flatMap((stay, index): TripItemRecord[] => {
    if (!stay.checkInDate || hasStayCheckInCard({ items, stay })) {
      return [];
    }

    const title = `Check in: ${stay.name}`;
    const descriptionParts = [
      stay.checkInTime ? `Check-in time: ${stay.checkInTime}.` : null,
      stay.publicLocationLabel ? `Stay area: ${stay.publicLocationLabel}.` : null,
      stay.address && stay.addressVisibility === "public"
        ? `Address: ${stay.address}.`
        : null,
      stay.address && stay.addressVisibility !== "public"
        ? "Exact address is saved with protected stay details."
        : null,
    ];

    return [
      {
        address: stay.addressVisibility === "public" ? stay.address : null,
        categoryId: "arrival_departure",
        date: stay.checkInDate,
        description: descriptionParts.filter(Boolean).join(" ") || null,
        endTime: null,
        id: `${stay.id}-check-in-card`,
        itemType: "admin",
        latitude: null,
        legId: stay.legId,
        locationName: stay.name,
        longitude: null,
        parentItemId: null,
        reviewRequired: false,
        sortOrder: items.length + index,
        sourceConfidence: stay.sourceConfidence,
        startTime: stay.checkInTime,
        status: "draft",
        summary: null,
        title,
        tripId,
        url: null,
      },
    ];
  });
}

function createCategoryRecords({
  items,
  tripId,
}: {
  items: TripItemRecord[];
  tripId: string;
}): TripCategoryRecord[] {
  const keys = Array.from(new Set(items.map((item) => item.categoryId)));

  return keys.map((key, index) => ({
    categoryKey: key,
    description: getTripCategoryLabel(key),
    emoji: getTripCategoryEmoji(key),
    enabled: true,
    icon: null,
    id: key,
    label: getTripCategoryLabel(key),
    sortOrder: index,
    tripId,
  }));
}

function createPrivateDetailRecords({
  draft,
  stays,
  transport,
  tripId,
}: {
  draft: unknown;
  stays: TripStayRecord[];
  transport: TripTransportRecord[];
  tripId: string;
}): TripPrivateDetailRecord[] {
  const stayDetails = stays
    .filter((stay) => shouldProtectStayAddress(stay))
    .map((stay) => ({
      detailType: "private_address",
      id: `${stay.id}-address`,
      label: "Exact stay address",
      reason: "Exact private rental and residence addresses should default behind traveler mode.",
      reviewRequired: false,
      sourceConfidence: "medium" as const,
      subjectId: stay.id,
      subjectType: "stay" as const,
      tripId,
      value: stay.address ?? "",
      visibility: "traveler_password" as const,
    }));

  const transportDetails = transport
    .filter((item) => item.confirmationLabel)
    .map((item) => ({
      detailType: "confirmation_number",
      id: `${item.id}-confirmation`,
      label: "Confirmation",
      reason: "Booking references should default behind traveler mode.",
      reviewRequired: false,
      sourceConfidence: "medium" as const,
      subjectId: item.id,
      subjectType: "transport" as const,
      tripId,
      value: item.confirmationLabel ?? "",
      visibility: "traveler_password" as const,
    }));

  const sensitive = getArray(draft, "sensitiveDetails").flatMap((item, index) => {
    const detail = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const title = getString(detail, "title") ?? `Sensitive detail ${index + 1}`;
    const detailType = getString(detail, "detailType") ?? "sensitive_detail";
    const reason = getString(detail, "reason");

    if (
      isPublicVenueAddressDetail({ detailType, title }) ||
      !isActionableSensitiveDetail({ detailType, reason, title })
    ) {
      return [];
    }

    return [{
      detailType,
      id: `${tripId}-sensitive-${index + 1}`,
      label: title,
      reason,
      reviewRequired: true,
      sourceConfidence: "medium" as const,
      subjectId: tripId,
      subjectType: "leg" as const,
      tripId,
      value: title,
      visibility: "traveler_password" as const,
    }];
  });

  return [...stayDetails, ...transportDetails, ...sensitive];
}

function createDayRecords({
  items,
  legs,
  transport,
  tripId,
}: {
  items: TripItemRecord[];
  legs: TripLegRecord[];
  transport: TripTransportRecord[];
  tripId: string;
}): StructuredTripRecords["days"] {
  const finalLeaveDate = getFinalLeaveDate(legs);
  const dates = Array.from(
    new Set(
      [
        ...items.map((item) => item.date),
        ...transport.map((item) => item.date),
        finalLeaveDate,
        ...legs.flatMap((leg) =>
          datesBetweenExclusiveEnd(leg.arriveDate, leg.leaveDate)
        ),
      ].filter(Boolean) as string[]
    )
  ).sort();

  return dates.map((date, index) => {
    const legIds = legs
      .filter(
        (leg) =>
          (leg.arriveDate && leg.leaveDate && date >= leg.arriveDate && date < leg.leaveDate) ||
          leg.arriveDate === date ||
          (leg.leaveDate === date && leg.leaveDate === finalLeaveDate)
      )
      .map((leg) => leg.id);
    const dayItems = items.filter((item) => item.date === date);

    return {
      date,
      dayNumber: index + 1,
      id: `${tripId}-day-${date}`,
      legIds,
      primaryLegId: legIds[0] ?? null,
      reviewRequired: dayItems.some((item) => item.reviewRequired),
      sortOrder: index,
      sourceConfidence: "medium",
      status: "draft",
      summary: null,
      title: `Day ${index + 1}`,
      tripId,
    };
  });
}

function createReviewQuestions({
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

  function shouldTreatAsNote({
    answerType,
    confidence,
    evidence,
    guessedValue,
    prompt,
    reason,
    subjectId,
    subjectType,
    targetField,
  }: {
    answerType: TripReviewQuestionRecord["answerType"];
    confidence: TripSourceConfidence;
    evidence: string | null;
    guessedValue: string | null;
    prompt: string | null;
    reason: string | null;
    subjectId: string | null;
    subjectType: TripReviewQuestionRecord["subjectType"];
    targetField: string | null;
  }) {
    const normalizedTarget = targetField?.toLowerCase() ?? "";

    if (
      normalizedTarget.includes("visibility") ||
      normalizedTarget.includes("confirmation")
    ) {
      return true;
    }

    if (subjectType === "trip" && guessedValue) {
      return true;
    }

    if (
      subjectType === "stay" &&
      guessedValue &&
      (normalizedTarget.includes("title") ||
        normalizedTarget.includes("name") ||
        normalizedTarget.includes("date"))
    ) {
      return true;
    }

    if (answerType === "confirm" && guessedValue && confidence === "high") {
      return true;
    }

    if (
      guessedValue &&
      getTargetValue({ subjectId, subjectType, targetField })
    ) {
      if (
        isCorePlanningTarget({ subjectType, targetField }) &&
        confidence !== "high" &&
        !hasHumanConfidentEvidence(prompt, reason, evidence)
      ) {
        return false;
      }

      return true;
    }

    return false;
  }

  const findSubjectId = (
    subjectType: TripReviewQuestionRecord["subjectType"],
    relatedTitle: string | null
  ) => {
    if (!relatedTitle) {
      return null;
    }

    const normalized = relatedTitle.toLowerCase();

    if (subjectType === "item") {
      return (
        items.find((item) => item.title.toLowerCase() === normalized)?.id ??
        items.find((item) => item.title.toLowerCase().includes(normalized))?.id ??
        null
      );
    }

    if (subjectType === "stay") {
      return (
        stays.find((stay) => stay.name.toLowerCase() === normalized)?.id ??
        stays.find((stay) => stay.name.toLowerCase().includes(normalized))?.id ??
        null
      );
    }

    if (subjectType === "transport") {
      return (
        transport.find((item) => item.routeLabel.toLowerCase() === normalized)?.id ??
        transport.find((item) => item.routeLabel.toLowerCase().includes(normalized))?.id ??
        null
      );
    }

    if (subjectType === "leg") {
      return (
        legs.find((leg) => leg.displayName.toLowerCase() === normalized)?.id ??
        legs.find((leg) => leg.displayName.toLowerCase().includes(normalized))?.id ??
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
    const subjectType = getReviewSubjectType(getString(detail, "subjectType"));
    const subjectId = findSubjectId(subjectType, relatedTitle);
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
      hasUsableAnchor: hasUsableSubjectAnchor({ subjectId, subjectType }),
      prompt,
      reason,
      subjectId,
      subjectType,
      targetField,
    });

    const status: TripReviewQuestionRecord["status"] = isObviousFactCall({
      confidence,
      evidence,
      guessedValue,
      prompt,
      reason,
      subjectId,
    })
      ? "dismissed"
      : isPrivacyPolicyQuestion({
        prompt,
        reason,
        subjectType,
        targetField,
      })
        ? "dismissed"
      : dismissOptionalDetail && !isExplicitSourceTodo
        ? "dismissed"
        : shouldTreatAsNote({
        answerType,
        confidence,
        evidence,
        guessedValue,
        prompt,
        reason,
        subjectId,
        subjectType,
        targetField,
      })
      ? "noted"
      : "open";

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
          "The itinerary itself marks this activity detail as undecided, so Roamwoven will keep the card and ask once here.",
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

  return [...draftQuestions, ...explicitTodoQuestions].filter((question, index, questions) => {
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

function createWeatherHooks({
  days,
  legs,
  tripId,
}: {
  days: StructuredTripRecords["days"];
  legs: TripLegRecord[];
  tripId: string;
}): TripWeatherHookRecord[] {
  return days.map((day) => {
    const leg = legs.find((item) => item.id === day.primaryLegId);

    return {
      date: day.date,
      enabled: Boolean(leg),
      id: `${day.id}-weather`,
      latitude: leg?.latitude ?? null,
      legId: day.primaryLegId,
      locationLabel: leg?.displayName ?? "Trip stop",
      longitude: leg?.longitude ?? null,
      source: leg?.latitude && leg.longitude ? "coordinates" : "city_country",
      timezone: leg?.timezone ?? null,
      tripId,
    };
  });
}

export function createStructuredTripRecordsFromDraft({
  draft,
  fallbackTripName,
  tripId,
}: {
  draft: unknown;
  fallbackTripName: string;
  tripId: string;
}): StructuredTripRecords {
  const trip = createTripRecord({ draft, fallbackTripName, tripId });
  const legs = createLegRecords({ draft, tripId });
  const stays = createStayRecords({ draft, legs, tripId });
  const transport = createTransportRecords({ draft, legs, tripId });
  const extractedItems = createItemRecords({ draft, legs, tripId });
  const items = [
    ...extractedItems,
    ...createStayCheckInItemRecords({
      items: extractedItems,
      stays,
      tripId,
    }),
  ];
  const categories = createCategoryRecords({ items, tripId });
  const privateDetails = createPrivateDetailRecords({
    draft,
    stays,
    transport,
    tripId,
  });
  const days = createDayRecords({ items, legs, transport, tripId });
  const weatherHooks = createWeatherHooks({ days, legs, tripId });

  return {
    categories,
    days,
    items,
    legs,
    photos: [],
    phrases: [],
    privateDetails,
    reviewQuestions: createReviewQuestions({
      draft,
      items,
      legs,
      stays,
      tripId,
      transport,
    }),
    stays,
    transport,
    trip,
    weatherHooks,
  };
}
