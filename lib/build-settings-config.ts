export const APP_MODULES = [
  {
    key: "itinerary",
    title: "Daily itinerary",
    copy: "Today cards, timed plans, reservations, and notes.",
    defaultEnabled: true,
  },
  {
    key: "stays",
    title: "Stays",
    copy: "Hotels, rentals, check-in details, and stay notes. Exact private addresses and access details can stay password-protected.",
    defaultEnabled: true,
  },
  {
    key: "travel",
    title: "Flights and transport",
    copy: "Flights, trains, transfers, rental cars, and transit notes.",
    defaultEnabled: true,
  },
  {
    key: "search",
    title: "Trip search",
    copy: "Fast lookup across dates, places, confirmations, and notes, with sensitive details handled by privacy settings.",
    defaultEnabled: true,
  },
  {
    key: "phrases",
    title: "Useful phrases",
    copy: "Short practical language help by destination.",
    defaultEnabled: true,
  },
  {
    key: "weather",
    title: "Weather",
    copy: "Forecast context for upcoming trips, hidden or softened for old sample trips.",
    defaultEnabled: true,
  },
  {
    key: "maps",
    title: "Maps",
    copy: "Location groupings and map-ready places from the itinerary.",
    defaultEnabled: true,
  },
  {
    key: "photos",
    title: "Photo album",
    copy: "A private follow-along album with dates and locations.",
    defaultEnabled: true,
  },
] as const;

export const BUILD_CONFIRMATIONS = [
  {
    key: "materials",
    title: "All core materials are included",
    copy: "Roamwoven will build from the files and notes saved here. Add anything essential now; later uploads should be small corrections or late additions.",
  },
] as const;

export type AppModuleKey = (typeof APP_MODULES)[number]["key"];
export type BuildConfirmationKey = (typeof BUILD_CONFIRMATIONS)[number]["key"];

export type TripBuildSettings = {
  enabledModules: Record<AppModuleKey, boolean>;
  confirmations: Record<BuildConfirmationKey, boolean>;
  updatedAt: string | null;
};
