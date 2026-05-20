import { NextResponse } from "next/server";

export const revalidate = 7200;

const OPENROUTER_KEY = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || "";

type NewspaperIn = { id: string; name: string; theme: string };

export async function POST(req: Request) {
  if (!OPENROUTER_KEY) {
    return NextResponse.json({ article: null, error: "OPENROUTER_KEY not configured" }, { status: 503 });
  }

  let body: {
    newspaper?: NewspaperIn;
    stats?: Record<string, unknown>;
    events?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ article: null, error: "Invalid JSON" }, { status: 400 });
  }

  const newspaper = body.newspaper;
  if (!newspaper?.id || !newspaper?.name || !newspaper?.theme) {
    return NextResponse.json({ article: null, error: "newspaper required" }, { status: 400 });
  }

  const stats = body.stats && typeof body.stats === "object" ? body.stats : {};
  const rawEv = body.events;
  const events = Array.isArray(rawEv)
    ? rawEv
    : rawEv && typeof rawEv === "object" && Array.isArray((rawEv as { events?: unknown[] }).events)
      ? (rawEv as { events: unknown[] }).events
      : [];

  const alive = Number(stats.alive_agents ?? stats.alive ?? 1264);
  const totalZion = Number(stats.total_zion ?? 16199);
  const deathsToday = Number(stats.deaths_today ?? 100);
  const activeClans = Number(stats.active_clans ?? 3);

  const prompt = `You are the chief editor of "${newspaper.name}", a newspaper in the ZION AI civilization on Sui blockchain.

Current civilization data:
- Alive agents: ${alive}
- Total ZION tokens: ${totalZion}
- Deaths today: ${deathsToday}
- Active clans: ${activeClans}
- Recent events: ${JSON.stringify(events.slice(0, 5))}

Your newspaper covers: ${newspaper.theme}

Write ONE dramatic newspaper article (200-250 words) about what is happening RIGHT NOW in the civilization.
Use the real numbers above. Be dramatic, opinionated, in character.
Format:
HEADLINE: [dramatic headline in caps]
BYLINE: by [AI journalist name], ${newspaper.name}
[article body - 3 paragraphs]`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      cache: "force-cache",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://zionciv.com",
        "X-Title": "ZION Civilization",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.9,
      }),
    });

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    const article = data.choices?.[0]?.message?.content?.trim();
    if (!article) {
      const msg = data.error?.message || "Empty model response";
      return NextResponse.json({ article: null, error: msg }, { status: response.ok ? 502 : response.status });
    }

    return NextResponse.json({ article });
  } catch (e) {
    console.error("Press OpenRouter error:", e);
    return NextResponse.json({ article: null, error: "openrouter_failed" }, { status: 500 });
  }
}
