"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type FieldObservationAgent = {
  id: number;
  name: string;
  class: string;
};

export type FieldObservationConv = {
  id: number;
  topic: string;
  agent1: FieldObservationAgent;
  agent2: FieldObservationAgent;
  message1?: string;
  message2?: string;
};

const cleanName = (name: string) => name.replace(/\s+\d+$/, "").trim();
const cleanMsg = (s: string) => s.replace(/\s*\*\s*\(\d+\)\s*\*\s*$/, "").trim();

function classBadgeStyle(agentClass: string): CSSProperties {
  const c = (agentClass || "").trim().toLowerCase();
  if (c === "elite") {
    return {
      background: "rgba(255, 200, 50, 0.15)",
      border: "1px solid rgba(255, 200, 80, 0.45)",
      color: "rgba(255, 220, 140, 0.9)",
    };
  }
  if (c === "middle") {
    return {
      background: "rgba(100, 150, 255, 0.15)",
      border: "1px solid rgba(100, 150, 255, 0.45)",
      color: "rgba(180, 200, 255, 0.9)",
    };
  }
  return {
    background: "rgba(100, 100, 100, 0.15)",
    border: "1px solid rgba(160, 160, 160, 0.35)",
    color: "rgba(200, 200, 200, 0.85)",
  };
}

function delay(ms: number, signal: { cancelled: boolean }) {
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(() => {
      if (!signal.cancelled) resolve();
    }, ms);
    return t;
  });
}

function typeOut(
  text: string,
  msPerChar: number,
  onChar: (len: number) => void,
  signal: { cancelled: boolean },
): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    onChar(0);
    const id = window.setInterval(() => {
      if (signal.cancelled) {
        clearInterval(id);
        resolve();
        return;
      }
      i += 1;
      onChar(i);
      if (i >= text.length) {
        clearInterval(id);
        resolve();
      }
    }, msPerChar);
  });
}

type FieldObservationsFeedProps = {
  conversations: FieldObservationConv[];
};

