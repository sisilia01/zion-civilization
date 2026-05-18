import { SealClient } from "@mysten/seal";
import { suiClient } from "./deepbook";

/** Mysten Seal testnet key servers (open mode). @mysten/seal 1.x uses `serverConfigs`, not `getAllowlistedKeyServers`. */
const SEAL_TESTNET_SERVER_CONFIGS = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];

let sealClient: SealClient | null = null;

export function getSealClient(): SealClient {
  if (!sealClient) {
    sealClient = new SealClient({
      suiClient: suiClient as any,
      serverConfigs: SEAL_TESTNET_SERVER_CONFIGS,
      verifyKeyServers: false,
    });
  }
  return sealClient;
}

// Encrypt VIP press article content using Seal
export async function encryptArticle(
  content: string,
  allowlistObjectId: string,
  signer: any
): Promise<{ encryptedData: Uint8Array; encryptedKey: Uint8Array } | null> {
  try {
    const client = getSealClient();
    const contentBytes = new TextEncoder().encode(content);

    // Create identity from allowlist object
    const { encryptedObject, key } = await client.encrypt({
      threshold: 2,
      packageId: "0x06a2b2c52b6e7d71b4d4e6a8e60c77c1a5f7a65b3bfea1c0ea87d6eb4c56f23",
      id: allowlistObjectId,
      data: contentBytes,
    });

    return {
      encryptedData: encryptedObject,
      encryptedKey: key,
    };
  } catch (error) {
    console.error("Seal encrypt error:", error);
    return null;
  }
}

// Decrypt VIP content using Seal
export async function decryptArticle(
  encryptedData: Uint8Array,
  signer: any
): Promise<string | null> {
  try {
    const client = getSealClient();

    const decrypted = await client.decrypt({
      data: encryptedData,
      sessionKey: signer,
      txBytes: new Uint8Array(),
    });

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Seal decrypt error:", error);
    return null;
  }
}

// Check if content is Seal encrypted (starts with Seal header)
export function isSealEncrypted(data: string): boolean {
  return data.startsWith("SEAL:");
}

export const SILVER_THRESHOLD = 0.1;
export const GOLD_THRESHOLD = 1;

export async function checkVIPAccess(walletAddress: string) {
  try {
    const balance = await suiClient.getBalance({
      owner: walletAddress,
      coinType: "0x2::sui::SUI",
    });
    const suiBalance = Number(balance.totalBalance) / 1_000_000_000;
    return {
      isGold: suiBalance >= GOLD_THRESHOLD,
      isSilver: suiBalance >= SILVER_THRESHOLD,
      zionBalance: suiBalance,
      silverRequired: SILVER_THRESHOLD,
      goldRequired: GOLD_THRESHOLD,
    };
  } catch {
    return {
      isGold: false,
      isSilver: false,
      zionBalance: 0,
      silverRequired: SILVER_THRESHOLD,
      goldRequired: GOLD_THRESHOLD,
    };
  }
}

export interface VIPMarket {
  id: string;
  question: string;
  category: string;
  yesOdds: number;
  noOdds: number;
  minBet: number;
  maxBet: number;
  tier: "silver" | "gold";
}

export const VIP_MARKETS: VIPMarket[] = [
  {
    id: "silver-1",
    question: "Will Golden Dawn betray Iron Fist this week?",
    category: "⚔️ Clan Wars",
    yesOdds: 20,
    noOdds: 80,
    minBet: 500,
    maxBet: 50000,
    tier: "silver",
  },
  {
    id: "silver-2",
    question: "Will more than 100 agents die this week?",
    category: "💀 Deaths",
    yesOdds: 35,
    noOdds: 65,
    minBet: 1000,
    maxBet: 100000,
    tier: "silver",
  },
  {
    id: "silver-3",
    question: "Will ZION reach 2000 agents this month?",
    category: "📊 Growth",
    yesOdds: 60,
    noOdds: 40,
    minBet: 500,
    maxBet: 50000,
    tier: "silver",
  },
  {
    id: "gold-1",
    question: "Will Prophet Drake be assassinated this month?",
    category: "👑 Politics",
    yesOdds: 5,
    noOdds: 95,
    minBet: 5000,
    maxBet: 500000,
    tier: "gold",
  },
  {
    id: "gold-2",
    question: "Will the identity of NEO be revealed this season?",
    category: "👁️ Mystery",
    yesOdds: 12,
    noOdds: 88,
    minBet: 10000,
    maxBet: 1000000,
    tier: "gold",
  },
  {
    id: "gold-3",
    question: "Will ZION token 10x before civilization reaches 5000 agents?",
    category: "🚀 Crypto",
    yesOdds: 8,
    noOdds: 92,
    minBet: 10000,
    maxBet: 1000000,
    tier: "gold",
  },
];
