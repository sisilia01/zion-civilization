import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const week = request.nextUrl.searchParams.get("week");
  if (!week) {
    return NextResponse.json({ error: "week parameter required" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${API_BASE}/archive/documents?week=${encodeURIComponent(week)}`,
      { cache: "no-store" }
    );
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to fetch archive documents" }, { status: 502 });
  }
}
