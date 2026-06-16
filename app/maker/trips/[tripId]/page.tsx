import Link from "next/link";
import { CheckCircle2, CreditCard, FileUp, WandSparkles } from "lucide-react";

const stages = [
  {
    title: "Create trip",
    description: "Trip shell is ready.",
    state: "complete",
    icon: CheckCircle2
  },
  {
    title: "Pay once",
    description: "Required before AI review starts.",
    state: "current",
    icon: CreditCard
  },
  {
    title: "Upload materials",
    description: "PDFs, screenshots, docs, sheets, and notes.",
    state: "locked",
    icon: FileUp
  },
  {
    title: "Generate app",
    description: "Review questions, preview, and publish.",
    state: "locked",
    icon: WandSparkles
  }
];

export default async function TripWorkspacePage({
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
            Trip Workspace
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Japan Family Trip
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Trip ID `{tripId}` is in beta mode. Payment is bypassed for local
            testing and friends-and-family beta runs.
          </p>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.title}
                className="rounded-md border border-ink/10 bg-white p-4"
              >
                <Icon
                  className={
                    stage.state === "complete"
                      ? "text-moss"
                      : stage.state === "current"
                        ? "text-clay"
                        : "text-ink/30"
                  }
                  size={22}
                />
                <p className="mt-4 text-sm font-semibold text-ink">
                  {stage.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  {stage.description}
                </p>
              </div>
            );
          })}
        </section>

        <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">Beta bypass enabled</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
            Public launch should charge before extraction so customers cannot
            run expensive document review and leave before purchasing. For beta,
            this trip can continue straight to upload.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/maker/trips/${tripId}/upload`}
              className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
            >
              Continue to upload
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
