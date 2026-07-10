import SitesManager from "./sites-manager";

// Access is enforced by app/(dashboard)/settings/layout.tsx (owner only).
export default function SitesPage() {
  return <SitesManager />;
}
