import Link from "next/link";
import { Upload, WalletCards } from "lucide-react";

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

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="flex items-center gap-3">
              <WalletCards className="text-clay" size={22} />
              <h2 className="text-lg font-semibold text-ink">Payment gate</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              Trips must be paid before upload processing starts. This keeps
              expensive extraction tied to a real purchase.
            </p>
          </div>
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="flex items-center gap-3">
              <Upload className="text-tide" size={22} />
              <h2 className="text-lg font-semibold text-ink">Upload flow</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              After payment, users can upload PDFs, screenshots, docs,
              spreadsheets, and pasted notes for intake review.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

