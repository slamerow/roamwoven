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
    title: "Weather and maps",
    copy: "Forecast context, location groupings, and map-ready places.",
    defaultEnabled: true,
  },
  {
    key: "photos",
    title: "Photo album",
    copy: "A private follow-along album with dates and locations.",
    defaultEnabled: false,
  },
  {
    key: "places",
    title: "Saved places",
    copy: "Restaurants, shops, beaches, museums, and ideas worth keeping.",
    defaultEnabled: true,
  },
] as const;

export const BUILD_CONFIRMATIONS = [
  {
    key: "materials",
    title: "Uploaded materials look complete enough for a first pass",
    copy: "You can add more later, but this starts the review cleanly.",
  },
  {
    key: "optional",
    title: "Skipped modules should stay hidden",
    copy: "If there are no flights, photos, or phrases, the traveler app should not show filler.",
  },
  {
    key: "sensitive",
    title: "Sensitive details should stay private by default",
    copy: "Home addresses, confirmation numbers, and personal notes should be handled carefully.",
  },
] as const;

export type AppModuleKey = (typeof APP_MODULES)[number]["key"];
export type BuildConfirmationKey = (typeof BUILD_CONFIRMATIONS)[number]["key"];

export type TripBuildSettings = {
  enabledModules: Record<AppModuleKey, boolean>;
  confirmations: Record<BuildConfirmationKey, boolean>;
  updatedAt: string | null;
};
