import { TravelerAppShell } from "@/components/traveler-app-shell";
import { getAsiaDemoTravelerAppViewModel } from "@/lib/traveler-view-model";

export default function TravelerAppPage() {
  return <TravelerAppShell trip={getAsiaDemoTravelerAppViewModel()} />;
}
