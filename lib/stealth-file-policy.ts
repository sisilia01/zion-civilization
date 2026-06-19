export const STEALTH_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const STEALTH_FILE_LARGE_WARN_BYTES = 10 * 1024 * 1024;

/** Executable/installer extensions blocked explicitly; everything else is allowed. */
export const STEALTH_FILE_DENIED_EXTENSIONS = new Set([
  "exe",
  "sh",
  "bat",
  "cmd",
  "com",
  "scr",
  "ps1",
  "vbs",
  "app",
  "dmg",
  "msi",
  "jar",
  "deb",
  "rpm",
  "apk",
  "appimage",
  "run",
  "bin",
]);

export function getStealthFileExtension(fileName: string): string {
  const parts = String(fileName || "").trim().split(".");
  if (parts.length < 2) return "";
  return parts.pop()?.toLowerCase() || "";
}

export function isStealthFileExtensionAllowed(fileName: string): boolean {
  const ext = getStealthFileExtension(fileName);
  if (!ext) return true;
  return !STEALTH_FILE_DENIED_EXTENSIONS.has(ext);
}

export function formatStealthFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function validateStealthAttachmentFile(
  file: File
): { ok: true; largeFile: boolean } | { ok: false; error: string } {
  return validateStealthAttachmentFileForBatch(file, 0);
}

/** Validate a file against cumulative batch size (50 MB total across all attachments). */
export function validateStealthAttachmentFileForBatch(
  file: File,
  existingTotalBytes: number
): { ok: true; largeFile: boolean } | { ok: false; error: string } {
  if (!isStealthFileExtensionAllowed(file.name)) {
    const ext = getStealthFileExtension(file.name);
    return {
      ok: false,
      error: ext
        ? `File type .${ext} is not allowed (executable/installer formats are blocked).`
        : "This file type is not allowed.",
    };
  }

  const newTotal = existingTotalBytes + file.size;
  if (newTotal > STEALTH_FILE_MAX_BYTES) {
    return {
      ok: false,
      error: `Total size would exceed ${formatStealthFileSize(STEALTH_FILE_MAX_BYTES)} (${formatStealthFileSize(newTotal)} with "${file.name}"). Remove a file or pick a smaller one.`,
    };
  }

  return {
    ok: true,
    largeFile: file.size > STEALTH_FILE_LARGE_WARN_BYTES,
  };
}

export function sumStealthAttachmentBytes(files: Array<{ size: number }>): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function stealthFileTypeIcon(fileName: string): string {
  const ext = getStealthFileExtension(fileName);
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return "🖼";
  if (ext === "pdf") return "📄";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽";
  if (ext === "json") return "{ }";
  if (ext === "txt") return "📃";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "🎬";
  if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) return "🎵";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜";
  return "📎";
}
