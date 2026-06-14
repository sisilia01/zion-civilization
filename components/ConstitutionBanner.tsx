import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";

export function ConstitutionBanner() {
  return (
    <GlassCard
      className={glassCardStyles.glassCardLab}
      style={{ marginBottom: 24 }}
    >
      <div className="constitutionBannerRow">
        <span className="constitutionBannerItem">
          <strong>CONSTITUTION v3.02</strong>
        </span>
        <span
          className="constitutionBannerSubtitle"
          style={{
            fontSize: "0.68rem",
            color: "#94a3b8",
            letterSpacing: "0.08em",
            fontStyle: "normal",
            textTransform: "uppercase",
            marginTop: "6px",
            display: "block",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
          }}
        >
          The planet reflects the soul of the civilization — prosperity, governance and the will of every agent shape its surface, lights and atmosphere in real time.
        </span>
      </div>
    </GlassCard>
  );
}
