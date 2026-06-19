import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Palette,
  Share2,
  TableProperties,
  WandSparkles,
} from "lucide-react";

const MAKER_STEPS = [
  {
    title: "Start trip",
    description: "Name the app and create the workspace.",
    href: "",
    icon: CheckCircle2,
  },
  {
    title: "Add materials",
    description: "Upload confirmations, notes, docs, and screenshots.",
    href: "upload",
    icon: FileUp,
  },
  {
    title: "App sections",
    description: "Choose the sections that belong in this traveler app.",
    href: "review",
    icon: TableProperties,
  },
  {
    title: "Design",
    description: "Pick the name, colors, and visual direction.",
    href: "style",
    icon: Palette,
  },
  {
    title: "Process",
    description: "Turn confirmed materials into the first app draft.",
    href: "data",
    icon: WandSparkles,
  },
  {
    title: "Review",
    description: "Answer questions and resolve flagged details.",
    href: "data",
    icon: TableProperties,
  },
  {
    title: "Publish",
    description: "Share the finished traveler app.",
    href: "publish",
    icon: Share2,
  },
] as const;

export const MAKER_STEP_COUNT = MAKER_STEPS.length;

export function MakerProgress({
  canAccessMaterials = false,
  completedSteps,
  currentStep,
  detail,
  isPaid,
  tripId,
}: {
  canAccessMaterials?: boolean;
  completedSteps: number;
  currentStep: number;
  detail?: string;
  isPaid: boolean;
  tripId: string;
}) {
  const boundedCompletedSteps = Math.max(
    0,
    Math.min(completedSteps, MAKER_STEP_COUNT)
  );
  const progressPercent = Math.round(
    (boundedCompletedSteps / MAKER_STEP_COUNT) * 100
  );

  return (
    <section className="mt-8 overflow-hidden rounded-md border border-moss/25 bg-white shadow-[var(--rw-shadow)]">
      <div className="flex flex-col gap-3 border-b border-moss/15 bg-moss/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-moss"
          href="/maker"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <Link
          className="text-sm font-semibold text-ink/65 transition hover:text-ink"
          href={`/maker/trips/${tripId}`}
        >
          Trip workspace
        </Link>
      </div>
      <div className="p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
            Build path
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            Step {boundedCompletedSteps} of {MAKER_STEP_COUNT} complete
          </h2>
          {detail ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
              {detail}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-moss/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-moss via-tide to-clay"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3 lg:grid-cols-7">
        {MAKER_STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const complete = stepNumber <= boundedCompletedSteps;
          const current = stepNumber === currentStep;
          const available =
            isPaid || stepNumber === 1 || (canAccessMaterials && stepNumber === 2);
          const Icon = step.icon;
          const content = (
            <>
              <Icon
                className={
                  complete
                    ? "text-moss"
                    : current
                      ? "text-clay"
                      : available
                        ? "text-tide"
                        : "text-ink/30"
                }
                size={20}
              />
              <span className="mt-3 block text-sm font-semibold text-ink">
                {step.title}
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink/55">
                {step.description}
              </span>
            </>
          );
          const className = current
            ? "rounded-md border border-clay/35 bg-clay/10 p-3 text-left shadow-sm"
            : "rounded-md border border-ink/10 bg-paper p-3 text-left transition hover:border-moss/25";

          if (!available) {
            return (
              <div className="rounded-md border border-ink/10 bg-paper/70 p-3 opacity-60" key={step.title}>
                {content}
              </div>
            );
          }

          return (
            <Link
              className={className}
              href={`/maker/trips/${tripId}/${step.href}`}
              key={step.title}
            >
              {content}
            </Link>
          );
        })}
      </div>
      </div>
    </section>
  );
}
