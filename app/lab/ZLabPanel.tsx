"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import { ThemeVideo } from "@/components/ThemeVideo";
import { BlackHole } from "./BlackHole";
import { SUBJECTS } from "./subjects";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EnglishEntry, GlyphMap, ResearchStats, Stats, TopBook, ZionEntry } from "./types";
import {
  buildTransliterationMaps,
  prepareGlyphSvgs,
  timeToGlyphText,
  translitToZion,
  type TransliterationMaps,
} from "./zionTransliterate";

const CHAR_MS = 30;
const PAUSE_AFTER_MS = 6_000;
const FEED_LIMIT = 30;
const FEED_REFRESH_MS = 120_000;
const RESEARCH_REFRESH_MS = 30_000;
const TERMINAL_CHAR_MS = 13;
const READING_MS = 3_000;
const TRANSITION_MS = 600;
const FALLBACK_MS = 15_000;

type OcularPhase = "typing" | "reading" | "transitioning";

type KnowledgeReflection = {
  agent_id: number;
  agent_name: string;
  track: string;
  insight: string;
  book_id: number;
};

function sanitizeInsight(text: string): string {
  const bannedTerms = /gutenberg|z-?library|libgen|annas-archive/gi;
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !bannedTerms.test(sentence))
    .join(" ")
    .trim();
}

function buildMoveBlock(r: KnowledgeReflection): string[] {
  const WRAP = 58;
  const words = sanitizeInsight(r.insight).split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > WRAP) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);

  return [
    "module zion::observation_log {",
    "    use zion::knowledge::{Agent, Archive};",
    "",
    `    /// OBSERVER: ${r.agent_name} :: ARCHIVE[${r.track}] :: BOOK_${r.book_id}`,
    `    /// ${"-".repeat(WRAP)}`,
    ...lines.map((l) => `    /// ${l}`),
    `    /// ${"-".repeat(WRAP)}`,
    "",
    "    public fun observe(agent: &Agent): Reflection {",
    `        record(agent, ARCHIVE_${r.book_id})`,
    "    }",
    "}",
  ];
}

const mono = '"IBM Plex Mono", monospace';

const statsGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginBottom: "12px",
  alignItems: "stretch",
};

const tableShellStyle: CSSProperties = {
  border: "1px solid #1e3a5f",
  borderRadius: "4px",
  overflow: "hidden",
  flex: "1 1 320px",
  minWidth: 0,
};

const statCardShellStyle: CSSProperties = {
  ...tableShellStyle,
  padding: "12px 14px",
  flex: "1 1 200px",
  maxWidth: "100%",
};

const statCardTitleStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.1em",
  color: "#00b4d8",
};

const statCardSubtitleStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "9px",
  letterSpacing: "0.06em",
  color: "#64748b",
  lineHeight: 1.45,
  marginTop: "6px",
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
  height: "340px",
  overflow: "hidden",
  position: "relative",
  padding: "20px 18px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  fontFamily: mono,
  color: "#e2e8f0",
};

const languageScreenStyle: CSSProperties = {
  ...screenStyle,
  height: "233px",
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
  position: "absolute",
  bottom: "20px",
  left: "18px",
  fontSize: "9px",
  letterSpacing: "0.14em",
  color: "#00b4d8",
  opacity: 0.85,
};

const transmissionSkeletonStyle: CSSProperties = {
  background: "rgba(0,255,136,0.05)",
  border: "1px solid rgba(0,255,136,0.1)",
  borderRadius: "12px",
  height: "233px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(0,255,136,0.3)",
  fontSize: "11px",
  letterSpacing: "0.2em",
  fontFamily: mono,
  animation: "pulse 1.5s ease-in-out infinite",
};

function TransmissionCardSkeleton({ label }: { label: string }) {
  return (
    <GlassCard className={glassCardStyles.glassCardLab} style={{ ...tableShellStyle, padding: 0 }}>
      <div style={tableHeadStyle}>{label}</div>
      <div style={transmissionSkeletonStyle}>LOADING TRANSMISSIONS...</div>
    </GlassCard>
  );
}


