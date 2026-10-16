import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { checkGateway } from "./gateway-auth";

/** Shared wrapper: authenticates the gateway, then runs the handler with an admin client. */
export async function gatewayRoute(
  request: NextRequest,
  handler: (supabase: SupabaseClient) => Promise<NextResponse>
): Promise<NextResponse> {
  const supabase = adminClient();
  const auth = await checkGateway(request, supabase);
  if (auth === "unconfigured")
    return NextResponse.json({ error: "SMS gateway token not configured" }, { status: 500 });
  if (auth === "unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handler(supabase);
}
