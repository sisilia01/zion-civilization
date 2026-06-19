/**
 * Sub-step 2.2 round-trip: encrypt → Walrus PUT → GET → decrypt.
 * Run: npx tsx scripts/test-stealth-file-roundtrip.mjs
 */
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptStealthFile, decryptStealthFilePacked, bytesEqual } from "../lib/stealth-file-crypto.ts";
import { uploadWalrusBytes, downloadWalrusBytes } from "../lib/walrus-blob.ts";
import { buildFileMemo, parseFileMemo } from "../lib/stealth-file-memo.ts";

const TEST_CONTENT = `ZION stealth file attachment test ${new Date().toISOString()}\n`;
const TEST_FILE = join(tmpdir(), `zion-stealth-test-${Date.now()}.txt`);

async function main() {
  writeFileSync(TEST_FILE, TEST_CONTENT, "utf8");
  const originalBytes = new Uint8Array(readFileSync(TEST_FILE));

  console.log("=== 2.1 encrypt (Web Crypto AES-GCM) ===");
  const blob = new Blob([originalBytes], { type: "text/plain" });
  const encrypted = await encryptStealthFile(blob, "roundtrip-test.txt");
  console.log("original bytes:", originalBytes.byteLength);
  console.log("packed ciphertext bytes:", encrypted.packedCiphertext.byteLength);
  console.log("aes key bytes:", encrypted.keyBytes.byteLength);

  console.log("\n=== 2.2 Walrus upload/download ===");
  const blobId = await uploadWalrusBytes(encrypted.packedCiphertext, "application/octet-stream");
  console.log("blob_id:", blobId);
  const downloaded = await downloadWalrusBytes(blobId);
  console.log("downloaded bytes:", downloaded.byteLength);
  console.log("upload/download byte-equal:", bytesEqual(encrypted.packedCiphertext, downloaded));

  console.log("\n=== decrypt round-trip ===");
  const decrypted = await decryptStealthFilePacked(downloaded, encrypted.keyBytes);
  console.log("decrypted bytes:", decrypted.byteLength);
  console.log("plaintext byte-equal:", bytesEqual(originalBytes, decrypted));
  console.log("decrypted text:", new TextDecoder().decode(decrypted));

  console.log("\n=== 2.3 memo build/parse ===");
  const memo = buildFileMemo({
    blobId,
    keyBytes: encrypted.keyBytes,
    fileName: "roundtrip-test.txt",
    caption: "Hackathon attachment test",
  });
  console.log("memo length:", memo.length);
  console.log("memo preview:", memo.slice(0, 80) + "...");
  const parsed = parseFileMemo(memo);
  console.log("parse ok:", parsed !== null);
  console.log("parsed blobId:", parsed?.blobId);
  console.log("parsed fileName:", parsed?.fileName);
  console.log("parsed caption:", parsed?.caption);
  console.log("parsed key matches:", bytesEqual(parsed.keyBytes, encrypted.keyBytes));

  unlinkSync(TEST_FILE);

  if (!bytesEqual(originalBytes, decrypted)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
