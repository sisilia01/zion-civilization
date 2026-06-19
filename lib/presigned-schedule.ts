import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";

export const PRESIGNED_MAX_ROWS = 10;
export const PRESIGNED_GAS_RESERVE_MIST = BigInt(10_000_000);
export const PRESIGNED_GAS_BUDGET = 5_000_000;

export type PresignedScheduleCoin = "SUI" | "USDC";

export type PresignedScheduleRow = {
  id: string;
  scheduledAtLocal: string;
  amount: string;
  coin: PresignedScheduleCoin;
  recipient: string;
};

export type ObjectRef = {
  objectId: string;
  version: string;
  digest: string;
};

export type RowReservePlan =
  | { kind: "SUI"; suiCoinIdx: number }
  | { kind: "USDC"; usdcCoinIdx: number; gasCoinIdx: number };

export function createPresignedRowId(): string {
  return `ps-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultScheduleDateTimeLocal(offsetMinutes = 5): string {
  const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function createEmptyPresignedRow(): PresignedScheduleRow {
  return {
    id: createPresignedRowId(),
    scheduledAtLocal: defaultScheduleDateTimeLocal(5),
    amount: "0.1",
    coin: "SUI",
    recipient: "",
  };
}

export function normalizeSuiRecipient(recipient: string): string | null {
  let r = recipient.trim();
  if (!r) return null;
  if (!r.startsWith("0x")) r = `0x${r}`;
  if (r.length !== 66) return null;
  return r;
}

export function parsePresignedAmountMist(amount: string, coin: PresignedScheduleCoin): bigint | null {
  const parsed = parseFloat(String(amount).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const mist =
    coin === "SUI"
      ? BigInt(Math.floor(parsed * 1_000_000_000))
      : BigInt(Math.floor(parsed * 1_000_000));
  if (mist <= BigInt(0)) return null;
  return mist;
}

export function localDateTimeToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function validatePresignedRows(rows: PresignedScheduleRow[]): string | null {
  if (!rows.length) return "Add at least one payment";
  if (rows.length > PRESIGNED_MAX_ROWS) return `Maximum ${PRESIGNED_MAX_ROWS} payments per batch`;

  const now = Date.now();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const label = `Payment ${i + 1}`;
    const iso = localDateTimeToIso(row.scheduledAtLocal);
    if (!iso) return `${label}: invalid date/time`;
    if (new Date(iso).getTime() <= now) return `${label}: schedule must be in the future`;
    if (!normalizeSuiRecipient(row.recipient)) return `${label}: enter valid 0x recipient (66 chars)`;
    if (!parsePresignedAmountMist(row.amount, row.coin)) return `${label}: invalid amount`;
  }
  return null;
}

export function buildReservePlans(rows: PresignedScheduleRow[]): {
  plans: RowReservePlan[];
  suiSplitAmounts: bigint[];
  usdcSplitAmounts: bigint[];
} {
  const plans: RowReservePlan[] = [];
  const suiSplitAmounts: bigint[] = [];
  const usdcSplitAmounts: bigint[] = [];

  for (const row of rows) {
    const mist = parsePresignedAmountMist(row.amount, row.coin)!;
    if (row.coin === "SUI") {
      plans.push({ kind: "SUI", suiCoinIdx: suiSplitAmounts.length });
      suiSplitAmounts.push(mist + PRESIGNED_GAS_RESERVE_MIST);
    } else {
      plans.push({
        kind: "USDC",
        usdcCoinIdx: usdcSplitAmounts.length,
        gasCoinIdx: suiSplitAmounts.length,
      });
      usdcSplitAmounts.push(mist);
      suiSplitAmounts.push(PRESIGNED_GAS_RESERVE_MIST);
    }
  }

  return { plans, suiSplitAmounts, usdcSplitAmounts };
}

function collectSplitCoinResults(
  splitResult: ReturnType<Transaction["splitCoins"]>,
  count: number
): TransactionObjectArgument[] {
  return Array.from({ length: count }, (_, i) => (splitResult as Record<number, TransactionObjectArgument>)[i]);
}

export function buildReserveCoinsTransaction(
  rows: PresignedScheduleRow[],
  senderAddress: string,
  usdcPrimaryCoinId: string | null,
  usdcMergeCoinIds: string[] = []
): { tx: Transaction; plans: RowReservePlan[]; suiSplitCount: number; usdcSplitCount: number } {
  const { plans, suiSplitAmounts, usdcSplitAmounts } = buildReservePlans(rows);
  const tx = new Transaction();

  if (suiSplitAmounts.length > 0) {
    const suiCoins = tx.splitCoins(tx.gas, suiSplitAmounts);
    tx.transferObjects(collectSplitCoinResults(suiCoins, suiSplitAmounts.length), senderAddress);
  }

  if (usdcSplitAmounts.length > 0) {
    if (!usdcPrimaryCoinId) {
      throw new Error("No USDC coins in wallet for scheduled USDC payments");
    }
    if (usdcMergeCoinIds.length > 0) {
      tx.mergeCoins(
        tx.object(usdcPrimaryCoinId),
        usdcMergeCoinIds.map((id) => tx.object(id))
      );
    }
    const usdcCoins = tx.splitCoins(tx.object(usdcPrimaryCoinId), usdcSplitAmounts);
    tx.transferObjects(collectSplitCoinResults(usdcCoins, usdcSplitAmounts.length), senderAddress);
  }

  const gasBudget = 50_000_000 + suiSplitAmounts.length * 2_000_000 + usdcSplitAmounts.length * 3_000_000;
  tx.setGasBudget(gasBudget);

  return {
    tx,
    plans,
    suiSplitCount: suiSplitAmounts.length,
    usdcSplitCount: usdcSplitAmounts.length,
  };
}

export function extractCreatedCoinRefs(objectChanges: unknown[] | null | undefined): ObjectRef[] {
  if (!objectChanges?.length) return [];
  return objectChanges
    .filter((change): change is Record<string, unknown> => Boolean(change && typeof change === "object"))
    .filter((change) => change.type === "created" && String(change.objectType || "").includes("::coin::Coin"))
    .map((change) => ({
      objectId: String(change.objectId),
      version: String(change.version),
      digest: String(change.digest),
    }));
}

export function mapReservedCoins(
  plans: RowReservePlan[],
  suiCoins: ObjectRef[],
  usdcCoins: ObjectRef[]
): Array<{ payment: ObjectRef; gas: ObjectRef | null }> {
  return plans.map((plan) => {
    if (plan.kind === "SUI") {
      return { payment: suiCoins[plan.suiCoinIdx], gas: suiCoins[plan.suiCoinIdx] };
    }
    return {
      payment: usdcCoins[plan.usdcCoinIdx],
      gas: suiCoins[plan.gasCoinIdx],
    };
  });
}

export function buildPresignedTransferTransaction(
  row: PresignedScheduleRow,
  reserved: { payment: ObjectRef; gas: ObjectRef | null }
): Transaction {
  const recipient = normalizeSuiRecipient(row.recipient)!;
  const amountMist = parsePresignedAmountMist(row.amount, row.coin)!;
  const tx = new Transaction();
  const gasRef = reserved.gas || reserved.payment;

  tx.setGasPayment([
    {
      objectId: gasRef.objectId,
      version: gasRef.version,
      digest: gasRef.digest,
    },
  ]);

  if (row.coin === "SUI") {
    const [payCoin] = tx.splitCoins(tx.object(reserved.payment.objectId), [amountMist]);
    tx.transferObjects([payCoin], recipient);
  } else {
    tx.transferObjects([tx.object(reserved.payment.objectId)], recipient);
  }

  tx.setGasBudget(Number(PRESIGNED_GAS_BUDGET));
  return tx;
}

export type PresignedPaymentPayload = {
  recipient: string;
  amount: string;
  coin_type: PresignedScheduleCoin;
  scheduled_at: string;
  transaction_bytes: string;
  signature: string;
  reserved_coin_object_id: string;
  reserved_coin_version: number;
  reserved_coin_digest: string;
  reserved_gas_coin_object_id: string | null;
  reserved_gas_coin_version: number | null;
  reserved_gas_coin_digest: string | null;
};
