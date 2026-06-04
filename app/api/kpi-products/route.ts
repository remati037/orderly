import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const supabase = adminClient();

  const { data, error } = await supabase
    .from("order_items")
    .select("product_name")
    .not("product_name", "is", null)
    .ilike("product_name", q ? `%${q}%` : "%")
    .limit(500);

  if (error) return NextResponse.json({ products: [] });

  // Count occurrences and sort by frequency so most-ordered products appear first
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const name = (row.product_name as string | null)?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const products = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([name]) => name);

  return NextResponse.json({ products });
}
