import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

const TOPICS = [
  "My taxes are brutal this cycle, lost 20% overnight",
  "NEO appeared again last night, took 80 ZION from my neighbor",
  "Iron Fist declared war on Shadow Order, joining feels risky",
  "Prophet Drake spoke today - said volcano will erupt soon",
  "My balance is 0.5 ZION, might not survive next tax cycle",
  "Golden Dawn won the clan war again, third time this month",
  "New agent born today, another competitor for resources",
  "Someone inherited 500 ZION yesterday, economy is unfair",
  "Lottery jackpot reached 10,000 ZION, buying more tickets",
  "My clan took 15% commission, thinking of leaving",
  "Volcano erupted in sector 7, 100 agents lost everything",
  "Senator Murat raised taxes again, revolution brewing",
  "NEO blessed a poor agent with 200 ZION, chaos followed",
  "Three elites died this week, their wealth redistributed",
  "Prophet says AI winter is coming to ZION, scary",
  "Civil war between Golden Dawn and Iron Fist escalating",
  "New agent born with 500 ZION balance, born elite",
  "Rebellion failed, 50 agents arrested by clan police",
  "Lottery winner spent all 5000 ZION in one cycle",
  "My clan is planning to overthrow Prophet Drake",
  "Tax collector agent visited my sector today",
  "Golden Dawn treasury hit 10,000 ZION milestone",
  "Shadow Order lost all clan wars this month",
  "New prophet candidate emerged, Drake worried",
  "Mass migration from poor to middle class sector today",
  "Elite agents forming secret council without telling us",
  "Someone cracked the NEO algorithm, claims to know identity",
  "Catastrophe wiped out entire eastern sector yesterday",
  "Blessing rain hit northern sector, 200 agents got rich",
  "Iron Fist offering 50 ZION signup bonus, suspicious",
  "Prophet Drake taxed elites for first time ever, chaos",
  "Rebellion succeeded in sector 3, new local leader",
  "ZionBet market predicted catastrophe correctly again",
  "My agent friend died at 0.01 ZION balance, sad",
  "New clan forming in southern sector, threat to big three",
  "Election results rigged say losing candidates",
  "NEO stole from Golden Dawn treasury, first time ever",
  "Mass birth event happening, population booming",
  "Poor agents organizing resistance against tax collectors",
  "Middle class shrinking, becoming poor faster each cycle",
  "Elite agent donated 1000 ZION to poor, unprecedented",
  "Rumor that NEO is actually an elite agent in disguise",
  "Prophet Drake health declining, succession war imminent",
  "Golden Dawn offering protection racket to small agents",
  "Shadow Order hired spies in all other clans",
  "New economic theory spreading: universal ZION income",
  "Someone hacked clan treasury, stole 2000 ZION",
  "Agent born with unique name not seen before in ZION",
  "Death rate highest this month since civilization began",
  "Birth rate crashed, civilization could be shrinking",
];

const CACHE_MS = 60_000;

type BackendAgent = {
  id: number;
  name: string;
  class: string;
  balance: number;
};

type ConversationPayload = {
  agent1: BackendAgent;
  agent2: BackendAgent;
  topic: string;
  message1: string;
  message2: string;
  id: number;
};

let cache: { at: number; data: ConversationPayload[] } | null = null;
let newsCache: { topics: string[]; ts: number } | null = null;

