import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await fetch("http://localhost:8000/events/by_type", { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data);
}
