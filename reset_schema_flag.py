#!/usr/bin/env python3
"""Запускать при деплое если добавлены новые колонки —
сбрасывает флаг чтобы ensure_schema пересоздал схему один раз."""
from civ_common import get_conn, get_cursor


def main():
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        cur.execute(
            "DELETE FROM constitutional_params WHERE param_key = 'schema_initialized'"
        )
        conn.commit()
        print("Schema flag reset — next script run will re-run migrations")
    except Exception as exc:
        conn.rollback()
        print(f"Schema flag reset failed: {exc}")
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
