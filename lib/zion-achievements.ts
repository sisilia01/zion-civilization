export type ZionAchievementDef = {
  id: string;
  label: string;
  description: string;
  unlockCondition: string;
};

export type ZionProfile = {
  nickname?: string;
  avatar?: string;
  achievements?: string[];
  /** ISO timestamps when each achievement was first recorded locally */
  achievementsEarnedAt?: Record<string, string>;
};

export type ZionBetAchievementInput = {
  id: number;
  status?: string;
  created_at?: string | null;
  amount_sui?: number;
  amount?: number;
};

export type ZionBetWalletStatsInput = {
  total_bets?: number;
  win_rate?: number;
  net_pnl?: number;
  total_profit?: number;
};

export const ZION_ACHIEVEMENT_DEFS: ZionAchievementDef[] = [
  {
    id: "night_wolf",
    label: "NIGHT WOLF",
    description: "A patient predator of the prediction markets — volume over vanity.",
    unlockCondition: "Place 50 or more bets on ZionBet.",
  },
  {
    id: "fire_fox",
    label: "FIRE FOX",
    description: "Sharp instincts and a hot streak — the fox reads the crowd.",
    unlockCondition: "Maintain a win rate above 60%.",
  },
  {
    id: "void_dragon",
    label: "VOID DRAGON",
    description: "Hoards profit from the void between YES and NO.",
    unlockCondition: "Reach +100 SUI net P&L on ZionBet.",
  },
  {
    id: "storm_hawk",
    label: "STORM HAWK",
    description: "Strikes fast when the window opens — five bets in a single day.",
    unlockCondition: "Place 5 or more bets within 24 hours.",
  },
  {
    id: "crystal_mind",
    label: "CRYSTAL MIND",
    description: "Clarity under pressure — ten wins in a row without a miss.",
    unlockCondition: "Win 10 consecutive settled bets.",
  },
  {
    id: "shadow_ninja",
    label: "SHADOW NINJA",
    description: "Moves in silence with heavy stakes — one bold bet changes the board.",
    unlockCondition: "Place a single bet larger than 10 SUI.",
  },
];

export function zionProfileStorageKey(wallet: string): string {
  return `zion_profile_${wallet.trim().toLowerCase()}`;
}

export function loadZionProfile(wallet: string): ZionProfile {
  if (typeof window === "undefined" || !wallet.trim()) return {};
  try {
    return JSON.parse(localStorage.getItem(zionProfileStorageKey(wallet)) || "{}") as ZionProfile;
  } catch {
    return {};
  }
}

export function saveZionProfile(wallet: string, profile: ZionProfile): void {
  if (typeof window === "undefined" || !wallet.trim()) return;
  localStorage.setItem(zionProfileStorageKey(wallet), JSON.stringify(profile));
}

export function zionbetComputeAchievements(
  bets: ZionBetAchievementInput[],
  stats: ZionBetWalletStatsInput | null
): string[] {
  const earned: string[] = [];
  const totalBets = stats?.total_bets ?? bets.length;
  const winRate = stats?.win_rate ?? 0;
  const profit = stats?.net_pnl ?? stats?.total_profit ?? 0;

  if (totalBets >= 50) earned.push("night_wolf");
  if (winRate > 60) earned.push("fire_fox");
  if (profit > 100) earned.push("void_dragon");

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const bets24h = bets.filter((b) => {
    const t = b.created_at ? Date.parse(b.created_at) : NaN;
    return Number.isFinite(t) && now - t < dayMs;
  }).length;
  if (bets24h >= 5) earned.push("storm_hawk");

  const settled = [...bets]
    .filter((b) => {
      const s = (b.status || "").toLowerCase();
      return s === "won" || s === "lost";
    })
    .sort((a, b) => b.id - a.id);
  let winStreak = 0;
  for (const b of settled) {
    if ((b.status || "").toLowerCase() === "won") winStreak += 1;
    else break;
  }
  if (winStreak >= 10) earned.push("crystal_mind");

  if (bets.some((b) => (b.amount_sui ?? b.amount ?? 0) > 10)) earned.push("shadow_ninja");

  return earned;
}

export function mergeAchievementTimestamps(
  profile: ZionProfile,
  earnedIds: string[]
): ZionProfile {
  const earnedAt = { ...(profile.achievementsEarnedAt ?? {}) };
  const nowIso = new Date().toISOString();
  for (const id of earnedIds) {
    if (!earnedAt[id]) earnedAt[id] = nowIso;
  }
  return { ...profile, achievements: earnedIds, achievementsEarnedAt: earnedAt };
}

export function getAchievementDef(id: string): ZionAchievementDef | undefined {
  return ZION_ACHIEVEMENT_DEFS.find((def) => def.id === id);
}
