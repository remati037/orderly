"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, CheckIcon, ChevronDownIcon, PackageIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

// ── types ──────────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  color_hex: string;
}

// ── constants ──────────────────────────────────────────────────────────────────

const ACTIVE_STYLE: React.CSSProperties = {
  borderColor: "#16A34A",
  color: "#16A34A",
  background: "#DCFCE7",
};

const PRESETS = [
  { value: "today",      label: "Danas" },
  { value: "yesterday",  label: "Juče" },
  { value: "this_week",  label: "Ova nedelja" },
  { value: "this_month", label: "Ovaj mesec" },
  { value: "this_year",  label: "Ova godina" },
];

// ── filter state hook ──────────────────────────────────────────────────────────

function useKpiFilters() {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  const preset        = params.get("kpi_preset") ?? "today";
  const compare       = params.get("kpi_compare") === "month" ? "month" : "day";
  const from          = params.get("kpi_from") ?? "";
  const to            = params.get("kpi_to") ?? "";
  const siteId        = params.get("kpi_site") ?? "";
  const productsParam = params.get("kpi_products") ?? "";
  const products      = productsParam ? productsParam.split(",").filter(Boolean) : [];

  const hasActive =
    preset !== "today" || !!from || !!to || !!siteId || products.length > 0;

  function push(updates: Record<string, string | string[] | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (!v || (Array.isArray(v) && !v.length)) {
        p.delete(k);
      } else {
        p.set(k, Array.isArray(v) ? v.join(",") : v);
      }
    }
    router.replace(p.size ? `${pathname}?${p.toString()}` : pathname, {
      scroll: false,
    });
  }

  function reset() {
    const p = new URLSearchParams(params.toString());
    ["kpi_preset", "kpi_compare", "kpi_from", "kpi_to", "kpi_site", "kpi_products"].forEach(
      (k) => p.delete(k),
    );
    router.replace(p.size ? `${pathname}?${p.toString()}` : pathname, {
      scroll: false,
    });
  }

  return { preset, compare, from, to, siteId, products, hasActive, push, reset };
}

// ── CompareToggle ──────────────────────────────────────────────────────────────

function CompareToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const OPTIONS = [
    { value: "day",   label: "vs prošli dan" },
    { value: "month", label: "vs prošli mesec" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #E4E4E7",
        borderRadius: 8,
        padding: 2,
        background: "#fff",
        gap: 2,
      }}
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              padding: "5px 11px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: active ? "#DCFCE7" : "transparent",
              color: active ? "#15803D" : "#71717A",
              transition: "background 120ms, color 120ms",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

function presetLabel(preset: string, from: string, to: string): string {
  const found = PRESETS.find((p) => p.value === preset);
  if (found) return found.label;
  if (preset === "custom" && (from || to)) {
    const fmt = (s: string) => {
      const [, m, d] = s.split("-");
      return `${d}.${m}`;
    };
    const f = from ? fmt(from) : "";
    const t = to   ? fmt(to)   : "";
    return f && t ? `${f} – ${t}` : f || t || "Prilagođeno";
  }
  return "Danas";
}

// ── DateFilter ─────────────────────────────────────────────────────────────────

