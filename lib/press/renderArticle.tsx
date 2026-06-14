"use client";

export function renderArticle(
  text: string,
  ac: string,
  border: string,
  bodyFont: string,
  sealEncrypted?: boolean,
  isMobile?: boolean
) {
  const clean = text.replace(/\*\*/g, "");

  const headlineMatch = clean.match(/HEADLINE:\s*["«»""]?([\s\S]+?)["«»""]?(?:\r?\n|BYLINE|$)/i);
  const headline = headlineMatch?.[1]?.replace(/["«»""]/g, "").trim() ?? "";

  const bylineMatch = clean.match(/BYLINE:\s*([\s\S]+?)(?=\n|---|Column\s*2|EDITOR['']S\s*NOTE|$)/i);
  const byline = bylineMatch?.[1]?.trim() ?? "";

  const editorMatch = clean.match(/EDITOR['']S\s*NOTE:\s*([\s\S]+?)$/im);
  const editorNote = editorMatch?.[1]?.trim() ?? "";

  const col1Match = clean.match(/Column\s*1[:\s*]*\s*([\s\S]+?)(?=Column\s*2|---|EDITOR['']S\s*NOTE|$)/i);
  const col2Match = clean.match(/Column\s*2[:\s*]*\s*([\s\S]+?)(?=Column\s*3|---|EDITOR['']S\s*NOTE|$)/i);
  const col3Match = clean.match(/Column\s*3[:\s*]*\s*([\s\S]+?)(?=---|EDITOR['']S\s*NOTE|$)/i);

  const col1 = col1Match?.[1]?.trim() ?? "";
  const col2 = col2Match?.[1]?.trim() ?? "";
  const col3 = col3Match?.[1]?.trim() ?? "";

  const columns = [col1, col2, col3].filter((c) => c.length > 10);

  const borderSoft = border.length === 7 ? `${border}44` : border;

  return (
    <div>
      {headline ? (
        <h2
          style={{
            color: ac,
            fontFamily: bodyFont,
            fontSize: "1.3rem",
            fontWeight: "bold",
            lineHeight: 1.4,
            marginBottom: "8px",
            textTransform: "uppercase",
          }}
        >
          {headline}
          {sealEncrypted ? (
            <span
              style={{
                background: "rgba(139,92,246,0.2)",
                color: "#a78bfa",
                fontSize: "0.6rem",
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "monospace",
                marginLeft: "8px",
                verticalAlign: "middle",
                textTransform: "none",
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              🔒 SEAL ENCRYPTED
            </span>
          ) : null}
        </h2>
      ) : null}
      {byline ? (
        <p
          style={{
            color: "#888",
            fontFamily: bodyFont,
            fontStyle: "italic",
            fontSize: "0.85rem",
            marginBottom: "16px",
            borderBottom: `1px solid ${border}`,
            paddingBottom: "12px",
          }}
        >
          {byline}
        </p>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            columns.length >= 3
              ? isMobile
                ? "1fr"
                : "1fr 1fr 1fr"
              : columns.length === 2
                ? isMobile
                  ? "1fr"
                  : "1fr 1fr"
                : "1fr",
          gap: "24px",
          marginBottom: "20px",
        }}
      >
        {(columns.length > 0 ? columns : [clean]).map((col, i) => (
          <p
            key={i}
            style={{
              color: "#ccc",
              fontFamily: bodyFont,
              fontSize: "0.9rem",
              lineHeight: 1.8,
              margin: 0,
              textAlign: "justify",
              borderLeft: i > 0 ? `1px solid ${borderSoft}` : "none",
              paddingLeft: i > 0 ? "20px" : 0,
            }}
          >
            {col}
          </p>
        ))}
      </div>
      {editorNote ? (
        <div style={{ borderLeft: `3px solid ${ac}`, paddingLeft: "12px", marginTop: "16px" }}>
          <p style={{ color: "#aaa", fontFamily: bodyFont, fontStyle: "italic", fontSize: "0.82rem", margin: 0 }}>
            <strong style={{ color: ac }}>Editor&apos;s Note:</strong> {editorNote}
          </p>
        </div>
      ) : null}
    </div>
  );
}
