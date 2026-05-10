import { NextRequest, NextResponse } from "next/server";

const ALLOWED = ["stats", "agents", "events", "clans", "nft", "faucet", "leaderboard", "user"];
const API_BASE = "http://localhost:8000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ endpoint: string }> }) {
  const { endpoint } = await params;
  if (!ALLOWED.includes(endpoint)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const searchParams = req.nextUrl.searchParams.toString();
  const url = searchParams ? `${API_BASE}/${endpoint}?${searchParams}` : `${API_BASE}/${endpoint}`;
  console.log("Proxying to:", url);
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
