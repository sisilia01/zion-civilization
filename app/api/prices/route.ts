import { NextResponse } from "next/server";

const CG_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,sui,dogecoin&vs_currencies=usd";

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
    const BTC = data.bitcoin?.usd ?? null;
    const ETH = data.ethereum?.usd ?? null;
    const SUI = data.sui?.usd ?? null;
    const DOGE = data.dogecoin?.usd ?? null;
    return NextResponse.json({
      BTC,
      ETH,
      SUI,
      DOGE,
      fetched_at: Date.now(),
    });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
