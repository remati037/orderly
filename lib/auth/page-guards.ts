import { redirect } from "next/navigation";
import { getMember, type Role, type Member } from "./roles";

/**
 * Server-component guard for pages. Place it in a section `layout.tsx` so it
 * also protects client-component pages beneath it.
 *
 *   export default async function Layout({ children }) {
 *     await requirePageRole(["owner"]);
 *     return <>{children}</>;
 *   }
 */
export async function requirePageRole(allowed: Role[]): Promise<Member> {
  const member = await getMember();

  // Signed in with Clerk, but not on the team (or deactivated).
  if (!member) redirect("/no-access");

  // On the team, but this section isn't theirs — send them to their home.
  if (!allowed.includes(member.role)) redirect("/naplata");

  return member;
}
