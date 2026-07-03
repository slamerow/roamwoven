import { NextRequest, NextResponse } from "next/server";
import { getTripExtractionAuditPayload } from "@/lib/extraction/trip-extraction-audit-view";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;
    const payload = await getTripExtractionAuditPayload(tripId);

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load extraction audit payload.",
      },
      { status: 500 }
    );
  }
}
