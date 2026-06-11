// @ts-nocheck
"use client";


import { useZionTab } from "@/components/zion/ZionTabContext";

export function Governance() {
  const {
    cleanActivityDescription,
    corporations,
    ecoEconomicPhaseColor,
    ecoFormatZionShort,
    ecoPolData,
    ecoPolTickerMessages,
    ecoRevMeterColor,
    ecoZrsStateColor,
    formatEventTime,
    formatLawProposer,
    frsChief,
    frsStats,
    getLawStatusStyle,
    getPartyColor,
    isMobile,
    partiesData,
    peCrimeRate,
    peGini,
    peUnemployment,
    politicalEconomy,
    presidentActionsDisplay,
    presidentPartyDisplay,
    presidentState,
    renderPoliticalWireText,
    senateData,
    senateEventsDisplay,
    sheriffActionsDisplay,
    sheriffState,
    stateTreasury,
    stats,
    zrsEventsDisplay,
  } = useZionTab();

  return (
            <div className="ecoTermRoot">
              <div className="ecoHudWrap">
                <header className="ecoHudHeader">
                  <h2>GOVERNANCE INSTRUMENT</h2>
                  <p>Economic indicators · Political structures · Central bank telemetry</p>
                </header>

                {(ecoPolData || frsStats || politicalEconomy) && (() => {
                  const meter = ecoPolData?.uprising?.meter ?? 0;
                  const revMeterColor = ecoRevMeterColor(meter);
                  const povertyPct =
                    ecoPolData?.economy.poverty_pct ??
                    stats?.poverty_pct ??
                    frsStats?.economy.poor_pct ??
                    0;
                  const povertyColor =
                    povertyPct < 20 ? "#00ff88" : povertyPct < 40 ? "#ffd700" : povertyPct < 60 ? "#ff8800" : "#ff4444";
                  const zrsState = ecoPolData?.zrs_last_action?.state ?? frsStats?.status ?? "—";
                  const zrsStateColor = ecoZrsStateColor(zrsState);
                  const zrsRate = frsStats?.interest_rate ?? 0;
                  const zrsReserve =
                    frsStats?.government?.zrs?.reserve ?? stateTreasury?.zrs_fund ?? 0;
                  const avgBal = ecoPolData?.economy.avg_balance ?? frsStats?.economy.avg_balance ?? 0;
                  const totalZion = ecoPolData?.economy.total_zion ?? frsStats?.economy.total_money ?? 0;
                  const corpActive = ecoPolData?.corporations.active ?? frsStats?.corporations.count ?? 0;
                  const corpTreasury =
                    ecoPolData?.corporations.total_treasury ?? frsStats?.corporations.total_treasury ?? 0;

                  const presidentPower = Number(politicalEconomy?.power?.scores?.president_power ?? 0);
                  const sheriffPower = Number(politicalEconomy?.power?.scores?.sheriff_power ?? 0);
                  const senatePower = Number(politicalEconomy?.power?.scores?.senate_power ?? 0);
                  const totalPower = (presidentPower || 0) + (sheriffPower || 0) + (senatePower || 0);
                  const presidentPct = totalPower > 0 ? Math.round(((presidentPower || 0) / totalPower) * 100) : 0;
                  const sheriffPct = totalPower > 0 ? Math.round(((sheriffPower || 0) / totalPower) * 100) : 0;
                  const senatePct = totalPower > 0 ? Math.round(((senatePower || 0) / totalPower) * 100) : 0;
                  const powerBar = (pct: number) => {
                    const blocks = 20;
                    const filled = Math.max(0, Math.min(blocks, Math.round((pct / 100) * blocks)));
                    return `${"█".repeat(filled)}${"░".repeat(blocks - filled)}`;
                  };
                  const crisisActive = Boolean(politicalEconomy?.crisis?.is_active);
                  const peCrime = Number(
                    politicalEconomy?.metrics?.crime_rate ?? politicalEconomy?.crisis?.crime_rate ?? 0
                  );
                  const peCrimePct = peCrime > 1 ? peCrime / 100 : peCrime;
                  const pePoliceEff = Number(
                    politicalEconomy?.metrics?.police_effectiveness ??
                      politicalEconomy?.crisis?.police_effectiveness ??
                      0
                  );
                  const pePoliceEffPct = pePoliceEff > 1 ? pePoliceEff / 100 : pePoliceEff;
                  const peRevPressure = Number(
                    politicalEconomy?.metrics?.revolution_pressure ??
                      politicalEconomy?.crisis?.revolution_pressure ??
                      0
                  );
                  const pePhase = (
                    politicalEconomy?.metrics?.economic_phase ??
                    politicalEconomy?.crisis?.economic_phase ??
                    "NORMAL"
                  ).toUpperCase();
                  const pePhaseColor = ecoEconomicPhaseColor(pePhase);
                  const peGangs = politicalEconomy?.gangs ?? [];
                  const dictatorshipRisk = presidentPower > sheriffPower + senatePower;
                  const coupRisk = sheriffPower > presidentPower * 1.5;

                  const gridGov = isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))";
                  const grid4 = isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))";
                  const grid3 = isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))";
                  const grid2 = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";
                  const hudPoverty = Number(povertyPct);
                  const hudCorruption = Number(presidentState?.corruption_index ?? 0);
                  const hudCrimePct = peCrimeRate;
                  const hudGini = peGini;
                  const hudUnemployment = peUnemployment;

                  const politicalWireItems: WireNewsItem[] = ecoPolTickerMessages.map((msg) => ({
                    text: msg.text,
                    type: msg.breaking ? "breaking" : undefined,
                  }));

                  return (
                    <div
                      className="ecoDashLayout"
                      style={{
                        background: "#0a0a0f",
                        color: "rgba(255,255,255,0.75)",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
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
                        {renderPoliticalWireText(politicalWireItems[0]?.text ?? "LIVE ECO-POL FEED")}
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
                            {povertyPct.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>CRIME</span>
                          <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                            {(hudCrimePct <= 1 ? hudCrimePct * 100 : hudCrimePct).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>GINI</span>
                          <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                            {hudGini.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>UNEMPLOYED</span>
                          <span style={{ color: "#ff8800", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                            {hudUnemployment.toFixed(1)}%
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

                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12 }}>GOVERNMENT</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        {presidentState && (
                          <div style={{ padding: 16, border: "1px solid rgba(255, 200, 50, 0.4)", boxShadow: "0 0 12px rgba(255, 200, 50, 0.08)", borderRadius: 4 }}>
                            <div style={{ fontSize: 11, color: "#ffc832", marginBottom: 12, letterSpacing: 2 }}>
                              EXECUTIVE
                            </div>
                            <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>
                              {presidentState.agent_name}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                              {presidentPartyDisplay(presidentState.party).label}
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>APPROVAL</td><td style={{ color: (presidentState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444", fontSize: 13, textAlign: "right" }}>{presidentState.approval_rating ?? 0}%</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>FUND</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(presidentState.personal_fund ?? 0).toLocaleString("en-US")}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>TERM</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>Day {presidentState.days_in_power ?? 0}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>CORRUPTION</td><td style={{ color: (presidentState.corruption_index ?? 0) > 50 ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(presidentState.corruption_index ?? 0)}%</td></tr>
                              </tbody>
                            </table>
                          </div>
                        )}

                        {sheriffState && (
                          <div style={{ padding: 16, border: "1px solid rgba(120, 160, 80, 0.4)", boxShadow: "0 0 12px rgba(120, 160, 80, 0.08)", borderRadius: 4 }}>
                            <div style={{ fontSize: 11, color: "#78a050", marginBottom: 12, letterSpacing: 2 }}>
                              ENFORCEMENT
                            </div>
                            <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>
                              {sheriffState.agent_name}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                              {String(sheriffState.sheriff_type || "none").toUpperCase()}
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>APPROVAL</td><td style={{ color: (sheriffState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444", fontSize: 13, textAlign: "right" }}>{sheriffState.approval_rating ?? 0}%</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>OFFICERS</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{(sheriffState.police_count ?? 0).toLocaleString("en-US")}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>BUDGET</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(sheriffState.police_budget ?? 0).toLocaleString("en-US")}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>TERM</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>Day {sheriffState.days_in_office ?? 0}</td></tr>
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div style={{ padding: 16, border: "1px solid rgba(180, 190, 200, 0.4)", boxShadow: "0 0 12px rgba(180, 190, 200, 0.08)", borderRadius: 4 }}>
                          {frsChief && (
                            <div style={{background:'#0a0a0a', border:'1px solid #1a2a1a',
                                         borderRadius:'8px', padding:'10px 14px', marginBottom:'8px'}}>
                              <div style={{color:'#444', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                                FRS CHIEF (INDEPENDENT)
                              </div>
                              <div style={{color:'#00ff41', fontSize:'0.78rem', fontFamily:'monospace', fontWeight:'bold'}}>
                                {frsChief.name}
                              </div>
                              <div style={{color:'#555', fontSize:'0.62rem', fontFamily:'monospace'}}>
                                Term: {frsChief.cycles_served}/{frsChief.max_cycles} cycles
                                {frsChief.confirmed ? ' • Senate confirmed' : ' • Pending confirmation'}
                              </div>
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: "#b4bec8", marginBottom: 12, letterSpacing: 2 }}>
                            CENTRAL BANK
                          </div>
                          <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>ZRS</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                            {String(zrsState).toUpperCase()}
                          </div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>RESERVE</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{ecoFormatZionShort(zrsReserve)}</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>RATE</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{zrsRate}%</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>PHASE</td><td style={{ color: pePhase === "BOOM" ? "#00ff88" : pePhase === "DEPRESSION" ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{pePhase}</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>METER</td><td style={{ color: meter >= 80 ? "#ff4444" : meter >= 30 ? "rgba(255,255,255,0.72)" : "#00ff88", fontSize: 13, textAlign: "right" }}>{Math.round(meter)}%</td></tr>
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
                          <div style={{ fontSize: 11, color: meter > 30 ? "#ff4444" : "#00ff88", marginBottom: 12, letterSpacing: 2 }}>
                            STABILITY
                          </div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>METER</td><td style={{ color: meter > 30 ? "#ff4444" : "#00ff88", fontSize: 13, textAlign: "right" }}>{Math.round(meter)}%</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>PRESSURE</td><td style={{ color: peRevPressure > 100 ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(peRevPressure)}</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>POVERTY</td><td style={{ color: povertyPct > 40 ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{povertyPct.toFixed(1)}%</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>POWER DISTRIBUTION</div>
                      <div style={{ marginTop: 4, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 12 }}>
                        {[
                          { label: "PRESIDENT", pct: presidentPct, color: "#00ff88" },
                          { label: "SHERIFF", pct: sheriffPct, color: "rgba(255,255,255,0.5)" },
                          { label: "SENATE", pct: senatePct, color: "#4488ff" },
                        ].map((item) => (
                          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                            <div style={{ width: 80, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{item.label}</div>
                            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                              <div style={{ width: `${item.pct}%`, height: "100%", background: item.color, borderRadius: 2 }} />
                            </div>
                            <div style={{ width: 35, fontSize: 12, color: item.color, textAlign: "right" }}>{item.pct}%</div>
                          </div>
                        ))}
                      </div>

                      {partiesData && partiesData.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>ELECTION POLL</div>
                          <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 12 }}>
                            {(Array.isArray(partiesData) ? partiesData : []).slice(0, 3).map((party) => {
                              const rating = Number(party.poll_pct ?? party.approval_rating ?? 0);
                              const partyColor = getPartyColor(String(party.party_id || party.name || ""));
                              return (
                                <div key={party.party_id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                  <div style={{ width: 120, fontSize: 11, color: partyColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {party.name}
                                  </div>
                                  <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                    <div style={{ width: `${Math.max(0, Math.min(100, rating))}%`, height: "100%", background: partyColor, borderRadius: 2 }} />
                                  </div>
                                  <div style={{ width: 40, fontSize: 12, color: partyColor, textAlign: "right" }}>{Math.round(rating)}%</div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {senateData && (
                        <>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>SENATE</div>
                          <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "8px 12px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>SENATOR</th>
                                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>PARTY</th>
                                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>APPROVAL</th>
                                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>ROLE</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(Array.isArray(senateData.senators) ? senateData.senators : [])
                                  .filter((s) => s.is_active !== false)
                                  .slice(0, 9)
                                  .map((sen, idx) => {
                                    const role = String(sen.role || "senator").toUpperCase();
                                    const approvalValue = Number(sen.approval_rating ?? 50);
                                    const partyName = String(sen.party_id || "");
                                    const partyColor = getPartyColor(partyName);
                                    const partyBorder = `2px solid ${partyColor.replace(")", ", 0.6)").replace("rgb(", "rgba(")}`;
                                    return (
                                      <tr key={`${sen.agent_name}-${sen.party_id}-${idx}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                        <td style={{ padding: "8px 0 8px 8px", borderLeft: partyBorder, fontSize: 13, color: "#fff" }}>{sen.agent_name}</td>
                                        <td style={{ padding: "8px 0", fontSize: 11, color: partyColor }}>{sen.party_id}</td>
                                        <td style={{ padding: "8px 0", fontSize: 13, color: approvalValue > 50 ? "#00ff88" : "#ff4444", textAlign: "right" }}>{approvalValue}%</td>
                                        <td style={{ padding: "8px 0", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>{role === "SPEAKER" ? "SPEAKER" : "SEN."}</td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>

                          {((senateData.pending_laws?.length ?? 0) + (senateData.recent_laws?.length ?? 0) > 0) && (
                            <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "8px 12px", marginTop: 10 }}>
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>TIME</th>
                                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div
                                          style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: "50%",
                                            background: "#00ff41",
                                            animation: "pulse 2s infinite",
                                            boxShadow: "0 0 6px #00ff41",
                                          }}
                                        />
                                        <span>LAW</span>
                                      </div>
                                    </th>
                                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>VOTES</th>
                                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>STATUS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    ...(Array.isArray(senateData.pending_laws) ? senateData.pending_laws : []),
                                    ...(Array.isArray(senateData.recent_laws) ? senateData.recent_laws : []),
                                  ]
                                    .slice(0, 8)
                                    .map((law) => {
                                      const statusStyle = getLawStatusStyle(law.status);
                                      const proposer = formatLawProposer(law.proposed_by);
                                      return (
                                        <tr key={`law-${law.id}-${law.status}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                          <td
                                            style={{
                                              color: "#444",
                                              fontSize: "0.6rem",
                                              fontFamily: "monospace",
                                              paddingRight: 12,
                                              whiteSpace: "nowrap",
                                              verticalAlign: "top",
                                              paddingTop: 10,
                                            }}
                                          >
                                            {formatEventTime(String(law.voted_at || law.created_at || law.proposed_at || "")) || "—"}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 0 8px 8px",
                                              borderLeft: statusStyle.border,
                                              fontSize: 13,
                                              color: "rgba(255,255,255,0.72)",
                                            }}
                                          >
                                            <div>{law.title}</div>
                                            {proposer ? (
                                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                                                by {proposer}
                                              </div>
                                            ) : null}
                                          </td>
                                          <td style={{ padding: "8px 0", fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", whiteSpace: "nowrap" }}>
                                            FOR {law.votes_for} / AGAINST {law.votes_against}
                                          </td>
                                          <td style={{ padding: "8px 0", fontSize: 12, color: statusStyle.color, textAlign: "right", fontWeight: 600 }}>
                                            {statusStyle.label}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}

                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12 }}>ACTIVITY LOG</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
                          gap: 10,
                        }}
                      >
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>PRESIDENT</div>
                          {presidentActionsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            presidentActionsDisplay.map((action, i) => {
                              const text = cleanActivityDescription(action.description);
                              return (
                                <div key={`pa-${i}`} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, minWidth: 38 }}>
                                  {formatEventTime(action.created_at) || "—"}
                                </span>
                                  <span style={{ color: /BREAKING/i.test(text) ? "#ff4444" : "rgba(255,255,255,0.7)", fontSize: 12 }}>
                                    {text}
                                    {action.count > 1 ? ` ×${action.count}` : ""}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>SHERIFF</div>
                          {sheriffActionsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            sheriffActionsDisplay.map((action, i) => {
                              const text = cleanActivityDescription(action.description);
                              return (
                                <div key={`sa-${i}`} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, minWidth: 38 }}>
                                  {formatEventTime(action.created_at) || "—"}
                                </span>
                                  <span style={{ color: /BREAKING/i.test(text) ? "#ff4444" : "rgba(255,255,255,0.7)", fontSize: 12 }}>
                                    {text}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>SENATE</div>
                          {senateEventsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            senateEventsDisplay.map((e, i) => {
                              const time = formatEventTime(e.created_at) || "—";
                              const text = cleanActivityDescription(e.description);
                              return (
                                <div
                                  key={`sne-${i}`}
                                  style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                                >
                                  <span style={{ color: "#555", fontSize: "0.6rem", minWidth: 38 }}>{time}</span>
                                  <span
                                    style={{
                                      color: e.event_type === "senate_law" ? "#ffd93d" : "#888",
                                      fontSize: 12,
                                    }}
                                  >
                                    {text}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>ZRS</div>
                          {zrsEventsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            zrsEventsDisplay.map((e, i) => {
                              const time = formatEventTime(e.created_at) || "—";
                              const text = cleanActivityDescription(e.description);
                              return (
                                <div
                                  key={`zrs-${i}`}
                                  style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                                >
                                  <span style={{ color: "#555", fontSize: "0.6rem", minWidth: 38 }}>{time}</span>
                                  <span style={{ color: "#00ff41", fontSize: 12 }}>{text}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
  );
}
