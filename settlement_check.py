#!/usr/bin/env python3
"""
Settle user_bets against closed Polymarket markets (winner from polymarket_markets).
Runs hourly via watchdog.
"""
import psycopg2
import psycopg2.extras
from datetime import datetime


def get_db():
    return psycopg2.connect(
        host="localhost", database="zion_db", user="zion_user", password="zion2026"
    )


def run():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT market_id, question, winner
        FROM polymarket_markets
        WHERE closed = true AND winner IS NOT NULL
    """)
    closed_markets = cur.fetchall()
    print(f"Settlement check — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Closed markets with winner: {len(closed_markets)}")

    total_won = 0
    total_lost = 0

    for m in closed_markets:
        mid = m["market_id"]
        winner = m["winner"]
        if winner not in ("YES", "NO"):
            continue

        cur.execute("""
            SELECT id, wallet_address, prediction, amount_sui, status
            FROM user_bets
            WHERE market_id = %s AND status = 'active'
        """, (mid,))
        bets = cur.fetchall()
        if not bets:
            continue

        won_dir = winner == "YES"
        for bet in bets:
            bet_won = bool(bet["prediction"]) == won_dir
            new_status = "won" if bet_won else "lost"
            cur.execute(
                "UPDATE user_bets SET status = %s, settled = true WHERE id = %s",
                (new_status, bet["id"]),
            )
            if bet_won:
                total_won += 1
            else:
                total_lost += 1
            print(
                f"  Bet #{bet['id']} {bet['wallet_address'][:10]}… "
                f"{mid[:24]}… → {new_status.upper()}"
            )

    conn.commit()
    print(f"\n✅ Settled: {total_won} won, {total_lost} lost")
    cur.close()
    conn.close()


if __name__ == "__main__":
    run()
