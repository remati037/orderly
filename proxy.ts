import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_MODE } from "@/lib/demo";

// Everything else requires a signed-in Supabase user.
// /tv is intentionally NOT public — it renders live revenue.
const PUBLIC_ROUTES = [
  /^\/sign-in/,
  /^\/api\/webhook\/woo\//,
  /^\/api\/webhook\/thinkific\//,
  /^\/api\/webhook\/stripe\//,
  // Storefront-posted on-hold orders (IPS QR); authenticated by MANUAL_WEBHOOK_SECRET.
  /^\/api\/webhook\/manual\//,
  // Cron endpoints authenticate themselves with CRON_SECRET, not a user session.
  /^\/api\/cron\//,
  // Menu bar plugin authenticates with MENUBAR_TOKEN, not a user session.
  /^\/api\/menubar$/,
  // SMS gateway authenticates with SMS_GATEWAY_TOKEN, not a user session.
  /^\/api\/sms\/gateway\//,
  // Claude's scheduled run authenticates with the Meta live token; the page's
  // PATCH on recommendations checks the member itself.
  /^\/api\/ads\/live-summary$/,
  /^\/api\/ads\/recommendations$/,
  // Support Hub (helpdesk) reads customers read-only with its own token
  // (settings.support_hub_token_sha256, lib/auth/service-token.ts).
  /^\/api\/support\/sites$/,
  /^\/api\/support\/customer$/,
];

export default async function proxy(request: NextRequest) {
  // Local demo database with made-up data: no sign-in (see lib/demo.ts).
  if (DEMO_MODE) {
    if (request.nextUrl.pathname.startsWith("/sign-in")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session cookie as a side effect — must run on every request.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((r) => r.test(path));

  if (!user && !isPublic) {
    // API routes answer with 401 rather than an HTML redirect.
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
