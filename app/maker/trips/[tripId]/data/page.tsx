import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Plane, TableProperties } from "lucide-react";
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
  const palette = derivePalette(style.primaryColor);

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
              Today
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
            App build is ready to simulate
          </h2>
          <p className="mt-3 text-sm leading-6 text-ink/60">
            Roamwoven has the materials for {tripName}. The next backend step is
            to turn these uploads into trip legs, dated cards, stays, travel
            details, phrases, map points, and review questions.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              "Trip spine",
              "Stays and logistics",
              "Daily itinerary",
              "Review questions",
            ].map((item) => (
              <div key={item} className="rounded-md bg-paper p-4">
                <p className="text-sm font-semibold text-ink">{item}</p>
                <p className="mt-1 text-xs font-semibold text-clay">
                  Waiting for extraction
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

      <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
        <h2 className="text-xl font-semibold text-ink">Review queue</h2>
        <p className="mt-3 text-sm leading-6 text-ink/60">
          Once extraction runs, this section should show only the uncertain,
          conflicting, or missing details from this trip.
        </p>
        <div className="mt-5 rounded-md bg-paper p-4">
          <p className="text-sm font-semibold text-ink">
            No generated questions yet.
          </p>
          <p className="mt-1 text-sm leading-5 text-ink/60">
            The current build keeps AI processing off until the paid upload and
            review plumbing is solid.
          </p>
        </div>
      </section>

      <SourceMaterials uploads={uploads} />

      <section className="mt-8 flex justify-end">
        <Link
          href={`/maker/trips/${tripId}/style`}
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
        >
          Choose style
          <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
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

function DemoStructuredData({ tripId, uploads }: { tripId: string; uploads: TripUpload[] }) {
  const trip = getAsiaDemoTrip();
  const stayLegs = trip.legs.filter((leg) => leg.stayName);
  const reviewItems = trip.items.filter((item) =>
    [item.title, item.description, item.address].some((value) =>
      value?.toLowerCase().includes("tbd")
    )
  );

  return (
    <>
      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <CalendarDays className="text-moss" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">
            {trip.dayCount}
          </p>
          <p className="mt-1 text-sm text-ink/60">Trip days</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <MapPin className="text-tide" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">
            {trip.legs.length}
          </p>
          <p className="mt-1 text-sm text-ink/60">City/stay legs</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <TableProperties className="text-clay" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">
            {trip.itemCount}
          </p>
          <p className="mt-1 text-sm text-ink/60">Generated cards</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <Plane className="text-ink/70" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">
            {uploads.length}
          </p>
          <p className="mt-1 text-sm text-ink/60">Source materials</p>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.58fr_0.42fr]">
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">Trip spine</h2>
            <span className="text-sm font-semibold text-clay">
              {stayLegs.length} stays
            </span>
          </div>
          <div className="space-y-3">
            {trip.legs.slice(0, 10).map((leg) => (
              <article
                key={leg.id}
                className="rounded-md border border-ink/10 bg-paper p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {leg.city}, {leg.country}
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      {leg.stayName ?? "Stay needed"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-moss">
                    {formatDate(leg.arriveDate)} / {formatDate(leg.leaveDate)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-ink/10 bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">Review queue</h2>
            <span className="text-sm font-semibold text-clay">
              {reviewItems.length} possible
            </span>
          </div>
          <div className="space-y-3">
            {reviewItems.slice(0, 8).map((item) => (
              <article
                key={item.id}
                className="rounded-md border border-ink/10 bg-paper p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-clay">
                  {item.category ?? "review"}
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {item.title}
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  {item.date ?? "Needs date"}
                </p>
              </article>
            ))}
            {reviewItems.length === 0 ? (
              <p className="text-sm text-ink/60">
                No obvious TBD markers found in the imported seed.
              </p>
            ) : null}
          </div>
        </div>
      </section>

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
              Structured Data
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-ink">
              Clean trip output
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
              {makerTrip.isDemo
                ? "Reference structured data from the demo traveler app."
                : `First-pass structured data for ${makerTrip.name}.`}
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
          <DemoStructuredData tripId={tripId} uploads={uploads} />
        )}
      </div>
    </main>
  );
}
