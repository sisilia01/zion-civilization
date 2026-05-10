import { NextRequest, NextResponse } from "next/server";

const API_BASE = "http://localhost:8000";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const enc = encodeURIComponent(wallet);
  try {
    const res = await fetch(`${API_BASE}/user/${enc}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "User proxy error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
