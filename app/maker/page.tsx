import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileUp, Smartphone } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listMakerTrips } from "@/lib/trips";

export default async function MakerDashboardPage() {
  const user = await getCurrentUser();
  const trips = await listMakerTrips();

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 border-b border-ink/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
              Maker App
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-ink">
              Trip dashboard
            </h1>
          </div>
          <Link
            href="/maker/trips/new"
            className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
          >
            Create trip
          </Link>
        </header>

        {user ? (
          <section className="mt-5 flex flex-col gap-3 rounded-md border border-ink/10 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-ink/65">{user.email}</p>
            <form action="/auth/sign-out" method="post">
              <button
                className="rounded-md border border-ink/15 px-3 py-2 text-sm font-semibold text-ink"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </section>
        ) : null}

        <div className="mt-8 space-y-5">
          {trips.length === 0 ? (
            <section className="rounded-md border border-ink/10 bg-white p-5">
              <h2 className="text-2xl font-semibold text-ink">
                Create your first trip
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
                Your dashboard will show only trips owned by your account.
              </p>
              <Link
                href="/maker/trips/new"
                className="mt-5 inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
              >
                Create trip
              </Link>
            </section>
          ) : null}
          {trips.map((trip) => (
            <section
              key={trip.id}
              className="rounded-md border border-ink/10 bg-white p-5"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                    {trip.isDemo ? "Beta demo trip" : trip.paymentStatus}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-ink">
                    {trip.name}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
                    {trip.isDemo
                      ? "Imported from the Asia workbook: 25 city/stay legs and 313 generated cards. Use this trip to test the Roamwoven creation flow before live extraction exists."
                      : trip.destinationSummary ||
                        "Trip shell created. Continue to payment, upload, and app generation."}
                  </p>
                </div>
                <Link
                  href={`/maker/trips/${trip.id}`}
                  className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                >
                  Continue
                  <ArrowRight size={16} />
                </Link>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <Link
                  href={`/maker/trips/${trip.id}/upload`}
                  className="rounded-md border border-ink/10 bg-paper p-4"
                >
                  <FileUp className="text-tide" size={22} />
                  <p className="mt-3 text-sm font-semibold text-ink">
                    Upload and intake
                  </p>
                </Link>
                <Link
                  href={`/maker/trips/${trip.id}/review`}
                  className="rounded-md border border-ink/10 bg-paper p-4"
                >
                  <ClipboardCheck className="text-clay" size={22} />
                  <p className="mt-3 text-sm font-semibold text-ink">
                    Review questions
                  </p>
                </Link>
                <Link
                  href={trip.isDemo ? "/t/demo" : `/maker/trips/${trip.id}/publish`}
                  className="rounded-md border border-ink/10 bg-paper p-4"
                >
                  <Smartphone className="text-moss" size={22} />
                  <p className="mt-3 text-sm font-semibold text-ink">
                    Traveler preview
                  </p>
                </Link>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
