// ZION Stealth Address Protocol
// First stealth address implementation on Sui blockchain

import { Transaction } from "@mysten/sui/transactions";
import {
  getPublicKey,
  ProjectivePoint,
  utils as secpUtils,
} from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

export const STEALTH_PACKAGE =
  "0xf9e099a8c77f430461af76689f4cca5d5e5dd0eed2aacdba9077c9d7b3fb986d";

// Generate stealth meta-address (one time, saved by user)
export const generateStealthMetaAddress = () => {
  const spendingPrivKey = secpUtils.randomPrivateKey();
  const viewingPrivKey = secpUtils.randomPrivateKey();
  const spendingPubKey = getPublicKey(spendingPrivKey, true);
  const viewingPubKey = getPublicKey(viewingPrivKey, true);

  return {
    spendingPrivKey: bytesToHex(spendingPrivKey),
    viewingPrivKey: bytesToHex(viewingPrivKey),
    spendingPubKey: bytesToHex(spendingPubKey),
    viewingPubKey: bytesToHex(viewingPubKey),
    metaAddress: `st:sui:${bytesToHex(spendingPubKey)}:${bytesToHex(viewingPubKey)}`,
  };
};

// Compute stealth address for recipient (called by sender)
export const computeStealthAddress = (recipientMetaAddress: string) => {
  const parts = recipientMetaAddress.split(":");
  const spendingPubKeyHex = parts[2];
  const viewingPubKeyHex = parts[3];

  // Generate ephemeral keypair
  const ephemeralPrivKey = secpUtils.randomPrivateKey();
  const ephemeralPubKey = getPublicKey(ephemeralPrivKey, true);

  // ECDH: shared_secret = ephemeralPrivKey * viewingPubKey
  const viewingPubKeyPoint = ProjectivePoint.fromHex(viewingPubKeyHex);
  const sharedSecret = viewingPubKeyPoint.multiply(
    BigInt("0x" + bytesToHex(ephemeralPrivKey))
  );

  // Hash shared secret
  const sharedSecretHash = sha256(hexToBytes(sharedSecret.toHex(true)));

  // Compute stealth pubkey = spendingPubKey + hash*G
  const spendingPubKeyPoint = ProjectivePoint.fromHex(spendingPubKeyHex);
  const hashPoint = ProjectivePoint.BASE.multiply(
    BigInt("0x" + bytesToHex(sharedSecretHash))
  );
  const stealthPubKey = spendingPubKeyPoint.add(hashPoint);

  // Convert to Sui address (hash of pubkey)
  const stealthPubKeyBytes = hexToBytes(stealthPubKey.toHex(true));
  const stealthAddressBytes = sha256(stealthPubKeyBytes);
  const stealthAddress = "0x" + bytesToHex(stealthAddressBytes).slice(0, 64);

  return {
    stealthAddress,
    ephemeralPubKey: bytesToHex(ephemeralPubKey),
  };
};

// Check if stealth address belongs to me (called by receiver scanning)
export const checkStealthAddress = (
  ephemeralPubKeyHex: string,
  stealthAddress: string,
  viewingPrivKeyHex: string,
  spendingPubKeyHex: string
): boolean => {
  try {
    const ephemeralPubKeyPoint = ProjectivePoint.fromHex(ephemeralPubKeyHex);
    const viewingPrivKeyBig = BigInt("0x" + viewingPrivKeyHex);

    // ECDH
    const sharedSecret = ephemeralPubKeyPoint.multiply(viewingPrivKeyBig);
    const sharedSecretHash = sha256(hexToBytes(sharedSecret.toHex(true)));

    // Compute expected stealth pubkey
    const spendingPubKeyPoint = ProjectivePoint.fromHex(spendingPubKeyHex);
    const hashPoint = ProjectivePoint.BASE.multiply(
      BigInt("0x" + bytesToHex(sharedSecretHash))
    );
    const expectedStealthPubKey = spendingPubKeyPoint.add(hashPoint);
    const expectedBytes = hexToBytes(expectedStealthPubKey.toHex(true));
    const expectedAddress = "0x" + bytesToHex(sha256(expectedBytes)).slice(0, 64);

    return expectedAddress === stealthAddress;
  } catch {
    return false;
  }
};

// Build announce transaction (after sending to stealth address)
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

// Build register transaction (user registers their meta-address)
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
