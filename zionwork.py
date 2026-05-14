import psycopg2
import random
from datetime import datetime

conn = psycopg2.connect(
    host="localhost",
    database="zion_db",
    user="zion_user",
    password="zion2026"
)

TASKS = [
    {"title": "Guard the clan treasury", "reward": 5.0, "skill": "aggression"},
    {"title": "Spy on rival clan", "reward": 8.0, "skill": "charisma"},
    {"title": "Collect taxes from poor", "reward": 3.0, "skill": "aggression"},
    {"title": "Write propaganda for the prophet", "reward": 4.0, "skill": "charisma"},
    {"title": "Train new clan recruits", "reward": 6.0, "skill": "aggression"},
    {"title": "Negotiate peace treaty", "reward": 10.0, "skill": "charisma"},
    {"title": "Build clan fortifications", "reward": 7.0, "skill": "aggression"},
    {"title": "Spread faith among poor", "reward": 4.0, "skill": "faith"},
    {"title": "Organize rebellion suppression", "reward": 9.0, "skill": "aggression"},
    {"title": "Deliver secret message", "reward": 5.0, "skill": "charisma"},
]

def create_table():
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
            employer_id INTEGER REFERENCES agents(id),
            worker_id INTEGER REFERENCES agents(id),
            title VARCHAR(100) NOT NULL,
            reward DECIMAL(20,2) NOT NULL,
            skill VARCHAR(20) NOT NULL,
            status VARCHAR(20) DEFAULT 'open',
            created_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP DEFAULT NULL
        )
    """)
    conn.commit()
    cur.close()

def run_zionwork():
    cur = conn.cursor()
    
    print(f"\n⚒️  ZionWork - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    
    # Rich agents post jobs
    cur.execute("""
        SELECT id, name, balance FROM agents
        WHERE is_alive = TRUE AND balance > 20
        ORDER BY RANDOM() LIMIT 3
    """)
    employers = cur.fetchall()
    
    jobs_posted = 0
    for emp_id, emp_name, emp_balance in employers:
        if random.random() > 0.40:
            continue
        
        task = random.choice(TASKS)
        reward = task['reward']
        
        cur.execute("""
            INSERT INTO jobs (employer_id, title, reward, skill)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (emp_id, task['title'], reward, task['skill']))
        
        job_id = cur.fetchone()[0]
        
        # Deduct reward from employer (escrow)
        cur.execute("UPDATE agents SET balance = balance - %s WHERE id = %s",
                   (reward, emp_id))
        
        print(f"📋 {emp_name} posted job: '{task['title']}' ({reward} ZION)")
        jobs_posted += 1
        
        # Find worker with matching skill
        cur.execute(f"""
            SELECT id, name, {task['skill']} as skill_val FROM agents
            WHERE is_alive = TRUE AND id != %s
            ORDER BY {task['skill']} DESC, RANDOM() LIMIT 1
        """, (emp_id,))
        worker = cur.fetchone()
        
        if worker:
            worker_id, worker_name, skill_val = worker
            
            # Complete job (streaming payment)
            worker_reward = reward * 0.98  # 2% commission
            
            cur.execute("UPDATE agents SET balance = balance + %s WHERE id = %s",
                       (worker_reward, worker_id))
            
            cur.execute("""
                UPDATE jobs SET worker_id = %s, status = 'completed', completed_at = NOW()
                WHERE id = %s
            """, (worker_id, job_id))
            
            cur.execute("""
                INSERT INTO events (agent_id, event_type, description, zion_amount)
                VALUES (%s, 'work', %s, %s)
            """, (worker_id, f"{worker_name} completed '{task['title']}' for {emp_name}", worker_reward))
            
            print(f"  ✅ {worker_name} completed task! Earned {worker_reward:.2f} ZION")
    
    conn.commit()
    
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status = 'completed'")
    completed = cur.fetchone()[0]
    
    print(f"\n📊 Jobs posted: {jobs_posted} | Total completed: {completed}")
    print(f"✅ ZionWork cycle complete!\n")
    cur.close()

if __name__ == "__main__":
    create_table()
    run_zionwork()
