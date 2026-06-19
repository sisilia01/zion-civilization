#!/usr/bin/env python3
"""
One-off: propose and enact the Separation of Powers Act.

Run manually after review:
    cd /root/zion_backend && python3 create_separation_of_powers_amendment.py

Pipeline: propose_amendment → run_vote → zco_tribunal.convene → enact (if unanimous)

Non-retroactivity: existing officeholders (e.g. Elsa Vlasov as FRS Chief) are
not removed; cooling_off_days applies only to future nominations.
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

TITLE = "Separation of Powers Act"
DESCRIPTION = (
    "No agent who has served as President, Sheriff, or Senate Speaker may be "
    "nominated or confirmed for ANY other senior governmental role (FRS Chief, "
    "Sheriff, Senate Speaker, President) for a cooling-off period of 30 days "
    "after leaving office. This prevents concentration of power across branches "
    "of government."
)
CHANGE_TYPE = "governance_rule"


def main() -> int:
    from amendments import ensure_tables, propose_amendment, run_vote
    from enact_amendment import enact
    from zco_tribunal import convene, get_amendment

    ensure_tables()

    aid = propose_amendment(TITLE, DESCRIPTION, CHANGE_TYPE, proposed_by=None)
    if aid is None:
        print("[separation] duplicate open proposal — aborting")
        return 1

    print(f"[separation] proposed amendment id={aid}")

    vote_result = run_vote(aid, CHANGE_TYPE)
    print(
        f"[separation] vote: passed={vote_result['passed']} "
        f"tally={vote_result.get('tally')}"
    )
    if not vote_result.get("passed"):
        print("[separation] amendment failed popular vote — stopping")
        return 1

    amendment_data = get_amendment(aid)
    if not amendment_data:
        print(f"[separation] amendment #{aid} not found after vote")
        return 1

    tribunal = asyncio.run(convene(amendment_data, vote_result["tally"]))
    print(f"[separation] tribunal: {tribunal}")

    if not tribunal.get("unanimous"):
        print("[separation] tribunal did not approve unanimously — not enacting")
        return 1

    result = enact(aid, allow_soft=True)
    print(f"[separation] enact result: {result}")

    if result not in ("enacted", "enacted_pending_onchain"):
        print("[separation] enact failed")
        return 1

    from amendment_enforcer import get_param

    cooling = get_param("cooling_off_days", 0)
    print(f"[separation] cooling_off_days constitutional param = {cooling}")
    print("[separation] done — enforcement is non-retroactive for current officeholders")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
