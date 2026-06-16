import { FileImage, FileSpreadsheet, FileText } from "lucide-react";
import { UploadIntakePanel } from "@/components/upload-intake-panel";

const uploadTypes = [
  { label: "PDF confirmations", icon: FileText },
  { label: "Screenshots", icon: FileImage },
  { label: "Word docs and notes", icon: FileText },
  { label: "Spreadsheets", icon: FileSpreadsheet }
];

const intakePreview = [
  { label: "Travel bookings", count: 6 },
  { label: "Stays", count: 4 },
  { label: "Activities and notes", count: 42 },
  { label: "Need review", count: 10 }
];

export default async function UploadPage({
  params
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <main className="min-h-screen bg-paper px-6 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-ink/10 pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">
            Upload Materials
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">
            Dump everything in
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink/65">
            Trip `{tripId}` is using the beta bypass. Upload processing can be
            tested before Stripe is wired in.
          </p>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <UploadIntakePanel tripId={tripId} />

          <aside className="rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-xl font-semibold text-ink">Intake preview</h2>
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

        <section className="mt-6 grid gap-3 md:grid-cols-4">
          {uploadTypes.map((type) => {
            const Icon = type.icon;
            return (
              <div
                key={type.label}
                className="rounded-md border border-ink/10 bg-white p-4"
              >
                <Icon className="text-tide" size={22} />
                <p className="mt-3 text-sm font-semibold text-ink">
                  {type.label}
                </p>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
