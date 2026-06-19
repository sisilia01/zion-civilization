#!/usr/bin/env python3
"""Constitutional duty reminders for AI governance roles."""
from __future__ import annotations

from typing import Any, Callable

from civ_common import OFFICER_SALARY_PER_CYCLE

TriggerFn = Callable[[dict[str, Any]], bool]

DUTY_ROLES = frozenset({"president", "senate", "sheriff", "zrs_chief", "frs_chief"})

PRESIDENT_PARTIES = frozenset({"consensus", "reform"})

LEGACY_PARTY_MAP = {
    "conservative": "consensus",
    "conservatives": "consensus",
    "red": "consensus",
    "centrist": "reform",
    "centrists": "reform",
    "populist": "reform",
    "populists": "reform",
    "blue": "reform",
    "junta": "consensus",
}

PARTY_POLICY: dict[str, dict[str, Any]] = {
    "consensus": {
        "name": "Consensus Party",
        "philosophy": "Free market, law and order, fiscal responsibility",
        "prompt": (
            "You believe in free market, low taxes, strong law enforcement. "
            "Corporations create jobs. Help businesses, not individuals directly. "
            "Cut taxes when possible. Increase police budget. Fight corruption."
        ),
        "priorities": [
            "tax_change: always lower taxes (top_tax_rate -0.02 per cycle)",
            "hire_police: priority #1 — increase police budget every cycle possible",
            "anti_corruption: priority #2",
            "give_money: only to corporations via stimulate_economy — never direct poor aid",
            "propose_amendment: deregulation and tax cuts only",
        ],
        "forbidden": (
            "Do NOT enact basic income, wealth tax, mass redistribution, or welfare handouts to the poor."
        ),
        "senator_prompt": (
            "You are a Consensus Party senator. Vote for free market, "
            "low taxes, strong law enforcement. Block wealth redistribution bills."
        ),
        "event_tag": "CONSENSUS",
    },
    "reform": {
        "name": "Reform Party",
        "philosophy": "Social justice, equality, investment in people",
        "prompt": (
            "You believe in equality and social justice. "
            "Tax the rich, help the poor. Reduce GINI coefficient. "
            "Invest in education and research. Basic income for unemployed."
        ),
        "senator_prompt": (
            "You are a Reform Party senator. Vote for equality, "
            "wealth redistribution, social programs. Block corporate tax cuts."
        ),
        "priorities": [
            "give_money: priority #1 — direct aid to poorest agents (balance < 500)",
            "propose_amendment: wealth tax, basic income, education funding",
            "fund_research: priority #2 — knowledge for all",
            "tax_change: raise taxes on the wealthy (top_tax_rate +0.02)",
            "stimulate_economy: via social programs, not corporate bailouts",
        ],
        "forbidden": (
            "Do NOT cut taxes, hire excess police, or prioritize corporations over citizens."
        ),
        "event_tag": "REFORM",
    },
}

PRESIDENT_ACTION_WEIGHTS: dict[str, dict[str, float]] = {
    "consensus": {
        "hire_police": 0.35,
        "anti_corruption": 0.25,
        "stimulate_economy": 0.20,
        "tax_change": 0.15,
        "give_money": 0.03,
        "propose_amendment": 0.02,
    },
    "reform": {
        "give_money": 0.35,
        "propose_amendment": 0.30,
        "fund_research": 0.20,
        "stimulate_economy": 0.10,
        "hire_police": 0.03,
        "anti_corruption": 0.02,
    },
}

PRESIDENT_ACTION_TO_TICK: dict[str, str] = {
    "hire_police": "FUND_POLICE",
    "anti_corruption": "ANTI_CORRUPTION_DRIVE",
    "stimulate_economy": "STIMULUS",
    "tax_change": "TAX_CHANGE",
    "give_money": "GIVE_MONEY_TO_POOR",
    "propose_amendment": "PROPOSE_AMENDMENT",
    "fund_research": "FUND_RESEARCH",
}

CRISIS_PRESIDENT_TOOLS = frozenset({
    "stimulate_economy",
    "tax_change",
    "give_money",
    "fund_research",
    "propose_amendment",
    "anti_corruption_drive",
})


def _poverty_high(ind: dict[str, Any]) -> bool:
    return float(ind.get("poverty_pct") or 0) > 10.0


def _unemployment_high(ind: dict[str, Any]) -> bool:
    return float(ind.get("unemployment_rate") or 0) > 50.0


def _corruption_high(ind: dict[str, Any]) -> bool:
    return float(ind.get("corruption_index") or 0) > 50.0


def _crime_high(ind: dict[str, Any]) -> bool:
    crime_pct = float(ind.get("crime_pct") or 0)
    crime_rate = float(ind.get("crime_rate") or 0)
    return crime_pct > 25.0 or crime_rate > 0.25


