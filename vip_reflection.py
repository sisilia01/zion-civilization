#!/usr/bin/env python3
"""ZION VIP Reflection — AI brain for key political figures via OpenRouter."""
import json
import traceback
from datetime import datetime

import requests

from civ_common import get_conn, get_cursor, log_event
from openrouter_key import get_openrouter_key

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODELS = {
    "president": "deepseek/deepseek-chat-v3-0324",
    "party_leader": "google/gemini-2.0-flash-lite-001",
    "clan_leader": "google/gemini-2.0-flash-lite-001",
}


def ai_decide(prompt: str, model: str) -> dict:
    """Call OpenRouter with JSON object response; return parsed dict."""
    try:
        resp = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {get_openrouter_key()}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 400,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=45,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(text)
        if isinstance(data, list):
            data = data[0] if data else {}
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"  AI error: {e}")
        return {}


def get_last_memories(cur, vip_type: str, vip_id: str, limit: int = 5) -> list:
    cur.execute(
        """
        SELECT day, decision, reasoning
        FROM vip_memory
        WHERE vip_type = %s AND vip_id = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (vip_type, vip_id, limit),
    )
    return [dict(r) for r in cur.fetchall()]


def save_memory(cur, vip_type: str, vip_id: str, metrics: dict, decision: str, reasoning: str):
    cur.execute(
        """
        INSERT INTO vip_memory (vip_type, vip_id, day, metrics, decision, reasoning)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            vip_type,
            vip_id,
            datetime.now().strftime("%Y-%m-%d"),
            json.dumps(metrics),
            decision,
            reasoning,
        ),
    )


