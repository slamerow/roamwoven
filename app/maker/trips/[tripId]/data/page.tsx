import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Plane, TableProperties } from "lucide-react";
import { getAsiaDemoTrip } from "@/lib/asia-trip";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads } from "@/lib/uploads";

function formatDate(date?: string | null) {
  if (!date) {
    return "TBD";
  }

  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function StructuredDataPage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const makerTrip = await getMakerTrip(tripId);
  const canShowUploads = makerTrip.isDemo || makerTrip.paymentStatus === "paid";
  const uploads = canShowUploads ? await listTripUploads(tripId) : [];
  const trip = getAsiaDemoTrip();
  const stayLegs = trip.legs.filter((leg) => leg.stayName);
  const reviewItems = trip.items.filter((item) =>
    [item.title, item.description, item.address].some((value) =>
      value?.toLowerCase().includes("tbd")
    )
  );

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-ink/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
              Structured Data
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-ink">
              Clean trip output
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
              First-pass structured data for {makerTrip.name}. This beta view
              still uses reference trip data until extraction is connected, but
              the flow is now grounded in the materials saved for this trip.
            </p>
          </div>
          <Link
            href={`/maker/trips/${tripId}/style`}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
          >
            Choose style
            <ArrowRight size={16} />
          </Link>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <CalendarDays className="text-moss" size={22} />
            <p className="mt-4 text-3xl font-semibold text-ink">
              {trip.dayCount}
            </p>
            <p className="mt-1 text-sm text-ink/60">Trip days</p>
          </div>
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <MapPin className="text-tide" size={22} />
            <p className="mt-4 text-3xl font-semibold text-ink">
              {trip.legs.length}
            </p>
            <p className="mt-1 text-sm text-ink/60">City/stay legs</p>
          </div>
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <TableProperties className="text-clay" size={22} />
            <p className="mt-4 text-3xl font-semibold text-ink">
              {trip.itemCount}
            </p>
            <p className="mt-1 text-sm text-ink/60">Generated cards</p>
          </div>
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <Plane className="text-ink/70" size={22} />
            <p className="mt-4 text-3xl font-semibold text-ink">
              {uploads.length}
            </p>
            <p className="mt-1 text-sm text-ink/60">Source materials</p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">Trip spine</h2>
              <span className="text-sm font-semibold text-clay">
                {stayLegs.length} stays
              </span>
            </div>
            <div className="space-y-3">
              {trip.legs.slice(0, 10).map((leg) => (
                <article
                  key={leg.id}
                  className="rounded-md border border-ink/10 bg-paper p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-base font-semibold text-ink">
                        {leg.city}, {leg.country}
                      </p>
                      <p className="mt-1 text-sm text-ink/60">
                        {leg.stayName ?? "Stay needed"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-moss">
                      {formatDate(leg.arriveDate)} / {formatDate(leg.leaveDate)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">Review queue</h2>
              <span className="text-sm font-semibold text-clay">
                {reviewItems.length} possible
              </span>
            </div>
            <div className="space-y-3">
              {reviewItems.slice(0, 8).map((item) => (
                <article
                  key={item.id}
                  className="rounded-md border border-ink/10 bg-paper p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                    {item.category ?? "review"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-ink">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm text-ink/60">
                    {item.date ?? "Needs date"}
                  </p>
                </article>
              ))}
              {reviewItems.length === 0 ? (
                <p className="text-sm text-ink/60">
                  No obvious TBD markers found in the imported seed.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">
                Source materials
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                These are the saved inputs this trip will use once extraction is
                connected.
              </p>
            </div>
            <span className="text-sm font-semibold text-moss">
              {uploads.length} saved
            </span>
          </div>

          {uploads.length > 0 ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {uploads.map((upload) => (
                <div key={upload.id} className="rounded-md bg-paper p-4">
                  <p className="truncate text-sm font-semibold text-ink">
                    {upload.originalFilename}
                  </p>
                  <p className="mt-1 text-xs font-semibold capitalize text-moss">
                    {upload.processingStatus}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-md bg-paper p-4 text-sm text-ink/60">
              No saved materials yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
