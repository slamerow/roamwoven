import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canPersistTrips, createMakerTrip } from "@/lib/trips";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(
    formData.get("description") ?? formData.get("destinationSummary") ?? ""
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

  return NextResponse.redirect(
    new URL(`/maker/trips/${tripId}?making=1`, request.url),
    303
  );
}
