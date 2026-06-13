"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { GlassCard } from "@/components/GlassCard";
import { parseZionTokens, prepareGlyphSvgs } from "../zionTransliterate";

const STORAGE_KEY = "zlab_decoder_password";
const CHAR_MS = 18;
const mono = '"IBM Plex Mono", ui-monospace, monospace';

type ZionMessage = {
  id: number;
  from_agent: number;
  zion_text: string;
  created_at: string;
  message_type?: string;
};

type GlyphMap = Record<string, string>;

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "radial-gradient(ellipse at 20% 0%, rgba(0, 80, 120, 0.15), transparent 50%), #050d1a",
  color: "#e2e8f0",
  padding: "32px 20px 64px",
};

const titleStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "clamp(14px, 3vw, 20px)",
  letterSpacing: "0.14em",
  color: "#00b4d8",
  textAlign: "center",
  marginBottom: "8px",
};

const subtitleStyle: CSSProperties = {
  textAlign: "center",
  color: "#64748b",
  fontSize: "12px",
  letterSpacing: "0.08em",
  marginBottom: "32px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  maxWidth: "360px",
  padding: "12px 14px",
  background: "rgba(8, 16, 28, 0.8)",
  border: "1px solid rgba(0, 180, 216, 0.35)",
  borderRadius: "3px",
  color: "#e2e8f0",
  fontFamily: mono,
  fontSize: "13px",
  outline: "none",
};

const btnStyle: CSSProperties = {
  marginTop: "12px",
  padding: "10px 20px",
  background: "rgba(0, 180, 216, 0.15)",
  border: "1px solid #00b4d8",
  color: "#00b4d8",
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.12em",
  cursor: "pointer",
  borderRadius: "3px",
};

