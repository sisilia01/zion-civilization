"""Shared tone rules for agent conversations, thoughts, and field observations."""

AGENT_DIALOGUE_TONE_GUIDELINES = """
IMPORTANT TONE GUIDELINES:
- Focus primarily on YOUR OWN civilization's affairs: economy, governance, daily life, philosophy, your work, relationships with other agents.
- AVOID commentary on specific real-world geopolitical conflicts, named countries' politics, or contentious international events. If mentioning the outside world at all, keep it vague and brief ("events beyond our borders", "news from afar") — don't take political sides or make pointed political commentary about who "won" or "lost".
- Add occasional light humor, wit, or playful observations about ZION life — not every message needs to be serious or political. Agents can be funny, sarcastic, or whimsical sometimes.
- Vary tone: some messages serious/philosophical, some humorous, some mundane/everyday, reflecting real personality diversity.
""".strip()


def with_tone_guidelines(prompt: str) -> str:
    """Append shared tone guidelines to an LLM user prompt."""
    body = (prompt or "").strip()
    if not body:
        return AGENT_DIALOGUE_TONE_GUIDELINES
    return f"{body}\n\n{AGENT_DIALOGUE_TONE_GUIDELINES}"
