import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import {
  createGeneratedTripSummaryView,
  type GeneratedTripSummaryView,
} from "@/lib/generated-trip-summary";

export type TripPublishAssessment =
  | {
      canPublish: false;
      reason: "records_missing";
      summary: null;
    }
  | {
      canPublish: true;
      hardWarningCount: number;
      reason: null;
      reviewCount: number;
      semanticDisposition: "clean" | "needs_review";
      summary: GeneratedTripSummaryView;
    };

export function assessTripPublishability(
  records: StructuredTripRecords | null
): TripPublishAssessment {
  if (!records) {
    return {
      canPublish: false,
      reason: "records_missing",
      summary: null,
    };
  }

  const summary = createGeneratedTripSummaryView(records);
  const hardWarningCount = summary.warnings.filter(
    (warning) => warning.severity === "hard"
  ).length;
  const reviewCount = summary.counts.review;

  return {
    canPublish: true,
    hardWarningCount,
    reason: null,
    reviewCount,
    semanticDisposition:
      reviewCount > 0 || hardWarningCount > 0 ? "needs_review" : "clean",
    summary,
  };
}

// ---------------------------------------------------------------------------
// Arc F publish readiness copy (CEO decisions 1 and 7, 2026-07-24; amends
// the run7 RW-PUB-001 messaging). Publishing NEVER blocks — the maker is
// the quality gate — but while an identity-class P0 finding or a hard
// structural warning is open, the readiness headline becomes a
// warning-state ("Ready with N privacy warnings") instead of claiming the
// app is ready. Quiet warnings never change readiness copy. Standing
// directive with it: these warnings are a TRIPWIRE, not a feature —
// recurring hard-warning shapes are backlog defects the assembly logic
// must learn to resolve; the target state is N = 0 on a healthy run.

export const PRIVACY_P0_DIAGNOSTIC_CODES = [
  "identity_value_in_public_prose",
  "protected_code_shape_in_public_prose",
] as const;

export type TripPublishReadinessCopy = {
  headline: string;
  openHardWarningCount: number;
  openPrivacyP0Count: number;
  privacyWarningCount: number;
  state: "ready" | "ready_with_warnings";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Open findings come from the run's remediation outcomes (usage
// telemetry): a finding is OPEN when it persisted as a conservative
// fallback for review — repaired/verified findings and detector incidents
// are closed and never change copy.
export function countOpenPublishWarnings(usage: unknown): {
  openHardWarningCount: number;
  openPrivacyP0Count: number;
} {
  const remediation = asRecord(asRecord(usage)?.qualityRemediation);
  const outcomes = Array.isArray(remediation?.outcomes)
    ? remediation.outcomes
    : [];
  let openPrivacyP0Count = 0;
  let openHardWarningCount = 0;
  for (const value of outcomes) {
    const outcome = asRecord(value);
    if (!outcome) continue;
    if (outcome.action !== "conservative_fallback_preserved_for_review") {
      continue;
    }
    if (outcome.classification !== "confirmed_output_defect") continue;
    const findingKey =
      typeof outcome.findingKey === "string" ? outcome.findingKey : "";
    if (
      PRIVACY_P0_DIAGNOSTIC_CODES.some(
        (code) => findingKey === `diagnostic:${code}`
      )
    ) {
      openPrivacyP0Count += 1;
      continue;
    }
    // Hard structural warnings ride outcomes as warning-keyed findings;
    // activity_bloat is the one QUIET warning admitted into findings and
    // must never change readiness copy (decision 7).
    if (
      findingKey.startsWith("warning:") &&
      !findingKey.startsWith("warning:activity_bloat:")
    ) {
      openHardWarningCount += 1;
    }
  }
  return { openHardWarningCount, openPrivacyP0Count };
}

export function assessTripPublishReadinessCopy(
  usage: unknown
): TripPublishReadinessCopy {
  const { openHardWarningCount, openPrivacyP0Count } =
    countOpenPublishWarnings(usage);
  const privacyWarningCount = openHardWarningCount + openPrivacyP0Count;
  if (privacyWarningCount === 0) {
    return {
      headline: "Private app is ready",
      openHardWarningCount,
      openPrivacyP0Count,
      privacyWarningCount,
      state: "ready",
    };
  }
  return {
    headline: `Ready with ${privacyWarningCount} privacy warning${
      privacyWarningCount === 1 ? "" : "s"
    }`,
    openHardWarningCount,
    openPrivacyP0Count,
    privacyWarningCount,
    state: "ready_with_warnings",
  };
}
