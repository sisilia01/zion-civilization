import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const url = qs ? `${API_BASE}/zlab/reports?${qs}` : `${API_BASE}/zlab/reports`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 502 });
  }
}
