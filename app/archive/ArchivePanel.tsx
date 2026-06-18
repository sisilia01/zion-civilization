"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import {
  ARCHIVE_CACHE_KEYS,
  readArchiveCache,
  readArchiveStaleCache,
  writeArchiveCache,
} from "@/lib/archiveCache";
import { ArchivePeriodFilter } from "./ArchivePeriodFilter";
import { ArchiveSkeletonGrid } from "./ArchiveSkeleton";

type ArchiveFile = {
  track: string;
  filename: string;
  download_url?: string;
  download_filename?: string;
  walrus_url?: string;
};

type ArchiveReport = {
  id: number;
  report_type: string;
  week_number: number | null;
  month_number: number | null;
  year_number: number | null;
  walrus_blob_id: string | null;
  walrus_url?: string;
  files: ArchiveFile[];
  created_at: string;
};

type TrackInfo = { track: string; book_count: number };

type Schedule = {
  next_weekly_at?: string;
  next_monthly_at?: string;
  next_annual_at?: string;
};

const panelShellStyle: CSSProperties = {
  flex: "1 1 280px",
  minWidth: "260px",
  alignSelf: "stretch",
  border: "1px solid #1e3a5f",
  borderRadius: "6px",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
};

const nextFooterStyle: CSSProperties = {
  borderTop: "1px solid rgba(148, 163, 184, 0.2)",
  paddingTop: "10px",
  fontSize: "11px",
  color: "#64748b",
  fontFamily: '"IBM Plex Mono", monospace',
};

const tracksPanelStyle: CSSProperties = {
  marginBottom: "24px",
  border: "1px solid #1e3a5f",
  borderRadius: "6px",
  padding: 0,
  overflow: "hidden",
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  background: "rgba(0, 180, 216, 0.12)",
  border: "1px solid rgba(0, 180, 216, 0.35)",
  color: "#00b4d8",
  padding: "4px 10px",
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: "10px",
  letterSpacing: "0.06em",
  margin: "4px",
};

const fileLinkStyle: CSSProperties = {
  display: "block",
  color: "#94a3b8",
  textDecoration: "none",
  marginBottom: "6px",
  cursor: "pointer",
};

