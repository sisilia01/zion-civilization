import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = "http://localhost:8000";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const w = decodeURIComponent(wallet || "").trim();
  if (!w) {
    return NextResponse.json([]);
  }
  try {
    const res = await fetch(`${API_BASE}/wallet_bets/${encodeURIComponent(w)}`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json([], { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json([]);
  }
}
