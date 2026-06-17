import { TravelerAppShell } from "@/components/traveler-app-shell";
import { getAsiaDemoTrip } from "@/lib/asia-trip";

export default function TravelerAppPage() {
  return <TravelerAppShell trip={getAsiaDemoTrip()} />;
}
