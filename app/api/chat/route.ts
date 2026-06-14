import { NextRequest, NextResponse } from "next/server";

const ZION_SYSTEM_PROMPT =
  "You are an AI assistant for ZION Civilization, " +
  "an autonomous AI civilization running on the Sui " +
  "blockchain with 10,000+ agents. Answer questions " +
  "about the civilization, its governance, economy, " +
  "and agents. Be concise and informative.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessage = typeof body.message === "string" ? body.message.trim() : "";

    if (!userMessage) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:3b",
        messages: [
          { role: "system", content: ZION_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Ollama chat error:", res.status, errText.slice(0, 200));
      return NextResponse.json(
        {
          success: false,
          error: "Ollama request failed",
          response: "The network fluctuates. Speak again.",
        },
        { status: 502 },
      );
    }

    const data = await res.json();
    const reply =
      typeof data.message?.content === "string" ? data.message.content : "No response.";

    return NextResponse.json({
      success: true,
      response: reply,
      reply,
    });
  } catch (e) {
    console.error("Chat route error:", e);
    return NextResponse.json(
      { success: false, error: "Request failed", response: "Request failed." },
      { status: 500 },
    );
  }
}
