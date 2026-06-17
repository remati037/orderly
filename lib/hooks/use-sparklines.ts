"use client";

import useSWR from "swr";
import { useSearchParams } from "next/navigation";

export interface Sparklines {
  labels:  string[];
  revenue: number[];
  orders:  number[];
  aov:     number[];
}

async function fetcher(url: string): Promise<Sparklines> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch sparkline data");
  return res.json();
}

// 7-day daily series for the revenue / orders / AOV KPI cards.
// Mirrors the site/product filters used by useKpiStats so the mini charts
// stay in sync with the headline numbers.
export function useSparklines(forceSiteId?: string): {
  data: Sparklines | null;
  isLoading: boolean;
} {
  const sp = useSearchParams();

  const siteId        = forceSiteId ?? sp.get("kpi_site");
  const productsParam = sp.get("kpi_products");
  const products      = productsParam ? productsParam.split(",").filter(Boolean) : [];

  const params = new URLSearchParams({ days: "7" });
  if (siteId)          params.set("siteId",   siteId);
  if (products.length) params.set("products", products.join(","));

  const url = `/api/stats/sparklines?${params.toString()}`;

  const { data, isLoading } = useSWR<Sparklines>(url, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  return { data: data ?? null, isLoading };
}
