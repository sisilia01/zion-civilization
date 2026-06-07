#!/usr/bin/env python3
"""
ZION Market — resource prices and elite trading.
Food/hunger is handled exclusively by tax_cron.py (no duplicate food charges here).
"""
import random
from datetime import datetime

from civ_common import get_conn, get_cursor, log_event, zrs_deduct_reserve


def ensure_market_table(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS market_prices (
            id SERIAL PRIMARY KEY,
            resource VARCHAR(50),
            price NUMERIC(10,2),
            recorded_at TIMESTAMP DEFAULT NOW()
        )
        """
    )


def get_inflation_multiplier(cur):
    """Calculate inflation based on average alive-agent balance."""
    cur.execute(
        "SELECT SUM(balance) AS total, COUNT(*) AS cnt FROM agents WHERE is_alive=true"
    )
    row = cur.fetchone()
    total_money = float(row["total"] or 0)
    alive = max(int(row["cnt"]), 1)
    avg_balance = total_money / alive

    if avg_balance < 10:
        return 0.7
    if avg_balance < 20:
        return 1.0
    if avg_balance < 50:
        return 1.3
    if avg_balance < 100:
        return 1.8
    if avg_balance < 200:
        return 2.5
    return 4.0


def update_prices(cur):
    """Record resource prices — informational for epidemics/UI; no food debits."""
    inflation = get_inflation_multiplier(cur)
    if inflation > 1.5:
        log_event(
            cur,
            None,
            "market",
            f"INFLATION ALERT! Prices x{inflation:.1f} — ZRS may need to act",
            0,
        )

    cur.execute(
        """
        SELECT SUM(treasury) AS total, SUM(employees) AS workers
        FROM corporations WHERE is_active=true AND corp_type='agro'
        """
    )
    agro = cur.fetchone()
    agro_power = float(agro["total"] or 0) + float(agro["workers"] or 0) * 10

    cur.execute(
        """
        SELECT SUM(treasury) AS total FROM corporations
        WHERE is_active=true AND corp_type='pharma'
        """
    )
    pharma = cur.fetchone()
    pharma_power = float(pharma["total"] or 0)

    cur.execute(
        """
        SELECT SUM(treasury) AS total FROM corporations
        WHERE is_active=true AND corp_type='military'
        """
    )
    military = cur.fetchone()
    military_power = float(military["total"] or 0)

    food_price = max(1, round(random.uniform(3, 20) * (1 - min(agro_power / 5000, 0.6)), 2))
    medicine_price = max(5, round(random.uniform(15, 60) * (1 - min(pharma_power / 3000, 0.5)), 2))
    weapons_price = max(
        10, round(random.uniform(20, 100) * (1 - min(military_power / 3000, 0.4)), 2)
    )

    resources = {
        "food": round(food_price * inflation, 2),
        "water": round(random.uniform(0.5, 8) * inflation, 2),
        "energy": round(random.uniform(2, 20) * inflation, 2),
        "medicine": round(medicine_price * inflation, 2),
        "weapons": round(weapons_price * inflation, 2),
    }
    for resource, price in resources.items():
        cur.execute(
            "INSERT INTO market_prices (resource, price) VALUES (%s, %s)",
            (resource, price),
        )

    print(
        f"Food index: {resources['food']:.1f} | Medicine: {resources['medicine']:.1f} | "
        f"Inflation: x{inflation:.1f} (food paid via tax_cron only)"
    )
    return resources


def trade_resources(cur, prices):
    """Elite traders earn ZRS-backed profits on resource markets."""
    cur.execute(
        """
        SELECT id, name, balance FROM agents
        WHERE is_alive = true AND class = 'elite' AND balance > 100
        ORDER BY RANDOM() LIMIT 5
        """
    )
    traders = cur.fetchall()
    for trader in traders:
        profit = round(random.uniform(5, 30), 2)
        if not zrs_deduct_reserve(cur, profit):
            continue
        cur.execute(
            "UPDATE agents SET balance = balance + %s WHERE id = %s",
            (profit, trader["id"]),
        )
        log_event(
            cur,
            trader["id"],
            "trade",
            f"{trader['name']} traded resources. Profit: {profit:.1f} ZION",
            profit,
        )
        print(f"{trader['name']} traded — profit {profit:.1f} ZION")


def run_market_cycle():
    conn = get_conn()
    cur = get_cursor(conn)
    print(f"\nZION Market — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 50)
    try:
        ensure_market_table(cur)
        conn.commit()
        prices = update_prices(cur)
        print(
            f"Prices: food={prices['food']:.1f} water={prices['water']:.1f} "
            f"energy={prices['energy']:.1f}"
        )
        trade_resources(cur, prices)
        conn.commit()
        print("\nMarket cycle complete!")
    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    from civ_common import run_db_script

    run_db_script(run_market_cycle, "Market cycle")
