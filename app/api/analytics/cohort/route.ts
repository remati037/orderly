import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { adminClient } from "@/lib/supabase/admin";
import { COUNTED_STATUSES } from "@/lib/utils/order-status";

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  return d;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();

  // Look back 9 months (6 cohort months + 3 months of follow-on data)
  const lookbackStart = new Date();
  lookbackStart.setMonth(lookbackStart.getMonth() - 9);
  lookbackStart.setDate(1);
  lookbackStart.setHours(0, 0, 0, 0);

  const [customersRes, ordersRes] = await Promise.all([
    supabase
      .from("customers")
      .select("email, first_order_at")
      .gte("first_order_at", lookbackStart.toISOString())
      .not("first_order_at", "is", null),
    supabase
      .from("orders")
      .select("customer_email, created_at")
      .gte("created_at", lookbackStart.toISOString())
      .in("status", COUNTED_STATUSES)
      .not("customer_email", "is", null),
  ]);

  const customers = customersRes.data ?? [];
  const orders = ordersRes.data ?? [];

  // Build order lookup: email → Set<monthKey>
  const orderMonths: Record<string, Set<string>> = {};
  for (const o of orders) {
    if (!o.customer_email) continue;
    if (!orderMonths[o.customer_email])
      orderMonths[o.customer_email] = new Set();
    orderMonths[o.customer_email].add(monthKey(new Date(o.created_at)));
  }

  // Group customers by cohort month (month of first_order_at)
  const cohortMap: Record<string, string[]> = {};
  for (const c of customers) {
    if (!c.first_order_at || !c.email) continue;
    const key = monthKey(new Date(c.first_order_at));
    if (!cohortMap[key]) cohortMap[key] = [];
    cohortMap[key].push(c.email);
  }

  // Build result for last 6 complete cohort months (exclude current month)
  const now = new Date();
  const cohortMonths: string[] = [];
  for (let i = 7; i >= 2; i--) {
    cohortMonths.push(monthKey(addMonths(now, -i)));
  }

  const rows = cohortMonths.map((cohortMonth) => {
    const emails = cohortMap[cohortMonth] ?? [];
    const cohortDate = new Date(cohortMonth + "-01");
    const size = emails.length;

    if (size === 0) {
      return {
        month: cohortDate.toLocaleDateString("sr-RS", {
          month: "short",
          year: "numeric",
        }),
        cohort_month: cohortMonth,
        size: 0,
        m1: null,
        m2: null,
        m3: null,
      };
    }

    function retentionPct(offset: number): number {
      const targetMonth = monthKey(addMonths(cohortDate, offset));
      const retained = emails.filter((email) =>
        orderMonths[email]?.has(targetMonth)
      ).length;
      return Math.round((retained / size) * 100);
    }

    return {
      month: cohortDate.toLocaleDateString("sr-RS", {
        month: "short",
        year: "numeric",
      }),
      cohort_month: cohortMonth,
      size,
      m1: retentionPct(1),
      m2: retentionPct(2),
      m3: retentionPct(3),
    };
  });

  return NextResponse.json({ rows });
}
