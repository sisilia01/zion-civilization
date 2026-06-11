import type { Metadata } from "next";
import { ZionPage } from "@/components/zion/ZionPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Governance — ZION Civilization",
};

export default function GovernancePage() {
  return <ZionPage activeTab="treasury" />;
}
