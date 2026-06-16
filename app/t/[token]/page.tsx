import { getAsiaDemoTrip } from "@/lib/asia-trip";

export default function TravelerAppPage() {
  const demoTrip = getAsiaDemoTrip();

  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto max-w-md px-4 py-5">
        <header className="rounded-md bg-ink p-5 text-paper">
          <p className="text-sm text-paper/70">Private trip app</p>
          <h1 className="mt-2 text-3xl font-semibold">{demoTrip.name}</h1>
          <p className="mt-2 text-sm text-paper/75">{demoTrip.dateRange}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-paper/60">
            {demoTrip.dayCount} days · {demoTrip.itemCount} cards
          </p>
        </header>

        <div className="mt-5 space-y-5">
          {demoTrip.days.map((day) => (
            <section key={day.date}>
              <div className="mb-3">
                <p className="text-sm font-semibold text-moss">{day.label}</p>
                <h2 className="text-xl font-semibold text-ink">{day.title}</h2>
                {day.legName ? (
                  <p className="mt-1 text-sm text-ink/60">{day.legName}</p>
                ) : null}
              </div>
              <div className="space-y-3">
                {day.items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-md border border-ink/10 bg-white p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                      {[item.time, item.category].filter(Boolean).join(" · ")}
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-ink/65">
                      {item.description}
                    </p>
                    {item.address ? (
                      <p className="mt-3 text-xs text-ink/45">{item.address}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
