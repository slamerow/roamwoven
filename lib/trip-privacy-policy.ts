import type { TripPrivateDetailVisibility } from "@/lib/generated-trip-model";

export type SensitiveDetailKind =
  | "booking_control"
  | "private_access"
  | "private_contact"
  | "private_residence"
  | "personal_safety";

export type SensitiveDetailClassification = {
  kind: SensitiveDetailKind;
  label: string;
  reason: string;
};

type SensitivityRule = {
  kind: SensitiveDetailKind;
  label: string;
  reason: string;
  patterns: RegExp[];
};

const publicVenuePattern =
  /\b(airport|arena|attraction|bar|basilica|bistro|boutique|cafe|café|cathedral|church|gallery|jewelry|jewellery|landmark|market|memorial|museum|palace|park|pub|restaurant|retail|shop|shopping|showroom|station|store|temple|theater|theatre|venue)\b/i;

const commercialStayPattern =
  /\b(hotel|hostel|inn|lodge|motel|resort)\b/i;

const privateLodgingPattern =
  /\b(airbnb|apartment|b&b|bed and breakfast|bnb|condo|flat|home|house|private lodging|private rental|rental|residence|stay with|vacation rental|villa|vrbo)\b/i;

const privateControlPattern =
  /\b(access|booking|codes?|confirmation|door[_\s-]?codes?|gate[_\s-]?codes?|keypad|lock|lockbox|password|pin|room|reservation|ticket|wifi|wi-fi)\b/i;

const publicContactContextPattern =
  /\b(box office|front desk|main line|official|public contact|reception|restaurant phone|shop phone|ticket office|venue phone)\b/i;

const privateContactContextPattern =
  /\b(airbnb|emergency|family|friend|guest|host|owner|personal|private|rental|residence)\b/i;

const logisticsPattern =
  /\b(arrival|bus|car|drive|drop[-\s]?off|ferry|flight|parking|pickup|pick[-\s]?up|rental car|station|taxi|train|transfer|transport)\b/i;

const sensitivityRules: SensitivityRule[] = [
  {
    kind: "private_access",
    label: "Private access detail",
    reason: "Codes and access instructions should stay behind the trip password.",
    patterns: [
      /\bdoor code\b/i,
      /\bdoor[_\s-]?codes?\b/i,
      /\bgate code\b/i,
      /\bgate[_\s-]?codes?\b/i,
      /\blockbox\b/i,
      /\bkeypad\b/i,
      /\bentry code\b/i,
      /\bentry[_\s-]?codes?\b/i,
      /\baccess code\b/i,
      /\baccess[_\s-]?(codes?|details?|instructions?)\b/i,
      /\bwi-?fi\b/i,
      /\bpassword\b/i,
    ],
  },
  {
    kind: "booking_control",
    label: "Booking detail",
    reason: "Confirmation and booking references can control reservations.",
    patterns: [
      /\bconfirmation\b/i,
      /\bbooking reference\b/i,
      /\bbooking ref\b/i,
      /\bmanage booking\b/i,
      /\breservation (number|code|reference)\b/i,
      /\bticket number\b/i,
      /\brecord locator\b/i,
      /\bpnr\b/i,
    ],
  },
  {
    kind: "private_contact",
    label: "Private contact",
    reason: "Host and personal contact details should stay behind traveler mode.",
    patterns: [
      /\bhost\b/i,
      /\bowner\b/i,
      /\bpersonal contact\b/i,
      /\bphone\b/i,
      /\bcall\b/i,
      /\btext\b/i,
      /\bemail\b/i,
      /\b\+?\d[\d\s().-]{8,}\d\b/,
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    ],
  },
  {
    kind: "personal_safety",
    label: "Personal note",
    reason:
      "Personal, medical, child, or family logistics should stay behind traveler mode.",
    patterns: [
      /\bpassport\b/i,
      /\bmedical\b/i,
      /\bmedicine\b/i,
      /\bmeds\b/i,
      /\ballerg/i,
      /\bchild\b/i,
      /\btoddler\b/i,
      /\bbaby\b/i,
      /\bprivate note\b/i,
    ],
  },
];

const privateResidenceClassification: SensitiveDetailClassification = {
  kind: "private_residence",
  label: "Private lodging detail",
  reason:
    "Exact private lodging and residence addresses should stay behind the trip password.",
};

