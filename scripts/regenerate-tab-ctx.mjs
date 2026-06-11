import fs from "fs";

const src = fs.readFileSync("components/zion/ZionHome.tsx", "utf8");
const homeStart = src.indexOf("export function ZionHome({ activeTab }");
const tabCtxStart = src.indexOf("  const tabCtx: ZionTabContextValue = {", homeStart);
const homeBody = src.slice(homeStart, tabCtxStart);

const inHome = new Set();

for (const line of homeBody.split("\n")) {
  if (!line.startsWith("  ") || line.startsWith("    ")) continue;
  const useStateMatch = line.match(/^  const \[(\w+),/);
  if (useStateMatch) inHome.add(useStateMatch[1]);
  const constMatch = line.match(/^  const (\w+) =/);
  if (constMatch) inHome.add(constMatch[1]);
  const fnMatch = line.match(/^  function (\w+)/);
  if (fnMatch) inHome.add(fnMatch[1]);
  const mutateMatch = line.match(/mutate: (\w+)/);
  if (mutateMatch) inHome.add(mutateMatch[1]);
}

for (const m of src.matchAll(/^function (\w+)/gm)) inHome.add(m[1]);
for (const m of src.matchAll(/^const (\w+)(?::[^=]+)? = /gm)) inHome.add(m[1]);

for (const m of src.matchAll(/^import \{([^}]+)\} from/gm)) {
  for (const part of m[1].split(",")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("type ")) continue;
    const name = trimmed.split(/\s+as\s+/).pop()?.trim();
    if (name) inHome.add(name);
  }
}

const skip = new Set([
  "TabId", "ZionHome", "tabCtx", "ZionTabProvider", "SharedLayout",
  "Observatory", "FieldNotes", "PredictionEngine", "Privacy", "Press",
  "Governance", "Lab", "Archive", "Constitution",
]);

const names = [...inHome]
  .filter((n) => !skip.has(n) && !n.endsWith("Props") && !n.endsWith("Config"))
  .sort();

const block = `  const tabCtx: ZionTabContextValue = {\n${names.map((n) => `    ${n},`).join("\n")}\n  };`;

const endIdx = src.indexOf("\n  };", tabCtxStart) + "\n  };".length;
const newSrc = src.slice(0, tabCtxStart) + block + src.slice(endIdx);
fs.writeFileSync("components/zion/ZionHome.tsx", newSrc);
console.log("Regenerated tabCtx with", names.length, "entries");