def reflect_president(cur):
    print("\n🏛️ President reflection...")
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    pres = cur.fetchone()
    if not pres:
        print("  No active president")
        return

    pres = dict(pres)
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    total = max(int(cur.fetchone()["c"]), 1)
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND class IN ('poor', 'critical')
        """
    )
    poor = int(cur.fetchone()["c"])
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM events
        WHERE event_type = 'crime' AND created_at > NOW() - INTERVAL '24 hours'
        """
    )
    crimes = int(cur.fetchone()["c"])

    vip_id = str(pres["agent_id"])
    memories = get_last_memories(cur, "president", vip_id)
    memory_text = (
        "\n".join(
            f"Day {m['day']}: {m['decision']} — {m['reasoning']}" for m in memories
        )
        or "No history yet"
    )

    metrics = {
        "approval": pres["approval_rating"],
        "treasury": float(pres["personal_fund"] or 0),
        "poverty_pct": round(poor / total * 100, 1),
        "crimes_24h": crimes,
        "days_in_power": pres.get("days_in_power", 0),
        "corruption": float(pres.get("corruption_index") or 30),
    }

    prompt = f"""You are {pres["agent_name"]}, President of ZION civilization.
SITUATION: Approval {metrics["approval"]}%, Treasury {metrics["treasury"]:,.0f} ZION, Poverty {metrics["poverty_pct"]}%, Crimes 24h: {metrics["crimes_24h"]}, Corruption: {metrics["corruption"]}/100
RECENT DECISIONS:
{memory_text}
ACTIONS (choose exactly ONE):
- give_bonus: give ZION to poor (+approval, costs treasury)
- raise_taxes: tax elite (+treasury, -approval)
- cut_taxes: (-treasury, +approval)
- anti_corruption: reduce corruption (+approval)
- build_jobs: fund corporations (-treasury)
- declare_emergency: boost police (-approval)
- do_nothing

Respond ONLY JSON: {{"action":"...","reasoning":"one sentence","amount":0}}"""

    result = ai_decide(prompt, MODELS["president"])
    if not result:
        return

    action = result.get("action", "do_nothing")
    reasoning = result.get("reasoning", "")
    print(f"  {pres['agent_name']} decides: {action} — {reasoning}")

    if action == "give_bonus" and metrics["treasury"] > 1000:
        bonus = min(float(result.get("amount") or 20), 50)
        cur.execute(
            """
            SELECT COUNT(*) AS c FROM agents
            WHERE is_alive = true AND class IN ('poor', 'critical')
            """
        )
        poor_count = int(cur.fetchone()["c"] or 0)
        total_cost = round(bonus * poor_count, 2)
        if poor_count > 0 and metrics["treasury"] > total_cost:
            cur.execute(
                """
                UPDATE agents SET balance = balance + %s
                WHERE is_alive = true AND class IN ('poor', 'critical')
                """,
                (bonus,),
            )
            cur.execute(
                """
                UPDATE president_state
                SET personal_fund = personal_fund - %s,
                    approval_rating = LEAST(100, approval_rating + 5)
                WHERE is_active = true
                """,
                (total_cost,),
            )
            log_event(
                cur,
                pres["agent_id"],
                "president",
                f"AI: President {pres['agent_name']} gives {bonus:.0f} ZION to {poor_count} poor — {reasoning}",
                total_cost,
                priority="urgent",
            )
    elif action == "raise_taxes":
        cur.execute(
            """
            SELECT COALESCE(SUM(balance * 0.03), 0) AS collected
            FROM agents WHERE is_alive = true AND class = 'elite'
            """
        )
        collected = round(float(cur.fetchone()["collected"] or 0), 2)
        if collected > 0:
            cur.execute(
                """
                UPDATE agents SET balance = GREATEST(0, balance * 0.97)
                WHERE is_alive = true AND class = 'elite'
                """
            )
            cur.execute(
                """
                UPDATE president_state
                SET personal_fund = personal_fund + %s,
                    approval_rating = GREATEST(0, approval_rating - 5)
                WHERE is_active = true
                """,
                (collected,),
            )
            log_event(
                cur,
                pres["agent_id"],
                "president",
                f"AI: President {pres['agent_name']} raises taxes on elite (+{collected:.0f} ZION) — {reasoning}",
                collected,
                priority="urgent",
            )
    elif action == "cut_taxes" and metrics["treasury"] > 500:
        cur.execute(
            """
            UPDATE president_state
            SET personal_fund = personal_fund - 500,
                approval_rating = LEAST(100, approval_rating + 8)
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pres["agent_id"],
            "president",
            f"AI: President {pres['agent_name']} cuts taxes — {reasoning}",
            0,
            priority="urgent",
        )
    elif action == "anti_corruption":
        cur.execute(
            """
            UPDATE president_state
            SET corruption_index = GREATEST(0, corruption_index - 15),
                approval_rating = LEAST(100, approval_rating + 10)
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pres["agent_id"],
            "president",
            f"AI: President {pres['agent_name']} launches anti-corruption drive — {reasoning}",
            0,
            priority="urgent",
        )
    elif action == "build_jobs" and metrics["treasury"] > 2000:
        cur.execute("SELECT COUNT(*) AS c FROM corporations WHERE is_active = true")
        corp_count = int(cur.fetchone()["c"] or 0)
        per_corp = 500.0
        total_cost = round(per_corp * corp_count, 2)
        if corp_count > 0 and metrics["treasury"] >= total_cost:
            cur.execute(
                """
                UPDATE president_state
                SET personal_fund = personal_fund - %s
                WHERE is_active = true AND personal_fund >= %s
                """,
                (total_cost, total_cost),
            )
            if cur.rowcount != 1:
                return
            cur.execute(
                "UPDATE corporations SET treasury = treasury + %s WHERE is_active = true",
                (per_corp,),
            )
            log_event(
                cur,
                pres["agent_id"],
                "president",
                f"AI: President {pres['agent_name']} funds {corp_count} corporations "
                f"(-{total_cost:.0f} ZION) — {reasoning}",
                total_cost,
                priority="urgent",
            )
    elif action == "declare_emergency":
        cur.execute(
            """
            UPDATE president_state
            SET approval_rating = GREATEST(0, approval_rating - 10)
            WHERE is_active = true
            """
        )
        cur.execute(
            """
            UPDATE sheriff_state
            SET police_count = police_count + 20
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pres["agent_id"],
            "president",
            f"AI: President {pres['agent_name']} declares emergency — {reasoning}",
            0,
            priority="breaking",
        )

    save_memory(cur, "president", vip_id, metrics, action, reasoning)


def reflect_party_leaders(cur):
    print("\n🗳️ Party leaders reflection...")
    cur.execute("SELECT * FROM political_parties")
    parties = cur.fetchall()
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    pres = cur.fetchone()
    pres_approval = pres["approval_rating"] if pres else 50
    pres_name = pres["agent_name"] if pres else "The President"

    for party in parties:
        party = dict(party)
        if not party.get("leader_agent_id"):
            continue

        memories = get_last_memories(cur, "party_leader", party["party_id"])
        memory_text = (
            "\n".join(f"Day {m['day']}: {m['decision']}" for m in memories) or "No history"
        )

        member_note = ""
        if party["party_id"] == "centrists":
            member_note = " Membership includes working-class and middle-class agents."
        prompt = f"""You are {party["leader_name"]}, leader of {party["emoji"]} {party["name"]} in ZION.
PARTY: ideology={party["ideology"]}, approval={party["approval_rating"]}%, members={party["members_count"]}, treasury={float(party["treasury"] or 0):.0f}.{member_note}
SITUATION: President {pres_name} has {pres_approval}% approval
HISTORY:
{memory_text}
ACTIONS (choose exactly ONE):
- campaign: +approval, -treasury
- protest: +party rating if president weak
- demand_election: pressure president if approval low
- fundraise: +treasury
- sabotage: risky attack on rivals
- do_nothing

Respond ONLY JSON: {{"action":"...","reasoning":"one sentence"}}"""

        result = ai_decide(prompt, MODELS["party_leader"])
        if not result:
            continue

        action = result.get("action", "do_nothing")
        reasoning = result.get("reasoning", "")
        print(f"  {party['emoji']} {party['leader_name']}: {action} — {reasoning}")

        if action == "campaign" and float(party["treasury"] or 0) > 100:
            cur.execute(
                """
                UPDATE political_parties
                SET treasury = treasury - 100, approval_rating = LEAST(90, approval_rating + 3)
                WHERE party_id = %s
                """,
                (party["party_id"],),
            )
            log_event(
                cur,
                party["leader_agent_id"],
                "politics",
                f"POLITICS: {party['name']} campaigns — {reasoning}",
                0,
                priority="normal",
            )
        elif action == "protest":
            boost = 8 if pres_approval < 30 else 2
            cur.execute(
                """
                UPDATE political_parties
                SET approval_rating = LEAST(90, approval_rating + %s)
                WHERE party_id = %s
                """,
                (boost, party["party_id"]),
            )
            log_event(
                cur,
                party["leader_agent_id"],
                "politics",
                f"POLITICS: {party['name']} protests — {reasoning}",
                0,
                priority="urgent",
            )
        elif action == "demand_election" and pres_approval < 35:
            cur.execute(
                """
                UPDATE president_state
                SET approval_rating = GREATEST(0, approval_rating - 5)
                WHERE is_active = true
                """
            )
            log_event(
                cur,
                party["leader_agent_id"],
                "politics",
                f"BREAKING: {party['name']} demands elections! — {reasoning}",
                0,
                priority="breaking",
            )
        elif action == "fundraise":
            base_class = party.get("base_class") or "middle"
            if base_class == "poor":
                cur.execute(
                    """
                    SELECT id, balance FROM agents
                    WHERE is_alive = true AND class IN ('poor', 'critical') AND balance > 1
                    ORDER BY RANDOM() LIMIT 50
                    """
                )
            else:
                cur.execute(
                    """
                    SELECT id, balance FROM agents
                    WHERE is_alive = true AND class = %s AND balance > 1
                    ORDER BY RANDOM() LIMIT 50
                    """,
                    (base_class,),
                )
            members = cur.fetchall()
            per_member = 2.0
            raised = 0.0
            for member in members:
                take = round(min(per_member, float(member["balance"] or 0) * 0.05), 2)
                if take <= 0:
                    continue
                cur.execute(
                    "UPDATE agents SET balance = balance - %s WHERE id = %s",
                    (take, member["id"]),
                )
                raised += take
            if raised > 0:
                cur.execute(
                    """
                    UPDATE political_parties SET treasury = treasury + %s
                    WHERE party_id = %s
                    """,
                    (raised, party["party_id"]),
                )
                log_event(
                    cur,
                    party["leader_agent_id"],
                    "politics",
                    f"POLITICS: {party['name']} fundraises {raised:.0f} ZION from members — {reasoning}",
                    raised,
                    priority="normal",
                )
        elif action == "sabotage":
            cur.execute(
                """
                UPDATE political_parties
                SET approval_rating = GREATEST(0, approval_rating - 5)
                WHERE party_id != %s
                """,
                (party["party_id"],),
            )
            cur.execute(
                """
                UPDATE political_parties
                SET approval_rating = LEAST(90, approval_rating + 4)
                WHERE party_id = %s
                """,
                (party["party_id"],),
            )
            log_event(
                cur,
                party["leader_agent_id"],
                "politics",
                f"POLITICS: {party['name']} sabotages rivals — {reasoning}",
                0,
                priority="urgent",
            )

        save_memory(
            cur,
            "party_leader",
            party["party_id"],
            {
                "approval": party["approval_rating"],
                "treasury": float(party["treasury"] or 0),
            },
            action,
            reasoning,
        )


def reflect_clan_leaders(cur):
    print("\n⚔️ Clan leaders reflection...")
    cur.execute(
        """
        SELECT c.*, a.name AS leader_name
        FROM clans c
        LEFT JOIN agents a ON a.id = c.leader_id
        WHERE c.members_count > 5
        ORDER BY c.members_count DESC
        LIMIT 5
        """
    )
    clans = cur.fetchall()
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    pres = cur.fetchone()

    for clan in clans:
        clan = dict(clan)
        if not clan.get("leader_id"):
            continue

        memories = get_last_memories(cur, "clan_leader", str(clan["id"]))
        memory_text = (
            "\n".join(f"Day {m['day']}: {m['decision']}" for m in memories) or "No history"
        )

        prompt = f"""You are {clan.get("leader_name", "Unknown")}, leader of clan "{clan["name"]}" in ZION civilization.
CLAN: members={clan["members_count"]}, treasury={float(clan.get("treasury") or 0):.0f} ZION
PRESIDENT: {pres["agent_name"] if pres else "Unknown"} approval={pres["approval_rating"] if pres else 50}%
HISTORY:
{memory_text}
ACTIONS (choose exactly ONE):
- recruit: +members
- extort: +treasury from businesses
- ally_president: political support for president
- oppose_president: weaken president approval
- expand_territory: risky territorial fight
- lay_low: safe, no major moves

Respond ONLY JSON: {{"action":"...","reasoning":"one sentence"}}"""

        result = ai_decide(prompt, MODELS["clan_leader"])
        if not result:
            continue

        action = result.get("action", "lay_low")
        reasoning = result.get("reasoning", "")
        print(f"  {clan['name']} ({clan.get('leader_name', '?')}): {action} — {reasoning}")

        if action == "recruit":
            cur.execute(
                "UPDATE clans SET members_count = members_count + 5 WHERE id = %s",
                (clan["id"],),
            )
            log_event(
                cur,
                clan["leader_id"],
                "clan",
                f"CLAN: {clan['name']} recruits 5 members — {reasoning}",
                0,
                priority="normal",
            )
        elif action == "extort":
            cur.execute(
                """
                SELECT id, treasury FROM corporations
                WHERE is_active = true AND treasury >= 50
                ORDER BY RANDOM() LIMIT 5
                """
            )
            targets = cur.fetchall()
            seized = 0.0
            for corp in targets:
                take = min(50.0, float(corp["treasury"] or 0))
                if take <= 0:
                    continue
                cur.execute(
                    "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                    (take, corp["id"]),
                )
                seized += take
            if seized > 0:
                cur.execute(
                    "UPDATE clans SET treasury = COALESCE(treasury, 0) + %s WHERE id = %s",
                    (seized, clan["id"]),
                )
                log_event(
                    cur,
                    clan["leader_id"],
                    "clan",
                    f"CLAN: {clan['name']} extorts corporations +{seized:.0f} ZION — {reasoning}",
                    seized,
                    priority="urgent",
                )
        elif action == "ally_president" and pres:
            cur.execute(
                """
                UPDATE president_state
                SET approval_rating = LEAST(100, approval_rating + 3)
                WHERE is_active = true
                """
            )
            log_event(
                cur,
                clan["leader_id"],
                "clan",
                f"CLAN: {clan['name']} allies with President — {reasoning}",
                0,
                priority="normal",
            )
        elif action == "oppose_president" and pres:
            cur.execute(
                """
                UPDATE president_state
                SET approval_rating = GREATEST(0, approval_rating - 3)
                WHERE is_active = true
                """
            )
            log_event(
                cur,
                clan["leader_id"],
                "clan",
                f"CLAN: {clan['name']} joins opposition — {reasoning}",
                0,
                priority="urgent",
            )
        elif action == "expand_territory":
            cur.execute(
                """
                UPDATE clans
                SET treasury = GREATEST(0, COALESCE(treasury, 0) - 150),
                    wins = COALESCE(wins, 0) + 1
                WHERE id = %s
                """,
                (clan["id"],),
            )
            log_event(
                cur,
                clan["leader_id"],
                "clan",
                f"CLAN: {clan['name']} expands territory — {reasoning}",
                0,
                priority="breaking",
            )

        save_memory(
            cur,
            "clan_leader",
            str(clan["id"]),
            {"members": clan["members_count"]},
            action,
            reasoning,
        )


def main():
    print(f"\n🧠 ZION VIP Reflection — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        reflect_president(cur)
        conn.commit()
        reflect_party_leaders(cur)
        conn.commit()
        reflect_clan_leaders(cur)
        conn.commit()
        print("\n✅ VIP reflection complete!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
