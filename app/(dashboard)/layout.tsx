import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { SoundProvider } from "@/lib/contexts/sound-context";
import { SoundSubscriber } from "@/components/dashboard/sound-subscriber";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SoundProvider>
      {/* Invisible – owns the layout-level realtime subscription for sound */}
      <SoundSubscriber />

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
    </SoundProvider>
  );
}
