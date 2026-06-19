import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import {
  buildReserveCoinsTransaction,
  createPresignedRowId,
  defaultScheduleDateTimeLocal,
} from "../lib/presigned-schedule.ts";

const SENDER = "0x67c5c21778202ec72d90a21ae4fea6fb7b563e43920056f5504cea3b2b643cf9";
const USDC_PRIMARY = "0x6e61d4bb7f9287c2c105efbefa5c272077d7988c0e16e3fd184905b9109b262b";
const USDC_MERGE = ["0x70c619e842e775bd88a8400e2cb191b1644bcda33c10171c9936dfe611a8e0f8"];
const RECIPIENT = "0x0000000000000000000000000000000000000000000000000000000000000001";

const client = new SuiJsonRpcClient({
  url: "https://fullnode.testnet.sui.io:443",
  network: "testnet",
});

function makeRow(amount, coin) {
  return {
    id: createPresignedRowId(),
    scheduledAtLocal: defaultScheduleDateTimeLocal(10),
    amount,
    coin,
    recipient: RECIPIENT,
  };
}

async function runScenario(name, rows, usdcPrimary, usdcMerge) {
  const { tx, suiSplitCount, usdcSplitCount } = buildReserveCoinsTransaction(
    rows,
    SENDER,
    usdcPrimary,
    usdcMerge
  );
  tx.setSender(SENDER);
  const inspect = await client.devInspectTransactionBlock({
    sender: SENDER,
    transactionBlock: tx,
  });
  const status = inspect.effects?.status;
  const created = (inspect.objectChanges || []).filter(
    (c) => c.type === "created" && String(c.objectType || "").includes("::coin::Coin")
  );

  const fullBytes = await tx.build({ client });
  const dryRun = await client.dryRunTransactionBlock({ transactionBlock: fullBytes });
  const dryStatus = dryRun.effects?.status;

  console.log(`\n=== ${name} ===`);
  console.log("devInspect status:", status?.status, status?.error || "");
  console.log("dryRun status:", dryStatus?.status, dryStatus?.error || "");
  console.log("expected coins:", suiSplitCount + usdcSplitCount, "dryRun created:", (dryRun.objectChanges || []).filter((c) => c.type === "created" && String(c.objectType || "").includes("::coin::Coin")).length);
  if (inspect.error) console.log("inspect.error:", inspect.error);
  return status?.status === "success" && dryStatus?.status === "success";
}

async function main() {
  const scenarios = [
    ["1× SUI", [makeRow("0.1", "SUI")], null, []],
    ["1× USDC", [makeRow("0.1", "USDC")], USDC_PRIMARY, USDC_MERGE],
    ["2× USDC", [makeRow("0.6", "USDC"), makeRow("0.1", "USDC")], USDC_PRIMARY, USDC_MERGE],
  ];

  let allOk = true;
  for (const [name, rows, primary, merge] of scenarios) {
    const ok = await runScenario(name, rows, primary, merge);
    allOk = allOk && ok;
  }
  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
