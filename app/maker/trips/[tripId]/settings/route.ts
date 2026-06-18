import { NextRequest, NextResponse } from "next/server";
import { getMakerTrip, updateMakerTripName } from "@/lib/trips";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const workspaceUrl = new URL(`/maker/trips/${tripId}`, request.url);

  try {
    const trip = await getMakerTrip(tripId);

    if (trip.isDemo) {
      workspaceUrl.searchParams.set("error", "demo-rename-unavailable");
      return NextResponse.redirect(workspaceUrl, 303);
    }

    const formData = await request.formData();
    const name = String(formData.get("name") ?? "");

    await updateMakerTripName({ name, tripId });
    workspaceUrl.searchParams.set("renamed", "1");

    return NextResponse.redirect(workspaceUrl, 303);
  } catch {
    workspaceUrl.searchParams.set("error", "rename-failed");
    return NextResponse.redirect(workspaceUrl, 303);
  }
}
