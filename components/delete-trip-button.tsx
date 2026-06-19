"use client";

import type { MakerTrip } from "@/lib/trips";

export function DeleteTripButton({
  trip,
}: {
  trip: Pick<MakerTrip, "id" | "isDemo" | "name" | "paymentStatus">;
}) {
  if (trip.isDemo) {
    return null;
  }

  return (
    <form
      action={`/maker/trips/${trip.id}/delete`}
      method="post"
      onSubmit={(event) => {
        const message =
          trip.paymentStatus === "paid"
            ? `Delete paid trip "${trip.name}"? This removes it from your dashboard and traveler links. You will need to contact support to restore a deleted trip.`
            : `Delete trip "${trip.name}"? This removes it from your dashboard.`;

        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }

      }}
    >
      <button
        className="rounded-md border border-clay/30 px-4 py-3 text-sm font-semibold text-clay transition hover:bg-clay/10"
        name="paidWarningAccepted"
        type="submit"
        value="true"
      >
        Delete trip
      </button>
    </form>
  );
}
