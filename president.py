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
from amendment_enforcer import adjust_param_cur, get_param
from constitutional_duties import (
    get_party_policy,
    normalize_president_party,
    pick_party_weighted_action,
    tag_party_event,
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
        WHERE is_alive = true AND balance < 500
        AND id IN (
            SELECT id FROM agents WHERE is_alive=true AND balance < 500
            ORDER BY balance ASC LIMIT 5000
        )
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
        tag_party_event(
            f"President {president['agent_name']} gave {total:.0f} ZION to poorest {affected} agents "
            f"({amount_per_agent:.1f} each; fund={from_fund:.0f}, zrs={from_zrs:.0f})",
            _president_party(president),
        ),
        total,
    )
    return True


def _president_party(president: dict | None) -> str:
    if not president:
        return "reform"
    return normalize_president_party(president.get("party"))


def _log_president_event(cur, president: dict, description: str, amount=0, priority="normal"):
    party = _president_party(president)
    log_event(
        cur,
        president["agent_id"],
        "president",
        tag_party_event(description, party),
        amount,
        priority=priority,
    )


def decide_action(cur, data: dict) -> str:
    president = data.get("president") or {}
    party = _president_party(president)
    poverty = float(data.get("poverty_pct") or 0)
    gang_overrun = data["gang_strength_total"] > data["police_count"] * 20

    ai_decision = get_latest_ai_decision(cur, "president")
    ai_action = ai_decision.get("action", "")

    indicators = {
        "unemployment_rate": float(data.get("unemployment_rate") or 0),
        "poverty_pct": poverty,
        "corruption_index": float(data.get("corruption_index") or 0),
        "gini_coefficient": float(data.get("gini_coefficient") or 0),
        "gang_overrun": gang_overrun,
    }

    if party == "reform" and poverty > 50:
        return "GIVE_MONEY_TO_POOR"

    _, action = pick_party_weighted_action(party, indicators, ai_action)

    if ai_action and ai_action != "do_nothing":
        print(
            f"President [{party.upper()}] influenced by AI ({ai_action}): "
            f"{ai_decision.get('reasoning', '')[:80]}"
        )

    if data["treasury"] <= 0 and action in ("STIMULUS", "GIVE_MONEY_TO_POOR", "FUND_RESEARCH"):
        return "FUND_POLICE" if party == "consensus" else "PROPOSE_AMENDMENT"

    print(f"President [{party.upper()}] party-weighted decision → {action}")
    return action


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

    unemployment_rate = 0.0
    gini_coefficient = 0.0
    try:
        from civ_economics import fetch_economic_indicators

        econ = fetch_economic_indicators(cur)
        unemployment_rate = float(econ.get("unemployment_rate") or 0)
        gini_coefficient = float(econ.get("gini_coefficient") or 0)
    except Exception:
        cur.execute(
            """
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE employer_corp_id IS NULL) AS unemployed
            FROM agents WHERE is_alive = true
            """
        )
        emp = cur.fetchone() or {}
        total_agents = max(int(emp.get("total") or total), 1)
        unemployed = int(emp.get("unemployed") or 0)
        unemployment_rate = unemployed / total_agents * 100

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
        "unemployment_rate": unemployment_rate,
        "gini_coefficient": gini_coefficient,
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

    action_key = (action or "").upper()
    if action_key == "MARTIAL_LAW" or (action or "").lower() == "martial_law":
        _log_president_event(
            cur,
            pres,
            f"BLOCKED: President {pname} attempted martial law — blocked by Constitution (Article II Sec.3)",
            priority="normal",
        )
        return "blocked"

    party = _president_party(pres)

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
        _log_president_event(
            cur,
            pres,
            f"ANTI-CORRUPTION DRIVE: President {pname} purges corrupt officials! Approval +15",
            priority="urgent",
        )
    elif action == "STIMULUS":
        if party == "consensus" and data["treasury"] > 0:
            spend = min(200.0, float(data["treasury"]) * 0.2)
            cur.execute(
                """
                UPDATE corporations SET treasury = treasury + %s
                WHERE is_active=true AND treasury < 500
                """,
                (spend,),
            )
            cur.execute(
                """
                UPDATE president_state SET personal_fund = personal_fund - %s
                WHERE is_active = true AND personal_fund >= %s
                """,
                (spend, spend),
            )
            if cur.rowcount:
                _log_president_event(
                    cur,
                    pres,
                    f"STIMULUS: President {pname} injected {spend:.0f} ZION into struggling corporations",
                    spend,
                    priority="urgent",
                )
            else:
                action = "FUND_POLICE"
        else:
            from civ_common import debit_personal_fund_pay_agents

            if data["treasury"] <= 0:
                if party == "reform" and action_give_money_to_poor(cur, pres):
                    action = "GIVE_MONEY_TO_POOR"
                else:
                    action = "FUND_POLICE" if party == "consensus" else "PROPOSE_AMENDMENT"
            else:
                n_paid, total_paid = debit_personal_fund_pay_agents(
                    cur,
                    STIMULUS_AMOUNT,
                    "is_alive = true AND balance < 500" if party == "reform" else "is_alive = true AND balance < 10",
                )
                if n_paid == 0:
                    if party == "reform" and action_give_money_to_poor(cur, pres):
                        action = "GIVE_MONEY_TO_POOR"
                    else:
                        action = "FUND_POLICE" if party == "consensus" else "PROPOSE_AMENDMENT"
                else:
                    insert_active_effect(
                        cur, "stimulus", 24, poverty_modifier=-0.15,
                        metadata={"amount": STIMULUS_AMOUNT, "source": "president"},
                    )
                    apply_stimulus_revolution_bonus(cur)
                    _log_president_event(
                        cur,
                        pres,
                        f"STIMULUS: President {pname} gave {STIMULUS_AMOUNT:.0f} ZION to {n_paid} agents ({total_paid:.0f} from personal fund)",
                        total_paid,
                        priority="urgent",
                    )
    elif action == "GIVE_MONEY_TO_POOR":
        if party == "consensus":
            action = "STIMULUS"
            if data["treasury"] > 0:
                cur.execute(
                    """
                    UPDATE corporations SET treasury = treasury + %s
                    WHERE is_active=true AND treasury < 500
                    """,
                    (min(200.0, float(data["treasury"]) * 0.2),),
                )
                cur.execute(
                    """
                    UPDATE president_state SET personal_fund = personal_fund - %s
                    WHERE is_active = true AND personal_fund >= %s
                    """,
                    (min(200.0, float(data["treasury"]) * 0.2), min(200.0, float(data["treasury"]) * 0.2)),
                )
                _log_president_event(
                    cur,
                    pres,
                    f"STIMULUS: President {pname} injected ZION into struggling corporations (no direct welfare)",
                    min(200.0, float(data["treasury"]) * 0.2),
                    priority="urgent",
                )
            else:
                action = "FUND_POLICE"
        elif not action_give_money_to_poor(cur, pres):
            action = "FUND_POLICE"
    elif action == "NATIONALIZE_CORPS":
        nationalize_bankrupt_corps(cur, pres)
    elif action == "INVESTIGATE_SHERIFF":
        rate = data["sheriff_compliance_metrics"]["compliance_rate"]
        log_event(
            cur,
            pid,
            "sheriff_action",
            f"President {pname} investigates Sheriff — compliance {rate:.0f}% (24h orders)",
            0,
            priority="urgent",
        )
    elif action == "TAX_CHANGE":
        if party == "consensus":
            new_rate = adjust_param_cur(cur, "top_tax_rate", -0.02)
            cur.execute(
                """
                UPDATE president_state
                SET tax_relief_until = NOW() + INTERVAL '24 hours'
                WHERE is_active = true
                """
            )
            _log_president_event(
                cur,
                pres,
                f"TAX CUT: President {pname} lowered top_tax_rate to {new_rate:.2f} (-0.02)",
                priority="urgent",
            )
        else:
            new_rate = adjust_param_cur(cur, "top_tax_rate", 0.02)
            _log_president_event(
                cur,
                pres,
                f"TAX HIKE: President {pname} raised top_tax_rate to {new_rate:.2f} (+0.02) to fund social programs",
                priority="urgent",
            )
    elif action == "PROPOSE_AMENDMENT":
        if party == "consensus":
            title = "Corporate Deregulation and Tax Relief Act"
            desc = "Reduce top tax rate and corporate regulation to stimulate hiring."
            change_type = "deregulation"
        else:
            title = "Wealth Tax and Basic Income Act"
            desc = "Introduce wealth tax, basic income for unemployed, and education funding."
            change_type = "redistribution"
        try:
            from amendments import propose_amendment

            aid = propose_amendment(title, desc, change_type, proposed_by="president")
            if aid:
                _log_president_event(
                    cur,
                    pres,
                    f"AMENDMENT PROPOSED #{aid}: {title}",
                    priority="urgent",
                )
            else:
                _log_president_event(cur, pres, f"AMENDMENT pending — {title} already in queue")
        except Exception as exc:
            _log_president_event(cur, pres, f"Amendment proposal failed: {exc}")
    elif action == "FUND_RESEARCH":
        spend = min(150.0, float(data["treasury"]) * 0.15)
        if spend > 0:
            cur.execute(
                """
                UPDATE president_state SET personal_fund = personal_fund - %s
                WHERE is_active = true AND personal_fund >= %s
                """,
                (spend, spend),
            )
            if cur.rowcount:
                _log_president_event(
                    cur,
                    pres,
                    f"RESEARCH FUNDING: President {pname} allocated {spend:.0f} ZION to ZION Academy",
                    spend,
                    priority="urgent",
                )
            else:
                action = "PROPOSE_AMENDMENT"
        else:
            action = "PROPOSE_AMENDMENT"
    elif action == "POPULISM":
        cur.execute(
            """
            UPDATE president_state SET
                approval_rating = LEAST(100, approval_rating + 25),
                tax_relief_until = NOW() + INTERVAL '48 hours'
            WHERE is_active = true
            """
        )
        _log_president_event(
            cur,
            pres,
            f"POPULISM: President {pname} cancels taxes 48h! Approval +25",
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
        _log_president_event(
            cur,
            pres,
            f"TAX RELIEF: President {pname} cuts poor/critical tax by 50% for 24h",
            priority="urgent",
        )
    elif action == "FUND_POLICE":
        police_transfer = POLICE_TRANSFER + float(get_param("police_funding_bonus", 0.0))
        cur.execute(
            """
            UPDATE president_state SET personal_fund = personal_fund - %s
            WHERE is_active = true AND personal_fund >= %s
            """,
            (police_transfer, police_transfer),
        )
        if cur.rowcount > 0:
            cur.execute(
                """
                UPDATE sheriff_state SET police_budget = police_budget + %s
                WHERE is_active = true
                """,
                (police_transfer,),
            )
            _log_president_event(
                cur,
                pres,
                f"President {pname} transferred {police_transfer:.0f} ZION to police budget",
                police_transfer,
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
    """Fill vacant office via presidential election (senator nominees + popular class vote)."""
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
