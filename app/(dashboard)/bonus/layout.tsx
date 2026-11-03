import { requirePageRole } from "@/lib/auth/page-guards";

export default async function BonusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageRole(["owner", "agent"]);
  return <>{children}</>;
}
