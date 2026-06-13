"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { GlassCard } from "@/components/GlassCard";
import {
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  useXAxisScale,
  useXAxisTicks,
  useYAxisScale,
} from "recharts";
import type { EnglishEntry, GlyphMap, ResearchDailyCandle, ResearchStats, Stats, ZionEntry } from "./types";
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

const TRACK_COLORS = [
  "#00b4d8",
  "#48cae4",
  "#90e0ef",
  "#7209b7",
  "#4361ee",
  "#4cc9f0",
  "#f72585",
  "#ffd60a",
  "#06ffa5",
  "#fb8500",
  "#8338ec",
  "#ff006e",
];

const LEGEND_TOP_N = 6;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
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

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isZeroCandle(d: ResearchDailyCandle): boolean {
  return d.open === 0 && d.high === 0 && d.low === 0 && d.close === 0;
}

function CandlesticksLayer({ data }: { data: ResearchDailyCandle[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const xTicks = useXAxisTicks();

  if (!xScale || !yScale || !data?.length) return null;

  let step = 14;
  if (xTicks && xTicks.length >= 2) {
    const p0 = xScale(xTicks[0].value, { position: "middle" });
    const p1 = xScale(xTicks[1].value, { position: "middle" });
    if (p0 != null && p1 != null) step = Math.abs(p1 - p0);
  }
  const candleW = Math.max(4, step * 0.6);

  const today = todayIsoDate();
  const lastIdx = data.length - 1;
  let candleAnimIdx = 0;

  return (
    <g className="zlab-candles">
      <defs>
        <linearGradient id="candleGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5effc0" />
          <stop offset="50%" stopColor="#00ff88" />
          <stop offset="100%" stopColor="#00b366" />
        </linearGradient>
        <linearGradient id="candleRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8a8a" />
          <stop offset="50%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#b91c1c" />
        </linearGradient>
      </defs>
      {data.map((d, idx) => {
        if (isZeroCandle(d)) return null;

        const animIdx = candleAnimIdx;
        candleAnimIdx += 1;

        const cx = xScale(d.date, { position: "middle" });
        if (cx == null) return null;

        const yOpen = yScale(d.open);
        const yClose = yScale(d.close);
        const yHigh = yScale(d.high);
        const yLow = yScale(d.low);
        if (yOpen == null || yClose == null || yHigh == null || yLow == null) return null;

        const bullish = d.close >= d.open;
        const strokeColor = bullish ? "#00b366" : "#b91c1c";
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        const isLive = idx === lastIdx && d.date === today;

        return (
          <g key={d.date}>
            <line
              x1={cx}
              y1={yHigh}
              x2={cx}
              y2={yLow}
              stroke={bullish ? "#00ff88" : "#ef4444"}
              strokeWidth={1}
            />
            {isLive && (
              <rect
                className="zlabLiveCandleGlow"
                x={cx - candleW / 2 - 2}
                y={bodyTop - 2}
                width={candleW + 4}
                height={bodyH + 4}
                fill="none"
                stroke="#00ff88"
                strokeWidth={1}
              />
            )}
            <rect
              className="candleBar"
              x={cx - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyH}
              rx={1}
              fill={bullish ? "url(#candleGreen)" : "url(#candleRed)"}
              stroke={strokeColor}
              strokeWidth={0.5}
              style={{
                transformBox: "fill-box",
                transformOrigin: "center bottom",
                animationDelay: `${animIdx * 100}ms`,
                filter: bullish
                  ? "drop-shadow(0 2px 4px rgba(0,255,136,0.25))"
                  : "drop-shadow(0 2px 4px rgba(239,68,68,0.25))",
              }}
            />
            {isLive && (
              <text
                x={cx + candleW / 2 + 6}
                y={Math.max(bodyTop - 4, 12)}
                fill="#00ff88"
                fontSize={8}
                fontFamily={mono}
                className="zlabLiveLabel"
              >
                ● LIVE
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function ResearchCharts({ research }: { research: ResearchStats }) {
  const pieData = (research.by_track || []).map((t, i) => ({
    name: t.track,
    value: t.total_chunks,
    pct: t.pct,
    chunks_read: t.chunks_read,
    total_chunks: t.total_chunks,
    color: TRACK_COLORS[i % TRACK_COLORS.length],
  }));

  const sortedTracks = [...pieData].sort((a, b) => b.value - a.value);
  const legendTop = sortedTracks.slice(0, LEGEND_TOP_N);
  const legendRest = sortedTracks.slice(LEGEND_TOP_N);
  const legendPayload = [
    ...legendTop.map((entry) => ({
      value: entry.name,
      type: "square" as const,
      color: entry.color,
      id: entry.name,
    })),
    ...(legendRest.length > 0
      ? [
          {
            value: `OTHER (${legendRest.length})`,
            type: "square" as const,
            color: "#64748b",
            id: "OTHER",
          },
        ]
      : []),
  ];

  const yMax = Math.max(...(research.daily || []).map((d) => d.high), 1) * 1.08;

  const chartTooltipStyle: CSSProperties = {
    background: "#0a1628",
    border: "1px solid #1e3a5f",
    fontFamily: mono,
    fontSize: "10px",
    color: "#e2e8f0",
  };

  return (
    <div className="zlabDualFeed" style={{ marginTop: "20px" }}>
      <GlassCard style={{ ...tableShellStyle, padding: 0 }}>
        <div style={tableHeadStyle}>DAILY RESEARCH ACTIVITY</div>
        <div style={{ ...screenStyle, padding: "12px 8px 8px" }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={research.daily}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => (v?.length >= 10 ? v.slice(5) : v)}
                  stroke="#1e3a5f"
                  tick={{ fill: "#64748b", fontSize: 9, fontFamily: mono }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#1e3a5f"
                  tick={{ fill: "#64748b", fontSize: 9, fontFamily: mono }}
                  domain={[0, yMax]}
                  width={42}
                  ticks={[0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax].map((v) => Math.round(v))}
                  tickFormatter={(v: number) => String(Math.round(v))}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ color: "#00b4d8" }}
                  formatter={(value, name) => {
                    if (name === "close") return [value, "cumulative insights"];
                    return [value, String(name)];
                  }}
                />
                <CandlesticksLayer data={research.daily} />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="transparent"
                  strokeWidth={0}
                  dot={false}
                  activeDot={false}
                  isAnimationActive
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </GlassCard>

      <GlassCard style={{ ...tableShellStyle, padding: 0 }}>
        <div style={tableHeadStyle}>LIBRARY COVERAGE BY DISCIPLINE</div>
        <div style={{ ...screenStyle, padding: "8px" }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  {pieData.map((entry, index) => (
                    <linearGradient
                      key={`grad-${index}`}
                      id={`grad-${index}`}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={lighten(entry.color, 0.2)} />
                      <stop offset="100%" stopColor={darken(entry.color, 0.2)} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="38%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="#0a1628"
                  strokeWidth={1}
                  isAnimationActive
                  animationDuration={800}
                  animationEasing="ease-out"
                  style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))" }}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`url(#grad-${index})`}
                      stroke="#0a1628"
                      strokeWidth={1}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  formatter={(_value, _name, item) => {
                    const p = item?.payload as {
                      name?: string;
                      pct?: number;
                      chunks_read?: number;
                      total_chunks?: number;
                    };
                    const label = p?.name ?? "";
                    return [
                      `${label}: ${p?.total_chunks ?? 0} chunks, ${Number(p?.pct ?? 0).toFixed(2)}% read (${p?.chunks_read ?? 0} insights)`,
                      "",
                    ];
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="square"
                  wrapperStyle={{
                    fontFamily: mono,
                    fontSize: 9,
                    color: "#64748b",
                    paddingLeft: 4,
                    lineHeight: "14px",
                  }}
                  content={() => (
                    <ul
                      style={{
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        fontFamily: mono,
                        fontSize: 9,
                        color: "#64748b",
                      }}
                    >
                      {legendPayload.map((entry) => (
                        <li
                          key={entry.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              background: entry.color,
                              flexShrink: 0,
                            }}
                          />
                          <span>{entry.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </GlassCard>
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
    <div style={screenStyle}>
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
        ...screenStyle,
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

  const loadResearchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/lab/research-stats", { cache: "no-store" });
      if (res.ok) setResearch(await res.json());
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    loadFeeds();
    const refresh = setInterval(loadFeeds, FEED_REFRESH_MS);
    return () => clearInterval(refresh);
  }, [loadFeeds]);

  useEffect(() => {
    loadResearchStats();
    const refresh = setInterval(loadResearchStats, RESEARCH_REFRESH_MS);
    return () => clearInterval(refresh);
  }, [loadResearchStats]);

  const advanceCycle = useCallback(() => {
    setEnIndex((i) => (englishQueue.length ? (i + 1) % englishQueue.length : 0));
    setZionIndex((i) => (zionQueue.length ? (i + 1) % zionQueue.length : 0));
    setCycleKey((k) => k + 1);
  }, [englishQueue.length, zionQueue.length]);

  const currentEnglish = englishQueue.length ? englishQueue[enIndex % englishQueue.length] : null;
  const currentZion = zionQueue.length ? zionQueue[zionIndex % zionQueue.length] : null;
  const animatedPct = useAnimatedNumber(research?.education_pct ?? 0);

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
        @keyframes candleGrow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        .candleBar {
          transform-origin: center bottom;
          animation: candleGrow 0.6s ease-out forwards;
        }
        @keyframes zlabLivePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0,255,136,0.6); }
          50% { opacity: 0.4; box-shadow: 0 0 0 4px rgba(0,255,136,0); }
        }
        @keyframes zlabCandleGlow {
          0%, 100% { opacity: 0.9; filter: drop-shadow(0 0 3px rgba(0,255,136,0.85)); }
          50% { opacity: 0.35; filter: drop-shadow(0 0 10px rgba(0,255,136,0.35)); }
        }
        .zlabLiveCandleGlow {
          animation: zlabCandleGlow 2s ease-in-out infinite;
        }
        .zlabLiveLabel {
          animation: zlabLivePulse 2s ease-in-out infinite;
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
      {research != null && (
        <p
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0 16px",
            fontFamily: mono,
            fontSize: "11px",
            letterSpacing: "0.1em",
            color: "#00b4d8",
            margin: "0 0 8px",
          }}
        >
          <span>
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
          </span>
          {research.daily && research.daily.length > 0 && (
            <span style={{ color: "#64748b", fontSize: "10px" }}>
              INSIGHTS TODAY:{" "}
              <span style={{ color: "#00ff88" }}>
                {Math.round(research.daily[research.daily.length - 1]?.cumulative_insights ?? 0)}
              </span>
            </span>
          )}
        </p>
      )}
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
          <GlassCard style={{ ...tableShellStyle, padding: 0 }}>
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
          </GlassCard>

          <GlassCard style={{ ...tableShellStyle, padding: 0 }}>
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
              <div style={{ ...screenStyle, color: "#64748b" }}>Awaiting transmission…</div>
            )}
          </GlassCard>
        </div>
      )}

      {research && <ResearchCharts research={research} />}
    </section>
  );
}
