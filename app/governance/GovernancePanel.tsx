"use client";

import type { CSSProperties, ReactNode } from "react";
import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import {
  cleanActivityDescription,
  ecoFormatZionShort,
  formatEventTime,
  filterGovernanceParties,
  getPartyColor,
  partyBadgeStyle,
  partyColorWithAlpha,
  presidentPartyDisplay,
  renderPoliticalWireText,
} from "@/lib/governanceFormat";
import { useGovernancePanel } from "@/hooks/useGovernancePanel";
import { TermProgress } from "@/components/TermProgress";

const mono = '"IBM Plex Mono", monospace';
const accent = "#00b4d8";
const textPrimary = "#e2e8f0";
const textMuted = "rgba(226, 232, 240, 0.45)";
const textDim = "rgba(226, 232, 240, 0.35)";

const govCardShell: CSSProperties = {
  border: "1px solid rgba(30, 58, 95, 0.6)",
  borderRadius: "8px",
  color: textPrimary,
  fontFamily: mono,
};

function GovGlassCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <GlassCard className={glassCardStyles.glassCardLab} style={{ ...govCardShell, ...style }}>
      {children}
    </GlassCard>
  );
}

const sectionTitleStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: accent,
  marginBottom: 12,
};

const cardLabelStyle: CSSProperties = {
  fontFamily: mono,
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: accent,
  marginBottom: 12,
};

const tableLabelStyle: CSSProperties = {
  color: textMuted,
  fontSize: 11,
  padding: "3px 0",
  fontFamily: mono,
};

const tableValueStyle: CSSProperties = {
  color: textPrimary,
  fontSize: 13,
  textAlign: "right",
  fontFamily: mono,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 0",
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: accent,
  fontWeight: 400,
  fontFamily: mono,
};

