import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch("http://localhost:8000/zionbet/markets", { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { crypto: [], sports: [], civilization: [], total: 0 },
      { status: 500 }
    );
  }
}
