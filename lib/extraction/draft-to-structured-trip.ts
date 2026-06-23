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

function getStringFromKeys(value: DraftObject | null, keys: string[]) {
  for (const key of keys) {
    const child = getString(value, key);

    if (child) {
      return child;
    }
  }

  return null;
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
  const target = targetField?.toLowerCase().split("/").pop() ?? "";
  const text = [prompt, reason, targetField].filter(Boolean).join(" ").toLowerCase();
  const hasTextualTransportAnchor =
    subjectType === "transport" &&
    /\b(address|airport|confirmation|location|pickup|pick up|reservation|route|station|\d{1,2}\s*(am|pm))\b/.test(
      text
    );

  const optionalLabelPattern =
    /\b(address|company|location|name|operator|provider|title|url|website)\b/;
  const materialGapPattern =
    /\b(cannot|can't|critical|essential|material|required|unusable|where)\b|not identifiable|hard to identify|can't identify|cannot identify/;

  if (
    (!subjectId && !hasTextualTransportAnchor) ||
    (!hasUsableAnchor && !hasTextualTransportAnchor) ||
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

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "record";
}

function normalizeTransportType(value: string | null): TripTransportType {
  if (
    value === "flight" ||
    value === "train" ||
    value === "ferry" ||
    value === "rental_car" ||
    value === "bus" ||
    value === "drive"
  ) {
    return value;
  }

  if (value === "car") {
    return "rental_car";
  }

  if (value === "transfer") {
    return "transfer";
  }

  return "other";
}

function cleanTransportDescription(value: string | null) {
  const description = cleanTravelerText(value);

  if (!description) {
    return null;
  }

  const segments = description
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return description;
  }

  const transportDetailPattern =
    /\b(arrival|arrive|arrives|bag|bags|boarding|bus|car|check[-\s]?in|coach|confirmation|depart|departs|departure|driver|drop[-\s]?off|duration|ferry|flight|gate|land|lands|leave|leaves|luggage|operator|pickup|pick[-\s]?up|platform|provider|rail|reservation|route|seat|station|terminal|ticket|train|transfer|voucher)\b/i;
  const destinationPlanPattern =
    /\b(after arrival|bar|breakfast|cafe|café|cathedral|church|city plans?|dinner|food|gallery|lunch|museum|palace|plans? for|restaurant|shopping|sightseeing|tour|visit|walk|walking)\b/i;
  const kept = segments.filter(
    (segment) =>
      transportDetailPattern.test(segment) ||
      !destinationPlanPattern.test(segment)
  );

  return kept.length > 0 ? kept.join(" ") : description;
}

function isRedundantLocalAirportTransfer({
  arrival,
  departure,
  description,
  provider,
  title,
  transportType,
}: {
  arrival: string | null;
  departure: string | null;
  description: string | null;
  provider: string | null;
  title: string;
  transportType: TripTransportType;
}) {
  const text = normalizeText(
    [title, description, departure, arrival, provider].filter(Boolean).join(" ")
  );

  if (!text.includes("airport")) {
    return false;
  }

  if (
    /\b(confirmation|driver|private transfer|reservation|reserved|shuttle|ticket|voucher)\b/.test(
      text
    )
  ) {
    return false;
  }

  return (
    transportType === "transfer" ||
    /\b(leave for airport|move to airport|public transport|take public transport|taxi to airport|airport transfer|go to airport|wake.*airport)\b/.test(
      text
    )
  ) && /\b(before|flight|fly|depart|departure|ryanair|delta|airport)\b/.test(text);
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

  if (/\b(check[-\s]?in|check[-\s]?out|drop bags?|bag drop|arrival|departure|airport|station|flight|land|lands|pickup|pick[-\s]?up|drop[-\s]?off|rental car)\b/.test(text)) {
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

function formatReadableDate(year: string, month: string, day: string) {
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

function formatReadableIsoDate(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value ?? "";
  }

  return formatReadableDate(match[1], match[2], match[3]);
}

function cleanTravelerText(value: string | null) {
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

function findLegForText(
  legs: TripLegRecord[],
  title: string,
  description: string | null
) {
  const text = normalizeText([title, description].filter(Boolean).join(" "));

  if (!text) {
    return null;
  }

  return (
    legs.find((leg) =>
      [leg.displayName, leg.city, leg.country]
        .filter(Boolean)
        .some((value) => {
          const normalized = normalizeText(value ?? null);
          return Boolean(normalized) && text.includes(normalized);
        })
    ) ?? null
  );
}

function isCityTipCandidate({
  category,
  date,
  description,
  itemType,
  startTime,
  title,
}: {
  category: string | null;
  date: string | null;
  description: string | null;
  itemType: TripItemType;
  startTime: string | null;
  title: string;
}) {
  const text = normalizeText([title, description].filter(Boolean).join(" "));

  if (!text || startTime) {
    return false;
  }

  if (
    /\b(reservation|reserved|booked|booking|ticket|tickets|tour|timed|meet|pickup|pick up|at \d{1,2})\b/.test(
      text
    )
  ) {
    return false;
  }

  const normalizedCategory = normalizeText(category);
  const genericTipHeader =
    /\b(eat|food|where to eat|food list|restaurant list|restaurants to consider|cafes to consider|bars to consider|beer halls to consider|check out foods like|good beer halls|beer halls are|food options|drink options|shopping ideas|local tips?)\b/.test(
      text
    );
  const daySpecificCluster =
    /\b(first[-\s]?day|second[-\s]?day|third[-\s]?day|day \d+|for the .* day|morning|afternoon|evening)\b/.test(
      text
    );

  if (
    date &&
    daySpecificCluster &&
    !genericTipHeader &&
    normalizedCategory !== "food dining" &&
    normalizedCategory !== "food_dining" &&
    normalizedCategory !== "shopping tailor" &&
    normalizedCategory !== "shopping_tailor"
  ) {
    return false;
  }

  return (
    /\b(tips?|ideas?|recommendations?|eat|food|where to eat|food list|restaurant list|restaurants to consider|cafes to consider|bars to consider|beer halls to consider|check out foods like|good beer halls|beer halls are|food options|drink options|shopping ideas|local tips?)\b/.test(
      text
    ) &&
    /\b(city|food|eat|restaurant|cafe|cafes|coffee|bar|bars|beer|hall|halls|drink|shop|shopping|local)\b/.test(
      text
    )
  );
}

function isFullDayOverviewCandidate({
  description,
  endTime,
  itemType,
  startTime,
  title,
}: {
  description: string | null;
  endTime: string | null;
  itemType: TripItemType;
  startTime: string | null;
  title: string;
}) {
  if (itemType === "note" || startTime || endTime) {
    return false;
  }

  const titleText = normalizeText(title);
  const text = normalizeText([title, description].filter(Boolean).join(" "));

  if (!text) {
    return false;
  }

  const explicitDayOnlyTitle =
    /^day\s*\d+\s*[:.-]?\s*(overview|summary|plan|itinerary|agenda)?$/.test(
      titleText
    );
  const overviewTitle =
    explicitDayOnlyTitle ||
    /\b(day overview|today overview|full[-\s]?day overview|overview of the day|daily summary|day summary)\b/.test(
      titleText
    );
  const listLikeDescription =
    (description?.split(/,|;|\band\b|->|-/).filter((part) => part.trim().length > 4)
      .length ?? 0) >= 3;
  const materialStandaloneSignal =
    /\b(reservation|reserved|booked|booking|ticket|tickets|entry|timed|tour|guided|confirmation)\b/.test(
      text
    );

  return overviewTitle && listLikeDescription && !materialStandaloneSignal;
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

function getStayDateGuess({
  dateKind,
  draft,
  stayName,
}: {
  dateKind: "checkIn" | "checkOut";
  draft: unknown;
  stayName: string;
}) {
  const normalizedName = normalizeText(stayName);
  const targetPatterns =
    dateKind === "checkIn"
      ? ["checkin", "check in", "check-in", "checkindate", "start"]
      : ["checkout", "check out", "check-out", "checkoutdate", "leave"];
  const candidates = getArray(draft, "missingDetails")
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as DraftObject)
        : null
    )
    .filter((item): item is DraftObject => Boolean(item))
    .filter((item) => {
      const subjectType = getString(item, "subjectType");
      const guessedValue = getString(item, "guessedValue");
      const targetField = normalizeText(getString(item, "targetField"));
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
        subjectType === "stay" &&
        isIsoDate(guessedValue) &&
        targetPatterns.some(
          (pattern) => targetField.includes(pattern) || text.includes(pattern)
        )
      );
    });

  const matchingCandidate = candidates.find((item) => {
    const relatedTitle = normalizeText(getString(item, "relatedTitle"));
    const prompt = normalizeText(getString(item, "prompt"));
    const reason = normalizeText(getString(item, "reason"));

    return (
      Boolean(normalizedName) &&
      ((Boolean(relatedTitle) &&
        (relatedTitle.includes(normalizedName) ||
          normalizedName.includes(relatedTitle))) ||
        prompt.includes(normalizedName) ||
        reason.includes(normalizedName))
    );
  });

  return getString(matchingCandidate ?? null, "guessedValue");
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
  const places = getArray(draft, "places");

  return places.map((item, index) => {
    const place = item && typeof item === "object" && !Array.isArray(item)
      ? (item as DraftObject)
      : {};
    const nextPlace = places[index + 1];
    const nextPlaceObject =
      nextPlace && typeof nextPlace === "object" && !Array.isArray(nextPlace)
        ? (nextPlace as DraftObject)
        : null;
    const city = getString(place, "city") ?? `Stop ${index + 1}`;
    const country = getString(place, "country");
    const key = slugify([city, country].filter(Boolean).join("-"));
    const arriveDate = getString(place, "arriveDate");
    const explicitLeaveDate = getString(place, "leaveDate");
    const nextArriveDate = getString(nextPlaceObject, "arriveDate");
    const leaveDate =
      explicitLeaveDate ??
      (arriveDate && nextArriveDate && nextArriveDate > arriveDate
        ? nextArriveDate
        : null);

    return {
      arriveDate,
      city,
      country,
      displayName: city,
      id: `${tripId}-leg-${key}-${index + 1}`,
      language: null,
      latitude: null,
      leaveDate,
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
    const guessedCheckIn = getStayDateGuess({
      dateKind: "checkIn",
      draft,
      stayName: name,
    });
    const guessedCheckOut = getStayDateGuess({
      dateKind: "checkOut",
      draft,
      stayName: name,
    });
    const checkIn =
      getString(stay, "checkIn") ??
      getString(stay, "firstNightDate") ??
      (rawCheckOut && nights && nights > 0 ? subtractDays(rawCheckOut, nights) : null) ??
      guessedCheckIn;
    const leg = findLegForDate(legs, checkIn);
    const inferredCheckOut =
      checkIn && leg?.leaveDate && leg.leaveDate > checkIn
        ? leg.leaveDate
        : null;
    const checkOut =
      rawCheckOut ??
      (checkIn && nights && nights > 0 ? addDays(checkIn, nights) : null) ??
      guessedCheckOut ??
      inferredCheckOut;

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
    const title =
      cleanTravelerText(getString(transport, "title")) ?? `Transport ${index + 1}`;
    const date = getString(transport, "date");
    const leg = findLegForDate(legs, date);
    const description = cleanTransportDescription(
      getString(transport, "description")
    );
    const transportType = normalizeTransportType(getString(transport, "type"));
    const departure = getString(transport, "departure");
    const arrival = getString(transport, "arrival");
    const provider = getString(transport, "provider");
    const redundantLocalAirportTransfer = isRedundantLocalAirportTransfer({
      arrival,
      departure,
      description,
      provider,
      title,
      transportType,
    });

    return {
      arrivalLocation: arrival,
      arrivalTime: getStringFromKeys(transport, ["arrivalTime", "endTime"]),
      bookingUrl: null,
      bookingUrlVisibility: "traveler_password",
      confirmationLabel: getString(transport, "confirmation"),
      confirmationVisibility: getString(transport, "confirmation")
        ? "traveler_password"
        : "public",
      date,
      departureLocation: departure,
      departureTime: getStringFromKeys(transport, [
        "departureTime",
        "startTime",
        "time",
      ]),
      description,
      fromLegId: null,
      id: `${tripId}-transport-${slugify(title)}-${index + 1}`,
      legId: leg?.id ?? null,
      privateDetailIds: [],
      provider,
      reviewRequired: redundantLocalAirportTransfer ? false : !date,
      routeLabel: title,
      sourceConfidence: "medium",
      status: redundantLocalAirportTransfer ? "ignored" : "draft",
      toLegId: null,
      transportType,
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
    const title =
      cleanTravelerText(getString(activity, "title")) ?? `Activity ${index + 1}`;
    const description = cleanTravelerText(getString(activity, "description"));
    const date = getString(activity, "date");
    const originalItemType = normalizeItemType(
      getString(activity, "itemType"),
      title,
      description
    );
    const startTime = getString(activity, "startTime");
    const endTime = getString(activity, "endTime");
    const sourceCategory = getString(activity, "category");
    const cityTipCandidate = isCityTipCandidate({
      category: sourceCategory,
      date,
      description,
      itemType: originalItemType,
      startTime,
      title,
    });
    const candidateLeg =
      findLegForDate(legs, date) ?? findLegForText(legs, title, description);
    const cityTip = cityTipCandidate && Boolean(candidateLeg);
    const itemType = cityTip ? "note" : originalItemType;
    const fullDayOverview = isFullDayOverviewCandidate({
      description,
      endTime,
      itemType,
      startTime,
      title,
    });
    const finalDate = cityTip ? null : date;
    const leg = candidateLeg;
    const categoryId = normalizeCategoryId({
      category: sourceCategory,
      description,
      itemType,
      title,
    });

    return {
      address: getString(activity, "address"),
      categoryId,
      date: finalDate,
      description,
      endTime,
      id: `${tripId}-item-${slugify(title)}-${index + 1}`,
      itemType,
      latitude: null,
      legId: leg?.id ?? null,
      locationName: null,
      longitude: null,
      parentItemId: null,
      reviewRequired: cityTip ? false : !finalDate && !fullDayOverview,
      sortOrder: index,
      sourceConfidence: "medium",
      startTime,
      status: fullDayOverview
        ? "ignored"
        : !finalDate && !cityTip
          ? "needs_review"
          : "draft",
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
  const lodgingArrivalPattern =
    /\b(arrive|arrival|check in)\b/;
  const lodgingPlacePattern =
    /\b(airbnb|apartment|flat|hostel|hotel|inn|lodging|rental|stay)\b/;

  return items.some((item) => {
    if (item.date !== stay.checkInDate) {
      return false;
    }

    const text = normalizeText(
      [item.title, item.description, item.locationName].filter(Boolean).join(" ")
    );

    return (
      lodgingArrivalPattern.test(text) &&
      (!stayName ||
        text.includes(stayName) ||
        stayName.includes(text) ||
        lodgingPlacePattern.test(text))
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

  function isStatementStyleCall({
    answerType,
    guessedValue,
    prompt,
  }: {
    answerType: TripReviewQuestionRecord["answerType"];
    guessedValue: string | null;
    prompt: string | null;
  }) {
    if (!guessedValue || !prompt || /\?\s*$/.test(prompt.trim())) {
      return false;
    }

    const normalizedPrompt = normalizeText(prompt);

    return (
      answerType === "confirm" ||
      /\b(appears|assumed|classified|kept|mapped|placed|set|split|treated|used)\b/.test(
        normalizedPrompt
      )
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
      isQuestionShapedPrompt(prompt) &&
      !(confidence === "high" && isLegacyConfirmableCallPrompt(prompt))
    ) {
      return false;
    }

    if (
      normalizedTarget.includes("visibility") ||
      normalizedTarget.includes("confirmation")
    ) {
      return true;
    }

    if (subjectType === "trip" && guessedValue) {
      return true;
    }

    if (isStatementStyleCall({ answerType, guessedValue, prompt })) {
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
    const dismissRoutineTransportDetail = isRoutineTransportExtractionDetail({
      evidence,
      hasUsableAnchor: hasUsableSubjectAnchor({ subjectId, subjectType }),
      prompt,
      reason,
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
      targetField,
    })
      ? "dismissed"
      : isPrivacyPolicyQuestion({
        prompt,
        reason,
        subjectType,
        targetField,
      })
        ? "dismissed"
      : dismissRoutineTransportDetail
        ? "dismissed"
      : dismissOptionalDetail && !isExplicitSourceTodo
        ? "dismissed"
        : isExplicitSourceTodo
          ? "open"
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

  return [...draftQuestions, ...inferredStayCheckOutQuestions, ...explicitTodoQuestions].filter((question, index, questions) => {
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
