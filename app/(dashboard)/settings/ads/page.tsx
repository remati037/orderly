import AdsManager from "./ads-manager";

// Access is enforced by app/(dashboard)/settings/layout.tsx (owner only).
export default function AdsPage() {
  return <AdsManager />;
}
