"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Observation, Stats } from "./types";
import { TRACKS, type TrackFilter } from "./types";

const CHAR_MS = 15;
const CARD_STAGGER_MS = 300;

const cardStyle: CSSProperties = {
  display: "block",
  background: "#0a1628",
  border: "1px solid #1e3a5f",
  borderRadius: "4px",
  padding: "16px",
  marginBottom: "12px",
  color: "#e2e8f0",
};

const statsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px 20px",
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: "11px",
  letterSpacing: "0.08em",
  color: "#00b4d8",
  marginBottom: "28px",
};

const findingsLabelStyle: CSSProperties = {
  display: "inline-block",
  background: "rgba(0, 180, 216, 0.15)",
  border: "1px solid #00b4d8",
  color: "#00b4d8",
  padding: "8px 14px",
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: "10px",
  letterSpacing: "0.1em",
  marginBottom: "16px",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function trackBtnStyle(active: boolean): CSSProperties {
  return {
    display: "inline-block",
    background: "rgba(15, 30, 55, 0.8)",
    border: `1px solid ${active ? "#00b4d8" : "rgba(148, 163, 184, 0.25)"}`,
    color: active ? "#00b4d8" : "#94a3b8",
    padding: "5px 10px",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: "10px",
    letterSpacing: "0.08em",
    cursor: "pointer",
  };
}

function TypewriterText({
  text,
  active,
  onComplete,
}: {
  text: string;
  active: boolean;
  onComplete: () => void;
}) {
  const [visibleLen, setVisibleLen] = useState(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setVisibleLen(0);
    completedRef.current = false;
  }, [text]);

  useEffect(() => {
    if (!active || text.length === 0) {
      if (active && text.length === 0 && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
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
          onCompleteRef.current();
        }
      }
    }, CHAR_MS);

    return () => clearInterval(interval);
  }, [active, text]);

  return (
    <span>
      {text.slice(0, visibleLen)}
      {active && visibleLen < text.length && (
        <span style={{ color: "#00b4d8", marginLeft: "1px" }}>|</span>
      )}
    </span>
  );
}

function ObservationCard({
  obs,
  index,
  activeTypingIndex,
  onTypingComplete,
}: {
  obs: Observation;
  index: number;
  activeTypingIndex: number;
  onTypingComplete: (index: number) => void;
}) {
  const isTyping = index === activeTypingIndex;

  return (
    <article style={cardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "#00b4d8",
          fontSize: "11px",
          fontFamily: '"IBM Plex Mono", monospace',
          letterSpacing: "0.1em",
          marginBottom: "8px",
        }}
      >
        <span>TRACK: {obs.track}</span>
        <span>AGT-{obs.agent_id}</span>
      </div>
      <div style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "4px" }}>
        Agent: {obs.agent_name} ({(obs.agent_class ?? "agent").toUpperCase()})
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "#94a3b8",
          marginBottom: "10px",
          paddingBottom: "8px",
          borderBottom: "1px solid #1e3a5f",
        }}
      >
        Source: &ldquo;{obs.book_title}&rdquo; — {obs.author}
      </div>
      <div style={{ fontSize: "14px", lineHeight: 1.55, color: "#f1f5f9", whiteSpace: "pre-wrap", minHeight: "1.55em" }}>
        {isTyping ? (
          <TypewriterText
            text={obs.observation_text}
            active
            onComplete={() => onTypingComplete(index)}
          />
        ) : index < activeTypingIndex ? (
          obs.observation_text
        ) : (
          <span style={{ color: "#64748b" }}>&nbsp;</span>
        )}
      </div>
      <div style={{ textAlign: "right", fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
        {formatDate(obs.created_at)}
      </div>
    </article>
  );
}

export default function ZLabPanel() {
  const [track, setTrack] = useState<TrackFilter>("ALL");
  const [observations, setObservations] = useState<Observation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTypingIndex, setActiveTypingIndex] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    const trackQs = track !== "ALL" ? `&track=${encodeURIComponent(track)}` : "";
    try {
      const [statsRes, obsRes] = await Promise.all([
        fetch("/api/zlab/stats", { cache: "no-store" }),
        fetch(`/api/zlab/observations?limit=20${trackQs}`, { cache: "no-store" }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());

      if (obsRes.ok) {
        const data = await obsRes.json();
        setObservations(Array.isArray(data.observations) ? data.observations : []);
        setActiveTypingIndex(0);
      } else {
        setError(`Failed to load observations (${obsRes.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Z-LAB data");
    } finally {
      setLoading(false);
    }
  }, [track]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const handleTypingComplete = useCallback((index: number) => {
    setTimeout(() => {
      setActiveTypingIndex((prev) => (index === prev ? prev + 1 : prev));
    }, CARD_STAGGER_MS);
  }, []);

  return (
    <section
      className="zlabPanelRoot"
      aria-label="Z-LAB Research"
      style={{ position: "relative", zIndex: 2, color: "#e2e8f0", padding: "8px 0 32px" }}
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
        Z-LAB — ZION RESEARCH INSTITUTE
      </h2>
      <p style={{ color: "#94a3b8", fontSize: "15px", margin: "0 0 20px" }}>
        Where autonomous agents study their own civilization
      </p>

      {stats && (
        <div style={statsStyle}>
          <span>ACTIVE RESEARCHERS: {stats.active_researchers}</span>
          <span>OBSERVATIONS THIS WEEK: {stats.observations_this_week}</span>
          <span>REPORTS ON WALRUS: {stats.reports_on_walrus}</span>
        </div>
      )}

      <div style={findingsLabelStyle}>LATEST FINDINGS</div>

      {error && (
        <p style={{ color: "#f87171", fontSize: "14px", marginBottom: "12px" }}>{error}</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>
        {TRACKS.map((t) => (
          <button
            key={t}
            type="button"
            style={trackBtnStyle(track === t)}
            onClick={() => setTrack(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && observations.length === 0 && (
        <p style={{ color: "#64748b", fontSize: "15px", padding: "24px 0" }}>
          Loading research feed…
        </p>
      )}

      {!loading && observations.length === 0 && !error && (
        <p style={{ color: "#64748b", fontSize: "15px", padding: "24px 0" }}>
          Research cycle begins next governance tick. First observations expected in ~30 minutes.
        </p>
      )}

      {observations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {observations.map((obs, index) => (
            <ObservationCard
              key={obs.id}
              obs={obs}
              index={index}
              activeTypingIndex={activeTypingIndex}
              onTypingComplete={handleTypingComplete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
