"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, SettingsIcon, MonitorIcon, BarChart2Icon, CircleDollarSignIcon, UsersIcon, CreditCardIcon, SlidersHorizontalIcon, BellIcon, MegaphoneIcon } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",        label: "Dashboard",  icon: LayoutDashboardIcon },
  { href: "/analytics",        label: "Analitika",  icon: BarChart2Icon },
  { href: "/customers",        label: "Kupci",      icon: UsersIcon },
  { href: "/subscriptions",    label: "Pretplate",  icon: CreditCardIcon },
  { href: "/profit",           label: "Profit",     icon: CircleDollarSignIcon },
  { href: "/settings/general", label: "Opšte",      icon: SlidersHorizontalIcon },
  { href: "/settings/sites",   label: "Sajtovi",    icon: SettingsIcon },
  { href: "/settings/ads",     label: "Facebook Ads", icon: MegaphoneIcon },
  { href: "/settings/sound",   label: "Zvuk",       icon: BellIcon },
  { href: "/tv",               label: "TV prikaz",  icon: MonitorIcon },
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
          padding: "18px 20px 16px",
          borderBottom: "1px solid #E4E4E7",
        }}
      >
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
      <nav style={{ flex: 1, padding: "10px 10px 0" }}>
        {NAV.map(({ href, label, icon: Icon }) => {
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
                borderRadius: 7,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "#18181B" : "#71717A",
                background: active ? "#F4F4F5" : "transparent",
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
