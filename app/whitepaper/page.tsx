import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { WhitepaperViewer } from "./WhitepaperViewer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Whitepaper — ZION Civilization",
  description:
    "ZION Civilization whitepaper for Sui Overflow 2026 — hybrid autonomous AI civilization on Sui testnet.",
};

function loadWhitepaper(): string {
  const filePath = path.join(process.cwd(), "public", "whitepaper.md");
  return fs.readFileSync(filePath, "utf8");
}

export default function WhitepaperPage() {
  const content = loadWhitepaper();
  return <WhitepaperViewer content={content} />;
}
