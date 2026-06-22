"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, SettingsIcon, MonitorIcon, BarChart2Icon, CircleDollarSignIcon, UsersIcon, CreditCardIcon, SlidersHorizontalIcon, BellIcon, MegaphoneIcon } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; icon: typeof LayoutDashboardIcon }
interface NavGroup { title: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    title: "Pregled",
    items: [
      { href: "/dashboard",     label: "Dashboard", icon: LayoutDashboardIcon },
      { href: "/analytics",     label: "Analitika", icon: BarChart2Icon },
    ],
  },
  {
    title: "Prodaja",
    items: [
      { href: "/customers",     label: "Kupci",     icon: UsersIcon },
      { href: "/subscriptions", label: "Pretplate", icon: CreditCardIcon },
      { href: "/profit",        label: "Profit",    icon: CircleDollarSignIcon },
    ],
  },
  {
    title: "Podešavanja",
    items: [
      { href: "/settings/sites",   label: "Sajtovi",      icon: SettingsIcon },
      { href: "/settings/ads",     label: "Facebook Ads", icon: MegaphoneIcon },
      { href: "/settings/general", label: "Opšte",        icon: SlidersHorizontalIcon },
      { href: "/settings/sound",   label: "Zvuk",         icon: BellIcon },
      { href: "/tv",               label: "TV prikaz",    icon: MonitorIcon },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: "1px solid #E4E4E7",
        background: "#FAFAFA",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* logo */}
      <div
        style={{
          padding: "16px 18px 14px",
          borderBottom: "1px solid #E4E4E7",
          display: "flex",
          alignItems: "center",
          gap: 9,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "linear-gradient(135deg, #16A34A, #15803D)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          O
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#18181B",
          }}
        >
          Orderly
        </span>
      </div>

      {/* nav */}
      <nav style={{ flex: 1, padding: "12px 10px 0", overflowY: "auto" }}>
        {GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#A1A1AA",
                padding: "0 10px 6px",
              }}
            >
              {group.title}
            </div>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "7px 10px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? "#15803D" : "#71717A",
                    background: active ? "#DCFCE7" : "transparent",
                    textDecoration: "none",
                    marginBottom: 2,
                    transition: "background 120ms, color 120ms",
                  }}
                  className={cn(!active && "hover:bg-zinc-100 hover:text-zinc-800")}
                >
                  <Icon style={{ width: 15, height: 15, flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* user */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #E4E4E7",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <UserButton />
        <span style={{ fontSize: 12, color: "#71717A" }}>Account</span>
      </div>
    </aside>
  );
}
