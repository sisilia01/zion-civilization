import fs from "fs";
import path from "path";

const src = fs.readFileSync("components/zion/ZionHome.tsx", "utf8");
const lines = src.split("\n");

const tabs = [
  { name: "Observatory", start: 15123, end: 15398, file: "Observatory.tsx" },
  { name: "FieldNotes", start: 15415, end: 15461, file: "FieldNotes.tsx" },
  { name: "PredictionEngine", start: 15465, end: 16163, file: "PredictionEngine.tsx" },
  { name: "Privacy", start: 16219, end: 17137, file: "Privacy.tsx" },
  { name: "Press", start: 18277, end: 18664, file: "Press.tsx" },
  { name: "Governance", start: 18667, end: 19185, file: "Governance.tsx" },
];

const header = `"use client";

import { useZionTab } from "@/components/zion/ZionTabContext";

export function COMPONENT_NAME() {
  const ctx = useZionTab();
`;

for (const tab of tabs) {
  const body = lines.slice(tab.start - 1, tab.end).join("\n");
  const content =
    header.replace("COMPONENT_NAME", tab.name) +
    "\n  return (\n" +
    body +
    "\n  );\n}\n";
  fs.writeFileSync(path.join("components/tabs", tab.file), content);
  console.log("Wrote", tab.file);
}
