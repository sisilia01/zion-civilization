#!/usr/bin/env python3
"""Constitutional duty reminders for AI governance roles."""
from __future__ import annotations

from typing import Any, Callable

TriggerFn = Callable[[dict[str, Any]], bool]

DUTY_ROLES = frozenset({"president", "senate", "sheriff", "zrs_chief", "frs_chief"})

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
            "tools": ["hire_police", "raid_gang", "anti_corruption_drive"],
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
        f"crime={float(ind.get('crime_pct') or ind.get('crime_rate') or 0):.1f}%"
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
