import { NextRequest, NextResponse } from "next/server";
import { getTripExtractionAuditPayload } from "@/lib/extraction/trip-extraction-audit-view";
import {
  MakerTripAuthRequiredError,
  MakerTripNotFoundError,
} from "@/lib/trips";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;

  try {
    const payload = await getTripExtractionAuditPayload(tripId);

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
            : "Unable to load extraction audit payload.",
        tripId,
      },
      { status }
    );
  }
}
