/** Client-side ZION transliteration — mirrors zion_translit.py (fallback seed, no vocab). */

const FALLBACK_SEED = "zion_translit_fallback";
const TOKEN_RE = /Z(\d{2})/g;
const WORD_RE = /[A-Za-z0-9']+/g;

export type TransliterationMaps = {
  charMap: Record<string, number>;
  digitMap: Record<string, number>;
  spaceGlyph: number;
  punctMap: Record<string, number>;
};

async function glyphForLabel(seed: string, label: string): Promise<number> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(seed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(label));
  return new Uint8Array(buf)[0] % 48;
}

export async function buildTransliterationMaps(
  seed: string = FALLBACK_SEED,
): Promise<TransliterationMaps> {
  const charMap: Record<string, number> = {};
  for (const ch of "abcdefghijklmnopqrstuvwxyz") {
    charMap[ch] = await glyphForLabel(seed, `char:${ch}`);
  }
  const digitMap: Record<string, number> = {};
  for (const d of "0123456789") {
    digitMap[d] = await glyphForLabel(seed, `digit:${d}`);
  }
  const punctMap: Record<string, number> = {};
  for (const ch of ".,!?;:-") {
    punctMap[ch] = await glyphForLabel(seed, `punct:${ch}`);
  }
  const spaceGlyph = await glyphForLabel(seed, "space");
  return { charMap, digitMap, spaceGlyph, punctMap };
}

function charToGlyph(ch: string, maps: TransliterationMaps): number | null {
  const c = ch.toLowerCase();
  if (maps.charMap[c] !== undefined) return maps.charMap[c];
  if (maps.digitMap[c] !== undefined) return maps.digitMap[c];
  return null;
}

export function parseZionTokens(text: string): number[] {
  const out: number[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    out.push(parseInt(m[1], 10));
  }
  return out;
}

export function translitToZion(text: string, maps: TransliterationMaps): number[] {
  if (!text) return [];
  if (/Z\d{2}/.test(text)) {
    return parseZionTokens(text);
  }

  const out: number[] = [];
  const parts = text.split(/(\s+)/);

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out.push(maps.spaceGlyph);
      continue;
    }

    const words = part.match(WORD_RE) ?? [];
    for (const word of words) {
      for (const ch of word) {
        const gid = charToGlyph(ch, maps);
        if (gid !== null) out.push(gid);
      }
    }

    for (const ch of part) {
      if (".,!?;:-".includes(ch)) {
        out.push(maps.punctMap[ch]);
      }
    }
  }

  return out;
}

/** Format ISO timestamp as HH:MM (24h) for glyph transliteration. */
export function timeToGlyphText(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "00:00";
  }
}

export function prepareGlyphSvgs(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, svg] of Object.entries(raw)) {
    out[key] = svg.replace(/#1a1a2e/gi, "#00b4d8");
  }
  return out;
}
