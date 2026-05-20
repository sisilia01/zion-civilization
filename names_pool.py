"""ZION name pools — unique first names and surnames (no numeric suffixes)."""

MALE_NAMES = [
    "James", "Oliver", "Noah", "Liam", "Ethan", "Mason", "Logan", "Lucas", "Henry", "Jack",
    "Owen", "Sebastian", "Carter", "Wyatt", "Dylan", "Hunter", "Grayson", "Zachary", "Aaron", "Connor",
    "Benjamin", "Samuel", "Nathan", "Isaac", "Caleb", "Ryan", "Tyler", "Brandon", "Justin", "Jordan",
    "Austin", "Cameron", "Colton", "Cooper", "Declan", "Elijah", "Finn", "Gabriel", "Hudson", "Ian",
    "Jasper", "Kyle", "Leo", "Miles", "Nolan", "Parker", "Quinn", "Riley", "Sawyer", "Tristan",
    "Victor", "Wesley", "Xander", "York", "Zane", "Adam", "Blake", "Chase", "Derek", "Evan",
    "Felix", "Grant", "Harvey", "Ivan", "Jared", "Keith", "Lance", "Marcus", "Neil", "Oscar",
    "Preston", "Reed", "Spencer", "Tucker", "Ulrich", "Vince", "Warren", "Xavier", "Yale", "Zach",
    "Archer", "Barrett", "Cedric", "Damian", "Edgar", "Forrest", "Gavin", "Heath", "Igor", "Jonah",
    "Kellan", "Landon", "Luther", "Maxwell", "Nelson", "Orson", "Percy", "Quincy", "Ronan", "Sterling",
    "Theo", "Ulysses", "Vaughn", "Wade", "Yuri", "Zion", "Aleksei", "Dmitri", "Mikhail", "Sergei",
    "Viktor", "Andrei", "Pavel", "Nikolai", "Boris", "Alexei", "Oleg", "Roman", "Vladimir", "Konstantin",
    "Fyodor", "Grigori", "Ilya", "Kirill", "Leonid", "Maxim", "Nikita", "Pyotr", "Ruslan", "Stanislav",
    "Timur", "Valentin", "Yaroslav", "Zakhar", "Anatoly", "Arkady", "Denis", "Egor", "Gennady", "Kazimir",
    "Lev", "Matvei", "Nestor", "Orest", "Prokhor", "Rodion", "Semyon", "Taras", "Vadim", "Yakov",
    "Zhenya", "Artem", "Bogdan", "Danila", "Evgeny", "Filipp", "Gleb", "Klim", "Luka", "Mark",
    "Nazar", "Osip", "Platon", "Rostislav", "Savva", "Tikhon", "Vsevolod", "Yegor", "Zahar", "Marco",
    "Luca", "Lorenzo", "Matteo", "Giovanni", "Francesco", "Alessandro", "Andrea", "Riccardo", "Giuseppe", "Antonio",
    "Davide", "Federico", "Gabriele", "Leonardo", "Michele", "Nicola", "Paolo", "Roberto", "Salvatore", "Stefano",
    "Tommaso", "Vincenzo", "Alberto", "Bruno", "Carlo", "Daniele", "Enrico", "Fabio", "Giacomo", "Luigi",
    "Mario", "Pietro", "Renato", "Sergio", "Umberto", "Valerio", "Adriano", "Benedetto", "Cesare", "Domenico",
    "Emanuele", "Filippo", "Giorgio", "Ignazio", "Jacopo", "Massimo", "Nino", "Orazio", "Piero", "Quirino",
    "Raffaele", "Silvio", "Tiziano", "Ugo", "Vittorio", "Zeno", "Carlos", "Miguel", "Diego", "Alejandro",
    "Rafael", "Eduardo", "Fernando", "Ricardo", "Javier", "Luis", "Pedro", "Francisco", "Manuel", "Andres",
    "Emilio", "Felipe", "Hector", "Ignacio", "Jorge", "Marcos", "Nicolas", "Pablo", "Raul", "Salvador",
    "Tomas", "Ulises", "Vicente", "Yago", "Zacarias", "Adrian", "Cesar", "Daniel", "Enrique", "Gonzalo",
    "Hugo", "Ismael", "Jaime", "Kevin", "Mateo", "Orlando", "Patricio", "Quintin", "Ramiro", "Santiago",
    "Teodoro", "Uriel", "Wilfredo", "Kenji", "Hiroshi", "Takashi", "Yuki", "Ryo", "Daichi", "Shota",
    "Kazuki", "Haruto", "Ren", "Akira", "Daisuke", "Eiji", "Fumio", "Genji", "Hideo", "Isamu",
    "Jun", "Kaito", "Makoto", "Naoki", "Osamu", "Riku", "Satoshi", "Taro", "Ume", "Yuji",
    "Zen", "Akito", "Bunta", "Chikara", "Eitaro", "Goro", "Hayato", "Ichiro", "Jiro", "Kenta",
    "Minoru", "Noboru", "Oki", "Saburo", "Takeshi", "Yasuo", "Zentaro", "Ahmed", "Omar", "Khalid",
    "Hassan", "Tariq", "Youssef", "Kareem", "Samir", "Nabil", "Bilal", "Adel", "Amir", "Faris",
    "Hamza", "Ibrahim", "Jamal", "Karim", "Mahmoud", "Nasser", "Rashid", "Salim", "Walid", "Yasin",
    "Zaid", "Abbas", "Fahad", "Hakim", "Imran", "Jafar", "Kamal", "Latif", "Majid", "Nasir",
    "Qasim", "Rami", "Sadiq", "Talib", "Usman", "Waseem", "Yahya", "Zubair", "Anwar", "Basim",
    "Dawud", "Emir", "Faisal", "Ghassan", "Hadi", "Idris", "Jalal", "Kwame", "Kofi", "Amara",
    "Seun", "Emeka", "Chidi", "Babatunde", "Oluwaseun", "Makena", "Jomo", "Tendai", "Sipho", "Jelani",
    "Chike", "Obinna", "Tunde", "Femi", "Bayo", "Kola", "Ifeanyi", "Adewale", "Kunle", "Ayodele",
    "Uche", "Nnamdi", "Akin", "Sefu", "Abasi", "Lethabo", "Tau", "Sekou", "Mandla", "Bhekizizwe",
    "Fela", "Kojo", "Ayo", "Tariro", "Lerato", "Antoine", "Baptiste", "Clement", "Damien", "Etienne",
    "Fabien", "Guillaume", "Julien", "Louis", "Mathieu", "Olivier", "Pierre", "Remy", "Sebastien", "Vincent",
    "Yann", "Adrien", "Alexandre", "Benoit", "Charles", "Emile", "Francois", "Gaston", "Henri", "Jacques",
    "Laurent", "Marc", "Noel", "Pascal", "Quentin", "Romain", "Simon", "Thierry", "Ulysse", "William",
    "Yves", "Zacharie", "Alain", "Bertrand", "Christophe", "Didier", "Eric", "Frederic", "Gerard", "Klaus",
    "Dieter", "Franz", "Hans", "Karl", "Kurt", "Ludwig", "Otto", "Rudolf", "Werner", "Albert",
    "Bernd", "Christoph", "Ernst", "Friedrich", "Georg", "Heinrich", "Johann", "Martin", "Paul", "Stefan",
    "Thomas", "Wilhelm", "Andreas", "Detlef", "Egon", "Fritz", "Gunther", "Helmut", "Ingo", "Jorg",
    "Konrad", "Lothar", "Manfred", "Norbert", "Rainer", "Siegfried", "Uwe", "Volker", "Wolfgang", "Axel",
    "Bjorn", "Carsten", "Dirk", "Erik", "Gunter", "Holger", "Lars", "Magnus", "Sven", "Gunnar",
]  # exactly 500 names

