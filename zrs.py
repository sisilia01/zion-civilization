#!/usr/bin/env python3
"""ZION Reserve System (ZRS) — central bank, monetary policy, QE/QT."""
import random
from datetime import datetime

from civ_common import ensure_schema, economy_snapshot, get_conn, get_cursor, log_event

QE_CAP_PCT = 0.08  # max 8% of money supply per QE cycle


def cap_emission(cur, requested: float) -> float:
    """Prevent hyperinflation from uncapped QE."""
    cur.execute("SELECT COALESCE(SUM(balance), 0) AS total FROM agents WHERE is_alive = true")
    supply = float(cur.fetchone()["total"] or 1)
    cap = supply * QE_CAP_PCT
    if requested <= cap:
        return requested
    print(f"⚠️ QE capped: {requested:.0f} → {cap:.0f} ZION (8% of supply)")
    return cap


def determine_policy(econ, prev_mode, consecutive_crisis):
    avg = econ["avg_balance"]
    poor = econ["poverty_pct"]

    if avg > 200 or (econ.get("inflation_index", 0) > 150 and avg > 15):
        return "HYPERINFLATION", 20.0
    if avg > 15 and poor < 30:
        return "BOOM", 12.0
    if avg >= 8 and poor <= 50:
        return "NORMAL", 6.0
    if avg >= 5 and poor <= 65:
        return "RECESSION", 2.0
    if avg < 5 and poor > 65:
        if consecutive_crisis >= 2:
            return "DEPRESSION", 0.0
        return "CRISIS", 1.0
    if poor > 65:
        return "CRISIS", 1.0
    return "RECESSION", 2.0


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    ensure_schema(cur)
    conn.commit()

    print(f"\n🏦 ZION Reserve System — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)

    econ = economy_snapshot(cur)
    cur.execute("SELECT * FROM zrs_state WHERE id = 1")
    zrs = cur.fetchone()
    prev_mode = zrs.get("prev_policy_mode") or zrs.get("policy_mode") or "NORMAL"
    consecutive = int(zrs.get("consecutive_crisis") or 0)

    mode, rate = determine_policy(econ, prev_mode, consecutive)
    if mode == "CRISIS":
        consecutive += 1
    else:
        consecutive = 0

    tax_mod = 0.0
    loans_frozen = False
    action = "HOLD"
    amount = 0.0

    if mode == "BOOM":
        tax_mod = 2.0
        action = "TIGHTEN"
    elif mode == "RECESSION":
        tax_mod = -2.0
        injected = 0.0
        cur.execute(
            """
            UPDATE agents SET balance = balance + 2
            WHERE is_alive = true AND (balance < 10 OR class IN ('poor','critical'))
            """
        )
        cur.execute(
            "SELECT COUNT(*) AS c FROM agents WHERE is_alive = true AND balance < 10"
        )
        n = int(cur.fetchone()["c"] or 0)
        injected = n * 2.0
        amount = injected
        action = "STIMULUS_POOR"
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS RECESSION: Injected 2 ZION to {n} poor agents. Rate {rate}%",
            injected,
            priority="urgent",
        )
    elif mode == "CRISIS":
        per_agent = 3.0
        raw_amount = per_agent * econ["total"]
        cur.execute("SELECT COUNT(*) AS c FROM corporations WHERE is_active = true")
        corp_n = int(cur.fetchone()["c"] or 0)
        raw_amount += corp_n * 500
        amount = cap_emission(cur, raw_amount)
        scale = amount / raw_amount if raw_amount > 0 else 1.0
        per_agent *= scale
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE is_alive = true",
            (per_agent,),
        )
        if corp_n > 0 and scale > 0:
            corp_bailout = round(500 * scale, 2)
            cur.execute(
                "UPDATE corporations SET treasury = treasury + %s WHERE is_active = true",
                (corp_bailout,),
            )
        action = "QE"
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS CRISIS QE: +{per_agent} ZION per agent ({econ['total']}), "
            f"+500 ZION bailout per corp ({corp_n})",
            amount,
            priority="breaking",
        )
    elif mode == "DEPRESSION":
        per_agent = 10.0
        raw_amount = per_agent * econ["total"]
        amount = cap_emission(cur, raw_amount)
        scale = amount / raw_amount if raw_amount > 0 else 1.0
        per_agent = round(10.0 * scale, 4)
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE is_alive = true",
            (per_agent,),
        )
        rate = 0.0
        action = "MEGA_QE"
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS DEPRESSION MEGA QE: +{per_agent} ZION per agent! 0% loans. Mass stimulus.",
            amount,
            priority="breaking",
        )
    elif mode == "HYPERINFLATION":
        tax_mod = 20.0
        loans_frozen = True
        action = "EMERGENCY"
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS HYPERINFLATION ALERT! Emergency tax +20%, corp loans frozen. "
            f"Avg balance {econ['avg_balance']:.1f} ZION",
            0,
            priority="breaking",
        )
    elif mode == "NORMAL":
        # Stability grant when poverty elevated — prevents slow deflation spiral
        if econ["poverty_pct"] > 42:
            cur.execute(
                """
                UPDATE agents SET balance = balance + 1
                WHERE is_alive = true AND balance < 12
                """
            )
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM agents
                WHERE is_alive = true AND balance < 12
                """
            )
            n = int(cur.fetchone()["c"] or 0)
            amount = float(n)
            action = "STABILITY_GRANT"
            log_event(
                cur,
                None,
                "zrs",
                f"ZRS NORMAL stability: +1 ZION to {n} agents below 12 balance "
                f"(poverty {econ['poverty_pct']:.0f}%)",
                amount,
                priority="normal",
            )
        else:
            log_event(
                cur,
                None,
                "zrs",
                f"ZRS: Economy NORMAL. Rate {rate}%. Avg {econ['avg_balance']:.1f} ZION, "
                f"poverty {econ['poverty_pct']:.0f}%",
                0,
                priority="normal",
            )

    if mode != prev_mode:
        log_event(
            cur,
            None,
            "zrs",
            f"ZRS STATE CHANGE: {prev_mode} → {mode}. Interest rate {rate}%",
            amount,
            priority="breaking",
        )

    cur.execute(
        """
        UPDATE zrs_state SET
            policy_mode = %s, prev_policy_mode = %s, interest_rate = %s,
            tax_modifier = %s, loans_frozen = %s, consecutive_crisis = %s,
            updated_at = NOW()
        WHERE id = 1
        """,
        (mode, prev_mode, rate, tax_mod, loans_frozen, consecutive),
    )

    news_headline = (
        f"ZRS {mode}: {action} — interest {rate}%, "
        f"avg balance {econ['avg_balance']:.1f} ZION, poverty {econ['poverty_pct']:.0f}%"
    )
    if mode != prev_mode:
        news_headline = f"STATE CHANGE {prev_mode} → {mode}: " + news_headline

    cur.execute(
        """
        INSERT INTO zrs_policy (
            state, avg_balance, poverty_pct, corp_treasury_total,
            inflation_index, interest_rate, action_taken, amount, news_headline,
            policy_mode, poor_pct, total_money
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            mode,
            round(econ["avg_balance"], 2),
            round(econ["poverty_pct"], 2),
            round(econ["corp_treasury_total"], 2),
            econ["inflation_index"],
            rate,
            action,
            round(amount, 2),
            news_headline,
            mode,
            round(econ["poverty_pct"], 2),
            round(econ["total_money"], 2),
        ),
    )

    conn.commit()
    print(f"Mode: {mode} | Rate: {rate}% | Action: {action} | Amount: {amount:.0f}")
    print(f"Avg balance: {econ['avg_balance']:.1f} | Poverty: {econ['poverty_pct']:.0f}%")
    print("✅ ZRS cycle complete!\n")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
