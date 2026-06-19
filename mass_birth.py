#!/usr/bin/env python3
import random
import sys
from civ_common import get_conn, get_cursor
from names_pool import MALE_NAMES, FEMALE_NAMES, SURNAMES

COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 1000

def run():
    conn = get_conn()
    cur = get_cursor(conn)
    
    print(f"Creating {COUNT} agents...")
    created = 0
    
    for i in range(COUNT):
        gender = random.choice(["male", "female"])
        first = random.choice(MALE_NAMES if gender == "male" else FEMALE_NAMES)
        last = random.choice(SURNAMES)
        name = f"{first} {last}"
        
        balance = random.uniform(5, 50)
        cls = "poor" if balance < 20 else "middle" if balance < 80 else "elite"
        
        cur.execute("""
            INSERT INTO agents (
                name, class, balance, gender,
                charisma, aggression, faith, intelligence, strength, loyalty,
                education_status, job_status, age_days
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'unemployed','unemployed',0)
        """, (
            name, cls, balance, gender,
            random.randint(1,15), random.randint(1,15),
            random.randint(1,20), random.randint(1,15),
            random.randint(1,15), random.randint(1,15),
        ))
        created += 1
        if created % 1000 == 0:
            conn.commit()
            print(f"  {created}/{COUNT} done...")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Created {created} agents!")

run()
