import Link from "next/link";
import { ArrowRight } from "lucide-react";

const steps = [
  "Pay once for your trip",
  "Upload confirmations, screenshots, docs, and notes",
  "Answer a guided review",
  "Publish your private mobile trip app"
];

const perfectFor = [
  {
    title: "Solo travel",
    description:
      "Stay oriented without relying on someone else to remember the plan, the address, or what comes next."
  },
  {
    title: "Couples trips",
    description:
      "Make the once-or-twice-a-year trip feel effortless, with reservations, ideas, and daily logistics in one shared place."
  },
  {
    title: "Family adventures",
    description:
      "Keep kids, grandparents, and follow-along family in the loop without forwarding every email or spreadsheet."
  }
];

const demoPanels = [
  {
    eyebrow: "Today",
    title: "Swipe through the day",
    description:
      "A clean daily feed keeps flights, stays, activities, meals, and notes in the order you need them.",
    image: "/demo/example-today.jpg"
  },
  {
    eyebrow: "Details",
    title: "Tap a card for the full story",
    description:
      "Confirmation numbers, addresses, notes, links, and context live inside the card instead of buried in your inbox.",
    image: "/demo/example-detail.jpg"
  },
  {
    eyebrow: "Browse",
    title: "Jump by leg, category, or date",
    description:
      "Find a city, all food plans, or a specific calendar day in a couple of taps.",
    image: "/demo/example-calendar.jpg"
  },
  {
    eyebrow: "Tools",
    title: "Search, weather, phrases, and maps",
    description:
      "The top controls keep practical travel tools close without turning the app into clutter.",
    image: "/demo/example-map.jpg"
  },
  {
    eyebrow: "Photos",
    title: "A follow-along album",
    description:
      "Friends and family can follow the trip through photos tagged by place, date, and moment.",
    image: null
  }
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
            The superapp for your next adventure
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/75">
            All the information you need, right at your fingertips. It&apos;s
            vacation time. Don&apos;t spend it digging through emails and PDFs.
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/75">
            Roamwoven is a custom one-stop shop for your travels: flight and
            hotel details, itinerary info, useful phrases, and all the
            information you need, never more than two or three clicks away.
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/75">
            I&apos;m a travel nerd. When I took my family on a five-month
            sabbatical across 11 countries, I used AI to build the travel app
            of my dreams. Roamwoven lets you build your own superapp in just 30
            to 60 minutes.
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

        <div className="flex flex-col items-center justify-center gap-4">
          <DemoClip
            alt="Example Today screen in a generated trip app"
            image="/demo/example-today.jpg"
          />
          <p className="max-w-xs text-center text-sm leading-6 text-ink/60">
            A real traveler-app style Today screen: the day&apos;s plans,
            cards, tools, and trip navigation in one pocket-sized place.
          </p>
        </div>
      </section>

      <section className="border-t border-ink/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Perfect for
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {perfectFor.map((item) => (
              <article
                className="rounded-md border border-ink/10 bg-paper p-5"
                key={item.title}
              >
                <h2 className="text-xl font-semibold text-ink">
                  {item.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-ink/65">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-ink/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14 md:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
              What it can do
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight text-ink md:text-5xl">
              The practical stuff stays close.
            </h2>
            <p className="mt-4 text-lg leading-8 text-ink/70">
              The first screen sells the feeling. The next screens show the
              specifics: tap into details, browse by the way your brain works,
              search across the trip, check weather and phrases, visualize the
              route, and share photos with people following along.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-5">
            {demoPanels.map((panel) => (
              <article
                className="rounded-md border border-ink/10 bg-paper p-4"
                key={panel.title}
              >
                {panel.image ? (
                  <DemoClip alt={`${panel.title} demo`} image={panel.image} />
                ) : (
                  <PhotoPlaceholder />
                )}
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                  {panel.eyebrow}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink">
                  {panel.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink/65">
                  {panel.description}
                </p>
              </article>
            ))}
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

function DemoClip({ alt, image }: { alt: string; image: string }) {
  return (
    <div className="mx-auto aspect-[390/844] max-w-[210px] overflow-hidden rounded-[28px] border-[8px] border-ink bg-white shadow-xl">
      <img alt={alt} className="h-full w-full object-cover" src={image} />
    </div>
  );
}

function PhotoPlaceholder() {
  return (
    <div className="mx-auto aspect-[390/844] max-w-[210px] overflow-hidden rounded-[28px] border-[8px] border-ink bg-white shadow-xl">
      <div className="flex h-full flex-col bg-paper p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-moss">
          Photo album
        </p>
        <h4 className="mt-1 text-lg font-semibold text-ink">
          Follow along by place and date
        </h4>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {["Kyoto", "Hoi An", "Bangkok", "Tokyo"].map((label, index) => (
            <div
              className="aspect-square rounded-md bg-ink p-2 text-paper"
              key={label}
            >
              <p className="text-[10px] font-semibold">Day {index + 12}</p>
              <p className="mt-10 text-xs font-semibold">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-auto rounded-md bg-white px-3 py-2 text-[11px] leading-4 text-ink/60">
          Dummy photo data will show friends and family a tagged, organized
          album without exposing the maker dashboard.
        </p>
      </div>
    </div>
  );
}
