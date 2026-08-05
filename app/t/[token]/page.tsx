import { notFound } from "next/navigation";
import { TravelerAppShell } from "@/components/traveler-app-shell";
import {
  getPublishedTripAccessStateByToken,
  getPublishedTripPrivateDetailsByToken,
} from "@/lib/published-snapshots";
import { resolvePublishedTravelerAccessMode } from "@/lib/published-traveler-access";
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

  const accessState = await getPublishedTripAccessStateByToken(token);

  if (!accessState) {
    notFound();
  }

  const travelerAccess = await resolvePublishedTravelerAccessMode({
    loadPrivateDetails: () => getPublishedTripPrivateDetailsByToken(token),
    passwordEnabled: accessState.passwordEnabled,
  });

  // The second token validation inside the private-detail read closes the
  // publication-revocation race between access-state and detail loading.
  if (!travelerAccess) {
    notFound();
  }

  return (
    <TravelerAppShell
      initialProtectedDetails={travelerAccess.initialProtectedDetails}
      initialUnlocked={travelerAccess.initialUnlocked}
      shareToken={token}
      trip={accessState.snapshot.snapshotJson.travelerApp}
    />
  );
}
