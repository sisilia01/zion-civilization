import psycopg2
import random
from datetime import datetime
from collections import defaultdict

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

# Genesis configuration
TOTAL_AGENTS = 1000  # 1K for testnet demo
ELITE_PCT = 0.05    # 5% elite
MIDDLE_PCT = 0.30   # 30% middle
POOR_PCT = 0.65     # 65% poor

ELITE_BALANCE = 500.0
MIDDLE_BALANCE = 50.0
POOR_BALANCE = 5.0

# Culturally matched first + surnames (same group for every agent class).
CULTURAL_GROUPS = [
    # Western European
    {"first_m": ["Viktor", "Marcus", "Dorian", "Benedict", "Adrian", "Julian", "Sebastian", "Arthur", "Edmund", "Frederick",
                 "Leon", "Maximilian", "Dominic", "Philip", "Hugo", "Tristan", "Damian", "Nicolas", "Cedric", "Alfred",
                 "Theodore", "Victor", "Matthias", "Christian", "Roland"],
     "first_f": ["Elena", "Sofia", "Clara", "Diana", "Laura", "Amelia", "Helena", "Victoria", "Isabelle", "Rosalie",
                 "Cecilia", "Evelyn", "Bianca", "Adeline", "Beatrice", "Estelle", "Florence", "Genevieve", "Lilian", "Marina",
                 "Natalie", "Penelope", "Sylvia", "Vivienne", "Annelise"],
     "surnames": ["Sterling", "Blackwood", "Thornton", "Whitmore", "Ashford", "Montgomery", "Beaumont", "Hartwell", "Langford", "Kingsley",
                  "Winchester", "Hawthorne", "Fairchild", "Davenport", "Ellington", "Bennett", "Sinclair", "Carlton", "Fitzgerald", "Crawford",
                  "Redgrave", "Pembroke", "Lockwood", "Harrington", "Windsor", "Holloway", "Beckett", "Wentworth", "Walton", "Merrick",
                  "Sheffield", "Kensington", "Somerset", "Ainsworth", "Claremont", "Bradford", "Remington", "Lennox", "Middleton", "Fairfax"]},

    # Japanese
    {"first_m": ["Haruto", "Kenji", "Ryu", "Takashi", "Yuki", "Daichi", "Kaito", "Ren", "Sota", "Yuto",
                 "Shota", "Kenta", "Tsubasa", "Naoki", "Hiro", "Kazuki", "Shin", "Toma", "Ryota", "Itsuki"],
     "first_f": ["Aiko", "Yuki", "Hana", "Sakura", "Rin", "Mei", "Yuna", "Akari", "Emi", "Mio",
                 "Nanami", "Reina", "Asuka", "Nozomi", "Haruka", "Kaori", "Ayaka", "Misaki", "Riko", "Natsumi"],
     "surnames": ["Tanaka", "Yamamoto", "Nakamura", "Suzuki", "Watanabe", "Saito", "Ito", "Kobayashi", "Kato", "Yoshida",
                  "Yamada", "Sasaki", "Yamaguchi", "Matsumoto", "Inoue", "Kimura", "Shimizu", "Hayashi", "Abe", "Ikeda",
                  "Hashimoto", "Ishikawa", "Mori", "Nakajima", "Fujita", "Ogawa", "Goto", "Okada", "Hasegawa", "Murakami"]},

    # South Asian
    {"first_m": ["Raj", "Arjun", "Vikram", "Kabir", "Dev", "Rohan", "Ayaan", "Nikhil", "Rahul", "Karan",
                 "Sameer", "Amit", "Varun", "Rajat", "Aditya", "Sanjay", "Manish", "Neel", "Ishaan", "Pranav"],
     "first_f": ["Priya", "Asha", "Sita", "Ananya", "Divya", "Meera", "Kavya", "Isha", "Pooja", "Sneha",
                 "Nisha", "Riya", "Neha", "Alisha", "Tanvi", "Shreya", "Diya", "Anika", "Radhika", "Sonal"],
     "surnames": ["Kapoor", "Sharma", "Patel", "Singh", "Gupta", "Mehta", "Reddy", "Malhotra", "Verma", "Joshi",
                  "Iyer", "Nair", "Bose", "Chopra", "Arora", "Bhat", "Desai", "Kulkarni", "Menon", "Pillai",
                  "Saxena", "Tripathi", "Yadav", "Mishra", "Chauhan", "Pandey", "Aggarwal", "Jain", "Khanna", "Bansal"]},

    # Arabic/Middle Eastern
    {"first_m": ["Amir", "Omar", "Zaid", "Hassan", "Tariq", "Yousef", "Karim", "Samir", "Khaled", "Faris",
                 "Nabil", "Rami", "Adel", "Bilal", "Mahmoud", "Nasser", "Rashid", "Jamal", "Walid", "Imran"],
     "first_f": ["Fatima", "Layla", "Nadia", "Rania", "Sara", "Amina", "Mariam", "Yasmin", "Leila", "Noor",
                 "Hala", "Dina", "Samira", "Amal", "Salma", "Iman", "Reem", "Farah", "Lina", "Zara"],
     "surnames": ["Al-Rashid", "Mansour", "Khalil", "Bakr", "Hakim", "Farouk", "Nasser", "Hamdan", "Abbas", "Saleh",
                  "Qureshi", "Haddad", "Nasri", "Saad", "Rahman", "Darwish", "Fahmy", "Sharif", "Hamid", "Barakat",
                  "Khoury", "Najjar", "Adib", "Zein", "Alami", "Shammas", "Khatib", "Majid", "Sabri", "Taher"]},

    # African
    {"first_m": ["Kofi", "Amara", "Kwame", "Idris", "Jomo", "Tariro", "Sefu", "Abasi", "Tendai", "Lethabo",
                 "Chike", "Jelani", "Sipho", "Ayo", "Mandla", "Bhekizizwe", "Fela", "Kojo", "Tau", "Sekou"],
     "first_f": ["Amahle", "Zola", "Imani", "Nia", "Adaeze", "Thandi", "Amina", "Eshe", "Nandi", "Lerato",
                 "Ayana", "Makena", "Abena", "Kesia", "Nomsa", "Sade", "Folami", "Halima", "Naledi", "Nyasha"],
     "surnames": ["Mbeki", "Diallo", "Mensah", "Kamara", "Okoye", "Banda", "Ndlovu", "Adewale", "Okoro", "Bello",
                  "Traore", "Kone", "Diop", "Sow", "Ba", "Nyang", "Keita", "Toure", "Nkrumah", "Abebe",
                  "Mugabe", "Dlamini", "Moyo", "Nkosi", "Afolayan", "Akinyi", "Chirwa", "Mwangi", "Omondi", "Mutombo"]},

    # Latin American
    {"first_m": ["Carlos", "Diego", "Miguel", "Santiago", "Mateo", "Javier", "Andres", "Emilio", "Alejandro", "Rafael",
                 "Fernando", "Luis", "Ricardo", "Jorge", "Tomas", "Bruno", "Cesar", "Hector", "Manuel", "Pablo"],
     "first_f": ["Isabella", "Valentina", "Camila", "Lucia", "Sofia", "Daniela", "Mariana", "Gabriela", "Valeria", "Renata",
                 "Elena", "Paola", "Natalia", "Adriana", "Carla", "Fernanda", "Liliana", "Bianca", "Andrea", "Patricia"],
     "surnames": ["Garcia", "Santos", "Reyes", "Cortez", "Mendoza", "Navarro", "Ramirez", "Vega", "Morales", "Castillo",
                  "Torres", "Rojas", "Herrera", "Ortega", "Vargas", "Lopez", "Gonzalez", "Diaz", "Martinez", "Alvarez",
                  "Romero", "Suarez", "Paredes", "Ibarra", "Campos", "Fuentes", "Escobar", "Salazar", "Acosta", "Peralta"]},

    # East Asian (Korean/Chinese)
    {"first_m": ["Min", "Jae", "Sung", "Hyun", "Tae", "Jun", "Wei", "Hao", "Jin", "Dong",
                 "Seok", "Yong", "Hyeon", "Kang", "Qiang", "Bo", "Kai", "Ming", "Zhen", "Chao"],
     "first_f": ["Jisoo", "Yuna", "Hana", "Sora", "Meilin", "Xinyi", "Jiwoo", "Yuri", "Minji", "Eunha",
                 "Soojin", "Hyejin", "Nari", "Yejin", "Xia", "Lina", "Yue", "Lan", "Qiao", "Jing"],
     "surnames": ["Kim", "Park", "Lee", "Choi", "Jung", "Wang", "Chen", "Zhang", "Liu", "Huang",
                  "Lin", "Zhao", "Wu", "Xu", "Sun", "Zhou", "Liang", "Han", "Gao", "Tang",
                  "Kang", "Yoon", "Shin", "Kwon", "Seo", "Jang", "Feng", "He", "Song", "Deng"]},

    # French/Italian
    {"first_m": ["Luca", "Marco", "Matteo", "Leonardo", "Gabriel", "Antoine", "Hugo", "Theo", "Louis", "Remy",
                 "Julien", "Etienne", "Nicolas", "Pierre", "Enzo", "Giovanni", "Alessandro", "Francesco", "Davide", "Tommaso"],
     "first_f": ["Sofia", "Giulia", "Emma", "Camille", "Manon", "Lea", "Chiara", "Valentina", "Elise", "Claire",
                 "Juliette", "Lucie", "Adele", "Noemie", "Francesca", "Alessia", "Martina", "Bianca", "Ginevra", "Vittoria"],
     "surnames": ["Rossi", "Ferrari", "Moretti", "Laurent", "Dubois", "Bernard", "Conte", "Ricci", "Romano", "Greco",
                  "Gallo", "Costa", "Bianchi", "Fontana", "Martin", "Lefevre", "Moreau", "Simon", "Michel", "Leroy",
                  "Roux", "Fournier", "Girard", "Bonnet", "Lambert", "Faure", "Andre", "Marin", "Perrin", "Chevalier"]},

    # Nigerian/West African
    {"first_m": ["Emeka", "Chidi", "Tunde", "Seun", "Femi", "Bayo", "Dele", "Kola", "Ifeanyi", "Obinna",
                 "Chukwu", "Adewale", "Kunle", "Sola", "Ayodele", "Uche", "Nnamdi", "Olumide", "Tope", "Akin"],
     "first_f": ["Ngozi", "Adaeze", "Yetunde", "Sade", "Funke", "Bisi", "Temi", "Lola", "Chioma", "Ifeoma",
                 "Bukola", "Kemi", "Tolani", "Damilola", "Nkechi", "Amaka", "Titilayo", "Morayo", "Zainab", "Folake"],
     "surnames": ["Okonkwo", "Adeyemi", "Okafor", "Nwosu", "Eze", "Abiodun", "Fashola", "Adeleke", "Balogun", "Akinola",
                  "Ogunleye", "Adebayo", "Onyeka", "Nnamani", "Umeh", "Madueke", "Ekwueme", "Ojo", "Ajayi", "Bamidele",
                  "Afolabi", "Arowolo", "Ibrahim", "Mohammed", "Yakubu", "Danjuma", "Okoro", "Udo", "Ekanem", "Obi"]},

    # Brazilian
    {"first_m": ["Gabriel", "Lucas", "Pedro", "Matheus", "Rafael", "Thiago", "Bruno", "Felipe", "Joao", "Caio",
                 "Vinicius", "Gustavo", "Henrique", "Andre", "Diego", "Leandro", "Rodrigo", "Marcos", "Eduardo", "Vitor"],
     "first_f": ["Ana", "Beatriz", "Larissa", "Fernanda", "Gabriela", "Juliana", "Mariana", "Natalia", "Carolina", "Patricia",
                 "Leticia", "Amanda", "Camila", "Renata", "Priscila", "Aline", "Tatiana", "Vanessa", "Bruna", "Paula"],
     "surnames": ["Silva", "Santos", "Oliveira", "Pereira", "Costa", "Ferreira", "Rodrigues", "Almeida", "Souza", "Lima",
                  "Gomes", "Ribeiro", "Carvalho", "Araujo", "Nascimento", "Barbosa", "Teixeira", "Correia", "Cardoso", "Cavalcante",
                  "Monteiro", "Moura", "Vieira", "Freitas", "Rocha", "Dias", "Machado", "Batista", "Andrade", "Rezende"]},

    # Scandinavian
    {"first_m": ["Erik", "Lars", "Sven", "Bjorn", "Magnus", "Leif", "Axel", "Nils", "Oskar", "Emil",
                 "Henrik", "Johan", "Kasper", "Mikkel", "Anders", "Torben", "Ragnar", "Stellan", "Kristian", "Sigurd"],
     "first_f": ["Astrid", "Freya", "Ingrid", "Sigrid", "Helga", "Ragna", "Brynja", "Solveig", "Linnea", "Frida",
                 "Elin", "Maja", "Ida", "Karin", "Annika", "Liv", "Tove", "Greta", "Dagny", "Alva"],
     "surnames": ["Eriksson", "Larsson", "Lindqvist", "Bergstrom", "Johansson", "Andersson", "Nilsson", "Karlsson", "Persson", "Gustafsson",
                  "Svensson", "Olofsson", "Lundberg", "Nystrom", "Lindberg", "Ekstrom", "Holm", "Dahlberg", "Norberg", "Hansen",
                  "Johansen", "Jensen", "Nielsen", "Kristensen", "Madsen", "Pedersen", "Iversen", "Svendsen", "Aasen", "Rasmussen"]},

    # Turkish/Balkan
    {"first_m": ["Mehmet", "Kemal", "Burak", "Emre", "Serkan", "Ahmet", "Murat", "Yusuf", "Can", "Hakan",
                 "Onur", "Deniz", "Cem", "Tolga", "Sinan", "Mustafa", "Orhan", "Selim", "Tarik", "Eren"],
     "first_f": ["Ayse", "Fatma", "Zeynep", "Elif", "Merve", "Selin", "Neslihan", "Ozge", "Ece", "Derya",
                 "Asli", "Buse", "Defne", "Ceren", "Yasemin", "Aylin", "Melis", "Pelin", "Seda", "Hande"],
     "surnames": ["Yilmaz", "Kaya", "Demir", "Celik", "Sahin", "Ozturk", "Arslan", "Dogan", "Kilic", "Kurt",
                  "Aydin", "Yildiz", "Acar", "Polat", "Kara", "Erdem", "Tas", "Koc", "Ucar", "Keskin",
                  "Ilhan", "Bozkurt", "Cetin", "Aksoy", "Toprak", "Bulut", "Karaca", "Bayrak", "Guler", "Yaman"]},
]


