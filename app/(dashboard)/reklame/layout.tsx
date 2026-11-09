import { requirePageRole } from "@/lib/auth/page-guards";
import { ReklameTabs } from "@/components/ads/ui";

export default async function ReklameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageRole(["owner", "agent"]);
  return (
    <>
      <ReklameTabs />
      {children}
    </>
  );
}
