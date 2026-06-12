"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { EnglishEntry, GlyphMap, Stats, ZionEntry } from "./types";
import {
  buildTransliterationMaps,
  prepareGlyphSvgs,
  timeToGlyphText,
  translitToZion,
  type TransliterationMaps,
} from "./zionTransliterate";

const CHAR_MS = 15;
const PAUSE_AFTER_MS = 3_000;
const FEED_LIMIT = 30;
const FEED_REFRESH_MS = 120_000;

const mono = '"IBM Plex Mono", monospace';

const statsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px 20px",
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.08em",
  color: "#00b4d8",
  marginBottom: "24px",
};

const tableShellStyle: CSSProperties = {
  background: "#0a1628",
  border: "1px solid #1e3a5f",
  borderRadius: "4px",
  overflow: "hidden",
  flex: "1 1 320px",
  minWidth: 0,
};

const tableHeadStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.12em",
  color: "#00b4d8",
  padding: "12px 14px",
  borderBottom: "1px solid #1e3a5f",
  background: "rgba(0, 180, 216, 0.06)",
};

const screenStyle: CSSProperties = {
  minHeight: "300px",
  padding: "20px 18px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  fontFamily: mono,
  color: "#e2e8f0",
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  background: "rgba(0, 180, 216, 0.12)",
  border: "1px solid rgba(0, 180, 216, 0.35)",
  color: "#00b4d8",
  padding: "2px 6px",
  fontSize: "9px",
  letterSpacing: "0.08em",
  borderRadius: "2px",
  marginLeft: "8px",
};

const undecodableStyle: CSSProperties = {
  fontSize: "9px",
  letterSpacing: "0.14em",
  color: "#00b4d8",
  marginTop: "14px",
  opacity: 0.85,
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function glyphKey(id: number): string {
  return String(id).padStart(2, "0");
}

function TypewriterText({
  text,
  active,
  onComplete,
}: {
  text: string;
  active: boolean;
  onComplete?: () => void;
}) {
  const [visibleLen, setVisibleLen] = useState(active ? 0 : text.length);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setVisibleLen(active ? 0 : text.length);
    completedRef.current = false;
  }, [text, active]);

  useEffect(() => {
    if (!active) return;

    if (text.length === 0) {
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisibleLen(i);
      if (i >= text.length) {
        clearInterval(interval);
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      }
    }, CHAR_MS);

    return () => clearInterval(interval);
  }, [active, text]);

  return (
    <span style={{ lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
      {text.slice(0, visibleLen)}
      {active && visibleLen < text.length && (
        <span style={{ color: "#00b4d8", marginLeft: "1px" }}>|</span>
      )}
    </span>
  );
}

function glyphIdsToTokens(glyphIds: number[]): string {
  return glyphIds.map((id) => `Z${glyphKey(id)}`).join(" ");
}

const glyphLineStyle: CSSProperties = {
  position: "relative",
  userSelect: "text",
  WebkitUserSelect: "text",
  minHeight: "28px",
};

const glyphTokenOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  userSelect: "text",
  WebkitUserSelect: "text",
  fontFamily: mono,
  fontSize: "11px",
  lineHeight: "28px",
  whiteSpace: "pre-wrap",
  overflow: "hidden",
  zIndex: 0,
};

