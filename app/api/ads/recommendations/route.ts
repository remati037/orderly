import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { adminClient } from "@/lib/supabase/admin";
import { hasMetaLiveToken } from "@/lib/auth/service-token";

const LEVELS = ["campaign", "adset", "ad"];
const TYPES = ["skaliraj", "ugasi", "osvezi_kreativu", "proveri"];
const MAX_PER_ACCOUNT = 5;

interface Incoming {
  ad_account_id: string;
  level: string;
  entity_id: string;
  entity_name?: string;
  type: string;
  priority: number;
  text: string;
}

const isValid = (r: Incoming) =>
  !!r.ad_account_id && !!r.entity_id && !!r.text?.trim() &&
  LEVELS.includes(r.level) && TYPES.includes(r.type) && [1, 2, 3].includes(r.priority);

// POST (Claude's scheduled run, token): a fresh set of recommendations. Each run
// replaces what is still open on those accounts, so the card holds current advice only.
export async function POST(request: NextRequest) {
  const supabase = adminClient();
  if (!(await hasMetaLiveToken(supabase, request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { recommendations?: Incoming[] } | null;
  const recs = body?.recommendations;
  if (!Array.isArray(recs) || !recs.every(isValid))
    return NextResponse.json({ error: "Invalid recommendations" }, { status: 400 });

  const perAccount = new Map<string, number>();
  for (const r of recs) perAccount.set(r.ad_account_id, (perAccount.get(r.ad_account_id) ?? 0) + 1);
  if ([...perAccount.values()].some((n) => n > MAX_PER_ACCOUNT))
    return NextResponse.json({ error: `At most ${MAX_PER_ACCOUNT} per account` }, { status: 400 });

  if (recs.length) {
    const { error: closeError } = await supabase
      .from("ad_recommendations")
      .update({ status: "ignored" })
      .eq("status", "open")
      .in("ad_account_id", [...perAccount.keys()]);
    if (closeError) return NextResponse.json({ error: closeError.message }, { status: 500 });

    const { error } = await supabase.from("ad_recommendations").insert(
      recs.map((r) => ({
        ad_account_id: r.ad_account_id,
        level: r.level,
        entity_id: r.entity_id,
        entity_name: r.entity_name ?? null,
        type: r.type,
        priority: r.priority,
        text: r.text.trim(),
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: recs.length });
}

// PATCH (the page, signed-in member): mark one done, recording who and when.
export async function PATCH(request: NextRequest) {
  const { error: authError, member } = await requireRole(["owner", "agent"]);
  if (authError) return authError;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await adminClient()
    .from("ad_recommendations")
    .update({ status: "done", done_by: member?.name ?? member?.email ?? null, done_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
