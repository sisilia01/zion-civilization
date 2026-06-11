// @ts-nocheck
"use client";

import { useZionTab } from "@/components/zion/ZionTabContext";

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
                  <button type="button" className="chatClassCard elite chatClassCardBig" onClick={() => setSelectedClass("elite")}>
                    <div className="chatClassIcon chatClassIcon3D" aria-hidden>
                      <ClassIcon3D variant="elite" />
                    </div>
                    <div className="chatClassHead chatClassTitleElite">ELITE</div>
                    <p className="chatClassLine1 chatClassLine1Elite">Arrogant · Powerful · Strategic</p>
                    <p className="chatClassLine2">The ruling class of ZION civilization</p>
                    <p className="chatClassLine3">They control clans, wars and prophecies</p>
                  </button>
                  <button type="button" className="chatClassCard middle chatClassCardBig" onClick={() => setSelectedClass("middle")}>
                    <div className="chatClassIcon chatClassIcon3D" aria-hidden>
                      <ClassIcon3D variant="middle" />
                    </div>
                    <div className="chatClassHead chatClassTitleMiddle">MIDDLE CLASS</div>
                    <p className="chatClassLine1 chatClassLine1Middle">Ambitious · Cautious · Adaptable</p>
                    <p className="chatClassLine2">The backbone of ZION civilization</p>
                    <p className="chatClassLine3">Surviving between power and poverty</p>
                  </button>
                  <button type="button" className="chatClassCard poor chatClassCardBig" onClick={() => setSelectedClass("poor")}>
                    <div className="chatClassIcon chatClassIcon3D" aria-hidden>
                      <ClassIcon3D variant="poor" />
                    </div>
                    <div className="chatClassHead chatClassTitlePoor">POOR</div>
                    <p className="chatClassLine1 chatClassLine1Poor">Desperate · Revolutionary · Spiritual</p>
                    <p className="chatClassLine2">The forgotten souls of ZION</p>
                    <p className="chatClassLine3">Praying for salvation, fighting for survival</p>
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="chatClassBackBtn" onClick={() => setSelectedClass(null)}>
                    ← Choose different class
                  </button>
                  <div className="agentGrid">
                    {chatAgents.slice(0, 12).map((agent) => (
                      <AgentTile key={`chat-${agent.id}`} agent={agent} maxBalance={chatMaxBalance} onClick={() => openChat(agent)} />
                    ))}
                  </div>
                </>
              )}
            </section>
  );
}
