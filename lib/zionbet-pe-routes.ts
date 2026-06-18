export type ZionbetPeTab =
  | "civilization"
  | "crypto"
  | "sports"
  | "politics"
  | "geopolitics"
  | "finance"
  | "tech"
  | "culture";

export const ZIONBET_PE_TABS: readonly ZionbetPeTab[] = [
  "civilization",
  "crypto",
  "sports",
  "politics",
  "geopolitics",
  "finance",
  "tech",
  "culture",
] as const;

const PE_TAB_SET = new Set<string>(ZIONBET_PE_TABS);

/** Parse `?tab=` from Prediction Engine URLs (supports alias `world` → culture). */
export function parseZionbetPeTabParam(raw: string | null | undefined): ZionbetPeTab | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key === "world") return "culture";
  return PE_TAB_SET.has(key) ? (key as ZionbetPeTab) : null;
}

/** `/prediction-engine` list URL preserving active category tab. */
export function zionbetPeListHref(tab?: ZionbetPeTab | null): string {
  if (!tab || tab === "civilization") return "/prediction-engine";
  return `/prediction-engine?tab=${encodeURIComponent(tab)}`;
}

/** Standalone market detail URL with optional source tab for Back navigation. */
export function zionbetPeMarketHref(marketId: string, tab?: ZionbetPeTab | null): string {
  const slug = encodeURIComponent(marketId.replace(/^poly-/, "market-"));
  const parsed = parseZionbetPeTabParam(tab ?? null);
  if (!parsed || parsed === "civilization") {
    return `/prediction-engine/${slug}`;
  }
  return `/prediction-engine/${slug}?tab=${encodeURIComponent(parsed)}`;
}
