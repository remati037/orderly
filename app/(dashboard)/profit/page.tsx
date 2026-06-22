"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TrendingUpIcon,
  CircleDollarSignIcon,
  PercentIcon,
  TrophyIcon,
  RotateCcwIcon,
  CheckIcon,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRSD } from "@/lib/hooks/use-kpi-stats";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  platform: "woocommerce" | "thinkific";
  project_type: "standard" | "subscription" | "digital";
  color_hex: string;
  default_margin_percent: number | null;
}

interface Product {
  name: string;
  product_type: string;
  site_id: string;
  site_name: string;
  site_color: string;
  cost_percent: number | null;
  cost_fixed: number | null;
}

interface ProfitKPI {
  gross_revenue_month: number;
  net_profit_month: number;
  avg_margin_pct: number;
  highest_margin_product: string | null;
}

type CostMode = "percent" | "fixed";

interface ProductEdit {
  mode: CostMode;
  value: string;
  dirty: boolean;
}

// ── Constants & helpers ────────────────────────────────────────────────────────

const PREVIEW_ORDER = 50;

const PROJECT_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  subscription: "Pretplata",
  digital: "Digitalni",
};

function productKey(siteId: string, name: string) {
  return `${siteId}::${name}`;
}

function initialMode(p: Product): CostMode {
  return p.cost_fixed != null ? "fixed" : "percent";
}

function initialValue(p: Product): string {
  if (p.cost_percent != null) return String(p.cost_percent);
  if (p.cost_fixed != null) return String(p.cost_fixed);
  return "";
}

function calcEffectiveMargin(mode: CostMode, value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  if (mode === "percent") return `${Math.round(100 - num)}%`;
  return `−€${num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ks`;
}

