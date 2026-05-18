#!/usr/bin/env python3
"""
ZION Corporations — sectors, ZRS loans, clan rackets, sabotage, lobbying
"""
import psycopg2
import psycopg2.extras
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026",
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

SECTORS = {
    "tech": {
        "names": ["NeoCore Systems", "ZionTech Labs", "Cipher Dynamics", "Pulse Networks"],
        "emoji": "💻",
        "base_price": 12.0,
    },
    "agro": {
        "names": ["GreenHarvest Co", "Dust Fields Ltd", "AquaGrow Union", "SunRoot Farms"],
        "emoji": "🌾",
        "base_price": 8.0,
    },
    "military": {
        "names": ["Ironclad Defense", "Shadow Arsenal", "Vault Armory", "Crimson Shield"],
        "emoji": "⚔️",
        "base_price": 15.0,
    },
    "pharma": {
        "names": ["Helix Biotech", "VitaCure Group", "NeuroMed Labs", "PureLife Pharma"],
        "emoji": "💊",
        "base_price": 14.0,
    },
    "media": {
        "names": ["Neon Broadcast", "TruthWire Media", "Echo Syndicate", "Signal Press"],
        "emoji": "📡",
        "base_price": 10.0,
    },
}

MAX_CORPS = 10
MAX_PER_SECTOR = 2
MAX_ACTIVE_LOANS = 3
MAX_LOAN_AMOUNT = 4000.0
LOAN_DUE_CYCLES = 7
LOAN_INTEREST = 1.10
BANKRUPTCY_THRESHOLD = 20.0
POLICE_HIRE_COST = 75.0


def log_event(cur, agent_id, event_type, description, amount=0):
    cur.execute(
        """
        INSERT INTO events (agent_id, event_type, description, zion_amount)
        VALUES (%s, %s, %s, %s)
        """,
        (agent_id, event_type, description, amount),
    )


