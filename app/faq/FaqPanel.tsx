"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FAQ_SECTIONS, faqSectionMatchesQuery, type FaqSection } from "@/lib/faq-content";
import styles from "./faq.module.css";

/** Only link known site routes — avoids false positives like /NO, /USDC, /PUT. */
const FAQ_LINK_PATHS = [
  "/prediction-engine",
  "/field-notes",
  "/governance",
  "/constitution",
  "/achievements",
  "/leaderboard",
  "/archive",
  "/privacy",
  "/press",
  "/faq",
  "/whitepaper",
  "/lab",
  "/api/civilization/stats",
  "/api/zionbet/stats",
  "/api/my_bets",
  "/api/archive/stats",
  "/zco/[blob_id]",
  "/",
] as const;

const FAQ_LINK_RE = new RegExp(
  `(${FAQ_LINK_PATHS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "g",
);

function linkify(text: string) {
  const parts = text.split(FAQ_LINK_RE);
  return parts.map((part, i) => {
    if ((FAQ_LINK_PATHS as readonly string[]).includes(part)) {
      return (
        <Link key={`${part}-${i}`} href={part}>
          {part}
        </Link>
      );
    }
    return part;
  });
}

function SectionBlock({
  section,
  open,
  onToggle,
}: {
  section: FaqSection;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article className={`${styles.section} ${open ? styles.sectionOpen : ""}`}>
      <button
        type="button"
        className={styles.sectionTrigger}
        aria-expanded={open}
        aria-controls={`faq-panel-${section.id}`}
        onClick={onToggle}
      >
        <span className={styles.sectionTitleWrap}>
          <span>{section.title}</span>
          {section.pageHref && section.pageLabel ? (
            <Link
              href={section.pageHref}
              className={styles.sectionPageLink}
              onClick={(e) => e.stopPropagation()}
            >
              Open {section.pageLabel} →
            </Link>
          ) : null}
        </span>
        <span className={styles.chevron} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div id={`faq-panel-${section.id}`} className={styles.sectionBody}>
          <p className={styles.summary}>{linkify(section.summary)}</p>
          <h3 className={styles.blockTitle}>How to use</h3>
          <ol className={styles.steps}>
            {section.steps.map((step) => (
              <li key={step}>{linkify(step)}</li>
            ))}
          </ol>
          <h3 className={styles.blockTitle}>Common questions</h3>
          <div className={styles.qaList}>
            {section.faqs.map((item) => (
              <div key={item.question} className={styles.qaItem}>
                <p className={styles.qaQuestion}>{item.question}</p>
                <p className={styles.qaAnswer}>{linkify(item.answer)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function FaqPanel() {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>("getting-started");

  const filtered = useMemo(
    () => FAQ_SECTIONS.filter((s) => faqSectionMatchesQuery(s, query)),
    [query],
  );

  return (
    <>
      <div className={styles.searchWrap}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search guide… (e.g. stealth, DeepBook, Walrus)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search FAQ"
        />
        <p className={styles.searchMeta}>
          {filtered.length} of {FAQ_SECTIONS.length} sections
          {query.trim() ? ` matching “${query.trim()}”` : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No sections match your search. Try another keyword.</p>
      ) : (
        <div className={styles.accordion}>
          {filtered.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              open={openId === section.id}
              onToggle={() => setOpenId((prev) => (prev === section.id ? null : section.id))}
            />
          ))}
        </div>
      )}
    </>
  );
}
