import { NextResponse } from "next/server";

const API_BASE = "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Leaderboard proxy error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
