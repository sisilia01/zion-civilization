import { decryptStealthFilePacked } from "@/lib/stealth-file-crypto";
import type { StealthFileMemoPayload } from "@/lib/stealth-file-memo";
import { downloadWalrusBytes } from "@/lib/walrus-blob";

export type StealthFileAttachment = {
  blobId: string;
  keyBytes: number[];
  fileName: string;
  caption: string;
  unavailable?: boolean;
};

export function stealthAttachmentsFromMemo(parsed: StealthFileMemoPayload): StealthFileAttachment[] {
  return parsed.files.map((file) => ({
    blobId: file.blobId,
    keyBytes: Array.from(file.keyBytes),
    fileName: file.fileName,
    caption: parsed.caption,
  }));
}

export function flattenNoteFileAttachments(
  note: { memo_files?: StealthFileAttachment[]; memo_file?: StealthFileAttachment }
): StealthFileAttachment[] {
  if (note.memo_files?.length) {
    return note.memo_files.filter((file) => !file.unavailable);
  }
  if (note.memo_file && !note.memo_file.unavailable) {
    return [note.memo_file];
  }
  return [];
}

export function stealthAttachmentKeyBytes(attachment: StealthFileAttachment): Uint8Array {
  return new Uint8Array(attachment.keyBytes);
}

export async function downloadStealthFileAttachment(
  attachment: StealthFileAttachment
): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  try {
    const packed = await downloadWalrusBytes(attachment.blobId);
    const keyBytes = stealthAttachmentKeyBytes(attachment);
    const decrypted = await decryptStealthFilePacked(packed, keyBytes);
    const blob = new Blob([new Uint8Array(decrypted)]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.fileName || "stealth-attachment.bin";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return { ok: true, size: decrypted.byteLength };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatStealthAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
