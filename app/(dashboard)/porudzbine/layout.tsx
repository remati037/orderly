import { requirePageRole } from "@/lib/auth/page-guards";

export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageRole(["owner"]);
  return <>{children}</>;
}
