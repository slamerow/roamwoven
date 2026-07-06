import {
  BUILD_CONFIRMATIONS,
  type TripBuildSettings,
} from "@/lib/build-settings-config";
import type { TripStyleSettings } from "@/lib/style-settings-config";

type MakerFlowInput = {
  hasBuildSettings: boolean;
  hasDraft?: boolean;
  hasStyleSettings: boolean;
  isDemo?: boolean;
  isPaid: boolean;
  uploadCount: number;
};

type MakerNextAction =
  | {
      kind: "checkout";
      href: "";
      label: string;
      message: string;
    }
  | {
      kind: "link";
      href: "data" | "review" | "style" | "upload";
      label: string;
      message: string;
    };

export function hasConfirmedBuildSettings(
  buildSettings: TripBuildSettings | null
) {
  return (
    Boolean(buildSettings?.updatedAt) &&
    BUILD_CONFIRMATIONS.every(
      (confirmation) => buildSettings?.confirmations[confirmation.key]
    )
  );
}

export function hasSavedStyleSettings(
  styleSettings: Pick<TripStyleSettings, "updatedAt"> | null
) {
  return Boolean(styleSettings?.updatedAt);
}

export function getMakerNextAction({
  hasBuildSettings,
  hasStyleSettings,
  isDemo = false,
  isPaid,
  uploadCount,
}: MakerFlowInput): MakerNextAction {
  if (uploadCount === 0) {
    return {
      kind: "link",
      href: "upload",
      label: "Continue building: Add materials",
      message: "Next: add the materials Roamwoven should use.",
    };
  }

  if (!hasBuildSettings) {
    return {
      kind: "link",
      href: "review",
      label: "Continue building: App sections",
      message: "Next: choose what belongs in the traveler app.",
    };
  }

  if (!hasStyleSettings) {
    return {
      kind: "link",
      href: "style",
      label: "Continue building: Design",
      message: "Next: choose the app's design direction.",
    };
  }

  if (!isPaid && !isDemo) {
    return {
      kind: "checkout",
      href: "",
      label: "Continue to payment",
      message:
        "Design choices are saved. Complete checkout, then Roamwoven can process the first draft.",
    };
  }

  return {
    kind: "link",
    href: "data",
    label: "Continue building: Process draft",
    message: "Next: process the first draft and review what needs attention.",
  };
}

export function getMakerProgressState({
  hasBuildSettings,
  hasDraft = false,
  hasStyleSettings,
  isDemo = false,
  isPaid,
  uploadCount,
}: MakerFlowInput) {
  const hasUploads = uploadCount > 0;
  const setupComplete = hasUploads && hasBuildSettings && hasStyleSettings;
  const paidOrDemo = isPaid || isDemo;

  if (hasDraft) {
    return {
      completedSteps: 5,
      currentStep: 6,
      maxAccessibleStep: paidOrDemo ? 6 : 4,
    };
  }

  if (!hasUploads) {
    return {
      completedSteps: 1,
      currentStep: 2,
      maxAccessibleStep: 2,
    };
  }

  if (!hasBuildSettings) {
    return {
      completedSteps: 2,
      currentStep: 3,
      maxAccessibleStep: 3,
    };
  }

  if (!hasStyleSettings) {
    return {
      completedSteps: 3,
      currentStep: 4,
      maxAccessibleStep: 4,
    };
  }

  return {
    completedSteps: 4,
    currentStep: paidOrDemo ? 5 : 4,
    maxAccessibleStep: setupComplete && paidOrDemo ? 5 : 4,
  };
}
