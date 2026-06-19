/**
 * E2E without wallet: file encrypt → Walrus → memo → encryptNote/decryptNote → download → decrypt.
 * Run: npx tsx scripts/test-stealth-file-send-receive.mjs
 */
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptStealthFile, decryptStealthFilePacked, bytesEqual } from "../lib/stealth-file-crypto.ts";
import { uploadWalrusBytes, downloadWalrusBytes } from "../lib/walrus-blob.ts";
import { buildFileMemo, parseFileMemo, isStealthFileMemo } from "../lib/stealth-file-memo.ts";

const TEST_RECIPIENT = "st:sui:abc123def4567890abcdef1234567890abcdef1234567890abcdef12:viewkey";

async function encryptNote(recipientAddress, noteData) {
  const recipientSeed = new TextEncoder().encode(recipientAddress.slice(0, 32).padEnd(32, "0"));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey("raw", recipientSeed, { name: "PBKDF2" }, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: iv, iterations: 1000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(noteData));
  const encryptedBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv);
  combined.set(encryptedBytes, iv.length);
  return Array.from(combined)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function decryptNote(recipientAddress, encryptedHex) {
  const bytes = new Uint8Array(encryptedHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  const iv = bytes.slice(0, 12);
  const encrypted = bytes.slice(12);
  const recipientSeed = new TextEncoder().encode(recipientAddress.slice(0, 32).padEnd(32, "0"));
  const keyMaterial = await crypto.subtle.importKey("raw", recipientSeed, { name: "PBKDF2" }, false, ["deriveKey"]);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: iv, iterations: 1000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function main() {
  const testPath = join(tmpdir(), `zion-stealth-e2e-${Date.now()}.txt`);
  const originalText = `wallet-e2e-marker ${Date.now()}\n`;
  writeFileSync(testPath, originalText, "utf8");
  const originalBytes = new Uint8Array(readFileSync(testPath));

  console.log("1) encrypt file");
  const enc = await encryptStealthFile(new Blob([originalBytes]), "e2e-marker.txt");

  console.log("2) walrus upload");
  const blobId = await uploadWalrusBytes(enc.packedCiphertext);
  console.log("   blob_id:", blobId);

  console.log("3) build + encrypt memo");
  const memo = buildFileMemo({
    blobId,
    keyBytes: enc.keyBytes,
    fileName: "e2e-marker.txt",
    caption: "Step 3 integration test",
  });
  const encryptedMemoHex = await encryptNote(TEST_RECIPIENT, memo);
  console.log("   encrypted_memo hex length:", encryptedMemoHex.length);

  console.log("4) recipient decrypt memo");
  const decryptedMemo = await decryptNote(TEST_RECIPIENT, encryptedMemoHex);
  console.log("   isStealthFileMemo:", isStealthFileMemo(decryptedMemo));
  const parsed = parseFileMemo(decryptedMemo);
  console.log("   parsed blobId:", parsed?.blobId);
  console.log("   parsed caption:", parsed?.caption);

  console.log("5) download + decrypt file");
  const packed = await downloadWalrusBytes(parsed.blobId);
  const plain = await decryptStealthFilePacked(packed, parsed.keyBytes);
  console.log("   round-trip bytes equal:", bytesEqual(originalBytes, plain));
  console.log("   text:", new TextDecoder().decode(plain));

  unlinkSync(testPath);
  if (!bytesEqual(originalBytes, plain)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
