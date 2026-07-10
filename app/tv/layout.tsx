import { requirePageRole } from "@/lib/auth/page-guards";

// The TV board shows live revenue — owners only, never agents.
export default async function TvLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageRole(["owner"]);
  return <>{children}</>;
}
