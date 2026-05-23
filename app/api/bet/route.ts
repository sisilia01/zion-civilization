import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 12_000;

export async function POST(req: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const body = await req.json();
    const res = await fetch("http://localhost:8000/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed";
    console.error("[api/bet] proxy error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
