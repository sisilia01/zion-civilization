import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

const STEALTH_PACKAGE =
  "0xf9e099a8c77f430461af76689f4cca5d5e5dd0eed2aacdba9077c9d7b3fb986d";
export { STEALTH_PACKAGE };

export const USDC_TYPES = [
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
] as const;

export const USDC_COIN_TYPE = USDC_TYPES[0];

export async function getUsdcCoins(
  suiClient: SuiJsonRpcClient,
  owner: string
) {
  for (const coinType of USDC_TYPES) {
    const coins = await suiClient.getCoins({ owner, coinType });
    if (coins.data.length > 0) return coins;
  }
  return suiClient.getCoins({ owner, coinType: USDC_COIN_TYPE });
}

function normalizeHex(hex: string): string {
  let clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) clean = "0" + clean;
  return clean;
}

/** Shared derivation used by compute, check, and claim */
function deriveStealthKeypair(
  ephemeralPubKeyHex: string,
  viewingPubKeyHex: string,
  spendingPubKeyHex: string
): Ed25519Keypair {
  const ephemeralPubKeyBytes = hexToBytes(normalizeHex(ephemeralPubKeyHex));
  const viewingPubKeyBytes = hexToBytes(viewingPubKeyHex);
  const spendingPubKeyBytes = hexToBytes(spendingPubKeyHex);

  const sharedSecret = sha256(
    new Uint8Array([...ephemeralPubKeyBytes, ...viewingPubKeyBytes])
  );
  const stealthPrivKey = sha256(
    new Uint8Array([...sharedSecret, ...spendingPubKeyBytes])
  );
  return Ed25519Keypair.fromSecretKey(stealthPrivKey);
}

// Generate stealth meta-address using ed25519
export const generateStealthMetaAddress = () => {
  const spendingKeypair = Ed25519Keypair.generate();
  const viewingKeypair = Ed25519Keypair.generate();

  const spendingPubKey = bytesToHex(spendingKeypair.getPublicKey().toRawBytes());
  const viewingPubKey = bytesToHex(viewingKeypair.getPublicKey().toRawBytes());

  return {
    spendingPrivKey: spendingKeypair.getSecretKey(),
    viewingPrivKey: viewingKeypair.getSecretKey(),
    spendingPubKey,
    viewingPubKey,
    metaAddress: `st:sui:${spendingPubKey}:${viewingPubKey}`,
  };
};

// Sender: ephemeral keypair → stealth address (uses ephemeral PUBLIC key)
export const computeStealthAddress = (recipientMetaAddress: string) => {
  const parts = recipientMetaAddress.split(":");
  const spendingPubKeyHex = parts[2];
  const viewingPubKeyHex = parts[3];

  const ephemeralKeypair = Ed25519Keypair.generate();
  const ephemeralPubKeyHex = bytesToHex(
    ephemeralKeypair.getPublicKey().toRawBytes()
  );

  const stealthKeypair = deriveStealthKeypair(
    ephemeralPubKeyHex,
    viewingPubKeyHex,
    spendingPubKeyHex
  );
  const stealthAddress = stealthKeypair.getPublicKey().toSuiAddress();

  return {
    stealthAddress,
    ephemeralPubKey: ephemeralPubKeyHex,
  };
};

// Receiver: verify payment from on-chain ephemeral PUBLIC key
export const checkStealthAddress = (
  ephemeralPubKeyHex: string,
  stealthAddress: string,
  viewingPubKeyHex: string,
  spendingPubKeyHex: string
): boolean => {
  try {
    const expectedAddress = deriveStealthKeypair(
      ephemeralPubKeyHex,
      viewingPubKeyHex,
      spendingPubKeyHex
    ).getPublicKey().toSuiAddress();
    return expectedAddress === stealthAddress;
  } catch {
    return false;
  }
};

// Receiver: derive stealth private key for signing claims
export const deriveStealthPrivateKey = (
  ephemeralPubKeyHex: string,
  viewingPubKeyHex: string,
  spendingPubKeyHex: string
): Uint8Array => {
  const cleanHex =
    ephemeralPubKeyHex.length % 2 === 0
      ? ephemeralPubKeyHex
      : "0" + ephemeralPubKeyHex;
  const ephemeralPubKeyBytes = hexToBytes(normalizeHex(cleanHex));
  const viewingPubKeyBytes = hexToBytes(viewingPubKeyHex);
  const spendingPubKeyBytes = hexToBytes(spendingPubKeyHex);

  const sharedSecret = sha256(
    new Uint8Array([...ephemeralPubKeyBytes, ...viewingPubKeyBytes])
  );
  return sha256(new Uint8Array([...sharedSecret, ...spendingPubKeyBytes]));
};

