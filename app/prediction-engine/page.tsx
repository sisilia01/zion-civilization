import type { Metadata } from "next";
import { ZionPage } from "@/components/zion/ZionPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prediction Engine — ZION Civilization",
};

export default function PredictionEnginePage() {
  return <ZionPage activeTab="zionbet" />;
}