function calcPreviewNet(mode: CostMode, value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  if (mode === "percent") return formatRSD(PREVIEW_ORDER * (1 - num / 100));
  return formatRSD(PREVIEW_ORDER - num);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof TrendingUpIcon;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 12,
        padding: "18px 20px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#71717A",
          }}
        >
          {label}
        </span>
        <Icon style={{ width: 15, height: 15, color: "#A1A1AA", flexShrink: 0 }} />
      </div>
      <span
        style={{
          display: "block",
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#18181B",
          marginTop: 6,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{ fontSize: 11, color: "#A1A1AA", marginTop: 3, display: "block" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function SectionBox({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #F4F4F5",
        }}
      >
        <h2
          style={{ fontSize: 14, fontWeight: 600, color: "#18181B", margin: 0 }}
        >
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        background: type === "success" ? "#16A34A" : "#DC2626",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {type === "success" && <CheckIcon style={{ width: 14, height: 14 }} />}
      {message}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProfitPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [kpi, setKpi] = useState<ProfitKPI | null>(null);
  const [loading, setLoading] = useState(true);

  // Site margin edits: siteId → pending string value
  const [pendingMargins, setPendingMargins] = useState<Record<string, string>>({});
  const [savingMargin, setSavingMargin] = useState<Record<string, boolean>>({});

  // Product cost edits
  const [productEdits, setProductEdits] = useState<Record<string, ProductEdit>>({});
  const [savingProduct, setSavingProduct] = useState<Record<string, boolean>>({});

  // Recalculate
  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesRes, productsRes, kpiRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/profit/products"),
        fetch("/api/profit/kpi"),
      ]);
      const [sitesData, productsData, kpiData] = await Promise.all([
        sitesRes.json(),
        productsRes.json(),
        kpiRes.json(),
      ]);

      setSites(sitesData ?? []);

      const prods: Product[] = productsData.products ?? [];
      setProducts(prods);

      const edits: Record<string, ProductEdit> = {};
      for (const p of prods) {
        edits[productKey(p.site_id, p.name)] = {
          mode: initialMode(p),
          value: initialValue(p),
          dirty: false,
        };
      }
      setProductEdits(edits);
      setKpi(kpiData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Realtime: refresh KPI when orders change ──────────────────────────────────
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    const channel = supabaseBrowser
      .channel("profit-orders-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => loadDataRef.current()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => loadDataRef.current()
      )
      .subscribe();

    return () => { supabaseBrowser.removeChannel(channel); };
  }, []);

  // ── Site margin actions ───────────────────────────────────────────────────────

  function currentMargin(site: Site): string {
    return pendingMargins[site.id] ?? String(site.default_margin_percent ?? "");
  }

  function isMarginDirty(site: Site): boolean {
    if (pendingMargins[site.id] === undefined) return false;
    const num = parseFloat(pendingMargins[site.id]);
    return !isNaN(num) && num !== site.default_margin_percent;
  }

  async function saveSiteMargin(site: Site) {
    const val = currentMargin(site);
    if (val === "") return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0 || num > 100) {
      showToast("Marža mora biti između 0 i 100", "error");
      return;
    }
    if (num === site.default_margin_percent) {
      setPendingMargins((prev) => {
        const n = { ...prev };
        delete n[site.id];
        return n;
      });
      return;
    }

    setSavingMargin((prev) => ({ ...prev, [site.id]: true }));
    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_margin_percent: num }),
      });
      if (res.ok) {
        setSites((prev) =>
          prev.map((s) =>
            s.id === site.id ? { ...s, default_margin_percent: num } : s
          )
        );
        setPendingMargins((prev) => {
          const n = { ...prev };
          delete n[site.id];
          return n;
        });
        showToast("Marža sačuvana", "success");
      } else {
        showToast("Greška pri čuvanju marže", "error");
      }
    } finally {
      setSavingMargin((prev) => ({ ...prev, [site.id]: false }));
    }
  }

  // ── Product edit actions ──────────────────────────────────────────────────────

  function getEdit(p: Product): ProductEdit {
    return (
      productEdits[productKey(p.site_id, p.name)] ?? {
        mode: "percent",
        value: "",
        dirty: false,
      }
    );
  }

  function updateEdit(p: Product, updates: Partial<ProductEdit>) {
    const key = productKey(p.site_id, p.name);
    setProductEdits((prev) => ({
      ...prev,
      [key]: { ...getEdit(p), ...updates, dirty: true },
    }));
  }

  function toggleMode(p: Product) {
    const edit = getEdit(p);
    updateEdit(p, {
      mode: edit.mode === "percent" ? "fixed" : "percent",
      value: "",
    });
  }

  async function saveProductOverride(p: Product) {
    const key = productKey(p.site_id, p.name);
    const edit = getEdit(p);
    const num = parseFloat(edit.value);

    const payload = {
      site_id: p.site_id,
      name: p.name,
      cost_percent: null as number | null,
      cost_fixed: null as number | null,
    };

    if (edit.value !== "" && !isNaN(num)) {
      if (edit.mode === "percent") payload.cost_percent = num;
      else payload.cost_fixed = num;
    }

    setSavingProduct((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/profit/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((prod) =>
            prod.site_id === p.site_id && prod.name === p.name
              ? {
                  ...prod,
                  cost_percent: payload.cost_percent,
                  cost_fixed: payload.cost_fixed,
                }
              : prod
          )
        );
        setProductEdits((prev) => ({
          ...prev,
          [key]: { ...edit, dirty: false },
        }));
        showToast("Sačuvano", "success");
      } else {
        showToast("Greška pri čuvanju", "error");
      }
    } finally {
      setSavingProduct((prev) => ({ ...prev, [key]: false }));
    }
  }

  // ── Recalculate ───────────────────────────────────────────────────────────────

  async function handleRecalculate() {
    if (
      !confirm(
        "Rekalkulisati neto zaradu za sve istorijske porudžbine?\nOvo će ažurirati sve vrednosti na osnovu trenutnih marži."
      )
    )
      return;

    setRecalculating(true);
    setRecalcProgress(null);

    let from = 0;
    try {
      while (true) {
        const res = await fetch("/api/profit/recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from }),
        });
        if (!res.ok) {
          showToast("Greška pri rekalkulaciji", "error");
          break;
        }
        const data: {
          total: number;
          processed: number;
          next_from: number;
          done: boolean;
        } = await res.json();

        setRecalcProgress({ processed: data.processed, total: data.total });

        if (data.done) {
          showToast(
            `Rekalkulisano ${data.total.toLocaleString("sr-RS")} porudžbina`,
            "success"
          );
          await loadData();
          break;
        }
        from = data.next_from;
      }
    } finally {
      setRecalculating(false);
      setTimeout(() => setRecalcProgress(null), 6000);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#18181B",
              letterSpacing: "-0.02em",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Profit & Troškovi
          </h1>
          <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0" }}>
            Podesi marže po sajtu i troškove po proizvodu
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: "flex", gap: 12 }}>
          <StatCard
            label="Bruto prihod mesec"
            value={kpi ? formatRSD(kpi.gross_revenue_month) : "—"}
            icon={TrendingUpIcon}
          />
          <StatCard
            label="Neto zarada mesec"
            value={kpi ? formatRSD(kpi.net_profit_month) : "—"}
            icon={CircleDollarSignIcon}
          />
          <StatCard
            label="Prosečna marža"
            value={kpi ? `${kpi.avg_margin_pct.toFixed(1)}%` : "—"}
            icon={PercentIcon}
          />
          <StatCard
            label="Najveća marža"
            value={kpi?.highest_margin_product ?? "—"}
            sub="najniži cost %"
            icon={TrophyIcon}
          />
        </div>

        {/* Section 1 — Site default margins */}
        <SectionBox
          title="Podrazumevane marže po sajtu"
          description="Primenjuje se na sve porudžbine koje nemaju override po proizvodu"
        >
          {loading ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "#A1A1AA",
                fontSize: 13,
              }}
            >
              Učitavanje...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sajt</TableHead>
                  <TableHead>Platforma</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Podrazumevana marža</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: site.color_hex,
                            flexShrink: 0,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ fontWeight: 500, fontSize: 13 }}>
                          {site.name}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="secondary">
                        {site.platform === "woocommerce"
                          ? "WooCommerce"
                          : "Thinkific"}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline">
                        {PROJECT_TYPE_LABELS[site.project_type] ??
                          site.project_type}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          style={{ width: 90 }}
                          value={currentMargin(site)}
                          onChange={(e) =>
                            setPendingMargins((prev) => ({
                              ...prev,
                              [site.id]: e.target.value,
                            }))
                          }
                          onBlur={() => saveSiteMargin(site)}
                          placeholder="—"
                        />
                        <span
                          style={{ fontSize: 13, color: "#71717A" }}
                        >
                          %
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {isMarginDirty(site) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingMargin[site.id]}
                          onClick={() => saveSiteMargin(site)}
                        >
                          {savingMargin[site.id] ? "..." : "Sačuvaj"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionBox>

        {/* Section 2 — Product overrides */}
        <SectionBox
          title="Override po proizvodu"
          description="Cost % ili fiksan trošak po komadu — ima prednost nad maržom sajta"
        >
          {loading ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "#A1A1AA",
                fontSize: 13,
              }}
            >
              Učitavanje...
            </div>
          ) : products.length === 0 ? (
            <div
              style={{
                padding: "48px 20px",
                textAlign: "center",
                color: "#A1A1AA",
                fontSize: 13,
              }}
            >
              Nema proizvoda — sinhronizuj porudžbine pa se vrati ovde
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proizvod</TableHead>
                    <TableHead>Sajt</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Vrsta troška</TableHead>
                    <TableHead>Vrednost</TableHead>
                    <TableHead>Efektivna marža</TableHead>
                    <TableHead>Net na €50</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const edit = getEdit(p);
                    const key = productKey(p.site_id, p.name);
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <span
                            style={{ fontWeight: 500, fontSize: 13 }}
                          >
                            {p.name}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: p.site_color,
                                flexShrink: 0,
                                display: "inline-block",
                              }}
                            />
                            <span style={{ fontSize: 13 }}>
                              {p.site_name}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              p.product_type === "digital" ||
                              p.product_type === "course"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {p.product_type}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <button
                            type="button"
                            onClick={() => toggleMode(p)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "3px 12px",
                              borderRadius: 99,
                              border: "1px solid",
                              borderColor:
                                edit.mode === "percent"
                                  ? "#BFDBFE"
                                  : "#BBF7D0",
                              background:
                                edit.mode === "percent"
                                  ? "#EFF6FF"
                                  : "#F0FDF4",
                              color:
                                edit.mode === "percent"
                                  ? "#1D4ED8"
                                  : "#16A34A",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            {edit.mode === "percent" ? "%" : "€"}
                          </button>
                        </TableCell>

                        <TableCell>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Input
                              type="number"
                              min={0}
                              max={edit.mode === "percent" ? 100 : undefined}
                              step={edit.mode === "percent" ? 0.1 : 1}
                              style={{ width: 100 }}
                              value={edit.value}
                              onChange={(e) =>
                                updateEdit(p, { value: e.target.value })
                              }
                              placeholder={
                                edit.mode === "percent" ? "0–100" : "0.00"
                              }
                            />
                            <span
                              style={{ fontSize: 12, color: "#71717A" }}
                            >
                              {edit.mode === "percent" ? "%" : "€"}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#18181B",
                            }}
                          >
                            {calcEffectiveMargin(edit.mode, edit.value)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#16A34A",
                            }}
                          >
                            {calcPreviewNet(edit.mode, edit.value)}
                          </span>
                        </TableCell>

                        <TableCell>
                          {edit.dirty && (
                            <Button
                              size="sm"
                              disabled={savingProduct[key]}
                              onClick={() => saveProductOverride(p)}
                            >
                              {savingProduct[key] ? "..." : "Sačuvaj"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionBox>

        {/* Recalculate */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #E4E4E7",
            borderRadius: 12,
            padding: "18px 20px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#18181B",
                margin: 0,
              }}
            >
              Rekalkuliši sve porudžbine
            </p>
            <p
              style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}
            >
              Ažurira{" "}
              <code
                style={{
                  fontSize: 11,
                  background: "#F4F4F5",
                  padding: "1px 5px",
                  borderRadius: 4,
                }}
              >
                net_profit
              </code>{" "}
              na svim istorijskim porudžbinama prema trenutnim podešavanjima marži
            </p>

            {recalcProgress && (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    height: 4,
                    borderRadius: 99,
                    background: "#F4F4F5",
                    overflow: "hidden",
                    width: 300,
                    maxWidth: "100%",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 99,
                      background: "#16A34A",
                      width: `${Math.min(
                        100,
                        (recalcProgress.processed /
                          Math.max(1, recalcProgress.total)) *
                          100
                      )}%`,
                      transition: "width 300ms ease",
                    }}
                  />
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "#71717A",
                    margin: "4px 0 0",
                  }}
                >
                  {recalcProgress.processed.toLocaleString("sr-RS")} /{" "}
                  {recalcProgress.total.toLocaleString("sr-RS")} porudžbina
                </p>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            disabled={recalculating || loading}
            onClick={handleRecalculate}
            style={{ flexShrink: 0, marginTop: 2 }}
          >
            <RotateCcwIcon
              style={{ width: 14, height: 14 }}
              className={recalculating ? "animate-spin" : ""}
            />
            {recalculating ? "Rekalkulišem..." : "Rekalkuliši sve porudžbine"}
          </Button>
        </div>

      </div>
    </>
  );
}
