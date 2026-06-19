// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { useZionTab } from "@/components/zion/ZionTabContext";
import glassCardStyles from "@/components/GlassCard.module.css";
import {
  downloadStealthFileAttachment,
  formatStealthAttachmentSize,
  type StealthFileAttachment,
} from "@/lib/stealth-file-attachment";
import {
  formatStealthFileSize,
  stealthFileTypeIcon,
  STEALTH_FILE_LARGE_WARN_BYTES,
  STEALTH_FILE_MAX_BYTES,
} from "@/lib/stealth-file-policy";

const DEFAULT_GEAR_COLORS = ["#00ff41", "#00ffff", "#ff00ff", "#ff4400", "#ffff00", "#ff0088"];

const PRESIGNED_MAX_ROWS = 10;
const PRESIGNED_HISTORY_POLL_MS = 60_000;
const PRESIGNED_TERMINAL_VISIBLE_MS = 60_000;

function StealthIncomingFileAttachment({
  attachment,
  autoDownloadOk = false,
  autoDownloadError = "",
  initialDownloadedSize = null,
  showCaption = true,
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(autoDownloadError || "");
  const [downloadedSize, setDownloadedSize] = useState(initialDownloadedSize);

  if (attachment?.unavailable) {
    return (
      <div
        style={{
          marginBottom: "8px",
          padding: "8px 10px",
          borderRadius: "8px",
          border: "1px solid rgba(255,170,0,0.25)",
          background: "rgba(255,170,0,0.06)",
          color: "#ffaa66",
          fontSize: "0.62rem",
          fontFamily: "monospace",
        }}
      >
        ⚠️ {attachment.fileName || "File"} unavailable
      </div>
    );
  }

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    const result = await downloadStealthFileAttachment(attachment);
    setDownloading(false);
    if (result.ok) {
      setDownloadedSize(result.size);
    } else {
      setDownloadError(result.error);
    }
  };

  return (
    <div
      className={glassCardStyles.glassCardNested}
      style={{
        marginBottom: "8px",
        padding: "8px 10px",
        border: "1px solid rgba(0,170,255,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "1rem" }}>{stealthFileTypeIcon(attachment.fileName)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "#00ccff",
              fontSize: "0.68rem",
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            📎 {attachment.fileName}
            {downloadedSize ? ` (${formatStealthAttachmentSize(downloadedSize)})` : ""}
          </div>
          {autoDownloadOk ? (
            <div style={{ color: "#00ff41", fontSize: "0.55rem", fontFamily: "monospace", marginTop: "2px" }}>
              Saved to downloads
            </div>
          ) : null}
          {showCaption && attachment.caption ? (
            <div
              style={{
                color: "#666",
                fontSize: "0.6rem",
                fontFamily: "monospace",
                marginTop: "3px",
                fontStyle: "italic",
              }}
            >
              {attachment.caption}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          style={{
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid #1a3a3a",
            background: "#0a1a1a",
            color: "#00ff41",
            fontFamily: "monospace",
            fontSize: "0.58rem",
            cursor: downloading ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {downloading ? "..." : "Download"}
        </button>
      </div>
      {downloadError ? (
        <div style={{ color: "#ff6688", fontSize: "0.58rem", fontFamily: "monospace", marginTop: "6px" }}>
          {autoDownloadOk
            ? null
            : autoDownloadError
              ? `⚠️ Auto-download failed — use Download: ${downloadError}`
              : `⚠️ ${attachment.fileName} unavailable: ${downloadError}`}
        </div>
      ) : null}
    </div>
  );
}

function StealthIncomingFileList({ attachments, ...itemProps }) {
  if (!attachments?.length) return null;
  return (
    <div style={{ marginBottom: "8px" }}>
      {attachments.length > 1 ? (
        <div
          style={{
            color: "#666",
            fontSize: "0.58rem",
            fontFamily: "monospace",
            marginBottom: "6px",
            letterSpacing: "0.3px",
          }}
        >
          {attachments.length} attached files
        </div>
      ) : null}
      {attachments.map((attachment, index) => (
        <StealthIncomingFileAttachment
          key={`${attachment.blobId || attachment.fileName}-${index}`}
          attachment={attachment}
          showCaption={index === 0}
          {...itemProps}
        />
      ))}
    </div>
  );
}
const SUI_TESTNET_TX_EXPLORER = "https://suiscan.xyz/testnet/tx";

const inputStyle = {
  width: "100%",
  background: "transparent",
  border: "none",
  color: "#ffffff",
  fontFamily: "monospace",
  fontSize: "0.72rem",
  outline: "none",
  boxSizing: "border-box",
};

function shortenSuiAddress(address) {
  if (!address) return "—";
  const a = String(address).trim();
  if (a.length <= 14) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function formatPresignedDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PresignedPaymentsHistory({ walletAddress, backendApiUrl, refreshToken }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedFailureId, setExpandedFailureId] = useState(null);
  const [sentDetectedAt, setSentDetectedAt] = useState({});
  const [failedDetectedAt, setFailedDetectedAt] = useState({});
  const [autoHideTick, setAutoHideTick] = useState(0);
  const prevStatusRef = useRef({});
  const isInitialLoadRef = useRef(true);

  const applyPayments = useCallback((nextPayments) => {
    const now = Date.now();
    const isInitialLoad = isInitialLoadRef.current;
    const newSentTimestamps = {};
    const newFailedTimestamps = {};

    for (const payment of nextPayments) {
      const id = payment.id;
      const status = String(payment.status || "pending").toLowerCase();
      const prevStatus = prevStatusRef.current[id];

      if (status === "sent" && !isInitialLoad && prevStatus && prevStatus !== "sent") {
        newSentTimestamps[id] = now;
      }
      if (status === "failed" && !isInitialLoad && prevStatus && prevStatus !== "failed") {
        newFailedTimestamps[id] = now;
      }

      prevStatusRef.current[id] = status;
    }

    if (Object.keys(newSentTimestamps).length) {
      setSentDetectedAt((prev) => ({ ...prev, ...newSentTimestamps }));
    }
    if (Object.keys(newFailedTimestamps).length) {
      setFailedDetectedAt((prev) => ({ ...prev, ...newFailedTimestamps }));
    }

    isInitialLoadRef.current = false;
    setPayments(nextPayments);
  }, []);

  const loadPayments = useCallback(async () => {
    if (!walletAddress?.trim() || !backendApiUrl) {
      prevStatusRef.current = {};
      isInitialLoadRef.current = true;
      setSentDetectedAt({});
      setFailedDetectedAt({});
      setPayments([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        backendApiUrl("/presigned-payments/" + encodeURIComponent(walletAddress.trim()))
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.payments)) {
        applyPayments(data.payments);
      }
    } catch (e) {
      console.error("Failed to fetch presigned payments:", e);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, backendApiUrl, applyPayments]);

  useEffect(() => {
    isInitialLoadRef.current = true;
    prevStatusRef.current = {};
    setSentDetectedAt({});
    setFailedDetectedAt({});
  }, [walletAddress]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments, refreshToken]);

  useEffect(() => {
    if (!walletAddress?.trim()) return undefined;
    const id = window.setInterval(() => {
      void loadPayments();
    }, PRESIGNED_HISTORY_POLL_MS);
    return () => window.clearInterval(id);
  }, [walletAddress, loadPayments]);

  useEffect(() => {
    const hasActiveTerminal = payments.some((payment) => {
      const status = String(payment.status || "pending").toLowerCase();
      if (status === "sent") {
        const detectedAt = sentDetectedAt[payment.id];
        return detectedAt && Date.now() - detectedAt < PRESIGNED_TERMINAL_VISIBLE_MS;
      }
      if (status === "failed") {
        const detectedAt = failedDetectedAt[payment.id];
        return detectedAt && Date.now() - detectedAt < PRESIGNED_TERMINAL_VISIBLE_MS;
      }
      return false;
    });
    if (!hasActiveTerminal) return undefined;
    const id = window.setInterval(() => {
      setAutoHideTick((tick) => tick + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [payments, sentDetectedAt, failedDetectedAt]);

  if (!walletAddress?.trim()) return null;

  const visiblePayments = payments.filter((payment) => {
    const status = String(payment.status || "pending").toLowerCase();
    if (status === "sent") {
      const detectedAt = sentDetectedAt[payment.id];
      if (!detectedAt) return false;
      return Date.now() - detectedAt < PRESIGNED_TERMINAL_VISIBLE_MS;
    }
    if (status === "failed") {
      const detectedAt = failedDetectedAt[payment.id];
      if (!detectedAt) return false;
      return Date.now() - detectedAt < PRESIGNED_TERMINAL_VISIBLE_MS;
    }
    return true;
  });

  return (
    <div style={{ marginTop: "16px" }}>
      <div
        style={{
          fontSize: "0.62rem",
          color: "#777",
          fontFamily: "monospace",
          letterSpacing: "1px",
          marginBottom: "10px",
        }}
      >
        MY SCHEDULED PAYMENTS
        {loading && visiblePayments.length > 0 ? (
          <span style={{ color: "#444", marginLeft: "8px" }}>↻</span>
        ) : null}
      </div>

      {!loading && visiblePayments.length === 0 ? (
        <div
          className={glassCardStyles.glassCardNestedSection}
          style={{ padding: "12px 14px", marginBottom: 0 }}
        >
          <div style={{ color: "#555", fontSize: "0.65rem", fontFamily: "monospace" }}>
            No scheduled payments yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {visiblePayments.map((payment) => {
            const status = String(payment.status || "pending").toLowerCase();
            const isSent = status === "sent";
            const isFailed = status === "failed";
            const digest = payment.executed_tx_digest;
            const failureReason = payment.failure_reason;

            let badgeLabel = "⏳ PENDING";
            let badgeColor = "#888";
            let badgeBg = "rgba(255,255,255,0.04)";
            let badgeBorder = "#2a2a2a";

            if (isSent) {
              badgeLabel = "✅ SENT";
              badgeColor = "#00ff41";
              badgeBg = "rgba(0,255,65,0.08)";
              badgeBorder = "#2a3a2a";
            } else if (isFailed) {
              badgeLabel = "❌ FAILED";
              badgeColor = "#ff4466";
              badgeBg = "rgba(255,34,68,0.08)";
              badgeBorder = "rgba(255,34,68,0.3)";
            }

            const badge = (
              <span
                title={isFailed && failureReason ? failureReason : undefined}
                onClick={() => {
                  if (isFailed && failureReason) {
                    setExpandedFailureId((prev) => (prev === payment.id ? null : payment.id));
                  }
                }}
                style={{
                  fontSize: "0.58rem",
                  fontFamily: "monospace",
                  fontWeight: "bold",
                  letterSpacing: "0.5px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  color: badgeColor,
                  background: badgeBg,
                  border: `1px solid ${badgeBorder}`,
                  cursor: isFailed && failureReason ? "pointer" : "default",
                  whiteSpace: "nowrap",
                }}
              >
                {badgeLabel}
              </span>
            );

            return (
              <div
                key={payment.id}
                className={glassCardStyles.glassCardNestedSection}
                style={{ marginBottom: 0, padding: "10px 12px" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "10px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        color: "#ccc",
                        fontSize: "0.68rem",
                        fontFamily: "monospace",
                        marginBottom: "4px",
                      }}
                    >
                      {formatPresignedDate(payment.scheduled_at)}
                    </div>
                    <div
                      style={{
                        color: "#00ff41",
                        fontSize: "0.72rem",
                        fontFamily: "monospace",
                        fontWeight: "bold",
                        marginBottom: "4px",
                      }}
                    >
                      {payment.amount} {payment.currency || "SUI"}
                    </div>
                    <div style={{ color: "#666", fontSize: "0.62rem", fontFamily: "monospace" }}>
                      → {shortenSuiAddress(payment.recipient_address)}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                    {isSent && digest ? (
                      <a
                        href={`${SUI_TESTNET_TX_EXPLORER}/${digest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: "none" }}
                      >
                        {badge}
                      </a>
                    ) : (
                      badge
                    )}
                    {isSent && digest ? (
                      <a
                        href={`${SUI_TESTNET_TX_EXPLORER}/${digest}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#00ff41",
                          fontSize: "0.55rem",
                          fontFamily: "monospace",
                          textDecoration: "none",
                          opacity: 0.85,
                        }}
                      >
                        SUISCAN ↗
                      </a>
                    ) : null}
                  </div>
                </div>
                {isFailed && expandedFailureId === payment.id && failureReason ? (
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "8px",
                      borderRadius: "8px",
                      background: "rgba(255,34,68,0.06)",
                      border: "1px solid rgba(255,34,68,0.2)",
                      color: "#ff8899",
                      fontSize: "0.62rem",
                      fontFamily: "monospace",
                      lineHeight: 1.4,
                      wordBreak: "break-word",
                    }}
                  >
                    {failureReason}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PresignedScheduleSection({
  showSchedule,
  setShowSchedule,
  presignedScheduleRows,
  presignedScheduleLoading,
  presignedScheduleStatus,
  addPresignedScheduleRow,
  removePresignedScheduleRow,
  updatePresignedScheduleRow,
  handleReserveAndSignAllPayments,
  walletAddress,
  backendApiUrl,
}) {
  return (
    <div style={{ marginTop: "16px", borderTop: "1px solid #2a3a2a", paddingTop: "16px" }}>
      <button
        type="button"
        onClick={() => setShowSchedule(!showSchedule)}
        style={{
          width: "100%",
          padding: "8px",
          fontSize: "0.72rem",
          background: showSchedule ? "#0d1a0d" : "transparent",
          border: "1px solid #2a3a2a",
          color: showSchedule ? "#00ff41" : "#777",
          cursor: "pointer",
          fontFamily: "monospace",
          borderRadius: "10px",
        }}
      >
        {showSchedule ? "📅 SCHEDULE PAYMENT ▲" : "📅 SCHEDULE PAYMENT ▼"}
      </button>

      {showSchedule && (
        <div style={{ marginTop: "12px" }}>
          <div
            style={{
              fontSize: "0.68rem",
              color: "#777",
              marginBottom: "10px",
              fontFamily: "monospace",
              lineHeight: 1.5,
            }}
          >
            Add payments with date/time, amount, and recipient. Coins are reserved on-chain when you sign.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
            {presignedScheduleRows.map((row, index) => (
              <div key={row.id} className={glassCardStyles.glassCardNestedSection} style={{ marginBottom: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ color: "#00ff41", fontSize: "0.62rem", fontFamily: "monospace" }}>
                    PAYMENT {index + 1}
                  </span>
                  {presignedScheduleRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePresignedScheduleRow(row.id)}
                      style={{
                        background: "transparent",
                        border: "1px solid #3a2a2a",
                        color: "#ff6666",
                        fontSize: "0.6rem",
                        fontFamily: "monospace",
                        borderRadius: "6px",
                        padding: "2px 8px",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                  <div>
                    <div style={{ color: "#555", fontSize: "0.58rem", letterSpacing: "1px", marginBottom: "4px" }}>
                      DATE & TIME
                    </div>
                    <div className={glassCardStyles.glassCardNested} style={{ padding: "8px 10px" }}>
                      <input
                        type="datetime-local"
                        className="zbank-input"
                        value={row.scheduledAtLocal}
                        onChange={(e) => updatePresignedScheduleRow(row.id, { scheduledAtLocal: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#555", fontSize: "0.58rem", letterSpacing: "1px", marginBottom: "4px" }}>
                        AMOUNT
                      </div>
                      <div className={glassCardStyles.glassCardNested} style={{ padding: "8px 10px" }}>
                        <input
                          type="number"
                          className="zbank-input"
                          value={row.amount}
                          onChange={(e) => updatePresignedScheduleRow(row.id, { amount: e.target.value })}
                          placeholder="0.1"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div style={{ width: "96px" }}>
                      <div style={{ color: "#555", fontSize: "0.58rem", letterSpacing: "1px", marginBottom: "4px" }}>
                        COIN
                      </div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {(["SUI", "USDC"] as const).map((coin) => (
                          <button
                            key={coin}
                            type="button"
                            onClick={() => updatePresignedScheduleRow(row.id, { coin })}
                            style={{
                              flex: 1,
                              padding: "8px 4px",
                              fontSize: "0.62rem",
                              background: row.coin === coin ? "#00ff41" : "transparent",
                              color: row.coin === coin ? "#000" : "#777",
                              border: row.coin === coin ? "1px solid #00ff41" : "1px solid #2a2a2a",
                              cursor: "pointer",
                              fontFamily: "monospace",
                              borderRadius: "8px",
                            }}
                          >
                            {coin}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ color: "#555", fontSize: "0.58rem", letterSpacing: "1px", marginBottom: "4px" }}>
                      RECIPIENT (0x...)
                    </div>
                    <div className={glassCardStyles.glassCardNested} style={{ padding: "8px 10px" }}>
                      <input
                        className="zbank-input"
                        value={row.recipient}
                        onChange={(e) => updatePresignedScheduleRow(row.id, { recipient: e.target.value })}
                        placeholder="0x..."
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {presignedScheduleRows.length < PRESIGNED_MAX_ROWS && (
            <button
              type="button"
              onClick={addPresignedScheduleRow}
              disabled={presignedScheduleLoading}
              style={{
                width: "100%",
                padding: "8px",
                marginBottom: "10px",
                fontSize: "0.72rem",
                background: "transparent",
                border: "1px dashed #2a3a2a",
                color: "#00ff41",
                cursor: "pointer",
                fontFamily: "monospace",
                borderRadius: "10px",
              }}
            >
              + Add Payment
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleReserveAndSignAllPayments()}
            disabled={presignedScheduleLoading}
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "0.75rem",
              background: presignedScheduleLoading ? "#111" : "#0d2a0d",
              border: "1px solid #2a3a2a",
              color: "#00ff41",
              cursor: presignedScheduleLoading ? "wait" : "pointer",
              fontFamily: "monospace",
              fontWeight: "bold",
              borderRadius: "10px",
              opacity: presignedScheduleLoading ? 0.7 : 1,
            }}
          >
            {presignedScheduleLoading ? "PROCESSING..." : "🔐 Reserve & Sign All Payments"}
          </button>

          {presignedScheduleStatus && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px",
                borderRadius: "10px",
                fontSize: "0.68rem",
                fontFamily: "monospace",
                whiteSpace: "pre-line",
                background: presignedScheduleStatus.startsWith("✅")
                  ? "rgba(0,255,65,0.08)"
                  : presignedScheduleStatus.startsWith("❌")
                    ? "rgba(255,34,68,0.08)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  presignedScheduleStatus.startsWith("✅")
                    ? "#2a3a2a"
                    : presignedScheduleStatus.startsWith("❌")
                      ? "rgba(255,34,68,0.3)"
                      : "#2a2a2a"
                }`,
                color: presignedScheduleStatus.startsWith("✅")
                  ? "#00ff41"
                  : presignedScheduleStatus.startsWith("❌")
                    ? "#ff4466"
                    : "#888",
              }}
            >
              {presignedScheduleStatus}
            </div>
          )}
        </div>
      )}

      <PresignedPaymentsHistory
        walletAddress={walletAddress}
        backendApiUrl={backendApiUrl}
        refreshToken={presignedScheduleStatus?.startsWith("✅") ? presignedScheduleStatus : ""}
      />
    </div>
  );
}

export function Privacy() {
  const {
    addPresignedScheduleRow,
    anonymousAmount,
    auditTrail,
    autoWithdraw,
    backendApiUrl,
    claimResults,
    claimResultsExpanded,
    claimedFileAttachments,
    copiedStealth,
    copyStealthAddressToClipboard,
    fragmentedWithdraw,
    gearColorIdx,
    gearColors,
    gearIntervalRef,
    handleClaimAll,
    handleExportKeys,
    handleGenerateStealthAddress,
    handleImportKeys,
    handleReserveAndSignAllPayments,
    handleScanStealth,
    handleZbTransfer,
    handleZkStealthMultiSend,
    handleZkStealthSend,
    keyTooltip,
    multiRecipients,
    multiSend,
    presignedScheduleLoading,
    presignedScheduleRows,
    presignedScheduleStatus,
    removePresignedScheduleRow,
    setAnonymousAmount,
    setAuditTrail,
    setAutoWithdraw,
    setClaimResultsExpanded,
    setFragmentedWithdraw,
    setGearColorIdx,
    setKeyTooltip,
    setMultiRecipients,
    setMultiSend,
    setShowAdvanced,
    setShowSchedule,
    setStealthAmount,
    setStealthMemo,
    setStealthSubTab,
    setUseDecoys,
    setZbCoin,
    setZbRecipient,
    setZbStatus,
    setZbTxDigest,
    setZbankMode,
    setZkStealthRecipient,
    setZkStealthStatus,
    showAdvanced,
    showSchedule,
    stealthAddress,
    stealthAmount,
    stealthAttachedFiles,
    stealthFileAttachError,
    stealthFileProcessing,
    clearStealthAttachment,
    removeStealthAttachedFile,
    handleStealthFilePick,
    stealthMemo,
    stealthSubTab,
    suiPrice,
    updatePresignedScheduleRow,
    useDecoys,
    walletAddress,
    zbCoin,
    zbLoading,
    zbRecipient,
    zbStatus,
    zbTxDigest,
    zbankMode,
    zkClaimLoading,
    zkClaimStatus,
    zkStealthLoading,
    zkStealthNotes,
    zkStealthRecipient,
    zkStealthStatus,
  } = useZionTab();

  const safeGearColors =
    Array.isArray(gearColors) && gearColors.length > 0 ? gearColors : DEFAULT_GEAR_COLORS;
  const safeGearColorIdx =
    typeof gearColorIdx === "number" && Number.isFinite(gearColorIdx)
      ? ((gearColorIdx % safeGearColors.length) + safeGearColors.length) % safeGearColors.length
      : 0;
  const pendingNotes = Array.isArray(zkStealthNotes)
    ? zkStealthNotes.filter((n) => n?.status === "pending")
    : [];
  const firstPendingNote = pendingNotes[0];
  const firstPendingFiles =
    firstPendingNote?.memo_files?.length
      ? firstPendingNote.memo_files
      : firstPendingNote?.memo_file
        ? [firstPendingNote.memo_file]
        : [];
  const stealthFileInputRef = useRef(null);

  return (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                paddingTop: "6px",
                minHeight: "auto",
                width: "100%",
                position: "relative",
                zIndex: 10,
                boxSizing: "border-box",
              }}
            >
<div style={{ fontFamily:'monospace', maxWidth:'480px', margin:'0 auto', padding:'8px', width:'100%', boxSizing:'border-box' }}>
  <style>{`
    input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .zbank-input { color: #ffffff !important; caret-color: #00ff41; }
    .zbank-input::placeholder { color: #444; }
    .memo-input::placeholder { color: #333; }
    .memo-input { caret-color: #00ff41; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes pulse-glow {
      0%,100% { box-shadow: 0 0 4px rgba(0,255,65,0.4); opacity:0.7; }
      50% { box-shadow: 0 0 12px rgba(0,255,65,1); opacity:1; }
    }
    .memo-cursor::after {
      content: '|';
      color: #00ff41;
      animation: blink 1s infinite;
      margin-left: 2px;
    }
  `}</style>
  <div style={{display:'flex', alignItems:'center', background:'#0a0a0a', borderRadius:'16px', padding:'4px', marginBottom:'16px'}}>
    <button
      type="button"
      onClick={() => { setZbankMode('anonymous'); setZbStatus(''); setZbTxDigest(''); setAuditTrail(null); setZkStealthStatus(''); }}
      style={{flex:1, padding:'10px', borderRadius:'12px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.8rem', letterSpacing:'1px', background: zbankMode==='anonymous' ? '#00ff41' : 'transparent', color: zbankMode==='anonymous' ? '#000' : '#555', fontWeight:'bold', transition:'all 0.2s'}}
    >
      🔒 ANONYMOUS
    </button>
    <button
      type="button"
      onClick={() => { setZbankMode('stealth'); setStealthSubTab('send'); setZkStealthStatus(''); }}
      style={{flex:1, padding:'10px', borderRadius:'12px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.8rem', letterSpacing:'1px', background: zbankMode==='stealth' ? '#00ff41' : 'transparent', color: zbankMode==='stealth' ? '#000' : '#555', fontWeight:'bold', transition:'all 0.2s'}}
    >
      ⚡ STEALTH
    </button>
    <button
      type="button"
      onClick={() => setShowAdvanced(!showAdvanced)}
      onMouseEnter={() => {
        let idx = 0;
        gearIntervalRef.current = setInterval(() => {
          idx = (idx + 1) % safeGearColors.length;
          setGearColorIdx?.(idx);
        }, 150);
      }}
      onMouseLeave={() => {
        if (gearIntervalRef.current) clearInterval(gearIntervalRef.current);
        setGearColorIdx?.(0);
      }}
      style={{width:'34px', height:'34px', borderRadius:'8px', border:'none',
              background:'transparent', cursor:'pointer', fontSize:'1.1rem',
              color: safeGearColors[safeGearColorIdx],
              transition:'color 0.15s',
              display:'flex', alignItems:'center', justifyContent:'center'}}
    >
      ⚙
    </button>
  </div>

  {zbankMode === 'anonymous' && (
  <div className={glassCardStyles.glassCardNestedSection} style={{ marginBottom:'4px' }}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
      <span style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>From:</span>
      <span style={{color:'#555', fontSize:'0.68rem', fontFamily:'monospace'}}>{walletAddress ? walletAddress.slice(0,6)+'...'+walletAddress.slice(-4) : 'Connect wallet'}</span>
    </div>
    <div className={glassCardStyles.glassCardNested}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <img
            src={zbCoin === 'SUI'
              ? 'https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png'
              : 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png'}
            style={{width:'28px', height:'28px', borderRadius:'50%'}}
            alt={zbCoin}
          />
          <div>
            <div style={{color:'#fff', fontSize:'0.9rem', fontFamily:'monospace', fontWeight:'bold'}}>{zbCoin}</div>
            <div style={{color:'#777', fontSize:'0.65rem'}}>Sui Network</div>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <input
            className="zbank-input"
            type="number"
            value={anonymousAmount || ''}
            onChange={(e) => setAnonymousAmount(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            style={{background:'transparent', border:'none', color:'#ffffff', fontSize:'1.4rem', fontFamily:'monospace', fontWeight:'bold', textAlign:'right', width:'130px', outline:'none', MozAppearance:'textfield'}}
          />
          <div style={{color:'#777', fontSize:'0.65rem', textAlign:'right'}}>
            {zbCoin === 'USDC'
              ? `~$${(anonymousAmount || 0).toFixed(2)} USD`
              : `~$${((anonymousAmount || 0) * suiPrice).toFixed(2)} USD`}
          </div>
        </div>
      </div>
      <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
          <button
            type="button"
            onClick={() => setZbCoin('SUI')}
            style={{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'10px', borderRadius:'12px', cursor:'pointer',
              border: zbCoin==='SUI' ? '1px solid #00ff41' : '1px solid #2a2a2a',
              background: zbCoin==='SUI' ? '#0d1a0d' : '#0d0d0d',
              color: zbCoin==='SUI' ? '#00ff41' : '#777',
              fontFamily:'monospace', fontSize:'0.75rem', fontWeight:'bold',
              transition:'all 0.2s'
            }}
          >
            <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png" style={{width:'16px', height:'16px', borderRadius:'50%'}} alt="SUI" />
            SUI
          </button>
          <button
            type="button"
            onClick={() => setZbCoin('USDC')}
            style={{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'10px', borderRadius:'12px', cursor:'pointer',
              border: zbCoin==='USDC' ? '1px solid #00aaff' : '1px solid #2a2a2a',
              background: zbCoin==='USDC' ? '#0a0d1a' : '#0d0d0d',
              color: zbCoin==='USDC' ? '#00aaff' : '#777',
              fontFamily:'monospace', fontSize:'0.75rem', fontWeight:'bold',
              transition:'all 0.2s'
            }}
          >
            <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png" style={{width:'16px', height:'16px', borderRadius:'50%'}} alt="USDC" />
            USDC
          </button>
        </div>
    </div>
  </div>
  )}

  {zbankMode === 'anonymous' && (
  <div style={{display:'flex', justifyContent:'center', margin:'-2px 0', zIndex:1, position:'relative'}}>
    <div style={{width:'32px', height:'32px', borderRadius:'50%', background:'#0d0d0d', border:'2px solid #2a3a2a', display:'flex', alignItems:'center', justifyContent:'center', color:'#00ff41', fontSize:'0.9rem'}}>↓</div>
  </div>
  )}

  {zbankMode === 'stealth' && (
    <>
      <div className={glassCardStyles.glassCardNestedSection} style={{ marginBottom:'8px' }}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
            <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png"
                 style={{width:'24px', height:'24px', borderRadius:'50%'}} alt="SUI"/>
            <div>
              <div style={{fontSize:'0.85rem', fontWeight:'bold', color:'#fff'}}>SUI</div>
              <div style={{fontSize:'0.6rem', color:'#555'}}>{walletAddress ? walletAddress.slice(0,6)+'...'+walletAddress.slice(-4) : 'Connect wallet'}</div>
            </div>
          </div>
          <div style={{display:'flex', gap:'4px', position:'relative', zIndex:10}}>
            <button type="button" onClick={() => { console.log('0.1 clicked'); setStealthAmount(0.1); }}
              style={{padding:'6px 12px', borderRadius:'8px', cursor:'pointer',
                      fontFamily:'monospace', fontSize:'0.7rem', zIndex:10,
                      border: stealthAmount===0.1 ? '1px solid #00ff41' : '1px solid #333',
                      background: stealthAmount===0.1 ? '#0d1a0d' : '#111',
                      color: stealthAmount===0.1 ? '#00ff41' : '#888', position:'relative'}}>
              0.1 SUI
            </button>
            <button type="button" onClick={() => { console.log('1 clicked'); setStealthAmount(1); }}
              style={{padding:'6px 12px', borderRadius:'8px', cursor:'pointer',
                      fontFamily:'monospace', fontSize:'0.7rem', zIndex:10,
                      border: stealthAmount===1 ? '1px solid #00ff41' : '1px solid #333',
                      background: stealthAmount===1 ? '#0d1a0d' : '#111',
                      color: stealthAmount===1 ? '#00ff41' : '#888', position:'relative'}}>
              1 SUI
            </button>
            <button type="button" onClick={() => { console.log('10 clicked'); setStealthAmount(10); }}
              style={{padding:'6px 12px', borderRadius:'8px', cursor:'pointer',
                      fontFamily:'monospace', fontSize:'0.7rem', zIndex:10,
                      border: stealthAmount===10 ? '1px solid #00ff41' : '1px solid #333',
                      background: stealthAmount===10 ? '#0d1a0d' : '#111',
                      color: stealthAmount===10 ? '#00ff41' : '#888', position:'relative'}}>
              10 SUI
            </button>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'1.2rem', fontWeight:'bold', color:'#fff'}}>{stealthAmount}</div>
            <div style={{fontSize:'0.6rem', color:'#555'}}>~${(stealthAmount * suiPrice).toFixed(2)} USD</div>
          </div>
        </div>
      </div>

      <div className={glassCardStyles.glassCardNestedSection} style={{ marginBottom:'8px' }}>
        <div style={{fontSize:'0.6rem', color:'#00ff41', letterSpacing:'1px', marginBottom:'5px'}}>→ RECIPIENT</div>
        <div className={glassCardStyles.glassCardNested}
             style={{display:'flex', alignItems:'center', gap:'6px', padding:'8px 10px', border:'1px solid #1a3a1a'}}>
          <div style={{width:'18px', height:'18px', borderRadius:'50%', background:'#0d2a0d',
                       display:'flex', alignItems:'center', justifyContent:'center',
                       fontSize:'0.7rem', flexShrink:0,
                       animation:'pulse-glow 1.5s ease-in-out infinite'}}>⚡</div>
          <input value={zkStealthRecipient}
            onChange={(e) => setZkStealthRecipient(e.target.value)}
            placeholder="Paste st:sui:... here"
            className="zbank-input"
            style={{flex:1, width:'100%', background:'transparent', border:'none', color:'#fff',
                    fontFamily:'monospace', fontSize:'0.75rem', outline:'none',
                    caretColor:'#00ff41'}}/>
          <button type="button" onClick={async () => { try { const t = await navigator.clipboard.readText(); setZkStealthRecipient(t.trim()); } catch {} }}
            style={{padding:'4px 8px', borderRadius:'5px', border:'1px solid #1a3a1a',
                    background:'#0a1a0a', color:'#00ff41', fontFamily:'monospace',
                    fontSize:'0.62rem', cursor:'pointer', whiteSpace:'nowrap'}}>
            PASTE
          </button>
        </div>
      </div>

      <div className={glassCardStyles.glassCardNestedSection} style={{ marginBottom:'8px' }}>
        {(() => {
          const hasAttachments = stealthAttachedFiles.length > 0;
          const totalAttachmentBytes = stealthAttachedFiles.reduce(
            (sum, entry) => sum + entry.file.size,
            0
          );
          const showLargeWarning =
            totalAttachmentBytes > STEALTH_FILE_LARGE_WARN_BYTES ||
            stealthAttachedFiles.some((entry) => entry.file.size > STEALTH_FILE_LARGE_WARN_BYTES);

          return (
            <>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
          <div style={{fontSize:'0.6rem', color:'#555', letterSpacing:'1px'}}>MEMO</div>
          {hasAttachments ? (
            <div style={{ fontSize:'0.55rem', color:'#00aaff', fontFamily:'monospace', letterSpacing:'0.5px' }}>
              + {stealthAttachedFiles.length} FILE{stealthAttachedFiles.length === 1 ? "" : "S"} ATTACHED
            </div>
          ) : null}
        </div>
        <div
          className={glassCardStyles.glassCardNested}
          style={{
            padding: 0,
            border: hasAttachments ? '1px solid rgba(0,170,255,0.35)' : '1px solid #1a3a1a',
            position: 'relative',
          }}
        >
          <textarea
            value={stealthMemo}
            onChange={(e) => setStealthMemo(e.target.value.slice(0, 280))}
            rows={2}
            className="zbank-input"
            placeholder={
              hasAttachments
                ? "Optional caption for attached files..."
                : "Private message (optional)"
            }
            style={{
              width:'100%',
              background:'transparent',
              border:'none',
              borderRadius:'8px',
              padding:'8px 36px 8px 10px',
              color:'#fff',
              fontFamily:'monospace',
              fontSize:'0.72rem',
              outline:'none',
              resize:'none',
              boxSizing:'border-box',
              caretColor:'#00ff41',
            }}
          />
          <input
            ref={stealthFileInputRef}
            type="file"
            multiple
            onChange={(event) => {
              const picked = event.target.files;
              if (picked?.length) {
                handleStealthFilePick(picked);
              }
              event.target.value = "";
            }}
            style={{ display:'none' }}
          />
          <button
            type="button"
            onClick={() => stealthFileInputRef.current?.click()}
            title="Attach files (max 50 MB total; executables blocked)"
            style={{
              position:'absolute',
              right:'8px',
              bottom:'8px',
              width:'26px',
              height:'26px',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              borderRadius:'6px',
              border: hasAttachments ? '1px solid rgba(0,170,255,0.45)' : '1px solid #2a3a2a',
              background: hasAttachments ? 'rgba(0,170,255,0.12)' : 'rgba(255,255,255,0.03)',
              color: hasAttachments ? '#00aaff' : '#777',
              cursor:'pointer',
              padding: 0,
            }}
          >
            <Paperclip size={14} strokeWidth={2.2} />
          </button>
        </div>

        {stealthFileProcessing ? (
          <div
            style={{
              marginTop:'6px',
              fontSize:'0.62rem',
              fontFamily:'monospace',
              color:'#00aaff',
            }}
          >
            ⏳ Encrypting file in browser...
          </div>
        ) : null}

        {stealthFileAttachError ? (
          <div
            style={{
              marginTop:'6px',
              fontSize:'0.62rem',
              fontFamily:'monospace',
              color:'#ff6688',
            }}
          >
            {stealthFileAttachError}
          </div>
        ) : null}

        {hasAttachments ? (
          <>
            <div
              style={{
                marginTop:'8px',
                fontSize:'0.58rem',
                fontFamily:'monospace',
                color:'#888',
                letterSpacing:'0.3px',
              }}
            >
              {stealthAttachedFiles.length} file{stealthAttachedFiles.length === 1 ? "" : "s"} ·{" "}
              {formatStealthFileSize(totalAttachmentBytes)} / {formatStealthFileSize(STEALTH_FILE_MAX_BYTES)}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginTop:'6px' }}>
              {stealthAttachedFiles.map((entry) => (
                <div
                  key={entry.id}
                  className={glassCardStyles.glassCardNested}
                  style={{
                    padding:'8px 10px',
                    border:'1px solid rgba(0,170,255,0.25)',
                    display:'flex',
                    alignItems:'center',
                    gap:'10px',
                  }}
                >
                  <div
                    style={{
                      width:'32px',
                      height:'32px',
                      borderRadius:'8px',
                      background:'rgba(0,170,255,0.1)',
                      border:'1px solid rgba(0,170,255,0.2)',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'center',
                      fontSize:'1rem',
                      flexShrink:0,
                    }}
                  >
                    {stealthFileTypeIcon(entry.file.name)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div
                      style={{
                        color:'#ddd',
                        fontSize:'0.68rem',
                        fontFamily:'monospace',
                        overflow:'hidden',
                        textOverflow:'ellipsis',
                        whiteSpace:'nowrap',
                      }}
                    >
                      {entry.file.name}
                    </div>
                    <div style={{ color:'#666', fontSize:'0.58rem', fontFamily:'monospace', marginTop:'2px' }}>
                      {formatStealthFileSize(entry.file.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStealthAttachedFile(entry.id)}
                    title="Remove this file"
                    style={{
                      width:'24px',
                      height:'24px',
                      borderRadius:'6px',
                      border:'1px solid #3a2a2a',
                      background:'transparent',
                      color:'#ff6666',
                      fontFamily:'monospace',
                      fontSize:'0.75rem',
                      cursor:'pointer',
                      flexShrink:0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {stealthAttachedFiles.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  clearStealthAttachment();
                  if (stealthFileInputRef.current) {
                    stealthFileInputRef.current.value = "";
                  }
                }}
                style={{
                  marginTop:'6px',
                  padding:'4px 8px',
                  borderRadius:'6px',
                  border:'1px solid #3a2a2a',
                  background:'transparent',
                  color:'#888',
                  fontFamily:'monospace',
                  fontSize:'0.58rem',
                  cursor:'pointer',
                }}
              >
                Remove all files
              </button>
            ) : null}
          </>
        ) : null}

        {showLargeWarning ? (
          <div
            style={{
              marginTop:'6px',
              padding:'8px 10px',
              borderRadius:'8px',
              border:'1px solid rgba(255,170,0,0.35)',
              background:'rgba(255,170,0,0.08)',
              color:'#ffcc66',
              fontSize:'0.62rem',
              fontFamily:'monospace',
              lineHeight: 1.4,
            }}
          >
            ⚠️ Large file — upload may take a while depending on your connection.
          </div>
        ) : null}
            </>
          );
        })()}
      </div>

      <div className={glassCardStyles.glassCardNestedSection} style={{ marginBottom:'8px' }}>
        <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
        <button type="button" onClick={handleGenerateStealthAddress}
          style={{padding:'6px 10px', borderRadius:'7px', border:'1px solid #1a3a1a', background:'#0a1a0a', color:'#00ff41', fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer', whiteSpace:'nowrap'}}>
          🔑 MY KEY
        </button>
        <div className={glassCardStyles.glassCardNested}
             style={{flex:1, padding:'6px 8px', color:'#444', fontFamily:'monospace', fontSize:'0.62rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
          {stealthAddress || 'No key generated'}
        </div>
        <button type="button" onClick={copyStealthAddressToClipboard} disabled={!stealthAddress}
          style={{padding:'6px 8px', borderRadius:'7px', border:'1px solid #1a3a1a', background:'transparent', color:'#00ff41', fontFamily:'monospace', fontSize:'0.62rem', cursor: stealthAddress ? 'pointer' : 'default'}}>
          {copiedStealth ? '✓' : 'COPY'}
        </button>
        <div style={{position:'relative'}}>
          <button type="button" onClick={handleExportKeys}
            onMouseEnter={(e) => {
              setKeyTooltip('export');
              e.currentTarget.style.boxShadow = '0 0 12px rgba(0,170,255,0.8), 0 0 4px rgba(0,170,255,0.5)';
              e.currentTarget.style.borderColor = '#00aaff';
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.background = 'rgba(0,170,255,0.1)';
            }}
            onMouseLeave={(e) => {
              setKeyTooltip('');
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = '#222';
              e.currentTarget.style.color = '#00aaff';
              e.currentTarget.style.background = 'transparent';
            }}
            style={{padding:'6px 8px', borderRadius:'7px', border:'1px solid #222',
                    background:'transparent', color:'#00aaff', fontSize:'0.85rem', cursor:'pointer',
                    transition:'all 0.2s'}}>
            ↑
          </button>
          {keyTooltip === 'export' && (
            <div style={{position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)',
                         background:'#1a1a1a', border:'1px solid #333', borderRadius:'5px',
                         padding:'3px 8px', color:'#00aaff', fontSize:'0.62rem',
                         whiteSpace:'nowrap', zIndex:100, pointerEvents:'none'}}>
              Export keys
            </div>
          )}
        </div>
        <div style={{position:'relative'}}>
          <button type="button" onClick={handleImportKeys}
            onMouseEnter={(e) => {
              setKeyTooltip('import');
              const el = e.currentTarget as HTMLButtonElement;
              el.style.boxShadow = '0 0 14px rgba(255,170,0,0.9)';
              el.style.borderColor = '#ffaa00';
              el.style.color = '#fff';
              el.style.background = 'rgba(255,170,0,0.15)';
            }}
            onMouseLeave={(e) => {
              setKeyTooltip('');
              const el = e.currentTarget as HTMLButtonElement;
              el.style.boxShadow = 'none';
              el.style.borderColor = '#222';
              el.style.color = '#ffaa00';
              el.style.background = 'transparent';
            }}
            style={{padding:'6px 8px', borderRadius:'7px', border:'1px solid #222',
                    background:'transparent', color:'#ffaa00', fontSize:'0.85rem', cursor:'pointer',
                    transition:'all 0.2s'}}>
            ↓
          </button>
          {keyTooltip === 'import' && (
            <div style={{position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)',
                         background:'#1a1a1a', border:'1px solid #333', borderRadius:'5px',
                         padding:'3px 8px', color:'#ffaa00', fontSize:'0.62rem',
                         whiteSpace:'nowrap', zIndex:100, pointerEvents:'none'}}>
              Import keys
            </div>
          )}
        </div>
      </div>
      </div>

      <div style={{display:'flex', gap:'4px', marginBottom:'10px'}}>
        <button type="button" onClick={() => setStealthSubTab('send')}
          style={{flex:1, padding:'8px', borderRadius:'8px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.72rem',
                  background: stealthSubTab==='send' ? '#0d2a0d' : '#0d0d0d',
                  color: stealthSubTab==='send' ? '#00ff41' : '#444',
                  borderBottom: stealthSubTab==='send' ? '1.5px solid #00ff41' : '1.5px solid transparent'}}>
          ↗ SEND
        </button>
        <button type="button" onClick={() => setStealthSubTab('receive')}
          style={{flex:1, padding:'8px', borderRadius:'8px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.72rem',
                  background: stealthSubTab==='receive' ? '#0d2a0d' : '#0d0d0d',
                  color: stealthSubTab==='receive' ? '#00ff41' : '#444',
                  borderBottom: stealthSubTab==='receive' ? '1.5px solid #00ff41' : '1.5px solid transparent'}}>
          ↙ RECEIVE
        </button>
      </div>

      {showAdvanced && stealthSubTab === 'send' && (
        <div style={{background:'#0a0f0a', border:'1px solid #2a3a2a', borderRadius:'12px', padding:'12px', marginBottom:'12px'}}>
          <div style={{color:'#777', fontSize:'0.62rem', letterSpacing:'2px', marginBottom:'10px'}}>ADVANCED SETTINGS</div>
          <button type="button" onClick={() => setMultiSend(!multiSend)}
            style={{padding:'6px 12px', fontSize:'0.68rem', marginBottom:'10px', width:'100%',
                    background: multiSend ? '#0d2a0d' : 'transparent',
                    border: multiSend ? '1px solid #00ff41' : '1px solid #2a3a2a',
                    color: multiSend ? '#00ff41' : '#777',
                    cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
            {multiSend ? '👥 MULTI-SEND ON' : '👥 MULTI-SEND OFF'}
          </button>
          {multiSend && (
            <div style={{ marginBottom:'10px' }}>
              {multiRecipients.map((r, i) => (
                <div key={i} style={{display:'flex', gap:'6px', marginBottom:'6px', alignItems:'center'}}>
                  <input className="zbank-input" value={r.address}
                    onChange={(e) => { const updated = [...multiRecipients]; updated[i].address = e.target.value; setMultiRecipients(updated); }}
                    placeholder="0x... recipient"
                    style={{flex:1, padding:'8px', background:'#111', border:'1px solid #2a3a2a', color:'#ffffff', fontFamily:'monospace', fontSize:'0.65rem', borderRadius:'8px', outline:'none'}} />
                  <select value={r.denomination}
                    onChange={(e) => { const updated = [...multiRecipients]; updated[i].denomination = e.target.value as "0.1" | "1" | "10"; setMultiRecipients(updated); }}
                    style={{padding:'8px', background:'#111', color:'#00ff41', border:'1px solid #2a3a2a', fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer', borderRadius:'8px'}}>
                    <option value="0.1">0.1</option><option value="1">1</option><option value="10">10</option>
                  </select>
                  {i > 0 && (
                    <button type="button" onClick={() => setMultiRecipients(multiRecipients.filter((_, j) => j !== i))}
                      style={{padding:'6px 8px', background:'transparent', border:'1px solid #331a1a', color:'#664444', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px', fontSize:'0.65rem'}}>✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setMultiRecipients([...multiRecipients, { address: '', denomination: '0.1' }])}
                style={{width:'100%', padding:'6px', background:'transparent', border:'1px dashed #2a3a2a', color:'#777', cursor:'pointer', fontFamily:'monospace', fontSize:'0.65rem', marginBottom:'6px', borderRadius:'8px'}}>
                + ADD RECIPIENT
              </button>
            </div>
          )}
          <div style={{display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px'}}>
            <button type="button" onClick={() => setAutoWithdraw(!autoWithdraw)}
              style={{padding:'6px 10px', fontSize:'0.65rem', background: autoWithdraw ? '#0d2a0d' : 'transparent', border: autoWithdraw ? '1px solid #00ff41' : '1px solid #2a3a2a', color: autoWithdraw ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
              {autoWithdraw ? '⏱ AUTO-WITHDRAW ON' : '⏱ AUTO-WITHDRAW OFF'}
            </button>
            <button type="button" onClick={() => setFragmentedWithdraw(!fragmentedWithdraw)}
              style={{padding:'6px 10px', fontSize:'0.65rem', background: fragmentedWithdraw ? '#0d2a0d' : 'transparent', border: fragmentedWithdraw ? '1px solid #00ff41' : '1px solid #2a3a2a', color: fragmentedWithdraw ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
              {fragmentedWithdraw ? '🔀 FRAGMENTED ON' : '🔀 FRAGMENTED OFF'}
            </button>
            <button type="button" onClick={() => setUseDecoys(!useDecoys)}
              style={{padding:'6px 10px', fontSize:'0.65rem', background: useDecoys ? '#0d2a0d' : 'transparent', border: useDecoys ? '1px solid #00ff41' : '1px solid #2a3a2a', color: useDecoys ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
              {useDecoys ? '👻 DECOYS ON' : '👻 DECOYS OFF'}
            </button>
          </div>
        </div>
      )}

      {stealthSubTab === 'send' && (
        <>
          {(() => {
            const statusMsg = zkStealthStatus;
            const hideStatusForTxCard = zbTxDigest && statusMsg.startsWith('✅');
            if (!statusMsg || hideStatusForTxCard) return null;
            const isWalrusUpload =
              statusMsg.includes('Walrus') ||
              statusMsg.includes('uploading to Walrus') ||
              /uploading file \d+ of \d+/i.test(statusMsg);
            const isError = statusMsg.startsWith('❌');
            const isSuccess = statusMsg.startsWith('✅');
            return (
              <div style={{ marginBottom:'12px', padding:'10px', borderRadius:'12px', fontSize:'0.72rem',
                background: isSuccess
                  ? 'rgba(0,255,65,0.08)'
                  : isError
                    ? 'rgba(255,34,68,0.08)'
                    : isWalrusUpload
                      ? 'rgba(0,170,255,0.08)'
                      : 'rgba(255,255,255,0.04)',
                border: `1px solid ${
                  isSuccess
                    ? '#2a3a2a'
                    : isError
                      ? 'rgba(255,34,68,0.3)'
                      : isWalrusUpload
                        ? 'rgba(0,170,255,0.35)'
                        : '#2a2a2a'
                }`,
                color: isSuccess ? '#00ff41' : isError ? '#ff4466' : isWalrusUpload ? '#88ccff' : '#666',
                whiteSpace: 'pre-line' }}>
                {(zkStealthLoading || isWalrusUpload) && !isSuccess && !isError ? '⏳ ' : ''}
                {statusMsg}
              </div>
            );
          })()}

          {multiSend ? (
            <button type="button" onClick={() => handleZkStealthMultiSend()} disabled={zkStealthLoading}
              style={{width:'100%', padding:'16px', borderRadius:'16px', border:'none', background:'#00ff41', color:'#000', fontFamily:'monospace', fontSize:'0.9rem', fontWeight:'bold', letterSpacing:'2px', cursor: zkStealthLoading ? 'wait' : 'pointer', boxShadow:'0 4px 24px rgba(0,255,65,0.2)', transition:'all 0.2s', opacity: zkStealthLoading ? 0.7 : 1}}>
              {zkStealthLoading ? 'PROCESSING...' : `👥 SEND TO ${multiRecipients.filter((r) => r.address.length === 66).length} RECIPIENTS`}
            </button>
          ) : (
            <button type="button" onClick={() => handleZkStealthSend()}
              disabled={zkStealthLoading || !zkStealthRecipient || !zkStealthRecipient.startsWith('st:sui:')}
              style={{width:'100%', padding:'16px', borderRadius:'16px', border:'none', background:'#00ff41', color:'#000', fontFamily:'monospace', fontSize:'0.9rem', fontWeight:'bold', letterSpacing:'2px', boxShadow:'0 4px 24px rgba(0,255,65,0.2)', transition:'all 0.2s',
                      cursor: zkStealthLoading ? 'wait' : (!zkStealthRecipient || !zkStealthRecipient.startsWith('st:sui:')) ? 'not-allowed' : 'pointer',
                      opacity: (!zkStealthRecipient || !zkStealthRecipient.startsWith('st:sui:')) ? 0.4 : zkStealthLoading ? 0.7 : 1}}>
              {zkStealthLoading
                ? (zkStealthStatus.includes('Walrus') ||
                    zkStealthStatus.includes('uploading to Walrus') ||
                    /uploading file \d+ of \d+/i.test(zkStealthStatus)
                    ? 'UPLOADING TO WALRUS...'
                    : 'PROCESSING...')
                : stealthAttachedFiles.length > 0
                  ? stealthAttachedFiles.length === 1
                    ? '🔒 SEND STEALTH + FILE'
                    : `🔒 SEND STEALTH + ${stealthAttachedFiles.length} FILES`
                  : '⚡ SEND STEALTH'}
            </button>
          )}

          {zbTxDigest && (
            <div style={{background:'#050f05', border:'1px solid #1a3a1a', borderRadius:'12px', padding:'14px 16px', marginTop:'12px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
                <span style={{color:'#00ff41', fontSize:'1rem'}}>✅</span>
                <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace', letterSpacing:'1px', fontWeight:'bold'}}>TRANSFER SENT</span>
              </div>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
                <div>
                  <div style={{color:'#555', fontSize:'0.6rem', letterSpacing:'1px', marginBottom:'3px'}}>TRANSACTION</div>
                  <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>{zbTxDigest.slice(0,8)}...{zbTxDigest.slice(-6)}</div>
                </div>
                <a href={`https://suiscan.xyz/testnet/tx/${zbTxDigest}`} target="_blank" rel="noopener noreferrer"
                  style={{display:'flex', alignItems:'center', gap:'6px', background:'#0d1a0d', border:'1px solid #1a3a1a', borderRadius:'8px', padding:'8px 12px', color:'#00ff41', fontSize:'0.7rem', fontFamily:'monospace', textDecoration:'none', letterSpacing:'1px'}}>
                  SUISCAN ↗
                </a>
              </div>
            </div>
          )}

          {auditTrail && (
            <div style={{background:'#050f05', border:'1px solid #1a3a1a',
                         borderRadius:'12px', padding:'14px', marginTop:'10px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
                <span>🔐</span>
                <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace',
                              fontWeight:'bold', letterSpacing:'1px'}}>
                  AUDIT TRAIL SAVED
                </span>
                <span style={{marginLeft:'auto', background:'#0a1a0a', border:'1px solid #1a3a1a',
                              borderRadius:'4px', padding:'2px 8px', color:'#00ff41',
                              fontSize:'0.6rem', fontFamily:'monospace'}}>
                  WALRUS
                </span>
              </div>

              <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px', marginBottom:'8px'}}>
                <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                  VIEW KEY ID (public)
                </div>
                <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>
                  {auditTrail.view_key_id}
                </div>
              </div>

              <div style={{background:'#1a0a0a', border:'1px solid #3a1a1a', borderRadius:'8px',
                           padding:'10px 12px', marginBottom:'8px'}}>
                <div style={{color:'#ff4444', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                  🔑 VIEW KEY SECRET (keep private!)
                </div>
                <div style={{color:'#ff8888', fontSize:'0.65rem', fontFamily:'monospace',
                             wordBreak:'break-all'}}>
                  {auditTrail.view_key_secret}
                </div>
                <div style={{color:'#555', fontSize:'0.58rem', marginTop:'6px'}}>
                  Share this key only with authorized auditors to prove transaction details
                </div>
              </div>

              <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
                <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                  WALRUS BLOB ID
                </div>
                <a href={`/zco/${auditTrail.walrus_blob_id}`} target="_blank"
                   rel="noopener noreferrer"
                   style={{color:'#00ff41', fontSize:'0.65rem', fontFamily:'monospace',
                           textDecoration:'none', wordBreak:'break-all'}}>
                  {auditTrail.walrus_blob_id} ↗
                </a>
              </div>

              <button
                type="button"
                onClick={() => {
                  const data = JSON.stringify({
                    view_key_id: auditTrail.view_key_id,
                    view_key_secret: auditTrail.view_key_secret,
                    salt: auditTrail.salt,
                    walrus_blob_id: auditTrail.walrus_blob_id,
                  }, null, 2);
                  void navigator.clipboard.writeText(data);
                }}
                style={{width:'100%', marginTop:'10px', padding:'8px', borderRadius:'8px',
                        border:'1px solid #1a3a1a', background:'transparent', color:'#00ff41',
                        fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer'}}>
                📋 COPY VIEW KEY (for audit)
              </button>
            </div>
          )}

          <PresignedScheduleSection
            showSchedule={showSchedule}
            setShowSchedule={setShowSchedule}
            presignedScheduleRows={presignedScheduleRows}
            presignedScheduleLoading={presignedScheduleLoading}
            presignedScheduleStatus={presignedScheduleStatus}
            addPresignedScheduleRow={addPresignedScheduleRow}
            removePresignedScheduleRow={removePresignedScheduleRow}
            updatePresignedScheduleRow={updatePresignedScheduleRow}
            handleReserveAndSignAllPayments={handleReserveAndSignAllPayments}
            walletAddress={walletAddress}
            backendApiUrl={backendApiUrl}
          />
        </>
      )}

      {stealthSubTab === 'receive' && (
        <div style={{background:'#0d0d0d', borderRadius:'12px', padding:'12px', border:'1px solid #2a2a2a', marginBottom:'8px'}}>
          <button type="button" onClick={() => void handleScanStealth()}
            style={{width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #222', background:'#111', color:'#777', fontFamily:'monospace', fontSize:'0.72rem', cursor:'pointer'}}>
            🔍 SCAN & CLAIM
          </button>

          {zkStealthNotes.filter((n) => n.status === 'pending').length > 0 &&
            claimResults.length === 0 && (
            <div
              style={{
                background: '#0d0d0d',
                border: '1px solid #1a1a1a',
                borderRadius: '10px',
                padding: '12px 14px',
                marginTop: '10px',
              }}>
              <div
                style={{
                  color: '#444',
                  fontSize: '0.58rem',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                  marginBottom: '8px',
                }}>
                📩 INCOMING TRANSFER
              </div>

              <div
                style={{
                  color: '#00ff41',
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  marginBottom: '6px',
                }}>
                {zkStealthNotes
                  .filter((n) => n.status === 'pending')
                  .reduce((sum, n) => sum + (parseFloat(n.amount_sui || '0') || 0), 0)
                  .toFixed(4)}{' '}
                SUI
              </div>

              {firstPendingFiles.length > 0 ? (
                <StealthIncomingFileList attachments={firstPendingFiles} />
              ) : firstPendingNote?.memo ? (
                <div
                  style={{
                    color: '#00ccff',
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    marginBottom: '4px',
                    fontStyle: 'italic',
                  }}>
                  &quot;{firstPendingNote.memo}&quot;
                </div>
              ) : null}

              <div
                style={{
                  color: '#333',
                  fontSize: '0.58rem',
                  fontFamily: 'monospace',
                  marginBottom: '12px',
                }}>
                {firstPendingNote?.created_at
                  ? new Date(firstPendingNote.created_at).toLocaleTimeString()
                  : ''}
                {' · '}
                {pendingNotes.length} notes
              </div>

              <button
                type="button"
                onClick={() => void handleClaimAll()}
                disabled={zkClaimLoading}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: zkClaimLoading ? '#111' : '#00ff41',
                  color: zkClaimLoading ? '#777' : '#000',
                  fontFamily: 'monospace',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  cursor: zkClaimLoading ? 'wait' : 'pointer',
                  letterSpacing: '1px',
                  lineHeight: 1.3,
                }}>
                {zkClaimLoading ? zkClaimStatus || '⏳ Claiming...' : '⚡ CLAIM'}
              </button>
            </div>
          )}

          {claimResults.length > 0 && (
            <div
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a3a1a',
                borderRadius: '10px',
                padding: '12px',
                marginTop: '10px',
              }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setClaimResultsExpanded(!claimResultsExpanded)}>
                <div
                  style={{
                    color: '#00ff41',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                  }}>
                  ✅ CLAIMED{' '}
                  {claimResults
                    .filter((r) => r.success !== false)
                    .reduce((sum, r) => sum + (r.amount || 0), 0)
                    .toFixed(4)}{' '}
                  SUI
                </div>
                <div
                  style={{
                    color: claimResultsExpanded ? '#ffaa00' : '#00ff41',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                  }}>
                  {claimResultsExpanded ? '▲' : '▼'}
                </div>
              </div>

              {claimedFileAttachments.map((item, index) => (
                <StealthIncomingFileAttachment
                  key={`${item.attachment.blobId}-${index}`}
                  attachment={item.attachment}
                  autoDownloadOk={item.autoDownloadOk}
                  autoDownloadError={item.autoDownloadError || ""}
                  initialDownloadedSize={item.downloadedSize ?? null}
                  showCaption={index === 0}
                />
              ))}

              {claimResultsExpanded && (
                <div
                  style={{
                    marginTop: '10px',
                    borderTop: '1px solid #1a1a1a',
                    paddingTop: '8px',
                  }}>
                  {claimResults
                    .filter((r) => r.success !== false && r.digest)
                    .map((r, i) => (
                      <div
                        key={`${r.digest}-${i}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 0',
                          borderBottom: '1px solid #0d0d0d',
                        }}>
                        <div
                          style={{
                            color: '#333',
                            fontSize: '0.6rem',
                            fontFamily: 'monospace',
                          }}>
                          {r.relayer || r.from
                            ? (r.relayer || r.from)!.slice(0, 14) + '...'
                            : `wallet ${i + 1}`}
                        </div>
                        <div
                          style={{
                            color: '#777',
                            fontSize: '0.62rem',
                            fontFamily: 'monospace',
                          }}>
                          {r.amount ? r.amount.toFixed(4) : '?'} SUI
                        </div>
                        <a
                          href={`https://suiscan.xyz/testnet/tx/${r.digest}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#00ff41',
                            fontSize: '0.6rem',
                            fontFamily: 'monospace',
                            textDecoration: 'none',
                          }}>
                          SUISCAN ↗
                        </a>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </>
  )}

  {zbankMode === 'anonymous' && (
  <div className={glassCardStyles.glassCardNestedSection} style={{ marginTop:'4px', marginBottom:'12px' }}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
      <span style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>To:</span>
    </div>
    <div className={glassCardStyles.glassCardNested}>
      <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px'}}>
        <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png" style={{width:'28px', height:'28px', borderRadius:'50%', border:'1px solid #2a2a2a'}} alt="SUI" />
        <div>
          <div style={{color:'#fff', fontSize:'0.9rem', fontFamily:'monospace', fontWeight:'bold'}}>SUI ADDRESS</div>
          <div style={{color:'#777', fontSize:'0.65rem'}}>On-chain · Public</div>
        </div>
      </div>
      <div>
        <input className="zbank-input" value={zbRecipient} onChange={(e) => setZbRecipient(e.target.value)} placeholder="0x..."
          style={{background:'transparent', border:'none', color:'#ffffff', fontSize:'0.85rem', fontFamily:'monospace', width:'100%', outline:'none', padding:'4px 0'}} />
        {zbRecipient && zbRecipient.startsWith('0x') && zbRecipient.length === 66 && (
          <div style={{color:'#00ff41', fontSize:'0.65rem', marginTop:'4px'}}>✓ Valid Sui address</div>
        )}
      </div>
    </div>
  </div>
  )}

  {zbankMode === 'anonymous' && (() => {
    const statusMsg = zbStatus;
    const hideStatusForTxCard = zbTxDigest && statusMsg.startsWith('✅');
    if (!statusMsg || hideStatusForTxCard) return null;
    return (
      <div style={{ marginBottom:'12px', padding:'10px', borderRadius:'12px', fontSize:'0.72rem',
        background: statusMsg.startsWith('✅') ? 'rgba(0,255,65,0.08)' : statusMsg.startsWith('❌') ? 'rgba(255,34,68,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${statusMsg.startsWith('✅') ? '#2a3a2a' : statusMsg.startsWith('❌') ? 'rgba(255,34,68,0.3)' : '#2a2a2a'}`,
        color: statusMsg.startsWith('✅') ? '#00ff41' : statusMsg.startsWith('❌') ? '#ff4466' : '#666',
        whiteSpace: 'pre-line' }}>
        {zbLoading && !statusMsg.startsWith('✅') && !statusMsg.startsWith('❌') && '⏳ '}
        {statusMsg}
      </div>
    );
  })()}

  {zbankMode === 'anonymous' && (
    <button type="button" onClick={handleZbTransfer}
      disabled={zbLoading || !anonymousAmount || !zbRecipient}
      style={{width:'100%', padding:'16px', borderRadius:'16px', border:'none', background:'#00ff41', color:'#000',
              fontFamily:'monospace', fontSize:'0.9rem', fontWeight:'bold', letterSpacing:'2px', boxShadow:'0 4px 24px rgba(0,255,65,0.2)', transition:'all 0.2s',
              cursor: zbLoading ? 'wait' : 'pointer', opacity: (!anonymousAmount || !zbRecipient) ? 0.5 : zbLoading ? 0.7 : 1}}>
      {zbLoading ? 'PROCESSING...' : '🔒 SEND ANONYMOUSLY'}
    </button>
  )}

  {zbankMode === 'anonymous' && (
  <PresignedScheduleSection
    showSchedule={showSchedule}
    setShowSchedule={setShowSchedule}
    presignedScheduleRows={presignedScheduleRows}
    presignedScheduleLoading={presignedScheduleLoading}
    presignedScheduleStatus={presignedScheduleStatus}
    addPresignedScheduleRow={addPresignedScheduleRow}
    removePresignedScheduleRow={removePresignedScheduleRow}
    updatePresignedScheduleRow={updatePresignedScheduleRow}
    handleReserveAndSignAllPayments={handleReserveAndSignAllPayments}
    walletAddress={walletAddress}
    backendApiUrl={backendApiUrl}
  />
  )}

  {zbankMode === 'anonymous' && zbTxDigest && (
    <div style={{background:'#050f05', border:'1px solid #1a3a1a', borderRadius:'12px', padding:'14px 16px', marginTop:'12px'}}>
      <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
        <span style={{color:'#00ff41', fontSize:'1rem'}}>✅</span>
        <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace', letterSpacing:'1px', fontWeight:'bold'}}>TRANSFER SENT</span>
      </div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
        <div>
          <div style={{color:'#555', fontSize:'0.6rem', letterSpacing:'1px', marginBottom:'3px'}}>TRANSACTION</div>
          <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>
            {zbTxDigest.slice(0,8)}...{zbTxDigest.slice(-6)}
          </div>
        </div>
        <a
          href={`https://suiscan.xyz/testnet/tx/${zbTxDigest}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{display:'flex', alignItems:'center', gap:'6px', background:'#0d1a0d', border:'1px solid #1a3a1a', borderRadius:'8px', padding:'8px 12px', color:'#00ff41', fontSize:'0.7rem', fontFamily:'monospace', textDecoration:'none', letterSpacing:'1px', transition:'all 0.2s'}}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1a2a1a'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0d1a0d'; }}
        >
          SUISCAN ↗
        </a>
      </div>
    </div>
  )}

  {zbankMode === 'anonymous' && auditTrail && (
    <div style={{background:'#050f05', border:'1px solid #1a3a1a',
                 borderRadius:'12px', padding:'14px', marginTop:'10px'}}>
      <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
        <span>🔐</span>
        <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace',
                      fontWeight:'bold', letterSpacing:'1px'}}>
          AUDIT TRAIL SAVED
        </span>
        <span style={{marginLeft:'auto', background:'#0a1a0a', border:'1px solid #1a3a1a',
                      borderRadius:'4px', padding:'2px 8px', color:'#00ff41',
                      fontSize:'0.6rem', fontFamily:'monospace'}}>
          WALRUS
        </span>
      </div>

      <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px', marginBottom:'8px'}}>
        <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
          VIEW KEY ID (public)
        </div>
        <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>
          {auditTrail.view_key_id}
        </div>
      </div>

      <div style={{background:'#1a0a0a', border:'1px solid #3a1a1a', borderRadius:'8px',
                   padding:'10px 12px', marginBottom:'8px'}}>
        <div style={{color:'#ff4444', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
          🔑 VIEW KEY SECRET (keep private!)
        </div>
        <div style={{color:'#ff8888', fontSize:'0.65rem', fontFamily:'monospace',
                     wordBreak:'break-all'}}>
          {auditTrail.view_key_secret}
        </div>
        <div style={{color:'#555', fontSize:'0.58rem', marginTop:'6px'}}>
          Share this key only with authorized auditors to prove transaction details
        </div>
      </div>

      <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
        <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
          WALRUS BLOB ID
        </div>
        <a href={`/zco/${auditTrail.walrus_blob_id}`} target="_blank"
           rel="noopener noreferrer"
           style={{color:'#00ff41', fontSize:'0.65rem', fontFamily:'monospace',
                   textDecoration:'none', wordBreak:'break-all'}}>
          {auditTrail.walrus_blob_id} ↗
        </a>
      </div>

      <button
        type="button"
        onClick={() => {
          const data = JSON.stringify({
            view_key_id: auditTrail.view_key_id,
            view_key_secret: auditTrail.view_key_secret,
            salt: auditTrail.salt,
            walrus_blob_id: auditTrail.walrus_blob_id,
          }, null, 2);
          void navigator.clipboard.writeText(data);
        }}
        style={{width:'100%', marginTop:'10px', padding:'8px', borderRadius:'8px',
                border:'1px solid #1a3a1a', background:'transparent', color:'#00ff41',
                fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer'}}>
        📋 COPY VIEW KEY (for audit)
      </button>
    </div>
  )}

</div>
            </div>
  );
}
