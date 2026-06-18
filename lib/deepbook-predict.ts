import { bcs } from "@mysten/sui/bcs";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";

export type PredictManagerTxResponse = {
  events?: Array<{ type?: string; parsedJson?: unknown }>;
  objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }>;
};

export const DEEPBOOK_PREDICT_PACKAGE =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
export const DEEPBOOK_PREDICT_ID =
  "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
export const DUSDC_TYPE =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";
export const SUI_CLOCK = "0x6";
export const DUSDC_DECIMALS = 6;

const PREDICT_MANAGER_CREATED = `${DEEPBOOK_PREDICT_PACKAGE}::predict_manager::PredictManagerCreated`;
const PREDICT_MANAGER_TYPE = `${DEEPBOOK_PREDICT_PACKAGE}::predict_manager::PredictManager`;

export type DeepBookMarketKeyArgs = {
  oracleId: string;
  expiryMs: bigint;
  strike: bigint;
  isUp: boolean;
};

export type DeepBookTradePreview = {
  quantity: bigint;
  mintCost: bigint;
  redeemPayout: bigint;
};

export type BuildDeepBookMintParams = DeepBookMarketKeyArgs & {
  managerObjectId?: string | null;
  quantity: bigint;
  depositAmountBase: bigint;
  dusdcCoinIds: string[];
};

type PredictManagerCreatedEvent = {
  manager_id?: string;
  owner?: string;
};

function managerStorageKey(walletAddress: string): string {
  return `deepbook_predict_manager_${walletAddress.toLowerCase()}`;
}

export function dusdcToBaseUnits(amount: number): bigint {
  return BigInt(Math.floor(amount * 10 ** DUSDC_DECIMALS));
}

