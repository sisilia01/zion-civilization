export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "";
  const apiUrl = category
    ? `http://localhost:8000/zionbet/polymarkets?category=${encodeURIComponent(category)}`
    : "http://localhost:8000/zionbet/polymarkets";
  const res = await fetch(apiUrl, { cache: "no-store" });
  const data = await res.json();
  return Response.json(data);
}
