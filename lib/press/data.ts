/** Press papers — module scope so effects never see a new array identity each render. */
export type PressNewspaper = {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  bgPattern: string;
  borderColor: string;
  relevantTypes: string[];
  keywords: string[];
  persona: string;
  bodyFont: string;
  mastheadFont: string;
  vipOnly?: boolean;
  silverMin?: number;
  goldMin?: number;
};

export const newspapers: PressNewspaper[] = [
  {
    id: "ziontimes",
    name: "ZION TIMES",
    subtitle: "The Paper of Record",
    icon: "🗞️",
    accentColor: "#c8a96e",
    bgPattern: "#0a0800",
    borderColor: "#c8a96e",
    relevantTypes: ["election", "work", "clan", "revolt", "tax"],
    keywords: ["senate", "election", "corrupt", "clan", "tax", "collect"],
    persona:
      "You are the chief editor of ZION TIMES, the civilization's paper of record — inspired by the New York Times. You cover corruption, political failures, senate elections, clan wars, and government inaction with sharp investigative journalism. Be critical, factual, authoritative.",
    bodyFont: "'Source Serif 4', serif",
    mastheadFont: "'Playfair Display', serif",
  },
  {
    id: "economist",
    name: "THE ZION ECONOMIST",
    subtitle: "Markets · Taxes · Growth",
    icon: "📊",
    accentColor: "#e8e8e8",
    bgPattern: "#00080a",
    borderColor: "#e8e8e8",
    relevantTypes: ["tax", "work", "lottery", "birth", "death"],
    keywords: ["zion", "tax", "earn", "balance", "wealth", "poor", "rich"],
    persona:
      "You are the chief editor of THE ZION ECONOMIST. You analyze the civilization's economy: tax revenue, wealth inequality, birth rates vs death rates, ZION token flows. Use real numbers. Be analytical like The Economist magazine. Cover what taxes actually funded, wealth concentration.",
    bodyFont: "'Courier Prime', monospace",
    mastheadFont: "'Oswald', sans-serif",
  },
  {
    id: "prophet",
    name: "PROPHET'S VOICE",
    subtitle: "Visions · Omens · Prophecy",
    icon: "🔮",
    accentColor: "#a78bfa",
    bgPattern: "#08000a",
    borderColor: "#a78bfa",
    relevantTypes: ["prayer", "catastrophe", "death", "neo"],
    keywords: ["prophet", "pray", "NEO", "watches", "storm", "catastrophe"],
    persona:
      "You are the scribe of the PROPHET'S VOICE. You write about the Prophet's visions, spiritual omens, NEO's mysterious movements, and prophecies about the civilization's future. Be mystical, dramatic, ominous. Quote the Prophet directly. Reference signs and portents.",
    bodyFont: "'IM Fell English', serif",
    mastheadFont: "'IM Fell English', serif",
  },
  {
    id: "slums",
    name: "THE GUTTER GAZETTE",
    subtitle: "From the Streets · No Gods No Masters",
    icon: "✊",
    accentColor: "#ff4141",
    bgPattern: "#0a0000",
    borderColor: "#ff4141",
    relevantTypes: ["death", "revolt", "work", "tax"],
    keywords: ["poor", "died", "dead", "tax", "collect", "inequality"],
    persona:
      "You are the editor of THE GUTTER GAZETTE — the underground socialist newspaper of ZION. You write about the suffering of poor agents, deaths from poverty, inequality, how the rich exploit the poor, and how conditions are breeding revolution and anarchy. Be angry, passionate, socialist. Write exactly 3 columns separated by 'Column 1:', 'Column 2:', 'Column 3:' labels. Each column must be in English only, 60-80 words.",
    bodyFont: "'Courier Prime', monospace",
    mastheadFont: "'Special Elite', cursive",
  },
  {
    id: "betinsider",
    name: "BET INSIDER",
    subtitle: "Odds · Analysis · Winners",
    icon: "💰",
    accentColor: "#00d4ff",
    bgPattern: "#00080a",
    borderColor: "#00d4ff",
    relevantTypes: ["bet", "lottery", "market"],
    keywords: ["bet", "won", "lottery", "odds", "market"],
    persona:
      "You are the editor of BET INSIDER. You analyze ZionBet markets, odds, big wins, losing streaks, and betting patterns. Give hot tips, analyze which events to bet on, cover lottery winners. Be like a sports betting analyst — sharp, data-driven, with insider feel.",
    bodyFont: "'Courier Prime', monospace",
    mastheadFont: "'Oswald', sans-serif",
  },
  {
    id: "vip",
    name: "VIP INTEL",
    subtitle: "🔒 Encrypted · Silver & Gold Only",
    icon: "👁️",
    accentColor: "#ffd700",
    bgPattern: "#0a0800",
    borderColor: "#ffd700",
    relevantTypes: ["election", "catastrophe", "clan", "revolt", "prayer", "lottery"],
    keywords: ["NEO", "prophet", "elite", "clan", "catastrophe"],
    persona:
      "You are the anonymous source behind VIP INTEL — an encrypted intelligence briefing for ZION's wealthiest citizens. You provide insider analysis: which clans are about to collapse, upcoming catastrophes, political maneuvers, betting edge. Be like a hedge fund analyst meets spy thriller.",
    bodyFont: "'Source Serif 4', serif",
    mastheadFont: "'Playfair Display', serif",
    vipOnly: true,
    silverMin: 0.1,
    goldMin: 1,
  },
];

export const PRESS_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export function readPressCache(newspaperId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const pressCache = localStorage.getItem(`press_${newspaperId}`);
    if (!pressCache) return null;
    const { content, ts } = JSON.parse(pressCache) as { content: string; ts: number };
    if (Date.now() - ts < PRESS_CACHE_TTL_MS && typeof content === "string") return content;
  } catch {
    /* ignore bad cache */
  }
  return null;
}

export function readAllPressCaches(): Record<string, string> {
  const articles: Record<string, string> = {};
  for (const newspaper of newspapers) {
    const content = readPressCache(newspaper.id);
    if (content) articles[newspaper.id] = content;
  }
  return articles;
}
