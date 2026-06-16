import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, HelpCircle } from "lucide-react";

const sections = [
  { title: "Trip structure", status: "complete", remaining: 0 },
  { title: "Travel", status: "current", remaining: 4 },
  { title: "Stays", status: "pending", remaining: 2 },
  { title: "Plans", status: "pending", remaining: 10 },
  { title: "Style", status: "pending", remaining: 2 }
];

const currentQuestions = [
  {
    label: "Flight time",
    question: "Is Alaska 233 departing Seattle at 1:53 PM on July 2?",
    detail: "We found slightly different times across two source notes."
  },
  {
    label: "Transfer needed",
    question: "How are you getting from Kahului Airport to Kihei?",
    detail: "We can create a placeholder card if this is not booked yet."
  },
  {
    label: "Missing placement",
    question: "Where should 'Road to Hana snacks' appear?",
    detail: "This note has a city clue but no clear date."
  }
];

export default async function ReviewPage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-ink/10 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Intake Review
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Confirm the important stuff
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Trip `{tripId}` has a beta review queue. Public launch will generate
            these questions from extraction confidence and conflicts.
          </p>
        </header>

        <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">
                Review progress
              </h2>
              <p className="mt-1 text-sm text-ink/60">
                8 of 26 review items complete
              </p>
            </div>
            <div className="h-3 w-full rounded-full bg-ink/10 md:w-72">
              <div className="h-3 w-[31%] rounded-full bg-moss" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            {sections.map((section) => {
              const Icon =
                section.status === "complete"
                  ? CheckCircle2
                  : section.status === "current"
                    ? HelpCircle
                    : Circle;
              return (
                <div
                  key={section.title}
                  className="rounded-md border border-ink/10 bg-paper p-4"
                >
                  <Icon
                    className={
                      section.status === "complete"
                        ? "text-moss"
                        : section.status === "current"
                          ? "text-clay"
                          : "text-ink/35"
                    }
                    size={20}
                  />
                  <p className="mt-3 text-sm font-semibold text-ink">
                    {section.title}
                  </p>
                  <p className="mt-1 text-xs text-ink/55">
                    {section.remaining} remaining
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.72fr_0.28fr]">
          <div className="space-y-4">
            {currentQuestions.map((question) => (
              <article
                key={question.question}
                className="rounded-md border border-ink/10 bg-white p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                  {question.label}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  {question.question}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  {question.detail}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper">
                    Confirm
                  </button>
                  <button className="rounded-md border border-ink/15 px-4 py-3 text-sm font-semibold text-ink">
                    Edit answer
                  </button>
                  <button className="rounded-md border border-ink/15 px-4 py-3 text-sm font-semibold text-ink">
                    Use placeholder
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-lg font-semibold text-ink">Next step</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              After review, Roamwoven generates a private app preview. Skipped
              items stay visible as placeholder cards.
            </p>
            <Link
              href={`/maker/trips/${tripId}/data`}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
            >
              View clean data
              <ArrowRight size={16} />
            </Link>
          </aside>
        </section>
      </div>
    </main>
  );
}
