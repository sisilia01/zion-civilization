import type { Metadata } from "next";
import { ZionPage } from "@/components/zion/ZionPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard — ZION Civilization",
};

export default function LeaderboardPage() {
  return <ZionPage activeTab="leaderboard" />;
}
