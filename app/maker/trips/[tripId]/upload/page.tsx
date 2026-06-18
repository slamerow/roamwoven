import { Trash2 } from "lucide-react";
import Link from "next/link";
import { MakerProgress } from "@/components/maker-progress";
import { UploadIntakePanel } from "@/components/upload-intake-panel";
import { canEditTripMaterials, getMakerTrip } from "@/lib/trips";
import { listTripUploads } from "@/lib/uploads";

const intakePreview = [
  { label: "Travel bookings", count: 6 },
  { label: "Stays", count: 4 },
  { label: "Activities and notes", count: 42 },
  { label: "Need review", count: 10 }
];

const errorMessages: Record<string, string> = {
  "auth-required": "Sign in again before uploading materials.",
  "checkout-required": "Complete checkout before uploading trip materials.",
  "demo-upload": "The demo trip keeps uploads mocked for now.",
  "empty-upload": "Add at least one file or note before saving.",
  "file-too-large": "One file is over the 25 MB beta limit.",
  "notes-too-large": "Pasted notes are too large for one upload.",
  "too-many-files": "Upload 20 files or fewer at a time.",
  "trip-file-limit":
    "This trip has reached the beta limit of 100 saved materials.",
  "trip-storage-limit":
    "This trip has reached the beta upload storage limit.",
  "unsupported-file": "One file is not a supported beta file type.",
  "delete-failed": "That material could not be deleted. Try again.",
  "duplicate-material":
    "That material already appears to be attached to this trip.",
  "materials-locked":
    "Materials are locked after processing starts. Create a revision instead.",
  "upload-failed":
    "The upload could not be saved. Try a PDF, Word doc, spreadsheet, image, or pasted notes."
};

function formatSize(bytes: number | null) {
  if (!bytes) {
    return "Notes";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function UploadPage({
  params,
  searchParams
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ deleted?: string; error?: string; saved?: string }>;
}) {
  const { tripId } = await params;
  const { deleted, error, saved } = await searchParams;
  const trip = await getMakerTrip(tripId);
  const canUpload = trip.isDemo || trip.paymentStatus === "paid";
  const canEditMaterials = canEditTripMaterials(trip);
  const uploads = canUpload ? await listTripUploads(tripId) : [];

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-ink/10 pb-6">
          <h1 className="text-4xl font-semibold text-ink">
            Drop everything in
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink/65">
            {canUpload
              ? "Upload flight and hotel confirmations, screenshots, documents, spreadsheets, and notes."
              : "Complete checkout to start adding trip materials."}
          </p>
        </header>

        <MakerProgress
          completedSteps={uploads.length > 0 ? 2 : 1}
          currentStep={2}
          detail={
            canEditMaterials
              ? "Add and remove source materials freely before the first app build starts."
              : "Materials from the first build are locked. Small later additions should go through a limited update lane."
          }
          isPaid={canUpload}
          tripId={tripId}
        />

        {!canUpload ? (
          <section className="mt-8 rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-xl font-semibold text-ink">
              Checkout required
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
              Complete checkout once, then upload the documents and notes for
              this trip.
            </p>
            <Link
              href={`/maker/trips/${tripId}`}
              className="mt-5 inline-flex rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
            >
              Return to checkout
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                {saved ? (
                  <p className="mb-4 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
                    Saved {saved} upload{saved === "1" ? "" : "s"}.
                  </p>
                ) : null}
                {deleted ? (
                  <p className="mb-4 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
                    Material deleted.
                  </p>
                ) : null}
                {error ? (
                  <p className="mb-4 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
                    {errorMessages[error] ?? errorMessages["upload-failed"]}
                  </p>
                ) : null}
                <UploadIntakePanel tripId={tripId} />
              </div>

              <aside className="rounded-md border border-ink/10 bg-white p-5">
                <h2 className="text-xl font-semibold text-ink">
                  Intake preview
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  This is the kind of summary beta users should see after processing.
                </p>
                <div className="mt-5 space-y-3">
                  {intakePreview.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-md bg-paper px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-ink">
                        {item.label}
                      </span>
                      <span className="text-sm font-semibold text-clay">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </aside>
            </section>

            <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-ink">
                    Saved materials
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-ink/60">
                    Files and notes saved for this trip will stay here after refresh.
                    {canEditMaterials
                      ? " You can remove anything before generation starts."
                      : " Materials from the first build lock once generation starts."}
                  </p>
                </div>
                {uploads.length > 0 ? (
                  <Link
                    href={`/maker/trips/${tripId}/review`}
                    className="inline-flex justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                  >
                    Continue to app setup
                  </Link>
                ) : null}
              </div>

              {uploads.length > 0 ? (
                <div className="mt-5 space-y-2">
                  {uploads.map((upload) => (
                    <div
                      key={upload.id}
                      className="grid gap-3 rounded-md bg-paper px-4 py-3 md:grid-cols-[1fr_auto_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {upload.originalFilename}
                        </p>
                        <p className="mt-1 text-xs text-ink/50">
                          {formatDate(upload.createdAt)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-ink/55">
                        {formatSize(upload.fileSizeBytes)}
                      </p>
                      <p className="text-sm font-semibold capitalize text-moss">
                        {upload.processingStatus}
                      </p>
                      {canEditMaterials ? (
                        <form
                          action={`/maker/trips/${tripId}/upload/materials/${upload.id}/delete`}
                          method="post"
                        >
                          <button
                            aria-label={`Delete ${upload.originalFilename}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink/10 bg-white text-ink/55 transition hover:border-clay/30 hover:text-clay"
                            type="submit"
                          >
                            <Trash2 size={16} />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-md bg-paper px-4 py-3 text-sm text-ink/60">
                  Nothing saved yet.
                </p>
              )}
            </section>

            <section className="mt-6 rounded-md border border-tide/20 bg-tide/10 p-5">
              <h2 className="text-xl font-semibold text-ink">
                Add what you have now. Update the app later.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
                Before the first build, you can add or remove source materials
                here. Once the app has a core trip shape, new simple documents
                should update that app instead of starting over.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
