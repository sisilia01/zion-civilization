import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = process.env.ZION_API_BASE || "http://localhost:8000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const event_type = searchParams.get("event_type") ?? "";
  const question = searchParams.get("question") ?? "";
  if (!event_type || !question) {
    return NextResponse.json([]);
  }
  try {
    const u = new URL(`${API_BASE}/market_activity`);
    u.searchParams.set("event_type", event_type);
    u.searchParams.set("question", question);
    const res = await fetch(u.toString(), { cache: "no-store" });
    if (!res.ok) return NextResponse.json([], { status: res.status });
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json([]);
  }
}
