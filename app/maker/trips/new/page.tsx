export default function NewTripPage() {
  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
          New Trip
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-ink">
          Create a trip app
        </h1>
        <form className="mt-8 space-y-5 rounded-md border border-ink/10 bg-white p-5">
          <label className="block">
            <span className="text-sm font-semibold text-ink">Trip name</span>
            <input
              className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
              placeholder="Wren's Adventure"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink">
              Destination summary
            </span>
            <input
              className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
              placeholder="Japan, Vietnam, Thailand..."
            />
          </label>
          <a
            href="/maker/trips/demo-trip"
            className="inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
          >
            Continue to payment
          </a>
        </form>
      </div>
    </main>
  );
}