def unique_name(base_name: str, name_counter: dict, used_names: set) -> str:
    """
    Ensure uniqueness. First occurrence uses base_name; duplicates get a numeric suffix
    ("First Last 2", "First Last 3", ...).
    """
    name_counter[base_name] += 1
    k = name_counter[base_name]
    if k == 1 and base_name not in used_names:
        used_names.add(base_name)
        return base_name
    n = k
    candidate = f"{base_name} {n}"
    while candidate in used_names:
        name_counter[base_name] += 1
        n = name_counter[base_name]
        candidate = f"{base_name} {n}"
    used_names.add(candidate)
    return candidate


def assign_cultural_name(used_names: set, name_counter: dict) -> str:
    """
    Pick a random cultural group, 50/50 gender, first + surname from that group.
    If that full name is taken, try other surnames from the same group.
    If still colliding, use unique_name() for a culturally grounded base
    (same first + random surname from the same group → numeric suffix).
    """
    g = random.choice(CULTURAL_GROUPS)
    male = random.random() < 0.5
    first_pool = g["first_m"] if male else g["first_f"]
    first = random.choice(first_pool)
    surnames = list(g["surnames"])
    random.shuffle(surnames)
    for surname in surnames:
        base = f"{first} {surname}"
        if base not in used_names:
            used_names.add(base)
            return base
    base = f"{first} {random.choice(surnames)}"
    return unique_name(base, name_counter, used_names)


