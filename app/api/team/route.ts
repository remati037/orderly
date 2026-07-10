import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/roles";

export async function GET() {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("id, auth_user_id, email, name, role, is_active, created_at")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Register a member by email and role. The login itself is created separately in
// Supabase Dashboard → Authentication → Users; the two are linked by email on
// that person's first sign-in.
export async function POST(request: NextRequest) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { email, name, role } = await request.json();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const wanted = role === "owner" ? "owner" : "agent";

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("team_members")
    .insert({
      email: String(email).toLowerCase(),
      name: name || null,
      role: wanted,
      is_active: true,
    })
    .select("id, auth_user_id, email, name, role, is_active, created_at")
    .single();

  if (error) {
    const msg = error.code === "23505" ? "Taj email je već u timu." : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}

// Change a member's role or activate/deactivate them.
export async function PATCH(request: NextRequest) {
  const { error: authError, member } = await requireRole(["owner"]);
  if (authError) return authError;

  const { id, role, is_active } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Never let the acting owner lock themselves out.
  if (member && id === member.id && (role === "agent" || is_active === false))
    return NextResponse.json(
      { error: "Ne možeš sebi oduzeti vlasnički pristup." },
      { status: 400 }
    );

  const patch: Record<string, unknown> = {};
  if (role === "owner" || role === "agent") patch.role = role;
  if (typeof is_active === "boolean") patch.is_active = is_active;
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("team_members")
    .update(patch)
    .eq("id", id)
    .select("id, auth_user_id, email, name, role, is_active, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const { error: authError, member } = await requireRole(["owner"]);
  if (authError) return authError;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (member && id === member.id)
    return NextResponse.json({ error: "Ne možeš obrisati sebe." }, { status: 400 });

  const supabase = adminClient();
  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
