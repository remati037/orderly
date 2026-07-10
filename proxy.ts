import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /tv used to be public. It renders live revenue, and being public was the only
// reason the `anon` role needed read access to `orders`. It now requires a login
// like every other page; the office TV signs in once and the session persists.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhook/woo/(.*)",
  "/api/webhook/thinkific/(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
