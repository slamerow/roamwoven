import assert from "node:assert/strict";
import {
  getMakerTrip,
  MakerTripAuthRequiredError,
  MakerTripNotFoundError,
} from "@/lib/trips";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function mockSupabaseTripResponse(response: {
  data: unknown;
  error: { message: string } | null;
}) {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalCreateSupabaseServerClient =
    require("@/lib/supabase/server").createSupabaseServerClient;
  const originalGetCurrentUser = require("@/lib/auth").getCurrentUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  require("@/lib/auth").getCurrentUser = async () => ({
    email: "maker@example.com",
    id: "user-1",
  });
  require("@/lib/supabase/server").createSupabaseServerClient = async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            neq: () => ({
              maybeSingle: async () => response,
            }),
          }),
        }),
      }),
    }),
  });

  return () => {
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
  };
}

export default async function run() {
  await test("missing maker trip becomes a typed not-found error", async () => {
    const restore = mockSupabaseTripResponse({ data: null, error: null });

    try {
      await assert.rejects(
        () => getMakerTrip("trip-1"),
        MakerTripNotFoundError
      );
    } finally {
      restore();
    }
  });

  await test("unsigned maker trip access becomes a typed auth error", async () => {
    const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const originalGetCurrentUser = require("@/lib/auth").getCurrentUser;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    require("@/lib/auth").getCurrentUser = async () => null;

    try {
      await assert.rejects(
        () => getMakerTrip("trip-1"),
        MakerTripAuthRequiredError
      );
    } finally {
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
    }
  });
}
