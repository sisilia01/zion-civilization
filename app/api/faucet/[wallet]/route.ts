import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const res = await fetch(`http://localhost:8000/faucet/${wallet}`);
  const data = await res.json();
  return NextResponse.json(data);
}
