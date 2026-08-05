import assert from "node:assert/strict";
import { resolvePublishedTravelerAccessMode } from "@/lib/published-traveler-access";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const protectedDetails = [
  {
    detailId: "transport-1:description",
    label: "Travel details",
    reason: "Travel-card descriptions stay behind the trip password.",
    subjectId: "transport-1",
    subjectType: "transport",
    value: "Seat 12A in the quiet car.",
    visibility: "traveler_password",
  },
];

export default async function run() {
  await test("password-off share links start in traveler mode with all protected details", async () => {
    let privateReadCount = 0;
    const access = await resolvePublishedTravelerAccessMode({
      loadPrivateDetails: async () => {
        privateReadCount += 1;
        return protectedDetails;
      },
      passwordEnabled: false,
    });

    assert.equal(privateReadCount, 1);
    assert.equal(access?.initialUnlocked, true);
    assert.deepEqual(access?.initialProtectedDetails, protectedDetails);
  });

  await test("password-on share links start locked without reading private rows", async () => {
    let privateReadCount = 0;
    const access = await resolvePublishedTravelerAccessMode({
      loadPrivateDetails: async () => {
        privateReadCount += 1;
        return protectedDetails;
      },
      passwordEnabled: true,
    });

    assert.equal(privateReadCount, 0);
    assert.equal(access?.initialUnlocked, false);
    assert.deepEqual(access?.initialProtectedDetails, []);
  });

  await test("a revoked password-off snapshot fails closed instead of serving stale details", async () => {
    const access = await resolvePublishedTravelerAccessMode({
      loadPrivateDetails: async () => null,
      passwordEnabled: false,
    });

    assert.equal(access, null);
  });
}
