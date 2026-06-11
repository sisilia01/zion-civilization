import { NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://127.0.0.1:8000";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/archive/tracks`, { cache: "no-store" });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to fetch archive tracks" }, { status: 502 });
  }
}
