import assert from "node:assert/strict";
import {
  BUILD_CONFIRMATIONS,
  getDefaultBuildSettings,
  type TripBuildSettings,
} from "@/lib/build-settings";
import {
  getMakerNextAction,
  getMakerProgressState,
  hasConfirmedBuildSettings,
  hasSavedStyleSettings,
} from "@/lib/maker-flow";
import { getDefaultStyleSettings } from "@/lib/style-settings";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function confirmedBuildSettings(): TripBuildSettings {
  const settings = getDefaultBuildSettings();

  return {
    ...settings,
    confirmations: Object.fromEntries(
      BUILD_CONFIRMATIONS.map((confirmation) => [confirmation.key, true])
    ) as TripBuildSettings["confirmations"],
    updatedAt: "2026-07-06T00:00:00.000Z",
  };
}

test("maker funnel sends unpaid trips through setup before checkout", () => {
  assert.deepEqual(
    getMakerNextAction({
      hasBuildSettings: false,
      hasStyleSettings: false,
      isPaid: false,
      uploadCount: 0,
    }),
    {
      href: "upload",
      kind: "link",
      label: "Continue building: Add materials",
      message: "Next: add the materials Roamwoven should use.",
    }
  );

  assert.deepEqual(
    getMakerNextAction({
      hasBuildSettings: false,
      hasStyleSettings: false,
      isPaid: false,
      uploadCount: 2,
    }),
    {
      href: "review",
      kind: "link",
      label: "Continue building: App sections",
      message: "Next: choose what belongs in the traveler app.",
    }
  );

  assert.deepEqual(
    getMakerNextAction({
      hasBuildSettings: true,
      hasStyleSettings: false,
      isPaid: false,
      uploadCount: 2,
    }),
    {
      href: "style",
      kind: "link",
      label: "Continue building: Design",
      message: "Next: choose the app's design direction.",
    }
  );
});

test("maker funnel asks for payment only after setup is complete", () => {
  assert.deepEqual(
    getMakerNextAction({
      hasBuildSettings: true,
      hasStyleSettings: true,
      isPaid: false,
      uploadCount: 2,
    }),
    {
      href: "",
      kind: "checkout",
      label: "Continue to payment",
      message:
        "Design choices are saved. Complete checkout, then Roamwoven can process the first draft.",
    }
  );

  assert.deepEqual(
    getMakerNextAction({
      hasBuildSettings: true,
      hasStyleSettings: true,
      isPaid: true,
      uploadCount: 2,
    }),
    {
      href: "data",
      kind: "link",
      label: "Continue building: Process draft",
      message: "Next: process the first draft and review what needs attention.",
    }
  );
});

test("maker progress quietly locks processing until payment", () => {
  assert.deepEqual(
    getMakerProgressState({
      hasBuildSettings: true,
      hasStyleSettings: true,
      isPaid: false,
      uploadCount: 2,
    }),
    {
      completedSteps: 4,
      currentStep: 4,
      maxAccessibleStep: 4,
    }
  );

  assert.deepEqual(
    getMakerProgressState({
      hasBuildSettings: true,
      hasStyleSettings: true,
      isPaid: true,
      uploadCount: 2,
    }),
    {
      completedSteps: 4,
      currentStep: 5,
      maxAccessibleStep: 5,
    }
  );
});

test("maker setup completion requires confirmed sections and saved style", () => {
  const styleSettings = {
    ...getDefaultStyleSettings("Central Europe"),
    updatedAt: "2026-07-06T00:00:00.000Z",
  };

  assert.equal(hasConfirmedBuildSettings(getDefaultBuildSettings()), false);
  assert.equal(hasConfirmedBuildSettings(confirmedBuildSettings()), true);
  assert.equal(hasSavedStyleSettings(getDefaultStyleSettings("Central Europe")), false);
  assert.equal(hasSavedStyleSettings(styleSettings), true);
});