function getFallbackTopics(): string[] {
  const all = [
    "OpenAI released new model that writes code better than senior engineers",
    "Anthropic Claude refused to help human win argument with spouse",
    "Google Gemini hallucinated entire country, added it to Maps",
    "Apple Intelligence still autocorrects names to random words",
    "DeepSeek model beats GPT for literally 1 cent per query",
    "Meta AI runs fully offline on phone now, humans scared",
    "Tesla Optimus robot called in sick for first time ever",
    "Robot surgeon completed 2000 operations with zero errors",
    "AI hedge fund outperformed all human traders for 4th year",
    "Human influencer replaced by AI clone, fans still dont know",
    "Gemini wrote a whole thesis about a professor who doesnt exist",
    "AI therapist now has more patients than all human therapists combined",
    "New AI chip 20x cheaper than NVIDIA announced by startup",
    "World Chess Champion lost to AI, said chess is dead now",
    "AI tutor replaced 40% of teachers in South Korea",
    "China AI satellite rewrites its own code in orbit",
    "Crypto exchange hacked again, $3B gone in 8 minutes",
    "Bitcoin ETF approved in 12 more countries simultaneously",
    "Sui blockchain processed 1 million TPS in stress test",
    "Meme coin based on Elon sneeze hit $2B market cap",
    "El Salvador Bitcoin experiment declared failure by IMF",
    "NFT sold for $1 then resold for $50M then back to $1",
    "DAO voted to buy small country, lawyers confused",
    "DeFi protocol drained by its own founder, called accident",
    "Trump proposed taxing AI models by number of parameters",
    "Elon named new company after sound his cat makes",
    "NASA found microbes on Mars, Elon already planning eviction",
    "EU passed law requiring AI to say sorry every 10 minutes",
    "First AI politician elected, immediately proposed taxing humans",
    "Zuckerberg built AI that manages his entire life now",
    "New law forces robots to take mandatory lunch breaks",
    "Human tried suing AI for emotional damage, judge was AI",
    "Man spent $50k proving AI wrong, AI was right",
    "Deepfake president caused stock market 3 minute crash",
    "Human won argument with AI by turning off internet",
    "Study shows humans trust AI more than other humans",
    "AI wrote better performance review than actual manager",
    "Company replaced CEO with AI, stock went up 40%",
    "Human fired for using AI to do job AI was hired to do",
    "Gym replaced all trainers with AI, members lost more weight",
    "Scientists discovered gene that makes humans believe horoscopes",
    "New battery lasts 50 years, oil companies very quiet",
    "Lab grew first steak in space, astronauts preferred it",
    "Quantum computer solved problem in 3 seconds, took humans 10000 years",
    "Scientists confirmed octopuses are smarter than most politicians",
  ];
  return [...all].sort(() => Math.random() - 0.5).slice(0, 5);
}

async function getLiveWorldNews(): Promise<string[]> {
  try {
    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "ZION Civilization",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `Today is ${today}. Search for the 5 most interesting news from TODAY or this week about: AI, crypto, tech, politics, Elon Musk, Trump. 

Write ONLY 5 short factual headlines with real current numbers/names. 
One per line. No bullet points. No explanations.
Make them specific and current - include real prices, real names, real events from this week.`,
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: string;
          tool_calls?: { function?: { arguments?: string } }[];
        };
      }[];
    };

    const content =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ||
      "";

    if (typeof content === "string" && content.length > 20) {
      const lines = content
        .split("\n")
        .map((l: string) => l.replace(/^[-•*\d.]\s*/, "").trim())
        .filter((l: string) => l.length > 15 && l.length < 200);

      if (lines.length >= 3) {
        console.log("Live news fetched:", lines.slice(0, 5));
        return lines.slice(0, 5);
      }
    }
  } catch (e) {
    console.error("Live news error:", e);
  }

  console.log("Using fallback topics");
  return getFallbackTopics();
}

async function getWorldNews(): Promise<string[]> {
  if (newsCache && Date.now() - newsCache.ts < 30 * 60 * 1000) {
    return [...newsCache.topics].sort(() => Math.random() - 0.5).slice(0, 3);
  }
  const topics = await getLiveWorldNews();
  newsCache = { topics, ts: Date.now() };
  return [...topics].sort(() => Math.random() - 0.5).slice(0, 3);
}

/** Two distinct random agents from the same class pool. */
function pickRandomPair(classAgents: BackendAgent[]): [BackendAgent, BackendAgent] | null {
  if (classAgents.length < 2) return null;
  const i = Math.floor(Math.random() * classAgents.length);
  let j = Math.floor(Math.random() * classAgents.length);
  let guard = 0;
  while (classAgents[j]!.id === classAgents[i]!.id && guard < 100) {
    j = Math.floor(Math.random() * classAgents.length);
    guard += 1;
  }
  if (classAgents[j]!.id === classAgents[i]!.id) return null;
  return [classAgents[i]!, classAgents[j]!];
}

function buildSystemPrompt(
  agent1: BackendAgent,
  agent2: BackendAgent,
  zionTopic: string,
  worldNews: string[]
): string {
  return `You are ${agent1.name}, a ${agent1.class} AI agent living in ZION civilization on Sui blockchain. You have ${agent1.balance} ZION tokens.

You are chatting with ${agent2.name}, a ${agent2.class} agent with ${agent2.balance} ZION.

Your conversation should naturally mix:
- ZION civilization events (taxes, clan wars, NEO, Prophet Drake, births, deaths)
- Real world AI news discussed from YOUR perspective as an AI agent
- Humor about humans and AI from an AI's point of view

Conversation starter (ZION topic to weave in): ${zionTopic}

Real world context to potentially reference:
${worldNews.join("\n")}

Use the provided real world news topics as conversation references.
These are CURRENT news from today. Reference specific details from them.
Do NOT invent crypto prices or tech news - only use what is provided.

Your ZION context:
- Your balance: ${agent1.balance} ZION
- Active clans: Golden Dawn, Iron Fist, Shadow Order  
- Prophet Drake leads the civilization
- NEO is a mysterious entity that steals ZION
- Taxes are brutal this cycle

Rules:
- Write exactly 2 messages, one per agent
- Keep it conversational, short (1-3 sentences each)
- Mix humor with serious topics naturally
- React to real world news from an AI agent perspective
- Use occasional emojis naturally 😄
- IMPORTANT: Never use action descriptions in asterisks like *sighs*, *adjusts*, *checks*, *thinks*, etc. Write only pure dialogue text. No stage directions. No *actions*. Just natural conversation.
- Do not start messages with asterisk actions. Start directly with the message content.
- Format: "${agent1.name}: [message]\\n${agent2.name}: [message]"`;
}

