import fs from "fs";
import path from "path";

const home = fs.readFileSync("components/zion/ZionHome.tsx", "utf8");
const homeStart = home.indexOf("export default function Home()");
const homeEnd = home.indexOf("  return (\n    <main className=\"page\">");
const homeBody = home.slice(homeStart, homeEnd);

const names = new Set();
for (const m of homeBody.matchAll(/const \[(\w+),/g)) names.add(m[1]);
for (const m of homeBody.matchAll(/const \[(\w+)\]/g)) names.add(m[1]);
for (const m of homeBody.matchAll(/, set(\w+)\]/g)) {
  const setter = m[1];
  names.add(`set${setter.charAt(0).toUpperCase()}${setter.slice(1)}`);
}
for (const m of homeBody.matchAll(/^  const (\w+) =/gm)) names.add(m[1]);
for (const m of homeBody.matchAll(/^  function (\w+)/gm)) names.add(m[1]);
for (const m of homeBody.matchAll(/^  const (\w+) = useCallback/gm)) names.add(m[1]);

// Components defined before Home
for (const m of home.matchAll(/^function (\w+)/gm)) names.add(m[1]);
for (const m of home.matchAll(/^const (\w+) = /gm)) names.add(m[1]);

const builtins = new Set([
  "useState","useEffect","useMemo","useRef","useCallback","useRouter","Array","Object","Math",
  "String","Number","Boolean","Date","JSON","console","window","document","undefined","null",
  "true","false","return","if","else","void","typeof","new","Set","Map","Promise","parseInt",
  "parseFloat","isNaN","Error","RegExp","Intl","fetch","setTimeout","setInterval","clearTimeout",
  "createPortal","motion","AnimatePresence","dynamic","Fragment","React","THREE","bcs","Transaction",
  "TabId","LAB_NAV_ITEMS","Home","tabCtx","buildTabCtx","ZionTabProvider","SharedLayout",
]);

const tabDir = "components/tabs";
for (const file of fs.readdirSync(tabDir)) {
  if (!file.endsWith(".tsx") || file === "Lab.tsx" || file === "Archive.tsx" || file === "Constitution.tsx") continue;
  const fp = path.join(tabDir, file);
  let src = fs.readFileSync(fp, "utf8");

  if (file === "Press.tsx") {
    src = src.replace(
      /export function Press\(\) \{\n  const ctx = useZionTab\(\);\n\n  return \(\n            const current =/,
      "export function Press() {\n  const ctx = useZionTab();\n  const {\n    newspapers,\n    activeNewspaper,\n    pressArticles,\n    pressLoading,\n    account,\n    pressSuiChecked,\n    suiBalance,\n    setActiveNewspaper,\n    pressFetchArticle,\n    pressRefreshAll,\n    walletAddress,\n    shortWallet,\n    formatPressArticle,\n    PressArticleBody,\n    Link,\n  } = ctx;\n\n  const current =",
    );
    src = src.replace(/\n            \);\n          }\)\(\)\n  \);\n}\n$/, "\n  );\n}\n");
    src = src.replace(/^  return \(\n/m, "");
    if (!src.includes("return (")) {
      src = src.replace(
        /const current = newspapers/,
        "return (\n    (() => {\n      const current = newspapers",
      );
      src = src.replace(/\n  \);\n}\n$/, "\n    })()\n  );\n}\n");
    }
    fs.writeFileSync(fp, src);
    console.log("Fixed Press.tsx");
    continue;
  }

  const used = new Set();
  const bodyMatch = src.match(/return \([\s\S]*\);\n\}/);
  if (!bodyMatch) continue;
  const body = bodyMatch[0];
  for (const m of body.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    const id = m[1];
    if (!builtins.has(id) && names.has(id)) used.add(id);
  }

  const destruct = [...used].sort().join(",\n    ");
  src = src.replace(
    /const ctx = useZionTab\(\);\n\n  return \(/,
    `const {\n    ${destruct},\n  } = useZionTab();\n\n  return (`,
  );
  fs.writeFileSync(fp, src);
  console.log(`Fixed ${file} (${used.size} bindings)`);
}

const tabCtxBlock = `  const tabCtx: ZionTabContextValue = {\n${[...names]
  .filter((n) => !builtins.has(n) && n !== "tabCtx")
  .sort()
  .map((n) => `    ${n},`)
  .join("\n")}\n  };\n`;

fs.writeFileSync(
  "components/zion/tabCtx.snippet.txt",
  tabCtxBlock,
);
console.log("Wrote tabCtx snippet with", names.size, "names");
