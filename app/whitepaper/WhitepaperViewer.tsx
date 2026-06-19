"use client";

import Link from "next/link";
import {
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./whitepaper.module.css";

type Props = {
  content: string;
};

type Section = {
  title: string;
  id: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-—–:]/g, "")
    .replace(/[—–:]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractH2Sections(markdown: string): Section[] {
  const sections: Section[] = [];
  const used = new Set<string>();

  for (const line of markdown.split("\n")) {
    const match = line.match(/^## (.+)$/);
    if (!match) continue;

    const title = match[1].trim();
    let id = slugify(title);
    let unique = id;
    let suffix = 2;

    while (used.has(unique)) {
      unique = `${id}-${suffix++}`;
    }

    used.add(unique);
    sections.push({ title, id: unique });
  }

  return sections;
}

function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

export function WhitepaperViewer({ content }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sections = useMemo(() => extractH2Sections(content), [content]);
  const idByTitle = useMemo(
    () => new Map(sections.map((section) => [section.title, section.id])),
    [sections],
  );

  const handlePrint = () => window.print();

  const scrollToSection = useCallback(
    (index: number) => {
      const section = sections[index];
      if (!section) return;

      const el = document.getElementById(section.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveIndex(index);
      }
    },
    [sections],
  );

  const scrollPrev = useCallback(() => {
    if (activeIndex <= 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setActiveIndex(0);
      return;
    }
    scrollToSection(activeIndex - 1);
  }, [activeIndex, scrollToSection]);

  const scrollNext = useCallback(() => {
    if (activeIndex >= sections.length - 1) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      setActiveIndex(sections.length - 1);
      return;
    }
    scrollToSection(activeIndex + 1);
  }, [activeIndex, scrollToSection, sections.length]);

  useEffect(() => {
    if (!sections.length) return;

    const onScroll = () => {
      const offset = 96;
      let index = 0;

      for (let i = 0; i < sections.length; i++) {
        const el = document.getElementById(sections[i].id);
        if (el && el.getBoundingClientRect().top <= offset) {
          index = i;
        }
      }

      setActiveIndex(index);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  const markdownComponents = useMemo(
    () => ({
      h2: ({ children }: { children?: ReactNode }) => {
        const title = getNodeText(children).trim();
        const id = idByTitle.get(title) ?? slugify(title);
        return <h2 id={id}>{children}</h2>;
      },
    }),
    [idByTitle],
  );

  return (
    <>
      <div className={styles.pageBg} aria-hidden />
      <div className={styles.page}>
        <nav className={styles.nav} aria-label="Whitepaper navigation">
          <Link href="/" className={styles.navLink}>
            ← OBSERVATORY
          </Link>
          <span className={styles.navLabel}>WHITEPAPER</span>
        </nav>

        <div className={styles.wrap}>
          <article className={styles.article} id="whitepaper-print-root">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </article>

          <div className={styles.downloadWrap}>
            <button type="button" className={styles.downloadBtn} onClick={handlePrint}>
              ↓ DOWNLOAD PDF
            </button>
          </div>
        </div>

        {sections.length > 0 && (
          <div className={styles.scrollBtns} aria-label="Section scroll controls">
            <button
              type="button"
              className={styles.scrollBtn}
              onClick={scrollPrev}
              aria-label="Previous section"
              title={sections[Math.max(0, activeIndex - 1)]?.title ?? "Top"}
            >
              ↑ Top
            </button>
            <button
              type="button"
              className={styles.scrollBtn}
              onClick={scrollNext}
              aria-label="Next section"
              title={sections[Math.min(sections.length - 1, activeIndex + 1)]?.title ?? "Bottom"}
            >
              ↓ Bottom
            </button>
          </div>
        )}
      </div>
    </>
  );
}
