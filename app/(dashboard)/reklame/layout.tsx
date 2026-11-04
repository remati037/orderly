import { requirePageRole } from "@/lib/auth/page-guards";

export default async function ReklameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageRole(["owner", "agent"]);
  return <>{children}</>;
}
