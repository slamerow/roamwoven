import { FileImage, FileSpreadsheet, FileText, Lock } from "lucide-react";

const uploadTypes = [
  { label: "PDF confirmations", icon: FileText },
  { label: "Screenshots", icon: FileImage },
  { label: "Word docs and notes", icon: FileText },
  { label: "Spreadsheets", icon: FileSpreadsheet }
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

        <section className="mt-8 rounded-md border border-dashed border-ink/20 bg-white p-8 text-center">
          <Lock className="mx-auto text-moss" size={28} />
          <h2 className="mt-4 text-xl font-semibold text-ink">
            Upload area placeholder
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink/65">
            This will accept PDFs, screenshots, docs, spreadsheets, and pasted
            trip notes for Roamwoven's intake review. During beta, this screen is
            reachable without payment.
          </p>
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
