import Link from "next/link";
import type { ReactNode } from "react";
import { Mail, MessageCircle, Newspaper } from "lucide-react";
import {
  SITE_PROJECT,
  SITE_SOCIAL,
  truncateOnChainId,
  WALRUS_AGGREGATOR_URL,
  ZION_PACKAGE_ID,
  ZION_PACKAGE_SUICAN_URL,
} from "@/lib/site-links";
import styles from "./SiteFooter.module.css";
import { SiteFooterStrings } from "./SiteFooterStrings";

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={styles.linkIcon}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function YoutubeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={styles.linkIcon}
    >
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12 9.6 15.6z" />
    </svg>
  );
}

function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={styles.linkIcon}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.88 10.93c.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.4-5.25 5.68.41.35.78 1.04.78 2.1 0 1.52-.01 2.74-.01 3.11 0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function FooterLink({
  href,
  label,
  icon,
  external = true,
  mono = false,
  title,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
  mono?: boolean;
  title?: string;
}) {
  const className = `${styles.link}${mono ? ` ${styles.mono}` : ""}`;

  if (external) {
    return (
      <a
        href={href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
      >
        {icon}
        <span>{label}</span>
      </a>
    );
  }

  return (
    <Link href={href} className={className} title={title}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function SiteFooter() {
  const packageLabel = truncateOnChainId(ZION_PACKAGE_ID);

  return (
    <footer className={styles.footer} aria-label="Site footer">
      <SiteFooterStrings />
      <div className={styles.inner}>
        <div className={styles.columns}>
          <section aria-labelledby="footer-community">
            <h2 id="footer-community" className={styles.columnTitle}>
              Community
            </h2>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}>
                <FooterLink href={SITE_SOCIAL.twitter} label="X (Twitter)" icon={<XIcon />} />
              </li>
              <li className={styles.linkItem}>
                <FooterLink href={SITE_SOCIAL.youtube} label="YouTube" icon={<YoutubeIcon />} />
              </li>
              <li className={styles.linkItem}>
                <FooterLink
                  href={SITE_SOCIAL.medium}
                  label="Medium"
                  icon={<Newspaper size={14} className={styles.linkIcon} strokeWidth={1.75} />}
                />
              </li>
              <li className={styles.linkItem}>
                <FooterLink
                  href={SITE_SOCIAL.discord}
                  label="Discord"
                  icon={<MessageCircle size={14} className={styles.linkIcon} strokeWidth={1.75} />}
                />
              </li>
            </ul>
          </section>

          <section aria-labelledby="footer-onchain">
            <h2 id="footer-onchain" className={styles.columnTitle}>
              On-chain
            </h2>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}>
                <FooterLink
                  href={ZION_PACKAGE_SUICAN_URL}
                  label={`Package ${packageLabel}`}
                  icon={<span className={styles.linkIcon} aria-hidden>⬡</span>}
                  mono
                  title={ZION_PACKAGE_ID}
                />
              </li>
              <li className={styles.linkItem}>
                <FooterLink
                  href={ZION_PACKAGE_SUICAN_URL}
                  label="Sui Explorer"
                  icon={<span className={styles.linkIcon} aria-hidden>↗</span>}
                />
              </li>
              <li className={styles.linkItem}>
                <FooterLink
                  href={WALRUS_AGGREGATOR_URL}
                  label="Walrus Aggregator"
                  icon={<span className={styles.linkIcon} aria-hidden>↗</span>}
                />
              </li>
            </ul>
          </section>

          <section aria-labelledby="footer-project">
            <h2 id="footer-project" className={styles.columnTitle}>
              Project
            </h2>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}>
                <FooterLink
                  href={`mailto:${SITE_PROJECT.email}`}
                  label={SITE_PROJECT.email}
                  icon={<Mail size={14} className={styles.linkIcon} strokeWidth={1.75} />}
                />
              </li>
              <li className={styles.linkItem}>
                <FooterLink href={SITE_PROJECT.github} label="GitHub" icon={<GithubIcon />} />
              </li>
              <li className={styles.linkItem}>
                <FooterLink
                  href="/faq"
                  label="FAQ"
                  icon={<Newspaper size={14} className={styles.linkIcon} strokeWidth={1.75} />}
                  external={false}
                />
              </li>
              <li className={styles.linkItem}>
                <FooterLink
                  href={SITE_PROJECT.whitepaper}
                  label="Whitepaper"
                  icon={<Newspaper size={14} className={styles.linkIcon} strokeWidth={1.75} />}
                  external={false}
                />
              </li>
            </ul>
          </section>
        </div>

        <p className={styles.copy}>© 2026 ZION Civilization · Built on Sui</p>
      </div>
    </footer>
  );
}
