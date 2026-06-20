import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { syncMetaAccount } from "@/lib/sync/sync-meta-account";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accountId } = await params;
  const body = await request.json().catch(() => ({}));
  const days = Math.min(90, Math.max(1, Number(body?.days ?? 30)));

  const result = await syncMetaAccount(accountId, days);

  if (result.error)
    return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
