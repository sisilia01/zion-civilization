import psycopg2
import psycopg2.extras
import random
from civ_common import get_conn, get_cursor, log_event, zrs_deduct_reserve


def sync_clan_member_count(cur, clan_id: int):
    cur.execute(
        """
        UPDATE clans c SET members_count = (
            SELECT COUNT(*) FROM agents
            WHERE clan_id = c.id AND is_alive = true
        ) WHERE c.id = %s
        """,
        (clan_id,),
    )


def run_faction_engine():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # === СОБИРАЕМ ДАННЫЕ ===
        cur.execute(
            "SELECT COALESCE(SUM(members_count),0) gang_total, COALESCE(SUM(treasury),0) gang_treasury FROM clans WHERE members_count > 0"
        )
        g = cur.fetchone()
        gang_power = float(g["gang_total"] or 0) + float(g["gang_treasury"] or 0) / 1000

        cur.execute("SELECT police_count, police_budget FROM sheriff_state WHERE is_active=true")
        sh = cur.fetchone() or {}
        police_count = float(sh.get("police_count") or 0)
        police_budget = float(sh.get("police_budget") or 0)
        police_power = police_count * (1 + police_budget / 10000)

        cur.execute(
            "SELECT COALESCE(SUM(treasury),0) corp_treasury, COALESCE(SUM(employees),0) corp_employees, COUNT(*) corp_count FROM corporations WHERE is_active=true"
        )
        c = cur.fetchone()
        corp_power = float(c["corp_treasury"] or 0) / 1000 + float(c["corp_employees"] or 0)

        print(f"  FACTION POWER: gangs={gang_power:.0f} police={police_power:.0f} corps={corp_power:.0f}")

        # === УРАВНЕНИЕ 1: БАНДЫ vs КОРПОРАЦИИ ===
        # Если банды сильнее полиции - грабят корпорации
        # Gang vs corp extortion handled in corporations.gang_extortion() — single system
        if False and gang_power > police_power * 1.5:
            cur.execute(
                "SELECT id, name, treasury, police_protection FROM corporations WHERE is_active=true AND treasury > 200 ORDER BY RANDOM() LIMIT 3"
            )
            targets = cur.fetchall()
            for corp in targets:
                if not corp["police_protection"]:
                    extortion = float(corp["treasury"]) * random.uniform(0.03, 0.08)
                    extortion = min(extortion, 2000)
                    cur.execute(
                        "UPDATE corporations SET treasury = treasury - %s WHERE id=%s",
                        (extortion, corp["id"]),
                    )
                    # Деньги идут случайному клану
                    cur.execute(
                        "UPDATE clans SET treasury = treasury + %s WHERE id = (SELECT id FROM clans WHERE members_count > 0 ORDER BY RANDOM() LIMIT 1)",
                        (extortion,),
                    )
                    log_event(
                        cur,
                        None,
                        "gang",
                        f"Gang extortion: {corp['name']} lost {extortion:.0f} ZION (no security!)",
                        extortion,
                    )

        # === УРАВНЕНИЕ 2: БАНДЫ РЕКРУТИРУЮТ БЕДНЫХ ===
        # Чем больше бедных тем больше рекрутинг
        cur.execute(
            "SELECT COUNT(*) c FROM agents WHERE is_alive=true AND class IN ('poor','critical') AND clan_id IS NULL"
        )
        available_poor = int(cur.fetchone()["c"] or 0)

        if gang_power > 50 and available_poor > 1000:
            recruit_count = min(50, int(available_poor * 0.001 * (gang_power / max(police_power, 1))))
            if recruit_count > 0:
                cur.execute(
                    "SELECT id FROM clans WHERE members_count > 0 ORDER BY treasury DESC LIMIT 1"
                )
                target_clan = cur.fetchone()
                if target_clan:
                    clan_id = target_clan["id"]
                    cur.execute(
                        """
                        UPDATE agents SET clan_id = %s
                        WHERE is_alive=true AND class IN ('poor','critical') AND clan_id IS NULL
                        AND id IN (
                            SELECT id FROM agents
                            WHERE is_alive=true AND class IN ('poor','critical') AND clan_id IS NULL
                            ORDER BY RANDOM() LIMIT %s
                        )
                        """,
                        (clan_id, recruit_count),
                    )
                    sync_clan_member_count(cur, clan_id)
                    log_event(
                        cur,
                        None,
                        "gang",
                        f"Gang recruitment: {recruit_count} poor agents joined gangs (gang_power={gang_power:.0f})",
                        recruit_count,
                    )

        # === УРАВНЕНИЕ 3: ПОЛИЦИЯ АКТИВНО РЕЙДИТ ===
        if police_power > 20:
            cur.execute(
                "SELECT id, name, members_count, treasury FROM clans WHERE members_count > 10 ORDER BY members_count DESC LIMIT 2"
            )
            targets = cur.fetchall()
            for clan in targets:
                success_chance = min(0.8, police_power / (gang_power + 1))
                if random.random() < success_chance:
                    max_loss = max(1, min(15, int(clan["members_count"] * 0.1)))
                    min_loss = min(3, max_loss)
                    losses = random.randint(min_loss, max_loss)
                    fine = float(clan["treasury"]) * 0.05
                    cur.execute(
                        """
                        UPDATE agents SET clan_id = NULL, clan_name = NULL
                        WHERE id IN (
                            SELECT id FROM agents
                            WHERE clan_id = %s AND is_alive = true
                            ORDER BY RANDOM()
                            LIMIT %s
                        )
                        """,
                        (clan["id"], losses),
                    )
                    cur.execute(
                        "UPDATE clans SET treasury = GREATEST(0, treasury - %s) WHERE id=%s",
                        (fine, clan["id"]),
                    )
                    sync_clan_member_count(cur, clan["id"])
                    cur.execute(
                        "UPDATE sheriff_state SET police_budget = police_budget + %s WHERE is_active=true",
                        (fine,),
                    )
                    log_event(
                        cur,
                        None,
                        "police",
                        f"Police raided {clan['name']}: -{losses} members, confiscated {fine:.0f} ZION",
                        fine,
                    )

        # === EQUATION 4: corporate lobbying handled in corporations.run_lobbying_tick() ===

        # === EQUATION 5: corporate boom bonus (ZRS-funded) ===
        cur.execute("SELECT AVG(revenue) avg_rev FROM corporations WHERE is_active=true")
        avg_revenue = float(cur.fetchone()["avg_rev"] or 0)

        if avg_revenue > 20000:
            bonus = round(min(5.0, avg_revenue / 10000), 2)
            cur.execute(
                """
                SELECT id FROM agents
                WHERE is_alive = true AND class = 'working'
                ORDER BY RANDOM() LIMIT 10000
                """
            )
            worker_ids = [r["id"] for r in cur.fetchall()]
            total_bonus = round(bonus * len(worker_ids), 2)
            if worker_ids and total_bonus > 0 and zrs_deduct_reserve(cur, total_bonus):
                for wid in worker_ids:
                    cur.execute(
                        "UPDATE agents SET balance = balance + %s WHERE id = %s",
                        (bonus, wid),
                    )
                log_event(
                    cur,
                    None,
                    "economy",
                    f"Corporate boom: {len(worker_ids)} workers got +{bonus:.1f} ZION (ZRS-funded)",
                    total_bonus,
                )

        # Банды грабят агентов
        if gang_power > police_power:
            robbery_chance = min(0.3, (gang_power - police_power) / gang_power)
            victims = int(300000 * robbery_chance * 0.01)
            if victims > 0:
                avg_stolen = random.uniform(5, 30)
                cur.execute(
                    """
                    UPDATE agents SET balance = GREATEST(0, balance - %s)
                    WHERE is_alive=true AND class IN ('working','middle')
                    AND id IN (
                        SELECT id FROM agents
                        WHERE is_alive=true AND class IN ('working','middle')
                        ORDER BY RANDOM() LIMIT %s
                    )
                    RETURNING id
                    """,
                    (avg_stolen, victims),
                )
                robbed = cur.fetchall()
                stolen_total = round(avg_stolen * len(robbed), 2)
                if stolen_total > 0:
                    cur.execute(
                        """
                        UPDATE clans SET treasury = treasury + %s
                        WHERE id = (
                            SELECT id FROM clans
                            WHERE members_count > 0
                            ORDER BY treasury DESC LIMIT 1
                        )
                        """,
                        (stolen_total,),
                    )
                log_event(
                    cur,
                    None,
                    "gang",
                    f"Mass robbery: {len(robbed)} agents lost avg {avg_stolen:.0f} ZION each",
                    stolen_total,
                )

        conn.commit()
        print("✅ Faction engine complete!")

    except Exception as e:
        conn.rollback()
        print(f"❌ Faction engine error: {e}")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    run_faction_engine()
