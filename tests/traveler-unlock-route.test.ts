import assert from "node:assert/strict";
import { hashTravelerPassword } from "@/lib/traveler-access";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

export default async function run() {
  const snapshots = require("@/lib/published-snapshots") as {
    getPublishedTripAccessStateByToken: (token: string) => Promise<unknown>;
    getPublishedTripPrivateDetailsByToken: (token: string) => Promise<unknown>;
  };
  const originalAccess = snapshots.getPublishedTripAccessStateByToken;
  const originalDetails = snapshots.getPublishedTripPrivateDetailsByToken;
  const routePath = require.resolve("@/app/t/[token]/unlock/route");
  let privateReadCount = 0;
  let passwordEnabled = true;

  snapshots.getPublishedTripAccessStateByToken = async () => ({
    passwordEnabled,
    passwordHash: hashTravelerPassword("correct horse"),
    snapshot: { id: "snapshot-1" },
  });
  snapshots.getPublishedTripPrivateDetailsByToken = async () => {
    privateReadCount += 1;
    return [
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
  };
  delete require.cache[routePath];
  const { POST } = require(routePath) as {
    POST: (
      request: Request,
      context: { params: Promise<{ token: string }> }
    ) => Promise<Response>;
  };

  try {
    await test("valid traveler password returns the protected travel description", async () => {
      passwordEnabled = true;
      privateReadCount = 0;
      const response = await POST(
        new Request("http://localhost/t/share-token/unlock", {
          body: JSON.stringify({ password: "correct horse" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        { params: Promise.resolve({ token: "share-token" }) }
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(privateReadCount, 1);
      assert.equal(body.unlocked, true);
      assert.equal(body.details[0]?.detailId, "transport-1:description");
      assert.equal(body.details[0]?.value, "Seat 12A in the quiet car.");
    });

    await test("disabled traveler password returns all protected details", async () => {
      passwordEnabled = false;
      privateReadCount = 0;
      const response = await POST(
        new Request("http://localhost/t/share-token/unlock", {
          body: JSON.stringify({}),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        { params: Promise.resolve({ token: "share-token" }) }
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(privateReadCount, 1);
      assert.equal(body.unlocked, true);
      assert.equal(body.details[0]?.detailId, "transport-1:description");
      assert.equal(body.details[0]?.value, "Seat 12A in the quiet car.");
    });

    await test("invalid traveler password returns no protected details", async () => {
      passwordEnabled = true;
      privateReadCount = 0;
      const response = await POST(
        new Request("http://localhost/t/share-token/unlock", {
          body: JSON.stringify({ password: "wrong" }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        { params: Promise.resolve({ token: "share-token" }) }
      );
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(privateReadCount, 0);
      assert.deepEqual(body, { error: "invalid-password" });
    });
  } finally {
    snapshots.getPublishedTripAccessStateByToken = originalAccess;
    snapshots.getPublishedTripPrivateDetailsByToken = originalDetails;
    delete require.cache[routePath];
  }
}