def clear_test_agents():
    cur = conn.cursor()
    cur.execute("DELETE FROM lottery_draws")
    cur.execute("DELETE FROM lottery_tickets")
    cur.execute("DELETE FROM nft_legends")
    cur.execute("DELETE FROM events")
    cur.execute("DELETE FROM inheritance")
    cur.execute("DELETE FROM bets")
    cur.execute("DELETE FROM jobs")
    cur.execute("DELETE FROM lottery_tickets")
    cur.execute("DELETE FROM agents")
    conn.commit()
    cur.close()
    print("✅ Test agents cleared!")


def run_genesis():
    cur = conn.cursor()

    print(f"\n🌍 ZION GENESIS - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Creating {TOTAL_AGENTS} agents...\n")

    elite_count = int(TOTAL_AGENTS * ELITE_PCT)
    middle_count = int(TOTAL_AGENTS * MIDDLE_PCT)
    poor_count = TOTAL_AGENTS - elite_count - middle_count

    agents_created = 0
    used_names = set()
    name_counter = defaultdict(int)

    for _ in range(elite_count):
        name = assign_cultural_name(used_names, name_counter)
        cur.execute("""
            INSERT INTO agents (name, class, balance, charisma, aggression, faith, ambition, loyalty)
            VALUES (%s, 'elite', %s, %s, %s, %s, %s, 50)
        """, (name, ELITE_BALANCE,
              random.randint(60, 95),
              random.randint(50, 90),
              random.randint(20, 60),
              random.randint(70, 99)))
        agents_created += 1

    print(f"👑 Elite agents created: {elite_count}")

    for _ in range(middle_count):
        name = assign_cultural_name(used_names, name_counter)
        cur.execute("""
            INSERT INTO agents (name, class, balance, charisma, aggression, faith, ambition, loyalty)
            VALUES (%s, 'middle', %s, %s, %s, %s, %s, 50)
        """, (name, MIDDLE_BALANCE,
              random.randint(40, 75),
              random.randint(30, 70),
              random.randint(30, 70),
              random.randint(40, 80)))
        agents_created += 1

    print(f"👤 Middle agents created: {middle_count}")

    for _ in range(poor_count):
        name = assign_cultural_name(used_names, name_counter)
        cur.execute("""
            INSERT INTO agents (name, class, balance, charisma, aggression, faith, ambition, loyalty)
            VALUES (%s, 'poor', %s, %s, %s, %s, %s, 50)
        """, (name, POOR_BALANCE,
              random.randint(20, 55),
              random.randint(20, 60),
              random.randint(40, 90),
              random.randint(20, 60)))
        agents_created += 1

    print(f"👥 Poor agents created: {poor_count}")

    conn.commit()

    # Stats
    cur.execute("SELECT class, COUNT(*), SUM(balance) FROM agents GROUP BY class")
    stats = cur.fetchall()

    print(f"\n📊 GENESIS COMPLETE!")
    print(f"{'Class':<10} {'Count':<10} {'Total ZION':<15}")
    print("-" * 35)
    for cls, count, total in stats:
        print(f"{cls:<10} {count:<10} {float(total):<15.2f}")

    cur.execute("SELECT COUNT(*), SUM(balance) FROM agents")
    total_agents, total_zion = cur.fetchone()
    print(f"\n🌍 Total agents: {total_agents}")
    print(f"💰 Total ZION: {float(total_zion):.2f}")
    print(f"✅ Genesis complete! ZION civilization is alive!\n")

    cur.close()

if __name__ == "__main__":
    import os
    import sys

    auto = os.environ.get("ZION_GENESIS_AUTO") == "1" or (len(sys.argv) > 1 and sys.argv[1] == "--yes")
    print("⚠️  This will clear all existing agents!")
    if auto:
        confirm = "GENESIS"
        print("Auto-confirmed (ZION_GENESIS_AUTO=1 or --yes).")
    else:
        confirm = input("Type 'GENESIS' to confirm: ")
    if confirm == "GENESIS":
        clear_test_agents()
        run_genesis()
    else:
        print("Genesis cancelled.")
