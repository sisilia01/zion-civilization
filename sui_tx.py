"""Helpers for sui client CLI calls."""
import re
import subprocess
from typing import Optional


def extract_digest(stdout: str) -> Optional[str]:
    if not stdout:
        return None
    for pattern in (
        r"Transaction Digest:\s*([A-Za-z0-9+/=_-]+)",
        r"Digest:\s*([A-Za-z0-9+/=_-]+)",
    ):
        match = re.search(pattern, stdout)
        if match:
            return match.group(1).strip()
    return None


def sui_call(
    package: str,
    module: str,
    function: str,
    args: list,
    gas_budget: int = 10_000_000,
    timeout: int = 30,
) -> tuple[bool, str, Optional[str]]:
    cmd = [
        "sui", "client", "call",
        "--package", package,
        "--module", module,
        "--function", function,
        "--args", *[str(a) for a in args],
        "--gas-budget", str(gas_budget),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    out = (result.stdout or "") + (result.stderr or "")
    digest = extract_digest(out) if result.returncode == 0 else None
    return result.returncode == 0, out, digest


def is_abort_code(output: str, code: int) -> bool:
    """True if Move aborted with the given code (e.g. E_MARKET_EXISTS = 1)."""
    if not output:
        return False
    if re.search(rf"MoveAbort\([^)]*,\s*{code}\s*\)", output):
        return True
    needles = (
        f"abort code: {code}",
        f"Abort code: {code}",
        f", {code})",
        f"sub status {code}",
        f"E_MARKET_EXISTS",
    )
    if code == 1:
        needles = needles + (
            "MARKET_EXISTS",
            "market already exists",
            "Market already exists",
        )
    return any(n in output for n in needles)
