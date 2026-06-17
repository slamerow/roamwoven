import { NextRequest, NextResponse } from "next/server";
import { canEditTripMaterials, getMakerTrip } from "@/lib/trips";
import { deleteTripUpload } from "@/lib/uploads";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string; uploadId: string }> }
) {
  const { tripId, uploadId } = await params;
  const trip = await getMakerTrip(tripId);
  const uploadUrl = new URL(`/maker/trips/${tripId}/upload`, request.url);

  if (!canEditTripMaterials(trip)) {
    uploadUrl.searchParams.set("error", "materials-locked");
    return NextResponse.redirect(uploadUrl, 303);
  }

  try {
    await deleteTripUpload({ tripId, uploadId });
    uploadUrl.searchParams.set("deleted", "1");
  } catch {
    uploadUrl.searchParams.set("error", "delete-failed");
  }

  return NextResponse.redirect(uploadUrl, 303);
}
