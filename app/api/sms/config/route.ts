import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";

const STATUSES = ["failed", "pending", "on-hold", "checkout-draft"];

export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { data } = await adminClient()
    .from("settings")
    .select("value")
    .eq("key", "sms_recovery")
    .maybeSingle();
  return NextResponse.json({ config: data?.value ?? null });
}

// Switching ON stamps enabled_from = now, so only tasks that open from now on get
// reminders — never the existing backlog. Switching OFF leaves queued messages
// alone; they still need approval anyway.
export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const input = await request.json();
  const supabase = adminClient();

  const { data: row } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "sms_recovery")
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "sms_recovery nije podešen — pokreni migraciju 020" }, { status: 500 });
  const current = row.value as Record<string, unknown>;
  const next = { ...current };

  if (typeof input.enabled === "boolean") {
    next.enabled = input.enabled;
    if (input.enabled && !current.enabled) next.enabled_from = new Date().toISOString();
  }
  if (Array.isArray(input.statuses)) {
    const statuses = input.statuses.filter((s: unknown) => typeof s === "string" && STATUSES.includes(s));
    if (statuses.length === 0)
      return NextResponse.json({ error: "Izaberi bar jedan status" }, { status: 400 });
    next.statuses = statuses;
  }
  if (input.templates && typeof input.templates === "object") {
    const templates: Record<string, string> = { ...(current.templates as Record<string, string>) };
    for (const k of ["1", "2", "3"]) {
      const t = input.templates[k];
      if (typeof t === "string") {
        if (t.length > 480) return NextResponse.json({ error: `Tekst ${k} je predugačak` }, { status: 400 });
        templates[k] = t;
      }
    }
    next.templates = templates;
  }

  const { error } = await supabase
    .from("settings")
    .upsert({ key: "sms_recovery", value: next }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: next });
}
