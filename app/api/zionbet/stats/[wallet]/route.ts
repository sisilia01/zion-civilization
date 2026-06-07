import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await context.params;
  const w = decodeURIComponent(wallet || "").trim();
  if (!w) {
    return NextResponse.json({ error: "missing_wallet" }, { status: 400 });
  }
  try {
    const res = await fetch(`http://localhost:8000/zionbet/stats/${encodeURIComponent(w)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 404 });
  } catch {
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }
}
