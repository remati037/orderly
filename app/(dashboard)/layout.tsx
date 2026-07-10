import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { SoundProvider } from "@/lib/contexts/sound-context";
import { RealtimeOrdersProvider } from "@/lib/contexts/realtime-orders-context";
import { getMember } from "@/lib/auth/roles";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Signed in via Clerk but not on the team → no access at all.
  const member = await getMember();
  if (!member) redirect("/no-access");

  return (
    <SoundProvider>
      {/* Single always-on Realtime channel + KPI/table refresh trigger */}
      <RealtimeOrdersProvider>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar role={member.role} email={member.email} />

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <DashboardHeader />

            <main
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px 28px",
                background: "#F9F9F9",
              }}
            >
              {children}
            </main>
          </div>
        </div>
      </RealtimeOrdersProvider>
    </SoundProvider>
  );
}