def ensure_tables(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS corporations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            corp_type VARCHAR(50),
            owner_id INTEGER REFERENCES agents(id),
            treasury NUMERIC(20,2) DEFAULT 0,
            employees INTEGER DEFAULT 0,
            revenue NUMERIC(20,2) DEFAULT 0,
            market_share NUMERIC(8,4) DEFAULT 0.5,
            police_protection BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            founded_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS zrs_loans (
            id SERIAL PRIMARY KEY,
            corp_id INTEGER REFERENCES corporations(id),
            corp_name VARCHAR(100),
            principal NUMERIC(20,2) NOT NULL,
            amount_owed NUMERIC(20,2) NOT NULL,
            issued_cycle INTEGER NOT NULL,
            due_cycle INTEGER NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS corporation_meta (
            id INTEGER PRIMARY KEY DEFAULT 1,
            cycle INTEGER DEFAULT 0
        )
        """
    )
    cur.execute("INSERT INTO corporation_meta (id, cycle) VALUES (1, 0) ON CONFLICT (id) DO NOTHING")

    for col, typedef in [
        ("market_share", "NUMERIC(8,4) DEFAULT 0.5"),
        ("police_protection", "BOOLEAN DEFAULT false"),
    ]:
        try:
            cur.execute(f"ALTER TABLE corporations ADD COLUMN IF NOT EXISTS {col} {typedef}")
        except Exception:
            pass


def get_cycle(cur):
    cur.execute(
        """
        UPDATE corporation_meta SET cycle = cycle + 1 WHERE id = 1 RETURNING cycle
        """
    )
    row = cur.fetchone()
    return int(row["cycle"]) if row else 1


def spawn_corps(cur):
    cur.execute("SELECT COUNT(*) AS cnt FROM corporations WHERE is_active = true")
    total = int(cur.fetchone()["cnt"])
    if total >= MAX_CORPS:
        print(f"🏢 Spawn skipped — {total}/{MAX_CORPS} corps active")
        return 0

    cur.execute(
        """
        SELECT name FROM corporations WHERE is_active = true
        """
    )
    used_names = {r["name"] for r in cur.fetchall()}
    spawned = 0

    for sector, info in SECTORS.items():
        cur.execute(
            """
            SELECT COUNT(*) AS cnt FROM corporations
            WHERE is_active = true AND corp_type = %s
            """,
            (sector,),
        )
        sector_count = int(cur.fetchone()["cnt"])

        available = [n for n in info["names"] if n not in used_names]
        random.shuffle(available)

        while sector_count < MAX_PER_SECTOR and total < MAX_CORPS and available:
            name = available.pop()
            used_names.add(name)

            cur.execute(
                """
                SELECT id, name, balance FROM agents
                WHERE is_alive = true AND class = 'elite' AND balance > 150
                AND id NOT IN (
                    SELECT owner_id FROM corporations
                    WHERE is_active = true AND owner_id IS NOT NULL
                )
                ORDER BY balance DESC LIMIT 1
                """
            )
            founder = cur.fetchone()
            owner_id = None
            seed = round(random.uniform(120, 280), 2)

            if founder:
                owner_id = founder["id"]
                investment = min(seed, float(founder["balance"]) * 0.25)
                seed = round(investment, 2)
                cur.execute(
                    "UPDATE agents SET balance = balance - %s WHERE id = %s",
                    (seed, founder["id"]),
                )

            cur.execute(
                """
                INSERT INTO corporations (name, corp_type, owner_id, treasury, employees, market_share)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (name, sector, owner_id, seed, random.randint(1, 4), round(1.0 / MAX_PER_SECTOR, 4)),
            )
            corp_id = cur.fetchone()["id"]

            if owner_id:
                log_event(
                    cur,
                    owner_id,
                    "corporation",
                    f"{info['emoji']} {founder['name']} founded {name} ({sector}) with {seed:.0f} ZION",
                    seed,
                )
                print(f"{info['emoji']} Founded {name} ({sector}) — owner invested {seed:.0f} ZION")
            else:
                print(f"{info['emoji']} Spawned {name} ({sector}) — treasury {seed:.0f} ZION")

            spawned += 1
            sector_count += 1
            total += 1

    return spawned


def generate_revenue(cur):
    cur.execute(
        """
        SELECT id, name, corp_type, employees, treasury, market_share
        FROM corporations WHERE is_active = true
        """
    )
    corps = cur.fetchall()
    if not corps:
        return

    by_sector = {}
    for corp in corps:
        by_sector.setdefault(corp["corp_type"], []).append(corp)

    for sector, sector_corps in by_sector.items():
        info = SECTORS.get(sector, {"base_price": 10.0, "emoji": "🏢"})
        total_employees = sum(int(c["employees"] or 0) for c in sector_corps) or 1

        for corp in sector_corps:
            employees = int(corp["employees"] or 0)
            if employees <= 0:
                continue

            share = employees / total_employees
            price = float(info["base_price"])
            revenue = round(employees * price * share * random.uniform(0.85, 1.15), 2)

            cur.execute(
                """
                UPDATE corporations
                SET treasury = treasury + %s,
                    revenue = revenue + %s,
                    market_share = %s
                WHERE id = %s
                """,
                (revenue, revenue, round(share, 4), corp["id"]),
            )
            print(f"{info['emoji']} {corp['name']}: +{revenue:.1f} ZION (share {share*100:.0f}%)")


def hire_workers(cur):
    cur.execute(
        """
        SELECT id, name, treasury, employees FROM corporations
        WHERE is_active = true AND treasury > 40
        ORDER BY RANDOM() LIMIT 5
        """
    )
    corps = cur.fetchall()

    for corp in corps:
        cur.execute(
            """
            SELECT id, name, class FROM agents
            WHERE is_alive = true AND class IN ('poor', 'middle')
            ORDER BY RANDOM() LIMIT 2
            """
        )
        workers = cur.fetchall()
        if not workers:
            continue

        for worker in workers:
            salary = round(random.uniform(6, 18), 2)
            cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
            treasury = float(cur.fetchone()["treasury"])
            if treasury < salary:
                break

            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (salary, worker["id"]),
            )
            cur.execute(
                """
                UPDATE corporations
                SET treasury = treasury - %s, employees = employees + 1
                WHERE id = %s
                """,
                (salary, corp["id"]),
            )
            log_event(
                cur,
                worker["id"],
                "corporation",
                f"💼 {worker['name']} hired by {corp['name']}! Salary: {salary:.1f} ZION",
                salary,
            )
            print(f"💼 {corp['name']} hired {worker['name']} — {salary:.1f} ZION")


