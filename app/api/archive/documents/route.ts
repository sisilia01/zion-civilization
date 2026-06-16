import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://127.0.0.1:8000";
const CACHE_SECONDS = 300;

export async function GET(request: NextRequest) {
  const week = request.nextUrl.searchParams.get("week");
  if (!week) {
    return NextResponse.json({ error: "week parameter required" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${API_BASE}/archive/documents?week=${encodeURIComponent(week)}`,
      { next: { revalidate: CACHE_SECONDS } },
    );
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch archive documents" }, { status: 502 });
  }
}
