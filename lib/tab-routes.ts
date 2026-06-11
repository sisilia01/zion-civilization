export type TabId =
  | "civilization"
  | "chat"
  | "zionbet"
  | "leaderboard"
  | "zbank"
  | "zperps"
  | "press"
  | "treasury"
  | "constitution"
  | "research"
  | "lab"
  | "archive";

export const LAB_NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: "civilization", label: "OBSERVATORY" },
  { id: "chat", label: "FIELD NOTES" },
  { id: "zionbet", label: "PREDICTION ENGINE" },
  { id: "treasury", label: "GOVERNANCE" },
  { id: "research", label: "RESEARCH" },
  { id: "constitution", label: "CONSTITUTION" },
  { id: "lab", label: "LAB" },
  { id: "archive", label: "ARCHIVE" },
  { id: "zbank", label: "PRIVACY" },
  { id: "press", label: "PRESS" },
];

export const TAB_PATHS: Record<TabId, string> = {
  civilization: "/",
  chat: "/field-notes",
  zionbet: "/prediction-engine",
  treasury: "/governance",
  research: "/lab",
  constitution: "/constitution",
  lab: "/lab",
  archive: "/archive",
  zbank: "/privacy",
  press: "/press",
  leaderboard: "/leaderboard",
  zperps: "/",
};

export const PATH_TO_TAB: Record<string, TabId> = {
  "/": "civilization",
  "/field-notes": "chat",
  "/prediction-engine": "zionbet",
  "/governance": "treasury",
  "/lab": "lab",
  "/constitution": "constitution",
  "/archive": "archive",
  "/privacy": "zbank",
  "/press": "press",
  "/leaderboard": "leaderboard",
};

export function tabFromPath(pathname: string): TabId {
  return PATH_TO_TAB[pathname] ?? "civilization";
}

export function pathForTab(id: TabId): string {
  return TAB_PATHS[id];
}

export const PAGE_TITLES: Record<string, string> = {
  "/": "Observatory — ZION Civilization",
  "/field-notes": "Field Notes — ZION Civilization",
  "/prediction-engine": "Prediction Engine — ZION Civilization",
  "/governance": "Governance — ZION Civilization",
  "/lab": "Lab — ZION Civilization",
  "/constitution": "Constitution — ZION Civilization",
  "/archive": "Archive — ZION Civilization",
  "/privacy": "Privacy — ZION Civilization",
  "/press": "Press — ZION Civilization",
};