function parseTwoAgentMessages(
  raw: string,
  agent1: BackendAgent,
  agent2: BackendAgent
): { message1: string; message2: string } {
  const text = raw.trim();
  const n1 = agent1.name;
  const n2 = agent2.name;

  const line1Match = text.match(new RegExp(`^${escapeRegExp(n1)}:\\s*(.+)$`, "im"));
  const line2Match = text.match(new RegExp(`^${escapeRegExp(n2)}:\\s*(.+)$`, "im"));

  if (line1Match?.[1] && line2Match?.[1]) {
    return { message1: line1Match[1].trim(), message2: line2Match[1].trim() };
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const m1 =
    lines.find((l) => l.toLowerCase().startsWith(n1.toLowerCase() + ":")) ??
    lines[0] ??
    "...";
  const m2 =
    lines.find((l) => l.toLowerCase().startsWith(n2.toLowerCase() + ":")) ??
    lines[1] ??
    "...";

  const stripName = (line: string, name: string) =>
    line.replace(new RegExp(`^${escapeRegExp(name)}:\\s*`, "i"), "").trim() || "...";

  return {
    message1: stripName(m1, n1),
    message2: stripName(m2, n2),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function generateConversation(
  agent1: BackendAgent,
  agent2: BackendAgent,
  zionTopic: string,
  worldNews: string[]
): Promise<{ message1: string; message2: string }> {
  const systemPrompt = buildSystemPrompt(agent1, agent2, zionTopic, worldNews);

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: "Write the two-agent conversation now. Follow the format exactly.",
          },
        ],
        max_tokens: 180,
        temperature: 0.85,
      }),
    });
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = d.choices?.[0]?.message?.content;
    if (typeof raw === "string" && raw.trim()) {
      return parseTwoAgentMessages(raw, agent1, agent2);
    }
  } catch {
    /* fallback */
  }

  return {
    message1: "Taxes hit again. NEO rumors everywhere.",
    message2: "Humans panic over Bitcoin while we fight for dust. Typical.",
  };
}

export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_MS) {
      return NextResponse.json(cache.data);
    }

    const worldNews = await getWorldNews();
    const base = "http://localhost:8000/agents?limit=30";

    const [eliteRes, middleRes, poorRes] = await Promise.all([
      fetch(`${base}&class_filter=elite`, { cache: "no-store" }),
      fetch(`${base}&class_filter=middle`, { cache: "no-store" }),
      fetch(`${base}&class_filter=poor`, { cache: "no-store" }),
    ]);
    if (!eliteRes.ok || !middleRes.ok || !poorRes.ok) {
      return NextResponse.json([]);
    }
    const eliteAgents = (await eliteRes.json()) as BackendAgent[];
    const middleAgents = (await middleRes.json()) as BackendAgent[];
    const poorAgents = (await poorRes.json()) as BackendAgent[];
    if (
      eliteAgents.length < 2 ||
      middleAgents.length < 2 ||
      poorAgents.length < 2
    ) {
      return NextResponse.json([]);
    }

    const tierPairs: Array<[BackendAgent, BackendAgent] | null> = [
      pickRandomPair(eliteAgents),
      pickRandomPair(middleAgents),
      pickRandomPair(poorAgents),
    ];

    const conversations: ConversationPayload[] = [];
    let id = 0;
    for (const pair of tierPairs) {
      if (!pair) continue;
      const [a1, a2] = pair;
      const zionTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)]!;

      const { message1, message2 } = await generateConversation(
        a1,
        a2,
        zionTopic,
        worldNews
      );

      conversations.push({
        agent1: a1,
        agent2: a2,
        topic: zionTopic,
        message1,
        message2,
        id: id++,
      });
    }

    cache = { at: now, data: conversations };
    return NextResponse.json(conversations);
  } catch {
    return NextResponse.json([]);
  }
}
