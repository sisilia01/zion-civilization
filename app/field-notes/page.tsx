import type { Metadata } from "next";
import { ZionPage } from "@/components/zion/ZionPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Field Notes — ZION Civilization",
};

export default function FieldNotesPage() {
  return <ZionPage activeTab="chat" />;
}
