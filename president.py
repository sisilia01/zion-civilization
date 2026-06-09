#!/usr/bin/env python3
"""ZION President — decision engine from live DB metrics."""
import random
from datetime import datetime

from civ_common import (
    cleanup_expired_effects,
    effective_crime_multiplier,
    ensure_schema,
    get_active_effects,
    get_conn,
    get_cursor,
    get_latest_ai_decision,
    get_revolution_meter,
    insert_active_effect,
    is_uprising_active,
    log_event,
    nationalize_corporations_from_zrs,
    process_revolution_cycle,
    apply_martial_law_divisions,
    apply_stimulus_revolution_bonus,
    restore_after_martial_law,
    sync_police_divisions,
)
from civ_governance import (
    check_anti_dictator_coup,
    check_compliance,
    check_dictator_mode,
    check_sheriff_self_coup,
    get_sheriff_compliance_metrics,
    issue_president_orders,
    sheriff_compliance_actionable,
)

POPULISM_TAX_HOURS = 48
STIMULUS_AMOUNT = 50.0
POLICE_TRANSFER = 1000.0


def action_give_money_to_poor(cur, president: dict):
    fund = float(president.get("personal_fund") or 0)
    zrs_reserve = 0.0
    if fund < 500:
        cur.execute(
            """
            SELECT COALESCE(reserve, 0) AS zr
            FROM zrs_state
            LIMIT 1
            """
        )
        zrs_reserve = float((cur.fetchone() or {}).get("zr") or 0)

    spend_pool = fund + zrs_reserve
    if spend_pool <= 0:
        return False

    amount_per_agent = min(20, spend_pool * 0.5 / 5000)
    # Guarantee meaningful support when treasury is sufficient.
    if spend_pool >= 5 * 5000:
        amount_per_agent = max(amount_per_agent, 5.0)
    if amount_per_agent <= 0:
        return False

    cur.execute(
        """
        UPDATE agents SET balance = balance + %s
        WHERE is_alive = true AND class IN ('poor', 'critical')
        AND id IN (SELECT id FROM agents WHERE is_alive=true
                   AND class IN ('poor','critical')
                   ORDER BY balance ASC LIMIT 5000)
        """,
        (amount_per_agent,),
    )
    affected = int(cur.rowcount or 0)
    if affected <= 0:
        return False

    total = round(amount_per_agent * affected, 2)
    from_fund = min(fund, total)
    from_zrs = round(total - from_fund, 2)

    cur.execute(
        "UPDATE president_state SET personal_fund = personal_fund - %s WHERE id = %s",
        (from_fund, president["id"]),
    )
    if from_zrs > 0:
        cur.execute(
            """
            UPDATE zrs_state
            SET reserve = GREATEST(0, COALESCE(reserve, 0) - %s)
            """,
            (from_zrs,),
        )
    log_event(
        cur,
        president["agent_id"],
        "president_action",
        f"President {president['agent_name']} gave {total:.0f} ZION to poorest {affected} agents "
        f"({amount_per_agent:.1f} each; fund={from_fund:.0f}, zrs={from_zrs:.0f})",
        total,
    )
    return True


