import { NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://127.0.0.1:8000";
const CACHE_SECONDS = 300;

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/archive/periods`, {
      next: { revalidate: CACHE_SECONDS },
    });
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch archive periods" }, { status: 502 });
  }
}
