import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;
  console.log(`Thinkific webhook received for site: ${siteId}`);
  return NextResponse.json({ received: true }, { status: 200 });
}
