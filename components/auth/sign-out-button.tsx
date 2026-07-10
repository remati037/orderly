"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser-client";

export function SignOutButton({ label = "Odjavi se" }: { label?: string }) {
  const router = useRouter();

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12.5,
        fontWeight: 500,
        color: "#71717A",
        background: "transparent",
        border: "none",
        padding: "4px 2px",
        cursor: "pointer",
      }}
    >
      <LogOutIcon style={{ width: 14, height: 14 }} />
      {label}
    </button>
  );
}
