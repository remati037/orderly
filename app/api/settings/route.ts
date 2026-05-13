import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key, value } = await request.json();
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
