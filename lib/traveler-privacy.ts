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

const sensitivityRules: SensitivityRule[] = [
  {
    kind: "private_access",
    label: "Private access detail",
    reason: "Codes and access instructions should stay behind the trip password.",
    patterns: [
      /\bdoor code\b/i,
      /\bgate code\b/i,
      /\blockbox\b/i,
      /\bkeypad\b/i,
      /\bentry code\b/i,
      /\baccess code\b/i,
      /\bwi-?fi password\b/i,
    ],
  },
  {
    kind: "booking_control",
    label: "Booking detail",
    reason: "Confirmation and booking references can control reservations.",
    patterns: [
      /\bconfirmation\b/i,
      /\bbooking reference\b/i,
      /\breservation (number|code)\b/i,
      /\bticket number\b/i,
      /\brecord locator\b/i,
      /\bpnr\b/i,
    ],
  },
  {
    kind: "private_contact",
    label: "Private contact",
    reason: "Host and personal contact details should not show in follower mode.",
    patterns: [
      /\bhost\b/i,
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
    reason: "Personal, medical, child, or family logistics should be reviewed before sharing.",
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

const privateResidencePatterns = [
  /\bstay with\b/i,
  /\bfamily\b/i,
  /\bfriend'?s\b/i,
  /\banna'?s house\b/i,
  /\bhome\b/i,
  /\bairbnb\b/i,
  /\brental\b/i,
  /\bapartment\b/i,
  /\bflat\b/i,
  /\bresidence\b/i,
];

export function classifySensitiveText(
  value: string | null | undefined
): SensitiveDetailClassification | null {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  for (const rule of sensitivityRules) {
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

  const contextText = context?.trim() ?? "";
  const combined = `${contextText} ${addressText}`;
  const isPrivateResidence = privateResidencePatterns.some((pattern) =>
    pattern.test(combined)
  );

  if (isPrivateResidence) {
    return {
      kind: "private_residence",
      label: "Private lodging detail",
      reason:
        "Exact private lodging and residence addresses should stay behind the trip password.",
    };
  }

  return null;
}
