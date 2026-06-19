import { DEEPBOOK_PREDICT_PACKAGE } from "@/lib/deepbook-predict";
import { WALRUS_AGGREGATOR } from "@/lib/walrus-blob";

/** On-chain package shown on DeepBook Predict (Prediction Engine). */
export const ZION_PACKAGE_ID = DEEPBOOK_PREDICT_PACKAGE;

export const ZION_PACKAGE_SUICAN_URL = `https://suiscan.xyz/testnet/object/${ZION_PACKAGE_ID}`;

export const WALRUS_AGGREGATOR_URL = WALRUS_AGGREGATOR;

export const SITE_SOCIAL = {
  twitter: "https://x.com/ZionCiv",
  youtube: "https://www.youtube.com/channel/UCU-5W5PlfGCKnmAEKyLUKJA",
  medium: "https://medium.com/@zioncivilization",
  discord: "https://discord.gg/rp5tvdre",
} as const;

export const SITE_PROJECT = {
  github: "https://github.com/sisilia01/zion-civilization",
  email: "zioncivilization@gmail.com",
  whitepaper: "/whitepaper",
} as const;

export function truncateOnChainId(id: string, head = 10, tail = 4): string {
  if (id.length <= head + tail + 3) return id;
  return `${id.slice(0, head)}...${id.slice(-tail)}`;
}
