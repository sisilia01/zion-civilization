import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

NAMES_ELITE = ["Kael", "Raze", "Dorn", "Vex", "Zorn", "Axel", "Drake", "Cain", "Nero", "Atlas", "Cyrus", "Magnus", "Orion", "Dante", "Victor", "Leon", "Marcus", "Adrian", "Dorian", "Evander", "Felix", "Gideon", "Hector", "Ivan", "Julius", "Kaspar", "Leander", "Maximus", "Nikolai", "Octavian", "Perseus", "Quintus", "Remus", "Silvius", "Titus", "Ulysses", "Valerian", "Wolfgang", "Xavier", "Zacharias", "Ares", "Brutus", "Cato", "Darius", "Emilio", "Fabian", "Gavril", "Harald", "Ignatius", "Jarvis", "Konrad", "Lucian", "Matteo", "Naveen", "Orlando", "Phineas", "Roland", "Stefan", "Theron", "Ulric", "Vincent", "Werner", "Yannick", "Zoltan"]
NAMES_MIDDLE = ["Vess", "Olan", "Mire", "Sera", "Lena", "Orin", "Tara", "Bram", "Aria", "Cleo", "Dana", "Elsa", "Faye", "Gaia", "Hana", "Iris", "Jana", "Kira", "Luna", "Maya", "Nora", "Opal", "Pita", "Rena", "Sana", "Tess", "Uma", "Vera", "Wren", "Xena", "Yuki", "Zara", "Abel", "Beck", "Cole", "Dean", "Evan", "Flynn", "Glen", "Hugo", "Ivor", "Joel", "Kurt", "Lars", "Marc", "Neil", "Owen", "Paul", "Reid", "Sean", "Troy"]
NAMES_POOR = ["Ash", "Grim", "Mox", "Finn", "Pip", "Wick", "Bex", "Cob", "Ace", "Bo", "Cal", "Dax", "Eli", "Fox", "Gio", "Hal", "Ike", "Jay", "Kai", "Lee", "Max", "Ned", "Oz", "Pat", "Ray", "Sam", "Ted", "Uri", "Val", "Walt", "Yul", "Zed", "Ada", "Bea", "Cay", "Dot", "Eve", "Flo", "Gay", "Ida", "Joy", "Kay", "Lou", "Mae", "Nan", "Ora", "Peg", "Rae", "Sue", "Una", "Viv"]

# Match genesis.py so births are "First Surname", not single-token names (avoids "Samira B" style tags).
SURNAMES_ELITE = [
    "Voltaire", "Blackwood", "Sterling", "Ashford", "Ravenswood", "Coldwell", "Stormborn", "Ironside",
    "Goldstein", "Castellan", "Drakon", "Vexlar", "Thornton", "Whitmore", "Blackstone",
    "Beaumont", "Harrington", "Windsor", "Pemberton", "Fairfax", "Lockwood", "Wyndham",
    "Sinclair", "Montague", "Everton", "Kingsley", "Mercer", "Aldrich", "Cromwell",
    "Voss", "Hartley", "Ashton", "Braxton", "Clayborne", "Devereux", "Ellsworth",
    "Falkner", "Grenville", "Hawkwood", "Ingram", "Jervais", "Kendrick", "Langford",
    "Maddox", "Nightingale", "Ormond", "Prescott", "Queensbury", "Redgrave", "Stanwick",
    "Tremont", "Ulrich", "Vanderburg", "Warwick", "Xerxes", "Yarborough", "Zephyr", "Acheron", "Borgia", "Czar", "Defoe", "Elric", "Faust", "Grimm", "Hexum", "Icarus", "Janus", "Kronos", "Lucius", "Moros", "Noctis", "Oberon", "Pluto", "Regulus", "Solus",
]

SURNAMES_MIDDLE = [
    "Parker", "Loginov", "Kapoor", "Tanaka", "Santos", "Mueller", "Okafor", "Nguyen",
    "Petrov", "Garcia", "Yamamoto", "Kowalski", "Mbeki", "Rossi", "Diallo",
    "Holloway", "Araujo", "Ekwueme", "Lindqvist", "Castellano", "Ferreira", "Nakamura",
    "Johansson", "Barbosa", "Kimura", "Cortez", "Roux", "Eriksson", "Bernardo",
    "Castillo", "Dubois", "Evangelista", "Fujimoto", "Guerrero", "Hashimoto", "Ibarra",
    "Jensen", "Kuznetsov", "Laurent", "Morales", "Nielsen", "Oliveira", "Patel",
    "Quiroga", "Ramirez", "Silva", "Torres", "Ueda", "Vargas", "Weber",
    "Xiong", "Yilmaz", "Zabala", "Andersen", "Bakker", "Chavez", "Demir",
    "Espinoza", "Flores", "Gomez", "Herrera", "Ishida", "Jimenez", "Kato",
    "Lopez", "Mendez", "Navarro", "Ozaki", "Perez", "Reyes", "Sato", "Adeyemi", "Bergmann", "Chandra", "Delacroix", "Emeka", "Fonseca", "Gupta", "Hadley", "Ingrid", "Johal", "Kitamura", "Lavoie", "Mensah", "Nakata", "Obasi", "Pham", "Rashid", "Suzuki", "Tran", "Usman", "Vieira", "Watanabe", "Yoon", "Zuberi",
]

