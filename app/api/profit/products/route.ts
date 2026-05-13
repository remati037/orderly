import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();

  const [itemsRes, overridesRes, sitesRes] = await Promise.all([
    supabase
      .from("order_items")
      .select(
        "product_name, product_type, order:orders!inner(site_id)"
      )
      .not("product_name", "is", null),
    supabase.from("products").select("*"),
    supabase.from("sites").select("id, name, color_hex"),
  ]);

  const items = itemsRes.data ?? [];
  const overrides = overridesRes.data ?? [];
  const sites = sitesRes.data ?? [];

  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const overrideMap = new Map(
    overrides.map((p) => [`${p.site_id}::${p.name}`, p])
  );

  const seen = new Set<string>();
  const products: Array<{
    name: string;
    product_type: string;
    site_id: string;
    site_name: string;
    site_color: string;
    cost_percent: number | null;
    cost_fixed: number | null;
  }> = [];

  for (const item of items) {
    const siteId = (item.order as unknown as { site_id: string } | null)?.site_id;
    if (!siteId || !item.product_name) continue;
    const key = `${siteId}::${item.product_name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const override = overrideMap.get(key);
    const site = siteMap.get(siteId);

    products.push({
      name: item.product_name,
      product_type: item.product_type ?? "physical",
      site_id: siteId,
      site_name: site?.name ?? siteId,
      site_color: site?.color_hex ?? "#1B6EF3",
      cost_percent: override?.cost_percent ?? null,
      cost_fixed: override?.cost_fixed ?? null,
    });
  }

  products.sort((a, b) =>
    a.site_name.localeCompare(b.site_name) || a.name.localeCompare(b.name)
  );

  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { site_id, name, cost_percent, cost_fixed } = body;

  if (!site_id || !name)
    return NextResponse.json(
      { error: "site_id and name are required" },
      { status: 400 }
    );

  const supabase = adminClient();

  // Check if a row already exists for this site+product
  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("site_id", site_id)
    .eq("name", name)
    .maybeSingle();

  let result, error;

  if (existing) {
    ({ data: result, error } = await supabase
      .from("products")
      .update({ cost_percent: cost_percent ?? null, cost_fixed: cost_fixed ?? null })
      .eq("id", existing.id)
      .select()
      .single());
  } else {
    ({ data: result, error } = await supabase
      .from("products")
      .insert({ site_id, name, cost_percent: cost_percent ?? null, cost_fixed: cost_fixed ?? null })
      .select()
      .single());
  }

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(result);
}
