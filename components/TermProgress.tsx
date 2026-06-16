interface TermProgressProps {
  daysRemaining: number;
  termDays: number;
}

/** Match president API: term_day = max(1, floor(days_elapsed) + 1) */
export function termDayDisplay(daysRemaining: number, termDays: number): number {
  const safeTermDays = termDays > 0 ? termDays : 1;
  const daysElapsed = Math.max(0, safeTermDays - Math.max(0, daysRemaining));
  return Math.min(safeTermDays, Math.max(1, Math.floor(daysElapsed) + 1));
}

export function TermProgress({ daysRemaining, termDays }: TermProgressProps) {
  const safeTermDays = termDays > 0 ? termDays : 1;
  const progressPct = Math.max(
    0,
    Math.min(100, ((safeTermDays - daysRemaining) / safeTermDays) * 100),
  );
  const displayDay = termDayDisplay(daysRemaining, termDays);

  return (
    <div style={{ marginTop: "8px" }}>
      <div
        style={{
          height: "6px",
          background: "rgba(0,255,136,0.1)",
          borderRadius: "3px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: "100%",
            background: progressPct > 90 ? "#ff6b6b" : "#00ff88",
            borderRadius: "3px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "#94a3b8",
          marginTop: "4px",
          textAlign: "center",
        }}
      >
        Day {displayDay} / {safeTermDays}
      </div>
    </div>
  );
}
