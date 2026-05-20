import Link from "next/link";

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const ZCO_ACCENT = "#a78bfa";
const ZCO_GREEN = "#00ff41";
const SUI_BLUE = "#4DA2FF";

type ZcoVote = {
  judge: string;
  decision: string;
  confidence?: number;
  status: string;
};

type ZcoConsensus = {
  decision?: string;
  method?: string;
  agreement?: number;
  avg_confidence?: number;
  votes_for?: number;
  total_votes?: number;
};

type ZcoProof = {
  type?: string;
  agent?: string;
  agent_class?: string;
  decision?: string;
  consensus?: ZcoConsensus;
  votes?: ZcoVote[];
  timestamp?: string;
  consensus_hash?: string;
  sui_url?: string;
  blob_id?: string;
};

async function fetchProof(blobId: string): Promise<ZcoProof | null> {
  try {
    const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return (await res.json()) as ZcoProof;
  } catch {
    return null;
  }
}

function formatTimestamp(ts?: string): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).replace(",", "");
  } catch {
    return ts;
  }
}

function judgeLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("deepseek")) return "DeepSeek";
  if (n.includes("gemini")) return "Gemini";
  if (n.includes("gpt")) return "GPT";
  return name;
}

export default async function ZcoProofPage({
  params,
}: {
  params: Promise<{ blob_id: string }>;
}) {
  const { blob_id: blobId } = await params;
  const proof = await fetchProof(blobId);
  const walrusUrl = `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;

  const consensus = proof?.consensus;
  const finalDecision = (consensus?.decision || proof?.decision || "—").toUpperCase();
  const method = consensus?.method || "—";
  const votesFor = consensus?.votes_for ?? 0;
  const totalVotes = consensus?.total_votes ?? proof?.votes?.length ?? 0;
  const agreementPct = Math.round(
    (consensus?.agreement ?? (totalVotes ? votesFor / totalVotes : 0)) * 100
  );
  const consensusLine =
    method === "consensus" && totalVotes > 0
      ? `CONSENSUS ${votesFor}/${totalVotes} — ${agreementPct}%`
      : "DEADLOCK";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050508",
        color: "#e5e5e5",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        padding: "32px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          border: `1px solid ${ZCO_ACCENT}44`,
          borderRadius: "12px",
          background: "rgba(167,139,250,0.04)",
          boxShadow: `0 0 40px ${ZCO_ACCENT}18`,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${ZCO_ACCENT}33`,
            background: `linear-gradient(135deg, ${ZCO_ACCENT}12 0%, transparent 60%)`,
          }}
        >
          <div style={{ fontSize: "1.35rem", fontWeight: 800, color: ZCO_ACCENT, letterSpacing: "0.04em" }}>
            🔮 ZCO CONSENSUS PROOF
          </div>
          <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "6px", letterSpacing: "0.08em" }}>
            ZION Consensus Oracle v1.0
          </div>
        </header>

        {!proof ? (
          <section style={{ padding: "24px" }}>
            <p style={{ color: "#ff6464", margin: "0 0 16px" }}>Could not load proof from Walrus.</p>
            <a
              href={walrusUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: ZCO_GREEN, fontSize: "0.8rem" }}
            >
              View raw blob on Walrus ↗
            </a>
          </section>
        ) : (
          <>
            <section
              style={{
                padding: "18px 24px",
                borderBottom: `1px solid ${ZCO_ACCENT}22`,
              }}
            >
              <Row label="Agent" value={`${proof.agent || "—"} (${proof.agent_class || "—"})`} />
              <Row label="Decision" value={finalDecision} highlight />
              <Row label="Timestamp" value={formatTimestamp(proof.timestamp)} />
            </section>

            <section
              style={{
                padding: "18px 24px",
                borderBottom: `1px solid ${ZCO_ACCENT}22`,
              }}
            >
              <div
                style={{
                  fontSize: "0.65rem",
                  color: ZCO_ACCENT,
                  letterSpacing: "0.12em",
                  marginBottom: "12px",
                  fontWeight: 700,
                }}
              >
                JUDGE VOTES
              </div>
              {(proof.votes || []).map((vote) => {
                const ok = vote.status === "voted";
                const pct = Math.round((vote.confidence ?? 0) * 100);
                const pad = judgeLabel(vote.judge).padEnd(8, " ");
                return (
                  <div
                    key={vote.judge}
                    style={{
                      fontSize: "0.82rem",
                      color: ok ? ZCO_GREEN : "#666",
                      marginBottom: "8px",
                      whiteSpace: "pre",
                    }}
                  >
                    🤖 {pad} {vote.decision.toUpperCase()} {ok ? "✓" : "✗"} ({pct}%)
                  </div>
                );
              })}
            </section>

            <section
              style={{
                padding: "18px 24px",
                borderBottom: `1px solid ${ZCO_ACCENT}22`,
              }}
            >
              <div style={{ fontSize: "0.9rem", fontWeight: 800, color: ZCO_GREEN, marginBottom: "6px" }}>
                {consensusLine}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#888" }}>Method: {method}</div>
            </section>

            <section style={{ padding: "18px 24px" }}>
              <Row label="ZCO Hash" value={proof.consensus_hash || "—"} mono />
              <Row label="Walrus Blob" value={blobId} mono small />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "14px" }}>
                <a
                  href={walrusUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: ZCO_GREEN,
                    fontSize: "0.75rem",
                    textDecoration: "none",
                    border: `1px solid ${ZCO_GREEN}44`,
                    padding: "6px 12px",
                    borderRadius: "6px",
                    background: "rgba(0,255,65,0.06)",
                  }}
                >
                  🔗 View raw on Walrus ↗
                </a>
                {proof.sui_url ? (
                  <a
                    href={proof.sui_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      color: SUI_BLUE,
                      fontSize: "0.75rem",
                      textDecoration: "none",
                      border: `1px solid ${SUI_BLUE}44`,
                      padding: "6px 12px",
                      borderRadius: "6px",
                      background: "rgba(77,162,255,0.1)",
                    }}
                  >
                    🔗 View Sui TX on Suiscan ↗
                  </a>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>

      <Link
        href="/"
        style={{
          marginTop: "24px",
          color: "#666",
          fontSize: "0.75rem",
          textDecoration: "none",
        }}
      >
        ← Back to ZION Civilization
      </Link>
    </main>
  );
}

function Row({
  label,
  value,
  highlight,
  mono,
  small,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "0.65rem", color: "#666", letterSpacing: "0.08em", marginBottom: "4px" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: small ? "0.7rem" : "0.88rem",
          fontWeight: highlight ? 800 : 500,
          color: highlight ? "#00ff41" : "#fff",
          fontFamily: mono ? "ui-monospace, monospace" : undefined,
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
