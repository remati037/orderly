import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const key = new URL(request.url).searchParams.get("key");
  const supabase = adminClient();

  if (key) {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return NextResponse.json({ value: data?.value ?? null });
  }

  const { data } = await supabase.from("settings").select("key, value");
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { key, value } = await request.json();
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
