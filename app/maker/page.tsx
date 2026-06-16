import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileUp, Smartphone } from "lucide-react";

export default function MakerDashboardPage() {
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

        <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                Beta demo trip
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">
                Wren's Adventure
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
                Imported from the Asia workbook: 25 city/stay legs and 313
                generated cards. Use this trip to test the Roamwoven creation
                flow before live extraction exists.
              </p>
            </div>
            <Link
              href="/maker/trips/demo-trip"
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
            >
              Continue
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <Link
              href="/maker/trips/demo-trip/upload"
              className="rounded-md border border-ink/10 bg-paper p-4"
            >
              <FileUp className="text-tide" size={22} />
              <p className="mt-3 text-sm font-semibold text-ink">
                Upload and intake
              </p>
            </Link>
            <Link
              href="/maker/trips/demo-trip/review"
              className="rounded-md border border-ink/10 bg-paper p-4"
            >
              <ClipboardCheck className="text-clay" size={22} />
              <p className="mt-3 text-sm font-semibold text-ink">
                Review questions
              </p>
            </Link>
            <Link
              href="/t/demo"
              className="rounded-md border border-ink/10 bg-paper p-4"
            >
              <Smartphone className="text-moss" size={22} />
              <p className="mt-3 text-sm font-semibold text-ink">
                Traveler preview
              </p>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
