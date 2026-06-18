export const TRAVELER_TOOL_IDS = [
  "photos",
  "stay",
  "search",
  "map",
  "phrases",
] as const;

export type TravelerToolId = (typeof TRAVELER_TOOL_IDS)[number];

export const TRAVELER_TOOLS: Array<{
  id: TravelerToolId;
  label: string;
}> = [
  { id: "photos", label: "Photos" },
  { id: "stay", label: "Stay" },
  { id: "search", label: "Search" },
  { id: "map", label: "Map" },
  { id: "phrases", label: "Phrases" },
];

export const TRAVELER_TAB_IDS = [
  "legs",
  "categories",
  "today",
  "calendar",
] as const;

export type TravelerTabId = (typeof TRAVELER_TAB_IDS)[number];

export const TRAVELER_TABS: Array<{
  id: TravelerTabId;
  label: string;
}> = [
  { id: "legs", label: "Legs" },
  { id: "categories", label: "Categories" },
  { id: "today", label: "Today" },
  { id: "calendar", label: "Calendar" },
];
