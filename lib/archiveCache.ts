const ARCHIVE_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEnvelope<T> = {
  data: T;
  ts: number;
};

function readEnvelope<T>(key: string): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.ts !== "number" || parsed.data === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readArchiveCache<T>(key: string): T | null {
  const envelope = readEnvelope<T>(key);
  if (!envelope) return null;
  if (Date.now() - envelope.ts > ARCHIVE_CACHE_TTL_MS) return null;
  return envelope.data;
}

export function readArchiveStaleCache<T>(key: string): T | null {
  return readEnvelope<T>(key)?.data ?? null;
}

export function writeArchiveCache<T>(key: string, data: T): void {
  try {
    const envelope: CacheEnvelope<T> = { data, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota / private mode */
  }
}

export const ARCHIVE_CACHE_KEYS = {
  reports: "zion_archive_reports_v1",
  tracks: "zion_archive_tracks_v1",
  periods: "zion_archive_periods_v1",
  documents: (week: string) => `zion_archive_documents_v1:${week}`,
} as const;