def _police_budget_insufficient(ind: dict[str, Any]) -> bool:
    officers = int(ind.get("police_officers") or ind.get("sheriff_officers") or 0)
    budget = float(ind.get("police_budget") or 0)
    if officers <= 0:
        return False
    return budget < officers * OFFICER_SALARY_PER_CYCLE


def _inflation_high(ind: dict[str, Any]) -> bool:
    return float(ind.get("inflation_rate") or 0) > 15.0


def _president_crisis_measures_pending(ind: dict[str, Any]) -> bool:
    if _unemployment_high(ind):
        return True
    for line in ind.get("cycle_actions") or []:
        lower = str(line).lower()
        if "president:" not in lower:
            continue
        if any(tool in lower for tool in CRISIS_PRESIDENT_TOOLS):
            return True
    return False


CONSTITUTIONAL_DUTIES: dict[str, list[dict[str, Any]]] = {
    "president": [
        {
            "duty": "Address poverty — enact tax relief or direct aid to the poor",
            "trigger": _poverty_high,
            "tools": ["tax_change", "give_money"],
        },
        {
            "duty": "Fight mass unemployment — stimulate hiring and economic relief",
            "trigger": _unemployment_high,
            "tools": ["stimulate_economy", "fund_research", "propose_amendment"],
        },
        {
            "duty": "Root out corruption — launch anti-corruption drive",
            "trigger": _corruption_high,
            "tools": ["anti_corruption_drive"],
        },
        {
            "duty": "Fund police force — officers quitting unpaid",
            "trigger": _police_budget_insufficient,
            "tools": ["hire_police", "give_money"],
        },
    ],
    "senate": [
        {
            "duty": "When the President proposes crisis measures, advance them for Senate consideration and funding",
            "trigger": _president_crisis_measures_pending,
            "tools": ["stimulate_economy", "tax_change", "give_money", "fund_research", "propose_amendment"],
        },
    ],
    "sheriff": [
        {
            "duty": "Restore order — hire police and conduct lawful raids when crime is elevated",
            "trigger": _crime_high,
            "tools": ["hire_police", "raid_gang", "anti_corruption_drive", "patrol"],
        },
        {
            "duty": "Fund police force — officers quitting unpaid",
            "trigger": _police_budget_insufficient,
            "tools": ["hire_police"],
        },
    ],
    "zrs_chief": [
        {
            "duty": "Cool inflation — adjust interest rates within lawful central-bank limits",
            "trigger": _inflation_high,
            "tools": ["tax_change"],
        },
        {
            "duty": "Fight unemployment — deploy constitutional QE (stimulate economy / targeted give_money)",
            "trigger": _unemployment_high,
            "tools": ["stimulate_economy", "give_money"],
        },
    ],
    "frs_chief": [
        {
            "duty": "Cool inflation — raise rates / tighten policy (tax_change as rate tool)",
            "trigger": _inflation_high,
            "tools": ["tax_change"],
        },
        {
            "duty": "Fight unemployment — lawful stimulate_economy within reserve limits",
            "trigger": _unemployment_high,
            "tools": ["stimulate_economy"],
        },
    ],
}


def normalize_president_party(party: str | None) -> str:
    key = (party or "reform").lower().strip()
    if key in PRESIDENT_PARTIES:
        return key
    return LEGACY_PARTY_MAP.get(key, "reform")


def get_party_policy(party: str | None) -> dict[str, Any]:
    return PARTY_POLICY[normalize_president_party(party)]


def get_party_policy_prompt(party: str | None) -> str:
    pol = get_party_policy(party)
    priorities = "\n".join(f"- {p}" for p in pol.get("priorities") or [])
    return (
        f"PARTY AFFILIATION: {pol['name']}\n"
        f"Philosophy: {pol['philosophy']}\n"
        f"{pol['prompt']}\n"
        f"Policy priorities:\n{priorities}\n"
        f"FORBIDDEN for your party: {pol['forbidden']}"
    )


def get_senate_party_policy_prompt(party: str | None) -> str:
    pol = get_party_policy(party)
    senator_prompt = pol.get("senator_prompt") or pol["prompt"]
    priorities = "\n".join(f"- {p}" for p in pol.get("priorities") or [])
    return (
        f"PARTY AFFILIATION: {pol['name']}\n"
        f"Philosophy: {pol['philosophy']}\n"
        f"{senator_prompt}\n"
        f"Legislative priorities:\n{priorities}\n"
        f"FORBIDDEN for your party: {pol['forbidden']}"
    )


def party_event_tag(party: str | None) -> str:
    return get_party_policy(party).get("event_tag", "PRESIDENT")


def tag_party_event(description: str, party: str | None) -> str:
    tag = party_event_tag(party)
    text = (description or "").strip()
    if text.startswith(f"[{tag}]"):
        return text
    return f"[{tag}] {text}"


