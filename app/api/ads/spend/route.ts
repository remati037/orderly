import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { loadFxSettings } from "@/lib/utils/fx";
import { getMappedSpend } from "@/lib/utils/ad-spend";
import { monthBounds } from "@/lib/utils/tz";

// Mapped ad spend per site / product over a period (defaults to current month).
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp     = new URL(request.url).searchParams;
  const siteId = sp.get("siteId");
  const month  = monthBounds();
  const from   = sp.get("from") ?? month.start.split("T")[0];
  const to     = sp.get("to")   ?? month.end.split("T")[0];

  const supabase = adminClient();
  const fx = await loadFxSettings(supabase);
  const spend = await getMappedSpend(supabase, from, to, fx.rates, siteId);

  return NextResponse.json({ base_currency: fx.baseCurrency, ...spend });
}
