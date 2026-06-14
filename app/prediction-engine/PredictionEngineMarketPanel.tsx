"use client";

import { ZionHome } from "@/components/zion/ZionHome";

export function PredictionEngineMarketPanel({ marketId }: { marketId: string }) {
  return <ZionHome activeTab="zionbet" standalone standaloneMarketId={marketId} />;
}
