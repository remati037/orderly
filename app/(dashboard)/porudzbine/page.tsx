import { Suspense } from "react";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { OrdersTable } from "@/components/dashboard/orders-table";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function PorudzbinePage({ searchParams }: PageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ui-text)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
          Porudžbine
        </h1>
        <p style={{ fontSize: 13, color: "var(--ui-faint)", margin: "4px 0 0" }}>
          Sve porudžbine sa filterima.
        </p>
      </div>

      <Suspense fallback={<div style={{ height: 48, background: "var(--ui-subtle)", borderRadius: 10, animation: "pulse 2s infinite" }} />}>
        <FilterBar />
      </Suspense>

      <Suspense fallback={
        <div style={{
          background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 12,
          padding: "48px 20px", textAlign: "center", color: "var(--ui-faint)", fontSize: 13,
        }}>
          Učitavanje porudžbina…
        </div>
      }>
        <OrdersTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