export function formatDusdcBaseUnits(base: bigint, digits = 4): string {
  const n = Number(base) / 10 ** DUSDC_DECIMALS;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function deepBookStrikeFromSpot(spotUsd: number, isCall: boolean): bigint {
  const mult = isCall ? 0.95 : 1.05;
  return BigInt(Math.floor(spotUsd * mult * 1e9));
}

export async function getDusdcCoins(suiClient: SuiJsonRpcClient, owner: string) {
  return suiClient.getCoins({ owner, coinType: DUSDC_TYPE });
}

export function getStoredPredictManagerId(walletAddress: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(managerStorageKey(walletAddress));
}

export function setStoredPredictManagerId(walletAddress: string, managerId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(managerStorageKey(walletAddress), managerId);
}

/** On-chain entry: `predict::create_manager(ctx) -> ID` */
export function buildCreatePredictManagerTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PREDICT_PACKAGE}::predict::create_manager`,
    arguments: [],
  });
  return tx;
}

function appendMarketKey(tx: Transaction, args: DeepBookMarketKeyArgs): TransactionObjectArgument {
  return tx.moveCall({
    target: `${DEEPBOOK_PREDICT_PACKAGE}::market_key::new`,
    arguments: [
      tx.pure.id(args.oracleId),
      tx.pure.u64(args.expiryMs),
      tx.pure.u64(args.strike),
      tx.pure.bool(args.isUp),
    ],
  });
}

function parseDevInspectU64Pair(
  inspect: Awaited<ReturnType<SuiJsonRpcClient["devInspectTransactionBlock"]>>
): { mintCost: bigint; redeemPayout: bigint } {
  if (inspect.effects?.status?.status !== "success") {
    const err = inspect.effects?.status?.error ?? "devInspect failed";
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }
  const last = inspect.results?.[inspect.results.length - 1];
  const rv = last?.returnValues;
  if (!rv || rv.length < 2) {
    throw new Error("get_trade_amounts returned no values");
  }
  return {
    mintCost: BigInt(bcs.u64().parse(new Uint8Array(rv[0][0]))),
    redeemPayout: BigInt(bcs.u64().parse(new Uint8Array(rv[1][0]))),
  };
}

/** Read-only preview via `predict::get_trade_amounts`. */
export async function readTradeAmounts(
  suiClient: SuiJsonRpcClient,
  sender: string,
  args: DeepBookMarketKeyArgs,
  quantity: bigint
): Promise<{ mintCost: bigint; redeemPayout: bigint }> {
  const tx = new Transaction();
  const key = appendMarketKey(tx, args);
  tx.moveCall({
    target: `${DEEPBOOK_PREDICT_PACKAGE}::predict::get_trade_amounts`,
    arguments: [
      tx.object(DEEPBOOK_PREDICT_ID),
      tx.object(args.oracleId),
      key,
      tx.pure.u64(quantity),
      tx.object(SUI_CLOCK),
    ],
  });
  tx.setSender(sender);
  const bytes = await tx.build({ client: suiClient });
  const inspect = await suiClient.devInspectTransactionBlock({
    sender,
    transactionBlock: bytes,
  });
  return parseDevInspectU64Pair(inspect);
}

/** Max quantity where mint_cost <= budget (binary search). */
export async function estimateQuantityForBudget(
  suiClient: SuiJsonRpcClient,
  sender: string,
  args: DeepBookMarketKeyArgs,
  budgetBase: bigint
): Promise<DeepBookTradePreview> {
  if (budgetBase <= BigInt(0)) {
    return { quantity: BigInt(0), mintCost: BigInt(0), redeemPayout: BigInt(0) };
  }

  const unit = await readTradeAmounts(suiClient, sender, args, BigInt(1));
  if (unit.mintCost <= BigInt(0)) {
    throw new Error("Invalid ask price from oracle");
  }
  if (unit.mintCost > budgetBase) {
    return { quantity: BigInt(0), mintCost: unit.mintCost, redeemPayout: BigInt(0) };
  }

  let lo = BigInt(1);
  let hi = budgetBase / unit.mintCost + BigInt(1);
  let bestQty = BigInt(0);
  let bestPreview: DeepBookTradePreview = {
    quantity: BigInt(0),
    mintCost: BigInt(0),
    redeemPayout: BigInt(0),
  };

  while (lo <= hi) {
    const mid = (lo + hi) / BigInt(2);
    const preview = await readTradeAmounts(suiClient, sender, args, mid);
    if (preview.mintCost <= budgetBase) {
      bestQty = mid;
      bestPreview = { quantity: mid, ...preview };
      lo = mid + BigInt(1);
    } else {
      hi = mid - BigInt(1);
    }
  }

  if (bestQty === BigInt(0)) {
    return { quantity: BigInt(0), mintCost: unit.mintCost, redeemPayout: BigInt(0) };
  }
  return bestPreview;
}

/**
 * Single PTB: optional create_manager + deposit DUSDC + mint<Quote>.
 * Uses real `predict::mint`, not mint_binary.
 */
export function buildDeepBookPredictMintTx(params: BuildDeepBookMintParams): {
  tx: Transaction;
  createsManager: boolean;
} {
  const tx = new Transaction();
  let managerArg: TransactionObjectArgument;
  let createsManager = false;

  if (params.managerObjectId) {
    managerArg = tx.object(params.managerObjectId);
  } else {
    managerArg = tx.moveCall({
      target: `${DEEPBOOK_PREDICT_PACKAGE}::predict::create_manager`,
      arguments: [],
    });
    createsManager = true;
  }

  if (!params.dusdcCoinIds.length) {
    throw new Error("No DUSDC coins to deposit");
  }

  const primaryCoin = tx.object(params.dusdcCoinIds[0]);
  if (params.dusdcCoinIds.length > 1) {
    tx.mergeCoins(
      primaryCoin,
      params.dusdcCoinIds.slice(1).map((id) => tx.object(id))
    );
  }
  const [depositCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(params.depositAmountBase)]);
  tx.moveCall({
    target: `${DEEPBOOK_PREDICT_PACKAGE}::predict_manager::deposit`,
    typeArguments: [DUSDC_TYPE],
    arguments: [managerArg, depositCoin],
  });

  const key = appendMarketKey(tx, {
    oracleId: params.oracleId,
    expiryMs: params.expiryMs,
    strike: params.strike,
    isUp: params.isUp,
  });

  tx.moveCall({
    target: `${DEEPBOOK_PREDICT_PACKAGE}::predict::mint`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(DEEPBOOK_PREDICT_ID),
      managerArg,
      tx.object(params.oracleId),
      key,
      tx.pure.u64(params.quantity),
      tx.object(SUI_CLOCK),
    ],
  });

  return { tx, createsManager };
}

export function extractPredictManagerId(
  tx: PredictManagerTxResponse
): string | undefined {
  const event = tx.events?.find((item) => item.type === PREDICT_MANAGER_CREATED);
  const managerId = (event?.parsedJson as PredictManagerCreatedEvent | undefined)
    ?.manager_id;
  if (managerId) return managerId;

  const created = tx.objectChanges?.find(
    (item) =>
      item.type === "created" &&
      "objectType" in item &&
      item.objectType === PREDICT_MANAGER_TYPE
  );

  return created && "objectId" in created ? created.objectId : undefined;
}

export async function verifyPredictManagerOwner(
  suiClient: SuiJsonRpcClient,
  managerId: string,
  ownerAddress: string
): Promise<boolean> {
  try {
    const obj = await suiClient.getObject({
      id: managerId,
      options: { showContent: true },
    });
    if (obj.data?.content?.dataType !== "moveObject") return false;
    const fields = obj.data.content.fields as { owner?: string };
    return fields.owner?.toLowerCase() === ownerAddress.toLowerCase();
  } catch {
    return false;
  }
}

export async function queryPredictManagerIdFromChain(
  suiClient: SuiJsonRpcClient,
  ownerAddress: string
): Promise<string | null> {
  const events = await suiClient.queryEvents({
    query: { Sender: ownerAddress },
    limit: 50,
    order: "descending",
  });

  for (const event of events.data) {
    if (event.type !== PREDICT_MANAGER_CREATED) continue;
    const parsed = event.parsedJson as PredictManagerCreatedEvent;
    if (
      parsed?.owner?.toLowerCase() === ownerAddress.toLowerCase() &&
      parsed.manager_id
    ) {
      return parsed.manager_id;
    }
  }
  return null;
}

export async function resolvePredictManagerId(
  suiClient: SuiJsonRpcClient,
  ownerAddress: string
): Promise<string | null> {
  const stored = getStoredPredictManagerId(ownerAddress);
  if (stored && (await verifyPredictManagerOwner(suiClient, stored, ownerAddress))) {
    return stored;
  }

  const fromChain = await queryPredictManagerIdFromChain(suiClient, ownerAddress);
  if (
    fromChain &&
    (await verifyPredictManagerOwner(suiClient, fromChain, ownerAddress))
  ) {
    setStoredPredictManagerId(ownerAddress, fromChain);
    return fromChain;
  }

  return null;
}

export async function waitForPredictManagerTx(
  suiClient: SuiJsonRpcClient,
  digest: string
): Promise<PredictManagerTxResponse> {
  return suiClient.waitForTransaction({
    digest,
    options: { showEvents: true, showObjectChanges: true },
  }) as Promise<PredictManagerTxResponse>;
}
