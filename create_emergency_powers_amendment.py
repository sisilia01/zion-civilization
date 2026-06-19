#!/usr/bin/env python3
"""
One-off: propose and enact the Emergency Powers Act.

Run manually after review:
    cd /root/zion_backend && python3 create_emergency_powers_amendment.py

Pipeline: propose_amendment -> run_vote -> zco_tribunal.convene -> enact (if unanimous)
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

TITLE = "Emergency Powers Act"
DESCRIPTION = (
    "Defines and limits crisis powers: when unemployment exceeds 95% or revolution "
    "pressure exceeds 100, the state of emergency automatically grants: (1) temporary "
    "tax redirection to police/security, (2) emergency ZRS lending without standard "
    "revenue requirements, (3) priority hiring incentives. Emergency powers "
    "automatically expire when unemployment drops below 60% or after 30 days, "
    "whichever comes first. The President cannot unilaterally declare emergency — "
    "it is a constitutional, threshold-triggered state, not an executive decision."
)
CHANGE_TYPE = "governance_rule"


def main() -> int:
    from amendments import ensure_tables, propose_amendment, run_vote
    from enact_amendment import enact
    from zco_tribunal import convene, get_amendment

    ensure_tables()
    aid = propose_amendment(TITLE, DESCRIPTION, CHANGE_TYPE, proposed_by=None)
    if aid is None:
        print("[emergency] duplicate open proposal — aborting")
        return 1

    print(f"[emergency] proposed amendment id={aid}")
    vote_result = run_vote(aid, CHANGE_TYPE)
    print(
        f"[emergency] vote: passed={vote_result['passed']} "
        f"tally={vote_result.get('tally')}"
    )
    if not vote_result.get("passed"):
        print("[emergency] amendment failed popular vote — stopping")
        return 1

    amendment_data = get_amendment(aid)
    if not amendment_data:
        print(f"[emergency] amendment #{aid} not found after vote")
        return 1

    tribunal = asyncio.run(convene(amendment_data, vote_result["tally"]))
    print(f"[emergency] tribunal: {tribunal}")
    if not tribunal.get("unanimous"):
        print("[emergency] tribunal did not approve unanimously — not enacting")
        return 1

    result = enact(aid, allow_soft=True)
    print(f"[emergency] enact result: {result}")
    if result not in ("enacted", "enacted_pending_onchain"):
        print("[emergency] enact failed")
        return 1

    from amendment_enforcer import get_param

    expire_days = get_param("emergency_auto_expire_days", 0)
    exit_unemployment = get_param("emergency_unemployment_exit_threshold", 60)
    print(f"[emergency] emergency_auto_expire_days = {expire_days}")
    print(f"[emergency] emergency_unemployment_exit_threshold = {exit_unemployment}")
    print("[emergency] done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
