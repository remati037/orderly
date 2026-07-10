"use client";

import { createClient } from "@supabase/supabase-js";

// Clerk injects itself on window once ClerkProvider has mounted.
declare global {
  interface Window {
    Clerk?: {
      session?: { getToken: () => Promise<string | null> };
    };
  }
}

/**
 * Browser Supabase client authenticated with the *Clerk* session token.
 *
 * Previously this used the bare anon key, which made every browser request run
 * as the `anon` role — i.e. as anyone on the internet, since the anon key ships
 * in the JS bundle. Reads only worked because of permissive `anon` RLS policies.
 *
 * With Clerk registered as a third-party auth provider in Supabase, the token
 * below carries `role: "authenticated"`, so the `authenticated` RLS policies
 * apply and the `anon` policies can be dropped (migration 007).
 *
 * Requires:
 *   • Clerk Dashboard → Sessions → session token claims include `role: "authenticated"`
 *   • Supabase Dashboard → Authentication → Third-Party Auth → Clerk
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    accessToken: async () => {
      if (typeof window === "undefined") return null;
      return (await window.Clerk?.session?.getToken()) ?? null;
    },
  }
);
