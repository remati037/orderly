import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export type Role = "owner" | "agent";

export interface Member {
  id: string;
  clerk_user_id: string | null;
  email: string;
  name: string | null;
  role: Role;
  is_active: boolean;
}

/**
 * Resolves the current Clerk user to a team member.
 *
 * Resolution order:
 *  1. Matched by clerk_user_id (already linked).
 *  2. Matched by email (invited by the owner, first sign-in) → links clerk_user_id.
 *  3. Table is empty → bootstrap the very first user as owner, so the app owner
 *     cannot lock themselves out before any member exists.
 *
 * Returns null for signed-out users, unknown users, and deactivated members.
 */
export async function getMember(): Promise<Member | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = adminClient();

  const { data: linked } = await supabase
    .from("team_members")
    .select("*")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (linked) return linked.is_active ? (linked as Member) : null;

  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;

  // Invited by email but not yet linked to a Clerk account.
  if (email) {
    const { data: invited } = await supabase
      .from("team_members")
      .select("*")
      .ilike("email", email)
      .is("clerk_user_id", null)
      .maybeSingle();

    if (invited) {
      const { data: updated } = await supabase
        .from("team_members")
        .update({ clerk_user_id: userId, name: user?.fullName ?? invited.name })
        .eq("id", invited.id)
        .select()
        .single();
      const member = (updated ?? invited) as Member;
      return member.is_active ? member : null;
    }
  }

  // Bootstrap: no members exist yet → first signed-in user becomes the owner.
  const { count } = await supabase
    .from("team_members")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) === 0 && email) {
    const { data: created } = await supabase
      .from("team_members")
      .insert({
        clerk_user_id: userId,
        email,
        name: user?.fullName ?? null,
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
 *   const { error, member } = await requireRole(["owner"]);
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
