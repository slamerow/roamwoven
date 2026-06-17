import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Plane, TableProperties } from "lucide-react";
import {
  StructuredReviewPanel,
  type ReviewSection,
} from "@/components/structured-review-panel";
import { getAsiaDemoTrip } from "@/lib/asia-trip";
import { APP_MODULES, type TripBuildSettings } from "@/lib/build-settings-config";
import { getTripBuildSettings } from "@/lib/build-settings";
import {
  derivePalette,
  getThemeDirection,
  type TripStyleSettings,
} from "@/lib/style-settings-config";
import { getTripStyleSettings } from "@/lib/style-settings";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads, type TripUpload } from "@/lib/uploads";

function formatDate(date?: string | null) {
  if (!date) {
    return "TBD";
  }

  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatUploadDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatSize(bytes: number | null) {
  if (!bytes) {
    return "Notes";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStylePalette(style: TripStyleSettings) {
  const derived = derivePalette(style.primaryColor);

  return {
    primary: style.primaryColor,
    secondary: style.secondaryColor ?? derived.secondary,
    accent: style.accentColor ?? derived.accent,
    soft: style.softColor ?? derived.soft,
  };
}

function RealTripFirstPass({
  tripId,
  tripName,
  uploads,
  settings,
  style,
}: {
  tripId: string;
  tripName: string;
  uploads: TripUpload[];
  settings: TripBuildSettings;
  style: TripStyleSettings;
}) {
  const noteCount = uploads.filter((upload) => upload.storagePath === null).length;
  const fileCount = uploads.length - noteCount;
  const selectedModules = APP_MODULES.filter(
    (module) => settings.enabledModules[module.key]
  );
  const theme = getThemeDirection(style.themeDirection);
  const palette = getStylePalette(style);
  const sections = getMockReviewSections({
    selectedModules,
    tripName,
    uploads,
  });

  return (
    <>
      <section
        className="mt-8 rounded-md border border-ink/10 p-5"
        style={{ backgroundColor: theme.text, color: theme.surface }}
      >
        <div className="grid gap-5 md:grid-cols-[0.56fr_0.44fr] md:items-center">
          <div>
            <p className="text-sm font-semibold" style={{ color: palette.accent }}>
              Draft review style
            </p>
            <h2 className="mt-2 text-3xl font-semibold">
              {style.appName || tripName}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 opacity-75">
              Review the draft in the same visual direction the traveler app will
              use. Changing color or theme later is a rendering update, not
              another parsing pass.
            </p>
          </div>
          <div className="rounded-md p-4" style={{ backgroundColor: theme.surface, color: theme.text }}>
            <p className="text-xs font-semibold uppercase" style={{ color: palette.primary }}>
              Draft review
            </p>
            <p className="mt-2 text-sm font-semibold">Draft card preview</p>
            <p className="mt-1 text-sm opacity-65">
              Missing details and manual additions will appear in this style.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <TableProperties className="text-moss" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">
            {uploads.length}
          </p>
          <p className="mt-1 text-sm text-ink/60">Source materials</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <Plane className="text-tide" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">{fileCount}</p>
          <p className="mt-1 text-sm text-ink/60">Uploaded files</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <CalendarDays className="text-clay" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">{noteCount}</p>
          <p className="mt-1 text-sm text-ink/60">Notes saved</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <MapPin className="text-ink/70" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">Pending</p>
          <p className="mt-1 text-sm text-ink/60">Extraction status</p>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">
            Structured draft is mocked for review
          </h2>
          <p className="mt-3 text-sm leading-6 text-ink/60">
            Roamwoven has the materials for {tripName}. This scaffold shows the
            review workflow using saved uploads and selected modules while
            extraction stays off.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              "Trip overview",
              "Dates and places",
              "Flights and transport",
              "Stays and activities",
            ].map((item) => (
              <div key={item} className="rounded-md bg-paper p-4">
                <p className="text-sm font-semibold text-ink">{item}</p>
                <p className="mt-1 text-xs font-semibold text-clay">
                  Mocked from current state
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-ink/10 bg-white p-5">
          <h2 className="text-xl font-semibold text-ink">Selected app sections</h2>
          <p className="mt-3 text-sm leading-6 text-ink/60">
            These choices were confirmed before the app build and will eventually
            drive which modules appear in the traveler app.
          </p>
          <div className="mt-5 grid gap-2">
            {selectedModules.map((module) => (
              <div
                key={module.key}
                className="flex items-center justify-between rounded-md bg-paper px-4 py-3"
              >
                <span className="text-sm font-semibold text-ink">
                  {module.title}
                </span>
                <span className="text-xs font-semibold text-moss">On</span>
              </div>
            ))}
            {selectedModules.length === 0 ? (
              <p className="rounded-md bg-paper p-4 text-sm text-ink/60">
                No modules selected.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <StructuredReviewPanel initialSections={sections} />

      <SourceMaterials uploads={uploads} />

      <section className="mt-8 flex justify-end">
        <Link
          href={`/maker/trips/${tripId}/publish`}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
        >
          Continue to publish
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}

function getMockReviewSections({
  selectedModules,
  tripName,
  uploads,
}: {
  selectedModules: Array<(typeof APP_MODULES)[number]>;
  tripName: string;
  uploads: TripUpload[];
}): ReviewSection[] {
  const latestUpload = uploads[0];
  const sourceLabel =
    latestUpload?.originalFilename ?? `${uploads.length} saved material inputs`;

  return [
    {
      id: "overview",
      title: "Trip overview",
      eyebrow: "Scope",
      summary: "The top-level app identity and source bundle for this build.",
      tone: "good",
      items: [
        {
          id: "overview-name",
          title: tripName,
          meta: "App name",
          detail: `${uploads.length} saved material${
            uploads.length === 1 ? "" : "s"
          } will feed the first structured draft.`,
          status: "confirmed",
        },
        {
          id: "overview-source",
          title: "Primary source bundle",
          meta: sourceLabel,
          detail:
            "Extraction is still mocked, but this review screen is shaped around the real paid-trip upload state.",
          status: "draft",
        },
      ],
    },
    {
      id: "places",
      title: "Dates and places",
      eyebrow: "Trip spine",
      summary: "The city sequence and date range Roamwoven thinks it should build around.",
      tone: "warning",
      items: [
        {
          id: "places-dates",
          title: "Trip dates need extraction",
          meta: "Missing exact dates",
          detail:
            "Use this review section to confirm dates before the traveler app anchors Today, maps, weather, and daily cards.",
          status: "needs_review",
        },
        {
          id: "places-destinations",
          title: "Destinations from materials",
          meta: "Pending parser",
          detail:
            "Future extraction should produce ordered legs here instead of forcing the maker to type a full itinerary.",
          status: "draft",
        },
      ],
    },
    {
      id: "transport",
      title: "Flights and transport",
      eyebrow: "Logistics",
      summary: "Travel records stay optional and only appear when relevant.",
      tone: "manual",
      items: [
        {
          id: "transport-flight",
          title: selectedModules.some((module) => module.key === "travel")
            ? "Transport module selected"
            : "Transport module skipped",
          meta: "Module choice",
          detail:
            "The final app should hide this section when no flights, trains, cars, or transfers are found.",
          status: selectedModules.some((module) => module.key === "travel")
            ? "draft"
            : "confirmed",
        },
      ],
    },
    {
      id: "stays",
      title: "Stays",
      eyebrow: "Lodging",
      summary: "Hotels, rentals, and host notes will be reviewed separately from daily activities.",
      tone: "sensitive",
      items: [
        {
          id: "stays-sensitive",
          title: "Exact stay details may need protection",
          meta: "Privacy review",
          detail:
            "Private addresses, door codes, host phone numbers, and reservation numbers can sit behind a password while the public card remains useful.",
          status: "protected",
        },
      ],
    },
    {
      id: "activities",
      title: "Daily activities/cards",
      eyebrow: "Traveler app cards",
      summary: "This is where dated plans, food, tours, reminders, and notes become cards.",
      tone: "good",
      items: [
        {
          id: "activities-anchor",
          title: "Anchor activities",
          meta: "Draft card shape",
          detail:
            "Broad arcs such as a full-day drive can stay as anchor cards, with important stops split out only when they need their own map, time, permit, or note.",
          status: "draft",
        },
        {
          id: "activities-count",
          title: "Avoid filler cards",
          meta: "Quality check",
          detail:
            "The review should preserve the traveler's mental model instead of maximizing card count.",
          status: "confirmed",
        },
      ],
    },
    {
      id: "missing",
      title: "Missing or ambiguous details",
      eyebrow: "Questions",
      summary: "Only ask the maker for details that change the generated app.",
      tone: "warning",
      items: [
        {
          id: "missing-times",
          title: "Confirm exact times where they matter",
          meta: "Question prompt",
          detail:
            "Use prompts for flights, reservations, check-in windows, tours, and other time-sensitive logistics.",
          status: "needs_review",
        },
        {
          id: "missing-places",
          title: "Resolve unnamed places",
          meta: "Question prompt",
          detail:
            "Ask for enough context to choose the right place without making users edit raw data tables.",
          status: "needs_review",
        },
      ],
    },
    {
      id: "manual",
      title: "Manual additions",
      eyebrow: "Maker edits",
      summary: "Makers can add details that were never present in the uploaded materials.",
      tone: "manual",
      items: [
        {
          id: "manual-add",
          title: "Add a missing flight, stay, activity, restaurant, note, or placeholder",
          meta: "Manual add",
          detail:
            "Manual additions should update structured data cheaply without requiring another paid extraction run.",
          status: "draft",
        },
      ],
    },
  ];
}

function SourceMaterials({ uploads }: { uploads: TripUpload[] }) {
  return (
    <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Source materials</h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            These are the saved inputs attached to this trip.
          </p>
        </div>
        <span className="text-sm font-semibold text-moss">
          {uploads.length} saved
        </span>
      </div>

      {uploads.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {uploads.map((upload) => (
            <div key={upload.id} className="rounded-md bg-paper p-4">
              <p className="truncate text-sm font-semibold text-ink">
                {upload.originalFilename}
              </p>
              <p className="mt-1 text-xs text-ink/50">
                {formatUploadDate(upload.createdAt)} ·{" "}
                {formatSize(upload.fileSizeBytes)}
              </p>
              <p className="mt-1 text-xs font-semibold capitalize text-moss">
                {upload.processingStatus}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-md bg-paper p-4 text-sm text-ink/60">
          No saved materials yet.
        </p>
      )}
    </section>
  );
}

function DemoStructuredData({ uploads }: { uploads: TripUpload[] }) {
  const trip = getAsiaDemoTrip();
  const stayLegs = trip.legs.filter((leg) => leg.stayName);
  const reviewItems = trip.items.filter((item) =>
    [item.title, item.description, item.address].some((value) =>
      value?.toLowerCase().includes("tbd")
    )
  );
  const transportItems = trip.items.filter((item) =>
    ["flight", "transport", "transfer", "train", "rental"].some((token) =>
      `${item.category ?? ""} ${item.title}`.toLowerCase().includes(token)
    )
  );
  const sensitiveItems = [
    ...stayLegs
      .filter((leg) => leg.stayAddress)
      .slice(0, 4)
      .map((leg) => ({
        id: `sensitive-${leg.id}`,
        title: leg.stayName ?? `${leg.city} stay`,
        meta: `${leg.city ?? "Stay"} address`,
        detail:
          "Exact lodging address can be password-protected inside the card details.",
        status: "protected" as const,
      })),
    ...trip.items
      .filter((item) =>
        `${item.title} ${item.description ?? ""}`.toLowerCase().includes("code")
      )
      .slice(0, 2)
      .map((item) => ({
        id: `sensitive-${item.id}`,
        title: item.title,
        meta: item.category ?? "card detail",
        detail:
          "Codes, private notes, and confirmation details should be reviewed before sharing.",
        status: "protected" as const,
      })),
  ];
  const sections: ReviewSection[] = [
    {
      id: "overview",
      title: "Trip overview",
      eyebrow: "Scope",
      summary: "The seed data gives the review screen realistic trip scale.",
      tone: "good",
      items: [
        {
          id: "overview-name",
          title: trip.name,
          meta: trip.dateRange,
          detail: `${trip.countries.join(", ")} with ${trip.dayCount} days and ${
            trip.itemCount
          } imported cards.`,
          status: "confirmed",
        },
      ],
    },
    {
      id: "places",
      title: "Dates and places",
      eyebrow: "Trip spine",
      summary: "Ordered legs are the backbone for Today, maps, weather, and search.",
      tone: "good",
      items: trip.legs.slice(0, 8).map((leg) => ({
        id: `place-${leg.id}`,
        title: [leg.city, leg.country].filter(Boolean).join(", "),
        meta: `${formatDate(leg.arriveDate)} / ${formatDate(leg.leaveDate)}`,
        detail: leg.stayName ?? "Stay details still need review.",
        status: leg.stayName ? "confirmed" : "needs_review",
      })),
    },
    {
      id: "transport",
      title: "Flights and transport",
      eyebrow: "Logistics",
      summary: "Travel records should stay reviewable without forcing a module when none exists.",
      tone: transportItems.length > 0 ? "good" : "manual",
      items:
        transportItems.length > 0
          ? transportItems.slice(0, 6).map((item) => ({
              id: `transport-${item.id}`,
              title: item.title,
              meta: item.date ?? "Needs date",
              detail: item.description ?? "Transport details need review.",
              status: item.date ? "draft" : "needs_review",
            }))
          : [
              {
                id: "transport-none",
                title: "No obvious transport records in seed sample",
                meta: "Module check",
                detail:
                  "The final traveler app should not show a flight placeholder just to fill the template.",
                status: "confirmed",
              },
            ],
    },
    {
      id: "stays",
      title: "Stays",
      eyebrow: "Lodging",
      summary: "Stays are separate from daily cards so addresses and check-in notes can be protected.",
      tone: "sensitive",
      items: stayLegs.slice(0, 8).map((leg) => ({
        id: `stay-${leg.id}`,
        title: leg.stayName ?? `${leg.city} stay`,
        meta: [leg.city, leg.country].filter(Boolean).join(", "),
        detail: leg.stayAddress
          ? "Address is present and should be privacy-reviewed."
          : "Stay name exists, but address details still need review.",
        status: leg.stayAddress ? "protected" : "needs_review",
      })),
    },
    {
      id: "activities",
      title: "Daily activities/cards",
      eyebrow: "Cards",
      summary: "A few representative cards show how the imported itinerary becomes traveler app content.",
      tone: "good",
      items: trip.days
        .flatMap((day) =>
          day.items.slice(0, 2).map((item) => ({
            id: `activity-${item.id}`,
            title: item.title,
            meta: `${day.label} / ${item.category}`,
            detail: item.description,
            status: "draft" as const,
          }))
        )
        .slice(0, 10),
    },
    {
      id: "missing",
      title: "Missing or ambiguous details",
      eyebrow: "Questions",
      summary: "Generated prompts should focus on details that change the final app.",
      tone: "warning",
      items:
        reviewItems.length > 0
          ? reviewItems.slice(0, 6).map((item) => ({
              id: `missing-${item.id}`,
              title: item.title,
              meta: item.category ?? "review",
              detail: item.description ?? "Needs clearer details before publish.",
              status: "needs_review",
            }))
          : [
              {
                id: "missing-sample",
                title: "No obvious TBD markers found",
                meta: "Seed scan",
                detail:
                  "This section is still useful for extraction conflicts, missing dates, and unclear place matches.",
                status: "draft",
              },
            ],
    },
    {
      id: "sensitive",
      title: "Sensitive card details",
      eyebrow: "Privacy",
      summary: "Specific private details can be protected while the card remains visible.",
      tone: "sensitive",
      items:
        sensitiveItems.length > 0
          ? sensitiveItems
          : [
              {
                id: "sensitive-sample",
                title: "Sensitive details need maker review",
                meta: "Password protection",
                detail:
                  "Door codes, private addresses, confirmation numbers, and personal notes can be kept behind the app password.",
                status: "protected",
              },
            ],
    },
    {
      id: "manual",
      title: "Manual additions",
      eyebrow: "Maker edits",
      summary: "The maker can add records that were not in the imported workbook.",
      tone: "manual",
      items: [
        {
          id: "manual-add",
          title: "Add a flight, stay, activity, restaurant, note, or placeholder",
          meta: "Manual add",
          detail:
            "This scaffold keeps additions visible without making extraction the only way to improve the app.",
          status: "draft",
        },
      ],
    },
  ];

  return (
    <>
      <StructuredReviewPanel initialSections={sections} />
      <SourceMaterials uploads={uploads} />
    </>
  );
}

export default async function StructuredDataPage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const makerTrip = await getMakerTrip(tripId);
  const canShowUploads = makerTrip.isDemo || makerTrip.paymentStatus === "paid";
  const uploads = canShowUploads ? await listTripUploads(tripId) : [];
  const settings = await getTripBuildSettings(tripId);
  const style = await getTripStyleSettings({
    fallbackAppName: makerTrip.name,
    tripId,
  });

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-ink/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
              Draft Review
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-ink">
              Check the structured trip data
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
              {makerTrip.isDemo
                ? "Review the seeded Wren's Adventure data as if Roamwoven had extracted it."
                : `Review the mocked first structured draft for ${makerTrip.name}.`}
            </p>
          </div>
          {makerTrip.isDemo ? (
            <Link
              href={`/maker/trips/${tripId}/style`}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
            >
              Choose style
              <ArrowRight size={16} />
            </Link>
          ) : null}
        </header>

        {!makerTrip.isDemo ? (
          <RealTripFirstPass
            tripId={tripId}
            tripName={makerTrip.name}
            uploads={uploads}
            settings={settings}
            style={style}
          />
        ) : (
          <DemoStructuredData uploads={uploads} />
        )}
      </div>
    </main>
  );
}
