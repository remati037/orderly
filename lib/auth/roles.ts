import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export type Role = "owner" | "agent";

export interface Member {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  role: Role;
  is_active: boolean;
}

/**
 * Resolves the signed-in Supabase user to a team member.
 *
 * Resolution order:
 *  1. Matched by auth_user_id (already linked).
 *  2. Matched by email (row created ahead of time) → links auth_user_id.
 *  3. Table is empty → bootstrap the first user as owner, so whoever sets the
 *     app up cannot lock themselves out.
 *
 * Returns null for signed-out users, unknown users, and deactivated members.
 */
export async function getMember(): Promise<Member | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = adminClient();

  const { data: linked } = await admin
    .from("team_members")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (linked) return linked.is_active ? (linked as Member) : null;

  const email = user.email?.toLowerCase() ?? null;

  // Row created ahead of time by the owner, not yet linked to an auth user.
  if (email) {
    const { data: invited } = await admin
      .from("team_members")
      .select("*")
      .ilike("email", email)
      .is("auth_user_id", null)
      .maybeSingle();

    if (invited) {
      const { data: updated } = await admin
        .from("team_members")
        .update({ auth_user_id: user.id })
        .eq("id", invited.id)
        .select()
        .single();
      const member = (updated ?? invited) as Member;
      return member.is_active ? member : null;
    }
  }

  // Bootstrap: no members exist yet → first signed-in user becomes the owner.
  const { count } = await admin
    .from("team_members")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) === 0 && email) {
    const { data: created } = await admin
      .from("team_members")
      .insert({
        auth_user_id: user.id,
        email,
        name: (user.user_metadata?.full_name as string | undefined) ?? null,
        role: "owner",
        is_active: true,
      })
      .select()
      .single();
    return (created as Member) ?? null;
  }

  return null;
}

/**
 * API-route guard. Usage:
 *
 *   const { error } = await requireRole(["owner"]);
 *   if (error) return error;
 */
export async function requireRole(
  allowed: Role[]
): Promise<{ error: NextResponse | null; member: Member | null }> {
  const member = await getMember();

  if (!member)
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), member: null };

  if (!allowed.includes(member.role))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), member: null };

  return { error: null, member };
}
