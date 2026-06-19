const STEALTH_FILE_MAGIC = new Uint8Array([0x5a, 0x46, 0x49, 0x31]); // ZFI1

export type StealthFileEncryptionResult = {
  /** Bytes stored on Walrus: magic + iv + AES-GCM ciphertext */
  packedCiphertext: Uint8Array;
  /** Raw 256-bit AES key — kept in memory until memo is built */
  keyBytes: Uint8Array;
  iv: Uint8Array;
  originalName: string;
  originalSize: number;
  mimeType: string;
};

function assertSubtleCrypto(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto API is unavailable in this environment");
  }
  return crypto.subtle;
}

export async function encryptStealthFile(file: File | Blob, fileName: string): Promise<StealthFileEncryptionResult> {
  const subtle = assertSubtleCrypto();
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const keyBytes = new Uint8Array(await subtle.exportKey("raw", key));

  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );

  const packedCiphertext = new Uint8Array(STEALTH_FILE_MAGIC.length + iv.length + ciphertext.length);
  packedCiphertext.set(STEALTH_FILE_MAGIC, 0);
  packedCiphertext.set(iv, STEALTH_FILE_MAGIC.length);
  packedCiphertext.set(ciphertext, STEALTH_FILE_MAGIC.length + iv.length);

  return {
    packedCiphertext,
    keyBytes,
    iv,
    originalName: fileName,
    originalSize: plaintext.byteLength,
    mimeType: file instanceof File && file.type ? file.type : "application/octet-stream",
  };
}

export async function decryptStealthFilePacked(
  packedCiphertext: Uint8Array,
  keyBytes: Uint8Array
): Promise<Uint8Array> {
  const subtle = assertSubtleCrypto();
  if (
    packedCiphertext.length < STEALTH_FILE_MAGIC.length + 12 + 16 ||
    !STEALTH_FILE_MAGIC.every((byte, index) => packedCiphertext[index] === byte)
  ) {
    throw new Error("Invalid stealth encrypted file blob (bad magic header)");
  }

  const iv = packedCiphertext.slice(STEALTH_FILE_MAGIC.length, STEALTH_FILE_MAGIC.length + 12);
  const ciphertext = packedCiphertext.slice(STEALTH_FILE_MAGIC.length + 12);
  const key = await subtle.importKey(
    "raw",
    keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
