import { NextRequest, NextResponse } from "next/server";
import { softDeleteMakerTrip } from "@/lib/trips";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const formData = await request.formData();
  const paidWarningAccepted =
    String(formData.get("paidWarningAccepted") ?? "") === "true";

  try {
    await softDeleteMakerTrip({ paidWarningAccepted, tripId });
    return NextResponse.redirect(new URL("/maker?deleted=1", request.url), 303);
  } catch {
    return NextResponse.redirect(
      new URL(`/maker/trips/${tripId}?error=delete-failed`, request.url),
      303
    );
  }
}