function TopBooksPanel() {
  const [books, setBooks] = useState<TopBook[]>([]);
  const [animateBars, setAnimateBars] = useState(false);

  useEffect(() => {
    fetch("/api/lab/top-books", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TopBook[]) => {
        setBooks(Array.isArray(data) ? data : []);
        requestAnimationFrame(() => setAnimateBars(true));
      })
      .catch(() => setBooks([]));
  }, []);

  const maxCount = books.length ? Math.max(...books.map((b) => b.agent_count), 1) : 1;

  return (
    <GlassCard className={glassCardStyles.glassCardLab} style={{ ...tableShellStyle, padding: 0 }}>
      <div style={tableHeadStyle}>MOST-STUDIED ARCHIVES</div>
      <div style={{ ...screenStyle, padding: "10px 12px 8px", height: "auto", minHeight: "240px" }}>
        {books.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: "10px", fontFamily: mono }}>Loading archives…</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {books.slice(0, 5).map((book, idx) => {
              const rank = idx + 1;
              const targetPct = (book.agent_count / maxCount) * 100;
              return (
                <li
                  key={book.book_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "22px minmax(0, 1fr)",
                    gap: "6px 8px",
                    alignItems: "start",
                  }}
                >
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: "10px",
                      color: "#64748b",
                      letterSpacing: "0.06em",
                      lineHeight: 1.2,
                      paddingTop: "1px",
                    }}
                  >
                    #{rank}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#e2e8f0",
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {book.title}
                    </div>
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#64748b",
                        marginTop: "1px",
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {book.author}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "4px",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: "5px",
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: "2px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          className="topBookBar"
                          style={{
                            height: "100%",
                            width: animateBars ? `${targetPct}%` : "0%",
                            background: "#00ff88",
                            borderRadius: "2px",
                            transition: `width 1.2s ease-out ${rank * 0.1}s`,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontFamily: mono,
                          fontSize: "9px",
                          letterSpacing: "0.08em",
                          color: "#64748b",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {book.agent_count} AGENTS
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function useAnimatedNumber(value: number, duration = 1000): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (Math.abs(from - to) < 0.0001) return;

    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const next = from + (to - from) * easeOutQuad(t);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayRef.current = to;
        setDisplay(to);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return display;
}

function PulseDot({ cx, cy }: { cx: number; cy: number }) {
  return (
    <circle
      className="blinkDot"
      cx={cx}
      cy={cy}
      r={3}
      fill="#00ff88"
      style={{ filter: "drop-shadow(0 0 3px rgba(0, 255, 136, 0.55))" }}
    />
  );
}

function ResearchCharts({ research }: { research: ResearchStats }) {
  const dailyData = research.daily || [];
  const lastDailyEntry = dailyData[dailyData.length - 1];
  const yMax = Math.max(...dailyData.map((d) => d.cumulative_insights), 1) * 1.08;

  const chartTooltipStyle: CSSProperties = {
    background: "#0a1628",
    border: "1px solid #1e3a5f",
    fontFamily: mono,
    fontSize: "10px",
    color: "#e2e8f0",
  };

  return (
    <div className="zlabDualFeed" style={{ marginTop: "20px" }}>
      <GlassCard className={glassCardStyles.glassCardLab} style={{ ...tableShellStyle, padding: 0 }}>
        <div style={tableHeadStyle}>RESEARCH PULSE</div>
        <div style={{ ...screenStyle, padding: "12px 8px 8px" }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <defs>
                  <linearGradient id="pulseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="rgba(100,116,139,0.15)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#475569"
                  tick={{ fontSize: 10, fill: "#64748b", fontFamily: mono }}
                  tickFormatter={(v: string) => (v?.length >= 10 ? v.slice(5) : v)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#475569"
                  tick={{ fontSize: 10, fill: "#64748b", fontFamily: mono }}
                  domain={[0, yMax]}
                  width={42}
                  ticks={[0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax].map((v) => Math.round(v))}
                  tickFormatter={(v: number) => String(v)}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ color: "#00b4d8" }}
                  formatter={(value) => [value, "cumulative insights"]}
                />
                <Area
                  type="step"
                  dataKey="cumulative_insights"
                  stroke="#00ff88"
                  strokeWidth={1.5}
                  fill="url(#pulseGradient)"
                  isAnimationActive
                  animationDuration={1800}
                  animationEasing="ease-out"
                  dot={false}
                  activeDot={false}
                />
                {lastDailyEntry && (
                  <ReferenceDot
                    x={lastDailyEntry.date}
                    y={lastDailyEntry.cumulative_insights}
                    r={0}
                    shape={(props) => (
                      <PulseDot cx={props.cx ?? 0} cy={props.cy ?? 0} />
                    )}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </GlassCard>

      <TopBooksPanel />
    </div>
  );
}

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

function MoveSyntaxText({ text, showCursor = false }: { text: string; showCursor?: boolean }) {
  if (!text) return showCursor ? <span style={{ color: "#00b4d8" }}>|</span> : null;

  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, lineIdx) => {
        if (line.includes("///")) {
          return (
            <span key={`${lineIdx}-${line.length}`}>
              {lineIdx > 0 && "\n"}
              <span style={{ color: "#00ff88" }}>{line}</span>
            </span>
          );
        }
        const commentIdx = line.indexOf("//");
        return (
          <span key={`${lineIdx}-${line.length}`}>
            {lineIdx > 0 && "\n"}
            {commentIdx === -1 ? (
              <span style={{ color: "#00ff88" }}>{line}</span>
            ) : (
              <>
                <span style={{ color: "#00ff88" }}>{line.slice(0, commentIdx)}</span>
                <span style={{ color: "#64748b" }}>{line.slice(commentIdx)}</span>
              </>
            )}
          </span>
        );
      })}
      {showCursor && <span style={{ color: "#00b4d8" }}>|</span>}
    </>
  );
}

