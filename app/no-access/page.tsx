import { UserButton } from "@clerk/nextjs";

export default function NoAccessPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F9F9F9",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #E4E4E7",
          borderRadius: 14,
          padding: "32px 28px",
          maxWidth: 420,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#18181B", marginBottom: 8 }}>
          Nemaš pristup
        </h1>
        <p style={{ fontSize: 13, color: "#71717A", lineHeight: 1.6, marginBottom: 20 }}>
          Tvoj nalog nije dodat u tim ili je deaktiviran. Obrati se vlasniku
          naloga da ti dodeli pristup.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <UserButton />
        </div>
      </div>
    </div>
  );
}
