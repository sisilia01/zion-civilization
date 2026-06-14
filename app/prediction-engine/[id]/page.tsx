import type { Metadata } from "next";
import { PredictionEngineMarketPanel } from "../PredictionEngineMarketPanel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

async function fetchMarketRow(id: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `http://localhost:8000/zionbet/market/${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function cleanMarketTitle(question: unknown): string {
  if (typeof question !== "string") return "Market";
  const cleaned = question.replace(/\s+/g, " ").trim();
  return cleaned || "Market";
}

function marketDescription(row: Record<string, unknown>): string {
  for (const key of ["description", "resolution_criteria", "question"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 300);
    }
  }
  return "Trade YES/NO on ZION Prediction Engine";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const realId = decoded.replace("market-", "");
  const marketId = decoded.startsWith("market-") ? `poly-${realId}` : decoded;
  const row = await fetchMarketRow(marketId);
  const marketTitle = row ? cleanMarketTitle(row.question) : "Market";
  const description = row ? marketDescription(row) : "Trade YES/NO on ZION Prediction Engine";
  const urlSlug = decoded.startsWith("market-") ? decoded : marketId.replace(/^poly-/, "market-");

  return {
    title: `${marketTitle} | ZION Prediction Engine`,
    description,
    openGraph: {
      title: marketTitle,
      description,
      url: `https://zionciv.com/prediction-engine/${encodeURIComponent(urlSlug)}`,
    },
  };
}

export default async function PredictionEngineMarketPage({ params }: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const realId = decoded.replace("market-", "");
  const marketId = decoded.startsWith("market-") ? `poly-${realId}` : decoded;
  return <PredictionEngineMarketPanel marketId={marketId} />;
}