function GlyphRow({ glyphIds, glyphs }: { glyphIds: number[]; glyphs: GlyphMap }) {
  if (glyphIds.length === 0) return null;
  const tokens = glyphIdsToTokens(glyphIds);
  return (
    <div className="zlabGlyphLine" style={glyphLineStyle}>
      <span className="zlabGlyphTokens" style={glyphTokenOverlayStyle}>
        {tokens}
      </span>
      <span
        className="zlabGlyphRow"
        aria-hidden="true"
        style={{
          position: "relative",
          zIndex: 1,
          display: "inline-flex",
          flexWrap: "wrap",
          gap: "4px",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {glyphIds.map((id, idx) => {
          const svg = glyphs[glyphKey(id)];
          if (!svg) return null;
          return (
            <span
              key={`${id}-${idx}`}
              className="zlabGlyphInline"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          );
        })}
      </span>
    </div>
  );
}

function EnglishScreen({
  entry,
  cycleKey,
  onCycleComplete,
}: {
  entry: EnglishEntry;
  cycleKey: number;
  onCycleComplete: () => void;
}) {
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTypingComplete = useCallback(() => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      onCycleComplete();
    }, PAUSE_AFTER_MS);
  }, [onCycleComplete]);

  useEffect(() => {
    return () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
    };
  }, []);

  return (
    <div style={screenStyle}>
      <div style={{ marginBottom: "10px", color: "#00b4d8", fontSize: "11px" }}>
        <span>{entry.agent_name}</span>
        {entry.topic && <span style={badgeStyle}>{entry.topic}</span>}
      </div>
      <div style={{ color: "#f1f5f9", fontSize: "13px", flex: 1 }}>
        <TypewriterText
          key={cycleKey}
          text={entry.thought_text}
          active
          onComplete={handleTypingComplete}
        />
      </div>
      <div style={{ color: "#64748b", fontSize: "10px", marginTop: "16px" }}>
        {formatTime(entry.created_at)}
      </div>
    </div>
  );
}

function ZionScreen({
  entry,
  glyphs,
  translitMaps,
}: {
  entry: ZionEntry;
  glyphs: GlyphMap;
  translitMaps: TransliterationMaps | null;
}) {
  const timeGlyphs =
    translitMaps && entry.created_at
      ? translitToZion(timeToGlyphText(entry.created_at), translitMaps)
      : [];

  return (
    <div style={{ ...screenStyle, userSelect: "text", WebkitUserSelect: "text" }}>
      <div style={{ marginBottom: "12px" }}>
        <GlyphRow glyphIds={entry.name_glyphs} glyphs={glyphs} />
      </div>
      <div style={{ marginBottom: "12px" }}>
        <GlyphRow glyphIds={entry.text_glyphs} glyphs={glyphs} />
      </div>
      <div style={{ marginBottom: "12px" }}>
        <GlyphRow glyphIds={entry.number_glyphs} glyphs={glyphs} />
      </div>
      {timeGlyphs.length > 0 && (
        <div style={{ marginBottom: "4px" }}>
          <GlyphRow glyphIds={timeGlyphs} glyphs={glyphs} />
        </div>
      )}
      <div style={undecodableStyle}>UNDECODABLE — SEED REQUIRED</div>
    </div>
  );
}

