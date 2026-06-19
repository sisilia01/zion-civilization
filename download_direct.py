#!/usr/bin/env python3
"""Direct book downloader - Anna's Archive + Libgen + Open Library"""
import requests, time, random, os, zipfile, io
from html.parser import HTMLParser

OUT = "/root/zion_backend/knowledge_base/books"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.5"}
os.makedirs(OUT, exist_ok=True)

def slug(t): return t.lower().replace(' ','_').replace("'",'').replace(',','').replace(':','')[:50]+'.txt'

def extract_epub(content):
    class P(HTMLParser):
        def __init__(self): super().__init__(); self.t=[]; self.skip=False
        def handle_starttag(self,tag,a):
            if tag in('script','style','head'): self.skip=True
        def handle_endtag(self,tag):
            if tag in('script','style','head'): self.skip=False
        def handle_data(self,d):
            if not self.skip and d.strip(): self.t.append(d.strip())
    parts=[]
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            for name in sorted(z.namelist()):
                if name.endswith(('.html','.htm','.xhtml')):
                    p=P(); p.feed(z.read(name).decode('utf-8',errors='ignore'))
                    text=' '.join(p.t)
                    if len(text)>100: parts.append(text)
    except: pass
    return '\n\n'.join(parts)

def try_libgen(title, author):
    try:
        q = f"{title} {author}".replace(' ','+')
        r = requests.get(f"http://libgen.is/search.php?req={q}&column=title&res=10",
                        headers=HEADERS, timeout=15)
        # Parse MD5 from table
        import re
        md5s = re.findall(r'[a-f0-9]{32}', r.text)
        if not md5s: return None
        for md5 in md5s[:3]:
            try:
                page = requests.get(f"http://library.lol/main/{md5}", headers=HEADERS, timeout=15)
                links = re.findall(r'href="(https?://[^"]*\.epub[^"]*)"', page.text)
                if not links:
                    links = re.findall(r'href="(https?://[^"]*\.pdf[^"]*)"', page.text)
                if links:
                    dl = requests.get(links[0], headers=HEADERS, timeout=30)
                    if len(dl.content) > 10000:
                        if links[0].endswith('.epub') or 'epub' in dl.headers.get('content-type',''):
                            text = extract_epub(dl.content)
                        else:
                            try:
                                import pdfminer.high_level
                                text = pdfminer.high_level.extract_text(io.BytesIO(dl.content))
                            except:
                                text = None
                        if text and len(text) > 10000:
                            return text
            except: continue
    except: pass
    return None

def try_archive(title, author):
    try:
        import urllib.parse
        q = urllib.parse.quote(f'title:"{title}"')
        r = requests.get(f"https://archive.org/advancedsearch.php?q={q}&fl[]=identifier&output=json&rows=5",
                        headers=HEADERS, timeout=15)
        data = r.json()
        ids = [d['identifier'] for d in data.get('response',{}).get('docs',[])]
        for ident in ids[:3]:
            for ext in ['_djvu.txt', '.txt', '_full.txt']:
                try:
                    url = f"https://archive.org/download/{ident}/{ident}{ext}"
                    r2 = requests.get(url, headers=HEADERS, timeout=20)
                    if r2.status_code==200 and len(r2.text)>10000:
                        return r2.text
                except: continue
    except: pass
    return None

def try_annas(title, author):
    try:
        import re, urllib.parse
        q = urllib.parse.quote(f"{title} {author}")
        r = requests.get(f"https://annas-archive.org/search?q={q}&ext=epub&lang=en",
                        headers=HEADERS, timeout=15)
        md5s = re.findall(r'/md5/([a-f0-9]{32})', r.text)
        if not md5s: return None
        for md5 in md5s[:2]:
            try:
                page = requests.get(f"https://annas-archive.org/md5/{md5}",
                                   headers=HEADERS, timeout=15)
                links = re.findall(r'href="(https?://[^"]*)"[^>]*>.*?[Dd]ownload', page.text)
                if not links:
                    links = re.findall(r'"(https?://[^"]*\.epub[^"]*)"', page.text)
                for link in links[:2]:
                    try:
                        dl = requests.get(link, headers=HEADERS, timeout=30)
                        if len(dl.content)>10000:
                            text = extract_epub(dl.content)
                            if text and len(text)>10000: return text
                    except: continue
            except: continue
    except: pass
    return None