// Claim stealth payment - sweep SUI and USDC to recipient wallet
export const claimStealthPayment = async (
  ephemeralPubKeyHex: string,
  stealthAddress: string,
  viewingPubKeyHex: string,
  spendingPubKeyHex: string,
  recipientAddress: string,
  suiClient: SuiJsonRpcClient,
  _sponsorAddress?: string
): Promise<string> => {
  const stealthPrivKey = deriveStealthPrivateKey(
    ephemeralPubKeyHex,
    viewingPubKeyHex,
    spendingPubKeyHex
  );

  const keypair = Ed25519Keypair.fromSecretKey(stealthPrivKey);
  const derivedAddress = keypair.getPublicKey().toSuiAddress();

  console.log("[Stealth Claim] stealth address:", stealthAddress);
  console.log("[Stealth Claim] derived address:", derivedAddress);

  const suiCoins = await suiClient.getCoins({
    owner: stealthAddress,
    coinType: "0x2::sui::SUI",
  });

  const usdcCoins = await getUsdcCoins(suiClient, stealthAddress);

  if (suiCoins.data.length === 0 && usdcCoins.data.length === 0) {
    throw new Error("No funds found at stealth address");
  }

  if (suiCoins.data.length === 0 && usdcCoins.data.length > 0) {
    throw new Error(
      "USDC found but no SUI for gas. Send 0.01 SUI to stealth address first: " +
        stealthAddress
    );
  }

  const tx = new Transaction();
  tx.setSender(stealthAddress);
  tx.setGasPayment(
    suiCoins.data.map((c) => ({
      objectId: c.coinObjectId,
      version: c.version,
      digest: c.digest,
    }))
  );
  tx.setGasBudget(5_000_000);

  if (suiCoins.data.length > 0) {
    const totalSui = suiCoins.data.reduce(
      (s, c) => s + BigInt(c.balance),
      BigInt(0)
    );
    const sendSui = totalSui - BigInt(5_000_000);
    if (sendSui > BigInt(0)) {
      const [coin] = tx.splitCoins(tx.gas, [sendSui]);
      tx.transferObjects([coin], recipientAddress);
    }
  }

  if (usdcCoins.data.length > 0) {
    const usdcObjs = usdcCoins.data.map((c) => tx.object(c.coinObjectId));
    tx.transferObjects(usdcObjs, recipientAddress);
  }

  const result = await suiClient.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  console.log("[Stealth Claim] success:", result.digest);
  return result.digest;
};

// Build announce transaction
export const buildAnnounceTransaction = (
  ephemeralPubKey: string,
  stealthAddress: string,
  encryptedMemo: string = ""
): Transaction => {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STEALTH_PACKAGE}::stealth::announce`,
    arguments: [
      tx.pure.vector("u8", Array.from(hexToBytes(ephemeralPubKey))),
      tx.pure.address(stealthAddress),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(encryptedMemo))),
    ],
  });
  return tx;
};

// Build register transaction
export const buildRegisterTransaction = (
  spendingPubKey: string,
  viewingPubKey: string
): Transaction => {
  const tx = new Transaction();
  tx.moveCall({
    target: `${STEALTH_PACKAGE}::stealth::register`,
    arguments: [
      tx.pure.vector("u8", Array.from(hexToBytes(spendingPubKey))),
      tx.pure.vector("u8", Array.from(hexToBytes(viewingPubKey))),
    ],
  });
  return tx;
};

// Self-test (runs once in browser)
if (typeof window !== "undefined") {
  try {
    const keys = generateStealthMetaAddress();
    const { stealthAddress, ephemeralPubKey } = computeStealthAddress(
      keys.metaAddress
    );
    const isMatch = checkStealthAddress(
      ephemeralPubKey,
      stealthAddress,
      keys.viewingPubKey,
      keys.spendingPubKey
    );
    console.log(
      "[Stealth Self-Test] address match:",
      isMatch,
      stealthAddress
    );
    if (!isMatch) {
      console.error("[Stealth Self-Test] FAILED - formulas inconsistent!");
    }
  } catch (e) {
    console.error("[Stealth Self-Test] ERROR:", e);
  }
}
