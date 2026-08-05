import type { PublishedTravelerPrivateDetail } from "@/lib/published-snapshots";

export async function resolvePublishedTravelerAccessMode({
  loadPrivateDetails,
  passwordEnabled,
}: {
  loadPrivateDetails: () => Promise<PublishedTravelerPrivateDetail[] | null>;
  passwordEnabled: boolean;
}) {
  if (passwordEnabled) {
    return {
      initialProtectedDetails: [] as PublishedTravelerPrivateDetail[],
      initialUnlocked: false,
    };
  }

  const initialProtectedDetails = await loadPrivateDetails();

  if (!initialProtectedDetails) {
    return null;
  }

  return {
    initialProtectedDetails,
    initialUnlocked: true,
  };
}