books = [
    ("Being and Time","Heidegger"),
    ("Consciousness Explained","Dennett"),
    ("The Conscious Mind","Chalmers"),
    ("Godel Escher Bach","Hofstadter"),
    ("Thinking Fast and Slow","Kahneman"),
    ("Man's Search for Meaning","Frankl"),
    ("Sapiens","Harari"),
    ("The Black Swan","Taleb"),
    ("Antifragile","Taleb"),
    ("The Selfish Gene","Dawkins"),
    ("Guns Germs and Steel","Diamond"),
    ("Superintelligence","Bostrom"),
    ("Life 3.0","Tegmark"),
    ("The Order of Time","Rovelli"),
    ("Debt The First 5000 Years","Graeber"),
    ("Governing the Commons","Ostrom"),
    ("Emergence","Holland"),
    ("Linked","Barabasi"),
    ("The Structure of Scientific Revolutions","Kuhn"),
    ("Cybernetics","Wiener"),
    ("Behave","Sapolsky"),
    ("Misbehaving","Thaler"),
    ("Predictably Irrational","Ariely"),
    ("The Gene","Mukherjee"),
    ("Pale Blue Dot","Sagan"),
    ("A Brief History of Time","Hawking"),
    ("The Lucifer Effect","Zimbardo"),
    ("Obedience to Authority","Milgram"),
    ("Descartes Error","Damasio"),
    ("Capital in the Twenty First Century","Piketty"),
    ("Applied Cryptography","Schneier"),
    ("Ghost in the Wires","Mitnick"),
    ("Real World Bug Hunting","Yaworski"),
    ("Black Hat Python","Seitz"),
    ("Hacking The Art of Exploitation","Erickson"),
    ("The Singularity Is Near","Kurzweil"),
    ("Human Compatible","Russell"),
    ("Thinking in Systems","Meadows"),
    ("The Body Keeps the Score","Van der Kolk"),
    ("The Brain That Changes Itself","Doidge"),
    ("Incognito","Eagleman"),
    ("The Age of Surveillance Capitalism","Zuboff"),
    ("The Alignment Problem","Christian"),
    ("The Coming Wave","Suleyman"),
    ("Brave New World","Huxley"),
    ("Nineteen Eighty Four","Orwell"),
    ("The Protestant Ethic","Weber"),
    ("The General Theory","Keynes"),
    ("The Road to Serfdom","Hayek"),
    ("Countdown to Zero Day","Zetter"),
]

ok=fail=skip=0
total=len(books)

for i,(title,author) in enumerate(books,1):
    fpath=os.path.join(OUT,slug(title))
    if os.path.exists(fpath) and os.path.getsize(fpath)>50000:
        print(f"⏭️  [{i}/{total}] {title} — cached", flush=True)
        skip+=1; continue

    print(f"📖 [{i}/{total}] {title}...", flush=True)

    text=None
    # Try sources in order
    for source_name, source_fn in [
        ("Libgen", lambda: try_libgen(title,author)),
        ("Anna's Archive", lambda: try_annas(title,author)),
        ("Archive.org", lambda: try_archive(title,author)),
    ]:
        try:
            text = source_fn()
            if text and len(text)>10000:
                print(f"  → found on {source_name}", flush=True)
                break
        except: pass
        time.sleep(random.uniform(1,2))

    if text and len(text)>10000:
        with open(fpath,'w',encoding='utf-8') as f:
            f.write(text[:5_000_000])
        print(f"✅ [{i}/{total}] {title} ({len(text)//1024}kb)", flush=True)
        ok+=1
    else:
        print(f"❌ [{i}/{total}] {title} — not found", flush=True)
        fail+=1

    time.sleep(random.uniform(3,5))

print(f"\n{'='*40}")
print(f"✅ Downloaded: {ok} | ❌ Failed: {fail} | ⏭️ Cached: {skip}")
print(f"{'='*40}")
