import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { SoundProvider } from "@/lib/contexts/sound-context";
import { RealtimeOrdersProvider } from "@/lib/contexts/realtime-orders-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SoundProvider>
      {/* Single always-on Realtime channel + KPI/table refresh trigger */}
      <RealtimeOrdersProvider>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar />

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
