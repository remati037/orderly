"use client";

import { useEffect, useState } from "react";

const CURRENCIES = ["EUR", "RSD", "USD"] as const;
type Currency = (typeof CURRENCIES)[number];

interface RateRow {
  currency: Currency;
  label: string;
  value: string;
}

const CURRENCY_LABELS: Record<Currency, string> = {
  EUR: "Euro (EUR)",
  RSD: "Srpski dinar (RSD)",
  USD: "Američki dolar (USD)",
};

function buildRateRows(rates: Record<string, number>, base: Currency): RateRow[] {
  return CURRENCIES.filter((c) => c !== base).map((c) => ({
    currency: c,
    label: CURRENCY_LABELS[c],
    value: String(rates[c] ?? ""),
  }));
}

export default function GeneralSettingsPage() {
  const [baseCurrency, setBaseCurrency] = useState<Currency>("EUR");
  const [rateRows, setRateRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [bcRes, ratesRes] = await Promise.all([
          fetch("/api/settings?key=base_currency"),
          fetch("/api/settings?key=exchange_rates"),
        ]);
        const { value: bc } = await bcRes.json();
        const { value: rates } = await ratesRes.json();
        const base: Currency = (bc as Currency) ?? "EUR";
        const parsedRates: Record<string, number> = rates ?? { EUR: 1, RSD: 0.00855, USD: 0.92 };
        setBaseCurrency(base);
        setRateRows(buildRateRows(parsedRates, base));
      } catch {
        setError("Greška pri učitavanju podešavanja.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleBaseChange(next: Currency) {
    setBaseCurrency(next);
    // Rebuild rows excluding the new base, preserving existing values where possible
    const existing: Record<string, string> = {};
    for (const r of rateRows) existing[r.currency] = r.value;
    setRateRows(
      CURRENCIES.filter((c) => c !== next).map((c) => ({
        currency: c,
        label: CURRENCY_LABELS[c],
        value: existing[c] ?? "",
      }))
    );
  }

  function handleRateChange(currency: Currency, value: string) {
    setRateRows((prev) =>
      prev.map((r) => (r.currency === currency ? { ...r, value } : r))
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Build full rates object: base = 1, others from inputs
      const rates: Record<string, number> = { [baseCurrency]: 1 };
      for (const row of rateRows) {
        const n = parseFloat(row.value);
        if (!isNaN(n) && n > 0) rates[row.currency] = n;
      }

      await Promise.all([
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "base_currency", value: baseCurrency }),
        }),
        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "exchange_rates", value: rates }),
        }),
      ]);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Greška pri čuvanju podešavanja.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ color: "#A1A1AA", fontSize: 13, padding: "40px 0" }}>
        Učitavanje…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#18181B", letterSpacing: "-0.02em", margin: 0 }}>
          Opšta podešavanja
        </h1>
        <p style={{ fontSize: 13, color: "#A1A1AA", margin: "4px 0 0" }}>
          Osnovna valuta i kursevi za prikaz prihoda.
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 12,
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}>

        {/* Base currency */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#18181B", marginBottom: 8 }}>
            Osnovna valuta
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => handleBaseChange(c)}
                style={{
                  padding: "7px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: baseCurrency === c ? "none" : "1px solid #E4E4E7",
                  background: baseCurrency === c ? "#18181B" : "#fff",
                  color: baseCurrency === c ? "#fff" : "#52525B",
                  cursor: "pointer",
                  transition: "all 120ms",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Exchange rates */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#18181B" }}>
              Kursevi
            </label>
            <span style={{ fontSize: 11, color: "#A1A1AA" }}>
              Kursevi se ažuriraju ručno
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Base = 1 (read-only) */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "#F4F4F5",
              borderRadius: 8,
              fontSize: 13,
            }}>
              <span style={{ color: "#A1A1AA", minWidth: 160 }}>
                {CURRENCY_LABELS[baseCurrency]}
              </span>
              <span style={{ fontWeight: 700, color: "#18181B" }}>= 1</span>
              <span style={{ fontSize: 11, color: "#A1A1AA" }}>(osnovna)</span>
            </div>

            {rateRows.map((row) => (
              <div key={row.currency} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                border: "1px solid #E4E4E7",
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 13, color: "#52525B", minWidth: 160 }}>
                  {row.label}
                </span>
                <span style={{ fontSize: 13, color: "#A1A1AA" }}>= </span>
                <input
                  type="number"
                  step="0.00001"
                  min="0"
                  value={row.value}
                  onChange={(e) => handleRateChange(row.currency, e.target.value)}
                  placeholder="0.00855"
                  style={{
                    width: 120,
                    padding: "5px 10px",
                    border: "1px solid #E4E4E7",
                    borderRadius: 6,
                    fontSize: 13,
                    outline: "none",
                    color: "#18181B",
                  }}
                />
                <span style={{ fontSize: 12, color: "#A1A1AA" }}>
                  {baseCurrency}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: saving ? "#D4D4D8" : "#18181B",
              color: "#fff",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              transition: "background 120ms",
            }}
          >
            {saving ? "Čuvanje…" : "Sačuvaj"}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 500 }}>
              Sačuvano
            </span>
          )}
          {error && (
            <span style={{ fontSize: 13, color: "#DC2626" }}>{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
