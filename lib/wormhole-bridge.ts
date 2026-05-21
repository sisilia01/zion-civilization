import { wormhole, Wormhole, toNative } from "@wormhole-foundation/sdk";
import type { SignAndSendSigner } from "@wormhole-foundation/sdk";
import type { SuiUnsignedTransaction } from "@wormhole-foundation/sdk-sui";

export type { SignAndSendSigner };
import sui from "@wormhole-foundation/sdk/sui";
import evm from "@wormhole-foundation/sdk/evm";

export const initWormhole = async () => {
  const wh = await wormhole("Testnet", [sui, evm]);
  return wh;
};

export type WormholeRouteInfo = {
  network: string;
  fromChain: string;
  toChain: string;
  tokenSymbol: "USDC" | "ETH" | "USDT";
  amount: string;
  fromAddress: string;
  toAddress: string;
};

export const getSuiToEthBridgeQuote = async (params: {
  tokenSymbol: "USDC" | "ETH" | "USDT";
  amount: string;
  fromAddress: string;
  toAddress: string;
}) => {
  const wh = await initWormhole();
  const srcChain = wh.getChain("Sui");
  const dstChain = wh.getChain("Ethereum");
  const routeInfo: WormholeRouteInfo = {
    network: "Testnet",
    fromChain: srcChain.chain,
    toChain: dstChain.chain,
    tokenSymbol: params.tokenSymbol,
    amount: params.amount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
  };
  return { srcChain, dstChain, wh, routeInfo };
};

const TOKEN_DECIMALS: Record<"USDC" | "ETH" | "USDT", number> = {
  USDC: 6,
  ETH: 8,
  USDT: 6,
};

const TOKEN_MAP: Record<"USDC" | "ETH" | "USDT", string> = {
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  ETH: "0xd0e89b2af5e4910726fbcd8b8dd37d4b5d709f6e::eth::ETH",
  USDT: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
};

export const executeSuiToEthTransfer = async (params: {
  tokenSymbol: "USDC" | "ETH" | "USDT";
  amount: string;
  fromAddress: string;
  toAddress: string;
}): Promise<SuiUnsignedTransaction<"Testnet", "Sui">[]> => {
  const wh = await initWormhole();
  const srcChain = wh.getChain("Sui");
  const tb = await srcChain.getTokenBridge();

  const tokenAddress = TOKEN_MAP[params.tokenSymbol];
  const decimals = TOKEN_DECIMALS[params.tokenSymbol];
  const amountBigInt = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  );

  const sender = toNative("Sui", params.fromAddress);
  const recipient = Wormhole.chainAddress("Ethereum", params.toAddress);
  const token = toNative("Sui", tokenAddress);

  const transfer = tb.transfer(sender, recipient, token, amountBigInt);

  const txs: SuiUnsignedTransaction<"Testnet", "Sui">[] = [];
  for await (const tx of transfer) {
    txs.push(tx);
  }

  return txs;
};
