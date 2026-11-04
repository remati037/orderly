import { SignOutButton } from "@/components/auth/sign-out-button";

export default function NoAccessPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ui-canvas)",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "var(--ui-surface)",
          border: "1px solid var(--ui-border)",
          borderRadius: 14,
          padding: "32px 28px",
          maxWidth: 420,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--ui-text)", marginBottom: 8 }}>
          Nemaš pristup
        </h1>
        <p style={{ fontSize: 13, color: "var(--ui-muted)", lineHeight: 1.6, marginBottom: 20 }}>
          Tvoj nalog nije dodat u tim ili je deaktiviran. Obrati se vlasniku
          naloga da ti dodeli pristup.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
