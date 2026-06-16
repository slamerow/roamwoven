import { z } from "zod";

export const tripLegSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  country: z.string().optional(),
  city: z.string(),
  arriveDate: z.string(),
  leaveDate: z.string().optional(),
  stayName: z.string().optional(),
  stayAddress: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  status: z.enum(["draft", "confirmed", "needs_review", "placeholder"])
});

export const tripItemSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  legId: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string(),
  itemType: z.enum([
    "flight",
    "train",
    "ferry",
    "transfer",
    "rental_car",
    "lodging",
    "activity",
    "restaurant",
    "admin",
    "rest_day",
    "social",
    "note",
    "placeholder"
  ]),
  placeholderType: z.string().optional(),
  reviewRequired: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional()
});

export type TripLeg = z.infer<typeof tripLegSchema>;
export type TripItem = z.infer<typeof tripItemSchema>;

