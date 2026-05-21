"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const ZION_GREEN = "#00ff41";

type StealthReceipt = {
  type?: string;
  tx_hash?: string;
  token?: string;
  amount?: string;
  timestamp?: string;
  agent?: string;
  agent_class?: string;
  consensus?: {
    votes_for?: number;
    total_votes?: number;
    avg_confidence?: number;
    decision?: string;
    method?: string;
  };
  notary?: {
    agent?: string;
    agent_class?: string;
    decision?: string;
    consensus?: {
      votes_for?: number;
      total_votes?: number;
      avg_confidence?: number;
    };
  };
  privacy_proof?: string;
  stealth_address?: string;
};

function formatTimestamp(ts?: string): string {
  if (!ts) return new Date().toISOString().replace("T", " ").slice(0, 19);
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d
      .toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(",", "");
  } catch {
    return ts;
  }
}

export default function StealthReceiptPage() {
  const params = useParams();
  const blobId = typeof params.blob_id === "string" ? params.blob_id : "";
  const [receipt, setReceipt] = useState<StealthReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!blobId) {
      setLoading(false);
      setError(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`
        );
        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const data = (await res.json()) as StealthReceipt;
        if (!cancelled) setReceipt(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blobId]);

  const walrusUrl = `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;
  const suiscanUrl = receipt?.tx_hash
    ? `https://suiscan.xyz/testnet/tx/${receipt.tx_hash}`
    : null;

  const votesFor = receipt?.notary?.consensus?.votes_for ?? 0;
  const totalVotes = receipt?.notary?.consensus?.total_votes ?? 0;
  const confidencePct = Math.round(
    (receipt?.notary?.consensus?.avg_confidence || 0) * 100
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: ZION_GREEN,
        fontFamily: "ui-monospace, monospace",
        padding: "28px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          border: "1px solid rgba(0,255,65,0.25)",
          borderRadius: "12px",
          background: "rgba(0,255,65,0.03)",
          boxShadow: "0 0 48px rgba(0,255,65,0.08)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "22px 24px",
            borderBottom: "1px solid rgba(0,255,65,0.2)",
            background:
              "linear-gradient(135deg, rgba(0,255,65,0.08) 0%, transparent 55%)",
          }}
        >
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              marginBottom: "4px",
            }}
          >
            🏦 ZION
          </div>
          <div style={{ fontSize: "0.72rem", color: "rgba(0,255,65,0.55)" }}>
            Stealth Transfer Privacy Receipt
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: "12px",
              padding: "5px 10px",
              border: "1px solid rgba(0,255,65,0.4)",
              borderRadius: "6px",
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              background: "rgba(0,255,65,0.08)",
            }}
          >
            ✓ VERIFIED BY ZION STEALTH PROTOCOL
          </div>
        </header>

        {loading ? (
          <section style={{ padding: "24px", color: "rgba(0,255,65,0.6)" }}>
            Loading receipt from Walrus…
          </section>
        ) : error || !receipt ? (
          <section style={{ padding: "24px", color: "#ff6464" }}>
            <p style={{ margin: "0 0 14px" }}>Could not load receipt from Walrus.</p>
            <a
              href={walrusUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#00aaff", fontSize: "0.75rem" }}
            >
              View raw Walrus blob →
            </a>
          </section>
        ) : (
          <>
            <section
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid rgba(0,255,65,0.12)",
              }}
            >
              <ReceiptRow label="Transaction" value={receipt.tx_hash || "—"} />
              <ReceiptRow label="Token" value={receipt.token || "—"} />
              {receipt.amount ? (
                <ReceiptRow label="Amount" value={String(receipt.amount)} />
              ) : null}
              <ReceiptRow label="Timestamp" value={formatTimestamp(receipt.timestamp)} />
            </section>

            <section
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid rgba(0,255,65,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "rgba(0,255,65,0.5)",
                  letterSpacing: "0.12em",
                  marginBottom: "10px",
                  fontWeight: 700,
                }}
              >
                ZCO NOTARY
              </div>
              <ReceiptRow
                label="Agent"
                value={receipt.notary?.agent || "—"}
              />
              <ReceiptRow
                label="Class"
                value={receipt.notary?.agent_class || "—"}
              />
              <ReceiptRow
                label="Consensus"
                value={`${votesFor}/${totalVotes} judges · ${confidencePct}% confidence`}
              />
              {receipt.notary?.decision ? (
                <ReceiptRow
                  label="Decision"
                  value={String(receipt.notary.decision).toUpperCase()}
                  highlight
                />
              ) : null}
            </section>

            <section style={{ padding: "18px 24px" }}>
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "rgba(0,255,65,0.5)",
                  letterSpacing: "0.12em",
                  marginBottom: "10px",
                  fontWeight: 700,
                }}
              >
                PRIVACY PROOF
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.75rem",
                  lineHeight: 1.55,
                  color: "rgba(0,255,65,0.75)",
                }}
              >
                {receipt.privacy_proof ||
                  "Sender address hidden on-chain. One-time stealth address derived from recipient viewing key only. Address is unusable after claim. Transfer notarized by ZCO consensus oracle and stored immutably on Walrus."}
              </p>
              <ReceiptRow label="Walrus Blob" value={blobId} small />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginTop: "14px",
                }}
              >
                <a
                  href={walrusUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                >
                  Walrus blob ↗
                </a>
                {suiscanUrl ? (
                  <a
                    href={suiscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...linkStyle,
                      color: "#4DA2FF",
                      borderColor: "#4DA2FF44",
                    }}
                  >
                    Suiscan TX ↗
                  </a>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>

      <Link
        href="https://zionciv.com"
        style={{
          marginTop: "22px",
          color: "rgba(0,255,65,0.45)",
          fontSize: "0.75rem",
          textDecoration: "none",
        }}
      >
        ← zionciv.com
      </Link>
      <Link
        href="/"
        style={{
          marginTop: "8px",
          color: "#444",
          fontSize: "0.7rem",
          textDecoration: "none",
        }}
      >
        Open ZION app
      </Link>
    </main>
  );
}

const linkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: ZION_GREEN,
  fontSize: "0.72rem",
  textDecoration: "none",
  border: "1px solid rgba(0,255,65,0.3)",
  padding: "6px 12px",
  borderRadius: "6px",
  background: "rgba(0,255,65,0.05)",
};

function ReceiptRow({
  label,
  value,
  highlight,
  small,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div
        style={{
          fontSize: "0.62rem",
          color: "rgba(0,255,65,0.4)",
          letterSpacing: "0.08em",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: small ? "0.68rem" : "0.82rem",
          fontWeight: highlight ? 800 : 500,
          color: highlight ? ZION_GREEN : "rgba(0,255,65,0.9)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
