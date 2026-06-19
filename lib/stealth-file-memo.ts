export const STEALTH_FILE_MEMO_PREFIX = "ZFILE1";
export const STEALTH_FILE_MULTI_MEMO_PREFIX = "ZFILEN";

export type StealthFileMemoEntry = {
  blobId: string;
  keyBytes: Uint8Array;
  fileName: string;
};

export type StealthFileMemoPayload = {
  format: typeof STEALTH_FILE_MEMO_PREFIX | typeof STEALTH_FILE_MULTI_MEMO_PREFIX;
  caption: string;
  files: StealthFileMemoEntry[];
  /** First file — backward compat for single-file callers */
  blobId: string;
  keyBytes: Uint8Array;
  fileName: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function encodePart(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function decodePart(value: string): string {
  return new TextDecoder().decode(base64ToBytes(value));
}

function payloadFromFiles(
  format: StealthFileMemoPayload["format"],
  files: StealthFileMemoEntry[],
  caption: string
): StealthFileMemoPayload {
  const primary = files[0]!;
  return {
    format,
    caption,
    files,
    blobId: primary.blobId,
    keyBytes: primary.keyBytes,
    fileName: primary.fileName,
  };
}

function parseSingleFileMemo(trimmed: string): StealthFileMemoPayload | null {
  if (!trimmed.startsWith(`${STEALTH_FILE_MEMO_PREFIX}|`)) return null;

  const parts = trimmed.split("|");
  if (parts.length !== 5) return null;

  const [, blobId, keyB64, fileNameB64, captionB64] = parts;
  if (!blobId || !keyB64 || !fileNameB64 || captionB64 === undefined) return null;

  try {
    const keyBytes = base64ToBytes(keyB64);
    if (keyBytes.byteLength !== 32) return null;
    const file: StealthFileMemoEntry = {
      blobId,
      keyBytes,
      fileName: decodePart(fileNameB64),
    };
    return payloadFromFiles(STEALTH_FILE_MEMO_PREFIX, [file], decodePart(captionB64));
  } catch {
    return null;
  }
}

function parseMultiFileMemo(trimmed: string): StealthFileMemoPayload | null {
  if (!trimmed.startsWith(`${STEALTH_FILE_MULTI_MEMO_PREFIX}|`)) return null;

  const parts = trimmed.split("|");
  if (parts.length < 5) return null;

  const count = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isFinite(count) || count < 1) return null;

  const expectedLength = 2 + count * 3 + 1;
  if (parts.length !== expectedLength) return null;

  const captionB64 = parts[parts.length - 1];
  if (captionB64 === undefined) return null;

  try {
    const files: StealthFileMemoEntry[] = [];
    for (let i = 0; i < count; i += 1) {
      const base = 2 + i * 3;
      const blobId = parts[base];
      const keyB64 = parts[base + 1];
      const fileNameB64 = parts[base + 2];
      if (!blobId || !keyB64 || !fileNameB64) return null;

      const keyBytes = base64ToBytes(keyB64);
      if (keyBytes.byteLength !== 32) return null;

      files.push({
        blobId,
        keyBytes,
        fileName: decodePart(fileNameB64),
      });
    }

    return payloadFromFiles(STEALTH_FILE_MULTI_MEMO_PREFIX, files, decodePart(captionB64));
  } catch {
    return null;
  }
}

/**
 * Memo plaintext before encryptNote(recipient, memo).
 * Single file: ZFILE1|blobId|keyB64|fileNameB64|captionB64
 */
export function buildFileMemo(params: {
  blobId: string;
  keyBytes: Uint8Array;
  fileName: string;
  caption?: string;
}): string {
  const keyB64 = bytesToBase64(params.keyBytes);
  const fileNameB64 = encodePart(params.fileName);
  const captionB64 = encodePart(params.caption?.trim() || "");
  return [STEALTH_FILE_MEMO_PREFIX, params.blobId, keyB64, fileNameB64, captionB64].join("|");
}

/**
 * Multi-file memo:
 * ZFILEN|{count}|{blobId1}|{key1}|{fileName1}|...|{captionBase64}
 */
export function buildMultiFileMemo(params: {
  files: Array<{ blobId: string; keyBytes: Uint8Array; fileName: string }>;
  caption?: string;
}): string {
  const { files, caption } = params;
  if (!files.length) {
    throw new Error("buildMultiFileMemo requires at least one file");
  }
  if (files.length === 1) {
    return buildFileMemo({ ...files[0]!, caption });
  }

  const parts: string[] = [STEALTH_FILE_MULTI_MEMO_PREFIX, String(files.length)];
  for (const file of files) {
    parts.push(file.blobId, bytesToBase64(file.keyBytes), encodePart(file.fileName));
  }
  parts.push(encodePart(caption?.trim() || ""));
  return parts.join("|");
}

export function parseFileMemo(memo: string): StealthFileMemoPayload | null {
  const trimmed = memo.trim();
  if (trimmed.startsWith(`${STEALTH_FILE_MULTI_MEMO_PREFIX}|`)) {
    return parseMultiFileMemo(trimmed);
  }
  return parseSingleFileMemo(trimmed);
}

export function isStealthFileMemo(memo: string): boolean {
  const trimmed = memo.trim();
  return (
    trimmed.startsWith(`${STEALTH_FILE_MEMO_PREFIX}|`) ||
    trimmed.startsWith(`${STEALTH_FILE_MULTI_MEMO_PREFIX}|`)
  );
}
