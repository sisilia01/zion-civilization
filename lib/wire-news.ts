export type WireNewsItem = {
  id?: string | number;
  text: string;
  type?: string;
  timestamp?: string;
};

export function dedupeWireItems(items: WireNewsItem[]): WireNewsItem[] {
  const seen = new Set<string>();
  const out: WireNewsItem[] = [];
  for (const item of items) {
    const text = String(item.text ?? "").trim();
    if (!text) continue;
    const key = item.id != null ? `id:${item.id}` : `${text}::${item.timestamp ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, text });
  }
  return out;
}

export function parseWireResponse(data: unknown, limit = 15): WireNewsItem[] {
  if (!Array.isArray(data)) return [];
  const parsed = data
    .map(
      (e: {
        id?: string | number;
        text?: string;
        description?: string;
        type?: string;
        timestamp?: string;
      }) => ({
        id: e.id,
        text: String(e.text ?? e.description ?? "").trim(),
        type: e.type,
        timestamp: e.timestamp,
      }),
    )
    .filter((e) => e.text.length > 0);
  return dedupeWireItems(parsed).slice(0, limit);
}
