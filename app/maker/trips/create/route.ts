import { NextRequest, NextResponse } from "next/server";
import { canPersistTrips, createMakerTrip } from "@/lib/trips";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const destinationSummary = String(
    formData.get("destinationSummary") ?? ""
  ).trim();

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

  const tripId = await createMakerTrip({ name, destinationSummary });

  return NextResponse.redirect(
    new URL(`/maker/trips/${tripId}`, request.url),
    303
  );
}
