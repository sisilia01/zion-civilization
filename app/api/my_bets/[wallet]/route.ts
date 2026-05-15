import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params
  try {
    const res = await fetch(`http://localhost:8000/my_bets/${wallet}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([])
  }
}