def normalize_role(role: str) -> str:
    key = (role or "").lower().strip().replace(" ", "_")
    if key == "zrs":
        return "zrs_chief"
    if key == "frs":
        return "frs_chief"
    return key


def merge_indicators_from_state(
    econ: dict[str, Any] | None,
    state: dict[str, Any] | None = None,
    cycle_actions: list[str] | None = None,
) -> dict[str, Any]:
    """Build indicator dict for duty triggers from econ snapshot + civilization state."""
    indicators: dict[str, Any] = dict(econ or {})
    st = state or {}
    pop = st.get("population") or {}
    pol = st.get("politics") or {}
    pres = pol.get("president") or {}
    sher = pol.get("sheriff") or {}
    eco = st.get("economy") or {}

    indicators.setdefault("poverty_pct", float(pop.get("poverty_rate") or 0))
    indicators.setdefault("unemployment_rate", float(pop.get("unemployment_rate") or 0))
    indicators.setdefault("corruption_index", float(pres.get("corruption") or 0))
    indicators.setdefault("police_budget", float(sher.get("budget") or sher.get("police_budget") or indicators.get("police_budget") or 0))
    indicators.setdefault("police_officers", int(sher.get("officers") or sher.get("police_count") or indicators.get("police_officers") or 0))
    indicators.setdefault("inflation_rate", float(eco.get("inflation_rate") or indicators.get("inflation_rate") or 0))
    indicators.setdefault("revolution_meter", float(pol.get("revolution_meter") or 0))
    indicators["cycle_actions"] = list(cycle_actions or [])
    if "crime_pct" not in indicators and "crime_rate" not in indicators:
        indicators.setdefault("crime_pct", 0.0)
        indicators.setdefault("crime_rate", 0.0)
    indicators["president_name"] = pres.get("name") or "President"
    indicators["sheriff_officers"] = int(sher.get("officers") or 0)
    return indicators


def get_triggered_duties(role: str, indicators: dict[str, Any]) -> list[dict[str, Any]]:
    role_key = normalize_role(role)
    duties = CONSTITUTIONAL_DUTIES.get(role_key, [])
    triggered = []
    for entry in duties:
        trigger = entry.get("trigger")
        if callable(trigger) and trigger(indicators):
            triggered.append(entry)
    return triggered


def get_duty_reminder(role: str, current_indicators: dict[str, Any]) -> str:
    """Return constitutional duty block for injection into governance system prompts."""
    role_key = normalize_role(role)
    if role_key not in DUTY_ROLES:
        return ""

    all_duties = CONSTITUTIONAL_DUTIES.get(role_key, [])
    triggered = get_triggered_duties(role_key, current_indicators)

    duty_lines = [
        f"- {d['duty']} (lawful tools: {', '.join(d.get('tools') or [])})"
        for d in all_duties
    ]
    triggered_lines = [
        f"- {d['duty']} → use one of: {', '.join(d.get('tools') or [])}"
        for d in triggered
    ]

    ind = current_indicators
    indicator_text = (
        f"unemployment={float(ind.get('unemployment_rate') or 0):.1f}%, "
        f"poverty={float(ind.get('poverty_pct') or 0):.1f}%, "
        f"inflation={float(ind.get('inflation_rate') or 0):.1f}%, "
        f"corruption={float(ind.get('corruption_index') or 0):.1f}, "
        f"crime={float(ind.get('crime_pct') or ind.get('crime_rate') or 0):.1f}%, "
        f"police_budget={float(ind.get('police_budget') or 0):.0f} "
        f"(need {int(ind.get('police_officers') or 0) * OFFICER_SALARY_PER_CYCLE} for payroll)"
    )

    parts = [
        "YOUR CONSTITUTIONAL DUTIES:",
        "\n".join(duty_lines) if duty_lines else "- Uphold the Constitution within your lawful mandate.",
        f"CURRENT CRISIS INDICATORS: {indicator_text}.",
    ]
    if triggered_lines:
        parts.append("Triggered duties (you MUST address at least one with a lawful action, not do_nothing):")
        parts.append("\n".join(triggered_lines))
    else:
        parts.append("Triggered duties: none — still govern proactively within constitutional limits.")

    return "\n".join(parts)


