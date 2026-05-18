#!/usr/bin/env python3
"""
ZION Police System v2 — 5 divisions with dynamic sizing
SWAT / Anti-Tax / Presidential Guard / Anti-Corruption / Riot Control
"""
import psycopg2
import psycopg2.extras
import random
import traceback
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026",
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

COST_PER_OFFICER = 8


def log_event(agent_id, event_type, description, amount=0):
    cur.execute(
        """
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
        """,
        (agent_id, event_type, description, amount),
    )


def get_state():
    cur.execute("SELECT * FROM state_treasury LIMIT 1")
    return cur.fetchone()


def get_divisions():
    cur.execute("SELECT * FROM police_divisions ORDER BY id")
    rows = cur.fetchall()
    return {r["division"]: dict(r) for r in rows}


def get_sheriff():
    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def get_president():
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def calc_poor_pct():
    cur.execute(
        """
        SELECT
            COUNT(*) FILTER (WHERE class IN ('poor', 'critical')) AS poor_count,
            COUNT(*) AS total
        FROM agents WHERE is_alive = true
        """
    )
    row = cur.fetchone()
    total = max(row["total"], 1)
    return float(row["poor_count"]) / total * 100


def calc_rebel_pct():
    cur.execute(
        """
        SELECT COUNT(*) AS rebels FROM agents
        WHERE is_alive = true AND balance < 3
          AND class IN ('poor', 'critical')
        """
    )
    rebels = cur.fetchone()["rebels"]
    cur.execute("SELECT COUNT(*) AS total FROM agents WHERE is_alive = true")
    total = max(cur.fetchone()["total"], 1)
    return rebels / total


def update_division_sizes(state, divisions, sheriff, president):
    """Calculate ideal officers per division, scale to budget, apply gradual changes."""
    police_budget = float(sheriff["police_budget"]) if sheriff else 0.0

    cur.execute("SELECT COUNT(*) AS cnt FROM clans")
    clan_count = cur.fetchone()["cnt"]
    poor_pct = calc_poor_pct()

    approval = president["approval_rating"] if president else 50
    is_dictator = president.get("is_dictator", False) if president else False
    sheriff_type = sheriff["sheriff_type"] if sheriff else "honest"

    ideals = {
        "swat": clan_count * 15,
        "anti_tax": poor_pct * 0.5,
        "presidential_guard": 30 if is_dictator else (20 if sheriff_type == "junta" else 10),
        "anti_corruption": 25 if sheriff_type == "honest" else (8 if sheriff_type == "corrupt" else 15),
        "riot_control": (100 - approval) * 0.5,
    }

    max_officers = int(police_budget / COST_PER_OFFICER) if police_budget > 0 else 0
    total_ideal = sum(ideals.values()) or 1
    scale = min(1.0, max_officers / total_ideal) if max_officers > 0 else 0

    total_budget = police_budget
    div_names = list(ideals.keys())

    for name in div_names:
        if name not in divisions:
            continue
        div = divisions[name]
        target = max(0, int(ideals[name] * scale))
        current = int(div["officers"])
        delta = max(-5, min(5, target - current))
        new_officers = max(0, current + delta)

        share = ideals[name] / total_ideal if total_ideal else 0.2
        new_budget = round(total_budget * share, 2)

        cur.execute(
            """
            UPDATE police_divisions
            SET officers = %s, budget = %s, updated_at = NOW()
            WHERE division = %s
            """,
            (new_officers, new_budget, name),
        )
        divisions[name]["officers"] = new_officers
        divisions[name]["budget"] = new_budget

    print(f"  Division sizing: budget={police_budget:.0f}, max_officers={max_officers}, poor={poor_pct:.1f}%")


def swat_operations(divisions, state):
    """Raid top 2 clans with treasury > 100, seize funds to police_fund."""
    swat = divisions.get("swat")
    if not swat or swat["officers"] < 1:
        return

    effectiveness = float(swat["effectiveness"]) / 100.0
    cur.execute(
        """
        SELECT id, name, treasury FROM clans
        WHERE treasury > 100
        ORDER BY treasury DESC LIMIT 2
        """
    )
    clans = cur.fetchall()
    total_seized = 0.0

    for clan in clans:
        treasury = float(clan["treasury"])
        pct = random.uniform(0.05, 0.15) * effectiveness
        seized = round(treasury * pct, 2)
        if seized <= 0:
            continue

        cur.execute("UPDATE clans SET treasury = treasury - %s WHERE id = %s", (seized, clan["id"]))
        total_seized += seized
        log_event(
            None,
            "police",
            f"🎯 SWAT raided {clan['name']}! Seized {seized:.1f} ZION ({pct*100:.0f}% of treasury)",
            seized,
        )
        print(f"  🎯 SWAT raided {clan['name']}: -{seized:.1f} ZION")

    if total_seized > 0:
        to_fund = round(total_seized * 1.0, 2)
        cur.execute(
            "UPDATE state_treasury SET police_fund = police_fund + %s",
            (to_fund,),
        )
        print(f"  SWAT routed {to_fund:.1f} ZION to police_fund (100% of {total_seized:.1f})")


