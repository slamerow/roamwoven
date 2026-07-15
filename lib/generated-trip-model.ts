export type TripRecordStatus =
  | "draft"
  | "confirmed"
  | "needs_review"
  | "ignored"
  | "placeholder";

export type TripSourceConfidence = "low" | "medium" | "high";

export type TripPrivateDetailVisibility =
  | "public"
  | "traveler_password"
  | "maker_only"
  | "hidden";

export type TripSummaryRecord = {
  destinationSummary: string | null;
  endDate: string | null;
  id: string;
  name: string;
  startDate: string | null;
  travelerAppTitle: string;
};

export type TripDayRecord = {
  date: string;
  dayNumber: number;
  id: string;
  legIds: string[];
  primaryLegId: string | null;
  reviewRequired: boolean;
  sortOrder: number;
  sourceConfidence: TripSourceConfidence;
  status: TripRecordStatus;
  summary: string | null;
  title: string;
  tripId: string;
};

export type TripLegRecord = {
  arriveDate: string | null;
  canonicalId: string;
  city: string;
  country: string | null;
  displayName: string;
  id: string;
  language: string | null;
  latitude: number | null;
  leaveDate: string | null;
  legKey: string;
  longitude: number | null;
  region: string | null;
  reviewRequired: boolean;
  sortOrder: number;
  sourceConfidence: TripSourceConfidence;
  status: TripRecordStatus;
  summary: string | null;
  timezone: string | null;
  tripId: string;
};

export type TripStayRecord = {
  accessDetailsVisibility: TripPrivateDetailVisibility;
  address: string | null;
  addressVisibility: TripPrivateDetailVisibility;
  bookingUrl: string | null;
  canonicalId: string;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  confirmationLabel: string | null;
  confirmationVisibility: TripPrivateDetailVisibility;
  id: string;
  latitude: number | null;
  legId: string | null;
  longitude: number | null;
  name: string;
  privateDetailIds: string[];
  publicLocationLabel: string | null;
  reviewRequired: boolean;
  sourceConfidence: TripSourceConfidence;
  status: TripRecordStatus;
  stayType: string | null;
  tripId: string;
};

export type TripTransportType =
  | "flight"
  | "train"
  | "ferry"
  | "rental_car"
  | "transfer"
  | "bus"
  | "drive"
  | "other";

export type TripTransportRecord = {
  arrivalLocation: string | null;
  arrivalTime: string | null;
  bookingUrl: string | null;
  bookingUrlVisibility: TripPrivateDetailVisibility;
  canonicalId: string;
  confirmationLabel: string | null;
  confirmationVisibility: TripPrivateDetailVisibility;
  date: string | null;
  departureLocation: string | null;
  departureTime: string | null;
  description: string | null;
  fromLegId: string | null;
  id: string;
  legId: string | null;
  privateDetailIds: string[];
  provider: string | null;
  reviewRequired: boolean;
  routeLabel: string;
  sourceConfidence: TripSourceConfidence;
  status: TripRecordStatus;
  toLegId: string | null;
  transportType: TripTransportType;
  tripId: string;
};

export type TripItemType =
  | "activity"
  | "note"
  | "admin"
  | "rest_day"
  | "social"
  | "placeholder";

export type TripItemRecord = {
  address: string | null;
  canonicalId: string;
  categoryId: string;
  date: string | null;
  description: string | null;
  endTime: string | null;
  id: string;
  itemType: TripItemType;
  latitude: number | null;
  legId: string | null;
  locationName: string | null;
  longitude: number | null;
  parentItemId: string | null;
  reviewRequired: boolean;
  sortOrder: number;
  sourceConfidence: TripSourceConfidence;
  startTime: string | null;
  status: TripRecordStatus;
  summary: string | null;
  title: string;
  tripId: string;
  url: string | null;
};

export type TripCategoryRecord = {
  categoryKey: string;
  description: string | null;
  emoji: string | null;
  enabled: boolean;
  icon: string | null;
  id: string;
  label: string;
  sortOrder: number;
  tripId: string;
};

export type TripPrivateDetailRecord = {
  detailType: string;
  id: string;
  label: string;
  reason: string | null;
  reviewRequired: boolean;
  sourceConfidence: TripSourceConfidence;
  subjectCanonicalId: string;
  subjectId: string;
  subjectType: "day" | "leg" | "stay" | "transport" | "item" | "photo";
  tripId: string;
  value: string;
  visibility: TripPrivateDetailVisibility;
};

export type TripPhotoRecord = {
  caption: string | null;
  capturedAt: string | null;
  height: number | null;
  id: string;
  legId: string | null;
  publishedAt: string | null;
  status: TripRecordStatus;
  storagePath: string;
  tripDate: string | null;
  tripId: string;
  uploaderLabel: string | null;
  visibility: TripPrivateDetailVisibility;
  width: number | null;
};

export type TripPhraseRecord = {
  category: string;
  english: string;
  id: string;
  language: string;
  pronunciation: string;
  script: string;
  sortOrder: number;
  tripId: string;
  verifyStatus: string | null;
};

export type TripWeatherHookRecord = {
  date: string | null;
  enabled: boolean;
  id: string;
  latitude: number | null;
  legId: string | null;
  locationLabel: string;
  longitude: number | null;
  source: "coordinates" | "stay" | "city_country" | "manual";
  timezone: string | null;
  tripId: string;
};

export type TripReviewQuestionRecord = {
  answerMax?: string | null;
  answerMin?: string | null;
  answerOptions?: Array<{ label: string; value: string }>;
  answerType:
    | "text"
    | "choice"
    | "single_choice"
    | "multi_select"
    | "yes_no"
    | "date"
    | "time"
    | "visibility"
    | "confirm";
  answerValue: string | null;
  canonicalId: string;
  createdAt: string | null;
  evidence: string | null;
  guessedValue: string | null;
  id: string;
  prompt: string;
  reason: string;
  resolvedAt: string | null;
  sourceConfidence: TripSourceConfidence;
  status: "open" | "answered" | "dismissed" | "noted";
  subjectCanonicalId: string;
  subjectId: string;
  subjectType: "trip" | "day" | "leg" | "stay" | "transport" | "item";
  targetField: string | null;
  tripId: string;
};

export type StructuredTripRecords = {
  categories: TripCategoryRecord[];
  days: TripDayRecord[];
  items: TripItemRecord[];
  legs: TripLegRecord[];
  photos: TripPhotoRecord[];
  phrases: TripPhraseRecord[];
  privateDetails: TripPrivateDetailRecord[];
  reviewQuestions: TripReviewQuestionRecord[];
  stays: TripStayRecord[];
  transport: TripTransportRecord[];
  trip: TripSummaryRecord;
  weatherHooks: TripWeatherHookRecord[];
};
