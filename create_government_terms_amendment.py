#!/usr/bin/env python3
"""
One-off: propose and enact the Government Terms Stability Act.

Run manually after review:
    cd /root/zion_backend && python3 create_government_terms_amendment.py

Pipeline: propose_amendment → run_vote → zco_tribunal.convene → enact (allow_soft=True)

Sets all branch term limits in constitutional_params:
  President 3d | Sheriff 3d | Senate 6d (staggered) | FRS Chief 6d

Distinct from any prior "Presidential Term Stability Act" proposal — new title/body.
Current officeholders are not removed; limits apply to term-end checks going forward.
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

TITLE = "Government Terms Stability Act"
DESCRIPTION = (
    "Establishes clear, stable terms for all branches of government: President "
    "serves 3 days, Sheriff serves 3 days (matching executive branch rotation), "
    "Senators serve 6 days (legislative stability, staggered individually), and "
    "the FRS Chief serves 6 days (two presidential terms, ensuring monetary "
    "policy independence from frequent political change per the Separation of "
    "Powers Act). These terms balance democratic accountability through frequent "
    "elections with sufficient time for effective governance. This supersedes any "
    "prior term limit of less than 3 days for the Presidency."
)
CHANGE_TYPE = "governance_rule"


def main() -> int:
    from amendments import ensure_tables, propose_amendment, run_vote
    from enact_amendment import enact
    from zco_tribunal import convene, get_amendment

    ensure_tables()

    aid = propose_amendment(TITLE, DESCRIPTION, CHANGE_TYPE, proposed_by=None)
    if aid is None:
        print("[gov_terms] duplicate open proposal — aborting")
        return 1

    print(f"[gov_terms] proposed amendment id={aid}")

    vote_result = run_vote(aid, CHANGE_TYPE)
    print(
        f"[gov_terms] vote: passed={vote_result['passed']} "
        f"tally={vote_result.get('tally')}"
    )
    if not vote_result.get("passed"):
        print("[gov_terms] amendment failed popular vote — stopping")
        return 1

    amendment_data = get_amendment(aid)
    if not amendment_data:
        print(f"[gov_terms] amendment #{aid} not found after vote")
        return 1

    tribunal = asyncio.run(convene(amendment_data, vote_result["tally"]))
    print(f"[gov_terms] tribunal: {tribunal}")

    if not tribunal.get("unanimous"):
        print("[gov_terms] tribunal did not approve unanimously — not enacting")
        return 1

    result = enact(aid, allow_soft=True)
    print(f"[gov_terms] enact result: {result}")

    if result not in ("enacted", "enacted_pending_onchain"):
        print("[gov_terms] enact failed")
        return 1

    from amendment_enforcer import apply_enacted_amendments, get_param

    applied = apply_enacted_amendments()
    print(f"[gov_terms] enforcer applied: {applied}")

    for key in ("term_limit_days", "sheriff_term_days", "senate_term_days", "frs_term_days"):
        print(f"[gov_terms] {key} = {get_param(key)}")
    print("[gov_terms] done — all branch terms are now constitutionally binding")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
