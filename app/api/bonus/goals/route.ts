import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import type { BonusProgram } from "@/lib/bonus/program";

// Sets (or clears, with goal null/0) one product's revenue goal in
// settings.bonus_program.product_goals.
export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const siteId = typeof body?.site_id === "string" ? body.site_id : null;
  const productName = typeof body?.product === "string" ? body.product.trim() : "";
  const goal = body?.goal == null || body.goal === "" ? null : Number(body.goal);
  if (!siteId || !productName || (goal !== null && (!Number.isFinite(goal) || goal < 0)))
    return NextResponse.json({ error: "Invalid goal" }, { status: 400 });

  const supabase = adminClient();
  const { data: cfg, error } = await supabase.from("settings").select("value").eq("key", "bonus_program").maybeSingle();
  if (error || !cfg) return NextResponse.json({ error: "Bonus program is not configured" }, { status: 404 });

  const program = cfg.value as BonusProgram;
  const goals = { ...(program.product_goals ?? {}) };
  const site = { ...(goals[siteId] ?? {}) };
  if (goal) site[productName] = goal;
  else delete site[productName];
  if (Object.keys(site).length) goals[siteId] = site;
  else delete goals[siteId];

  const { error: saveError } = await supabase
    .from("settings")
    .update({ value: { ...program, product_goals: goals }, updated_at: new Date().toISOString() })
    .eq("key", "bonus_program");
  if (saveError) return NextResponse.json({ error: "Failed to save goal" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
