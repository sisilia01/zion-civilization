import type { Metadata } from "next";
import { ZionPage } from "@/components/zion/ZionPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy — ZION Civilization",
};

export default function PrivacyPage() {
  return <ZionPage activeTab="zbank" />;
}
