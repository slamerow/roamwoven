import Link from "next/link";
import { ArrowRight, FileText, Lock, Smartphone } from "lucide-react";

const steps = [
  "Pay once for your trip",
  "Upload confirmations, screenshots, docs, and notes",
  "Answer a guided review",
  "Publish your private mobile trip app"
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 content-center gap-10 px-6 py-10 md:grid-cols-[1.05fr_0.95fr] md:px-10">
        <div className="flex flex-col justify-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Roamwoven
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-ink md:text-7xl">
            A Superapp for your trip
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/75">
            All the information you need, right at your fingertips. It is
            vacation time, so do not spend it worrying about logistics and
            admin. Roamwoven is a custom one-stop shop for your travels: flight
            and hotel details, itinerary info, useful phrases, and everything
            else you need, never more than two or three clicks away.
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/75">
            When I took my family on a five-month sabbatical across 11
            countries, I used AI to build the travel app of my dreams.
            Roamwoven lets you build your own superapp in just 30 to 60
            minutes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/maker"
              className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-semibold text-paper"
            >
              Start a trip
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/t/demo"
              className="inline-flex items-center gap-2 rounded-md border border-ink/20 px-5 py-3 text-sm font-semibold text-ink"
            >
              View demo app
            </Link>
          </div>
        </div>

        <div className="grid content-center gap-4">
          <div className="rounded-md border border-ink/10 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-ink/10 pb-4">
              <div>
                <p className="text-sm font-semibold text-ink">Wren's Adventure</p>
                <p className="text-sm text-ink/60">Reference generated app</p>
              </div>
              <Smartphone className="text-tide" size={24} />
            </div>
            <div className="space-y-3">
              {["Flight to Seattle", "Airbnb Kihei", "Kyoto day plan"].map(
                (title) => (
                  <div
                    key={title}
                    className="rounded-md border border-ink/10 bg-paper p-4"
                  >
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <p className="mt-1 text-sm text-ink/60">
                      Clean card generated from messy source details.
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-md bg-moss p-4 text-paper">
              <FileText size={22} />
              <p className="mt-4 text-sm font-semibold">Messy inputs</p>
            </div>
            <div className="rounded-md bg-clay p-4 text-paper">
              <Lock size={22} />
              <p className="mt-4 text-sm font-semibold">Private sharing</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-ink/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10 md:grid-cols-4 md:px-10">
          {steps.map((step, index) => (
            <div key={step} className="rounded-md border border-ink/10 p-4">
              <p className="text-sm font-semibold text-clay">0{index + 1}</p>
              <p className="mt-3 text-sm font-semibold text-ink">{step}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
