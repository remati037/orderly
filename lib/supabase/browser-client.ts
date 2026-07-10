"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Reads the Supabase Auth session from cookies, so
 * requests run as the `authenticated` role and the `authenticated` RLS policies
 * apply. Nothing here runs as `anon` any more — see migration 007.
 */
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