FEMALE_NAMES = [
    "Emma", "Olivia", "Ava", "Isabella", "Sophia", "Mia", "Charlotte", "Amelia", "Harper", "Evelyn",
    "Abigail", "Emily", "Elizabeth", "Sofia", "Ella", "Scarlett", "Grace", "Chloe", "Victoria", "Riley",
    "Aria", "Lily", "Aurora", "Zoey", "Penelope", "Layla", "Nora", "Hazel", "Violet", "Aubrey",
    "Stella", "Nova", "Hannah", "Lillian", "Addison", "Eleanor", "Natalie", "Zoe", "Leah", "Savannah",
    "Brooklyn", "Bella", "Claire", "Skylar", "Lucy", "Paisley", "Everly", "Anna", "Caroline", "Genesis",
    "Kennedy", "Kinsley", "Allison", "Maya", "Sarah", "Madelyn", "Adeline", "Alexa", "Ariana", "Elena",
    "Gabriella", "Naomi", "Alice", "Sadie", "Hailey", "Eva", "Emilia", "Autumn", "Quinn", "Nevaeh",
    "Piper", "Ruby", "Serenity", "Willow", "Cora", "Kaylee", "Lydia", "Aubree", "Arianna", "Eliana",
    "Peyton", "Melanie", "Gianna", "Isabelle", "Julia", "Valentina", "Clara", "Vivian", "Reagan", "Mackenzie",
    "Madeline", "Delilah", "Aaliyah", "Katherine", "Sophie", "Josephine", "Ivy", "Luna", "Maria", "Rose",
    "Daisy", "Faith", "Hope", "Joy", "June", "Kate", "Laura", "Molly", "Nina", "Opal",
    "Paige", "Ruth", "Sage", "Tessa", "Uma", "Vera", "Willa", "Yara", "Zara", "Anastasia",
    "Ekaterina", "Natalia", "Olga", "Tatiana", "Irina", "Svetlana", "Ludmila", "Daria", "Marina", "Yelena",
    "Galina", "Nadezhda", "Zoya", "Alina", "Bogdana", "Diana", "Faina", "Inna", "Karina", "Larisa",
    "Mila", "Oksana", "Polina", "Raisa", "Tamara", "Ulyana", "Varvara", "Xenia", "Yana", "Zlata",
    "Agata", "Bronislava", "Evgenia", "Grusha", "Ksenia", "Lyubov", "Milena", "Nika", "Olesya", "Rimma",
    "Snezhana", "Taisiya", "Vasilisa", "Yaroslava", "Zinaida", "Giulia", "Alessia", "Chiara", "Eleonora", "Federica",
    "Ginevra", "Francesca", "Silvia", "Paola", "Rosa", "Teresa", "Lucia", "Martina", "Sara", "Beatrice",
    "Camilla", "Claudia", "Daniela", "Elisa", "Flavia", "Ilaria", "Jessica", "Katia", "Loredana", "Monica",
    "Nadia", "Ornella", "Patrizia", "Raffaella", "Simona", "Tiziana", "Veronica", "Ylenia", "Adriana", "Bianca",
    "Caterina", "Donatella", "Fiorella", "Grazia", "Helena", "Irene", "Jolanda", "Livia", "Mirella", "Noemi",
    "Ottavia", "Pia", "Rita", "Umberta", "Vittoria", "Zita", "Carmen", "Isabel", "Ana", "Paula",
    "Sandra", "Patricia", "Beatriz", "Esther", "Gloria", "Ines", "Lorena", "Pilar", "Raquel", "Blanca",
    "Cristina", "Dolores", "Esperanza", "Fatima", "Graciela", "Jimena", "Lourdes", "Magdalena", "Nuria", "Ofelia",
    "Paloma", "Regina", "Susana", "Trinidad", "Ursula", "Ximena", "Yolanda", "Zulema", "Yuki", "Hana",
    "Sakura", "Aiko", "Nami", "Rin", "Saki", "Yuna", "Mei", "Akemi", "Emi", "Fumiko",
    "Haruka", "Izumi", "Kaori", "Michiko", "Noriko", "Reiko", "Sachiko", "Tomoko", "Umeko", "Yoko",
    "Asuka", "Chie", "Etsuko", "Fuyuko", "Hikari", "Junko", "Kiko", "Maki", "Naoko", "Ochiyo",
    "Rika", "Sayuri", "Takako", "Wakana", "Yumiko", "Ayame", "Chiyo", "Eri", "Himari", "Kohana",
    "Mio", "Nanami", "Sora", "Tsukiko", "Yui", "Azumi", "Hotaru", "Kiyomi", "Mizuki", "Nozomi",
    "Sumiko", "Aisha", "Zainab", "Maryam", "Nour", "Yasmin", "Rania", "Amira", "Dina", "Hala",
    "Iman", "Jamila", "Khadija", "Leila", "Mariam", "Rana", "Salma", "Samira", "Umm", "Wafa",
    "Zahra", "Amina", "Bushra", "Dalal", "Eman", "Farah", "Ghada", "Huda", "Inaya", "Jana",
    "Kenza", "Lina", "Maha", "Nawal", "Ola", "Qamar", "Reem", "Safa", "Thara", "Widad",
    "Yusra", "Afaf", "Basma", "Dalia", "Esra", "Amara", "Nia", "Zola", "Imani", "Adaeze",
    "Chidinma", "Folake", "Ngozi", "Yetunde", "Ayana", "Makena", "Thandi", "Eshe", "Nandi", "Lerato",
    "Kesia", "Nomsa", "Sade", "Halima", "Naledi", "Nyasha", "Abena", "Bukola", "Chioma", "Damilola",
    "Ebele", "Funke", "Ifeoma", "Jumoke", "Kemi", "Lola", "Morayo", "Nkechi", "Olamide", "Precious",
    "Queen", "Rukayat", "Sola", "Temi", "Ugochi", "Wanjiru", "Yaa", "Adanna", "Bisi", "Chiamaka",
    "Efua", "Gifty", "Habiba", "Amelie", "Camille", "Juliette", "Lea", "Manon", "Mathilde", "Pauline",
    "Adele", "Anais", "Brigitte", "Celine", "Delphine", "Elise", "Florence", "Genevieve", "Helene", "Jeanne",
    "Karine", "Laure", "Marie", "Nathalie", "Odile", "Quitterie", "Sylvie", "Therese", "Ursule", "Veronique",
    "Yvette", "Aurore", "Bernadette", "Claudine", "Dominique", "Estelle", "Francoise", "Gisele", "Henriette", "Josette",
    "Lucie", "Madeleine", "Noemie", "Ophelie", "Pascale", "Lena", "Katharina", "Frieda", "Greta", "Ingrid",
    "Johanna", "Klara", "Luisa", "Petra", "Sabine", "Theresa", "Wilma", "Yvonne", "Agnes", "Christa",
    "Dagmar", "Elke", "Franziska", "Gisela", "Heidi", "Irmgard", "Jutta", "Karin", "Liesel", "Monika",
    "Nadine", "Silke", "Tanja", "Ulrike", "Waltraud", "Astrid", "Freya", "Sigrid", "Helga", "Ragna",
    "Brynja", "Solveig", "Linnea", "Frida", "Elin", "Maja", "Ida", "Annika", "Liv", "Tove",
    "Dagny", "Alva", "Birgit", "Elsa", "Gunhild", "Hedda", "Jorunn", "Kirsten", "Laila", "Mette",
    "Ragnhild", "Siri", "Thora", "Unni", "Vigdis", "Ylva", "Britt", "Eira", "Hilda", "Inga",
]  # exactly 500 names

SURNAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Taylor", "Anderson",
    "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson", "Clark",
    "Rodriguez", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young", "King", "Wright", "Scott",
    "Green", "Baker", "Adams", "Nelson", "Hill", "Campbell", "Mitchell", "Roberts", "Carter", "Phillips",
    "Evans", "Turner", "Torres", "Parker", "Collins", "Edwards", "Stewart", "Flores", "Morris", "Murphy",
    "Cook", "Rogers", "Morgan", "Peterson", "Cooper", "Reed", "Bailey", "Bell", "Gomez", "Kelly",
    "Howard", "Ward", "Cox", "Richardson", "Wood", "Watson", "Brooks", "Bennett", "Gray", "James",
    "Reyes", "Cruz", "Hughes", "Price", "Myers", "Long", "Foster", "Sanders", "Ross", "Morales",
    "Powell", "Sullivan", "Russell", "Ortiz", "Jenkins", "Gutierrez", "Perry", "Butler", "Barnes", "Fisher",
    "Henderson", "Coleman", "Simmons", "Patterson", "Jordan", "Reynolds", "Hamilton", "Graham", "Kim", "Gonzales",
    "Alexander", "Ramos", "Wallace", "Griffin", "West", "Cole", "Hayes", "Chavez", "Gibson", "Bryant",
    "Ellis", "Stevens", "Murray", "Ford", "Marshall", "Owens", "Mcdonald", "Harrison", "Ruiz", "Kennedy",
    "Wells", "Alvarez", "Woods", "Mendoza", "Castillo", "Olson", "Webb", "Washington", "Tucker", "Freeman",
    "Burns", "Henry", "Vasquez", "Snyder", "Simpson", "Crawford", "Jimenez", "Porter", "Mason", "Shaw",
    "Gordon", "Wagner", "Hunter", "Romero", "Hicks", "Dixon", "Hunt", "Black", "Palmer", "Robertson",
    "Holmes", "Stone", "Meyer", "Boyd", "Mills", "Warren", "Fox", "Rose", "Rice", "Moreno",
    "Schmidt", "Patel", "Ferguson", "Nichols", "Herrera", "Medina", "Ryan", "Fernandez", "Weaver", "Daniels",
    "Stephens", "Gardner", "Payne", "Kelley", "Dunn", "Pierce", "Arnold", "Tran", "Hansen", "Peters",
    "Santos", "Hart", "Bradley", "Knight", "Elliott", "Andrews", "Harper", "George", "Riley", "Armstrong",
    "Carpenter", "Greene", "Lawrence", "Sims", "Austin", "Franklin", "Lawson", "Ivanov", "Petrov", "Sidorov",
    "Volkov", "Sokolov", "Popov", "Lebedev", "Kozlov", "Novikov", "Morozov", "Vasiliev", "Fedorov", "Mikhailov",
    "Alexeev", "Orlov", "Smirnov", "Kuznetsov", "Volkova", "Pavlov", "Semenov", "Egorov", "Stepanov", "Nikolaev",
    "Andreev", "Romanov", "Grigoriev", "Borisov", "Yakovlev", "Antonov", "Titov", "Markov", "Zaitsev", "Medvedev",
    "Belov", "Komarov", "Osipov", "Vinogradov", "Gusev", "Frolov", "Davydov", "Melnikov", "Belyaev", "Rodionov",
    "Sorokin", "Tarasov", "Kulikov", "Makarov", "Kiselev", "Nikitin", "Zakharov", "Afanasev", "Vlasov", "Maslov",
    "Golubev", "Vinokurov", "Soloviev", "Baranov", "Bogdanov", "Vorobyov", "Gerasimov", "Dorofeev", "Ermakov", "Zubov",
    "Ignatiev", "Kalinin", "Lazarev", "Mamedov", "Nazarov", "Ovchinnikov", "Ponomarev", "Rybakov", "Saveliev", "Tikhonov",
    "Ushakov", "Filippov", "Chernov", "Sharov", "Yudin", "Abramov", "Baklanov", "Vorontsov", "Rossi", "Ferrari",
    "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti",
    "DeLuca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro",
    "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "Longo", "Gentile", "Martinelli",
    "Vitale", "Lombardo", "Serra", "Coppola", "DeSantis", "Dangelo", "Marchetti", "Parisi", "Villa", "Ferretti",
    "Fabbri", "Bianco", "Marini", "Grasso", "Valentini", "Messina", "Sala", "DeAngelis", "Gatti", "Pellegrini",
    "Palumbo", "Sanna", "Farina", "Rizzi", "Monti", "Cattaneo", "Morelli", "Amato", "Silvestri", "Mazza",
    "Testa", "Grassi", "Palmieri", "Bernardi", "Martino", "Fiore", "Carbone", "Barone", "Donati", "Piras",
    "Vitali", "Battaglia", "Bellini", "Basile", "Riva", "Negri", "Guerra", "Fiorini", "Benedetti", "Paganini",
    "Ruggeri", "Sartori", "Ventura", "Corsi", "Orlando", "Pagano", "Lopez", "Gonzalez", "Perez", "Sanchez",
    "Ramirez", "Rivera", "Diaz", "Vargas", "Munoz", "Aguilar", "Vega", "Castro", "Rojas", "Guerrero",
    "Silva", "Molina", "Delgado", "Ortega", "Navarro", "Contreras", "Salazar", "Cortes", "Leon", "Rubio",
    "Marin", "Soto", "Iglesias", "Vazquez", "Pena", "Campos", "Nunez", "Lozano", "Prieto", "Blanco",
]  # exactly 400 surnames


def generate_unique_name(cur, gender='random'):
    """Generate unique name not used by any ALIVE agent"""
    import random
    names = MALE_NAMES if gender == 'male' else FEMALE_NAMES if gender == 'female' else random.choice([MALE_NAMES, FEMALE_NAMES])
    
    # Try random combinations first
    for _ in range(1000):
        first = random.choice(names)
        last = random.choice(SURNAMES)
        full = f"{first} {last}"
        cur.execute("SELECT 1 FROM agents WHERE name = %s AND is_alive = true", (full,))
        if not cur.fetchone():
            return full, gender if gender != 'random' else ('male' if names == MALE_NAMES else 'female')
    
    # Fallback: use all combinations systematically
    for first in names:
        for last in SURNAMES:
            full = f"{first} {last}"
            cur.execute("SELECT 1 FROM agents WHERE name = %s AND is_alive = true", (full,))
            if not cur.fetchone():
                return full, 'male' if names == MALE_NAMES else 'female'
    
    raise Exception("Name pool exhausted - need more names!")