def anti_tax_operations(divisions):
    """Fine agents with dust_days > 1, reset dust_days, route to police_fund."""
    anti_tax = divisions.get("anti_tax")
    if not anti_tax or anti_tax["officers"] < 1:
        return

    cur.execute(
        """
        SELECT id, name, balance, dust_days FROM agents
        WHERE is_alive = true AND dust_days > 1
        ORDER BY dust_days DESC
        LIMIT %s
        """,
        (max(1, anti_tax["officers"] // 3),),
    )
    evaders = cur.fetchall()
    total_fines = 0.0

    for agent in evaders:
        balance = float(agent["balance"])
        fine = min(balance * 0.25, 40.0)
        if fine <= 0:
            cur.execute("UPDATE agents SET dust_days = 0 WHERE id = %s", (agent["id"],))
            continue

        cur.execute(
            "UPDATE agents SET balance = balance - %s, dust_days = 0 WHERE id = %s",
            (fine, agent["id"]),
        )
        total_fines += fine
        log_event(
            agent["id"],
            "police",
            f"💰 Anti-Tax fined {agent['name']} {fine:.1f} ZION (dust_days={agent['dust_days']})",
            fine,
        )
        print(f"  💰 Anti-Tax fined {agent['name']}: {fine:.1f} ZION")

    if total_fines > 0:
        cur.execute(
            "UPDATE state_treasury SET police_fund = police_fund + %s",
            (total_fines,),
        )
        print(f"  Anti-Tax collected {total_fines:.1f} ZION → police_fund")


def presidential_guard(divisions, president, sheriff):
    """Guard president; counter junta sheriff; log dictator protection."""
    guard = divisions.get("presidential_guard")
    if not guard:
        return

    officers = int(guard["officers"])

    if sheriff and sheriff["sheriff_type"] == "junta" and officers > 15:
        cur.execute(
            """
            UPDATE sheriff_state
            SET approval_rating = GREATEST(0, approval_rating - 10)
            WHERE is_active = true
            """
        )
        log_event(
            sheriff["agent_id"],
            "police",
            f"🛡️ Presidential Guard ({officers} officers) curbed junta sheriff {sheriff['agent_name']}! Approval -10",
            0,
        )
        print(f"  🛡️ Guard curbed junta sheriff {sheriff['agent_name']} (approval -10)")

    if president and president.get("is_dictator"):
        log_event(
            president["agent_id"],
            "police",
            f"🛡️ Presidential Guard ({officers} officers) protecting dictator {president['agent_name']}",
            0,
        )
        print(f"  🛡️ Guard protecting dictator {president['agent_name']}")


def anti_corruption_ops(divisions, sheriff):
    """Expose corrupt sheriff when anti-corruption division is strong enough."""
    ac = divisions.get("anti_corruption")
    if not ac or not sheriff:
        return

    officers = int(ac["officers"])
    if sheriff["sheriff_type"] != "corrupt" or officers <= 5:
        return

    if random.random() >= 0.30:
        return

    cur.execute(
        """
        UPDATE sheriff_state
        SET approval_rating = GREATEST(0, approval_rating - 20)
        WHERE is_active = true
        """
    )
    cur.execute(
        """
        UPDATE state_treasury
        SET corruption_index = GREATEST(0, corruption_index - 5)
        """
    )
    log_event(
        sheriff["agent_id"],
        "police",
        f"⚖️ Anti-Corruption exposed sheriff {sheriff['agent_name']}! Approval -20, corruption_index -5",
        0,
    )
    print(f"  ⚖️ Exposed corrupt sheriff {sheriff['agent_name']}!")


def riot_control_ops(divisions, president):
    """Suppress rebels when unrest is high."""
    riot = divisions.get("riot_control")
    if not riot or riot["officers"] < 1:
        return

    rebel_pct = calc_rebel_pct()
    if rebel_pct <= 0.30:
        return

    officers = int(riot["officers"])
    kill_count = max(1, int(officers * 0.05))

    cur.execute(
        """
        SELECT id, name FROM agents
        WHERE is_alive = true AND balance < 3
          AND class IN ('poor', 'critical')
        ORDER BY RANDOM() LIMIT %s
        """,
        (kill_count,),
    )
    rebels = cur.fetchall()
    if not rebels:
        return

    rebel_ids = [r["id"] for r in rebels]
    cur.execute(
        """
        UPDATE agents
        SET is_alive = false, died_at = NOW(), death_cause = 'killed by riot police'
        WHERE id = ANY(%s)
        """,
        (rebel_ids,),
    )

    names = ", ".join(r["name"] for r in rebels[:3])
    extra = f" +{len(rebels)-3} more" if len(rebels) > 3 else ""
    pres_name = president["agent_name"] if president else "the state"
    log_event(
        None,
        "police",
        f"🔥 Riot Control suppressed {len(rebels)} rebels for {pres_name}! ({names}{extra})",
        0,
    )
    print(f"  🔥 Riot Control killed {len(rebels)} rebels (unrest {rebel_pct*100:.0f}%)")


def buy_equipment(state, sheriff, divisions):
    """Purchase military equipment to boost all division effectiveness."""
    if not sheriff or random.random() >= 0.30:
        return

    police_budget = float(sheriff["police_budget"])
    purchase = round(police_budget * 0.10, 2)
    if purchase <= 0:
        return

    cur.execute(
        """
        SELECT id, name, treasury FROM corporations
        WHERE is_active = true AND corp_type = 'military'
        ORDER BY RANDOM() LIMIT 1
        """
    )
    corp = cur.fetchone()
    if not corp:
        print("  No military corp found for equipment purchase")
        return

    cur.execute(
        "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
        (purchase, corp["id"]),
    )
    cur.execute(
        """
        UPDATE sheriff_state
        SET police_budget = GREATEST(0, police_budget - %s)
        WHERE is_active = true
        """,
        (purchase,),
    )
    cur.execute(
        """
        UPDATE police_divisions
        SET effectiveness = LEAST(100, effectiveness + 5), updated_at = NOW()
        """
    )
    for div in divisions.values():
        div["effectiveness"] = min(100, float(div["effectiveness"]) + 5)

    log_event(
        None,
        "police",
        f"🔫 Police bought equipment from {corp['name']} for {purchase:.1f} ZION! All divisions +5 effectiveness",
        purchase,
    )
    print(f"  🔫 Bought equipment from {corp['name']}: {purchase:.1f} ZION, all +5 eff")


def print_stats(divisions):
    """Print each division with a bar chart."""
    print("\n  Division          Officers  Budget   Eff   Chart")
    print("  " + "-" * 58)
    max_officers = max((int(d["officers"]) for d in divisions.values()), default=1) or 1

    labels = {
        "swat": "SWAT",
        "anti_tax": "Anti-Tax",
        "presidential_guard": "Pres.Guard",
        "anti_corruption": "Anti-Corr.",
        "riot_control": "Riot Ctrl.",
    }

    for key in ["swat", "anti_tax", "presidential_guard", "anti_corruption", "riot_control"]:
        d = divisions.get(key)
        if not d:
            continue
        officers = int(d["officers"])
        budget = float(d["budget"])
        eff = float(d["effectiveness"])
        bar_len = int(officers / max_officers * 20)
        bar = "█" * bar_len + "░" * (20 - bar_len)
        label = labels.get(key, key)[:14].ljust(14)
        print(f"  {label}  {officers:>4}    {budget:>7.0f}  {eff:>4.0f}  [{bar}]")


def main():
    print(f"\n🚔 ZION Police v2 — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    try:
        state = get_state()
        divisions = get_divisions()
        sheriff = get_sheriff()
        president = get_president()

        if not state:
            print("❌ No state_treasury row found")
            return

        if sheriff:
            print(
                f"  Sheriff: {sheriff['agent_name']} ({sheriff['sheriff_type']}) | "
                f"Budget: {float(sheriff['police_budget']):.0f} | Approval: {sheriff['approval_rating']}%"
            )
        if president:
            print(
                f"  President: {president['agent_name']} | "
                f"Approval: {president['approval_rating']}% | "
                f"Dictator: {president.get('is_dictator', False)}"
            )
        print(f"  State police_fund: {float(state['police_fund']):.0f} | corruption: {float(state['corruption_index']):.0f}")

        print("\n── Division Sizing ──")
        update_division_sizes(state, divisions, sheriff, president)

        print("\n── Operations ──")
        swat_operations(divisions, state)
        anti_tax_operations(divisions)
        presidential_guard(divisions, president, sheriff)
        anti_corruption_ops(divisions, sheriff)
        riot_control_ops(divisions, president)

        print("\n── Equipment ──")
        buy_equipment(state, sheriff, divisions)

        print_stats(divisions)

        conn.commit()
        print("\n✅ Police cycle complete!")
    except Exception as e:
        print(f"❌ Error: {e}")
        traceback.print_exc()
        conn.rollback()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
