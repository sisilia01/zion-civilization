import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch('http://localhost:8000/bet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch(e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
