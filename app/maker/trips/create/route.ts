import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canPersistTrips, createMakerTrip } from "@/lib/trips";
import {
  uploadTripMaterials,
  UploadValidationError,
} from "@/lib/uploads";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(
    formData.get("description") ?? formData.get("destinationSummary") ?? ""
  ).trim();
  const files = formData
    .getAll("materials")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const notes = String(formData.get("notes") ?? "");

  if (!name) {
    return NextResponse.redirect(
      new URL("/maker/trips/new?error=missing-name", request.url),
      303
    );
  }

  if (!canPersistTrips()) {
    return NextResponse.redirect(
      new URL("/maker/trips/demo-trip", request.url),
      303
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", "/maker/trips/new");
    return NextResponse.redirect(loginUrl, 303);
  }

  const tripId = await createMakerTrip({
    name,
    destinationSummary: description
  });
  let uploadCount = 0;

  if (files.length > 0 || notes.trim()) {
    try {
      const uploads = await uploadTripMaterials({ tripId, files, notes });
      uploadCount = uploads.length;
    } catch (error) {
      console.error("initial_trip_material_upload_failed", {
        tripId,
        message: error instanceof Error ? error.message : "Unknown error",
        name: error instanceof Error ? error.name : "UnknownError",
      });

      const uploadUrl = new URL(`/maker/trips/${tripId}/upload`, request.url);
      uploadUrl.searchParams.set(
        "error",
        error instanceof UploadValidationError
          ? error.code
          : "upload-failed"
      );
      uploadUrl.searchParams.set("created", "1");

      return NextResponse.redirect(uploadUrl, 303);
    }
  }

  const workspaceUrl = new URL(`/maker/trips/${tripId}`, request.url);
  workspaceUrl.searchParams.set("making", "1");

  if (uploadCount > 0) {
    workspaceUrl.searchParams.set("saved", String(uploadCount));
  }

  return NextResponse.redirect(workspaceUrl, 303);
}
