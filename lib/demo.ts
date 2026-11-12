// Demo mode: the app runs against a local Postgres full of made-up data
// (npm run demo). It skips sign-in and acts as one fixed owner.
//
// It only switches on when the Supabase URL is a local address, so a stray
// ORDERLY_DEMO=1 on Vercel can never open the real dashboard without a login.

const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;

export const DEMO_MODE =
  process.env.ORDERLY_DEMO === "1" && LOCAL_URL.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

/** auth_user_id of the demo owner seeded by scripts/demo/seed.mjs. */
export const DEMO_AUTH_USER_ID = "00000000-0000-0000-0000-00000000d001";
