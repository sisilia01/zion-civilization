import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://127.0.0.1:8000";
const CACHE_SECONDS = 120;

export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get("limit") ?? "30";
  try {
    const res = await fetch(`${API_BASE}/language/feed/zion?limit=${encodeURIComponent(limit)}`, {
      next: { revalidate: CACHE_SECONDS },
    });
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch ZION feed" }, { status: 502 });
  }
}
