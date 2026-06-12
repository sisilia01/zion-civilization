#!/usr/bin/env python3
import os
import random
import psycopg2
import psycopg2.extras
from openrouter_key import _load_env_file

_load_env_file()
DB = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}
SENTENCE_TEMPLATES = [
    "We must {0} before they {1}.",
    "I have decided to {0} regarding {1}.",
    "The council discusses {0} and {1} today.",
    "Our people need {0}, but fear {1}.",
    "Beware — {0} leads to {1}.",
    "{0} is rising while {1} fades among us.",
    "I sense {0} nearby, and {1} will follow.",
    "Let us trade {0} for {1} while we still can.",
    "Word has spread: {0} threatens our {1}.",
    "Some say {0} is the answer to {1}.",
]

conn = psycopg2.connect(**DB)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# 1. Delete pure single-letter garbage entries
cur.execute("DELETE FROM agent_messages_zion WHERE true_meaning ~ '^[a-zA-Z]$'")
deleted = cur.rowcount
print(f"Deleted {deleted} single-letter garbage rows")

# 2. Wrap word-salad true_meaning (2-6 words, no punctuation, all lowercase content words)
# into a proper sentence using SENTENCE_TEMPLATES
cur.execute("""
    SELECT id, true_meaning FROM agent_messages_zion
    WHERE true_meaning !~ '[.!?]'
      AND array_length(regexp_split_to_array(true_meaning, '\\s+'), 1) BETWEEN 2 AND 6
""")
rows = cur.fetchall()
print(f"Found {len(rows)} word-salad rows to rewrap")

cur2 = conn.cursor()
for row in rows:
    words = row["true_meaning"].split()
    c0, c1 = words[0], words[1] if len(words) > 1 else words[0]
    new_meaning = random.choice(SENTENCE_TEMPLATES).format(c0, c1)
    cur2.execute(
        "UPDATE agent_messages_zion SET true_meaning = %s WHERE id = %s",
        (new_meaning, row["id"]),
    )

# 3. Clean up single-char entries in zion_vocab (root cause prevention)
cur2.execute("DELETE FROM zion_vocab WHERE true_meaning ~ '^[a-zA-Z]$'")
print(f"Deleted {cur2.rowcount} single-letter zion_vocab entries")

conn.commit()
cur.close()
cur2.close()
conn.close()
print("Done.")
