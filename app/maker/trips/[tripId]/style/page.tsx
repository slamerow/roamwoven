import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const palettes = [
  {
    name: "Forest Clay",
    colors: ["#20211f", "#526247", "#a05b43", "#faf8f2"]
  },
  {
    name: "Coastal",
    colors: ["#19333a", "#3d7280", "#d38b5d", "#f7f2e8"]
  },
  {
    name: "Market Day",
    colors: ["#26312a", "#6f8b52", "#bd6648", "#fff8e7"]
  }
];

export default async function StylePage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-ink/10 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            App Style
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Make it feel like your trip
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Trip `{tripId}` keeps customization intentionally simple for V1:
            name, palette, and later a cover image.
          </p>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.48fr_0.52fr]">
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <label className="block">
              <span className="text-sm font-semibold text-ink">App name</span>
              <input
                className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
                defaultValue="Wren's Adventure"
              />
            </label>

            <div className="mt-6">
              <p className="text-sm font-semibold text-ink">Color palette</p>
              <div className="mt-3 space-y-3">
                {palettes.map((palette, index) => (
                  <button
                    key={palette.name}
                    className="flex w-full items-center justify-between rounded-md border border-ink/10 bg-paper p-3 text-left"
                    type="button"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {palette.name}
                      </p>
                      <div className="mt-2 flex gap-1">
                        {palette.colors.map((color) => (
                          <span
                            key={color}
                            className="h-5 w-8 rounded-sm border border-ink/10"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                    {index === 0 ? <Check className="text-moss" size={20} /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-ink p-5 text-paper">
            <p className="text-sm text-paper/70">Preview</p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight">
              Wren's Adventure
            </h2>
            <p className="mt-3 text-sm leading-6 text-paper/70">
              A private trip app generated from clean structured data.
            </p>
            <div className="mt-6 space-y-3">
              <div className="rounded-md bg-paper p-4 text-ink">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                  Travel
                </p>
                <p className="mt-2 text-sm font-semibold">Fly to Seattle</p>
              </div>
              <div className="rounded-md bg-paper p-4 text-ink">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                  Stay
                </p>
                <p className="mt-2 text-sm font-semibold">Airbnb Kihei</p>
              </div>
            </div>
            <Link
              href={`/maker/trips/${tripId}/publish`}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-paper px-4 py-3 text-sm font-semibold text-ink"
            >
              Publish app
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