export default function ZLabPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [glyphs, setGlyphs] = useState<GlyphMap>({});
  const [translitMaps, setTranslitMaps] = useState<TransliterationMaps | null>(null);
  const [englishQueue, setEnglishQueue] = useState<EnglishEntry[]>([]);
  const [zionQueue, setZionQueue] = useState<ZionEntry[]>([]);
  const [enIndex, setEnIndex] = useState(0);
  const [zionIndex, setZionIndex] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/language/glyphs", { cache: "force-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.glyphs && typeof data.glyphs === "object") {
          setGlyphs(prepareGlyphSvgs(data.glyphs as GlyphMap));
        }
      })
      .catch(() => {});

    buildTransliterationMaps()
      .then(setTranslitMaps)
      .catch(() => {});
  }, []);

  const loadFeeds = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, englishRes, zionRes] = await Promise.all([
        fetch("/api/zlab/stats", { cache: "no-store" }),
        fetch(`/api/language/feed/english?limit=${FEED_LIMIT}`, { cache: "no-store" }),
        fetch(`/api/language/feed/zion?limit=${FEED_LIMIT}`, { cache: "no-store" }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());

      if (englishRes.ok) {
        const data = await englishRes.json();
        setEnglishQueue(Array.isArray(data.entries) ? data.entries : []);
      } else {
        setError(`English feed failed (${englishRes.status})`);
      }

      if (zionRes.ok) {
        const data = await zionRes.json();
        setZionQueue(Array.isArray(data.entries) ? data.entries : []);
      } else {
        setError((prev) => prev ?? `ZION feed failed (${zionRes.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load language feeds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeeds();
    const refresh = setInterval(loadFeeds, FEED_REFRESH_MS);
    return () => clearInterval(refresh);
  }, [loadFeeds]);

  const advanceCycle = useCallback(() => {
    setEnIndex((i) => (englishQueue.length ? (i + 1) % englishQueue.length : 0));
    setZionIndex((i) => (zionQueue.length ? (i + 1) % zionQueue.length : 0));
    setCycleKey((k) => k + 1);
  }, [englishQueue.length, zionQueue.length]);

  const currentEnglish = englishQueue.length ? englishQueue[enIndex % englishQueue.length] : null;
  const currentZion = zionQueue.length ? zionQueue[zionIndex % zionQueue.length] : null;

  return (
    <section
      className="zlabPanelRoot"
      aria-label="Z-LAB Language Observatory"
      style={{ position: "relative", zIndex: 2, color: "#e2e8f0", padding: "8px 0 32px" }}
    >
      <style>{`
        .zlabDualFeed {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        @media (min-width: 900px) {
          .zlabDualFeed {
            flex-direction: row;
            align-items: stretch;
          }
        }
        .zlabGlyphInline {
          display: inline-block;
          height: 28px;
          line-height: 0;
        }
        .zlabGlyphInline svg {
          display: inline-block;
          height: 28px;
          width: auto;
          vertical-align: middle;
        }
        .zlabGlyphLine {
          user-select: text;
          -webkit-user-select: text;
        }
        .zlabGlyphTokens {
          user-select: text;
          -webkit-user-select: text;
        }
      `}</style>

      <h2
        style={{
          fontFamily: mono,
          fontSize: "22px",
          letterSpacing: "0.12em",
          color: "#f8fafc",
          margin: "0 0 8px",
        }}
      >
        Z-LAB — ZION RESEARCH INSTITUTE
      </h2>
      <p style={{ color: "#94a3b8", fontSize: "15px", margin: "0 0 20px" }}>
        Live agent language transmission — English observations vs encoded ZION glyphs
      </p>

      {stats && (
        <div style={statsStyle}>
          <span>ACTIVE RESEARCHERS: {stats.active_researchers}</span>
          <span>OBSERVATIONS THIS WEEK: {stats.observations_this_week}</span>
          <span>REPORTS ON WALRUS: {stats.reports_on_walrus}</span>
        </div>
      )}

      {error && (
        <p style={{ color: "#f87171", fontSize: "14px", marginBottom: "12px" }}>{error}</p>
      )}

      {loading && englishQueue.length === 0 && (
        <p style={{ color: "#64748b", fontSize: "15px", padding: "24px 0" }}>
          Loading language feeds…
        </p>
      )}

      {!loading && englishQueue.length === 0 && zionQueue.length === 0 && !error && (
        <p style={{ color: "#64748b", fontSize: "15px", padding: "24px 0" }}>
          No transmissions yet. Agent thoughts appear after the next watchdog cycle.
        </p>
      )}

      {(englishQueue.length > 0 || zionQueue.length > 0) && (
        <div className="zlabDualFeed">
          <div style={tableShellStyle}>
            <div style={tableHeadStyle}>OBSERVATIONS (EN)</div>
            {currentEnglish ? (
              <EnglishScreen
                key={`en-${cycleKey}-${enIndex}`}
                entry={currentEnglish}
                cycleKey={cycleKey}
                onCycleComplete={advanceCycle}
              />
            ) : (
              <div style={{ ...screenStyle, color: "#64748b" }}>Awaiting observation…</div>
            )}
          </div>

          <div style={tableShellStyle}>
            <div style={tableHeadStyle}>ZION TRANSMISSION (UNDECODABLE)</div>
            {currentZion && Object.keys(glyphs).length > 0 ? (
              <ZionScreen
                key={`zion-${cycleKey}-${zionIndex}`}
                entry={currentZion}
                glyphs={glyphs}
                translitMaps={translitMaps}
              />
            ) : (
              <div style={{ ...screenStyle, color: "#64748b" }}>Awaiting transmission…</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
