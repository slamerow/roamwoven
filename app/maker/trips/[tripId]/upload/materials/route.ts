import { NextRequest, NextResponse } from "next/server";
import { canEditTripMaterials, getMakerTrip } from "@/lib/trips";
import {
  UploadValidationError,
  uploadTripMaterials,
} from "@/lib/uploads";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const uploadUrl = new URL(`/maker/trips/${tripId}/upload`, request.url);

  if (!trip.isDemo && trip.paymentStatus !== "paid") {
    uploadUrl.searchParams.set("error", "checkout-required");
    return NextResponse.redirect(uploadUrl, 303);
  }

  if (trip.isDemo) {
    uploadUrl.searchParams.set("error", "demo-upload");
    return NextResponse.redirect(uploadUrl, 303);
  }

  if (!canEditTripMaterials(trip)) {
    uploadUrl.searchParams.set("error", "materials-locked");
    return NextResponse.redirect(uploadUrl, 303);
  }

  const formData = await request.formData();
  const files = formData
    .getAll("materials")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const notes = String(formData.get("notes") ?? "");

  try {
    const uploads = await uploadTripMaterials({ tripId, files, notes });
    uploadUrl.searchParams.set("saved", String(uploads.length));
  } catch (error) {
    uploadUrl.searchParams.set(
      "error",
      error instanceof UploadValidationError ? error.code : "upload-failed"
    );
  }

  return NextResponse.redirect(uploadUrl, 303);
}
