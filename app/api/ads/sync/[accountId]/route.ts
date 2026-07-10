import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/roles";
import { syncMetaAccount } from "@/lib/sync/sync-meta-account";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { error: authError } = await requireRole(["owner"]);
  if (authError) return authError;

  const { accountId } = await params;
  const body = await request.json().catch(() => ({}));
  const days = Math.min(90, Math.max(1, Number(body?.days ?? 30)));

  const result = await syncMetaAccount(accountId, days);

  if (result.error)
    return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
