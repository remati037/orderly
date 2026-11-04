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
      <div style={{ color: "var(--ui-faint)", fontSize: 13, padding: "40px 0" }}>
        Učitavanje…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--ui-text)", letterSpacing: "-0.02em", margin: 0 }}>
          Opšta podešavanja
        </h1>
        <p style={{ fontSize: 13, color: "var(--ui-faint)", margin: "4px 0 0" }}>
          Osnovna valuta i kursevi za prikaz prihoda.
        </p>
      </div>

      {/* Card */}
      <div style={{
        background: "var(--ui-surface)",
        border: "1px solid var(--ui-border)",
        borderRadius: 12,
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}>

        {/* Base currency */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ui-text)", marginBottom: 8 }}>
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
                  border: baseCurrency === c ? "none" : "1px solid var(--ui-border)",
                  background: baseCurrency === c ? "var(--ui-fill)" : "var(--ui-surface)",
                  color: baseCurrency === c ? "#fff" : "var(--ui-text-3)",
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
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ui-text)" }}>
              Kursevi
            </label>
            <span style={{ fontSize: 11, color: "var(--ui-faint)" }}>
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
              background: "var(--ui-subtle)",
              borderRadius: 8,
              fontSize: 13,
            }}>
              <span style={{ color: "var(--ui-faint)", minWidth: 160 }}>
                {CURRENCY_LABELS[baseCurrency]}
              </span>
              <span style={{ fontWeight: 700, color: "var(--ui-text)" }}>= 1</span>
              <span style={{ fontSize: 11, color: "var(--ui-faint)" }}>(osnovna)</span>
            </div>

            {rateRows.map((row) => (
              <div key={row.currency} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                border: "1px solid var(--ui-border)",
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 13, color: "var(--ui-text-3)", minWidth: 160 }}>
                  {row.label}
                </span>
                <span style={{ fontSize: 13, color: "var(--ui-faint)" }}>= </span>
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
                    border: "1px solid var(--ui-border)",
                    borderRadius: 6,
                    fontSize: 13,
                    outline: "none",
                    color: "var(--ui-text)",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--ui-faint)" }}>
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
              background: saving ? "var(--ui-border-strong)" : "var(--ui-fill)",
              color: "#fff",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              transition: "background 120ms",
            }}
          >
            {saving ? "Čuvanje…" : "Sačuvaj"}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: "var(--tone-green)", fontWeight: 500 }}>
              Sačuvano
            </span>
          )}
          {error && (
            <span style={{ fontSize: 13, color: "var(--tone-red)" }}>{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
