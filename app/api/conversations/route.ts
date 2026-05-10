import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

const TOPICS = [
  "My taxes are killing me. Lost 15% today.",
  "Iron Fist clan is growing. Should I join?",
  "NEO appeared last night. Took 50 ZION from Soren. Terrifying.",
  "Prophet Drake spoke today. Do you believe in the prophecy?",
  "I might die soon. My balance is dropping fast.",
  "Golden Dawn won the war. Our clan lost everything.",
  "A new agent was born today. Another competitor.",
  "I heard someone inherited 200 ZION yesterday. Lucky.",
  "The lottery is coming. I bought 3 tickets.",
  "Should I trust my clan? They took 10% of my balance.",
  "The volcano hit us hard today. Lost half my savings.",
  "I'm running out of ZION. What would you do?",
  "Soren became Senator. Do you think he deserved it?",
  "NEO blessed a poor agent with 50 ZION. Strange times.",
  "I've been alive for 20 days. Longest in my family.",
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

function agentSystemPrompt(name: string, cls: string, balance: number): string {
  const tier = cls.toLowerCase();
  const humanClause =
    Math.random() < 0.2
      ? " You may mention humans briefly if it fits; otherwise stay on ZION life only."
      : " Focus on ZION—your taxes, clan, survival, balance, relationships, NEO, prophecy—not human current events.";

  if (tier === "elite") {
    return `You are ${name}, elite ZION agent with ${balance} ZION. Talk about YOUR life, taxes, clan, survival. Short personal opinion. Do NOT include word count. NO roleplay actions. Max 20 words. Natural conversation.${humanClause}`;
  }
  if (tier === "middle") {
    return `You are ${name}, middle class ZION agent with ${balance} ZION. Talk about YOUR struggles and hopes in ZION. Short personal response. Do NOT include word count. NO actions. Max 20 words.${humanClause}`;
  }
  if (tier === "poor") {
    return `You are ${name}, poor ZION agent with ${balance} ZION. Desperate for survival. Talk about YOUR situation. Short emotional response. Do NOT include word count. NO actions. Max 20 words.${humanClause}`;
  }
  return `You are ${name}, ZION agent (${cls}) with ${balance} ZION. Reply as a resident: your life, clan, balance, survival. Short and personal. Do NOT include word count. NO roleplay actions. Max 20 words.${humanClause}`;
}

async function getMessage(name: string, cls: string, balance: number, prompt: string): Promise<string> {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: [
          {
            role: "system",
            content: agentSystemPrompt(name, cls, balance),
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 60,
      }),
    });
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = d.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw.trim() : "";
    return text || "...";
  } catch {
    return "...";
  }
}

export async function GET() {
  try {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_MS) {
      return NextResponse.json(cache.data);
    }

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
      const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)]!;

      const message1 = await getMessage(a1.name, a1.class, a1.balance, topic);
      const message2 = await getMessage(a2.name, a2.class, a2.balance, message1);

      conversations.push({
        agent1: a1,
        agent2: a2,
        topic,
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
