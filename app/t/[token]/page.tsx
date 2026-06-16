import { getAsiaDemoTrip } from "@/lib/asia-trip";

export default function TravelerAppPage() {
  const demoTrip = getAsiaDemoTrip();
  const featuredDays = demoTrip.days.slice(0, 8);

  return (
    <main className="min-h-screen bg-paper pb-8">
      <section className="sticky top-0 z-10 border-b border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
              Private trip app
            </p>
            <p className="text-base font-semibold text-ink">{demoTrip.name}</p>
          </div>
          <a
            href="#today"
            className="rounded-md bg-ink px-3 py-2 text-xs font-semibold text-paper"
          >
            Today
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-md px-4 py-5">
        <header className="rounded-md bg-ink p-5 text-paper">
          <p className="text-sm text-paper/70">{demoTrip.dateRange}</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight">
            {demoTrip.name}
          </h1>
          <p className="mt-4 text-sm leading-6 text-paper/70">
            {demoTrip.countries.slice(0, 6).join(" / ")}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-md bg-paper/10 p-3">
              <p className="text-2xl font-semibold">{demoTrip.dayCount}</p>
              <p className="mt-1 text-xs text-paper/65">days</p>
            </div>
            <div className="rounded-md bg-paper/10 p-3">
              <p className="text-2xl font-semibold">{demoTrip.legs.length}</p>
              <p className="mt-1 text-xs text-paper/65">stays</p>
            </div>
            <div className="rounded-md bg-paper/10 p-3">
              <p className="text-2xl font-semibold">{demoTrip.itemCount}</p>
              <p className="mt-1 text-xs text-paper/65">cards</p>
            </div>
          </div>
        </header>

        <nav className="mt-4 overflow-x-auto pb-2">
          <div className="flex gap-2">
            {featuredDays.map((day) => (
              <a
                key={day.date}
                href={`#day-${day.date}`}
                className="min-w-28 rounded-md border border-ink/10 bg-white p-3"
              >
                <p className="text-xs font-semibold text-moss">{day.label}</p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  {day.title}
                </p>
              </a>
            ))}
          </div>
        </nav>

        <div className="mt-4 space-y-5">
          {demoTrip.days.map((day) => (
            <section
              id={day.label === "Day 1" ? "today" : `day-${day.date}`}
              key={day.date}
              className="scroll-mt-24"
            >
              <div className="mb-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-moss">
                      {day.label}
                    </p>
                    <h2 className="text-xl font-semibold text-ink">
                      {day.title}
                    </h2>
                  </div>
                  <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-clay">
                    {day.items.length} cards
                  </p>
                </div>
                {day.legName ? (
                  <p className="mt-1 text-sm text-ink/60">{day.legName}</p>
                ) : null}
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/40">
                  {day.primaryCategory}
                </p>
              </div>
              <div className="space-y-3">
                {day.items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-md border border-ink/10 bg-white p-4 shadow-sm"
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