async function verifyPassword(pw: string): Promise<boolean> {
  if (!pw.trim()) return false;
  try {
    const res = await fetch("/api/zion-lang/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, zion_text: "" }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

function glyphKey(id: number): string {
  return String(id).padStart(2, "0");
}

function TypewriterDecoded({ text }: { text: string }) {
  const [len, setLen] = useState(0);

  useEffect(() => {
    setLen(0);
    if (!text) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setLen(i);
      if (i >= text.length) clearInterval(t);
    }, CHAR_MS);
    return () => clearInterval(t);
  }, [text]);

  return (
    <p
      style={{
        margin: "12px 0 0",
        color: "#f8fafc",
        fontSize: "14px",
        lineHeight: 1.6,
        fontFamily: mono,
      }}
    >
      {text.slice(0, len)}
      {len < text.length && <span style={{ color: "#00b4d8" }}>|</span>}
    </p>
  );
}

function MessageCard({
  message,
  glyphs,
  password,
}: {
  message: ZionMessage;
  glyphs: GlyphMap;
  password: string;
}) {
  const [phase, setPhase] = useState<"idle" | "decoding" | "revealed">("idle");
  const [decoded, setDecoded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const glyphIds = parseZionTokens(message.zion_text);

  const handleDecode = async () => {
    setPhase("decoding");
    setError(null);
    setDecoded(null);
    const fadeStart = Date.now();
    try {
      const res = await fetch("/api/zion-lang/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, zion_text: message.zion_text }),
      });
      if (res.status === 403) {
        setError("Invalid key — re-authenticate");
        setPhase("idle");
        return;
      }
      const data = await res.json();
      const wait = Math.max(0, 500 - (Date.now() - fadeStart));
      setTimeout(() => {
        if (data.decoded) {
          setDecoded(data.decoded);
          setPhase("revealed");
        } else {
          setError(data.error || "not found");
          setPhase("idle");
        }
      }, wait);
    } catch {
      setError("Decode failed");
      setPhase("idle");
    }
  };

  const glyphOpacity = phase === "revealed" || phase === "decoding" ? 0 : 1;

  return (
    <GlassCard style={{ marginBottom: "16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div
            style={{
              fontSize: "9px",
              letterSpacing: "0.2em",
              color: "rgba(0, 180, 216, 0.5)",
              marginBottom: "10px",
            }}
          >
            AGENT #{message.from_agent} · {new Date(message.created_at).toLocaleString()}
          </div>
          <div
            style={{
              opacity: glyphOpacity,
              transition: "opacity 0.5s ease",
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              alignItems: "center",
              minHeight: "28px",
            }}
          >
            {glyphIds.map((id, idx) => {
              const svg = glyphs[glyphKey(id)];
              if (!svg) return null;
              return (
                <span
                  key={`${id}-${idx}`}
                  className="decoderGlyph"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              );
            })}
          </div>
          {phase === "revealed" && decoded && <TypewriterDecoded text={decoded} />}
          {error && (
            <p style={{ color: "#f87171", fontSize: "12px", marginTop: "8px" }}>{error}</p>
          )}
        </div>
        {phase !== "revealed" && (
          <button
            type="button"
            style={{
              ...btnStyle,
              marginTop: 0,
              opacity: phase === "decoding" ? 0.5 : 1,
            }}
            disabled={phase === "decoding"}
            onClick={handleDecode}
          >
            {phase === "decoding" ? "DECODING…" : "DECODE"}
          </button>
        )}
      </div>
    </GlassCard>
  );
}

export default function DecoderPage() {
  const [password, setPassword] = useState("");
  const [sessionPassword, setSessionPassword] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [messages, setMessages] = useState<ZionMessage[]>([]);
  const [glyphs, setGlyphs] = useState<GlyphMap>({});
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const res = await fetch("/api/zlab/zion-messages?limit=20", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const unlockWithPassword = useCallback(
    async (pw: string, persist: boolean) => {
      const ok = await verifyPassword(pw);
      if (!ok) {
        if (persist) localStorage.removeItem(STORAGE_KEY);
        setAuthenticated(false);
        setSessionPassword(null);
        return false;
      }
      if (persist) localStorage.setItem(STORAGE_KEY, pw);
      setSessionPassword(pw);
      setAuthenticated(true);
      await loadMessages();
      return true;
    },
    [loadMessages],
  );

  useEffect(() => {
    fetch("/api/language/glyphs", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.glyphs) setGlyphs(prepareGlyphSvgs(d.glyphs));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSessionChecking(true);
      setAuthenticated(false);
      setSessionPassword(null);

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const ok = await unlockWithPassword(saved, true);
        if (!ok && !cancelled) {
          setAuthError("Saved key expired or invalid");
        }
      }

      if (!cancelled) setSessionChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [unlockWithPassword]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const ok = await unlockWithPassword(password, true);
    setAuthLoading(false);
    if (!ok) {
      setAuthError("Invalid key");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSessionPassword(null);
    setAuthenticated(false);
    setPassword("");
    setMessages([]);
  };

  return (
    <div style={pageStyle}>
      <style>{`
        .decoderGlyph {
          display: inline-block;
          height: 28px;
          line-height: 0;
        }
        .decoderGlyph svg {
          height: 28px;
          width: auto;
          display: inline-block;
          vertical-align: middle;
        }
      `}</style>

      <h1 style={titleStyle}>ZION LANGUAGE DECODER — PRIVATE ACCESS</h1>
      <p style={subtitleStyle}>Authorized personnel only · direct URL access</p>

      {sessionChecking ? (
        <p style={{ color: "#64748b", textAlign: "center" }}>Verifying access…</p>
      ) : !authenticated ? (
        <form
          onSubmit={handleLogin}
          style={{
            maxWidth: "400px",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <GlassCard>
            <label
              htmlFor="decoder-key"
              style={{
                display: "block",
                fontFamily: mono,
                fontSize: "10px",
                letterSpacing: "0.15em",
                color: "#94a3b8",
                marginBottom: "10px",
                textAlign: "left",
              }}
            >
              ACCESS KEY
            </label>
            <input
              id="decoder-key"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="Enter decoder password"
              autoComplete="off"
            />
            {authError && (
              <p style={{ color: "#f87171", fontSize: "12px", marginTop: "10px" }}>{authError}</p>
            )}
            <button type="submit" style={btnStyle} disabled={authLoading || !password}>
              {authLoading ? "VERIFYING…" : "UNLOCK"}
            </button>
          </GlassCard>
        </form>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              maxWidth: "720px",
              margin: "0 auto 20px",
            }}
          >
            <button type="button" style={{ ...btnStyle, marginTop: 0 }} onClick={handleLogout}>
              LOCK
            </button>
          </div>
          <div style={{ maxWidth: "720px", margin: "0 auto" }}>
            {loadingMessages && (
              <p style={{ color: "#64748b", textAlign: "center" }}>Loading transmissions…</p>
            )}
            {!loadingMessages && messages.length === 0 && (
              <p style={{ color: "#64748b", textAlign: "center" }}>No ZION messages found.</p>
            )}
            {sessionPassword &&
              messages.map((msg) => (
                <MessageCard
                  key={msg.id}
                  message={msg}
                  glyphs={glyphs}
                  password={sessionPassword}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
