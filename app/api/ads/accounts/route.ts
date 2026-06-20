import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("ad_accounts")
    .select("id, name, fb_account_id, currency, is_active, last_synced_at, created_at")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, fb_account_id, access_token, currency } = body;

  if (!name || !fb_account_id || !access_token)
    return NextResponse.json(
      { error: "name, fb_account_id and access_token are required" },
      { status: 400 }
    );

  // Normalize: Meta account ids must be prefixed with "act_".
  const normalizedId = String(fb_account_id).startsWith("act_")
    ? String(fb_account_id)
    : `act_${fb_account_id}`;

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("ad_accounts")
    .upsert(
      {
        name,
        fb_account_id: normalizedId,
        access_token,
        currency: currency || "EUR",
        is_active: true,
      },
      { onConflict: "fb_account_id" }
    )
    .select("id, name, fb_account_id, currency, is_active, last_synced_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase.from("ad_accounts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
