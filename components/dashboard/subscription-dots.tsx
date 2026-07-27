// N small dots next to a subscription product's name — how many times this
// customer has paid for it. Absence of the badge already means "first time",
// so this only ever renders for seq >= 2 (callers should skip it otherwise).
export function SubscriptionDots({ seq }: { seq: number }) {
  return (
    <span
      title={`${seq}. uplata za ovu pretplatu`}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}
    >
      {Array.from({ length: seq }, (_, i) => (
        <span
          key={i}
          style={{ width: 5, height: 5, borderRadius: "50%", background: "#16A34A", flexShrink: 0 }}
        />
      ))}
    </span>
  );
}
