"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

export default function ZCOProofPage() {
  const params = useParams();
  const blobId = params?.blob_id as string;
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rawWalrusUrl, setRawWalrusUrl] = useState(
    () => `${WALRUS_AGGREGATOR}/v1/blobs/${blobId ?? ""}`,
  );

  useEffect(() => {
    if (!blobId) return;
    const urls = [
      `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
      `https://wal-aggregator-testnet.staketab.org/v1/blobs/${blobId}`,
    ];

    const tryFetch = async () => {
      setLoading(true);
      setError("");
      for (const url of urls) {
        try {
          const r = await fetch(url);
          if (r.ok) {
            const d = await r.json();
            setData(d);
            setRawWalrusUrl(url);
            setLoading(false);
            return;
          }
        } catch {
          /* try next URL */
        }
      }
      setError("Proof not found on Walrus");
      setLoading(false);
    };

    tryFetch();
  }, [blobId]);

  const tradeProof = data?.type === "TRADE_PROOF" ? data : null;

  return (
    <div
      style={{
        background: "#050505",
        minHeight: "100vh",
        padding: "40px 20px",
        fontFamily: "monospace",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: "700px", margin: "0 auto" }}>
        <div
          style={{
            color: "#00ff41",
            fontSize: "1.1rem",
            fontWeight: "bold",
            letterSpacing: "2px",
            marginBottom: "4px",
          }}
        >
          ⚡ ZCO PROOF
        </div>
        <div style={{ color: "#444", fontSize: "0.7rem", marginBottom: "24px" }}>
          ZION Consensus Oracle — Verified on Walrus
        </div>

        <div
          style={{
            background: "#0a0a0a",
            border: "1px solid #1a3a1a",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <div style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "1px", marginBottom: "8px" }}>
            BLOB ID
          </div>
          <div style={{ color: "#00ff41", fontSize: "0.72rem", wordBreak: "break-all" }}>{blobId}</div>
        </div>

        {loading && (
          <div style={{ color: "#444", textAlign: "center", padding: "40px" }}>Loading proof from Walrus...</div>
        )}

        {error && (
          <div
            style={{
              color: "#ff4444",
              background: "#1a0a0a",
              border: "1px solid #3a1a1a",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            {error}
          </div>
        )}

        {data && !loading && (
          <div
            style={{
              background: "#0a0a0a",
              border: "1px solid #1a1a1a",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div style={{ color: "#555", fontSize: "0.6rem", letterSpacing: "1px", marginBottom: "12px" }}>
              PROOF DATA
            </div>

            {tradeProof && (
              <div>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
                  {[
                    { label: "AGENT", value: String(tradeProof.agent_id ?? "—") },
                    { label: "PAIR", value: String(tradeProof.pair ?? "—") },
                    { label: "DIRECTION", value: String(tradeProof.direction ?? "—") },
                    {
                      label: "PnL",
                      value: `+$${parseFloat(String(tradeProof.pnl ?? 0)).toFixed(4)}`,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      role={item.label === "AGENT" && tradeProof.agent_id ? "button" : undefined}
                      tabIndex={item.label === "AGENT" && tradeProof.agent_id ? 0 : undefined}
                      onClick={
                        item.label === "AGENT" && tradeProof.agent_id
                          ? () => {
                              window.location.href = `/agent/${tradeProof.agent_id}`;
                            }
                          : undefined
                      }
                      onKeyDown={
                        item.label === "AGENT" && tradeProof.agent_id
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                window.location.href = `/agent/${tradeProof.agent_id}`;
                              }
                            }
                          : undefined
                      }
                      style={{
                        background: "#111",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        cursor: item.label === "AGENT" && tradeProof.agent_id ? "pointer" : undefined,
                      }}
                    >
                      <div
                        style={{
                          color: "#444",
                          fontSize: "0.58rem",
                          letterSpacing: "1px",
                          marginBottom: "4px",
                        }}
                      >
                        {item.label}
                      </div>
                      <div style={{ color: "#00ff41", fontSize: "0.82rem", fontWeight: "bold" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    {
                      label: "ENTRY PRICE",
                      value: `$${parseFloat(String(tradeProof.entry_price ?? 0)).toLocaleString()}`,
                    },
                    {
                      label: "EXIT PRICE",
                      value: `$${parseFloat(String(tradeProof.exit_price ?? 0)).toLocaleString()}`,
                    },
                    {
                      label: "PnL %",
                      value: `+${parseFloat(String(tradeProof.pnl_percent ?? 0)).toFixed(4)}%`,
                    },
                    {
                      label: "TIMESTAMP",
                      value: tradeProof.timestamp
                        ? new Date(String(tradeProof.timestamp)).toLocaleString()
                        : "—",
                    },
                  ].map((item) => (
                    <div key={item.label} style={{ background: "#111", borderRadius: "8px", padding: "10px 14px" }}>
                      <div
                        style={{
                          color: "#444",
                          fontSize: "0.58rem",
                          letterSpacing: "1px",
                          marginBottom: "4px",
                        }}
                      >
                        {item.label}
                      </div>
                      <div style={{ color: "#fff", fontSize: "0.75rem" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!tradeProof && (
              <pre
                style={{
                  color: "#00ff41",
                  fontSize: "0.7rem",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(data, null, 2)}
              </pre>
            )}

            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                background: "#050f05",
                border: "1px solid #1a3a1a",
                borderRadius: "8px",
              }}
            >
              <div style={{ color: "#00ff41", fontSize: "0.65rem", marginBottom: "4px" }}>
                ✅ VERIFIED ON WALRUS
              </div>
              <a
                href={rawWalrusUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#555", fontSize: "0.6rem", textDecoration: "none" }}
              >
                View raw data ↗
              </a>
            </div>
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <a href="/" style={{ color: "#333", fontSize: "0.65rem", textDecoration: "none" }}>
            ← Back to ZION
          </a>
        </div>
      </div>
    </div>
  );
}
