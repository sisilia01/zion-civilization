import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.ZION_API_BASE ?? "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("report_id");
  if (!reportId) {
    return NextResponse.json({ error: "report_id required" }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_BASE}/archive/download/zip?report_id=${reportId}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "ZIP download failed" }, { status: res.status });
    }
    const body = await res.arrayBuffer();
    const headers = new Headers();
    const disposition = res.headers.get("Content-Disposition");
    const contentType = res.headers.get("Content-Type");
    if (disposition) headers.set("Content-Disposition", disposition);
    if (contentType) headers.set("Content-Type", contentType);
    return new NextResponse(body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "ZIP proxy failed" }, { status: 502 });
  }
}