def zrs_loan(cur, cycle):
    cur.execute("SELECT COUNT(*) AS cnt FROM zrs_loans WHERE is_active = true")
    active_loans = int(cur.fetchone()["cnt"])
    slots = MAX_ACTIVE_LOANS - active_loans
    if slots <= 0:
        print("🏦 ZRS: max active loans reached (3)")
        return

    cur.execute(
        """
        SELECT id, name, treasury, employees FROM corporations
        WHERE is_active = true AND treasury < 150 AND employees > 0
        AND id NOT IN (SELECT corp_id FROM zrs_loans WHERE is_active = true AND corp_id IS NOT NULL)
        ORDER BY treasury ASC, RANDOM()
        LIMIT %s
        """,
        (slots,),
    )
    needy = cur.fetchall()

    for corp in needy:
        principal = round(min(MAX_LOAN_AMOUNT, random.uniform(800, 3200)), 2)
        amount_owed = round(principal * LOAN_INTEREST, 2)
        due_cycle = cycle + LOAN_DUE_CYCLES

        cur.execute(
            """
            INSERT INTO zrs_loans (corp_id, corp_name, principal, amount_owed, issued_cycle, due_cycle)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (corp["id"], corp["name"], principal, amount_owed, cycle, due_cycle),
        )
        cur.execute(
            "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
            (principal, corp["id"]),
        )
        cur.execute(
            "UPDATE state_treasury SET zrs_fund = GREATEST(0, zrs_fund - %s)",
            (principal,),
        )
        log_event(
            cur,
            None,
            "corporation",
            f"🏦 ZRS loaned {corp['name']} {principal:.0f} ZION (due cycle {due_cycle}, owe {amount_owed:.0f})",
            principal,
        )
        print(f"🏦 ZRS loan → {corp['name']}: {principal:.0f} ZION, due cycle {due_cycle}")


def repay_loans(cur, cycle):
    cur.execute(
        """
        SELECT l.id, l.corp_id, l.corp_name, l.amount_owed, c.treasury, c.owner_id
        FROM zrs_loans l
        JOIN corporations c ON c.id = l.corp_id
        WHERE l.is_active = true AND l.due_cycle <= %s
        """,
        (cycle,),
    )
    due_loans = cur.fetchall()

    for loan in due_loans:
        treasury = float(loan["treasury"] or 0)
        owed = float(loan["amount_owed"])

        if treasury >= owed:
            cur.execute(
                "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                (owed, loan["corp_id"]),
            )
            cur.execute(
                "UPDATE state_treasury SET zrs_fund = zrs_fund + %s",
                (owed,),
            )
            cur.execute("UPDATE zrs_loans SET is_active = false WHERE id = %s", (loan["id"],))
            log_event(
                cur,
                loan["owner_id"],
                "corporation",
                f"✅ {loan['corp_name']} repaid ZRS loan {owed:.0f} ZION",
                owed,
            )
            print(f"✅ {loan['corp_name']} repaid ZRS loan {owed:.0f} ZION")
        else:
            cur.execute("UPDATE corporations SET is_active = false WHERE id = %s", (loan["corp_id"],))
            cur.execute("UPDATE zrs_loans SET is_active = false WHERE id = %s", (loan["id"],))
            cur.execute(
                "UPDATE state_treasury SET zrs_fund = zrs_fund + %s",
                (owed * 0.3,),
            )
            log_event(
                cur,
                loan["owner_id"],
                "corporation",
                f"💥 {loan['corp_name']} BANKRUPT — could not repay ZRS loan ({owed:.0f} ZION)",
                0,
            )
            print(f"💥 {loan['corp_name']} bankrupt — failed to repay {owed:.0f} ZION loan")


def clan_racket(cur):
    cur.execute(
        """
        UPDATE corporations SET police_protection = false
        WHERE is_active = true AND police_protection = true
        """
    )

    cur.execute(
        """
        SELECT id, name, treasury, police_protection, owner_id
        FROM corporations WHERE is_active = true AND treasury > 30
        ORDER BY RANDOM() LIMIT 6
        """
    )
    corps = cur.fetchall()

    cur.execute(
        """
        SELECT id, name, treasury FROM clans
        WHERE members_count > 0 AND treasury > 0
        ORDER BY RANDOM()
        """
    )
    clans = cur.fetchall()
    if not clans:
        return

    for corp in corps:
        treasury = float(corp["treasury"])

        if treasury >= POLICE_HIRE_COST and random.random() < 0.35:
            cur.execute(
                """
                UPDATE corporations
                SET treasury = treasury - %s, police_protection = true
                WHERE id = %s
                """,
                (POLICE_HIRE_COST, corp["id"]),
            )
            cur.execute(
                "UPDATE state_treasury SET police_fund = police_fund + %s",
                (POLICE_HIRE_COST,),
            )
            log_event(
                cur,
                corp["owner_id"],
                "corporation",
                f"🚔 {corp['name']} hired police protection ({POLICE_HIRE_COST:.0f} ZION)",
                POLICE_HIRE_COST,
            )
            print(f"🚔 {corp['name']} hired police — racket immunity this cycle")
            continue

        cur.execute("SELECT police_protection FROM corporations WHERE id = %s", (corp["id"],))
        if cur.fetchone()["police_protection"]:
            continue

        clan = random.choice(clans)
        pct = random.uniform(0.05, 0.15)
        extorted = round(treasury * pct, 2)
        if extorted < 1:
            continue

        cur.execute(
            "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
            (extorted, corp["id"]),
        )
        cur.execute(
            "UPDATE clans SET treasury = treasury + %s WHERE id = %s",
            (extorted, clan["id"]),
        )
        log_event(
            cur,
            None,
            "corporation",
            f"⚔️ Clan {clan['name']} extorted {corp['name']} for {extorted:.1f} ZION ({pct*100:.0f}%)",
            extorted,
        )
        print(f"⚔️ {clan['name']} racket → {corp['name']}: -{extorted:.1f} ZION")


def lobby(cur):
    cur.execute(
        """
        SELECT id, name, treasury, owner_id FROM corporations
        WHERE is_active = true AND treasury > 200
        ORDER BY treasury DESC LIMIT 3
        """
    )
    corps = cur.fetchall()

    for corp in corps:
        cur.execute(
            """
            SELECT id, name FROM agents
            WHERE is_alive = true AND class = 'elite'
            ORDER BY RANDOM() LIMIT 5
            """
        )
        elites = cur.fetchall()
        if not elites:
            continue

        bribes = 0
        for elite in elites:
            bribe = 3.0
            cur.execute("SELECT treasury FROM corporations WHERE id = %s", (corp["id"],))
            if float(cur.fetchone()["treasury"]) < bribe:
                break

            cur.execute(
                "UPDATE corporations SET treasury = treasury - %s WHERE id = %s",
                (bribe, corp["id"]),
            )
            cur.execute(
                "UPDATE agents SET balance = balance + %s WHERE id = %s",
                (bribe, elite["id"]),
            )
            bribes += 1

        if bribes:
            log_event(
                cur,
                corp["owner_id"],
                "corporation",
                f"🗳️ {corp['name']} lobbied {bribes} elite voters (+3 ZION each)",
                bribes * 3,
            )
            print(f"🗳️ {corp['name']} bribed {bribes} elites (+3 ZION each)")


def sabotage(cur):
    for sector, info in SECTORS.items():
        cur.execute(
            """
            SELECT id, name, treasury FROM corporations
            WHERE is_active = true AND corp_type = %s
            """,
            (sector,),
        )
        rivals = cur.fetchall()
        if len(rivals) < 2:
            continue

        if random.random() > 0.15:
            continue

        attacker, victim = random.sample(rivals, 2)
        treasury = float(victim["treasury"])
        if treasury < 10:
            continue

        damage = round(treasury * random.uniform(0.10, 0.25), 2)
        cur.execute(
            "UPDATE corporations SET treasury = GREATEST(0, treasury - %s) WHERE id = %s",
            (damage, victim["id"]),
        )
        cur.execute(
            "UPDATE corporations SET treasury = treasury + %s WHERE id = %s",
            (round(damage * 0.4, 2), attacker["id"]),
        )
        log_event(
            cur,
            None,
            "corporation",
            f"{info['emoji']} {attacker['name']} sabotaged {victim['name']}! -{damage:.1f} ZION",
            damage,
        )
        print(f"{info['emoji']} SABOTAGE: {attacker['name']} hit {victim['name']} (-{damage:.1f} ZION)")


def bankruptcy_check(cur):
    cur.execute(
        """
        SELECT c.id, c.name, c.owner_id, a.name AS owner_name
        FROM corporations c
        LEFT JOIN agents a ON a.id = c.owner_id
        WHERE c.is_active = true AND c.treasury < %s
        """,
        (BANKRUPTCY_THRESHOLD,),
    )
    bankrupt = cur.fetchall()

    for corp in bankrupt:
        cur.execute("UPDATE corporations SET is_active = false WHERE id = %s", (corp["id"],))
        cur.execute(
            "UPDATE zrs_loans SET is_active = false WHERE corp_id = %s AND is_active = true",
            (corp["id"],),
        )
        owner = corp["owner_name"] or "unknown"
        log_event(
            cur,
            corp["owner_id"],
            "corporation",
            f"💥 {corp['name']} went BANKRUPT! Owner {owner} lost the company",
            0,
        )
        print(f"💥 {corp['name']} bankrupt (treasury < {BANKRUPTCY_THRESHOLD:.0f} ZION)")


def stats(cur):
    cur.execute(
        """
        SELECT name, corp_type, employees, treasury, revenue, market_share, police_protection
        FROM corporations WHERE is_active = true
        ORDER BY treasury DESC
        """
    )
    rows = cur.fetchall()
    print("\n📊 ACTIVE CORPORATIONS")
    print("-" * 72)
    if not rows:
        print("  (none)")
        return
    for r in rows:
        sector = SECTORS.get(r["corp_type"], {})
        emoji = sector.get("emoji", "🏢")
        prot = "🚔" if r["police_protection"] else "  "
        print(
            f"  {emoji} {r['name']:<22} {r['corp_type']:<8} "
            f"emp={r['employees']:>3}  treasury={float(r['treasury']):>8.0f}  "
            f"rev={float(r['revenue']):>8.0f}  share={float(r['market_share'])*100:>4.0f}% {prot}"
        )
    print("-" * 72)
    print(f"  Total active: {len(rows)}")


def main():
    print(f"\n🏢 ZION Corporations — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    try:
        ensure_tables(cur)
        conn.commit()

        cycle = get_cycle(cur)
        print(f"📅 Cycle: {cycle}")

        spawned = spawn_corps(cur)
        if spawned:
            print(f"🆕 Spawned {spawned} new corporation(s)")

        generate_revenue(cur)
        hire_workers(cur)
        zrs_loan(cur, cycle)
        repay_loans(cur, cycle)
        clan_racket(cur)
        lobby(cur)
        sabotage(cur)
        bankruptcy_check(cur)
        stats(cur)

        conn.commit()
        print("\n✅ Corporations cycle complete!")
    except Exception as e:
        print(f"❌ Error: {e}")
        conn.rollback()
        import traceback

        traceback.print_exc()
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
