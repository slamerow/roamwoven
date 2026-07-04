import Link from "next/link";
import { redirect } from "next/navigation";
import { listMakerTrips } from "@/lib/trips";

export default async function LatestMakerAuditPage() {
  const trips = await listMakerTrips();
  const latestTrip = trips[0];

  if (latestTrip) {
    redirect(`/maker/trips/${latestTrip.id}/data/audit`);
  }

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-2xl rounded-md border border-ink/10 bg-white p-6">
        <h1 className="text-3xl font-semibold text-ink">
          No trip audit available
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Create or open a trip before checking extraction audit results.
        </p>
        <Link
          href="/maker"
          className="mt-5 inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
