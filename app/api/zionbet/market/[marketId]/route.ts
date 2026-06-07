import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ marketId: string }> }
) {
  const { marketId } = await context.params;
  const id = decodeURIComponent(marketId || "");
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `http://localhost:8000/zionbet/market/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 404 });
  } catch {
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }
}
