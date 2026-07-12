import assert from "node:assert/strict";
import {
  createPublishedTripSnapshotPayload,
  publishTripSnapshot,
} from "@/lib/published-snapshots";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function createMinimalRecords(): StructuredTripRecords {
  return {
    categories: [],
    days: [],
    items: [],
    legs: [],
    photos: [],
    phrases: [],
    privateDetails: [
      {
        detailType: "confirmation_number",
        id: "detail-1",
        label: "Confirmation",
        reason: "Booking references should default behind traveler mode.",
        reviewRequired: false,
        sourceConfidence: "medium",
        subjectId: "transport-1",
        subjectType: "transport",
        tripId: "trip-1",
        value: "ABC123",
        visibility: "traveler_password",
      },
    ],
    reviewQuestions: [],
    stays: [],
    transport: [],
    trip: {
      destinationSummary: null,
      endDate: null,
      id: "trip-1",
      name: "Central Europe",
      startDate: null,
      travelerAppTitle: "Central Europe",
    },
    weatherHooks: [],
  };
}

function mockPublishDependencies(response: {
  data?: unknown;
  error?: { message: string } | null;
}) {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalGetCurrentUser = require("@/lib/auth").getCurrentUser;
  const originalCreateSupabaseServerClient =
    require("@/lib/supabase/server").createSupabaseServerClient;
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  require("@/lib/auth").getCurrentUser = async () => ({
    email: "maker@example.com",
    id: "user-1",
  });
  require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
    rpc: (name: string, params: Record<string, unknown>) => {
      calls.push({ name, params });

      const builder = {
        data: response.data ?? null,
        error: response.error ?? null,
        select: () => builder,
        single: async () => ({
          data: response.data ?? null,
          error: response.error ?? null,
        }),
      };

      return builder;
    },
  });

  return {
    calls,
    restore() {
      if (originalSupabaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
      }

      if (originalSupabaseAnonKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
      }

      require("@/lib/auth").getCurrentUser = originalGetCurrentUser;
      require("@/lib/supabase/server").createSupabaseServerClient =
        originalCreateSupabaseServerClient;
    },
  };
}

export default async function run() {
  await test("public projection protects all lodging addresses and travel controls", () => {
    const records = createMinimalRecords();
    records.stays = [{
      accessDetailsVisibility: "traveler_password",
      address: "1 Public Hotel Way",
      addressVisibility: "traveler_password",
      bookingUrl: "https://hotel.example/manage/SECRET",
      checkInDate: "2031-04-01",
      checkInTime: null,
      checkOutDate: "2031-04-03",
      checkOutTime: null,
      confirmationLabel: "HOTEL-SECRET",
      confirmationVisibility: "traveler_password",
      id: "stay-1",
      latitude: null,
      legId: null,
      longitude: null,
      name: "Public Hotel",
      privateDetailIds: [],
      publicLocationLabel: "Vienna",
      reviewRequired: false,
      sourceConfidence: "high",
      status: "draft",
      stayType: "hotel",
      tripId: "trip-1",
    }];
    records.transport = [{
      arrivalLocation: "VIE",
      arrivalTime: "12:00",
      bookingUrl: "https://airline.example/manage/TRAVEL-SECRET",
      bookingUrlVisibility: "traveler_password",
      confirmationLabel: "TRAVEL-SECRET",
      confirmationVisibility: "traveler_password",
      date: "2031-04-01",
      departureLocation: "JFK",
      departureTime: "08:00",
      description: "Confirmation: TRAVEL-SECRET.",
      fromLegId: null,
      id: "transport-1",
      legId: null,
      privateDetailIds: [],
      provider: "Example Air",
      reviewRequired: false,
      routeLabel: "JFK to VIE",
      sourceConfidence: "high",
      status: "draft",
      toLegId: null,
      transportType: "flight",
      tripId: "trip-1",
    }];
    records.privateDetails.push(
      {
        ...records.privateDetails[0],
        id: "stay-address",
        subjectId: "stay-1",
        subjectType: "stay",
        value: "1 Public Hotel Way",
      },
      {
        ...records.privateDetails[0],
        id: "stay-confirmation",
        subjectId: "stay-1",
        subjectType: "stay",
        value: "HOTEL-SECRET",
      }
    );

    const payload = createPublishedTripSnapshotPayload(records);
    const text = JSON.stringify(payload);

    assert.doesNotMatch(text, /1 Public Hotel Way|HOTEL-SECRET|TRAVEL-SECRET/);
  });

  await test("activity confirmations stay public while universal access secrets do not", () => {
    const records = createMinimalRecords();
    records.items = [
      {
        address: null,
        categoryId: "tours_tickets",
        date: "2031-04-01",
        description: "Tour ticket number 19183727.",
        endTime: null,
        id: "item-tour",
        itemType: "activity",
        latitude: null,
        legId: null,
        locationName: null,
        longitude: null,
        parentItemId: null,
        reviewRequired: false,
        sortOrder: 0,
        sourceConfidence: "high",
        startTime: null,
        status: "draft",
        summary: null,
        title: "Klementinum tour",
        tripId: "trip-1",
        url: null,
      },
      {
        address: null,
        categoryId: "arrival_departure",
        date: "2031-04-01",
        description: "Door code: 2468.",
        endTime: null,
        id: "item-access",
        itemType: "activity",
        latitude: null,
        legId: null,
        locationName: null,
        longitude: null,
        parentItemId: null,
        reviewRequired: false,
        sortOrder: 1,
        sourceConfidence: "high",
        startTime: null,
        status: "draft",
        summary: null,
        title: "Apartment arrival",
        tripId: "trip-1",
        url: null,
      },
    ];

    const payload = createPublishedTripSnapshotPayload(records);
    const tour = payload.travelerApp.cards.find((card) => card.id === "item-tour");
    const access = payload.travelerApp.cards.find((card) => card.id === "item-access");

    assert.match(tour?.description ?? "", /19183727/);
    assert.doesNotMatch(access?.description ?? "", /2468/);
    assert.match(access?.description ?? "", /Protected detail/i);
  });

  await test("publishTripSnapshot commits snapshot and private details through the transactional RPC", async () => {
    const mock = mockPublishDependencies({
      data: {
        created_at: "2026-07-08T00:00:00.000Z",
        id: "snapshot-1",
        share_token: "share-token-1",
        snapshot_json: {
          createdFrom: "structured_trip_records",
          recordsSummary: {
            cardCount: 0,
            dayCount: 0,
            legCount: 0,
            privateDetailCount: 1,
            sourceConfidence: "medium",
          },
          schemaVersion: 1,
          travelerApp: {},
        },
        trip_id: "trip-1",
        version: 2,
      },
    });

    try {
      const snapshot = await publishTripSnapshot({
        records: createMinimalRecords(),
        tripId: "trip-1",
      });

      assert.equal(snapshot.id, "snapshot-1");
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0]?.name, "publish_trip_snapshot");
      assert.equal(mock.calls[0]?.params.p_created_by_user_id, "user-1");
      assert.equal(mock.calls[0]?.params.p_trip_id, "trip-1");
      assert.equal(typeof mock.calls[0]?.params.p_share_token, "string");
      assert.deepEqual(mock.calls[0]?.params.p_private_details, [
        {
          id: "detail-1",
          label: "Confirmation",
          reason: "Booking references should default behind traveler mode.",
          subjectId: "transport-1",
          subjectType: "transport",
          value: "ABC123",
          visibility: "traveler_password",
        },
      ]);
    } finally {
      mock.restore();
    }
  });
}
