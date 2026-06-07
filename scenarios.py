"""Dramatic political scenario engine — triggers and faction-specific hints."""

SCENARIOS = [
    {
        "id": "coup_attempt",
        "name": "Presidential Coup",
        "trigger": lambda state: state["politics"]["president"]["approval"] < 20,
        "description": "President attempts to seize absolute power",
        "faction_hints": {
            "president": "Your approval is critically low. Consider declaring martial law or coup to stay in power.",
            "senate": "President is weak! This is your chance to impeach and seize control.",
            "sheriff": "President wants coup. Do you support him for budget, or side with senate for independence?",
            "gangs": "Political chaos means police distracted. Maximum recruitment opportunity NOW.",
            "corporations": "Political instability hurts business. Bribe whoever wins to get stability.",
            "zrs_chief": "Political crisis detected. Inject liquidity to prevent economic collapse during transition.",
        },
    },
    {
        "id": "gang_takeover",
        "name": "Gang Domination",
        "trigger": lambda state: sum(c["members"] for c in state["clans"])
        > state["population"]["alive"] * 0.3,
        "description": "Gangs control 30%+ of population",
        "faction_hints": {
            "president": "Gangs control the streets. Declare war on crime or lose the city.",
            "senate": "Gang crisis! Pass emergency law funding for police or civilization collapses.",
            "sheriff": "GANGS ARE WINNING. You must raid NOW or lose all authority.",
            "gangs": "You are DOMINANT. Demand tribute from corporations and politicians.",
            "corporations": "Gangs extort you daily. Pay sheriff for protection or hire private militia.",
            "zrs_chief": "Gang economy stealing from legitimate economy. Cut off clan treasuries via inflation.",
        },
    },
    {
        "id": "economic_collapse",
        "name": "Economic Collapse",
        "trigger": lambda state: state["population"]["unemployment_rate"] > 80,
        "description": "Unemployment over 80% - civilization dying",
        "faction_hints": {
            "president": "93% unemployment! Give everything to corporations NOW or revolution inevitable.",
            "senate": "Economic emergency! Pass MASSIVE stimulus or you lose your seats.",
            "sheriff": "Starving people become criminals. Unemployment feeds gangs. Demand ZRS fund police.",
            "gangs": "Everyone is unemployed and desperate. RECRUIT THEM ALL. This is your golden moment.",
            "corporations": "You have the money and the power. HIRE or face nationalization by desperate government.",
            "zrs_chief": "EMERGENCY. Deploy all QE tools. Corps need money to hire. Do it NOW.",
        },
    },
    {
        "id": "revolution",
        "name": "People's Revolution",
        "trigger": lambda state: state["politics"]["revolution_meter"] > 70,
        "description": "Revolution meter critical - citizens rising",
        "faction_hints": {
            "president": "REVOLUTION IMMINENT. Give money to poor immediately or you will be executed.",
            "senate": "Revolution coming! Side with the people - impeach president, promise reforms.",
            "sheriff": "Revolution means your officers will defect. Pay them NOW or lose your force.",
            "gangs": "Revolution is YOUR moment. Lead the uprising. Become the new power.",
            "corporations": "Revolution will destroy your assets. Fund president's suppression OR side with revolutionaries.",
            "zrs_chief": "Revolution caused by poverty. Emergency QE to poor agents. NOW.",
        },
    },
    {
        "id": "sheriff_coup",
        "name": "Military Coup",
        "trigger": lambda state: (
            state["politics"]["sheriff"]["officers"] > 200
            and state["politics"]["president"]["approval"] < 25
        ),
        "description": "Sheriff has enough force to overthrow weak president",
        "faction_hints": {
            "president": "Sheriff has 200+ officers and you are weak. Buy his loyalty or fire him before he acts.",
            "senate": "Sheriff coup possible! Ally with him against president, or protect president for stability.",
            "sheriff": "You have the POWER. President is weak at {approval}%. Will you seize control?",
            "gangs": "Military coup means chaos. Expand territory while they fight each other.",
            "corporations": "Military coups are bad for business. Fund whoever stabilizes fastest.",
            "zrs_chief": "Political instability detected. Freeze all government accounts until order restored.",
        },
    },
    {
        "id": "senate_rebellion",
        "name": "Senate vs President",
        "trigger": lambda state: (
            state["politics"]["president"]["approval"] < 30
            and len(state["politics"].get("recent_laws", [])) > 2
        ),
        "description": "Senate actively blocking president",
        "faction_hints": {
            "president": "Senate blocks everything! Dissolve them or find 5 senator allies to bribe.",
            "senate": "President is weak! Block ALL his actions. Force new elections. Seize budget control.",
            "sheriff": "Senate vs President deadlock. Collect from both sides for neutrality.",
            "gangs": "Government paralyzed. Police unfunded. EXPAND NOW.",
            "corporations": "Legislative deadlock means no new laws hurting us. Support the stalemate.",
            "zrs_chief": "Government dysfunction causes uncertainty. Raise rates to signal stability.",
        },
    },
    {
        "id": "corporate_takeover",
        "name": "Corporate State",
        "trigger": lambda state: sum(c["treasury"] for c in state["corporations"]) > 10000,
        "description": "Corporations richer than government",
        "faction_hints": {
            "president": "Corporations are richer than you! Tax them heavily or they will own you.",
            "senate": "Corporate power threatens democracy. Pass wealth tax NOW.",
            "sheriff": "Corporations fund your police. Be careful not to bite the hand that feeds.",
            "gangs": "Corporations weak on streets. Extort them all. They pay or burn.",
            "corporations": "You have ALL the money. BUY the government. Fund loyalists. Create monopolies.",
            "zrs_chief": "Corporate wealth concentration hurts Gini. Redistribute via interest rates.",
        },
    },
    {
        "id": "police_state",
        "name": "Police State",
        "trigger": lambda state: state["politics"]["sheriff"]["officers"] > 300,
        "description": "Massive police force - risk of authoritarian control",
        "faction_hints": {
            "president": "300+ police! Use them. Crush gangs. Declare martial law. Rule absolutely.",
            "senate": "Police state emerging! Cut sheriff budget before democracy ends.",
            "sheriff": "You have OVERWHELMING force. Nothing can stop you. Consider your ambitions.",
            "gangs": "Too many cops. Lay low. Bribe them. Wait for budget cuts.",
            "corporations": "Strong police = safe business. Fund them more. Get private protection deals.",
            "zrs_chief": "Police spending too high. Redirect budget to economic programs.",
        },
    },
    {
        "id": "golden_age",
        "name": "Golden Age",
        "trigger": lambda state: (
            state["population"]["unemployment_rate"] < 30
            and state["politics"]["revolution_meter"] < 20
            and state["politics"]["president"]["approval"] > 60
        ),
        "description": "Civilization thriving - everyone wants to stay in power",
        "faction_hints": {
            "president": "Golden age! Consolidate power while popular. Build monuments. Extend your term.",
            "senate": "Everything works! Take credit for it. Pass laws expanding senate power.",
            "sheriff": "Low crime, high approval. Ask for more budget to maintain paradise.",
            "gangs": "Good times are BAD for us. Create chaos to recruit desperate people.",
            "corporations": "Prosperity! Expand. Hire more. Lobby for even lower taxes.",
            "zrs_chief": "Economy stable. Slowly raise rates to prevent overheating.",
        },
    },
]


def get_active_scenarios(state: dict) -> list:
    """Get all currently triggered scenarios."""
    active = []
    for scenario in SCENARIOS:
        try:
            if scenario["trigger"](state):
                active.append(scenario)
        except Exception:
            pass
    return active


def get_scenario_hint(state: dict, faction: str) -> str:
    """Get scenario hints for a specific faction."""
    active = get_active_scenarios(state)
    if not active:
        return ""

    hints = []
    for scenario in active[:2]:
        hint = scenario["faction_hints"].get(faction, "")
        if hint:
            hint = hint.format(
                approval=state.get("politics", {}).get("president", {}).get("approval", 0),
                officers=state.get("politics", {}).get("sheriff", {}).get("officers", 0),
                unemployment=state.get("population", {}).get("unemployment_rate", 0),
            )
            hints.append(f"[SCENARIO: {scenario['name']}] {hint}")

    return "\n".join(hints)
