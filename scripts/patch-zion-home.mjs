import fs from "fs";

let src = fs.readFileSync("components/zion/ZionHome.tsx", "utf8");

// Imports
if (!src.includes("@/lib/tab-routes")) {
  src = src.replace(
    'import { useRouter } from "next/navigation";',
  `import { useRouter } from "next/navigation";
import type { TabId } from "@/lib/tab-routes";
import { SharedLayout } from "@/components/SharedLayout";
import { ZionTabProvider, type ZionTabContextValue } from "@/components/zion/ZionTabContext";
import { Observatory } from "@/components/tabs/Observatory";
import { FieldNotes } from "@/components/tabs/FieldNotes";
import { PredictionEngine } from "@/components/tabs/PredictionEngine";
import { Privacy } from "@/components/tabs/Privacy";
import { Press } from "@/components/tabs/Press";
import { Governance } from "@/components/tabs/Governance";
import { Lab } from "@/components/tabs/Lab";
import { Archive } from "@/components/tabs/Archive";
import { Constitution } from "@/components/tabs/Constitution";`,
  );
}

// Remove local TabId type and LAB_NAV_ITEMS
src = src.replace(/type TabId =[\s\S]*?const LAB_NAV_ITEMS: \{ id: TabId; label: string \}\[\] = \[[\s\S]*?\];\n\n/, "");

// Change Home signature
src = src.replace(
  "export default function Home() {",
  "export function ZionHome({ activeTab }: { activeTab: TabId }) {",
);

// Remove activeTab state
src = src.replace(/\n  const \[activeTab, setActiveTab\] = useState<TabId>\("civilization"\);\n/, "\n");

// Insert tabCtx before return
const tabCtx = fs.readFileSync("components/zion/tabCtx.snippet.txt", "utf8");
if (!src.includes("const tabCtx: ZionTabContextValue")) {
  src = src.replace(
    "  return (\n    <main className=\"page\">",
    `${tabCtx}\n  return (\n    <ZionTabProvider value={tabCtx}>\n    <main className="page">`,
  );
  src = src.replace(
    /      <style jsx>\{\`/,
    "    </ZionTabProvider>\n      <style jsx>{`",
  );
  // Fix: style jsx should be inside main, provider wraps main - reorder
}

// Replace shell with SharedLayout
const shellStart = `      <section className="zionHero" aria-label="ZION Civilization">`;
const shellEnd = `        <div className="tabPanels">`;
const shellStartIdx = src.indexOf(shellStart);
const shellEndIdx = src.indexOf(shellEnd);
if (shellStartIdx !== -1 && shellEndIdx !== -1) {
  const before = src.slice(0, shellStartIdx);
  const after = src.slice(shellEndIdx + `        <div className="tabPanels">`.length);
  const shared = `      <SharedLayout
        isMobile={isMobile}
        experimentRunTime={experimentRunTime}
        renderAuthToolbar={renderAuthToolbar}
        heroSubjectCount={heroSubjectCount}
        heroProsperityPct={heroProsperityPct}
        statsLoading={statsLoading}
        deathsToday={stats?.deaths_today}
      >
`;
  src = before + shared + after;
}

// Replace tab panels
const tabReplacements = [
  [/          \{activeTab === "civilization" && \([\s\S]*?          \)\}\n\n\n          \{activeTab === "constitution"/, "          {activeTab === \"civilization\" && <Observatory />}\n\n          {activeTab === \"constitution\""],
  [/          \{activeTab === "constitution" && \([\s\S]*?          \)\}\n\n          \{activeTab === "chat"/, "          {activeTab === \"constitution\" && <Constitution />}\n\n          {activeTab === \"chat\""],
  [/          \{activeTab === "chat" && \([\s\S]*?          \)\}\n\n          \{activeTab === "zionbet"/, "          {activeTab === \"chat\" && <FieldNotes />}\n\n          {activeTab === \"zionbet\""],
  [/          \{activeTab === "zionbet" && \([\s\S]*?          \)\}\n\n          \{activeTab === "leaderboard"/, "          {activeTab === \"zionbet\" && <PredictionEngine />}\n\n          {activeTab === \"leaderboard\""],
  [/          \{activeTab === "zbank" && \([\s\S]*?          \)\}\n\n          \{activeTab === "zperps"/, "          {activeTab === \"zbank\" && <Privacy />}\n\n          {activeTab === \"zperps\""],
  [/          \{activeTab === "press" && \(\(\) => \{[\s\S]*?          \}\)\(\)\}\n\n          \{activeTab === "treasury"/, "          {activeTab === \"press\" && <Press />}\n\n          {activeTab === \"treasury\""],
  [/          \{activeTab === "treasury" && \([\s\S]*?          \)\}\n        <\/div>/, "          {activeTab === \"treasury\" && <Governance />}\n          {activeTab === \"lab\" && <Lab />}\n          {activeTab === \"research\" && <Lab />}\n          {activeTab === \"archive\" && <Archive />}\n        </div>"],
];

for (const [pattern, replacement] of tabReplacements) {
  src = src.replace(pattern, replacement);
}

// Close SharedLayout before belowHeroShell closes
src = src.replace(
  /        <\/div>\n      <\/div>\n\n        \{chatAgent \?/,
  "      </SharedLayout>\n\n        {chatAgent ?",
);

fs.writeFileSync("components/zion/ZionHome.tsx", src);
console.log("Patched ZionHome.tsx");