function normalizedText(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function isPrivateLodgingContext(value: string | null | undefined) {
  const text = value?.trim();
  return Boolean(text && privateLodgingPattern.test(text));
}

export function isPublicVenueContext(value: string | null | undefined) {
  const text = value?.trim();

  if (!text) {
    return false;
  }

  return publicVenuePattern.test(text) || commercialStayPattern.test(text);
}

function isPublicBusinessContactText(text: string) {
  return (
    (isPublicVenueContext(text) || publicContactContextPattern.test(text)) &&
    !privateContactContextPattern.test(text) &&
    !privateControlPattern.test(text)
  );
}

export function classifySensitiveText(
  value: string | null | undefined
): SensitiveDetailClassification | null {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  for (const rule of sensitivityRules) {
    if (rule.kind === "private_contact" && isPublicBusinessContactText(text)) {
      continue;
    }

    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return {
        kind: rule.kind,
        label: rule.label,
        reason: rule.reason,
      };
    }
  }

  return null;
}

export function classifyAddressSensitivity({
  address,
  context,
}: {
  address: string | null | undefined;
  context?: string | null;
}): SensitiveDetailClassification | null {
  const addressText = address?.trim();

  if (!addressText) {
    return null;
  }

  const combined = normalizedText([context, addressText]);

  if (isPublicVenueContext(combined) && !isPrivateLodgingContext(combined)) {
    return null;
  }

  if (isPrivateLodgingContext(combined)) {
    return privateResidenceClassification;
  }

  return null;
}

export function classifyStayAddressSensitivity({
  address,
  name,
  publicLocationLabel,
  stayType,
}: {
  address: string | null | undefined;
  name: string | null | undefined;
  publicLocationLabel?: string | null;
  stayType?: string | null;
}): SensitiveDetailClassification | null {
  const addressText = address?.trim();

  if (!addressText) {
    return null;
  }

  return privateResidenceClassification;
}

export function getStayAddressVisibility(input: {
  address: string | null | undefined;
  name: string | null | undefined;
  publicLocationLabel?: string | null;
  stayType?: string | null;
}): TripPrivateDetailVisibility {
  return input.address?.trim() ? "traveler_password" : "public";
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

  return (
    isPublicVenueContext(title) &&
    !privateControlPattern.test(title) &&
    !isPrivateLodgingContext(title)
  );
}

function isGenericNonPrivateLogisticsDetail(text: string) {
  return logisticsPattern.test(text) && !privateControlPattern.test(text);
}

export function shouldCreatePrivateDetailFromDraftSensitiveDetail({
  detailType,
  reason,
  title,
}: {
  detailType: string;
  reason: string | null;
  title: string;
}) {
  const text = normalizedText([detailType, title, reason]).toLowerCase();

  if (isPublicVenueAddressDetail({ detailType, title })) {
    return false;
  }

  if (isGenericNonPrivateLogisticsDetail(text)) {
    return false;
  }

  const classification = classifySensitiveText(text);

  if (classification?.kind === "booking_control") {
    return /\b(airbnb|apartment|bus|ferry|flight|hostel|hotel|lodging|pnr|record locator|rental|stay|train|transport|travel)\b/.test(
      text
    );
  }

  if (classification) {
    return true;
  }

  if (
    detailType.toLowerCase().includes("address") &&
    isPrivateLodgingContext(text)
  ) {
    return true;
  }

  return false;
}

export function shouldProtectPublicItemText({
  text,
  title,
}: {
  text: string | null | undefined;
  title: string | null | undefined;
}) {
  const classification = classifySensitiveText(text);

  if (!classification) {
    return false;
  }

  if (classification.kind !== "booking_control") {
    return true;
  }

  return /\b(bus|ferry|flight|fly|train|transfer|transport|travel)\b/i.test(
    title ?? ""
  );
}

export function isDefaultPrivacyPolicyQuestion({
  prompt,
  reason,
  subjectType,
  targetField,
}: {
  prompt: string | null;
  reason: string | null;
  subjectType: string | null;
  targetField: string | null;
}) {
  const target = targetField?.toLowerCase() ?? "";
  const text = normalizedText([prompt, reason, targetField]).toLowerCase();

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
