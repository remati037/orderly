import { requirePageRole } from "@/lib/auth/page-guards";

export default async function OwnerOnlyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageRole(["owner"]);
  return <>{children}</>;
}
