import { NextRequest, NextResponse } from "next/server";
import { getTripExtractionQaBundle } from "@/lib/extraction/trip-extraction-qa-bundle";
import {
  MakerTripAuthRequiredError,
  MakerTripNotFoundError,
} from "@/lib/trips";

function shouldIncludePrivate(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("includePrivate");

  return value === "1" || value === "true";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;

  try {
    const payload = await getTripExtractionQaBundle(tripId, {
      includePrivate: shouldIncludePrivate(request),
    });

    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof MakerTripAuthRequiredError
      ? 401
      : error instanceof MakerTripNotFoundError
        ? 404
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load extraction QA bundle.",
        tripId,
      },
      { status }
    );
  }
}
