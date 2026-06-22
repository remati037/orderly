"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// ── types ──────────────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  color_hex: string;
}

// ── constants ──────────────────────────────────────────────────────────────────

const ALL = "__all";

const ACTIVE_STYLE: React.CSSProperties = {
  borderColor: "#16A34A",
  color: "#16A34A",
  background: "#DCFCE7",
};

const DATE_PRESETS = [
  { value: "today",      label: "Danas" },
  { value: "yesterday",  label: "Juče" },
  { value: "7days",      label: "Poslednjih 7 dana" },
  { value: "month",      label: "Ovaj mesec" },
  { value: "last_month", label: "Prošli mesec" },
];

const PLATFORM_OPTIONS = [
  { value: "woocommerce", label: "WooCommerce" },
  { value: "thinkific",   label: "Thinkific" },
];

const STATUS_OPTIONS = [
  { value: "pending",    label: "Na čekanju" },
  { value: "processing", label: "U obradi" },
  { value: "completed",  label: "Završeno" },
  { value: "cancelled",  label: "Otkazano" },
  { value: "refunded",   label: "Refundirano" },
];

const PRODUCT_TYPE_OPTIONS = [
  { value: "physical",     label: "Fizički" },
  { value: "digital",      label: "Digitalni" },
  { value: "subscription", label: "Subscription" },
];

// ── filter state ───────────────────────────────────────────────────────────────

function useFilters() {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  const sites        = params.get("sites")?.split(",").filter(Boolean) ?? [];
  const platform     = params.get("platform") ?? "";
  const status       = params.get("status") ?? "";
  const product_type = params.get("product_type") ?? "";
  const date_preset  = params.get("date_preset") ?? "";
  const date_from    = params.get("date_from") ?? "";
  const date_to      = params.get("date_to") ?? "";

  const hasActive =
    sites.length > 0 || !!platform || !!status || !!product_type || !!date_preset || !!date_from;

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

  return {
    sites, platform, status, product_type, date_preset, date_from, date_to,
    hasActive,
    push,
    reset: () => router.replace(pathname, { scroll: false }),
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

function siteLabel(n: number) {
  if (n === 0) return "Svi sajtovi";
  if (n === 1) return "1 sajt";
  if (n <= 4)  return `${n} sajta`;
  return `${n} sajtova`;
}

function dateLabel(preset: string, from: string, to: string): string {
  const found = DATE_PRESETS.find((p) => p.value === preset);
  if (found) return found.label;
  if (from || to) {
    const fmt = (s: string) => {
      const [, m, d] = s.split("-");
      return `${d}.${m}`;
    };
    const f = from ? fmt(from) : "";
    const t = to   ? fmt(to)   : "";
    return f && t ? `${f} – ${t}` : f || t || "Prilagođeno";
  }
  return "Datum";
}

// ── site filter ────────────────────────────────────────────────────────────────

function SiteFilter({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (ids: string[]) => void;
}) {
  const [sites, setSites] = useState<Site[]>([]);
  const active = selected.length > 0;

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then(setSites)
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    onToggle(next);
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline" }), "text-[13px] gap-1.5")}
        style={active ? ACTIVE_STYLE : {}}
      >
        {siteLabel(selected.length)}
        <ChevronDownIcon className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1.5" align="start" sideOffset={6}>
        {sites.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Nema sajtova
          </p>
        ) : (
          sites.map((site) => (
            <label
              key={site.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
              }}
              className="hover:bg-muted/60 transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.includes(site.id)}
                onChange={() => toggle(site.id)}
                className="rounded"
              />
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
            </label>
          ))
        )}
        {selected.length > 0 && (
          <>
            <Separator className="my-1" />
            <button
              onClick={() => onToggle([])}
              className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
            >
              Obriši selekciju
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── simple select filter ───────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  defaultLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  defaultLabel: string;
  options: { value: string; label: string }[];
}) {
  const active = !!value;
  return (
    <Select
      value={value || ALL}
      onValueChange={(v) => onChange(!v || v === ALL ? "" : (v as string))}
    >
      <SelectTrigger
        className="text-[13px]"
        style={active ? ACTIVE_STYLE : {}}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={ALL}>{defaultLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── date filter ────────────────────────────────────────────────────────────────

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
  const active = !!preset || !!from || !!to;
  const label = dateLabel(preset, from, to);

  function selectPreset(value: string) {
    onSelect({ date_preset: value, date_from: null, date_to: null });
    setOpen(false);
  }

  function setCustom(key: "date_from" | "date_to", value: string) {
    onSelect({ date_preset: "custom", [key]: value || null });
  }

  return (
    <Popover open={open} onOpenChange={(o) => setOpen(o)}>
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
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => selectPreset(p.value)}
              className={cn(
                "text-left text-[13px] px-2.5 py-1.5 rounded-md transition-colors",
                preset === p.value
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted/60"
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
                value={from}
                onChange={(e) => setCustom("date_from", e.target.value)}
                className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">Do</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setCustom("date_to", e.target.value)}
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
                onSelect({ date_preset: null, date_from: null, date_to: null });
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

// ── main component ─────────────────────────────────────────────────────────────

export function FilterBar() {
  const f = useFilters();

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          border: "1px solid #E4E4E7",
          borderRadius: 10,
          padding: "10px 14px",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        <SiteFilter
          selected={f.sites}
          onToggle={(ids) => f.push({ sites: ids })}
        />

        <FilterSelect
          value={f.platform}
          onChange={(v) => f.push({ platform: v || null })}
          defaultLabel="Platforma"
          options={PLATFORM_OPTIONS}
        />

        <FilterSelect
          value={f.status}
          onChange={(v) => f.push({ status: v || null })}
          defaultLabel="Status"
          options={STATUS_OPTIONS}
        />

        <FilterSelect
          value={f.product_type}
          onChange={(v) => f.push({ product_type: v || null })}
          defaultLabel="Tip proizvoda"
          options={PRODUCT_TYPE_OPTIONS}
        />

        <DateFilter
          preset={f.date_preset}
          from={f.date_from}
          to={f.date_to}
          onSelect={(updates) => f.push(updates as Record<string, string | null>)}
        />

        {f.hasActive && (
          <Button
            variant="ghost"
            onClick={f.reset}
            style={{ fontSize: 13, color: "#71717A", marginLeft: "auto" }}
          >
            <XIcon className="size-3.5" />
            Resetuj filtere
          </Button>
        )}
      </div>
    </div>
  );
}
