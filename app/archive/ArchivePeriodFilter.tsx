"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Calendar } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import {
  ARCHIVE_CACHE_KEYS,
  readArchiveCache,
  readArchiveStaleCache,
  writeArchiveCache,
} from "@/lib/archiveCache";

export type ArchivePeriod = {
  week_start: string;
  week_end: string;
  doc_count: number;
};

const mono = '"IBM Plex Mono", monospace';

const triggerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  background: "rgba(0, 180, 216, 0.08)",
  border: "1px solid rgba(0, 180, 216, 0.35)",
  color: "#00b4d8",
  padding: "6px 10px",
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.1em",
  cursor: "pointer",
  borderRadius: "3px",
  flexShrink: 0,
};

const dropdownShell: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  minWidth: "280px",
  maxHeight: "280px",
  overflowY: "auto",
  padding: "8px 0",
  zIndex: 20,
};

function formatWeekLabel(start: string, end: string, count: number): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const part = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${part(s)} – ${part(e)}, ${e.getFullYear()}  (${count} docs)`;
}

type Props = {
  selectedWeek: string | null;
  onSelectWeek: (weekStart: string | null) => void;
};

export function ArchivePeriodFilter({ selectedWeek, onSelectWeek }: Props) {
  const [open, setOpen] = useState(false);
  const [periods, setPeriods] = useState<ArchivePeriod[]>(() => {
    const cached = readArchiveStaleCache<ArchivePeriod[]>(ARCHIVE_CACHE_KEYS.periods);
    return Array.isArray(cached) ? cached : [];
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = readArchiveCache<ArchivePeriod[]>(ARCHIVE_CACHE_KEYS.periods);
    if (cached) {
      setPeriods(cached);
    }

    fetch("/api/archive/periods")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const next = Array.isArray(data) ? data : [];
        setPeriods(next);
        writeArchiveCache(ARCHIVE_CACHE_KEYS.periods, next);
      })
      .catch(() => {
        const stale = readArchiveStaleCache<ArchivePeriod[]>(ARCHIVE_CACHE_KEYS.periods);
        if (stale) setPeriods(stale);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        style={triggerStyle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Calendar size={14} strokeWidth={1.75} aria-hidden />
        BY PERIOD
      </button>
      {open && (
        <GlassCard className={glassCardStyles.glassCard} style={dropdownShell}>
          <button
            type="button"
            onClick={() => {
              onSelectWeek(null);
              setOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              padding: "8px 14px",
              fontFamily: mono,
              fontSize: "11px",
              letterSpacing: "0.04em",
              color: selectedWeek === null ? "#00ff88" : "#94a3b8",
              cursor: "pointer",
            }}
          >
            All periods
          </button>
          {periods.length === 0 ? (
            <div
              style={{
                padding: "8px 14px",
                fontFamily: mono,
                fontSize: "10px",
                color: "#64748b",
              }}
            >
              No periods found
            </div>
          ) : (
            periods.map((p) => {
              const active = selectedWeek === p.week_start;
              return (
                <button
                  key={p.week_start}
                  type="button"
                  onClick={() => {
                    onSelectWeek(p.week_start);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: active ? "rgba(0, 255, 136, 0.08)" : "transparent",
                    border: "none",
                    padding: "8px 14px",
                    fontFamily: mono,
                    fontSize: "11px",
                    letterSpacing: "0.04em",
                    color: active ? "#00ff88" : "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  {formatWeekLabel(p.week_start, p.week_end, p.doc_count)}
                </button>
              );
            })
          )}
        </GlassCard>
      )}
    </div>
  );
}
