export function CreateTripForm({ error }: { error?: string }) {
  return (
    <form
      action="/maker/trips/create"
      className="mt-8 space-y-5 rounded-md border border-ink/10 bg-white p-5"
      method="post"
    >
      <label className="block">
        <span className="text-sm font-semibold text-ink">Trip name</span>
        <input
          className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
          name="name"
          placeholder="The Millers in Japan"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Description</span>
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-ink/15 px-3 py-3 text-sm leading-6"
          name="description"
          placeholder="A short description of the trip, who it is for, and what kind of app you want."
        />
      </label>

      {error === "missing-name" ? (
        <p className="rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
          Add a trip name before continuing.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="inline-flex justify-center rounded-md bg-ink px-5 py-3 text-sm font-semibold text-paper"
          type="submit"
        >
          Continue to checkout
        </button>
        <p className="text-sm leading-6 text-ink/55">
          Source materials are saved on the upload step so nothing looks
          attached before it is actually stored.
        </p>
      </div>
    </form>
  );
}
