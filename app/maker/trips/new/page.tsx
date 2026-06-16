import { CreateTripForm } from "@/components/create-trip-form";

export default async function NewTripPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
          New Trip
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-ink">
          Create a trip app
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Name the app, describe the trip, and drop in whatever materials you
          have. The full upload pipeline comes next; this first screen gives the
          flow its real shape.
        </p>
        <CreateTripForm error={error} />
      </div>
    </main>
  );
}
