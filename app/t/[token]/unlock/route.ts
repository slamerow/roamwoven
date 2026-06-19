import { NextRequest, NextResponse } from "next/server";
import {
  getPublishedTripAccessStateByToken,
  getPublishedTripPrivateDetailsByToken,
} from "@/lib/published-snapshots";
import { verifyTravelerPassword } from "@/lib/traveler-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (token === "demo") {
    const body = await request.json().catch(() => ({}));
    const password = String(body.password ?? "");

    if (password.trim().toLowerCase() !== "traveler") {
      return NextResponse.json({ error: "invalid-password" }, { status: 401 });
    }

    return NextResponse.json({ details: [], unlocked: true });
  }

  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? "");
  const accessState = await getPublishedTripAccessStateByToken(token);

  if (!accessState) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const verification = verifyTravelerPassword({
    password,
    passwordEnabled: accessState.passwordEnabled,
    passwordHash: accessState.passwordHash,
  });

  if (verification === "disabled") {
    return NextResponse.json({ details: [], unlocked: true });
  }

  if (verification === "missing_hash") {
    return NextResponse.json(
      { error: "traveler-password-not-configured" },
      { status: 409 }
    );
  }

  if (verification !== "valid") {
    return NextResponse.json({ error: "invalid-password" }, { status: 401 });
  }

  const details = await getPublishedTripPrivateDetailsByToken(token);

  if (!details) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  return NextResponse.json({ details, unlocked: true });
}
