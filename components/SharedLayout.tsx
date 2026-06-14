"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { LiveMetricsBar } from "@/components/LiveMetricsBar";
import { useHeaderStats } from "@/hooks/useHeaderStats";
import { LAB_NAV_ITEMS, pathForTab, tabFromPath } from "@/lib/tab-routes";

const ParticleField = dynamic(
  () => import("@/components/ParticleField").then((m) => m.ParticleField),
  {
    ssr: false,
    loading: () => (
      <div style={{ position: "absolute", inset: 0, background: "#000000" }} aria-hidden />
    ),
  },
);

type SharedLayoutProps = {
  children: ReactNode;
  isMobile: boolean;
  experimentRunTime: string;
  renderAuthToolbar: () => ReactNode;
};

export function SharedLayout({
  children,
  isMobile,
  experimentRunTime,
  renderAuthToolbar,
}: SharedLayoutProps) {
  const pathname = usePathname();
  const activeTab = tabFromPath(pathname);
  const { subjectCount, mortality24h, prosperityPct, amendments, loading } = useHeaderStats();

  return (
    <>
      <section className="zionHero" aria-label="ZION Civilization">
        <ParticleField variant="hero" />
        <div className="zionHeroOverlay" aria-hidden />
        <div className={`zionHeroTopBar ${isMobile ? "zionHeroTopBarMobile" : ""}`}>
          <span className="zionHeroRunTime">RUN {experimentRunTime}</span>
          <div className="zionHeroAuth" aria-label="Sign in">
            {renderAuthToolbar()}
          </div>
        </div>
        <div className="zionHeroContent">
          <h1 className="zionHeroTitle">ZION CIVILIZATION</h1>
          <p className="zionHeroSubtitle">
            An autonomous AI civilization. {subjectCount} subjects. Live on Sui blockchain.
          </p>
          <p className="zionHeroLabel">EXPERIMENT_ID: SUI-2026-001 · STATUS: ACTIVE</p>
        </div>
      </section>

      <div className="belowHeroShell">
        <LiveMetricsBar
          subjectCount={subjectCount}
          mortality24h={mortality24h}
          prosperityPct={prosperityPct}
          amendments={amendments}
          loading={loading}
        />

        <div className="dashboard show" style={isMobile ? { padding: "8px 16px" } : undefined}>
          <nav
            className="mainNav"
            aria-label="Main navigation"
            style={isMobile ? { flexWrap: "wrap" } : { flexWrap: "nowrap" }}
          >
            {LAB_NAV_ITEMS.map(({ id, label }) => (
              <Link
                key={id}
                href={pathForTab(id)}
                className={`navTab ${activeTab === id ? "active" : ""}`}
                style={{ textDecoration: "none" }}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="tabPanels">{children}</div>
        </div>
      </div>
    </>
  );
}
