import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";

export function ConstitutionBanner({ quote }: { quote?: string }) {
  const subtitle =
    quote ??
    "The planet reflects the soul of the civilization — prosperity, governance and the will of every agent shape its surface, lights and atmosphere in real time.";
  return (
    <GlassCard
      className={`${glassCardStyles.glassCardLab} constitutionQuoteCard`}
      style={{ marginBottom: 24 }}
      disableTilt
    >
      <div className="constitutionBannerRow">
        <span className="constitutionBannerItem">
          <strong>CONSTITUTION v3.02</strong>
        </span>
        <span
          className="constitutionBannerSubtitle"
          style={{
            fontFamily: "'Cinzel', serif",
            fontWeight: 400,
            fontSize: "0.68rem",
            color: "#94a3b8",
            letterSpacing: "0.05em",
            fontStyle: "normal",
            textTransform: "uppercase",
            marginTop: "6px",
            display: "block",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
          }}
        >
          {subtitle}
        </span>
      </div>
    </GlassCard>
  );
}
