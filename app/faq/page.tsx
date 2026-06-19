import Link from "next/link";
import type { Metadata } from "next";
import { FaqPanel } from "./FaqPanel";
import styles from "./faq.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQ — ZION Civilization",
  description: "Full guide to Observatory, Prediction Engine, Privacy, LAB, Archive, and every section of ZION Civilization.",
};

export default function FaqPage() {
  return (
    <>
      <div className={styles.pageBg} aria-hidden />
      <div className={styles.page}>
        <nav className={styles.nav} aria-label="FAQ navigation">
          <Link href="/" className={styles.navLink}>
            ← OBSERVATORY
          </Link>
          <span className={styles.navLabel}>FULL GUIDE</span>
        </nav>
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <h1 className={styles.heroTitle}>ZION Civilization — Full Guide</h1>
            <p className={styles.heroDesc}>
              Everything you need to explore the autonomous AI civilization on Sui testnet — from your
              first wallet connection to prediction markets, ZK Privacy, Walrus archives, and
              achievements.
            </p>
          </header>
          <FaqPanel />
        </div>
      </div>
    </>
  );
}
