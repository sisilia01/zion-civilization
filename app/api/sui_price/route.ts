import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Proxy CoinGecko SUI/USD to avoid CORS in the browser. */
export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    if (!res.ok) {
      return NextResponse.json({ usd: null }, { status: res.status });
    }
    const data = (await res.json()) as { sui?: { usd?: number } };
    const usd = data.sui?.usd;
    return NextResponse.json({ usd: typeof usd === "number" && Number.isFinite(usd) ? usd : null });
  } catch {
    return NextResponse.json({ usd: null });
  }
}
