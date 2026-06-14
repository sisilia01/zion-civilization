// @ts-nocheck
"use client";

import { ConstitutionBanner } from "@/components/ConstitutionBanner";
import { FieldObservationsFeed } from "@/components/FieldObservationsFeed";
import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import { useZionTab } from "@/components/zion/ZionTabContext";
import { policeRoleBadge, policeRoleDescription } from "@/lib/police-divisions";

const obsGlass = glassCardStyles.glassCardLab;

export function Observatory() {
  const {
    DistrictMapPanel,
    clans,
    conversations,
    corporationsLoading,
    isMobile,
    policeDivisions,
    uniqueCorporations,
    zcoConsensusShort,
    zcoDecisions,
    zcoLastUpdated,
    zcoLoading,
    zcoProofHref,
  } = useZionTab();

  return (
    <div className="civTabRoot" style={{ position: "relative", zIndex: 1 }}>
      <ConstitutionBanner />

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
            <GlassCard
              className={obsGlass}
              style={{ padding: 0, height: "100%", minHeight: 420, overflow: "hidden" }}
            >
              <DistrictMapPanel />
            </GlassCard>
          </div>
          <aside
            className="civilizationSidebar civilizationChatCol"
            style={{
              width: isMobile ? "100%" : "35%",
              maxWidth: isMobile ? "100%" : "35%",
              flex: isMobile ? "none" : "0 0 35%",
            }}
          >
            <GlassCard
              className={obsGlass}
              style={{ padding: 0, height: "100%", overflow: "hidden" }}
            >
              <div
                style={{
                  height: "1px",
                  background:
                    "linear-gradient(90deg, #00d4ff 0%, rgba(0,212,255,0.2) 60%, transparent 100%)",
                  borderRadius: "1px",
                }}
              />
              <FieldObservationsFeed conversations={conversations} />
            </GlassCard>
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
                  <GlassCard
                    key={`corp-skel-${i}`}
                    className={`labDataCard labDataCardSkeleton ${obsGlass}`}
                  >
                    <div className="labSkeletonLine labSkeletonLineWide" />
                    <div className="labSkeletonLine" />
                    <div className="labSkeletonLine labSkeletonLineShort" />
                  </GlassCard>
                ))
              : uniqueCorporations.map((corp) => (
                  <GlassCard key={corp.id} className={`labDataCard ${obsGlass}`}>
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
                  className={`labDataCard ${obsGlass}`}
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
        </>
      )}

      {clans.length > 0 && (
        <>
          <div className="labSectionDivider">
            <span className="labSectionDividerLabel">CLAN RANKINGS</span>
          </div>
          <section className="clanSection">
            <div className="labDataCardGrid">
              {(Array.isArray(clans) ? clans : [])
                .filter((clan) => (clan.members ?? 0) > 0)
                .map((clan, idx) => (
                  <GlassCard key={clan.id} className={`labDataCard ${obsGlass}`}>
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
                          {(clan.members ?? 0) <= 0
                            ? "DISBANDED"
                            : clan.wins > clan.losses
                              ? "DOMINANT"
                              : clan.wins === clan.losses
                                ? "CONTESTED"
                                : "WEAK"}
                        </span>
                      </div>
                    </div>
                  </GlassCard>
                ))}
            </div>
          </section>
        </>
      )}

      <GlassCard
        className={`zcoResearchPanel ${obsGlass}`}
        style={{ padding: 0, margin: "24px 0 8px" }}
      >
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
      </GlassCard>
    </div>
  );
}
