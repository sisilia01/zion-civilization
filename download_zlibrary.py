#!/usr/bin/env python3
import requests, time, random, os, zipfile, io, re
from html.parser import HTMLParser

PROXY = "socks5h://gYecdYn5:wTJL6EPG@193.58.178.167:62819"
PROXIES = {"http": PROXY, "https": PROXY}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://z-lib.id/",
}
COOKIES = {
    "_ga": "GA1.1.2036325758.1781078081",
    "XSRF-TOKEN": "eyJpdiI6IkJYTGhMeUh6NzdjZFpPS0VXbEJxbGc9PSIsInZhbHVlIjoiL0pZQktSem8wYlhGV0FZNENNckZmcnBsdm45ODdObS9PYUxkbVY2SStNbHJhSTRIeDBBL0NpY3FsWkpDWko3Q1lhai9UbjdiN056ZUNKbWhrV0pNeGRMZmF2d2ZjZ1lBekg5RDM2R1k4LzRvaFIwWE54QmU5QmIxY0hNc0FSSHYiLCJtYWMiOiJkMWFiNWM5YTRiNTFjNGIyMzY2MWU2MmMxYTcxMmI4ZDQyNGU2YTJiZTU1NDk4MzE1YzJlNjcxMjI3MWFkOTJkIiwidGFnIjoiIn0%3D",
    "zl_logged_in": "eyJpdiI6IlZVZ0NqRmZVUGV5dmZZZWE3ZnZkRGc9PSIsInZhbHVlIjoiQnVsTFpucmV6dDNiNXJnUHkxSndTQUdablkxL2ZJRHJLOUIxL1IwaU1mNXVnUWxCK0R0OE5QUi9TcWcyb0Q1QiIsIm1hYyI6IjU1MGM5NmQ0MDg4NGY2MmU2ZmQwYzllMmI1NWY0YWY5NmI1YWNmNjliMThlOTAwNjcxYWEyYmU1NGQxZjFkZjEiLCJ0YWciOiIifQ%3D%3D",
}
OUT = "/root/zion_backend/knowledge_base/books"
os.makedirs(OUT, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update(HEADERS)
SESSION.proxies.update(PROXIES)
SESSION.cookies.update(COOKIES)
SESSION.trust_env = False

SKIP = ['zwierzat','zwierząt','italiano','grafica','historia','beeldverhaal',
        'bogów','edizione','française','deutsch','español','polski',
        'arabic','chinese','japanese','korean','portuguese','türkçe']

def slug(t):
    return re.sub(r'[^\w]+','_',t.lower()).strip('_')[:50]+'.txt'

class HTMLText(HTMLParser):
    def __init__(self): super().__init__(); self.t=[]; self.skip=False
    def handle_starttag(self,tag,a):
        if tag in('script','style','head'): self.skip=True
    def handle_endtag(self,tag):
        if tag in('script','style','head'): self.skip=False
    def handle_data(self,d):
        if not self.skip and d.strip(): self.t.append(d.strip())

def extract_epub(content):
    parts=[]
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            for name in sorted(z.namelist()):
                if name.endswith(('.html','.htm','.xhtml')):
                    p=HTMLText()
                    p.feed(z.read(name).decode('utf-8',errors='ignore'))
                    text=' '.join(p.t)
                    if len(text)>100: parts.append(text)
    except: pass
    return '\n\n'.join(parts)

def search_zlibrary(title, author):
    q = f"{title} {author}"
    url = f"https://z-lib.id/s?q={requests.utils.quote(q)}&language=english"
    try:
        r = SESSION.get(url, timeout=20)
        if r.status_code != 200: return None
        links = re.findall(r'href="(/book/[^"]+)"', r.text)
        seen = set(); unique = []
        for l in links:
            if l not in seen: seen.add(l); unique.append(l)
        for link in unique:
            if not any(w in link.lower() for w in SKIP):
                return "https://z-lib.id" + link
        if unique: return "https://z-lib.id" + unique[0]
    except Exception as e:
        print(f"  Search error: {e}", flush=True)
    return None

def get_download_url(book_url):
    try:
        r = SESSION.get(book_url, timeout=20)
        if r.status_code != 200: return None
        patterns = [
            r'href="(/dl/[^"]+)"',
            r'"(https://[^"]*z-lib[^"]*/dl/[^"]+)"',
            r'href="(/book/[^"]+/download[^"]*)"',
            r'dlButton[^>]*href="([^"]+)"',
            r'href="([^"]+)"[^>]*class="[^"]*dlButton[^"]*"',
        ]
        for pat in patterns:
            matches = re.findall(pat, r.text)
            if matches:
                dl = matches[0]
                if dl.startswith('/'): dl = "https://z-lib.id" + dl
                return dl
        # Debug — показываем первые 500 символов страницы
        print(f"  DEBUG page: {r.text[:300]}", flush=True)
    except Exception as e:
        print(f"  Book page error: {e}", flush=True)
    return None

def download_book(title, author):
    fpath = os.path.join(OUT, slug(title))
    if os.path.exists(fpath) and os.path.getsize(fpath) > 50000:
        return 'cached'
    book_url = search_zlibrary(title, author)
    if not book_url: return 'not_found'
    time.sleep(random.uniform(1,2))
    dl_url = get_download_url(book_url)
    if not dl_url: return 'no_download'
    time.sleep(random.uniform(1,2))
    try:
        r = SESSION.get(dl_url, timeout=60)
        if r.status_code != 200 or len(r.content) < 10000:
            return f'dl_fail_{r.status_code}_{len(r.content)}b'
        content_type = r.headers.get('content-type','').lower()
        if 'epub' in content_type or dl_url.endswith('.epub'):
            text = extract_epub(r.content)
        elif 'pdf' in content_type or dl_url.endswith('.pdf'):
            try:
                import pdfminer.high_level
                text = pdfminer.high_level.extract_text(io.BytesIO(r.content))
            except: return 'pdf_fail'
        else:
            text = extract_epub(r.content)
            if not text or len(text)<1000: text = r.text
        if text and len(text) > 10000:
            with open(fpath,'w',encoding='utf-8') as f: f.write(text[:5_000_000])
            return f'ok_{len(text)//1024}kb'
        return 'empty'
    except Exception as e:
        return f'error_{str(e)[:40]}'

books = [
    ("Sapiens","Harari"), ("Thinking Fast and Slow","Kahneman"),
    ("The Black Swan","Taleb"), ("Antifragile","Taleb"),
    ("Superintelligence","Bostrom"), ("Life 3.0","Tegmark"),
    ("Being and Time","Heidegger"), ("Consciousness Explained","Dennett"),
    ("Godel Escher Bach","Hofstadter"), ("The Order of Time","Rovelli"),
    ("Brave New World","Huxley"), ("Nineteen Eighty Four","Orwell"),
    ("A Brief History of Time","Hawking"), ("The Selfish Gene","Dawkins"),
    ("Guns Germs and Steel","Diamond"), ("Man's Search for Meaning","Frankl"),
    ("The Lucifer Effect","Zimbardo"), ("Obedience to Authority","Milgram"),
    ("The Body Keeps the Score","Van der Kolk"), ("Behave","Sapolsky"),
    ("The Gene","Mukherjee"), ("Applied Cryptography","Schneier"),
    ("Ghost in the Wires","Mitnick"), ("Real World Bug Hunting","Yaworski"),
    ("Black Hat Python","Seitz"), ("Hacking Art of Exploitation","Erickson"),
    ("Countdown to Zero Day","Zetter"), ("The Road to Serfdom","Hayek"),
    ("The Protestant Ethic","Weber"), ("Thinking in Systems","Meadows"),
    ("Emergence","Holland"), ("Linked","Barabasi"),
    ("Structure Scientific Revolutions","Kuhn"), ("Governing the Commons","Ostrom"),
    ("Debt First 5000 Years","Graeber"), ("Misbehaving","Thaler"),
    ("Predictably Irrational","Ariely"), ("Capital Twenty First Century","Piketty"),
    ("The Alignment Problem","Christian"), ("Human Compatible","Russell"),
    ("The Conscious Mind","Chalmers"), ("Descartes Error","Damasio"),
    ("The Emperor's New Mind","Penrose"), ("Pale Blue Dot","Sagan"),
    ("The Singularity Is Near","Kurzweil"), ("The Coming Wave","Suleyman"),
    ("The Age of Surveillance Capitalism","Zuboff"), ("Homo Deus","Harari"),
    ("The Denial of Death","Becker"), ("The Art of Loving","Fromm"),
    ("Escape from Freedom","Fromm"), ("The Society of Mind","Minsky"),
    ("Cybernetics","Wiener"), ("Mastering Bitcoin","Antonopoulos"),
    ("The Bitcoin Standard","Ammous"), ("The 48 Laws of Power","Greene"),
    ("Good to Great","Collins"), ("Incognito","Eagleman"),
    ("The Brain That Changes Itself","Doidge"), ("Sandworm","Greenberg"),
    ("The Art of Intrusion","Mitnick"), ("The Blank Slate","Pinker"),
    ("How the Mind Works","Pinker"), ("The Language Instinct","Pinker"),
]

ok=fail=cached=0
total=len(books)
for i,(title,author) in enumerate(books,1):
    print(f"📖 [{i}/{total}] {title}...", flush=True)
    result = download_book(title, author)
    if result=='cached':
        print(f"  ⏭️  cached", flush=True); cached+=1
    elif result.startswith('ok_'):
        print(f"  ✅ {result}", flush=True); ok+=1
    else:
        print(f"  ❌ {result}", flush=True); fail+=1
    time.sleep(random.uniform(3,5))

print(f"\n{'='*50}")
print(f"✅ {ok} | ⏭️ {cached} | ❌ {fail}")
print(f"{'='*50}")