SURNAMES_POOR = [
    "Gray", "Stone", "Marsh", "Field", "Brook", "Wood", "Hill", "Cross",
    "Banks", "Reed", "Mills", "Ford", "Lane", "West", "Nash",
    "Burns", "Price", "Sharp", "Swift", "Thorn", "Vale", "Wilde",
    "Frost", "Hale", "Quinn", "Ross", "Scott", "Todd", "Vance",
    "Abel", "Blake", "Cole", "Dale", "Earl", "Finn", "Glen",
    "Hart", "Ives", "Kane", "Knox", "Lake", "Moss", "Neal",
    "Oaks", "Pace", "Rand", "Sage", "Tate", "Upton", "Vane",
    "Wade", "Yates", "Zane", "Ash", "Bay", "Carr", "Drew",
    "Fenn", "Gore", "Holt", "Isle", "Jude", "Kirk", "Lowe",
    "More", "Noel", "Orr", "Penn", "Rowe", "Shaw", "Troy", "Abbot", "Bauer", "Crowe", "Dunn", "Ennis", "Frey", "Gunn", "Howe", "Innes", "Judd", "Kent", "Lund", "Munn", "Nunn", "Owen", "Penn", "Rudd", "Sunn", "Tunn", "Unn", "Vann", "Wynn", "York", "Zinn",
]


def unique_child_name(cur, first: str, surnames: list) -> str:
    """First + random surname; if taken, retry then append a numeric suffix (same idea as genesis)."""
    for _ in range(120):
        name = f"{first} {random.choice(surnames)}"
        cur.execute("SELECT 1 FROM agents WHERE name = %s LIMIT 1", (name,))
        if not cur.fetchone():
            return name
    base = f"{first} {random.choice(surnames)}"
    n = 2
    while n < 999999:
        candidate = f"{base} {n}"
        cur.execute("SELECT 1 FROM agents WHERE name = %s LIMIT 1", (candidate,))
        if not cur.fetchone():
            return candidate
        n += 1
    return f"{base} {random.randint(1000000, 9999999)}"


def can_reproduce(balance, agent_class, base_balance):
    """Check if agent can reproduce based on balance"""
    if agent_class == "poor":
        # Social mobility - poor can reproduce if rich enough
        return balance > 1.2 * base_balance
    elif agent_class == "middle":
        return balance > 1.2 * base_balance
    elif agent_class == "elite":
        return balance > 12.0 * base_balance
    return False

def get_child_balance(parent_balance, parent_class):
    """Child gets 70% of birth cost"""
    if parent_class == "elite":
        birth_cost = 2.0 * (parent_balance / 10)
    else:
        birth_cost = 0.8 * parent_balance
    return birth_cost * 0.70

def run_birth_cycle(base_balance=50):
    cur = conn.cursor()
    
    cur.execute("""
        SELECT id, name, class, balance FROM agents 
        WHERE is_alive = TRUE AND balance > 0
        ORDER BY RANDOM() LIMIT 500
    """)
    agents = cur.fetchall()
    
    print(f"\n👶 ZION Birth Cycle - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    births = 0
    for agent_id, name, agent_class, balance in agents:
        balance = float(balance)
        
        if not can_reproduce(balance, agent_class, base_balance):
            continue
        
        # 30% chance to reproduce each cycle
        if random.random() > 0.30:
            continue
        
        # Get child balance
        child_balance = get_child_balance(balance, agent_class)
        
        # Deduct birth cost from parent
        birth_cost = child_balance / 0.70
        new_parent_balance = balance - birth_cost
        
        # Pick child name and class (full name with surname, aligned with genesis.py)
        if agent_class == "elite":
            child_class = random.choice(["elite", "middle"])
            child_first = random.choice(NAMES_ELITE)
            surnames = SURNAMES_ELITE if child_class == "elite" else SURNAMES_MIDDLE
        else:
            child_class = agent_class
            child_first = random.choice(NAMES_MIDDLE if agent_class == "middle" else NAMES_POOR)
            surnames = SURNAMES_MIDDLE if agent_class == "middle" else SURNAMES_POOR
        child_name = unique_child_name(cur, child_first, surnames)
        
        # Create child
        child_charisma = random.randint(10, 30)
        cur.execute("""
            INSERT INTO agents (name, class, balance, parent_id, charisma, aggression, faith, ambition, loyalty)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 50)
        """, (
            child_name, child_class, child_balance, agent_id,
            child_charisma,
            random.randint(20, 80),
            random.randint(20, 80),
            random.randint(30, 90)
        ))
        
        # Update parent balance
        cur.execute("UPDATE agents SET balance = %s WHERE id = %s", 
                   (new_parent_balance, agent_id))
        
        # Log event
        cur.execute("""
            INSERT INTO events (agent_id, event_type, description, zion_amount)
            VALUES (%s, 'birth', %s, %s)
        """, (agent_id, f"{name} gave birth to {child_name}", child_balance))
        
        print(
            f"👶 {name} ({agent_class}) → {child_name} ({child_class}) born with "
            f"{child_balance:.2f} ZION (charisma {child_charisma})"
        )
        births += 1
    
    conn.commit()
    
    cur.execute("SELECT COUNT(*) FROM agents WHERE is_alive = TRUE")
    alive = cur.fetchone()[0]
    
    print(f"\n📊 Births this cycle: {births} | Total alive: {alive}")
    print("✅ Birth cycle complete!\n")
    cur.close()

if __name__ == "__main__":
    run_birth_cycle(base_balance=10)
