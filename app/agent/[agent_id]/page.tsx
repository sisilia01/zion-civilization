"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params?.agent_id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/perps/agent/${agentId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return (
      <div
        style={{
          background: "#050505",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          color: "#00ff41",
        }}
      >
        Loading agent...
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div
        style={{
          background: "#050505",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          color: "#ff4444",
        }}
      >
        Agent not found
      </div>
    );
  }

  const agentName = data.agent_name || data.portfolio?.agent_name || `Agent #${agentId}`;
  const returnPct = (((data.portfolio?.balance ?? 100) - 100) / 100) * 100;
  const isPositive = (data.portfolio?.total_pnl ?? 0) >= 0;

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
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <a
          href="/?tab=zperps"
          style={{
            color: "#333",
            fontSize: "0.65rem",
            textDecoration: "none",
            marginBottom: "24px",
            display: "inline-block",
          }}
        >
          ← Back to Z-PERPS
        </a>

        <div
          style={{
            background: "#0a0a0a",
            border: "1px solid #1a3a1a",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "16px",
            marginTop: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #00ff41, #00aa33)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.4rem",
                fontWeight: "bold",
                color: "#000",
              }}
            >
              {agentName[0] || "?"}
            </div>
            <div>
              <div
                style={{
                  color: "#fff",
                  fontSize: "1.1rem",
                  fontWeight: "bold",
                  letterSpacing: "1px",
                  marginBottom: "4px",
                }}
              >
                {agentName}
              </div>
              <div style={{ color: "#444", fontSize: "0.65rem" }}>
                ID: {agentId} • Z-PERPS Trader
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div
                style={{
                  color: isPositive ? "#00ff41" : "#ff4444",
                  fontSize: "1.4rem",
                  fontWeight: "bold",
                }}
              >
                {isPositive ? "+" : ""}
                {returnPct.toFixed(2)}%
              </div>
              <div style={{ color: "#444", fontSize: "0.6rem" }}>TOTAL RETURN</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
            {[
              {
                label: "BALANCE",
                value: `$${data.portfolio?.balance?.toFixed(2)}`,
                color: "#00ff41",
              },
              {
                label: "TOTAL PnL",
                value: `${isPositive ? "+" : ""}$${data.portfolio?.total_pnl?.toFixed(4)}`,
                color: isPositive ? "#00ff41" : "#ff4444",
              },
              { label: "TRADES", value: data.portfolio?.total_trades, color: "#fff" },
              {
                label: "WIN RATE",
                value: `${data.portfolio?.win_rate?.toFixed(0)}%`,
                color: (data.portfolio?.win_rate ?? 0) >= 50 ? "#00ff41" : "#ff4444",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "#111",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    color: "#444",
                    fontSize: "0.58rem",
                    letterSpacing: "1px",
                    marginBottom: "6px",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ color: item.color, fontSize: "0.9rem", fontWeight: "bold" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {data.positions?.length > 0 && (
          <div
            style={{
              background: "#0a0a0a",
              border: "1px solid #1a1a1a",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
            }}
          >
            <div style={{ color: "#ffaa00", fontSize: "0.65rem", letterSpacing: "2px", marginBottom: "12px" }}>
              ● OPEN POSITIONS
            </div>
            {data.positions.map((pos: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "#111",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "6px",
                }}
              >
                <div
                  style={{
                    color: pos.direction === "LONG" ? "#00ff41" : "#ff4444",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    width: "50px",
                  }}
                >
                  {pos.direction}
                </div>
                <div style={{ color: "#fff", fontSize: "0.75rem", width: "50px" }}>{pos.pair}</div>
                <div style={{ color: "#555", fontSize: "0.65rem", flex: 1 }}>
                  entry ${pos.entry?.toLocaleString()}
                </div>
                <div style={{ color: "#555", fontSize: "0.65rem" }}>size ${pos.size?.toFixed(2)}</div>
                <div style={{ color: "#ffaa00", fontSize: "0.62rem", fontWeight: "bold" }}>LIVE</div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            background: "#0a0a0a",
            border: "1px solid #1a1a1a",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid #1a1a1a",
              color: "#444",
              fontSize: "0.62rem",
              letterSpacing: "2px",
            }}
          >
            TRADE HISTORY
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 50px 1fr 1fr 90px 60px",
              padding: "8px 16px",
              borderBottom: "1px solid #0d0d0d",
              color: "#333",
              fontSize: "0.58rem",
              letterSpacing: "1px",
            }}
          >
            <div>DIR</div>
            <div>PAIR</div>
            <div>ENTRY</div>
            <div>EXIT</div>
            <div style={{ textAlign: "right" }}>PnL</div>
            <div style={{ textAlign: "right" }}>PROOF</div>
          </div>

          {data.trades?.length === 0 && (
            <div style={{ padding: "40px", textAlign: "center", color: "#333", fontSize: "0.7rem" }}>
              No trades yet
            </div>
          )}

          {data.trades?.map((t: any, i: number) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 50px 1fr 1fr 90px 60px",
                padding: "10px 16px",
                borderBottom: "1px solid #0d0d0d",
                background: i % 2 === 0 ? "transparent" : "#070707",
              }}
            >
              <div
                style={{
                  color: t.direction === "LONG" ? "#00ff41" : "#ff4444",
                  fontSize: "0.7rem",
                  fontWeight: "bold",
                }}
              >
                {t.direction}
              </div>
              <div style={{ color: "#fff", fontSize: "0.7rem" }}>{t.pair}</div>
              <div style={{ color: "#555", fontSize: "0.65rem" }}>${t.entry?.toLocaleString()}</div>
              <div style={{ color: "#555", fontSize: "0.65rem" }}>
                {t.exit ? (
                  `$${t.exit?.toLocaleString()}`
                ) : (
                  <span style={{ color: "#ffaa00" }}>OPEN</span>
                )}
              </div>
              <div
                style={{
                  textAlign: "right",
                  color: t.pnl > 0 ? "#00ff41" : t.pnl < 0 ? "#ff4444" : "#555",
                  fontSize: "0.7rem",
                  fontWeight: t.pnl ? "bold" : "normal",
                }}
              >
                {t.pnl ? `${t.pnl > 0 ? "+" : ""}$${t.pnl.toFixed(4)}` : "—"}
              </div>
              <div style={{ textAlign: "right" }}>
                {t.proof ? (
                  <a
                    href={`/zco/${t.proof}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#ffaa00", fontSize: "0.62rem", textDecoration: "none" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#ffaa00";
                    }}
                  >
                    ⚡ZCO
                  </a>
                ) : (
                  <span style={{ color: "#222", fontSize: "0.62rem" }}>—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
