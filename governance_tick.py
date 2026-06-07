#!/usr/bin/env python3
"""
ZION Unified Governance Tick — USA-style democracy cycle (every 30 min).

Order: FRS Chief → ZRS execute → President → Senate → Sheriff
In-memory ctx dict only — no shared tick_context in civilization_state.
"""
from __future__ import annotations

import signal
import time
import traceback
from datetime import datetime
from typing import Callable, TypeVar

import psycopg2.errors

from civ_common import (
    bump_governance_tick_id,
    check_money_conservation,
    ensure_martial_law_columns,
    get_conn,
    get_cursor,
    log_event,
    log_governance_step,
)

STEP_TIMEOUT_SEC = 30

T = TypeVar("T")


def _timeout_handler(signum, frame):
    raise TimeoutError(f"Step timed out after {STEP_TIMEOUT_SEC}s")


def _run_step(step_label: str, fn: Callable[..., T], *args, **kwargs) -> T:
    print(step_label, flush=True)
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(STEP_TIMEOUT_SEC)
    try:
        return fn(*args, **kwargs)
    finally:
        signal.alarm(0)


def _test_db_connection() -> bool:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        print("DB connected OK", flush=True)
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"DB connection failed: {e}", flush=True)
        return False


def _run_step_or_skip(
    step_label: str,
    fn: Callable[..., dict],
    cur,
    conn,
    ctx: dict,
    *args,
    **kwargs,
) -> dict:
    """Run a governance step; on any error rollback and continue."""
    try:
        return _run_step(step_label, fn, cur, ctx, *args, **kwargs)
    except Exception as e:
        print(f"⚠️ {step_label} skipped: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        try:
            conn.rollback()
        except Exception:
            pass
        return ctx


def _commit_or_skip(conn, label: str) -> bool:
    try:
        conn.commit()
        return True
    except (psycopg2.errors.LockNotAvailable, psycopg2.errors.DeadlockDetected) as e:
        try:
            conn.rollback()
        except Exception:
            pass
        print(f"⚠️ commit skipped after {label}: {e}", flush=True)
        return False


def _log_step_or_skip(
    conn,
    cur,
    tick_id: int,
    step_name: str,
    summary: str,
    detail,
    commit_label: str,
) -> None:
    """Log governance step; rollback and continue on failure."""
    try:
        log_governance_step(cur, tick_id, step_name, summary, detail)
        _commit_or_skip(conn, commit_label)
    except Exception as e:
        print(f"⚠️ {commit_label} log/commit skipped: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        try:
            conn.rollback()
        except Exception:
            pass


def _run_governance_tick_once() -> dict:
    print("Getting DB cursor for tick...", flush=True)
    conn = get_conn()
    cur = get_cursor(conn)
    try:
        conn.rollback()  # Clear any stale/aborted transaction
    except Exception:
        pass
    cur.execute("SET lock_timeout = '100ms'")
    cur.execute("SET statement_timeout = '30s'")

    try:
        ensure_martial_law_columns(cur)
        _commit_or_skip(conn, "martial_law columns")

        tick_id = bump_governance_tick_id(cur)
        ctx: dict = {"tick_id": tick_id, "started_at": datetime.utcnow().isoformat()}
        _commit_or_skip(conn, "tick_id bump")

        print(f"\n{'='*60}", flush=True)
        print(f"GOVERNANCE TICK #{tick_id} — {datetime.now().strftime('%Y-%m-%d %H:%M')}", flush=True)
        print(f"{'='*60}", flush=True)

        from frs_chief import run_frs_chief_tick
        from zrs import execute_frs_directive

        # 1. FRS Chief — independent monetary policy
        print("Starting FRS Chief tick...", flush=True)
        ctx = _run_step_or_skip("Step 1: FRS Chief...", run_frs_chief_tick, cur, conn, ctx)
        _log_step_or_skip(
            conn, cur, tick_id, "frs_chief",
            ctx.get("frs_chief", {}).get("summary", "—"),
            ctx.get("frs_chief"),
            "frs_chief",
        )

        # 2. ZRS executes FRS directive (no autonomous policy)
        def _zrs_step(c, ctx_in: dict) -> dict:
            result = execute_frs_directive(c, ctx_in)
            ctx_in["zrs"] = result
            return ctx_in

        ctx = _run_step_or_skip("Step 2: ZRS...", _zrs_step, cur, conn, ctx)
        zrs_result = ctx.get("zrs", {})
        _log_step_or_skip(
            conn, cur, tick_id, "zrs",
            zrs_result.get("headline") or zrs_result.get("reason", "—"),
            zrs_result,
            "zrs",
        )

        # 3. President — executive
        print("Step 3: President (import)...", flush=True)
        from president import run_governance_tick as president_tick

        ctx = _run_step_or_skip("Step 3: President...", president_tick, cur, conn, ctx)
        _log_step_or_skip(
            conn, cur, tick_id, "president",
            str(ctx.get("president", {}).get("summary", "—")),
            ctx.get("president"),
            "president",
        )

        # 4. Senate — legislative
        print("Step 4: Senate (import)...", flush=True)
        from senate import run_governance_tick as senate_tick

        ctx = _run_step_or_skip("Step 4: Senate...", senate_tick, cur, conn, ctx)
        _log_step_or_skip(
            conn, cur, tick_id, "senate",
            str(ctx.get("senate", {}).get("summary", "—")),
            ctx.get("senate"),
            "senate",
        )

        # 5. Sheriff — law enforcement
        print("Step 5: Sheriff (import)...", flush=True)
        from sheriff import run_governance_tick as sheriff_tick

        ctx = _run_step_or_skip("Step 5: Sheriff...", sheriff_tick, cur, conn, ctx)
        _log_step_or_skip(
            conn, cur, tick_id, "sheriff",
            str(ctx.get("sheriff", {}).get("summary", "—")),
            ctx.get("sheriff"),
            "sheriff",
        )

        # 6. Courts + money conservation
        from courts import run_courts_tick

        def _courts_step(c, ctx_in: dict) -> dict:
            run_courts_tick(c, ctx_in)
            return ctx_in

        ctx = _run_step_or_skip("Step 6: Courts...", _courts_step, cur, conn, ctx)
        try:
            ledger = check_money_conservation(cur, label=f"tick_{tick_id}")
            ctx["money_ledger"] = ledger
            log_event(
                cur,
                None,
                "governance",
                f"✅ Governance tick #{tick_id} complete — total ZION {ledger['total']:,.0f}",
                ledger["total"],
                priority="normal",
            )
            _commit_or_skip(conn, "complete")
        except Exception as e:
            print(f"⚠️ money conservation skipped: {e}", flush=True)
            print(traceback.format_exc(), flush=True)
            try:
                conn.rollback()
            except Exception:
                pass

        print(f"\n✅ Governance tick #{tick_id} complete", flush=True)
        return ctx

    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        cur.close()
        conn.close()


def run_governance_tick() -> dict | None:
    print("Starting governance tick...", flush=True)

    if not _test_db_connection():
        return None

    max_retries = 3
    for attempt in range(max_retries):
        try:
            return _run_governance_tick_once()
        except psycopg2.errors.DeadlockDetected:
            print(f"Deadlock on attempt {attempt + 1}, retrying in 5s...", flush=True)
            if attempt == max_retries - 1:
                print("Deadlock: max retries exceeded", flush=True)
                return None
            time.sleep(5)
        except Exception as e:
            print(f"Tick failed: {e}", flush=True)
            print(traceback.format_exc(), flush=True)
            return None
    return None


def main():
    run_governance_tick()


if __name__ == "__main__":
    main()
