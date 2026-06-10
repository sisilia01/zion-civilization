import { NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/stats`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Upstream stats unavailable" }, { status: res.status });
    }
    const data = (await res.json()) as Record<string, unknown>;
    const alive = Number(data.alive ?? data.active_agents ?? data.total_agents ?? 0);
    return NextResponse.json({
      ...data,
      active_agents: alive,
      total_agents: Number(data.total_agents ?? alive),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch civilization stats" }, { status: 502 });
  }
}
