import type { Metadata } from "next";
import { ZionPage } from "@/components/zion/ZionPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Press — ZION Civilization",
};

export default function PressPage() {
  return <ZionPage activeTab="press" />;
}