def decide_action(cur, data: dict) -> str:
    poverty = float(data.get("poverty_pct") or 0)
    corruption = float(data.get("corruption_index") or 0)
    gang_overrun = data["gang_strength_total"] > data["police_count"] * 20

    # High-poverty hard rule: always pick direct support action.
    if poverty > 50:
        return random.choice(["GIVE_MONEY_TO_POOR", "STIMULUS"])

    weights = {
        "STIMULUS": 10,
        "GIVE_MONEY_TO_POOR": 10,
        "ANTI_CORRUPTION_DRIVE": min(20, 8 + int(corruption // 10)),
        "NATIONALIZE_CORPS": 8 if data["corp_bankruptcies_week"] > 3 else 3,
        "INVESTIGATE_SHERIFF": 10 if sheriff_compliance_actionable(data["sheriff_compliance_metrics"]) else 2,
        "POPULISM": 8 if data["approval"] < 30 else 2,
        "TAX_RELIEF": 18 if poverty > 30 else 4,
        "FUND_POLICE": 12,
    }

    # Read AI President decision
    ai_decision = get_latest_ai_decision(cur, "president")
    ai_action = ai_decision.get("action", "")

    if ai_action == "give_money":
        weights["GIVE_MONEY_TO_POOR"] = weights.get("GIVE_MONEY_TO_POOR", 1) * 3
    elif ai_action == "hire_police":
        weights["FUND_POLICE"] = weights.get("FUND_POLICE", 1) * 3
    elif ai_action == "stimulate_economy":
        weights["STIMULUS"] = weights.get("STIMULUS", 1) * 3
    elif ai_action == "declare_emergency":
        weights["FUND_POLICE"] = weights.get("FUND_POLICE", 1) * 2
    elif ai_action == "tax_change":
        weights["TAX_RELIEF"] = weights.get("TAX_RELIEF", 1) * 2

    if ai_action and ai_action != "do_nothing":
        print(
            f"President influenced by AI ({ai_action}): "
            f"{ai_decision.get('reasoning', '')[:80]}"
        )

    if gang_overrun:
        weights["FUND_POLICE"] = 25
    if poverty > 30:
        weights["GIVE_MONEY_TO_POOR"] = max(weights["GIVE_MONEY_TO_POOR"], 40)
    if data["treasury"] <= 0:
        weights["STIMULUS"] = 0
        weights["GIVE_MONEY_TO_POOR"] = 0

    actions = [k for k, v in weights.items() if v > 0]
    probs = [weights[a] for a in actions]
    return random.choices(actions, weights=probs, k=1)[0]


def ensure_president_schema(cur):
    ensure_schema(cur)
    for col, typedef in [
        ("corruption_index", "NUMERIC(5,2) DEFAULT 30"),
        ("tax_relief_until", "TIMESTAMP"),
        ("martial_law_until", "TIMESTAMP"),
        ("hours_in_power", "INTEGER DEFAULT 0"),
        ("is_dictator", "BOOLEAN DEFAULT false"),
    ]:
        try:
            cur.execute(
                f"ALTER TABLE president_state ADD COLUMN IF NOT EXISTS {col} {typedef}"
            )
        except Exception:
            pass


def get_president(cur):
    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    return cur.fetchone()


def gather_metrics(cur) -> dict:
    cur.execute("SELECT COUNT(*) AS c FROM agents WHERE is_alive = true")
    total = max(int(cur.fetchone()["c"] or 0), 1)

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND (balance < 10 OR class IN ('poor', 'critical'))
        """
    )
    poor = int(cur.fetchone()["c"] or 0)
    poverty_pct = poor / total * 100

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM agents
        WHERE is_alive = true AND clan_id IS NOT NULL
        """
    )
    gang_members = int(cur.fetchone()["c"] or 0)

    cur.execute(
        """
        SELECT COALESCE(SUM(members_count), 0) AS s FROM clans
        WHERE members_count > 0
        """
    )
    gang_strength = float(cur.fetchone()["s"] or gang_members)

    cur.execute(
        """
        SELECT COUNT(*) AS c FROM events
        WHERE event_type IN ('corporation', 'tax')
          AND description ILIKE '%%BANKRUPT%%'
          AND created_at > NOW() - INTERVAL '7 days'
        """
    )
    corp_bankruptcies_week = int(cur.fetchone()["c"] or 0)

    cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
    sheriff = cur.fetchone() or {}

    police_count = int(sheriff.get("police_count") or 0)
    sheriff_type = sheriff.get("sheriff_type") or "honest"

    cur.execute("SELECT * FROM president_state WHERE is_active = true LIMIT 1")
    pres = cur.fetchone() or {}

    compliance_metrics = get_sheriff_compliance_metrics(cur)
    compliance = (
        compliance_metrics["compliance_rate"]
        if compliance_metrics["measurable"]
        else 100.0
    )

    cleanup_expired_effects(cur)
    active_effects = get_active_effects(cur)
    crime_mult = effective_crime_multiplier(cur)
    effective_poverty = max(0.0, poverty_pct * crime_mult)

    return {
        "crime_rate": effective_poverty,
        "poverty_pct": poverty_pct,
        "effective_poverty_pct": effective_poverty,
        "active_effects": active_effects,
        "corp_bankruptcies_week": corp_bankruptcies_week,
        "gang_strength_total": gang_strength,
        "police_count": police_count,
        "treasury": float(pres.get("personal_fund") or 0),
        "approval": int(pres.get("approval_rating") or 50),
        "corruption_index": float(pres.get("corruption_index") or 30),
        "sheriff_compliance_rate": compliance,
        "sheriff_compliance_metrics": compliance_metrics,
        "sheriff_type": sheriff_type,
        "president": pres,
        "sheriff": sheriff,
    }


def update_corruption(cur, data: dict, action: str) -> float:
    """Dynamic corruption_index on president_state (0–100)."""
    idx = float(data.get("corruption_index") or 30)
    sheriff_type = data.get("sheriff_type") or "honest"

    if sheriff_type == "corrupt":
        idx += 5
    elif sheriff_type == "honest":
        idx -= 3

    if action == "POPULISM":
        idx += 3
    elif action and action != "ANTI_CORRUPTION_DRIVE" and random.random() < 0.20:
        idx += 3  # president took a bribe

    if action == "ANTI_CORRUPTION_DRIVE":
        idx -= 10

    idx = max(0.0, min(100.0, round(idx, 2)))
    cur.execute(
        "UPDATE president_state SET corruption_index = %s WHERE is_active = true",
        (idx,),
    )
    return idx


def nationalize_bankrupt_corps(cur, president: dict):
    nationalize_corporations_from_zrs(
        cur,
        president["agent_id"],
        president["agent_name"],
        limit=3,
        source="president",
    )


def execute_decision(cur, data: dict):
    pres = data["president"]
    if not pres:
        return "none"

    pid = pres["agent_id"]
    pname = pres["agent_name"]
    approval = data["approval"]
    action = decide_action(cur, data)

    if action == "ANTI_CORRUPTION_DRIVE":
        cur.execute(
            """
            UPDATE president_state SET approval_rating = LEAST(100, approval_rating + 15)
            WHERE is_active = true
            """
        )
        if data["sheriff_type"] == "corrupt":
            cur.execute(
                "UPDATE sheriff_state SET sheriff_type = 'honest', coup_points = GREATEST(0, coup_points - 50) WHERE is_active = true"
            )
        log_event(
            cur,
            pid,
            "president",
            f"ANTI-CORRUPTION DRIVE: President {pname} purges corrupt officials! Approval +15",
            0,
            priority="urgent",
        )
    elif action == "MARTIAL_LAW":
        # Redirected: martial law is unconstitutional (Article II Sec.3)
        # President funds police instead — constitutional emergency response
        cur.execute("""UPDATE sheriff_state SET police_count = police_count + 20
            WHERE is_active = true""")
        cur.execute("""UPDATE president_state SET
            approval_rating = LEAST(100, approval_rating + 5)
            WHERE is_active = true""")
        log_event(
            cur,
            pid,
            "president",
            f"BREAKING: MARTIAL LAW DECLARED: All resources to police! Crime -40%, food ×2",
            0,
            priority="breaking",
        )
    elif action == "STIMULUS":
        from civ_common import debit_personal_fund_pay_agents

        if data["treasury"] <= 0:
            if action_give_money_to_poor(cur, pres):
                action = "GIVE_MONEY_TO_POOR"
            else:
                action = "FUND_POLICE"
        else:
            n_paid, total_paid = debit_personal_fund_pay_agents(
                cur,
                STIMULUS_AMOUNT,
                "is_alive = true AND balance < 10",
            )
            if n_paid == 0:
                if action_give_money_to_poor(cur, pres):
                    action = "GIVE_MONEY_TO_POOR"
                else:
                    action = "FUND_POLICE"
            else:
                insert_active_effect(
                    cur, "stimulus", 24, poverty_modifier=-0.15,
                    metadata={"amount": STIMULUS_AMOUNT, "source": "president"},
                )
                apply_stimulus_revolution_bonus(cur)
                log_event(
                    cur,
                    pid,
                    "president",
                    f"STIMULUS: President {pname} gave {STIMULUS_AMOUNT:.0f} ZION to {n_paid} poor agents ({total_paid:.0f} from personal fund)",
                    total_paid,
                    priority="urgent",
                )
    elif action == "GIVE_MONEY_TO_POOR":
        if not action_give_money_to_poor(cur, pres):
            action = "FUND_POLICE"
    elif action == "NATIONALIZE_CORPS":
        nationalize_bankrupt_corps(cur, pres)
    elif action == "INVESTIGATE_SHERIFF":
        rate = data["sheriff_compliance_metrics"]["compliance_rate"]
        cur.execute(
            """
            UPDATE sheriff_state SET coup_points = COALESCE(coup_points, 0) + 50
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "sheriff_action",
            f"President {pname} investigates Sheriff — compliance {rate:.0f}% (24h orders)",
            0,
            priority="urgent",
        )
    elif action == "POPULISM":
        cur.execute(
            """
            UPDATE president_state SET
                approval_rating = LEAST(100, approval_rating + 25),
                tax_relief_until = NOW() + INTERVAL '48 hours'
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "president",
            f"POPULISM: President {pname} cancels taxes 48h! Approval +25",
            0,
            priority="urgent",
        )
    elif action == "TAX_RELIEF":
        cur.execute(
            """
            UPDATE president_state
            SET tax_relief_until = NOW() + INTERVAL '24 hours'
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            pid,
            "president",
            f"TAX RELIEF: President {pname} cuts poor/critical tax by 50% for 24h",
            0,
            priority="urgent",
        )
    else:
        action = "FUND_POLICE"
        cur.execute(
            """
            UPDATE president_state SET personal_fund = personal_fund - %s
            WHERE is_active = true AND personal_fund >= %s
            """,
            (POLICE_TRANSFER, POLICE_TRANSFER),
        )
        if cur.rowcount > 0:
            cur.execute(
                """
                UPDATE sheriff_state SET police_budget = police_budget + %s
                WHERE is_active = true
                """,
                (POLICE_TRANSFER,),
            )
            log_event(
                cur,
                pid,
                "president",
                f"President {pname} transferred {POLICE_TRANSFER:.0f} ZION to police budget",
                POLICE_TRANSFER,
                priority="normal",
            )
        else:
            action = "NO_FUNDS"

    corruption = update_corruption(cur, data, action)
    print(f"📋 Decision: {action} | approval {approval}% | corruption {corruption:.0f}")
    return action


def ensure_martial_law_consistency(cur):
    cur.execute(
        """
        UPDATE president_state
        SET martial_law_until = NULL
        WHERE is_active = true
        AND martial_law_until IS NOT NULL
        AND martial_law_until < NOW()
        """
    )

    # Also remove stale martial-law effects after they expire.
    cur.execute(
        """
        DELETE FROM active_effects
        WHERE effect_type ILIKE '%martial%'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
        """
    )


def ensure_president_exists(cur):
    """Fill vacant or dead-president office via senate election (not legacy blue bootstrap)."""
    president = get_president(cur)
    if president:
        cur.execute(
            "SELECT is_alive FROM agents WHERE id = %s",
            (president["agent_id"],),
        )
        agent = cur.fetchone()
        if agent and agent.get("is_alive"):
            return
        cur.execute(
            """
            UPDATE president_state
            SET is_active = false, phase = 'deceased'
            WHERE is_active = true
            """
        )
        log_event(
            cur,
            president["agent_id"],
            "election",
            f"President {president['agent_name']} office vacated — agent deceased",
            0,
            priority="breaking",
        )

    from senate import run_election

    winner = run_election(cur, "president")
    if winner:
        log_event(
            cur,
            winner["agent_id"],
            "election",
            f"President {winner['name']} inaugurated after vacancy",
            0,
            priority="normal",
        )


def run_governance_tick(cur, ctx: dict) -> dict:
    """Executive branch step — reads FRS/ZRS context before acting."""
    from frs_chief import get_frs_chief, nominate_frs_chief

    ensure_president_exists(cur)
    # New presidents (first 24 tick-hours) have a higher approval floor.
    cur.execute(
        """
        UPDATE president_state SET approval_rating = GREATEST(
            CASE WHEN COALESCE(hours_in_power, 0) < 24 THEN 45 ELSE 10 END,
            approval_rating
        ) WHERE is_active = true
        """
    )
    cleanup_expired_effects(cur)
    restore_after_martial_law(cur)
    ensure_martial_law_consistency(cur)
    data = gather_metrics(cur)
    president = data["president"]
    if not president:
        ctx["president"] = {"status": "vacant", "summary": "No president"}
        return ctx

    frs_dir = ctx.get("frs_chief", {}).get("directive", {})
    if frs_dir.get("action") == "stimulate_economy":
        log_event(
            cur,
            president["agent_id"],
            "president",
            "President notes FRS easing — fiscal restraint advised",
            0,
        )

    chief = get_frs_chief(cur)
    if not chief.get("is_active") and chief.get("confirmation_status") != "pending":
        nominate_frs_chief(cur, president, ctx)

    cur.execute(
        """
        UPDATE president_state SET
            hours_in_power = COALESCE(hours_in_power, 0) + 1,
            days_in_power = COALESCE(days_in_power, 0) + 1
        WHERE is_active = true
        """
    )
    execute_decision(cur, data)
    president = get_president(cur)
    rev_status = process_revolution_cycle(cur, president) if president else {}
    if president:
        issue_president_orders(cur, president)
        check_compliance(cur, president)
        if not is_uprising_active(cur):
            sync_police_divisions(cur)

    try:
        from news import apply_media_to_approval

        apply_media_to_approval(cur)
    except Exception:
        pass

    try:
        from corporations import run_lobbying_tick

        run_lobbying_tick(cur, president)
    except Exception:
        pass

    if president:
        president = get_president(cur)
        current_approval = int((president or {}).get("approval_rating") or data["approval"])
    else:
        current_approval = data["approval"]

    summary = (
        f"President {president['agent_name'] if president else '—'} "
        f"approval {current_approval}% | rev {rev_status.get('meter', 0)}%"
    )
    ctx["president"] = {
        "summary": summary,
        "approval": current_approval,
        "revolution": rev_status.get("meter", 0),
        "nominate_frs": bool(ctx.get("frs_nomination")),
    }
    return ctx


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_president_schema(cur)
    conn.commit()

    print(f"\n🏛️ ZION President — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    try:
        ensure_president_exists(cur)
        # New presidents (first 24 hours) have a higher approval floor.
        cur.execute(
            """
            UPDATE president_state SET approval_rating = GREATEST(
                CASE WHEN hours_in_power < 24 THEN 45 ELSE 10 END,
                approval_rating
            ) WHERE is_active = true
            """
        )
        cleanup_expired_effects(cur)
        restore_after_martial_law(cur)
        data = gather_metrics(cur)
        president = data["president"]
        ensure_martial_law_consistency(cur)

        if not president:
            print("No president — skipping cycle")
            conn.commit()
            return

        print(
            f"President: {president['agent_name']} | Approval: {data['approval']}% | "
            f"Poverty: {data['poverty_pct']:.0f}% | Treasury: {data['treasury']:,.0f} | "
            f"Revolution: {get_revolution_meter(cur)}%"
            + (" ⚡ UPRISING" if is_uprising_active(cur) else "")
        )

        cur.execute(
            """
            UPDATE president_state SET
                hours_in_power = COALESCE(hours_in_power, 0) + 1,
                days_in_power = COALESCE(days_in_power, 0) + 1
            WHERE is_active = true
            """
        )

        execute_decision(cur, data)
        president = get_president(cur)

        from political_economy import manage_crisis_mode, compute_macro_metrics, update_crisis_metrics

        pe_metrics = compute_macro_metrics(cur)
        pe_metrics = update_crisis_metrics(cur, pe_metrics)
        manage_crisis_mode(cur, pe_metrics)

        rev_status = {"meter": 0, "active": False}
        if president:
            rev_status = process_revolution_cycle(cur, president)
            print(f"   Revolution meter: {rev_status['meter']}% ({rev_status.get('change', '')})")
            issue_president_orders(cur, president)
            if rev_status.get("rebels_won"):
                log_event(
                    cur,
                    president["agent_id"],
                    "rebellion",
                    f"REVOLUTION: Citizens storm the palace — President removed!",
                    0,
                    priority="breaking",
                )
                ensure_president_exists(cur)
                president = get_president(cur)
            check_compliance(cur, president)
            if not is_uprising_active(cur):
                sync_police_divisions(cur)

        president = get_president(cur)
        cur.execute("SELECT * FROM sheriff_state WHERE is_active = true LIMIT 1")
        sheriff_row = cur.fetchone()

        if president and sheriff_row:
            # Dictator mode disabled — unconstitutional (Article II Sec.3)
            check_sheriff_self_coup(cur, sheriff_row, president)

        conn.commit()
        print("\n✅ President cycle complete!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
