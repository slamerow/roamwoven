import {
  asDraftObject,
  type DraftObject,
} from "@/lib/extraction/draft-value";
import { type GroupingKind } from "@/lib/trip-card-taxonomy";

export type TripDraftConsolidationDebug = {
  foldedLodgingNotes: Array<{
    title: string;
    stayTitle: string | null;
  }>;
  mergedCityNotes: Array<{
    city: string;
    sections: string[];
    sourceTitles: string[];
  }>;
  normalizedOptionalActivities: Array<{
    title: string;
    updatedTitle: string;
  }>;
  normalizedRentalCarPickups: Array<{
    date: string | null;
    title: string;
  }>;
  overproductionRetry: {
    averagePlansPerDay: number;
    maxPlansPerDay: number;
    triggered: boolean;
  };
  promotedTravelActivities: Array<{
    date: string | null;
    promotedTitle: string;
    transportTitle: string;
  }>;
  removedDuplicateParents: Array<{
    date: string | null;
    reason: string;
    removedTitle: string;
    survivingTitles: string[];
  }>;
  removedGroupedChildren: Array<{
    date: string | null;
    groupingKind?: GroupingKind;
    groupedUnder: string;
    removedTitle: string;
  }>;
  suppressedDayOverviews: Array<{
    date: string | null;
    removedTitle: string;
  }>;
  suppressedTransportActivities: Array<{
    date: string | null;
    matchedTransportTitle: string;
    removedTitle: string;
  }>;
  wrongCityPlacements: Array<{
    action: "moved_to_city_notes" | "needs_review";
    assignedCity: string | null;
    date: string | null;
    explicitCity: string;
    title: string;
  }>;
};

export const ASSEMBLY_VERSION = 3;

export function createEmptyConsolidationDebug(): TripDraftConsolidationDebug {
  return {
    foldedLodgingNotes: [],
    mergedCityNotes: [],
    normalizedOptionalActivities: [],
    normalizedRentalCarPickups: [],
    overproductionRetry: {
      averagePlansPerDay: 0,
      maxPlansPerDay: 0,
      triggered: false,
    },
    promotedTravelActivities: [],
    removedDuplicateParents: [],
    removedGroupedChildren: [],
    suppressedDayOverviews: [],
    suppressedTransportActivities: [],
    wrongCityPlacements: [],
  };
}

export function getExistingAssemblyDebug(record: DraftObject) {
  const assembly = asDraftObject(record._assembly);

  if (assembly.version !== ASSEMBLY_VERSION) {
    return null;
  }

  const debug = assembly.debug;

  return debug && typeof debug === "object" && !Array.isArray(debug)
    ? (debug as TripDraftConsolidationDebug)
    : createEmptyConsolidationDebug();
}