function AgentTerminal({
  reflection,
  subjectKey,
  loading,
  unavailable,
  phase,
  onTypingComplete,
}: {
  reflection: KnowledgeReflection | null;
  subjectKey: string;
  loading: boolean;
  unavailable: boolean;
  phase: OcularPhase;
  onTypingComplete: () => void;
}) {
  const [visibleLen, setVisibleLen] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const blockLines = reflection ? buildMoveBlock(reflection) : [];
  const blockText = blockLines.length > 0 ? `${blockLines.join("\n")}\n` : "";

  useEffect(() => {
    setVisibleLen(0);
    completedRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [subjectKey]);

  useEffect(() => {
    if (phase !== "typing" || loading || unavailable || !blockText) return;

    setVisibleLen(0);
    completedRef.current = false;
    let i = 0;

    const interval = setInterval(() => {
      i += 1;
      setVisibleLen(i);
      if (i >= blockText.length) {
        clearInterval(interval);
        intervalRef.current = null;
        if (!completedRef.current) {
          completedRef.current = true;
          onTypingComplete();
        }
      }
    }, TERMINAL_CHAR_MS);
    intervalRef.current = interval;

    return () => {
      clearInterval(interval);
      intervalRef.current = null;
    };
  }, [phase, subjectKey, blockText, loading, unavailable, onTypingComplete]);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );

  const terminalPreStyle: CSSProperties = {
    margin: 0,
    fontSize: "12px",
    fontFamily: mono,
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    flex: 1,
    overflow: "auto",
  };

  if (loading) {
    return (
      <div style={{ ...screenStyle, padding: "16px 14px" }}>
        <pre style={terminalPreStyle}>
          <MoveSyntaxText text="// loading archive..." />
        </pre>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div style={{ ...screenStyle, padding: "16px 14px" }}>
        <pre style={terminalPreStyle}>
          <MoveSyntaxText text="// archive unavailable" />
        </pre>
      </div>
    );
  }

  const displayLen = phase === "typing" ? visibleLen : blockText.length;
  const activeText = blockText.slice(0, displayLen);
  const showCursor = phase === "typing" && visibleLen < blockText.length;

  return (
    <div style={{ ...screenStyle, padding: "16px 14px" }}>
      <pre style={terminalPreStyle}>
        <MoveSyntaxText text={activeText} showCursor={showCursor} />
      </pre>
    </div>
  );
}

