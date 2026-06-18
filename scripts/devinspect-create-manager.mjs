import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { buildCreatePredictManagerTx } from "../lib/deepbook-predict.ts";

const client = new SuiJsonRpcClient({
  url: "https://fullnode.testnet.sui.io:443",
  network: "testnet",
});
const address = "0x9b18a3f658bff4d5d40a0e36c8092f3de5d8b0105577da1e65e7f4459baa132e";

async function main() {
  const tx = buildCreatePredictManagerTx();
  tx.setSender(address);
  const bytes = await tx.build({ client });
  const inspect = await client.devInspectTransactionBlock({
    sender: address,
    transactionBlock: bytes,
  });
  console.log("status:", inspect.effects?.status);
  if (inspect.error) console.log("error:", inspect.error);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
