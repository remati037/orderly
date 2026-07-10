export default function NaplataPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#18181B", marginBottom: 4 }}>
        Naplata
      </h1>
      <p style={{ fontSize: 13, color: "#71717A", marginBottom: 24 }}>
        Pipeline za zadržane i neuspele transakcije.
      </p>

      <div
        style={{
          background: "#fff",
          border: "1px solid #E4E4E7",
          borderRadius: 12,
          padding: "28px 24px",
          textAlign: "center",
          color: "#71717A",
          fontSize: 13,
        }}
      >
        Pipeline se pravi u sledećem koraku (Faza 2 i 3).
      </div>
    </div>
  );
}
