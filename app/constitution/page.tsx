"use client";

import { IM_Fell_English } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

const imFell = IM_Fell_English({ subsets: ["latin"], weight: ["400"] });

const SUI_TESTNET_PACKAGE =
  "0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d";
const SUI_TESTNET_PACKAGE_URL = `https://testnet.suivision.xyz/package/${SUI_TESTNET_PACKAGE}`;

type ConstitutionArticle = { heading: string; body: string };

type ConstitutionData = {
  title: string;
  subtitle: string;
  version: string;
  sha256: string;
  walrus_blob: string;
  walrus_url: string;
  registry: string;
  preamble: string;
  articles: ConstitutionArticle[];
  agents_ratified: number;
  consensus_pct: number;
};

type Amendment = {
  id: number;
  proposal_number: number | null;
  title: string;
  description: string;
  change_type?: string;
  status: string;
  status_label: string;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  total_votes: number;
  merkle_root: string | null;
  blob_id: string | null;
  walrus_url?: string;
  created_at: string;
  closed_at?: string | null;
};

const ROMAN = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
  "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX",
  "XXXI", "XXXII", "XXXIII", "XXXIV", "XXXV", "XXXVI", "XXXVII", "XXXVIII", "XXXIX", "XL",
  "XLI", "XLII", "XLIII", "XLIV", "XLV", "XLVI", "XLVII", "XLVIII", "XLIX", "L",
  "LI",
];

