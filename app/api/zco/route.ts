import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch("http://localhost:8000/zco/events");
    const data = (await res.json()) as { decisions?: unknown[]; events?: unknown[] };
    const decisions = Array.isArray(data.decisions)
      ? data.decisions
      : Array.isArray(data.events)
        ? data.events
        : [];
    return NextResponse.json({ ...data, decisions });
  } catch {
    return NextResponse.json({ decisions: [] });
  }
}
