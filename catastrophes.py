#!/usr/bin/env python3
"""ZION Catastrophes — random disasters, blessings, and hunger-driven epidemics."""
import random
from datetime import datetime

from civ_common import ensure_schema, get_conn, get_cursor, hungry_agent_pct, log_event

CATASTROPHES = [
    {"name": "Great Plague", "type": "plague", "damage": 0.30, "emoji": "🦠"},
    {"name": "Volcano Eruption", "type": "volcano", "damage": 0.40, "emoji": "🌋"},
    {"name": "Great Famine", "type": "famine", "damage": 0.25, "emoji": "🌾"},
    {"name": "Tax Storm", "type": "tax", "damage": 0.50, "emoji": "⚡"},
    {"name": "Earthquake", "type": "earthquake", "damage": 0.35, "emoji": "🌍"},
    {"name": "Solar Flare", "type": "solar", "damage": 0.20, "emoji": "☀️"},
    {"name": "Great Flood", "type": "flood", "damage": 0.45, "emoji": "🌊"},
    {"name": "Meteor Strike", "type": "meteor", "damage": 0.60, "emoji": "☄️"},
    {"name": "Ice Age", "type": "ice", "damage": 0.30, "emoji": "❄️"},
    {"name": "Dragon Attack", "type": "dragon", "damage": 0.55, "emoji": "🐉"},
    {"name": "Black Death", "type": "death", "damage": 0.45, "emoji": "💀"},
    {"name": "Civil War", "type": "war", "damage": 0.35, "emoji": "⚔️"},
]

BLESSINGS = [
    {"name": "Golden Rain", "bonus": 0.30, "emoji": "💰"},
    {"name": "Divine Blessing", "bonus": 0.25, "emoji": "✨"},
    {"name": "Great Harvest", "bonus": 0.20, "emoji": "🌾"},
]

EPIDEMIC_NAMES = ["Red Cough", "ZION Fever", "Dust Lung", "Hunger Pox", "Street Rot"]


def epidemic(cur) -> int:
    """Spread disease among hungry agents; church treasury slows spread."""
    hunger_pct = hungry_agent_pct(cur)
    if hunger_pct < 10:
        return 0

    cur.execute("SELECT COALESCE(treasury, 0) AS t FROM church_state WHERE id = 1")
    church_row = cur.fetchone()
    church_treasury = float((church_row or {}).get("t") or 0)
    spread_mult = 0.5 if church_treasury > 50000 else 1.0

    cur.execute(
        """
        SELECT id, name, clan_id, COALESCE(health, 100) AS health
        FROM agents
        WHERE is_alive = true AND COALESCE(health, 100) < 50
        """
    )
    hungry = cur.fetchall()
    if not hungry:
        return 0

    disease = random.choice(EPIDEMIC_NAMES)
    infected_count = 0

    for patient in hungry:
        if random.random() > 0.05 * spread_mult:
            continue
        cur.execute(
            """
            SELECT a.id, a.name FROM agents a
            WHERE a.is_alive = true AND a.clan_id = %s AND a.id != %s
            ORDER BY RANDOM() LIMIT 3
            """,
            (patient.get("clan_id"), patient["id"]),
        )
        neighbors = cur.fetchall()
        if not neighbors:
            neighbors = [patient]

        for target in neighbors:
            cur.execute(
                """
                UPDATE agents SET infected = true,
                    health = GREATEST(0, COALESCE(health, 100) - 20)
                WHERE id = %s AND is_alive = true
                """,
                (target["id"],),
            )
            infected_count += 1

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND infected = true
        """
    )
    total_infected = int((cur.fetchone() or {}).get("c") or 0)

    if infected_count > 0:
        cur.execute(
            """
            SELECT c.name FROM agents a
            JOIN clans c ON c.id = a.clan_id
            WHERE a.infected = true LIMIT 1
            """
        )
        zone_row = cur.fetchone()
        zone = zone_row["name"] if zone_row else "the streets"
        log_event(
            cur,
            None,
            "catastrophe",
            f"BREAKING: EPIDEMIC: {disease} spreading! {total_infected} infected in {zone}!",
            total_infected,
            priority="breaking",
        )
        print(f"💉 EPIDEMIC {disease}: {total_infected} infected")

    cur.execute(
        """
        UPDATE agents SET health = GREATEST(0, COALESCE(health, 100) - 20)
        WHERE is_alive = true AND infected = true
        """
    )
    cur.execute(
        """
        UPDATE agents SET is_alive = false, died_at = NOW(), death_cause = 'disease'
        WHERE is_alive = true AND health <= 0
        """
    )
    return total_infected


def run_catastrophe(cur):
    infected = epidemic(cur)
    if infected > 0:
        return

    if random.random() > 0.20:
        print("\n☀️  No catastrophe this cycle")
        return

    if random.random() < 0.30:
        blessing = random.choice(BLESSINGS)
        cur.execute("SELECT id, name, balance FROM agents WHERE is_alive = TRUE")
        agents = cur.fetchall()
        affected = random.sample(agents, max(1, int(len(agents) * random.uniform(0.3, 0.6))))
        for agent_id, name, balance in [(a["id"], a["name"], a["balance"]) for a in affected]:
            bonus = float(balance) * blessing["bonus"]
            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (bonus, agent_id),
            )
        log_event(
            cur,
            None,
            "blessing",
            f"Blessing: {blessing['name']} affected {len(affected)} agents",
            len(affected),
        )
        return

    cat = random.choice(CATASTROPHES)
    cur.execute("SELECT id, name, balance FROM agents WHERE is_alive = TRUE")
    agents = cur.fetchall()
    affected = random.sample(agents, max(1, int(len(agents) * random.uniform(0.4, 0.8))))
    deaths = 0
    for agent_id, name, balance in [(a["id"], a["name"], a["balance"]) for a in affected]:
        damage = float(balance) * cat["damage"]
        new_balance = float(balance) - damage
        if new_balance < 1:
            cur.execute(
                """
                UPDATE agents SET balance = 0, is_alive = FALSE,
                died_at = NOW(), death_cause = %s WHERE id = %s
                """,
                (cat["type"], agent_id),
            )
            deaths += 1
        else:
            cur.execute(
                "UPDATE agents SET balance = %s WHERE id = %s",
                (new_balance, agent_id),
            )
    log_event(
        cur,
        None,
        "catastrophe",
        f"Catastrophe: {cat['name']} killed {deaths} agents",
        deaths,
    )


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🌋 ZION Catastrophes — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    run_catastrophe(cur)
    conn.commit()
    print("✅ Catastrophe cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