function toRoman(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function truncateBlob(blob: string): string {
  if (blob.length <= 16) return blob;
  return `${blob.slice(0, 8)}...${blob.slice(-4)}`;
}

/** Keep only the newest open proposal per title. */
function dedupeProposedAmendments(items: Amendment[]): Amendment[] {
  const latestByTitle = new Map<string, Amendment>();

  for (const a of items) {
    const titleKey = a.title.trim().toLowerCase();
    const prev = latestByTitle.get(titleKey);
    if (!prev || new Date(a.created_at) > new Date(prev.created_at)) {
      latestByTitle.set(titleKey, a);
    }
  }

  return [...latestByTitle.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function renderMarkdownish(text: string): ReactNode[] {
  return text.split(/\n\n+/).map((para, i) => {
    const lines = para.split("\n").map((line, j) => {
      const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      const italic = bold.replace(/\*(.+?)\*/g, "<em>$1</em>");
      return (
        <span
          key={j}
          dangerouslySetInnerHTML={{ __html: italic }}
          style={{ display: "block", marginBottom: line.startsWith("- ") ? "0.35rem" : 0 }}
        />
      );
    });
    return (
      <p key={i} className="constPara">
        {lines}
      </p>
    );
  });
}

export default function ConstitutionPage() {
  const [constitution, setConstitution] = useState<ConstitutionData | null>(null);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [cRes, aRes] = await Promise.all([
        fetch("/api/constitution"),
        fetch("/api/constitution/amendments"),
      ]);
      if (!cRes.ok) throw new Error("Constitution fetch failed");
      const cData = (await cRes.json()) as ConstitutionData;
      setConstitution(cData);
      if (aRes.ok) {
        const aData = (await aRes.json()) as { amendments: Amendment[] };
        setAmendments(aData.amendments ?? []);
      }
      setError("");
    } catch {
      setError("Unable to load constitution from the civilization record.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const handlePrint = () => window.print();

  const preambleFirst = constitution?.preamble?.trim() ?? "";
  const dropCap = preambleFirst.charAt(0);
  const preambleRest = preambleFirst.slice(1);

  const enactedAmendments = amendments
    .filter((a) => a.status_label === "ENACTED")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const enactedTitles = new Set(
    enactedAmendments.map((a) => a.title.trim().toLowerCase()),
  );
  const proposedAmendments = dedupeProposedAmendments(
    amendments.filter(
      (a) =>
        a.status_label === "PROPOSED" &&
        !enactedTitles.has(a.title.trim().toLowerCase()),
    ),
  );
  const rejectedAmendments = amendments.filter((a) => a.status_label === "REJECTED");

  return (
    <div className={`constitutionRoot ${imFell.className}`}>
      <style jsx global>{`
        @media print {
          .constitutionNav,
          .constDownloadBtn {
            display: none !important;
          }
          .constitutionRoot {
            background: #fff !important;
            color: #111 !important;
            padding: 0.5in !important;
          }
          .constitutionPaper {
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          .constPara,
          .constArticleBody {
            color: #111 !important;
          }
        }
      `}</style>
      <style jsx>{`
        .constitutionRoot {
          min-height: 100vh;
          background: #050d1a;
          color: #e8d5a3;
          padding: 2rem 1.25rem 4rem;
          line-height: 1.75;
          font-size: 1.05rem;
        }
        .constitutionNav {
          max-width: 52rem;
          margin: 0 auto 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.72rem;
          letter-spacing: 0.12em;
        }
        .constitutionNav a {
          color: #8fa8c8;
          text-decoration: none;
        }
        .constitutionNav a:hover {
          color: #e8d5a3;
        }
        .constitutionPaper {
          max-width: 52rem;
          margin: 0 auto;
          padding: 2.5rem 2rem 3rem;
          border: 1px solid rgba(232, 213, 163, 0.15);
          background: rgba(8, 18, 36, 0.55);
          box-shadow: 0 0 60px rgba(0, 0, 0, 0.45);
        }
        .constDivider {
          text-align: center;
          letter-spacing: 0.2em;
          color: rgba(232, 213, 163, 0.45);
          margin: 2rem 0;
          font-size: 0.85rem;
        }
        .constTitle {
          text-align: center;
          font-variant: small-caps;
          font-size: 2rem;
          letter-spacing: 0.14em;
          margin: 0 0 0.5rem;
          line-height: 1.3;
        }
        .constSubtitle {
          text-align: center;
          font-variant: small-caps;
          letter-spacing: 0.18em;
          font-size: 0.95rem;
          color: rgba(232, 213, 163, 0.72);
          margin: 0 0 1.5rem;
        }
        .constStats {
          text-align: center;
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          color: #94a3b8;
          margin-bottom: 2rem;
          line-height: 1.7;
        }
        .constStatsLine {
          display: block;
        }
        .constStats a {
          color: #7eb8ff;
          text-decoration: none;
        }
        .constStats a:hover {
          text-decoration: underline;
        }
        .constSectionLabel {
          font-variant: small-caps;
          letter-spacing: 0.22em;
          text-align: center;
          font-size: 1.1rem;
          margin: 2rem 0 1rem;
        }
        .constPreamble {
          text-align: justify;
          hyphens: auto;
        }
        .dropCap {
          float: left;
          font-size: 3.6rem;
          line-height: 0.85;
          padding-right: 0.12em;
          padding-top: 0.06em;
          color: #f0ddb0;
        }
        :global(.constPara) {
          margin: 0 0 1rem;
          text-align: justify;
        }
        .constArticle {
          margin-top: 2.25rem;
        }
        .constArticleHeading {
          font-variant: small-caps;
          letter-spacing: 0.16em;
          font-size: 1.15rem;
          margin: 0 0 1rem;
          text-align: center;
          border-bottom: 1px solid rgba(232, 213, 163, 0.12);
          padding-bottom: 0.75rem;
        }
        .constArticleBody {
          text-align: justify;
        }
        .amendmentsHeader {
          text-align: center;
          letter-spacing: 0.14em;
          font-variant: small-caps;
          font-size: 0.95rem;
          color: rgba(232, 213, 163, 0.8);
          margin: 2.5rem 0 1.5rem;
        }
        .amendmentCard {
          border: 1px solid rgba(232, 213, 163, 0.12);
          padding: 1.25rem 1.35rem;
          margin-bottom: 1.25rem;
          background: rgba(5, 13, 26, 0.5);
        }
        .amendmentTitleRow {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }
        .amendmentTitle {
          font-variant: small-caps;
          letter-spacing: 0.12em;
          font-size: 1rem;
        }
        .statusBadge {
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.62rem;
          letter-spacing: 0.14em;
          padding: 0.25rem 0.55rem;
          border: 1px solid;
        }
        .statusENACTED {
          color: #6fcf97;
          border-color: rgba(111, 207, 151, 0.45);
        }
        .statusPROPOSED {
          color: #f2c94c;
          border-color: rgba(242, 201, 76, 0.45);
        }
        .statusREJECTED {
          color: #eb5757;
          border-color: rgba(235, 87, 87, 0.45);
        }
        .amendmentMeta {
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.65rem;
          letter-spacing: 0.06em;
          color: rgba(232, 213, 163, 0.55);
          margin-bottom: 0.75rem;
        }
        .amendmentMeta a {
          color: #7eb8ff;
          text-decoration: none;
        }
        .amendmentDesc {
          font-size: 0.98rem;
          color: rgba(232, 213, 163, 0.88);
        }
        .constDownloadBtn {
          display: block;
          margin: 2.5rem auto 0;
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.72rem;
          letter-spacing: 0.16em;
          padding: 0.85rem 1.5rem;
          background: transparent;
          border: 1px solid rgba(232, 213, 163, 0.35);
          color: #e8d5a3;
          cursor: pointer;
        }
        .constDownloadBtn:hover {
          background: rgba(232, 213, 163, 0.08);
        }
        .constLoading {
          text-align: center;
          padding: 4rem;
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.75rem;
          letter-spacing: 0.14em;
          color: rgba(232, 213, 163, 0.5);
        }
        .constError {
          text-align: center;
          color: #eb5757;
          padding: 2rem;
        }
      `}</style>

      <nav className="constitutionNav" aria-label="Constitution navigation">
        <Link href="/">← OBSERVATORY</Link>
        <span>ZION CIVILIZATION</span>
      </nav>

      <article className="constitutionPaper" id="constitution-print-root">
        {loading && <div className="constLoading">LOADING CONSTITUTIONAL RECORD…</div>}
        {error && <div className="constError">{error}</div>}

        {constitution && (
          <>
            <h1 className="constTitle">{constitution.title}</h1>
            <p className="constSubtitle">{constitution.subtitle}</p>

            <div className="constStats">
              <span className="constStatsLine">
                RATIFIED BY DEMOCRATIC CONSENSUS · {constitution.consensus_pct}% APPROVAL
              </span>
              <span className="constStatsLine">
                WALRUS: {truncateBlob(constitution.walrus_blob)}{" "}
                <a href={constitution.walrus_url} target="_blank" rel="noopener noreferrer">
                  [VERIFY ↗]
                </a>{" "}
                ·{" "}
                <a href={SUI_TESTNET_PACKAGE_URL} target="_blank" rel="noopener noreferrer">
                  [VIEW ON SUI TESTNET ↗]
                </a>
              </span>
            </div>

            <div className="constDivider">═══════════════════════</div>

            <h2 className="constSectionLabel">Preamble</h2>
            <div className="constPreamble">
              <span className="dropCap" aria-hidden>
                {dropCap}
              </span>
              {renderMarkdownish(preambleRest)}
            </div>

            <div className="constDivider">═══════════════════════</div>

            {constitution.articles.map((article) => (
              <section key={article.heading} className="constArticle">
                <h3 className="constArticleHeading">{article.heading}</h3>
                <div className="constArticleBody">{renderMarkdownish(article.body)}</div>
              </section>
            ))}

            <div className="amendmentsHeader">
              ━━━━━━━━━━ AMENDMENTS TO THE CONSTITUTION ━━━━━━━━━━
            </div>

            {enactedAmendments.map((a, idx) => (
              <div key={`enacted-${a.id}`} className="amendmentCard">
                <div className="amendmentTitleRow">
                  <span className="amendmentTitle">
                    AMENDMENT {toRoman(idx + 1)} — {a.title}
                  </span>
                  <span className={`statusBadge status${a.status_label}`}>{a.status_label}</span>
                </div>
                <div className="amendmentMeta">
                  FOR {a.votes_for?.toLocaleString() ?? 0} · AGAINST{" "}
                  {a.votes_against?.toLocaleString() ?? 0} · ABSTAIN{" "}
                  {a.votes_abstain?.toLocaleString() ?? 0} · {formatDate(a.created_at)}
                  {a.blob_id && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={a.walrus_url ?? `/zco/${a.blob_id}`} target="_blank" rel="noopener noreferrer">
                        WALRUS: {truncateBlob(a.blob_id)}
                      </a>
                    </>
                  )}
                  {a.merkle_root && <> · MERKLE: {truncateBlob(a.merkle_root)}</>}
                </div>
                <div className="amendmentDesc">{a.description}</div>
              </div>
            ))}

            {proposedAmendments.map((a) => (
              <div key={a.id} className="amendmentCard">
                <div className="amendmentTitleRow">
                  <span className="amendmentTitle">
                    {a.proposal_number != null ? `PROPOSAL ${a.proposal_number}` : "PROPOSAL"} — {a.title}
                  </span>
                  <span className={`statusBadge status${a.status_label}`}>{a.status_label}</span>
                </div>
                <div className="amendmentMeta">
                  FOR {a.votes_for?.toLocaleString() ?? 0} · AGAINST{" "}
                  {a.votes_against?.toLocaleString() ?? 0} · {formatDate(a.created_at)}
                </div>
                <div className="amendmentDesc">{a.description}</div>
              </div>
            ))}

            {rejectedAmendments.slice(0, 6).map((a) => (
              <div key={a.id} className="amendmentCard">
                <div className="amendmentTitleRow">
                  <span className="amendmentTitle">
                    {a.proposal_number != null ? `PROPOSAL ${a.proposal_number}` : "PROPOSAL"} — {a.title}
                  </span>
                  <span className={`statusBadge status${a.status_label}`}>{a.status_label}</span>
                </div>
                <div className="amendmentMeta">
                  FOR {a.votes_for?.toLocaleString() ?? 0} · AGAINST{" "}
                  {a.votes_against?.toLocaleString() ?? 0} · {formatDate(a.created_at)}
                </div>
                <div className="amendmentDesc">{a.description}</div>
              </div>
            ))}

            <button type="button" className="constDownloadBtn" onClick={handlePrint}>
              [ DOWNLOAD AS PDF ]
            </button>
          </>
        )}
      </article>
    </div>
  );
}