function truncateBlob(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatWeekRange(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = local.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(local);
  start.setDate(local.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const part = (dt: Date) =>
    dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${part(start)} – ${part(end)}, ${end.getFullYear()}`;
}

function periodLabel(r: ArchiveReport | undefined, type: string): string {
  if (!r) {
    if (type === "weekly") return "No report yet";
    if (type === "monthly") return "No report yet";
    return "Not yet";
  }
  if (type === "weekly") return formatWeekRange(r.created_at);
  if (type === "monthly") {
    const m = r.month_number ?? 1;
    const y = r.year_number ?? new Date().getFullYear();
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return `Year ${r.year_number}`;
}

function trackLabel(track: string): string {
  return track === "full_report" ? "full_report" : track.toLowerCase();
}

function ReportColumn({
  title,
  report,
  nextAt,
}: {
  title: string;
  report: ArchiveReport | undefined;
  nextAt?: string;
}) {
  const files = report?.files ?? [];
  const showNext = !report && Boolean(nextAt);

  return (
    <GlassCard className={glassCardStyles.glassCard} style={panelShellStyle}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: "100%",
          justifyContent: showNext ? "space-between" : "flex-start",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: "11px",
              letterSpacing: "0.12em",
              color: "#00b4d8",
              marginBottom: "8px",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "14px", color: "#f1f5f9", marginBottom: "12px" }}>
            {periodLabel(report, title.toLowerCase())}
          </div>
          <div style={{ fontSize: "12px", marginBottom: "12px", minHeight: showNext ? undefined : "120px" }}>
            {files.length === 0 ? (
              <span style={{ color: "#64748b" }}>—</span>
            ) : (
              files.map((f) => {
                const label = trackLabel(f.track);
                const href = f.download_url
                  ? `/api/archive/download?report_id=${report?.id}&track=${encodeURIComponent(f.track.toLowerCase())}`
                  : undefined;
                const filename = f.download_filename ?? `${label}.txt`;
                return href ? (
                  <a
                    key={`${f.track}-${f.filename}`}
                    href={href}
                    download={filename}
                    style={fileLinkStyle}
                  >
                    📄 {label}
                  </a>
                ) : (
                  <div key={`${f.track}-${f.filename}`} style={{ ...fileLinkStyle, cursor: "default" }}>
                    📄 {label}
                  </div>
                );
              })
            )}
          </div>
          {report?.walrus_url && (
            <a
              href={report.walrus_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "13px",
                color: "#64748b",
                fontFamily: '"IBM Plex Mono", monospace',
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Walrus: {truncateBlob(report.walrus_blob_id ?? "")} ↗
            </a>
          )}
        </div>
        {showNext ? <div style={nextFooterStyle}>NEXT: {formatDate(nextAt)}</div> : null}
      </div>
    </GlassCard>
  );
}

type ReportsPayload = {
  reports: ArchiveReport[];
  schedule: Schedule;
};

type TracksPayload = {
  tracks: TrackInfo[];
};

export default function ArchivePanel() {
  const [reports, setReports] = useState<ArchiveReport[]>(() => {
    const cached = readArchiveStaleCache<ReportsPayload>(ARCHIVE_CACHE_KEYS.reports);
    return cached?.reports ?? [];
  });
  const [schedule, setSchedule] = useState<Schedule>(() => {
    const cached = readArchiveStaleCache<ReportsPayload>(ARCHIVE_CACHE_KEYS.reports);
    return cached?.schedule ?? {};
  });
  const [tracks, setTracks] = useState<TrackInfo[]>(() => {
    const cached = readArchiveStaleCache<TracksPayload>(ARCHIVE_CACHE_KEYS.tracks);
    return cached?.tracks ?? [];
  });
  const [reportsLoading, setReportsLoading] = useState(() => !readArchiveCache(ARCHIVE_CACHE_KEYS.reports));
  const [tracksLoading, setTracksLoading] = useState(() => !readArchiveCache(ARCHIVE_CACHE_KEYS.tracks));
  const [tracksOpen, setTracksOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [filteredReports, setFilteredReports] = useState<ArchiveReport[] | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const repRes = await fetch("/api/archive/reports");
      if (repRes.ok) {
        const d = (await repRes.json()) as ReportsPayload;
        const nextReports = Array.isArray(d.reports) ? d.reports : [];
        const nextSchedule = d.schedule ?? {};
        setReports(nextReports);
        setSchedule(nextSchedule);
        writeArchiveCache(ARCHIVE_CACHE_KEYS.reports, {
          reports: nextReports,
          schedule: nextSchedule,
        });
      }
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const loadTracks = useCallback(async () => {
    try {
      const trkRes = await fetch("/api/archive/tracks");
      if (trkRes.ok) {
        const d = (await trkRes.json()) as TracksPayload;
        const nextTracks = Array.isArray(d.tracks) ? d.tracks : [];
        setTracks(nextTracks);
        writeArchiveCache(ARCHIVE_CACHE_KEYS.tracks, { tracks: nextTracks });
      }
    } finally {
      setTracksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
    const refresh = setInterval(loadReports, 5 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [loadReports]);

  useEffect(() => {
    loadTracks();
    const refresh = setInterval(loadTracks, 5 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [loadTracks]);

  useEffect(() => {
    if (!selectedWeek) {
      setFilteredReports(null);
      return;
    }

    const cacheKey = ARCHIVE_CACHE_KEYS.documents(selectedWeek);
    const stale = readArchiveStaleCache<ArchiveReport[]>(cacheKey);
    setFilteredReports(stale ?? null);

    const hasFresh = Boolean(readArchiveCache(cacheKey));
    setFilterLoading(!hasFresh);

    fetch(`/api/archive/documents?week=${encodeURIComponent(selectedWeek)}`)
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((data) => {
        const docs = Array.isArray(data.documents) ? data.documents : [];
        setFilteredReports(docs);
        writeArchiveCache(cacheKey, docs);
      })
      .catch(() => setFilteredReports(stale ?? []))
      .finally(() => setFilterLoading(false));
  }, [selectedWeek]);

  const displayReports = filteredReports ?? reports;
  const latest = (type: string) => displayReports.find((r) => r.report_type === type);
  const totalTracks = tracks.length;
  const showSkeleton =
    (reportsLoading && reports.length === 0) || (filterLoading && selectedWeek != null && !filteredReports?.length);

  return (
    <section
      aria-label="Civilization Archive"
      style={{ position: "relative", zIndex: 2, color: "#e2e8f0", padding: "8px 0 24px" }}
    >
      <h2
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: "22px",
          letterSpacing: "0.12em",
          color: "#f8fafc",
          margin: "0 0 8px",
        }}
      >
        CIVILIZATION ARCHIVE
      </h2>
      <p style={{ color: "#94a3b8", fontSize: "15px", margin: "0 0 16px" }}>
        Complete historical record preserved on Walrus
      </p>

      <GlassCard className={glassCardStyles.glassCard} style={tracksPanelStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "12px 16px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setTracksOpen((o) => !o)}
            style={{
              flex: "1 1 auto",
              textAlign: "left",
              background: "transparent",
              border: "none",
              color: "#00b4d8",
              padding: 0,
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: "11px",
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            [{tracksOpen ? "▼" : "▶"}] {tracksLoading && totalTracks === 0 ? "…" : totalTracks} RESEARCH TRACKS DISCOVERED
          </button>
          <ArchivePeriodFilter selectedWeek={selectedWeek} onSelectWeek={setSelectedWeek} />
        </div>
        {tracksOpen && (
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ marginBottom: "8px" }}>
              {tracks.map((t) => (
                <span key={t.track} style={badgeStyle} title={`${t.book_count} books`}>
                  {t.track} {t.book_count}
                </span>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic", margin: 0 }}>
              New tracks appear automatically when new books are added
            </p>
          </div>
        )}
      </GlassCard>

      {selectedWeek && !filterLoading && filteredReports?.length === 0 && (
        <p style={{ color: "#64748b", fontFamily: '"IBM Plex Mono", monospace', fontSize: "11px" }}>
          No documents for selected week.
        </p>
      )}

      {showSkeleton ? (
        <ArchiveSkeletonGrid />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "stretch" }}>
          <ReportColumn title="WEEKLY" report={latest("weekly")} nextAt={schedule.next_weekly_at} />
          <ReportColumn title="MONTHLY" report={latest("monthly")} nextAt={schedule.next_monthly_at} />
          <ReportColumn
            title="ANNUAL"
            report={latest("annual")}
            nextAt={schedule.next_annual_at}
          />
        </div>
      )}
    </section>
  );
}