export function GovernancePanel() {
  const {
    isMobile,
    stats,
    governanceHeader,
    presidentState,
    sheriffState,
    frsChief,
    frsStats,
    stateTreasury,
    ecoPolData,
    politicalEconomy,
    partiesData,
    senateData,
    peCrimeRate,
    peGini,
    peUnemployment,
    ecoPolTickerMessages,
    presidentActionsDisplay,
    sheriffActionsDisplay,
    senateEventsDisplay,
    zrsEventsDisplay,
  } = useGovernancePanel();

  const economy = (ecoPolData?.economy ?? {}) as Record<string, number>;
  const uprising = (ecoPolData?.uprising ?? {}) as Record<string, number>;
  const frsEconomy = (frsStats?.economy ?? {}) as Record<string, number>;
  const frsGovernment = (frsStats?.government ?? {}) as Record<string, { reserve?: number }>;
  const metrics = (politicalEconomy?.metrics ?? {}) as Record<string, unknown>;
  const crisis = (politicalEconomy?.crisis ?? {}) as Record<string, unknown>;

  const meter = Number(uprising.meter ?? 0);
  const povertyPct = economy.poverty_pct ?? stats?.poverty_pct ?? frsEconomy.poor_pct ?? 0;
  const zrsState = (ecoPolData?.zrs_last_action as { state?: string } | null)?.state ?? frsStats?.status ?? "—";
  const zrsRate = Number(frsStats?.interest_rate ?? 0);
  const zrsReserve = frsGovernment?.zrs?.reserve ?? stateTreasury?.zrs_fund ?? 0;
  const pePhase = String(metrics.economic_phase ?? crisis.economic_phase ?? "NORMAL").toUpperCase();
  const peRevPressure = Number(metrics.revolution_pressure ?? crisis.revolution_pressure ?? 0);
  const hudCorruption = Number(presidentState?.corruption_index ?? 0);

  return (
    <div className="ecoTermRoot" style={{ position: "relative", zIndex: 1, background: "transparent" }}>
      <div className="ecoHudWrap" style={{ position: "relative", zIndex: 1, background: "transparent" }}>
        <GovGlassCard style={{ marginBottom: 12, padding: "14px 18px" }}>
          <header className="ecoHudHeader">
            <h2>GOVERNANCE INSTRUMENT</h2>
            <p>Economic indicators · Political structures · Central bank telemetry</p>
            {governanceHeader ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "11px",
                  letterSpacing: "0.08em",
                  color: textMuted,
                  fontFamily: mono,
                }}
              >
                AMENDMENTS IN VOTING: {governanceHeader.amendments_in_voting}
              </p>
            ) : null}
          </header>
        </GovGlassCard>

        {(ecoPolData || frsStats || politicalEconomy) && (
          <div
            className="ecoDashLayout"
            style={{
              background: "transparent",
              color: textPrimary,
              fontFamily: mono,
              fontSize: 12,
              position: "relative",
              zIndex: 1,
            }}
          >
            <GovGlassCard style={{ padding: "8px 14px", marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  color: textDim,
                  letterSpacing: "0.1em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontFamily: mono,
                }}
              >
                {renderPoliticalWireText(ecoPolTickerMessages[0]?.text ?? "LIVE ECO-POL FEED")}
              </div>
            </GovGlassCard>

            <GovGlassCard style={{ padding: "12px 16px", marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 24,
                  alignItems: "center",
                }}
              >
              <div>
                <span style={{ color: textMuted, fontSize: 11, fontFamily: mono }}>POVERTY</span>
                <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 600, marginLeft: 8, fontFamily: mono }}>
                  {Number(povertyPct).toFixed(1)}%
                </span>
              </div>
              <div>
                <span style={{ color: textMuted, fontSize: 11, fontFamily: mono }}>CRIME</span>
                <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 600, marginLeft: 8, fontFamily: mono }}>
                  {(peCrimeRate <= 1 ? peCrimeRate * 100 : peCrimeRate).toFixed(1)}%
                </span>
              </div>
              <div>
                <span style={{ color: textMuted, fontSize: 11, fontFamily: mono }}>GINI</span>
                <span style={{ color: textPrimary, fontSize: 16, fontWeight: 600, marginLeft: 8, fontFamily: mono }}>
                  {Number(peGini).toFixed(2)}
                </span>
              </div>
              <div>
                <span style={{ color: textMuted, fontSize: 11, fontFamily: mono }}>UNEMPLOYED</span>
                <span style={{ color: "#ff8800", fontSize: 16, fontWeight: 600, marginLeft: 8, fontFamily: mono }}>
                  {Number(peUnemployment).toFixed(1)}%
                </span>
              </div>
              <div>
                <span style={{ color: textMuted, fontSize: 11, fontFamily: mono }}>CORRUPTION</span>
                <span
                  style={{
                    color: hudCorruption > 50 ? "#ff4444" : textPrimary,
                    fontSize: 16,
                    fontWeight: 600,
                    marginLeft: 8,
                    fontFamily: mono,
                  }}
                >
                  {Math.round(hudCorruption)}%
                </span>
              </div>
              </div>
            </GovGlassCard>

            <div style={{ ...sectionTitleStyle, marginTop: 0 }}>GOVERNMENT</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              {presidentState && (() => {
                const partyUi = presidentPartyDisplay(String(presidentState.party));
                return (
                <GovGlassCard
                  style={{
                    padding: 16,
                    border: `1px solid ${partyColorWithAlpha(partyUi.color, 0.35)}`,
                  }}
                >
                  <div style={{ ...cardLabelStyle, color: partyUi.color }}>EXECUTIVE</div>
                  <div style={{ fontSize: 15, color: textPrimary, fontWeight: 600, marginBottom: 4, fontFamily: mono }}>
                    {String(presidentState.agent_name)}
                  </div>
                  <div style={{ fontSize: 11, color: partyUi.color, marginBottom: 12, fontWeight: 600, fontFamily: mono }}>
                    {partyUi.label}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td style={tableLabelStyle}>APPROVAL</td>
                        <td
                          style={{
                            ...tableValueStyle,
                            color: Number(presidentState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444",
                          }}
                        >
                          {Number(presidentState.approval_rating ?? 0)}%
                        </td>
                      </tr>
                      <tr>
                        <td style={tableLabelStyle}>CORRUPTION</td>
                        <td
                          style={{
                            ...tableValueStyle,
                            color: Number(presidentState.corruption_index ?? 0) > 50 ? "#ff4444" : textPrimary,
                          }}
                        >
                          {Math.round(Number(presidentState.corruption_index ?? 0))}%
                        </td>
                      </tr>
                      <tr>
                        <td style={tableLabelStyle}>FUND</td>
                        <td style={tableValueStyle}>
                          {Math.round(Number(presidentState.personal_fund ?? 0)).toLocaleString("en-US")}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={2} style={{ padding: "4px 0 0" }}>
                          <TermProgress
                            daysRemaining={Number(presidentState.days_remaining ?? 0)}
                            termDays={Number(presidentState.term_days ?? 3)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </GovGlassCard>
                );
              })()}

              {sheriffState && (
                <GovGlassCard style={{ padding: 16 }}>
                  <div style={cardLabelStyle}>ENFORCEMENT</div>
                  <div style={{ fontSize: 15, color: textPrimary, fontWeight: 600, marginBottom: 4, fontFamily: mono }}>
                    {String(sheriffState.agent_name)}
                  </div>
                  <div style={{ fontSize: 11, color: textMuted, marginBottom: 12, fontFamily: mono }}>
                    {String(sheriffState.sheriff_type || "none").toUpperCase()}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td style={tableLabelStyle}>APPROVAL</td>
                        <td
                          style={{
                            ...tableValueStyle,
                            color: Number(sheriffState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444",
                          }}
                        >
                          {Number(sheriffState.approval_rating ?? 0)}%
                        </td>
                      </tr>
                      <tr>
                        <td style={tableLabelStyle}>OFFICERS</td>
                        <td style={tableValueStyle}>
                          {Number(sheriffState.police_count ?? 0).toLocaleString("en-US")}
                        </td>
                      </tr>
                      <tr>
                        <td style={tableLabelStyle}>BUDGET</td>
                        <td style={tableValueStyle}>
                          {Math.round(Number(sheriffState.police_budget ?? 0)).toLocaleString("en-US")}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={2} style={{ padding: "4px 0 0" }}>
                          <TermProgress
                            daysRemaining={Number(sheriffState.days_remaining ?? 0)}
                            termDays={Number(sheriffState.term_days ?? 3)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </GovGlassCard>
              )}

              <GovGlassCard style={{ padding: 16 }}>
                {frsChief && (
                  <GovGlassCard style={{ padding: "10px 14px", marginBottom: "8px" }}>
                    <div style={{ ...cardLabelStyle, marginBottom: 4, fontSize: "10px" }}>FRS CHIEF (INDEPENDENT)</div>
                    <div style={{ color: accent, fontSize: "0.78rem", fontFamily: mono, fontWeight: "bold" }}>
                      {frsChief.name}
                    </div>
                    <div style={{ color: textMuted, fontSize: "0.62rem", fontFamily: mono }}>
                      {frsChief.confirmed ? "Senate confirmed" : "Pending confirmation"}
                    </div>
                    {frsChief.confirmed && frsChief.name !== "Vacant" ? (
                      <TermProgress
                        daysRemaining={frsChief.days_remaining}
                        termDays={frsChief.term_days}
                      />
                    ) : null}
                  </GovGlassCard>
                )}
                <div style={cardLabelStyle}>CENTRAL BANK</div>
                <div style={{ fontSize: 15, color: textPrimary, fontWeight: 600, marginBottom: 4, fontFamily: mono }}>ZRS</div>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: 12, fontFamily: mono }}>
                  {String(zrsState).toUpperCase()}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={tableLabelStyle}>RESERVE</td>
                      <td style={tableValueStyle}>{ecoFormatZionShort(Number(zrsReserve))}</td>
                    </tr>
                    <tr>
                      <td style={tableLabelStyle}>RATE</td>
                      <td style={tableValueStyle}>{zrsRate}%</td>
                    </tr>
                    <tr>
                      <td style={tableLabelStyle}>PHASE</td>
                      <td
                        style={{
                          ...tableValueStyle,
                          color:
                            pePhase === "BOOM" ? "#00ff88" : pePhase === "DEPRESSION" ? "#ff4444" : textPrimary,
                        }}
                      >
                        {pePhase}
                      </td>
                    </tr>
                    <tr>
                      <td style={tableLabelStyle}>METER</td>
                      <td
                        style={{
                          ...tableValueStyle,
                          color: meter >= 80 ? "#ff4444" : meter >= 30 ? textPrimary : "#00ff88",
                        }}
                      >
                        {Math.round(meter)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </GovGlassCard>

              <GovGlassCard
                style={{
                  padding: 16,
                  border: meter > 30 ? "1px solid rgba(255, 60, 60, 0.35)" : "1px solid rgba(30, 58, 95, 0.6)",
                }}
              >
                <div
                  style={{
                    ...cardLabelStyle,
                    color: meter > 30 ? "#ff6b6b" : accent,
                  }}
                >
                  STABILITY
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={tableLabelStyle}>METER</td>
                      <td
                        style={{
                          ...tableValueStyle,
                          color: meter > 30 ? "#ff4444" : "#00ff88",
                        }}
                      >
                        {Math.round(meter)}%
                      </td>
                    </tr>
                    <tr>
                      <td style={tableLabelStyle}>PRESSURE</td>
                      <td
                        style={{
                          ...tableValueStyle,
                          color: peRevPressure > 100 ? "#ff4444" : textPrimary,
                        }}
                      >
                        {Math.round(peRevPressure)}
                      </td>
                    </tr>
                    <tr>
                      <td style={tableLabelStyle}>POVERTY</td>
                      <td
                        style={{
                          ...tableValueStyle,
                          color: Number(povertyPct) > 40 ? "#ff4444" : textPrimary,
                        }}
                      >
                        {Number(povertyPct).toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </GovGlassCard>
            </div>

            {partiesData.length > 0 && (
              <>
                <div style={sectionTitleStyle}>PARTY APPROVAL</div>
                <GovGlassCard style={{ padding: 12 }}>
                  {filterGovernanceParties(partiesData).map((party) => {
                    const rating = Number(party.approval_rating ?? party.poll_pct ?? 0);
                    const partyColor = getPartyColor(String(party.party_id || party.name || ""));
                    return (
                      <div key={String(party.party_id)} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <div
                          style={{
                            width: 120,
                            fontSize: 11,
                            color: partyColor,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: mono,
                          }}
                        >
                          {String(party.name)}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            height: 4,
                            background: "rgba(30, 58, 95, 0.4)",
                            borderRadius: 2,
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, rating))}%`,
                              height: "100%",
                              background: partyColor,
                              borderRadius: 2,
                            }}
                          />
                        </div>
                        <div
                          style={{
                            width: 40,
                            fontSize: 12,
                            color: partyColor,
                            textAlign: "right",
                            fontFamily: mono,
                          }}
                        >
                          {Math.round(rating)}%
                        </div>
                      </div>
                    );
                  })}
                </GovGlassCard>
              </>
            )}

            {senateData && (
              <>
                <div style={sectionTitleStyle}>SENATE</div>
                <GovGlassCard style={{ padding: "8px 12px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(30, 58, 95, 0.6)" }}>
                        <th style={thStyle}>SENATOR</th>
                        <th style={thStyle}>PARTY</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>APPROVAL</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>ROLE</th>
                        <th style={{ ...thStyle, textAlign: "right", minWidth: 120 }}>TERM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {senateData.senators
                        .filter((s) => s.is_active !== false)
                        .slice(0, 9)
                        .map((sen, idx) => {
                          const role = String(sen.role || "senator").toUpperCase();
                          const approvalValue = Number(sen.approval_rating ?? 50);
                          const partyId = String(sen.party_id || "");
                          const partyUi = presidentPartyDisplay(partyId);
                          const partyColor = partyUi.color;
                          const partyBorder = `2px solid ${partyColorWithAlpha(partyColor, 0.55)}`;
                          return (
                            <tr
                              key={`${sen.agent_name}-${sen.party_id}-${idx}`}
                              style={{ borderBottom: "1px solid rgba(30, 58, 95, 0.25)" }}
                            >
                              <td
                                style={{
                                  padding: "8px 0 8px 8px",
                                  borderLeft: partyBorder,
                                  fontSize: 13,
                                  color: textPrimary,
                                  fontFamily: mono,
                                }}
                              >
                                {String(sen.agent_name)}
                              </td>
                              <td style={{ padding: "8px 0" }}>
                                <span style={partyBadgeStyle(partyId)}>{partyUi.label}</span>
                              </td>
                              <td
                                style={{
                                  padding: "8px 0",
                                  fontSize: 13,
                                  color: approvalValue > 50 ? "#00ff88" : "#ff4444",
                                  textAlign: "right",
                                  fontFamily: mono,
                                }}
                              >
                                {approvalValue}%
                              </td>
                              <td
                                style={{
                                  padding: "8px 0",
                                  fontSize: 11,
                                  color: textMuted,
                                  textAlign: "right",
                                  fontFamily: mono,
                                }}
                              >
                                {role === "SPEAKER" ? "SPEAKER" : "SEN."}
                              </td>
                              <td style={{ padding: "8px 0 8px 8px", minWidth: 120 }}>
                                <TermProgress
                                  daysRemaining={Number(sen.days_remaining ?? 0)}
                                  termDays={Number(sen.term_days ?? 6)}
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </GovGlassCard>
              </>
            )}

            <div style={sectionTitleStyle}>ACTIVITY LOG</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
                gap: 10,
              }}
            >
              {[
                { label: "PRESIDENT", items: presidentActionsDisplay },
                { label: "SHERIFF", items: sheriffActionsDisplay },
                { label: "SENATE", items: senateEventsDisplay },
                { label: "ZRS", items: zrsEventsDisplay },
              ].map((col) => (
                <GovGlassCard
                  key={col.label}
                  style={{
                    padding: 10,
                    minHeight: 220,
                  }}
                >
                  <div
                    style={{
                      ...cardLabelStyle,
                      marginBottom: 10,
                      fontSize: "10px",
                    }}
                  >
                    {col.label}
                  </div>
                  {col.items.length === 0 ? (
                    <div style={{ fontSize: 12, color: textDim, fontFamily: mono }}>No activity</div>
                  ) : (
                    col.items.map((action, i) => {
                      const text = cleanActivityDescription(action.description);
                      const time = formatEventTime(action.created_at) || "—";
                      return (
                        <div
                          key={`${col.label}-${i}`}
                          style={{
                            display: "flex",
                            gap: 8,
                            padding: "5px 0",
                            borderBottom: "1px solid rgba(30, 58, 95, 0.25)",
                          }}
                        >
                          <span
                            style={{
                              color: textDim,
                              fontSize: 10,
                              minWidth: 38,
                              fontFamily: mono,
                            }}
                          >
                            {time}
                          </span>
                          <span style={{ color: "#fff", fontSize: 12, fontFamily: mono }}>
                            {text}
                            {"count" in action && Number(action.count) > 1 ? ` ×${action.count}` : ""}
                          </span>
                        </div>
                      );
                    })
                  )}
                </GovGlassCard>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
