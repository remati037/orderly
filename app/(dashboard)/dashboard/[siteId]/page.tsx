import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { KPISection } from "@/components/dashboard/kpi-section";
import { DailyGoalTracker } from "@/components/dashboard/daily-goal-tracker";
import { DailyRevenueChart } from "@/components/dashboard/charts/daily-revenue-chart";
import { StatusBreakdownChart } from "@/components/dashboard/charts/status-breakdown-chart";
import { TopProductsChart } from "@/components/dashboard/charts/top-products-chart";
import { MonthlyComparisonCard } from "@/components/dashboard/charts/monthly-comparison-card";
import { SyncButton } from "./sync-button";

// ── badge helpers ──────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const isThinkific = platform === "thinkific";
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: 11,
      fontWeight: 600,
      padding: "3px 10px",
      borderRadius: 99,
      letterSpacing: "0.02em",
      background: isThinkific ? "#EDE9FE" : "#F4F4F5",
      color: isThinkific ? "#4338CA" : "#52525B",
    }}>
      {isThinkific ? "Thinkific" : "WooCommerce"}
    </span>
  );
}

function ProjectTypeBadge({ type }: { type: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    standard:     { bg: "#F4F4F5", color: "#52525B",   label: "Standard" },
    subscription: { bg: "#F0FDF4", color: "#166534",   label: "Subscription" },
    digital:      { bg: "#EEF2FF", color: "#4338CA",   label: "Digital" },
  };
  const c = config[type] ?? config.standard;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      fontSize: 11,
      fontWeight: 600,
      padding: "3px 10px",
      borderRadius: 99,
      background: c.bg,
      color: c.color,
    }}>
      {c.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "upravo sada";
  if (min < 60) return `pre ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pre ${h}h`;
  return `pre ${Math.floor(h / 24)} dana`;
}

// ── page ───────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ siteId: string }>;
}

// Access is enforced by app/(dashboard)/dashboard/layout.tsx (owner only).
export default async function SiteDashboardPage({ params }: PageProps) {
  const { siteId } = await params;
  const supabase = adminClient();

  const [siteRes, syncRes] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, platform, color_hex, project_type, is_active")
      .eq("id", siteId)
      .single(),
    supabase
      .from("sync_log")
      .select("created_at, status")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (siteRes.error || !siteRes.data) return notFound();

  const site = siteRes.data;
  const lastSync = syncRes.data ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* site color indicator */}
            <span style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: site.color_hex ?? "#16A34A",
              flexShrink: 0,
            }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
              {site.name}
            </h1>
            <PlatformBadge platform={site.platform} />
            <ProjectTypeBadge type={site.project_type ?? "standard"} />
          </div>
          <p style={{ fontSize: 12, color: "#A1A1AA", margin: "6px 0 0 22px" }}>
            {lastSync
              ? `Poslednja sinhronizacija: ${relativeTime(lastSync.created_at)}`
              : "Još uvek nije sinhronizovano"}
          </p>
        </div>

        {/* Sync now */}
        <SyncButton siteId={siteId} platform={site.platform} />
      </div>

      {/* Daily goal (site-specific) */}
      <DailyGoalTracker siteId={siteId} />

      {/* KPIs filtered to this site */}
      <KPISection siteId={siteId} />

      {/* Revenue + Monthly comparison */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        gap: 16,
        alignItems: "start",
      }}>
        <DailyRevenueChart siteId={siteId} />
        <MonthlyComparisonCard siteId={siteId} />
      </div>

      {/* Status breakdown + Top products */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        alignItems: "start",
      }}>
        <StatusBreakdownChart siteId={siteId} />
        <TopProductsChart siteId={siteId} />
      </div>

    </div>
  );
}
