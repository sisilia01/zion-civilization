"use client";

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
    <div className="ecoTermRoot">
      <div className="ecoHudWrap">
        <header className="ecoHudHeader">
          <h2>GOVERNANCE INSTRUMENT</h2>
          <p>Economic indicators · Political structures · Central bank telemetry</p>
          {governanceHeader ? (
            <>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                ACTIVE DUTIES: {governanceHeader.active_duties}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                AMENDMENTS IN VOTING: {governanceHeader.amendments_in_voting}
              </p>
            </>
          ) : null}
        </header>

        {(ecoPolData || frsStats || politicalEconomy) && (
          <div
            className="ecoDashLayout"
            style={{
              background: "#0a0a0f",
              color: "rgba(255,255,255,0.75)",
              fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.28)",
                letterSpacing: 2,
                marginBottom: 10,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {renderPoliticalWireText(ecoPolTickerMessages[0]?.text ?? "LIVE ECO-POL FEED")}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 24,
                padding: "12px 0",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                marginBottom: 16,
              }}
            >
              <div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>POVERTY</span>
                <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                  {Number(povertyPct).toFixed(1)}%
                </span>
              </div>
              <div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>CRIME</span>
                <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                  {(peCrimeRate <= 1 ? peCrimeRate * 100 : peCrimeRate).toFixed(1)}%
                </span>
              </div>
              <div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>GINI</span>
                <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                  {Number(peGini).toFixed(2)}
                </span>
              </div>
              <div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>UNEMPLOYED</span>
                <span style={{ color: "#ff8800", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                  {Number(peUnemployment).toFixed(1)}%
                </span>
              </div>
              <div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>CORRUPTION</span>
                <span
                  style={{
                    color: hudCorruption > 50 ? "#ff4444" : "rgba(255,255,255,0.72)",
                    fontSize: 16,
                    fontWeight: 600,
                    marginLeft: 8,
                  }}
                >
                  {Math.round(hudCorruption)}%
                </span>
              </div>
            </div>

            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12 }}>
              GOVERNMENT
            </div>
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
                <div
                  style={{
                    padding: 16,
                    border: `1px solid ${partyColorWithAlpha(partyUi.color, 0.45)}`,
                    boxShadow: `0 0 12px ${partyColorWithAlpha(partyUi.color, 0.12)}`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 11, color: partyUi.color, marginBottom: 12, letterSpacing: 2 }}>EXECUTIVE</div>
                  <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>
                    {String(presidentState.agent_name)}
                  </div>
                  <div style={{ fontSize: 11, color: partyUi.color, marginBottom: 12, fontWeight: 600 }}>
                    {partyUi.label}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>APPROVAL</td>
                        <td
                          style={{
                            color: Number(presidentState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444",
                            fontSize: 13,
                            textAlign: "right",
                          }}
                        >
                          {Number(presidentState.approval_rating ?? 0)}%
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>FUND</td>
                        <td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>
                          {Math.round(Number(presidentState.personal_fund ?? 0)).toLocaleString("en-US")}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>TERM</td>
                        <td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>
                          Day {Number(presidentState.days_in_power ?? 0)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>CORRUPTION</td>
                        <td
                          style={{
                            color: Number(presidentState.corruption_index ?? 0) > 50 ? "#ff4444" : "rgba(255,255,255,0.72)",
                            fontSize: 13,
                            textAlign: "right",
                          }}
                        >
                          {Math.round(Number(presidentState.corruption_index ?? 0))}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                );
              })()}

              {sheriffState && (
                <div
                  style={{
                    padding: 16,
                    border: "1px solid rgba(120, 160, 80, 0.4)",
                    boxShadow: "0 0 12px rgba(120, 160, 80, 0.08)",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontSize: 11, color: "#78a050", marginBottom: 12, letterSpacing: 2 }}>ENFORCEMENT</div>
                  <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>
                    {String(sheriffState.agent_name)}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                    {String(sheriffState.sheriff_type || "none").toUpperCase()}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>APPROVAL</td>
                        <td
                          style={{
                            color: Number(sheriffState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444",
                            fontSize: 13,
                            textAlign: "right",
                          }}
                        >
                          {Number(sheriffState.approval_rating ?? 0)}%
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>OFFICERS</td>
                        <td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>
                          {Number(sheriffState.police_count ?? 0).toLocaleString("en-US")}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>BUDGET</td>
                        <td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>
                          {Math.round(Number(sheriffState.police_budget ?? 0)).toLocaleString("en-US")}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>TERM</td>
                        <td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>
                          Day {Number(sheriffState.days_in_office ?? 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div
                style={{
                  padding: 16,
                  border: "1px solid rgba(180, 190, 200, 0.4)",
                  boxShadow: "0 0 12px rgba(180, 190, 200, 0.08)",
                  borderRadius: 4,
                }}
              >
                {frsChief && (
                  <div
                    style={{
                      background: "#0a0a0a",
                      border: "1px solid #1a2a1a",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ color: "#444", fontSize: "0.58rem", letterSpacing: "1px", marginBottom: "4px" }}>
                      FRS CHIEF (INDEPENDENT)
                    </div>
                    <div style={{ color: "#00ff41", fontSize: "0.78rem", fontFamily: "monospace", fontWeight: "bold" }}>
                      {frsChief.name}
                    </div>
                    <div style={{ color: "#555", fontSize: "0.62rem", fontFamily: "monospace" }}>
                      Term: {frsChief.cycles_served}/{frsChief.max_cycles} cycles
                      {frsChief.confirmed ? " • Senate confirmed" : " • Pending confirmation"}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#b4bec8", marginBottom: 12, letterSpacing: 2 }}>CENTRAL BANK</div>
                <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>ZRS</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                  {String(zrsState).toUpperCase()}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>RESERVE</td>
                      <td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>
                        {ecoFormatZionShort(Number(zrsReserve))}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>RATE</td>
                      <td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{zrsRate}%</td>
                    </tr>
                    <tr>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>PHASE</td>
                      <td
                        style={{
                          color:
                            pePhase === "BOOM" ? "#00ff88" : pePhase === "DEPRESSION" ? "#ff4444" : "rgba(255,255,255,0.72)",
                          fontSize: 13,
                          textAlign: "right",
                        }}
                      >
                        {pePhase}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>METER</td>
                      <td
                        style={{
                          color: meter >= 80 ? "#ff4444" : meter >= 30 ? "rgba(255,255,255,0.72)" : "#00ff88",
                          fontSize: 13,
                          textAlign: "right",
                        }}
                      >
                        {Math.round(meter)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  padding: 16,
                  border: meter > 30 ? "1px solid rgba(255, 60, 60, 0.4)" : "1px solid rgba(0, 255, 136, 0.2)",
                  boxShadow: meter > 30 ? "0 0 12px rgba(255, 60, 60, 0.08)" : "0 0 12px rgba(0, 255, 136, 0.08)",
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: meter > 30 ? "#ff4444" : "#00ff88",
                    marginBottom: 12,
                    letterSpacing: 2,
                  }}
                >
                  STABILITY
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>METER</td>
                      <td
                        style={{
                          color: meter > 30 ? "#ff4444" : "#00ff88",
                          fontSize: 13,
                          textAlign: "right",
                        }}
                      >
                        {Math.round(meter)}%
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>PRESSURE</td>
                      <td
                        style={{
                          color: peRevPressure > 100 ? "#ff4444" : "rgba(255,255,255,0.72)",
                          fontSize: 13,
                          textAlign: "right",
                        }}
                      >
                        {Math.round(peRevPressure)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>POVERTY</td>
                      <td
                        style={{
                          color: Number(povertyPct) > 40 ? "#ff4444" : "rgba(255,255,255,0.72)",
                          fontSize: 13,
                          textAlign: "right",
                        }}
                      >
                        {Number(povertyPct).toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {partiesData.length > 0 && (
              <>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    letterSpacing: 3,
                    marginBottom: 12,
                    marginTop: 24,
                  }}
                >
                  ELECTION POLL
                </div>
                <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 12 }}>
                  {filterGovernanceParties(partiesData).map((party) => {
                    const rating = Number(party.poll_pct ?? party.approval_rating ?? 0);
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
                          }}
                        >
                          {String(party.name)}
                        </div>
                        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, rating))}%`,
                              height: "100%",
                              background: partyColor,
                              borderRadius: 2,
                            }}
                          />
                        </div>
                        <div style={{ width: 40, fontSize: 12, color: partyColor, textAlign: "right" }}>
                          {Math.round(rating)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {senateData && (
              <>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.3)",
                    letterSpacing: 3,
                    marginBottom: 12,
                    marginTop: 24,
                  }}
                >
                  SENATE
                </div>
                <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "8px 12px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
                          SENATOR
                        </th>
                        <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
                          PARTY
                        </th>
                        <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
                          APPROVAL
                        </th>
                        <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
                          ROLE
                        </th>
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
                            <tr key={`${sen.agent_name}-${sen.party_id}-${idx}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                              <td style={{ padding: "8px 0 8px 8px", borderLeft: partyBorder, fontSize: 13, color: "#fff" }}>
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
                                }}
                              >
                                {approvalValue}%
                              </td>
                              <td style={{ padding: "8px 0", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>
                                {role === "SPEAKER" ? "SPEAKER" : "SEN."}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>
              ACTIVITY LOG
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
                gap: 10,
              }}
            >
              {[
                { label: "PRESIDENT", items: presidentActionsDisplay, accent: false },
                { label: "SHERIFF", items: sheriffActionsDisplay, accent: false },
                { label: "SENATE", items: senateEventsDisplay, accent: "senate" as const },
                { label: "ZRS", items: zrsEventsDisplay, accent: "zrs" as const },
              ].map((col) => (
                <div
                  key={col.label}
                  style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}
                >
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>
                    {col.label}
                  </div>
                  {col.items.length === 0 ? (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                  ) : (
                    col.items.map((action, i) => {
                      const text = cleanActivityDescription(action.description);
                      const time = formatEventTime(action.created_at) || "—";
                      const color =
                        col.accent === "zrs"
                          ? "#00ff41"
                          : col.accent === "senate"
                            ? action.event_type === "senate_law"
                              ? "#ffd93d"
                              : "#888"
                            : /BREAKING/i.test(text)
                              ? "#ff4444"
                              : "rgba(255,255,255,0.7)";
                      return (
                        <div
                          key={`${col.label}-${i}`}
                          style={{
                            display: "flex",
                            gap: 8,
                            padding: "5px 0",
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, minWidth: 38 }}>{time}</span>
                          <span style={{ color, fontSize: 12 }}>
                            {text}
                            {"count" in action && Number(action.count) > 1 ? ` ×${action.count}` : ""}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
