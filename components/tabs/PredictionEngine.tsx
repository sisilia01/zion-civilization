// @ts-nocheck
"use client";


import { useZionTab } from "@/components/zion/ZionTabContext";

export function PredictionEngine() {
  const {
    GOLD_THRESHOLD,
    SILVER_THRESHOLD,
    VIP_MARKETS,
    ZIONBET_CRYPTO_TIMEFRAME_SIDEBAR,
    ZIONBET_TAB_LABELS,
    ZionBetMarketCardItem,
    ZionBetMarketDetail,
    account,
    signAndExecute,
    betSort,
    betTab,
    betTimeframe,
    betTimeframeCounts,
    chronicleMeta,
    deepbookOracles,
    deepbookVault,
    effectiveZionBetCategorySlug,
    executeDeepBookMintBinary,
    isMobile,
    loadMyBets,
    markets,
    myBets,
    placeZionBet,
    setBetModal,
    setBetSort,
    setBetTab,
    setBetTimeframe,
    setDetailMarket,
    setShowVIP,
    setZionBetSelectedMarket,
    showVIP,
    suiPrice,
    vipAccess,
    walletAddress,
    zionBetCategoryTabLabel,
    zionBetCgUsd,
    zionBetNotify,
    zionBetPlacing,
    zionBetSelectedMarket,
    zionBetTimeframeShort,
    zionBetToast,
    zionMarketOptionButtonLabel,
    zionMarketRowToApiMarket,
    zionMarkets,
    zionMyBetFromApi,
    zionbetApiToMarket,
    zionbetDisplayedMarkets,
    zionbetEndDateLabel,
    zionbetFilteredDeepbookMarkets,
    zionbetHeaderStats,
    zionbetIsZionNativeMarket,
    zionbetMarketVolumeLabel,
    zionbetTabCounts,
    zionbetTabLoading,
  } = useZionTab();

  return (
            <section className="zionBetTab zionBetInstrument" aria-label="Prediction Engine">
              <header className="zionBetHeader">
                <h2 className="zionBetTitle">PREDICTION ENGINE</h2>
                <p className="zionBetSubtitle">
                  {zionbetHeaderStats} · Civilization outcome forecasts · Peer-verifiable resolution
                </p>
              </header>
              {zionBetToast ? (
                <div className="zionBetToast" role="status">
                  {typeof zionBetToast === "string" ? (
                    zionBetToast
                  ) : (
                    <>
                      <div>{zionBetToast.message}</div>
                      {zionBetToast.disclaimer ? (
                        <div className="zionBetToastDisclaimer">{zionBetToast.disclaimer}</div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
              {zionBetNotify ? (
                <div
                  className={`zionBetToast zionBetToast--${zionBetNotify.type}`}
                  role="status"
                >
                  {zionBetNotify.message}
                </div>
              ) : null}
              {zionBetSelectedMarket ? (
                <ZionBetMarketDetail
                  market={zionBetSelectedMarket}
                  onClose={() => setZionBetSelectedMarket(null)}
                  badgeBorder={chronicleMeta(zionBetSelectedMarket.event_type).border}
                  badgeLabel={`${zionBetCategoryTabLabel(effectiveZionBetCategorySlug(zionBetSelectedMarket))} · ${zionBetTimeframeShort(
                    zionBetSelectedMarket.timeframe
                  )}`}
                  walletConnected={Boolean(walletAddress.trim())}
                  walletAddress={walletAddress}
                  placingKey={zionBetPlacing}
                  suiPrice={zionBetCgUsd.SUI}
                  onPlace={(b, prediction, amt, bracketIdx) => void placeZionBet(b, prediction, amt, bracketIdx)}
                  myBets={myBets}
                  myBetsOnMarket={myBets
                    .filter((r) => r.market_id === zionBetSelectedMarket.id)
                    .map((bet) => zionMyBetFromApi(bet as Record<string, unknown>))}
                  onRefreshBets={() => void loadMyBets()}
                />
              ) : (
                <>
                  <div
                    role="tablist"
                    aria-label="ZionBet market groups"
                    style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "16px" }}
                  >
                    {(
                      Object.entries(ZIONBET_TAB_LABELS) as [ZionbetBetTab, string][]
                    ).map(([key, label]) => {
                      const active = betTab === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`zionBetCatTab${active ? " zionBetCatTabActive" : ""}`}
                          onClick={() => setBetTab(key)}
                        >
                          {label} ({zionbetTabCounts[key]})
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="instrument-panel"
                    style={{
                      padding: "16px",
                      marginBottom: "20px",
                      color: "var(--text-primary)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        {vipAccess?.isGold ? (
                          <span className="instrument-label" style={{ fontSize: "0.75rem" }}>
                            GOLD ACCESS — Seal Encrypted
                          </span>
                        ) : vipAccess?.isSilver ? (
                          <span className="instrument-label" style={{ fontSize: "0.75rem" }}>
                            SILVER ACCESS — Seal Encrypted
                          </span>
                        ) : (
                          <span className="instrument-label" style={{ fontSize: "0.75rem" }}>
                            RESTRICTED ACCESS — Seal Encrypted
                          </span>
                        )}
                        <div style={{ color: "#8b9ab1", fontSize: "0.7rem", marginTop: "2px" }}>
                          🥈 Silver: {SILVER_THRESHOLD.toLocaleString()} ZION · 🥇 Gold:{" "}
                          {GOLD_THRESHOLD.toLocaleString()} ZION
                        </div>
                        <div style={{ color: "#6b7a8f", fontSize: "0.65rem", marginTop: "4px" }}>
                          Powered by Seal Protocol · Threshold encryption · On-chain access control
                        </div>
                      </div>
                      {vipAccess?.isSilver || vipAccess?.isGold ? (
                        <button
                          type="button"
                          onClick={() => setShowVIP(!showVIP)}
                          style={{
                            background: vipAccess?.isGold ? "rgba(255,215,0,0.2)" : "rgba(170,170,170,0.2)",
                            border: vipAccess?.isGold ? "1px solid #ffd700" : "1px solid #aaa",
                            color: vipAccess?.isGold ? "#ffd700" : "#aaa",
                            padding: "6px 16px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          {showVIP ? "HIDE VIP" : "ENTER VIP"}
                        </button>
                      ) : (
                        <span style={{ color: "#8b9ab1", fontSize: "0.75rem" }}>
                          Your balance: {vipAccess ? vipAccess.zionBalance.toFixed(0) : "..."} ZION
                        </span>
                      )}
                    </div>

                    {(vipAccess?.isSilver || vipAccess?.isGold) && showVIP ? (
                      <div style={{ marginTop: "16px" }}>
                        {vipAccess?.isGold ? (
                          <div
                            style={{
                              color: "#ffd700",
                              fontSize: "0.7rem",
                              marginBottom: "8px",
                              letterSpacing: "0.1em",
                            }}
                          >
                            🥇 GOLD EXCLUSIVE MARKETS
                          </div>
                        ) : null}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: "10px",
                          }}
                        >
                          {VIP_MARKETS.filter((m) => (vipAccess?.isGold ? true : m.tier === "silver")).map(
                            (market) => (
                              <div
                                key={market.id}
                                style={{
                                  border:
                                    market.tier === "gold"
                                      ? "1px solid rgba(255,215,0,0.4)"
                                      : "1px solid rgba(170,170,170,0.3)",
                                  borderRadius: "10px",
                                  padding: "12px",
                                  background:
                                    market.tier === "gold"
                                      ? "rgba(255,215,0,0.03)"
                                      : "rgba(170,170,170,0.02)",
                                }}
                              >
                                <div
                                  style={{
                                    color: market.tier === "gold" ? "#ffd700" : "#aaa",
                                    fontSize: "0.7rem",
                                    marginBottom: "4px",
                                  }}
                                >
                                  {market.tier === "gold" ? "🥇" : "🥈"} {market.category}
                                </div>
                                <div
                                  style={{
                                    color: "#fff",
                                    fontSize: "0.82rem",
                                    fontWeight: "bold",
                                    marginBottom: "8px",
                                    lineHeight: "1.3",
                                  }}
                                >
                                  {market.question}
                                </div>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button
                                    type="button"
                                    style={{
                                      flex: 1,
                                      padding: "5px",
                                      background: "rgba(0,255,65,0.12)",
                                      border: "1px solid #00ff41",
                                      borderRadius: "6px",
                                      color: "#00ff41",
                                      fontSize: "0.75rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    YES {market.yesOdds}¢
                                  </button>
                                  <button
                                    type="button"
                                    style={{
                                      flex: 1,
                                      padding: "5px",
                                      background: "rgba(255,50,50,0.12)",
                                      border: "1px solid #ff3232",
                                      borderRadius: "6px",
                                      color: "#ff3232",
                                      fontSize: "0.75rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    NO {market.noOdds}¢
                                  </button>
                                </div>
                                <div style={{ color: "#333", fontSize: "0.65rem", marginTop: "6px" }}>
                                  Min: {market.minBet.toLocaleString()} · Max: {market.maxBet.toLocaleString()} ZION
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ) : null}

                    {!walletAddress.trim() ? (
                      <div style={{ color: "#555", fontSize: "0.75rem", marginTop: "8px" }}>
                        Connect wallet to check VIP access
                      </div>
                    ) : null}
                  </div>
                  {betTab === "crypto" ? (
                  <div style={{
                    background: "linear-gradient(135deg, #0a0a1a 0%, #0d1117 100%)",
                    border: "1px solid #1a3a5c",
                    borderRadius: "12px",
                    padding: "20px",
                    marginBottom: "24px",
                  }}>
                    <div style={{display:"flex", alignItems:"center", gap:"10px", marginBottom:"16px"}}>
                      <span style={{fontSize:"1.2rem"}}>⚡</span>
                      <h3 style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"1rem", margin:0, letterSpacing:"2px"}}>
                        DEEPBOOK PREDICT — LIVE ORACLES
                      </h3>
                      <span style={{
                        background:"#0d3a6e", color:"#4DA2FF", fontSize:"0.65rem",
                        padding:"2px 8px", borderRadius:"4px", fontFamily:"monospace"
                      }}>POWERED BY BLOCK SCHOLES</span>
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:"12px"}}>
                      {deepbookOracles.length === 0 ? (
                        <p style={{color:"#333", fontFamily:"monospace", fontSize:"0.8rem"}}>Loading DeepBook oracles...</p>
                      ) : deepbookOracles.map((oracle) => (
                        <div key={oracle.oracle_id} style={{
                          background:"#0a0f1a",
                          border:"1px solid #1a3a5c",
                          borderRadius:"8px",
                          padding:"14px",
                        }}>
                          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px"}}>
                            <span style={{color:"#4DA2FF", fontFamily:"monospace", fontWeight:"bold", fontSize:"0.9rem"}}>
                              {oracle.underlying_asset}/USD
                            </span>
                            <span style={{
                              background: oracle.status === "active" ? "#0d3a0d" : "#1a1a0d",
                              color: oracle.status === "active" ? "#00ff41" : "#888",
                              fontSize:"0.6rem", padding:"2px 6px", borderRadius:"4px", fontFamily:"monospace"
                            }}>
                              {oracle.status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{color:"#fff", fontFamily:"monospace", fontSize:"1.3rem", fontWeight:"bold", marginBottom:"4px"}}>
                            ${oracle.spot_price ? oracle.spot_price.toLocaleString() : "—"}
                          </div>
                          <div style={{color:"#555", fontFamily:"monospace", fontSize:"0.7rem"}}>
                            Expires: {oracle.expiry_date}
                          </div>
                          <div style={{color:"#333", fontFamily:"monospace", fontSize:"0.6rem", marginTop:"4px"}}>
                            Oracle: {oracle.oracle_id.slice(0,8)}...
                          </div>
                          <div style={{marginTop:"10px", display:"flex", gap:"8px"}}>
                            <button
                              onClick={() => {
                                const strike = BigInt(Math.floor((oracle.spot_price ?? 0) * 0.95 * 1e9));
                                const expiry = BigInt(oracle.expiry);
                                if (!account?.address) { alert("Connect wallet first"); return; }
                                executeDeepBookMintBinary(
                                  signAndExecute as SignAndExecuteMutateFn,
                                  {
                                    oracleId: oracle.oracle_id,
                                    strike,
                                    expiry,
                                    isCall: true,
                                    amount: 1,
                                    walletAddress: account.address,
                                  },
                                  {
                                    onSuccess: (digest) => alert(`✅ DeepBook position minted! TX: ${digest}`),
                                    onError: (err) => alert(`❌ Error: ${err}`),
                                  }
                                );
                              }}
                              style={{
                                flex:1, padding:"8px", background:"#0d3a0d", border:"1px solid #00ff41",
                                color:"#00ff41", borderRadius:"6px", fontFamily:"monospace", fontSize:"0.75rem",
                                cursor:"pointer"
                              }}
                            >
                              📈 CALL +5%
                            </button>
                            <button
                              onClick={() => {
                                const strike = BigInt(Math.floor((oracle.spot_price ?? 0) * 1.05 * 1e9));
                                const expiry = BigInt(oracle.expiry);
                                if (!account?.address) { alert("Connect wallet first"); return; }
                                executeDeepBookMintBinary(
                                  signAndExecute as SignAndExecuteMutateFn,
                                  {
                                    oracleId: oracle.oracle_id,
                                    strike,
                                    expiry,
                                    isCall: false,
                                    amount: 1,
                                    walletAddress: account.address,
                                  },
                                  {
                                    onSuccess: (digest) => alert(`✅ DeepBook position minted! TX: ${digest}`),
                                    onError: (err) => alert(`❌ Error: ${err}`),
                                  }
                                );
                              }}
                              style={{
                                flex:1, padding:"8px", background:"#3a0d0d", border:"1px solid #ff4141",
                                color:"#ff4141", borderRadius:"6px", fontFamily:"monospace", fontSize:"0.75rem",
                                cursor:"pointer"
                              }}
                            >
                              📉 PUT -5%
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {deepbookVault && (
                      <div style={{
                        display:"grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap:"10px",
                        marginTop:"16px", padding:"14px", background:"#050a10",
                        borderRadius:"8px", border:"1px solid #1a3a5c"
                      }}>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>VAULT TVL</div>
                          <div style={{color:"#fff", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            ${(deepbookVault.vault_value / 1e6).toLocaleString(undefined, {maximumFractionDigits:0})}
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>PLP PRICE</div>
                          <div style={{color:"#00ff41", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            ${deepbookVault.plp_share_price.toFixed(4)}
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>UTILIZATION</div>
                          <div style={{color:"#ffaa00", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            {(deepbookVault.utilization * 100).toFixed(3)}%
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>LIQUIDITY</div>
                          <div style={{color:"#fff", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            ${(deepbookVault.available_liquidity / 1e6).toLocaleString(undefined, {maximumFractionDigits:0})}
                          </div>
                        </div>
                      </div>
                    )}
                    <div style={{marginTop:"12px", padding:"8px 12px", background:"#050a10", borderRadius:"6px", display:"flex", gap:"16px"}}>
                      <span style={{color:"#6b8fa3", fontFamily:"monospace", fontSize:"0.72rem"}}>
                        📦 Package: 0xf5ea2b37...
                      </span>
                      <span style={{color:"#6b8fa3", fontFamily:"monospace", fontSize:"0.72rem"}}>
                        🔮 Predict: 0xc8736204...
                      </span>
                      <span style={{color:"#66ff99", fontFamily:"monospace", fontSize:"0.72rem"}}>
                        ✓ Testnet Live
                      </span>
                    </div>
                  </div>
                  ) : null}
                  <div style={{ marginBottom: "24px" }}>
                      <>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            marginBottom: "10px",
                            flexWrap: "wrap",
                          }}
                        >
                          <h3
                            style={{
                              margin: 0,
                              color: "#4DA2FF",
                              fontSize: "11px",
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                              fontWeight: 600,
                            }}
                          >
                            Markets
                          </h3>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              color: "#8b9ab1",
                            }}
                          >
                            Sort by
                            <select
                              value={betSort}
                              onChange={(e) => setBetSort(e.target.value as ZionbetSortKey)}
                              style={{
                                background: "#0d1117",
                                border: "1px solid #1e2d3d",
                                color: "#8b9ab1",
                                borderRadius: "6px",
                                fontSize: 12,
                                padding: "5px 10px",
                                cursor: "pointer",
                              }}
                            >
                              <option value="volume">Volume ↓</option>
                              <option value="ending">Ending soon</option>
                              <option value="newest">Newest</option>
                            </select>
                          </label>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            alignItems: "flex-start",
                          }}
                        >
                          {betTab === "crypto" ? (
                          <div
                            style={{
                              width: "180px",
                              flexShrink: 0,
                              background: "#0d1117",
                              border: "1px solid #1e2d3d",
                              borderRadius: "10px",
                              padding: "8px",
                              position: "sticky",
                              top: "80px",
                            }}
                          >
                            {ZIONBET_CRYPTO_TIMEFRAME_SIDEBAR.map(({ icon, label, tf }) => {
                              const active = betTimeframe === tf;
                              return (
                                <div
                                  key={tf}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setBetTimeframe(tf)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setBetTimeframe(tf);
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!active) e.currentTarget.style.background = "#1a2535";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!active) e.currentTarget.style.background = "transparent";
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    marginBottom: "2px",
                                    background: active ? "#1e2d3d" : "transparent",
                                    color: active ? "#e6edf3" : "#8b9ab1",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "16px",
                                      width: "20px",
                                      textAlign: "center",
                                    }}
                                  >
                                    {icon}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: active ? 500 : 400,
                                    }}
                                  >
                                    {label}
                                  </span>
                                  <span
                                    style={{
                                      color: "#4b5563",
                                      fontSize: "12px",
                                      marginLeft: "auto",
                                      fontWeight: 500,
                                    }}
                                  >
                                    {betTimeframeCounts[tf] ?? 0}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          ) : null}
                          <div style={{ flex: 1 }}>
                            {zionbetTabLoading[betTab] ? (
                          <p style={{ fontSize: "0.85rem", color: "#8b9ab1", margin: "24px 0", textAlign: "center" }}>
                            Loading markets…
                          </p>
                        ) : betTab === "crypto" ? (
                          <>
                            {zionbetFilteredDeepbookMarkets.length > 0 ? (
                              <>
                            <h4 style={{ margin: "0 0 12px", color: "#4DA2FF", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                              ⚡ DEEPBOOK PREDICT — Binary markets
                            </h4>
                            <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`} style={{ marginBottom: 20 }}>
                              {zionbetFilteredDeepbookMarkets.map((m) => {
                                const yes = m.yes_pct ?? 50;
                                const market = zionbetApiToMarket(m);
                                return (
                                  <ZionBetMarketCardItem
                                    key={m.id}
                                    marketApi={m}
                                    yes={yes}
                                    betTab="crypto"
                                    volumeLabel={zionbetMarketVolumeLabel(m.volume, m.id, m.volume_sui)}
                                    endLabel={zionbetEndDateLabel(m.end_date, m.timeframe)}
                                    isZionCard={false}
                                    onOpen={() => setDetailMarket(m)}
                                    onBetYes={(e) => { e.stopPropagation(); setBetModal({ market, direction: true, open: true }); }}
                                    onBetNo={(e) => { e.stopPropagation(); setBetModal({ market, direction: false, open: true }); }}
                                  />
                                );
                              })}
                            </div>
                              </>
                            ) : null}
                            {zionbetDisplayedMarkets.length > 0 ? (
                              <>
                                <h4 style={{ margin: "0 0 12px", color: "#8b9ab1", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>🌐 CRYPTO MARKETS</h4>
                                <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`}>
                                  {zionbetDisplayedMarkets.map((m) => {
                                    const yes = m.yes_pct ?? m.seed_yes_cents ?? 50;
                                    const market = zionbetApiToMarket(m);
                                    return (
                                      <ZionBetMarketCardItem key={m.id} marketApi={m} yes={yes} betTab="crypto"
                                        volumeLabel={zionbetMarketVolumeLabel(m.volume, m.id, m.volume_sui)}
                                        endLabel={zionbetEndDateLabel(m.end_date, m.timeframe)} isZionCard={false}
                                        onOpen={() => setDetailMarket(m)}
                                        onBetYes={(e) => { e.stopPropagation(); setBetModal({ market, direction: true, open: true }); }}
                                        onBetNo={(e) => { e.stopPropagation(); setBetModal({ market, direction: false, open: true }); }}
                                      />
                                    );
                                  })}
                                </div>
                              </>
                            ) : null}
                            {zionbetFilteredDeepbookMarkets.length === 0 && zionbetDisplayedMarkets.length === 0 ? (
                              <p style={{ fontSize: "0.78rem", color: "#8b9ab1", margin: "12px 0" }}>
                                No active markets in this category
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {betTab === "civilization" && zionMarkets.length > 0 ? (
                              <div style={{ marginBottom: "16px" }}>
                                <div
                                  style={{
                                    color: "#444",
                                    fontSize: "0.58rem",
                                    fontFamily: "monospace",
                                    letterSpacing: "2px",
                                    marginBottom: "10px",
                                  }}
                                >
                                  🌍 LIVE ZION CIVILIZATION MARKETS
                                </div>
                                <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`}>
                                  {zionMarkets.map((market) => {
                                    const marketApi = zionMarketRowToApiMarket(market);
                                    const yes = marketApi.yes_pct ?? 50;
                                    const bet = zionbetApiToMarket(marketApi);
                                    const opts = market.options || [];
                                    const yesOpt = opts[0];
                                    const noOpt = opts[1];
                                    return (
                                      <ZionBetMarketCardItem
                                        key={market.market_id}
                                        marketApi={marketApi}
                                        yes={yes}
                                        betTab="civilization"
                                        volumeLabel="ZION Civ"
                                        endLabel={zionbetEndDateLabel(market.expires_at)}
                                        isZionCard
                                        yesButtonLabel={
                                          yesOpt
                                            ? zionMarketOptionButtonLabel(yesOpt.label, yes)
                                            : `YES ${yes}¢`
                                        }
                                        noButtonLabel={
                                          noOpt
                                            ? zionMarketOptionButtonLabel(noOpt.label, 100 - yes)
                                            : `NO ${100 - yes}¢`
                                        }
                                        onOpen={() => setDetailMarket(marketApi)}
                                        onBetYes={(e) => {
                                          e.stopPropagation();
                                          setBetModal({ market: bet, direction: true, open: true });
                                        }}
                                        onBetNo={(e) => {
                                          e.stopPropagation();
                                          setBetModal({ market: bet, direction: false, open: true });
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                            {zionbetDisplayedMarkets.length === 0 ? (
                              betTab === "civilization" && zionMarkets.length > 0 ? null : (
                                <p style={{ fontSize: "0.78rem", color: "#8b9ab1", margin: "12px 0" }}>
                                  No active markets in this category
                                </p>
                              )
                            ) : (
                          <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`}>
                            {zionbetDisplayedMarkets.map((m) => {
                              const yes = m.yes_pct ?? m.seed_yes_cents ?? 50;
                              const market = zionbetApiToMarket(m);
                              const volumeLabel = zionbetMarketVolumeLabel(m.volume, m.id, m.volume_sui);
                              const endLabel = zionbetEndDateLabel(m.end_date, m.timeframe);
                              const isZionCard =
                                betTab === "civilization" && zionbetIsZionNativeMarket(m.id);
                              return (
                                <ZionBetMarketCardItem
                                  key={m.id}
                                  marketApi={m}
                                  yes={yes}
                                  betTab={betTab}
                                  volumeLabel={volumeLabel}
                                  endLabel={endLabel}
                                  isZionCard={isZionCard}
                                  onOpen={() => setDetailMarket(m)}
                                  onBetYes={(e) => {
                                    e.stopPropagation();
                                    setBetModal({ market, direction: true, open: true });
                                  }}
                                  onBetNo={(e) => {
                                    e.stopPropagation();
                                    setBetModal({ market, direction: false, open: true });
                                  }}
                                />
                              );
                            })}
                          </div>
                            )}
                          </>
                        )}
                          </div>
                        </div>
                      </>
                  </div>

                </>
              )}
            </section>
  );
}
