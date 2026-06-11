import { NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/constitution/amendments`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Amendments unavailable" }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Failed to fetch amendments" }, { status: 502 });
  }
}