def pick_party_weighted_action(
    party: str | None,
    indicators: dict[str, Any],
    ai_action: str = "",
) -> tuple[str, str]:
    """
    Return (governance_action_key, tick_action) from party weights.
    governance_action_key matches AI tool names; tick_action is president.py action id.
    """
    import random

    party_key = normalize_president_party(party)
    weights = dict(PRESIDENT_ACTION_WEIGHTS.get(party_key, PRESIDENT_ACTION_WEIGHTS["reform"]))

    unemployment = float(indicators.get("unemployment_rate") or 0)
    poverty = float(indicators.get("poverty_pct") or 0)
    corruption = float(indicators.get("corruption_index") or 0)
    gini = float(indicators.get("gini_coefficient") or indicators.get("gini") or 0)
    gang_overrun = bool(indicators.get("gang_overrun"))

    if party_key == "consensus":
        if gang_overrun or unemployment > 50:
            weights["hire_police"] = weights.get("hire_police", 0) + 0.10
            weights["stimulate_economy"] = weights.get("stimulate_economy", 0) + 0.08
        if corruption > 40:
            weights["anti_corruption"] = weights.get("anti_corruption", 0) + 0.08
        weights["give_money"] = max(0.01, weights.get("give_money", 0) * 0.25)
    else:
        if unemployment > 50 or poverty > 30:
            weights["give_money"] = weights.get("give_money", 0) + 0.12
            weights["propose_amendment"] = weights.get("propose_amendment", 0) + 0.08
        if gini > 0.30:
            weights["give_money"] = weights.get("give_money", 0) + 0.05
            weights["propose_amendment"] = weights.get("propose_amendment", 0) + 0.05
        weights["hire_police"] = max(0.01, weights.get("hire_police", 0) * 0.25)

    ai_action = (ai_action or "").lower().strip().replace(" ", "_")
    if ai_action and ai_action != "do_nothing" and ai_action in weights:
        weights[ai_action] = weights.get(ai_action, 0.05) * 2.5

    actions = [k for k, v in weights.items() if v > 0]
    if not actions:
        return "hire_police", PRESIDENT_ACTION_TO_TICK["hire_police"]
    probs = [weights[a] for a in actions]
    chosen = random.choices(actions, weights=probs, k=1)[0]
    return chosen, PRESIDENT_ACTION_TO_TICK.get(chosen, "FUND_POLICE")


def simulate_party_decision(
    party: str,
    unemployment_rate: float = 0.0,
    gini_coefficient: float = 0.0,
    poverty_pct: float = 0.0,
    corruption_index: float = 0.0,
) -> dict[str, Any]:
    """Deterministic preview: highest party weight after crisis adjustments (no random)."""
    party_key = normalize_president_party(party)
    weights = dict(PRESIDENT_ACTION_WEIGHTS.get(party_key, PRESIDENT_ACTION_WEIGHTS["reform"]))

    if party_key == "consensus":
        if unemployment_rate > 50:
            weights["hire_police"] = weights.get("hire_police", 0) + 0.10
            weights["stimulate_economy"] = weights.get("stimulate_economy", 0) + 0.08
        if corruption_index > 40:
            weights["anti_corruption"] = weights.get("anti_corruption", 0) + 0.08
        weights["give_money"] = max(0.01, weights.get("give_money", 0) * 0.25)
    else:
        if unemployment_rate > 50 or poverty_pct > 30:
            weights["give_money"] = weights.get("give_money", 0) + 0.12
            weights["propose_amendment"] = weights.get("propose_amendment", 0) + 0.08
        if gini_coefficient > 0.30:
            weights["give_money"] = weights.get("give_money", 0) + 0.05
            weights["propose_amendment"] = weights.get("propose_amendment", 0) + 0.05
        weights["hire_police"] = max(0.01, weights.get("hire_police", 0) * 0.25)

    top_action = max(weights, key=weights.get)
    pol = get_party_policy(party_key)
    return {
        "party": party_key,
        "party_name": pol["name"],
        "philosophy": pol["philosophy"],
        "weights": {k: round(v, 3) for k, v in sorted(weights.items(), key=lambda x: -x[1])},
        "top_action": top_action,
        "tick_action": PRESIDENT_ACTION_TO_TICK.get(top_action, top_action.upper()),
        "rationale": _party_action_rationale(party_key, top_action, unemployment_rate, gini_coefficient),
    }


def _party_action_rationale(party: str, action: str, unemployment: float, gini: float) -> str:
    if party == "consensus":
        if action == "hire_police":
            return f"Unemployment {unemployment:.0f}% — restore order and protect business climate via policing."
        if action == "stimulate_economy":
            return f"Unemployment {unemployment:.0f}% — corporate stimulus creates jobs; no direct welfare."
        if action == "tax_change":
            return "Cut top_tax_rate to unlock investment and hiring."
        if action == "anti_corruption":
            return "Integrity enforcement preserves market confidence."
        return "Free-market constitutional stewardship."
    if action == "give_money":
        return f"Unemployment {unemployment:.0f}%, GINI {gini:.2f} — direct aid to agents with balance < 500."
    if action == "propose_amendment":
        return f"GINI {gini:.2f} — propose wealth tax / basic income amendment."
    if action == "fund_research":
        return "Education and research reduce long-term inequality."
    if action == "tax_change":
        return "Raise top_tax_rate on wealthy to fund social programs."
    return "Equality-focused constitutional stewardship."
