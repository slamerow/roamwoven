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
    copy: "Hotels, rentals, addresses, check-in details, and host notes.",
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
    copy: "Fast lookup across dates, places, confirmations, and notes.",
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
    defaultEnabled: false,
  },
] as const;

export const BUILD_CONFIRMATIONS = [
  {
    key: "materials",
    title: "All core materials are included",
    copy: "Add every source doc you can reasonably find before the first build. Later uploads should be small corrections or late additions, not a second full rebuild.",
  },
  {
    key: "optional",
    title: "Skipped modules should stay hidden",
    copy: "If there are no flights, photos, or phrases, the traveler app should not show filler.",
  },
  {
    key: "sensitive",
    title: "Private details need a sharing pass",
    copy: "Cards with exact private addresses, codes, confirmations, or personal notes can keep those details behind a password.",
  },
] as const;

export type AppModuleKey = (typeof APP_MODULES)[number]["key"];
export type BuildConfirmationKey = (typeof BUILD_CONFIRMATIONS)[number]["key"];

export type TripBuildSettings = {
  enabledModules: Record<AppModuleKey, boolean>;
  confirmations: Record<BuildConfirmationKey, boolean>;
  updatedAt: string | null;
};
