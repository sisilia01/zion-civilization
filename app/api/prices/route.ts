import { NextResponse } from "next/server";

const CG_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd";

/** Cached ~5 minutes via CDN route handling; clients poll for fresh spots. */
export async function GET() {
  try {
    const res = await fetch(CG_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream", status: res.status }, { status: 502 });
    }
    const data = (await res.json()) as Record<string, { usd?: number } | undefined>;
    const SUI = data.sui?.usd ?? null;
    return NextResponse.json({
      SUI,
      fetched_at: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
