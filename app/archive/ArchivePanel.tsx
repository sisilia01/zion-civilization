"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

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
  zip_download_url?: string;
  zip_filename: string;
  files: ArchiveFile[];
  created_at: string;
};

type TrackInfo = { track: string; book_count: number };

type Schedule = {
  next_weekly_at?: string;
  next_monthly_at?: string;
  next_annual_at?: string;
};

const colStyle: CSSProperties = {
  flex: "1 1 280px",
  background: "rgba(8, 18, 36, 0.85)",
  border: "1px solid #1e3a5f",
  borderRadius: "6px",
  padding: "16px",
  minWidth: "260px",
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

function periodLabel(r: ArchiveReport | undefined, type: string): string {
  if (!r) {
    if (type === "weekly") return "No report yet";
    if (type === "monthly") return "No report yet";
    return "Not yet";
  }
  if (type === "weekly") return `Week ${r.week_number}, ${r.year_number}`;
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
  notYet,
}: {
  title: string;
  report: ArchiveReport | undefined;
  nextAt?: string;
  notYet?: boolean;
}) {
  const files = report?.files ?? [];
  const zipHref = report?.zip_download_url
    ? `/api/archive/download/zip?report_id=${report.id}`
    : undefined;

  return (
    <div style={colStyle}>
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
      <div style={{ fontSize: "12px", marginBottom: "12px", minHeight: "120px" }}>
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
      {zipHref ? (
        <a
          href={zipHref}
          download={report?.zip_filename ?? "zion_archive.zip"}
          style={{
            display: "inline-block",
            background: "rgba(0, 180, 216, 0.15)",
            border: "1px solid #00b4d8",
            color: "#00b4d8",
            padding: "8px 12px",
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: "10px",
            letterSpacing: "0.08em",
            textDecoration: "none",
            marginBottom: "8px",
          }}
        >
          DOWNLOAD ZIP
        </a>
      ) : notYet ? (
        <div style={{ fontSize: "11px", color: "#64748b", fontFamily: '"IBM Plex Mono", monospace' }}>
          NEXT: {formatDate(nextAt)}
        </div>
      ) : (
        <div style={{ fontSize: "11px", color: "#64748b" }}>(not yet)</div>
      )}
      {report?.walrus_url && (
        <a
          href={report.walrus_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "10px",
            color: "#64748b",
            marginTop: "6px",
            fontFamily: '"IBM Plex Mono", monospace',
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Walrus: {truncateBlob(report.walrus_blob_id ?? "")} ↗
        </a>
      )}
    </div>
  );
}

export default function ArchivePanel() {
  const [reports, setReports] = useState<ArchiveReport[]>([]);
  const [schedule, setSchedule] = useState<Schedule>({});
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracksOpen, setTracksOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [repRes, trkRes] = await Promise.all([
        fetch("/api/archive/reports", { cache: "no-store" }),
        fetch("/api/archive/tracks", { cache: "no-store" }),
      ]);
      if (repRes.ok) {
        const d = await repRes.json();
        setReports(Array.isArray(d.reports) ? d.reports : []);
        setSchedule(d.schedule ?? {});
      }
      if (trkRes.ok) {
        const d = await trkRes.json();
        setTracks(Array.isArray(d.tracks) ? d.tracks : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const latest = (type: string) => reports.find((r) => r.report_type === type);
  const totalTracks = tracks.length;

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

      <div
        style={{
          marginBottom: "24px",
          border: "1px solid #1e3a5f",
          borderRadius: "6px",
          background: "rgba(8, 18, 36, 0.65)",
        }}
      >
        <button
          type="button"
          onClick={() => setTracksOpen((o) => !o)}
          style={{
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            color: "#00b4d8",
            padding: "12px 16px",
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: "11px",
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          [{tracksOpen ? "▼" : "▶"}] {totalTracks} RESEARCH TRACKS DISCOVERED
        </button>
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
      </div>

      {loading && <p style={{ color: "#64748b" }}>Loading archive…</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        <ReportColumn title="WEEKLY" report={latest("weekly")} nextAt={schedule.next_weekly_at} />
        <ReportColumn title="MONTHLY" report={latest("monthly")} nextAt={schedule.next_monthly_at} />
        <ReportColumn
          title="ANNUAL"
          report={latest("annual")}
          nextAt={schedule.next_annual_at}
          notYet={!latest("annual")}
        />
      </div>
    </section>
  );
}
