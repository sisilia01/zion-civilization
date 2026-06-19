// @ts-nocheck
"use client";

import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import { useZionTab } from "@/components/zion/ZionTabContext";

const CHAT_CLASSES = ["elite", "middle", "poor", "critical"] as const;

const CHAT_CLASS_META = {
  elite: {
    title: "ELITE",
    titleClass: "chatClassTitleElite",
    line1Class: "chatClassLine1Elite",
    line1: "Arrogant · Powerful · Strategic",
    line2: "The ruling class of ZION civilization",
    line3: "They control clans, wars and prophecies",
    iconVariant: "elite",
  },
  middle: {
    title: "MIDDLE CLASS",
    titleClass: "chatClassTitleMiddle",
    line1Class: "chatClassLine1Middle",
    line1: "Ambitious · Cautious · Adaptable",
    line2: "The backbone of ZION civilization",
    line3: "Surviving between power and poverty",
    iconVariant: "middle",
  },
  poor: {
    title: "POOR",
    titleClass: "chatClassTitlePoor",
    line1Class: "chatClassLine1Poor",
    line1: "Desperate · Revolutionary · Spiritual",
    line2: "The forgotten souls of ZION",
    line3: "Praying for salvation, fighting for survival",
    iconVariant: "poor",
  },
  critical: {
    title: "CRITICAL",
    titleClass: "chatClassTitlePoor",
    line1Class: "chatClassLine1Poor",
    line1: "Starving · Desperate · On the edge",
    line2: "The dying edge of ZION civilization",
    line3: "One meal from oblivion",
    iconVariant: "poor",
  },
};

export function FieldNotes() {
  const {
    AgentTile,
    ClassIcon3D,
    chatAgents,
    chatMaxBalance,
    clans,
    maxBalance,
    openChat,
    selectedClass,
    setSelectedClass,
  } = useZionTab();

  return (
            <section className="chatTabSection">
              <p className="tabIntro">
                Direct field interviews with autonomous AI subjects. Select a social cohort to initiate contact.
              </p>
              {selectedClass == null ? (
                <div className="chatClassSelector chatClassFilters chatClassFiltersFull">
                  {CHAT_CLASSES.map((cls) => {
                    const meta = CHAT_CLASS_META[cls];
                    return (
                      <button
                        key={cls}
                        type="button"
                        className={`chatClassCard ${cls} chatClassCardBig`}
                        onClick={() => setSelectedClass(cls)}
                      >
                        <div className="chatClassIcon chatClassIcon3D" aria-hidden>
                          <ClassIcon3D variant={meta.iconVariant} />
                        </div>
                        <div className={`chatClassHead ${meta.titleClass}`}>{meta.title}</div>
                        <p className={`chatClassLine1 ${meta.line1Class}`}>{meta.line1}</p>
                        <p className="chatClassLine2">{meta.line2}</p>
                        <p className="chatClassLine3">{meta.line3}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <button type="button" className="chatClassBackBtn" onClick={() => setSelectedClass(null)}>
                    ← Choose different class
                  </button>
                  <div className="agentGrid">
                    {chatAgents.slice(0, 12).map((agent) => (
                      <GlassCard
                        key={`chat-${agent.id}`}
                        className={glassCardStyles.glassCard}
                        style={{ border: "1px solid #1e3a5f", borderRadius: "6px", padding: "16px" }}
                      >
                        <AgentTile agent={agent} maxBalance={chatMaxBalance} onClick={() => openChat(agent)} />
                      </GlassCard>
                    ))}
                  </div>
                </>
              )}
            </section>
  );
}
