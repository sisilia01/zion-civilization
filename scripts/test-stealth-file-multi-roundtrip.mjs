/**
 * Sub-step 2 multi-file round-trip:
 * encrypt 3 files → Walrus PUT each → build ZFILEN memo → parse → GET → decrypt → byte compare.
 * Run: npx tsx scripts/test-stealth-file-multi-roundtrip.mjs
 */
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptStealthFile, decryptStealthFilePacked, bytesEqual } from "../lib/stealth-file-crypto.ts";
import { uploadWalrusBytes, downloadWalrusBytes } from "../lib/walrus-blob.ts";
import { buildMultiFileMemo, buildFileMemo, parseFileMemo } from "../lib/stealth-file-memo.ts";

const stamp = Date.now();
const FIXTURES = [
  {
    name: "clip-demo.mp4",
    mime: "video/mp4",
    content: Buffer.from(
      `FAKE-MP4-${stamp}\n` + "x".repeat(4096),
      "utf8"
    ),
  },
  {
    name: "photo-demo.png",
    mime: "image/png",
    content: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...Buffer.from(`PNG-DEMO-${stamp}`, "utf8"),
    ]),
  },
  {
    name: "notes-demo.txt",
    mime: "text/plain",
    content: Buffer.from(`Stealth multi-file memo test ${new Date(stamp).toISOString()}\n`, "utf8"),
  },
];

const tempPaths = [];

function cleanup() {
  for (const path of tempPaths) {
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log("=== Multi-file encrypt + Walrus upload ===");
  const encryptedEntries = [];

  for (const fixture of FIXTURES) {
    const path = join(tmpdir(), `zion-multi-${stamp}-${fixture.name}`);
    tempPaths.push(path);
    writeFileSync(path, fixture.content);
    const originalBytes = new Uint8Array(readFileSync(path));

    const blob = new Blob([originalBytes], { type: fixture.mime });
    const encrypted = await encryptStealthFile(blob, fixture.name);
    const blobId = await uploadWalrusBytes(encrypted.packedCiphertext, "application/octet-stream");

    encryptedEntries.push({
      fixture,
      originalBytes,
      encrypted,
      blobId,
    });

    console.log(`\n[${fixture.name}]`);
    console.log("  original bytes:", originalBytes.byteLength);
    console.log("  packed ciphertext bytes:", encrypted.packedCiphertext.byteLength);
    console.log("  aes key bytes:", encrypted.keyBytes.byteLength);
    console.log("  blob_id:", blobId);
  }

  console.log("\n=== ZFILEN memo build/parse ===");
  const memo = buildMultiFileMemo({
    files: encryptedEntries.map((entry) => ({
      blobId: entry.blobId,
      keyBytes: entry.encrypted.keyBytes,
      fileName: entry.fixture.name,
    })),
    caption: "Multi-file round-trip caption",
  });
  console.log("memo length:", memo.length);
  console.log("memo prefix:", memo.slice(0, 48) + "...");

  const parsed = parseFileMemo(memo);
  if (!parsed) {
    throw new Error("parseFileMemo returned null");
  }
  console.log("parsed format:", parsed.format);
  console.log("parsed file count:", parsed.files.length);
  console.log("parsed caption:", parsed.caption);

  if (parsed.files.length !== encryptedEntries.length) {
    throw new Error(`Expected ${encryptedEntries.length} files, got ${parsed.files.length}`);
  }

  console.log("\n=== Download + decrypt each blob ===");
  let allOk = true;

  for (let i = 0; i < encryptedEntries.length; i += 1) {
    const entry = encryptedEntries[i];
    const parsedFile = parsed.files[i];
    console.log(`\n[${entry.fixture.name}] round-trip`);

    const blobIdMatch = parsedFile.blobId === entry.blobId;
    const nameMatch = parsedFile.fileName === entry.fixture.name;
    const keyMatch = bytesEqual(parsedFile.keyBytes, entry.encrypted.keyBytes);
    console.log("  parsed blob_id:", parsedFile.blobId, blobIdMatch ? "OK" : "MISMATCH");
    console.log("  parsed fileName:", parsedFile.fileName, nameMatch ? "OK" : "MISMATCH");
    console.log("  parsed key matches:", keyMatch ? "OK" : "MISMATCH");

    const downloaded = await downloadWalrusBytes(parsedFile.blobId);
    const uploadDownloadMatch = bytesEqual(entry.encrypted.packedCiphertext, downloaded);
    console.log("  upload/download byte-equal:", uploadDownloadMatch ? "OK" : "MISMATCH");

    const decrypted = await decryptStealthFilePacked(downloaded, parsedFile.keyBytes);
    const plaintextMatch = bytesEqual(entry.originalBytes, decrypted);
    console.log("  plaintext byte-equal:", plaintextMatch ? "OK" : "MISMATCH");
    console.log("  decrypted bytes:", decrypted.byteLength);

    if (!blobIdMatch || !nameMatch || !keyMatch || !uploadDownloadMatch || !plaintextMatch) {
      allOk = false;
    }
  }

  console.log("\n=== ZFILE1 backward compat (single file via buildFileMemo) ===");
  const single = encryptedEntries[0];
  const singleMemo = buildFileMemo({
    blobId: single.blobId,
    keyBytes: single.encrypted.keyBytes,
    fileName: single.fixture.name,
    caption: "single-file compat",
  });
  const singleParsed = parseFileMemo(singleMemo);
  console.log("  ZFILE1 parse ok:", singleParsed !== null);
  console.log("  ZFILE1 format:", singleParsed?.format);
  console.log("  ZFILE1 file count:", singleParsed?.files.length);
  console.log(
    "  ZFILE1 blob_id matches:",
    singleParsed?.blobId === single.blobId
  );

  cleanup();

  console.log("\n=== SUMMARY ===");
  console.log("blob_ids:");
  for (const entry of encryptedEntries) {
    console.log(`  ${entry.fixture.name}: ${entry.blobId}`);
  }
  console.log("round-trip byte-equal for all files:", allOk ? "YES" : "NO");

  if (!allOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  cleanup();
  console.error(err);
  process.exit(1);
});
