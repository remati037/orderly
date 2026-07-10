"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser-client";

export default function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Pogrešan email ili lozinka."
          : error.message
      );
      setBusy(false);
      return;
    }

    // Full navigation so the middleware picks up the fresh session cookie.
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      style={{
        background: "#fff",
        border: "1px solid #E4E4E7",
        borderRadius: 14,
        padding: "30px 28px",
        width: "100%",
        maxWidth: 380,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 22 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "linear-gradient(135deg, #16A34A, #15803D)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          O
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#18181B" }}>
          Orderly
        </span>
      </div>

      <label style={LABEL}>Email</label>
      <input
        style={{ ...INPUT, marginBottom: 14 }}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <label style={LABEL}>Lozinka</label>
      <input
        style={{ ...INPUT, marginBottom: 18 }}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && (
        <p style={{ fontSize: 12.5, color: "#DC2626", marginBottom: 14 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        style={{
          width: "100%",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #16A34A",
          background: busy ? "#4ADE80" : "#16A34A",
          color: "#fff",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Prijavljivanje…" : "Prijavi se"}
      </button>
    </form>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#71717A",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  display: "block",
  marginBottom: 5,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  padding: "9px 11px",
  border: "1px solid #E4E4E7",
  borderRadius: 8,
  outline: "none",
};