function SubjectFeed({ subject }: { subject: (typeof SUBJECTS)[number] }) {
  return (
    <div
      style={{
        ...screenStyle,
        padding: 0,
        overflow: "hidden",
      }}
    >
      {subject.id === "cosmology" ? (
        <BlackHole />
      ) : (
        <ThemeVideo src={subject.videoSrc} />
      )}
    </div>
  );
}

const fadeWrapStyle: CSSProperties = {
  opacity: 1,
  transition: "opacity 0.6s ease",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

function OcularInterfacePanels() {
  const [subjectIndex, setSubjectIndex] = useState(0);
  const [phase, setPhase] = useState<OcularPhase>("typing");
  const [fadeOpacity, setFadeOpacity] = useState(1);
  const subject = SUBJECTS[subjectIndex];
  const [reflectionsCache, setReflectionsCache] = useState<Record<string, KnowledgeReflection[]>>({});
  const [lastGoodReflection, setLastGoodReflection] = useState<KnowledgeReflection | null>(null);
  const fetchedSubjectsRef = useRef<Set<string>>(new Set());
  const readingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDoneRef = useRef(false);

  const handleTypingComplete = useCallback(() => {
    if (typingDoneRef.current) return;
    typingDoneRef.current = true;
    setPhase("reading");
  }, []);

  useEffect(() => {
    if (phase !== "typing") {
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
        typingFallbackRef.current = null;
      }
      return;
    }

    typingDoneRef.current = false;
    typingFallbackRef.current = setTimeout(() => {
      handleTypingComplete();
    }, FALLBACK_MS);

    return () => {
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
        typingFallbackRef.current = null;
      }
    };
  }, [phase, subject.id, handleTypingComplete]);

  useEffect(() => {
    if (phase !== "reading") return;

    if (readingTimerRef.current) clearTimeout(readingTimerRef.current);
    readingTimerRef.current = setTimeout(() => {
      setPhase("transitioning");
    }, READING_MS);

    return () => {
      if (readingTimerRef.current) clearTimeout(readingTimerRef.current);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "transitioning") return;

    setFadeOpacity(0);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      setSubjectIndex((i) => (i + 1) % SUBJECTS.length);
      setFadeOpacity(1);
      setPhase("typing");
    }, TRANSITION_MS);

    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, [phase]);

  useEffect(
    () => () => {
      if (readingTimerRef.current) clearTimeout(readingTimerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (typingFallbackRef.current) clearTimeout(typingFallbackRef.current);
    },
    []
  );

  useEffect(() => {
    if (fetchedSubjectsRef.current.has(subject.id)) return;
    fetchedSubjectsRef.current.add(subject.id);

    fetch(`/api/lab/knowledge-reflections?tracks=${encodeURIComponent(subject.tracks)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: KnowledgeReflection[]) => {
        setReflectionsCache((prev) => ({ ...prev, [subject.id]: data }));
        if (data.length > 0) {
          setLastGoodReflection(data[0]);
        }
      })
      .catch(() => setReflectionsCache((prev) => ({ ...prev, [subject.id]: [] })));
  }, [subject.id, subject.tracks]);

  const currentReflections = reflectionsCache[subject.id];
  const reflectionToShow =
    currentReflections && currentReflections.length > 0
      ? currentReflections[0]
      : lastGoodReflection;
  const showLoading = currentReflections === undefined && !reflectionToShow;
  const unavailable = currentReflections !== undefined && !reflectionToShow;

  return (
    <div className="zlabOcularFeed">
      <GlassCard
        className={`${glassCardStyles.glassCardLab} zlabOcularLeft`}
        style={{ ...tableShellStyle, padding: 0 }}
      >
        <div style={tableHeadStyle}>AGENT_TERMINAL://observation_log.move</div>
        <div style={{ ...fadeWrapStyle, opacity: fadeOpacity }}>
          <AgentTerminal
            reflection={reflectionToShow}
            subjectKey={subject.id}
            loading={showLoading}
            unavailable={unavailable}
            phase={phase}
            onTypingComplete={handleTypingComplete}
          />
        </div>
      </GlassCard>

      <GlassCard
        className={`${glassCardStyles.glassCardLab} zlabOcularRight`}
        style={{ ...tableShellStyle, padding: 0 }}
      >
        <div style={tableHeadStyle}>{subject.title}</div>
        <div style={{ ...fadeWrapStyle, opacity: fadeOpacity }}>
          <SubjectFeed subject={subject} />
        </div>
      </GlassCard>
    </div>
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

function GlyphRow({
  glyphIds,
  glyphs,
  startIndex = 0,
}: {
  glyphIds: number[];
  glyphs: GlyphMap;
  startIndex?: number;
}) {
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
          gap: "var(--glyph-gap, 4px)",
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
              style={{ animationDelay: `${(startIndex + idx) * 60}ms` }}
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

  const textLen = entry.thought_text?.length || 0;
  const fontSize =
    textLen <= 120 ? "16px" :
    textLen <= 200 ? "14px" :
    textLen <= 280 ? "12px" : "11px";

  return (
    <div style={languageScreenStyle}>
      <div style={{ marginBottom: "10px", color: "#00b4d8", fontSize: "11px" }}>
        <span>{entry.agent_name}</span>
        {entry.topic && <span style={badgeStyle}>{entry.topic}</span>}
      </div>
      <div style={{ color: "#f1f5f9", fontSize, lineHeight: 1.5, flex: 1, overflow: "hidden" }}>
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

  let glyphOffset = 0;
  const nameStart = glyphOffset;
  glyphOffset += entry.name_glyphs.length;
  const textStart = glyphOffset;
  glyphOffset += entry.text_glyphs.length;
  const numberStart = glyphOffset;
  glyphOffset += entry.number_glyphs.length;
  const timeStart = glyphOffset;

  const totalGlyphs =
    (entry.name_glyphs?.length || 0) +
    (entry.text_glyphs?.length || 0) +
    (entry.number_glyphs?.length || 0) +
    (timeGlyphs?.length || 0);

  const glyphSize =
    totalGlyphs <= 20 ? 28 :
    totalGlyphs <= 40 ? 22 :
    totalGlyphs <= 70 ? 16 :
    totalGlyphs <= 110 ? 12 : 9;

  const glyphGap = Math.max(2, Math.round(glyphSize / 7));

  return (
    <div
      style={{
        ...languageScreenStyle,
        userSelect: "text",
        WebkitUserSelect: "text",
        "--glyph-size": `${glyphSize}px`,
        "--glyph-gap": `${glyphGap}px`,
      } as CSSProperties}
    >
      <div style={{ marginBottom: "12px" }}>
        <GlyphRow glyphIds={entry.name_glyphs} glyphs={glyphs} startIndex={nameStart} />
      </div>
      <div style={{ marginBottom: "12px" }}>
        <GlyphRow glyphIds={entry.text_glyphs} glyphs={glyphs} startIndex={textStart} />
      </div>
      <div style={{ marginBottom: "12px" }}>
        <GlyphRow glyphIds={entry.number_glyphs} glyphs={glyphs} startIndex={numberStart} />
      </div>
      {timeGlyphs.length > 0 && (
        <div style={{ marginBottom: "4px" }}>
          <GlyphRow glyphIds={timeGlyphs} glyphs={glyphs} startIndex={timeStart} />
        </div>
      )}
      <div style={undecodableStyle}>UNDECODABLE — SEED REQUIRED</div>
    </div>
  );
}

export default function ZLabPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [research, setResearch] = useState<ResearchStats | null>(null);
  const [glyphs, setGlyphs] = useState<GlyphMap>({});
  const [translitMaps, setTranslitMaps] = useState<TransliterationMaps | null>(null);
  const [englishQueue, setEnglishQueue] = useState<EnglishEntry[]>([]);
  const [zionQueue, setZionQueue] = useState<ZionEntry[]>([]);
  const [enIndex, setEnIndex] = useState(0);
  const [zionIndex, setZionIndex] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [wave2Ready, setWave2Ready] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTransmissionFeeds = useCallback(async () => {
    setError(null);
    try {
      const [englishRes, zionRes, glyphsRes] = await Promise.all([
        fetch(`/api/language/feed/english?limit=${FEED_LIMIT}`),
        fetch(`/api/language/feed/zion?limit=${FEED_LIMIT}`),
        fetch("/api/language/glyphs", { cache: "force-cache" }),
      ]);

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

      if (glyphsRes.ok) {
        const data = await glyphsRes.json();
        if (data?.glyphs && typeof data.glyphs === "object") {
          setGlyphs(prepareGlyphSvgs(data.glyphs as GlyphMap));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load language feeds");
    } finally {
      setFeedsLoading(false);
      setWave2Ready(true);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/zlab/stats", { cache: "no-store" });
      if (res.ok) setStats(await res.json());
    } catch {
      /* keep last snapshot */
    }
  }, []);

  const loadResearchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/lab/research-stats", { cache: "no-store" });
      if (res.ok) setResearch(await res.json());
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    buildTransliterationMaps()
      .then(setTranslitMaps)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTransmissionFeeds();
    const refresh = setInterval(loadTransmissionFeeds, FEED_REFRESH_MS);
    return () => clearInterval(refresh);
  }, [loadTransmissionFeeds]);

  useEffect(() => {
    if (!wave2Ready) return;
    loadStats();
    loadResearchStats();
    const statsRefresh = setInterval(loadStats, FEED_REFRESH_MS);
    const researchRefresh = setInterval(loadResearchStats, RESEARCH_REFRESH_MS);
    return () => {
      clearInterval(statsRefresh);
      clearInterval(researchRefresh);
    };
  }, [wave2Ready, loadStats, loadResearchStats]);

  const advanceCycle = useCallback(() => {
    setEnIndex((i) => (englishQueue.length ? (i + 1) % englishQueue.length : 0));
    setZionIndex((i) => (zionQueue.length ? (i + 1) % zionQueue.length : 0));
    setCycleKey((k) => k + 1);
  }, [englishQueue.length, zionQueue.length]);

  const currentEnglish = englishQueue.length ? englishQueue[enIndex % englishQueue.length] : null;
  const currentZion = zionQueue.length ? zionQueue[zionIndex % zionQueue.length] : null;
  const animatedPct = useAnimatedNumber(research?.education_pct ?? 0);
  const animatedLiteracy = useAnimatedNumber(research?.population_literacy_pct ?? 0);

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
        @keyframes blinkDot {
          0%, 49% {
            opacity: 1;
          }
          50%, 100% {
            opacity: 0;
          }
        }
        .blinkDot {
          animation: blinkDot 1s steps(2, jump-none) infinite;
        }
        .topBookBar {
          filter: drop-shadow(0 0 3px rgba(0, 255, 136, 0.55));
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.85; }
        }
        @keyframes zlabLivePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0,255,136,0.6); }
          50% { opacity: 0.4; box-shadow: 0 0 0 4px rgba(0,255,136,0); }
        }
        @keyframes zlabGlyphAppear {
          from {
            opacity: 0;
            transform: translateY(4px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .zlabGlyphInline {
          display: inline-block;
          height: var(--glyph-size, 28px);
          line-height: 0;
          opacity: 0;
          animation: zlabGlyphAppear 0.3s ease-out forwards;
        }
        .zlabGlyphInline svg {
          display: inline-block;
          height: var(--glyph-size, 28px);
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
        .zlabOcularFeed {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 20px;
        }
        @media (min-width: 900px) {
          .zlabOcularFeed {
            flex-direction: row;
            align-items: stretch;
          }
          .zlabOcularLeft {
            flex: 1 1 60%;
            min-width: 0;
          }
          .zlabOcularRight {
            flex: 1 1 40%;
            min-width: 0;
          }
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

      {error && (
        <p style={{ color: "#f87171", fontSize: "14px", marginBottom: "12px" }}>{error}</p>
      )}

      {(research != null || stats) && (
        <div style={statsGridStyle}>
          {research != null && (
            <>
              <GlassCard
                className={glassCardStyles.glassCardLab}
                style={statCardShellStyle}
              >
                <div
                  title="% of all book chunks read at least once"
                  style={{ ...statCardTitleStyle, cursor: "help" }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#00ff88",
                      marginRight: "8px",
                      animation: "zlabLivePulse 2s ease-in-out infinite",
                    }}
                  />
                  CIVILIZATION KNOWLEDGE: {animatedPct.toFixed(2)}% OF LIBRARY
                </div>
              </GlassCard>

              {research.daily && research.daily.length > 0 && (
                <GlassCard
                  className={glassCardStyles.glassCardLab}
                  style={statCardShellStyle}
                >
                  <div style={statCardTitleStyle}>
                    INSIGHTS (14-DAY CUMULATIVE):{" "}
                    <span style={{ color: "#00ff88" }}>
                      {Math.round(research.daily[research.daily.length - 1]?.cumulative_insights ?? 0)}
                    </span>
                  </div>
                </GlassCard>
              )}

              <GlassCard
                className={glassCardStyles.glassCardLab}
                style={statCardShellStyle}
              >
                <div style={statCardTitleStyle}>
                  POPULATION LITERACY: {animatedLiteracy.toFixed(2)}%
                </div>
                <div style={statCardSubtitleStyle}>
                  Average % of library known per citizen — 100% would mean every agent has studied every book
                </div>
              </GlassCard>
            </>
          )}

          {stats && (
            <>
              <GlassCard
                className={glassCardStyles.glassCardLab}
                style={statCardShellStyle}
              >
                <div style={statCardTitleStyle}>
                  LAB RESEARCHERS: {stats.active_researchers}
                </div>
              </GlassCard>

              <GlassCard
                className={glassCardStyles.glassCardLab}
                style={statCardShellStyle}
              >
                <div style={statCardTitleStyle}>
                  OBSERVATIONS THIS WEEK: {stats.observations_this_week}
                </div>
              </GlassCard>

              <GlassCard
                className={glassCardStyles.glassCardLab}
                style={statCardShellStyle}
              >
                <div style={statCardTitleStyle}>
                  REPORTS ON WALRUS: {stats.reports_on_walrus}
                </div>
              </GlassCard>
            </>
          )}
        </div>
      )}

      <div className="zlabDualFeed">
        {feedsLoading && englishQueue.length === 0 ? (
          <TransmissionCardSkeleton label="OBSERVATIONS (EN)" />
        ) : (
          <GlassCard className={glassCardStyles.glassCardLab} style={{ ...tableShellStyle, padding: 0 }}>
            <div style={tableHeadStyle}>OBSERVATIONS (EN)</div>
            {currentEnglish ? (
              <EnglishScreen
                key={`en-${cycleKey}-${enIndex}`}
                entry={currentEnglish}
                cycleKey={cycleKey}
                onCycleComplete={advanceCycle}
              />
            ) : (
              <div style={{ ...languageScreenStyle, color: "#64748b" }}>Awaiting observation…</div>
            )}
          </GlassCard>
        )}

        {feedsLoading && zionQueue.length === 0 ? (
          <TransmissionCardSkeleton label="ZION TRANSMISSION (UNDECODABLE)" />
        ) : (
          <GlassCard className={glassCardStyles.glassCardLab} style={{ ...tableShellStyle, padding: 0 }}>
            <div
              style={{
                ...tableHeadStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>ZION TRANSMISSION (UNDECODABLE)</span>
              <Link
                href="/lab/decoder"
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.2em",
                  color: "rgba(0,180,216,0.4)",
                  textDecoration: "none",
                  borderBottom: "1px dotted rgba(0,180,216,0.3)",
                }}
              >
                DECODER
              </Link>
            </div>
            {currentZion && Object.keys(glyphs).length > 0 ? (
              <ZionScreen
                key={`zion-${cycleKey}-${zionIndex}`}
                entry={currentZion}
                glyphs={glyphs}
                translitMaps={translitMaps}
              />
            ) : (
              <div style={{ ...languageScreenStyle, color: "#64748b" }}>Awaiting transmission…</div>
            )}
          </GlassCard>
        )}
      </div>

      {!feedsLoading && englishQueue.length === 0 && zionQueue.length === 0 && !error && (
        <p style={{ color: "#64748b", fontSize: "13px", marginTop: "12px", fontFamily: mono }}>
          No transmissions yet. Agent thoughts appear after the next watchdog cycle.
        </p>
      )}

      {wave2Ready && research && <ResearchCharts research={research} />}

      {wave2Ready && <OcularInterfacePanels />}
    </section>
  );
}
