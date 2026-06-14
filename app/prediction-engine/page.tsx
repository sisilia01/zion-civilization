import type { Metadata } from "next";
import { PredictionEnginePanel } from "./PredictionEnginePanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prediction Engine — ZION Civilization",
};

export default function PredictionEnginePage() {
  return <PredictionEnginePanel />;
}
