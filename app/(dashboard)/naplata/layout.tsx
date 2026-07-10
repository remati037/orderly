import { requirePageRole } from "@/lib/auth/page-guards";

export default async function RecoveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageRole(["owner", "agent"]);
  return <>{children}</>;
}
