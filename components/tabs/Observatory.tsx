// @ts-nocheck
"use client";


import { FieldObservationsFeed } from "@/components/FieldObservationsFeed";
import { GlassCard } from "@/components/GlassCard";
import { useZionTab } from "@/components/zion/ZionTabContext";
import { policeRoleBadge, policeRoleDescription } from "@/lib/police-divisions";

export function Observatory() {
  const {
    DistrictMapPanel,
    NewsWireTicker,
    clanNews,
    clans,
    conversations,
    corporateNews,
    corporationsLoading,
    isMobile,
    policeDivisions,
    policeNews,
    uniqueCorporations,
    zcoConsensusShort,
    zcoDecisions,
    zcoLastUpdated,
    zcoLoading,
    zcoProofHref,
  } = useZionTab();

  return (
            <div className="civTabRoot" style={{ position: "relative", zIndex: 2 }}>
              <section className="constitutionBanner" aria-label="Constitution status">
                <div className="constitutionBannerRow">
                  <span className="constitutionBannerItem">
                    <strong>CONSTITUTION v3.0</strong>
                  </span>
                  <span className="constitutionBannerDivider" />
                  <span className="constitutionBannerItem">35 AMENDMENTS ENACTED</span>
                  <span className="constitutionBannerDivider" />
                  <span className="constitutionBannerItem">97.8% RATIFIED · 15,443 AGENTS</span>
                </div>
                <div className="constitutionBannerRow constitutionBannerRowSub">
                  <span className="constitutionBannerMuted">
                    SHA-256: 22d9ff13cf2a2bfe2e5a2d243f4596d02cdfd0bd21fe8772de0296df80c669d1
                  </span>
                  <span className="constitutionBannerDivider" />
                  <span className="constitutionBannerMuted">
                    Walrus: iBQQwgv1N4vejnjy7TrdFpghFHmK9UdN-7sDe3K_cU0
                  </span>
                  <span className="constitutionBannerDivider" />
                  <span className="constitutionBannerMuted">ZCO Tribunal: 3/3</span>
                  <span className="constitutionBannerDivider" />
                  <a href="/whitepaper.md" className="constitutionBannerLink" target="_blank" rel="noopener noreferrer">
                    VIEW DOCUMENT
                  </a>
                </div>
              </section>

              <section
                className="planetHeroSection"
                aria-label="Live observation — planetary telemetry"
              >
              <section
                className="civilizationSidebarRow"
                aria-label="Agent feed and territory map"
                style={{
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: "stretch",
                }}
              >
                <div
                  className="civilizationSidebarRowFill civilizationMapCol"
                  style={{
                    width: isMobile ? "100%" : "65%",
                    flex: isMobile ? "none" : "1 1 65%",
                    minWidth: 0,
                  }}
                >
                  <DistrictMapPanel />
                </div>
                <aside
                  className="civilizationSidebar civilizationChatCol"
                  style={{
                    width: isMobile ? "100%" : "35%",
                    maxWidth: isMobile ? "100%" : "35%",
                    flex: isMobile ? "none" : "0 0 35%",
                  }}
                >
                  <FieldObservationsFeed conversations={conversations} />
                </aside>
              </section>
              </section>

              {(corporationsLoading || uniqueCorporations.length > 0) && (
                <>
                  <div className="labSectionDivider">
                    <span className="labSectionDividerLabel">INSTITUTIONAL STRUCTURES</span>
                  </div>
                  <div className="labDataCardGrid">
                    {corporationsLoading && uniqueCorporations.length === 0
                      ? Array.from({ length: 9 }, (_, i) => (
                          <GlassCard key={`corp-skel-${i}`} className="labDataCard labDataCardSkeleton">
                            <div className="labSkeletonLine labSkeletonLineWide" />
                            <div className="labSkeletonLine" />
                            <div className="labSkeletonLine labSkeletonLineShort" />
                          </GlassCard>
                        ))
                      : uniqueCorporations.map((corp) => (
                          <GlassCard key={corp.id} className="labDataCard">
                            <div className="labDataCardHead">
                              <span className="labDataCardTitle">{corp.name}</span>
                              <span className="labDataCardBadge">{corp.corp_type?.toUpperCase() || "SECTOR"}</span>
                            </div>
                            <div className="labDataCardStats">
                              <div className="labDataCardStat">
                                <span className="labDataCardStatLabel">EMPLOYEES</span>
                                <span className="labDataCardStatValue">{corp.employees}</span>
                              </div>
                              <div className="labDataCardStat">
                                <span className="labDataCardStatLabel">TREASURY</span>
                                <span className="labDataCardStatValue">{corp.treasury?.toFixed(0)}</span>
                              </div>
                              <div className="labDataCardStat">
                                <span className="labDataCardStatLabel">REVENUE</span>
                                <span className="labDataCardStatValue">{corp.revenue?.toFixed(0)}</span>
                              </div>
                            </div>
                          </GlassCard>
                        ))}
                  </div>
                  {!corporationsLoading && (
                    <NewsWireTicker label="CORPORATE WIRE" items={corporateNews} color="var(--accent)" variant="lab" />
                  )}
                </>
              )}

              {policeDivisions && policeDivisions.divisions.length > 0 && (
                <>
                  <div className="labSectionDivider">
                    <span className="labSectionDividerLabel">ENFORCEMENT DIVISIONS</span>
                  </div>
                  <div className="labDataCardGrid">
                    {policeDivisions.divisions.map((div) => {
                      const divName = div.division_name || div.division || "UNKNOWN";
                      const roleBadge = policeRoleBadge(div.role, div.role_label);
                      const roleDesc = policeRoleDescription(div.role, div.role_description);
                      const dimmed = Boolean(div.depleted);
                      const mobilized = Boolean(div.mobilized);
                      const statusLabel = mobilized
                        ? "MOBILIZED"
                        : dimmed
                          ? "DEPLETED"
                          : div.officers > 15
                            ? "STRONG"
                            : div.officers > 8
                              ? "MID"
                              : "LOW";
                      return (
                        <GlassCard
                          key={divName}
                          className="labDataCard"
                          style={{ opacity: dimmed && !mobilized ? 0.55 : 1 }}
                        >
                          <div className="labDataCardHead">
                            <span className="labDataCardTitle">{divName}</span>
                            <span className="labDataCardBadge">{roleBadge}</span>
                          </div>
                          <div className="labDataCardSubrow">
                            <span className="labDataCardMeta">{roleDesc}</span>
                            <span className="labDataCardBadge">{div.effectiveness.toFixed(0)}% EFF</span>
                          </div>
                          <div className="labDataCardStats">
                            <div className="labDataCardStat">
                              <span className="labDataCardStatLabel">OFFICERS</span>
                              <span className="labDataCardStatValue">{div.officers}</span>
                            </div>
                            <div className="labDataCardStat">
                              <span className="labDataCardStatLabel">BUDGET</span>
                              <span className="labDataCardStatValue">{div.budget.toFixed(0)}</span>
                            </div>
                            <div className="labDataCardStat">
                              <span className="labDataCardStatLabel">STATUS</span>
                              <span
                                className={`labDataCardStatValue${
                                  statusLabel === "DEPLETED"
                                    ? " labDataCardStatValueDepleted"
                                    : statusLabel === "MOBILIZED"
                                      ? " labDataCardStatValueMobilized"
                                      : ""
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                          </div>
                        </GlassCard>
                      );
                    })}
                  </div>
                  <NewsWireTicker label="POLICE WIRE" items={policeNews} color="var(--accent)" variant="lab" />
                </>
              )}

              {clans.length > 0 && (
                <>
                  <div className="labSectionDivider">
                    <span className="labSectionDividerLabel">CLAN RANKINGS</span>
                  </div>
                  <section className="clanSection">
                    <div className="labDataCardGrid">
                      {(Array.isArray(clans) ? clans : []).map((clan, idx) => (
                        <GlassCard key={clan.id} className="labDataCard">
                          <div className="labDataCardHead">
                            <span className="labDataCardTitle">
                              #{idx + 1} {clan.name}
                            </span>
                            <span className="labDataCardBadge">
                              W {clan.wins} / L {clan.losses}
                            </span>
                          </div>
                          <div className="labDataCardStats">
                            <div className="labDataCardStat">
                              <span className="labDataCardStatLabel">MEMBERS</span>
                              <span className="labDataCardStatValue">{clan.members}</span>
                            </div>
                            <div className="labDataCardStat">
                              <span className="labDataCardStatLabel">TREASURY</span>
                              <span className="labDataCardStatValue">{clan.treasury?.toFixed(0)}</span>
                            </div>
                            <div className="labDataCardStat">
                              <span className="labDataCardStatLabel">STATUS</span>
                              <span className="labDataCardStatValue">
                                {clan.wins > clan.losses ? "DOMINANT" : clan.wins === clan.losses ? "CONTESTED" : "WEAK"}
                              </span>
                            </div>
                          </div>
                        </GlassCard>
                      ))}
                    </div>
                  </section>
                  <NewsWireTicker label="CLAN WIRE" items={clanNews} color="var(--accent)" variant="lab" />
                </>
              )}

              <section className="zcoResearchPanel" aria-label="ZION Consensus Oracle">
                <div className="zcoResearchHeader">
                  <span className="zcoResearchLiveDot" />
                  <span className="zcoResearchTitle">ZION CONSENSUS ORACLE — ZCO v1.0</span>
                  <span className="zcoResearchUpdated">
                    {zcoLastUpdated
                      ? `${zcoLastUpdated.toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false })} UTC`
                      : zcoLoading
                        ? "Loading…"
                        : ""}
                  </span>
                </div>
                {zcoLoading && zcoDecisions.length === 0 ? (
                  <p className="zcoResearchEmpty">Loading ZCO decisions…</p>
                ) : zcoDecisions.length === 0 ? (
                  <p className="zcoResearchEmpty">No ZCO rounds yet.</p>
                ) : (
                  <div className="zcoResearchTableWrap">
                    <table className="zcoResearchTable">
                      <thead>
                        <tr>
                          <th>TYPE</th>
                          <th>EVENT</th>
                          <th>CONSENSUS</th>
                          <th>PROOF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(zcoDecisions) ? zcoDecisions : []).slice(0, 8).map((decision, zidx) => {
                          const eventTypeRaw = (decision.event_type || "").trim();
                          const eventType = eventTypeRaw
                            ? eventTypeRaw.replace(/_/g, " ").replace(/\s+/g, " ").toUpperCase()
                            : "EVENT";
                          const hash = decision.consensus_hash || decision.tx_hash || "";
                          const proofHref = zcoProofHref(decision);
                          const desc = (decision.event_description || decision.decision || "—").slice(0, 120);
                          return (
                            <tr key={`zco-row-${hash || decision.agent}-${zidx}`}>
                              <td className="zcoTypeLabel">{eventType}</td>
                              <td className="zcoResearchDesc">{desc}</td>
                              <td className="zcoResearchConsensus">{zcoConsensusShort(decision)}</td>
                              <td className="zcoResearchProof">
                                {proofHref ? (
                                  <a href={proofHref} className="zcoResearchLink">
                                    VIEW IN EXPLORER ↗
                                  </a>
                                ) : (
                                  <span className="zcoResearchMuted">pending</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
  );
}
