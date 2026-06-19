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
        <h1 className="text-4xl font-semibold text-ink">
          Create a trip app
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Name the app, describe the trip, and drop in the first materials you
          have. Roamwoven saves them now and waits until checkout to process
          them.
        </p>
        <CreateTripForm error={error} />
      </div>
    </main>
  );
}