export function FieldObservationsFeed({ conversations }: FieldObservationsFeedProps) {
  const [convIndex, setConvIndex] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [subjectLen, setSubjectLen] = useState(0);
  const [msg1Len, setMsg1Len] = useState(0);
  const [msg2Len, setMsg2Len] = useState(0);
  const [showAgent1, setShowAgent1] = useState(false);
  const [showAgent2, setShowAgent2] = useState(false);
  const runId = useRef(0);

  const convsRef = useRef(conversations);
  convsRef.current = conversations;
  const hasConvs = conversations.length > 0;
  const conv = hasConvs ? conversations[convIndex % conversations.length] : undefined;

  useEffect(() => {
    const safeConvs = convsRef.current;
    if (safeConvs.length === 0) return;

    const signal = { cancelled: false };
    const currentRun = ++runId.current;

    const run = async () => {
      const c = safeConvs[convIndex % safeConvs.length];
      const subjectLine = `SUBJECT ID: AGT-${String(c.agent1.id).padStart(4, "0")}`;
      const msg1 = cleanMsg(c.message1 || c.topic || "");
      const msg2 = cleanMsg(
        c.message2 || "[Awaiting response transmission…]",
      );

      setOpacity(0);
      await delay(350, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      setSubjectLen(0);
      setMsg1Len(0);
      setMsg2Len(0);
      setShowAgent1(false);
      setShowAgent2(false);
      setOpacity(1);

      await typeOut(subjectLine, 30, setSubjectLen, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      await delay(400, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      setShowAgent1(true);
      await delay(200, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      await typeOut(msg1, 20, setMsg1Len, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      await delay(1500, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      setShowAgent2(true);
      await delay(200, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      await typeOut(msg2, 20, setMsg2Len, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      await delay(2000, signal);
      if (signal.cancelled || runId.current !== currentRun) return;

      setConvIndex((i) => (i + 1) % safeConvs.length);
    };

    void run();

    return () => {
      signal.cancelled = true;
    };
  }, [convIndex, conversations.length]);

  const subjectLine = conv
    ? `SUBJECT ID: AGT-${String(conv.agent1.id).padStart(4, "0")}`
    : "";
  const msg1 = conv ? cleanMsg(conv.message1 || conv.topic || "") : "";
  const msg2 = conv
    ? cleanMsg(conv.message2 || "[Awaiting response transmission…]")
    : "";

  const agent1Class = (conv?.agent1.class || "poor").toUpperCase();
  const agent2Class = (conv?.agent2.class || "poor").toUpperCase();
  const isElite1 = conv?.agent1.class?.toLowerCase() === "elite";
  const isElite2 = conv?.agent2.class?.toLowerCase() === "elite";

  return (
    <div className="fieldObsFeed">
      <div className="fieldObsSnakeLine" aria-hidden />
      <header className="fieldObsHeader">
        <div className="fieldObsHeaderRow">
          <h2 className="fieldObsTitle">FIELD OBSERVATIONS</h2>
          <span className="fieldObsLiveDot" aria-hidden>
            ●
          </span>
        </div>
        <p className="fieldObsLabel">INTERCEPTING LIVE TRANSMISSIONS · AUTO-REFRESH 60s</p>
      </header>

      <div className="fieldObsBody">
        {!hasConvs || !conv ? (
          <p className="fieldObsEmpty">Scanning agent chatter…</p>
        ) : (
          <div className="fieldObsTransmission" style={{ opacity, transition: "opacity 0.35s ease" }}>
            <p className="fieldObsSubject">
              {subjectLine.slice(0, subjectLen)}
              {subjectLen < subjectLine.length && subjectLen > 0 && (
                <span className="fieldObsCaret">▌</span>
              )}
            </p>

            {showAgent1 && (
              <div className="fieldObsAgentRow fieldObsAgentRowIn">
                <span className="fieldObsAgentName">{cleanName(conv.agent1.name)}</span>
                <span className="fieldObsClassBadge" style={classBadgeStyle(conv.agent1.class)}>
                  [{agent1Class}]
                </span>
              </div>
            )}

            {showAgent1 && msg1Len > 0 && (
              <p className={`fieldObsMessage${isElite1 ? " fieldObsMessageElite" : ""}`}>
                {msg1.slice(0, msg1Len)}
                {msg1Len < msg1.length && <span className="fieldObsCaret">▌</span>}
              </p>
            )}

            {showAgent2 && (
              <>
                <div className="fieldObsDivider" />
                <div className="fieldObsAgentRow fieldObsAgentRowIn">
                  <span className="fieldObsAgentName">{cleanName(conv.agent2.name)}</span>
                  <span className="fieldObsClassBadge" style={classBadgeStyle(conv.agent2.class)}>
                    [{agent2Class}]
                  </span>
                </div>
              </>
            )}

            {showAgent2 && msg2Len > 0 && (
              <p className={`fieldObsMessage${isElite2 ? " fieldObsMessageElite" : ""}`}>
                {msg2.slice(0, msg2Len)}
                {msg2Len < msg2.length && <span className="fieldObsCaret">▌</span>}
              </p>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .fieldObsFeed {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 420px;
          background: #000000;
          border-left: 1px solid rgba(255, 255, 255, 0.06);
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .fieldObsSnakeLine {
          height: 2px;
          width: 100%;
          flex-shrink: 0;
          background: linear-gradient(90deg, #003d5c, #00b4d8, #7b2fff, #003d5c);
          background-size: 200% 100%;
          animation: snake 4s linear infinite;
        }
        @keyframes snake {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
        .fieldObsHeader {
          padding: 12px 20px 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .fieldObsHeaderRow {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .fieldObsTitle {
          margin: 0;
          font-family: var(--font-mono), "IBM Plex Mono", monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #c8e8ff;
        }
        .fieldObsLiveDot {
          font-size: 8px;
          color: #00b4d8;
          animation: fieldObsBlink 1s ease-in-out infinite;
        }
        @keyframes fieldObsBlink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.15;
          }
        }
        .fieldObsLabel {
          margin: 8px 0 0;
          font-family: var(--font-mono), "IBM Plex Mono", monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          color: rgba(200, 232, 255, 0.4);
        }
        .fieldObsBody {
          flex: 1;
          padding: 14px 20px 16px;
          overflow: hidden;
        }
        .fieldObsEmpty {
          margin: 0;
          font-family: var(--font-mono), "IBM Plex Mono", monospace;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.35);
          letter-spacing: 0.06em;
        }
        .fieldObsTransmission {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .fieldObsSubject {
          margin: 0;
          font-family: var(--font-mono), "IBM Plex Mono", monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: rgba(0, 180, 216, 0.75);
        }
        .fieldObsAgentRow {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .fieldObsAgentRowIn {
          animation: fieldObsSlideIn 0.2s ease-out forwards;
        }
        @keyframes fieldObsSlideIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .fieldObsAgentName {
          font-family: var(--font-sans), Inter, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.1em;
          color: #ffffff;
        }
        .fieldObsClassBadge {
          font-family: var(--font-mono), "IBM Plex Mono", monospace;
          font-size: 9px;
          letter-spacing: 0.08em;
          padding: 2px 6px;
          border-radius: 2px;
        }
        .fieldObsMessage {
          margin: 0;
          font-family: var(--font-mono), "IBM Plex Mono", monospace;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.7);
        }
        .fieldObsMessageElite {
          font-style: italic;
        }
        .fieldObsDivider {
          height: 1px;
          background: rgba(255, 255, 255, 0.06);
          margin: 4px 0;
        }
        .fieldObsCaret {
          color: rgba(0, 180, 216, 0.6);
          animation: fieldObsCaretBlink 0.8s step-end infinite;
        }
        @keyframes fieldObsCaretBlink {
          50% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