function DateFilter({
  preset,
  from,
  to,
  onSelect,
}: {
  preset: string;
  from: string;
  to: string;
  onSelect: (updates: Record<string, string | null>) => void;
}) {
  const [open, setOpen] = useState(false);
  const isCustom = preset === "custom";
  const active   = preset !== "today" || !!from;
  const label    = presetLabel(preset, from, to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline" }), "text-[13px] gap-1.5")}
        style={active ? ACTIVE_STYLE : {}}
      >
        <CalendarIcon className="size-3.5" />
        {label}
        <ChevronDownIcon className="size-3.5 opacity-60" />
      </PopoverTrigger>

      <PopoverContent className="w-64 p-1.5" align="start" sideOffset={6}>
        <div className="flex flex-col gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                onSelect({ kpi_preset: p.value, kpi_from: null, kpi_to: null });
                setOpen(false);
              }}
              className={cn(
                "text-left text-[13px] px-2.5 py-1.5 rounded-md transition-colors",
                preset === p.value && !isCustom
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted/60",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Separator className="my-2" />

        <div className="flex flex-col gap-2 px-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Prilagođeno
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">Od</span>
              <input
                type="date"
                value={isCustom ? from : ""}
                onChange={(e) =>
                  onSelect({ kpi_preset: "custom", kpi_from: e.target.value || null })
                }
                className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">Do</span>
              <input
                type="date"
                value={isCustom ? to : ""}
                min={isCustom ? from : undefined}
                onChange={(e) =>
                  onSelect({ kpi_preset: "custom", kpi_to: e.target.value || null })
                }
                className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
              />
            </div>
          </div>
        </div>

        {active && (
          <>
            <Separator className="my-2" />
            <button
              onClick={() => {
                onSelect({ kpi_preset: null, kpi_from: null, kpi_to: null });
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
            >
              Obriši datum
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── SiteSelect ─────────────────────────────────────────────────────────────────

function SiteSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const active = !!value;

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then(setSites)
      .catch(() => {});
  }, []);

  const selected = sites.find((s) => s.id === value);
  const label = selected ? selected.name : "Svi sajtovi";

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline" }), "text-[13px] gap-1.5")}
        style={active ? ACTIVE_STYLE : {}}
      >
        {active && selected && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: selected.color_hex,
              flexShrink: 0,
            }}
          />
        )}
        {label}
        <ChevronDownIcon className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1.5" align="start" sideOffset={6}>
        <button
          onClick={() => onChange("")}
          className={cn(
            "w-full text-left text-[13px] px-2.5 py-1.5 rounded-md transition-colors",
            !value ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60",
          )}
        >
          Svi sajtovi
        </button>
        {sites.map((site) => (
          <button
            key={site.id}
            onClick={() => onChange(site.id)}
            className={cn(
              "w-full text-left text-[13px] px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-2",
              value === site.id
                ? "bg-primary/10 text-primary font-medium"
                : "hover:bg-muted/60",
            )}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: site.color_hex,
                flexShrink: 0,
              }}
            />
            <span className="truncate">{site.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ── ProductFilter ──────────────────────────────────────────────────────────────

function ProductFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const active = value.length > 0;

  // Fetch products when popover opens or search changes
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(
      () => {
        fetch(`/api/kpi-products?q=${encodeURIComponent(search)}`)
          .then((r) => r.json())
          .then((d) => { setOptions(d.products ?? []); setLoading(false); })
          .catch(() => setLoading(false));
      },
      search ? 300 : 0,
    );
    return () => clearTimeout(t);
  }, [open, search]);

  // Clear search when closed
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  };

  // Always show selected items even if they don't match current search
  const allOptions = [
    ...value.filter((v) => !options.includes(v)),
    ...options,
  ];

  const label = !active
    ? "Svi proizvodi"
    : value.length === 1
      ? value[0].length > 22 ? value[0].slice(0, 22) + "…" : value[0]
      : `${value.length} izabrana`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline" }), "text-[13px] gap-1.5 max-w-52")}
        style={active ? ACTIVE_STYLE : {}}
      >
        <PackageIcon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="size-3.5 opacity-60 shrink-0" />
      </PopoverTrigger>

      <PopoverContent className="w-64 p-1.5" align="start" sideOffset={6}>
        {/* Search input */}
        <div className="px-0.5 pb-1.5">
          <input
            type="text"
            placeholder="Pretraži proizvod..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="w-full h-7 rounded-md border border-input bg-transparent px-2.5 text-xs outline-none focus:border-ring"
          />
        </div>

        <Separator className="mb-1" />

        {/* Options list */}
        <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto py-0.5">
          {loading && (
            <p className="text-xs text-muted-foreground px-2.5 py-2">Učitavanje…</p>
          )}
          {!loading && allOptions.length === 0 && (
            <p className="text-xs text-muted-foreground px-2.5 py-2">Nema rezultata</p>
          )}
          {!loading &&
            allOptions.map((name) => {
              const isSelected = value.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => toggle(name)}
                  className={cn(
                    "w-full text-left text-[13px] px-2 py-1.5 rounded-md transition-colors flex items-center gap-2",
                    isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "size-4 rounded border flex items-center justify-center shrink-0",
                      isSelected ? "bg-primary border-primary" : "border-input",
                    )}
                  >
                    {isSelected && <CheckIcon className="size-2.5 text-white" />}
                  </span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
        </div>

        {active && (
          <>
            <Separator className="my-1" />
            <button
              onClick={() => { onChange([]); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
            >
              Obriši izbor ({value.length})
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export function KpiFilters() {
  const f = useKpiFilters();

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <DateFilter
        preset={f.preset}
        from={f.from}
        to={f.to}
        onSelect={(updates) => f.push(updates as Record<string, string | null>)}
      />

      <CompareToggle
        value={f.compare}
        onChange={(v) => f.push({ kpi_compare: v === "month" ? "month" : null })}
      />

      <SiteSelect
        value={f.siteId}
        onChange={(id) => f.push({ kpi_site: id || null })}
      />

      <ProductFilter
        value={f.products}
        onChange={(arr) => f.push({ kpi_products: arr.join(",") || null })}
      />

      {f.hasActive && (
        <Button
          variant="ghost"
          onClick={f.reset}
          style={{ fontSize: 13, color: "#71717A", marginLeft: "auto" }}
        >
          <XIcon className="size-3.5" />
          Resetuj
        </Button>
      )}
    </div>
  );
}
