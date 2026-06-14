// @ts-nocheck
"use client";

import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import { useZionTab } from "@/components/zion/ZionTabContext";

const pressGlass = glassCardStyles.glassCardLab;

export function Press() {
  const {
    newspapers,
    activeNewspaper,
    pressArticles,
    pressLoading,
    account,
    pressSuiChecked,
    suiBalance,
    setActiveNewspaper,
    renderArticle,
    isMobile,
    connect,
  } = useZionTab();

  const current = newspapers.find((n) => n.id === activeNewspaper) ?? newspapers[0]!;
  const currentArticle = pressArticles[activeNewspaper];
  const loading = !!pressLoading[activeNewspaper];
  const ac = current.accentColor;
  const border = current.borderColor;
  const bodyFont = current.bodyFont;
  const mastheadFont = current.mastheadFont;
  const silverMin = current.silverMin ?? 10;
  const goldMin = current.goldMin ?? 100;
  const isVip = !!current.vipOnly;
  const hasWallet = !!account?.address;
  const vipCanRead = hasWallet && pressSuiChecked && suiBalance >= silverMin;
  const isGoldTier = hasWallet && pressSuiChecked && suiBalance >= goldMin;

  const fakeVipParsed = {
    headline: "CLASSIFIED: ELITE CIRCLES POSITION BEFORE THE STORM",
    byline: "By Cipher Vale | VIP INTEL",
    columns: [
      "Multiple clan treasuries show stress fractures as tax receipts diverge from expected flows. Sources inside the senate chamber describe last-minute coalitions forming ahead of a contested mandate renewal.",
      "NEO-linked volatility spiked across prediction corridors while catastrophe bonds repriced sharply. Analysts note synchronized wallet movements consistent with coordinated accumulation ahead of an undisclosed catalyst.",
      "Prophet-adjacent channels lit up with coded warnings; the poor quarters report rising labor actions. Markets imply elevated tail risk through the next cycle.",
    ],
    editorsNote: "Full decryption requires Silver VIP (10 SUI) or higher.",
    rawFallback: "",
  };

  const renderColumns = (
    cols: string[],
    note: string,
    rawFb: string,
    opts?: { blur?: boolean; dim?: boolean },
  ) => (
    <div
      style={{
        filter: opts?.blur ? "blur(7px)" : undefined,
        opacity: opts?.dim ? 0.85 : 1,
        pointerEvents: opts?.blur ? "none" : undefined,
        userSelect: opts?.blur ? "none" : undefined,
      }}
    >
      {rawFb ? (
        <div
          style={{
            color: "rgba(200,215,205,0.92)",
            fontSize: "0.82rem",
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            fontFamily: bodyFont,
          }}
        >
          {rawFb}
        </div>
      ) : (
        <>
          {cols[0] || cols[1] || cols[2] ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                gap: "14px",
                fontSize: "0.78rem",
                lineHeight: 1.55,
                color: "rgba(210,220,210,0.9)",
                fontFamily: bodyFont,
              }}
            >
              {cols.map((col, i) => (
                <p key={i} style={{ margin: 0, fontFamily: bodyFont }}>
                  {col}
                </p>
              ))}
            </div>
          ) : null}
          {note ? (
            <GlassCard
              className={pressGlass}
              style={{
                marginTop: "14px",
                padding: "10px 12px",
                borderLeft: `4px solid ${ac}`,
              }}
            >
              <strong style={{ color: ac }}>EDITOR{"'"}S NOTE:</strong> {note}
            </GlassCard>
          ) : null}
        </>
      )}
    </div>
  );

  const renderMasthead = () => (
    <header style={{ textAlign: "center", paddingBottom: "14px", borderBottom: `2px solid ${border}` }}>
      <div
        style={{
          fontSize: "2rem",
          letterSpacing: "0.02em",
          color: ac,
          fontWeight: 800,
          lineHeight: 1.1,
          fontFamily: mastheadFont,
          ...(current.id === "prophet"
            ? {
                textShadow: "0 0 28px rgba(167, 139, 250, 0.5)",
                color: "#e8dcff",
              }
            : {}),
        }}
      >
        {current.name}
      </div>
      <div
        style={{
          fontSize: "0.72rem",
          color: "rgba(200,200,200,0.65)",
          marginTop: "6px",
          letterSpacing: "0.12em",
          fontFamily: bodyFont,
        }}
      >
        {current.subtitle}
      </div>
      <div style={{ height: "1px", background: `linear-gradient(90deg, transparent, ${ac}, transparent)`, marginTop: "12px" }} />
    </header>
  );

  const renderHeadlineByline = (headline: string, byline: string, sealBadge?: boolean) => (
    <>
      {headline ? (
        <h3
          style={{
            margin: "12px 0 0 0",
            color: ac,
            fontSize: "1.4rem",
            fontWeight: 800,
            letterSpacing: "0.04em",
            lineHeight: 1.2,
            fontFamily: bodyFont,
          }}
        >
          {headline}
          {sealBadge ? (
            <span
              style={{
                background: "rgba(139,92,246,0.2)",
                color: "#a78bfa",
                fontSize: "0.6rem",
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "monospace",
                marginLeft: "8px",
              }}
            >
              🔒 SEAL ENCRYPTED
            </span>
          ) : null}
        </h3>
      ) : null}
      {byline ? (
        <p
          style={{
            margin: "8px 0 0 0",
            color: "#888",
            fontSize: "0.78rem",
            fontStyle: "italic",
            fontFamily: bodyFont,
          }}
        >
          {byline}
        </p>
      ) : null}
      {headline || byline ? (
        <hr style={{ border: "none", borderTop: `1px solid ${border}`, margin: "14px 0", opacity: 0.5 }} />
      ) : null}
    </>
  );

  const showLoadingLine = loading && (!isVip || vipCanRead);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <section
      style={{
        display: "flex",
        gap: "16px",
        alignItems: "stretch",
        minHeight: "420px",
        fontFamily: bodyFont,
      }}
      aria-label="AI Press"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Special+Elite&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=IM+Fell+English:ital@0;1&family=Oswald:wght@400;600&display=swap');`,
        }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes pressPulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes pressSpin{to{transform:rotate(360deg)}}`,
        }}
      />

      <GlassCard
        className={pressGlass}
        style={{
          flex: "0 0 180px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "10px",
        }}
      >
        {newspapers.map((n) => {
          const active = activeNewspaper === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setActiveNewspaper(n.id)}
              style={{
                textAlign: "left",
                padding: "10px 10px",
                borderRadius: "6px",
                border: active ? "none" : `1px solid ${n.borderColor}`,
                background: active ? n.accentColor : "transparent",
                color: active ? "#0a0a0a" : n.accentColor,
                cursor: "pointer",
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
                fontSize: "0.68rem",
                letterSpacing: "0.03em",
                lineHeight: 1.35,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
                <span>{n.icon}</span>
                <span>{n.name}</span>
              </div>
              <div style={{ marginTop: "4px", fontSize: "0.6rem", opacity: active ? 0.85 : 0.75, fontWeight: 400 }}>
                {n.subtitle}
              </div>
            </button>
          );
        })}
      </GlassCard>

      <GlassCard
        className={pressGlass}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: "12px", right: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
          {isVip && vipCanRead ? (
            <span
              style={{
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "4px 8px",
                borderRadius: "4px",
                background: isGoldTier ? "#ffd700" : "#c0c0c0",
                color: isGoldTier ? "#1a1200" : "#222",
              }}
            >
              {isGoldTier ? "GOLD VIP" : "SILVER VIP"}
            </span>
          ) : null}
        </div>

        {renderMasthead()}

        {isVip ? (
          <div style={{ color: "#888", fontFamily: "monospace", fontSize: "0.65rem", marginTop: "4px" }}>
            Powered by Seal Protocol · Threshold encryption · On-chain access control
          </div>
        ) : null}

        {isVip && !hasWallet ? (
          <GlassCard
            className={pressGlass}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              padding: "32px 16px",
              textAlign: "center",
              color: "#aaa",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            <div style={{ fontSize: "2.5rem" }}>🔒</div>
            <p style={{ margin: 0, maxWidth: "320px", fontSize: "0.9rem" }}>Connect wallet to check VIP status</p>
            <button
              type="button"
              onClick={connect}
              style={{
                background: ac,
                color: "#111",
                border: "none",
                padding: "10px 20px",
                borderRadius: "8px",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              Connect wallet
            </button>
          </GlassCard>
        ) : null}

        {isVip && hasWallet && !pressSuiChecked ? (
          <GlassCard className={pressGlass} style={{ padding: "12px 14px" }}>
            <div
              style={{
                color: ac,
                fontSize: "0.85rem",
                animation: "pressPulse 1.2s ease-in-out infinite",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              ⌛ Checking on-chain balance…
            </div>
          </GlassCard>
        ) : null}

        {isVip && hasWallet && pressSuiChecked && !vipCanRead ? (
          <div style={{ position: "relative", minHeight: "280px" }}>
            <GlassCard
              className={pressGlass}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>🔒</div>
              <p style={{ margin: 0, color: "#fff", fontSize: "0.95rem", fontWeight: 700 }}>SILVER VIP: {silverMin} SUI minimum</p>
              <p style={{ margin: "8px 0 0 0", color: "#aaa", fontSize: "0.78rem", maxWidth: "280px" }}>
                Your balance: {suiBalance.toFixed(2)} SUI · Gold tier from {goldMin} SUI
              </p>
            </GlassCard>
            <div style={{ paddingTop: "8px" }}>
              {renderHeadlineByline(fakeVipParsed.headline, fakeVipParsed.byline, true)}
              <hr style={{ border: "none", borderTop: `1px solid ${border}`, margin: "12px 0", opacity: 0.4 }} />
              {renderColumns(fakeVipParsed.columns, fakeVipParsed.editorsNote, fakeVipParsed.rawFallback, { blur: true })}
            </div>
          </div>
        ) : null}

        {!isVip || (isVip && vipCanRead) ? (
          <>
            {showLoadingLine ? (
              <GlassCard className={pressGlass} style={{ padding: "10px 14px" }}>
                <div style={{ color: "#666" }}>⌛ Journalist investigating...</div>
              </GlassCard>
            ) : null}
            {currentArticle ? renderArticle(currentArticle, ac, border, bodyFont, isVip && vipCanRead, isMobile) : null}
          </>
        ) : null}

        <GlassCard
          className={pressGlass}
          style={{
            marginTop: "auto",
            padding: "10px 14px",
          }}
        >
          <p style={{ margin: 0, color: "#555", fontSize: "0.72rem", fontFamily: "ui-monospace, monospace" }}>
            📅 Published: {dateStr} · {timeStr}
          </p>
        </GlassCard>
      </GlassCard>
    </section>
  );
}
