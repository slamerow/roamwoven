import { notFound } from "next/navigation";
import { TravelerAppShell } from "@/components/traveler-app-shell";
import { getPublishedTripSnapshotByToken } from "@/lib/published-snapshots";
import { getAsiaDemoTravelerAppViewModel } from "@/lib/traveler-view-model";

export default async function TravelerAppPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (token === "demo") {
    return <TravelerAppShell shareToken="demo" trip={getAsiaDemoTravelerAppViewModel()} />;
  }

  const snapshot = await getPublishedTripSnapshotByToken(token);

  if (!snapshot) {
    notFound();
  }

  return (
    <TravelerAppShell
      shareToken={token}
      trip={snapshot.snapshotJson.travelerApp}
    />
  );
}
