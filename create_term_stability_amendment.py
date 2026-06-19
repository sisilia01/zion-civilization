#!/usr/bin/env python3
"""
One-off: propose and enact the Presidential Term Stability Act.

Run manually after review:
    cd /root/zion_backend && python3 create_term_stability_amendment.py

Pipeline: propose_amendment → run_vote → zco_tribunal.convene → enact (allow_soft=True)

Sets constitutional_params.term_limit_days = 3 (supersedes the prior 1-day limit).
Current president keeps office; the new limit applies to term-end checks going forward.
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

TITLE = "Presidential Term Stability Act"
DESCRIPTION = (
    "Establishes a 3-day presidential term, providing sufficient time for "
    "executive action and policy implementation while maintaining democratic "
    "accountability through regular elections. This supersedes the prior 1-day "
    "term limit which proved too brief for effective governance."
)
CHANGE_TYPE = "governance_rule"


def main() -> int:
    from amendments import ensure_tables, propose_amendment, run_vote
    from enact_amendment import enact
    from zco_tribunal import convene, get_amendment

    ensure_tables()

    aid = propose_amendment(TITLE, DESCRIPTION, CHANGE_TYPE, proposed_by=None)
    if aid is None:
        print("[term_stability] duplicate open proposal — aborting")
        return 1

    print(f"[term_stability] proposed amendment id={aid}")

    vote_result = run_vote(aid, CHANGE_TYPE)
    print(
        f"[term_stability] vote: passed={vote_result['passed']} "
        f"tally={vote_result.get('tally')}"
    )
    if not vote_result.get("passed"):
        print("[term_stability] amendment failed popular vote — stopping")
        return 1

    amendment_data = get_amendment(aid)
    if not amendment_data:
        print(f"[term_stability] amendment #{aid} not found after vote")
        return 1

    tribunal = asyncio.run(convene(amendment_data, vote_result["tally"]))
    print(f"[term_stability] tribunal: {tribunal}")

    if not tribunal.get("unanimous"):
        print("[term_stability] tribunal did not approve unanimously — not enacting")
        return 1

    result = enact(aid, allow_soft=True)
    print(f"[term_stability] enact result: {result}")

    if result not in ("enacted", "enacted_pending_onchain"):
        print("[term_stability] enact failed")
        return 1

    from amendment_enforcer import apply_enacted_amendments, get_param

    applied = apply_enacted_amendments()
    print(f"[term_stability] enforcer applied: {applied}")

    term_days = get_param("term_limit_days", 1)
    print(f"[term_stability] term_limit_days constitutional param = {term_days}")
    print("[term_stability] done — 3-day presidential term is now binding")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
