"""Two-step stealth deposit: user funds relayer, relayer deposits into shared pool."""

from __future__ import annotations

import os
try:
    from openrouter_key import _load_env_file
    _load_env_file()
except ImportError:
    pass
import random
from datetime import datetime, timedelta

import httpx
import psycopg2.extras
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["stealth"])

STEALTH_PACKAGE = "0x003c26d67e9ee0b925556c54b81de39e3bafb0c57e420c30a46bd1eabf44db3a"
STEALTH_POOL = "0xdaea3f2a4420d400314d99587e09d99acc05bf4cd0d37a23eed86d4a5641c9a5"
RELAYER_ADDRESS = "0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b"
SUI_RPC_URL = os.getenv("SUI_RPC_URL", "https://fullnode.testnet.sui.io:443")
ZK_SERVER_URL = os.getenv("ZK_SERVER_URL", "http://127.0.0.1:3001")


class DepositRequest(BaseModel):
    funding_tx_digest: str
    commitment_hash: str
    nullifier: str
    amount_mist: int = Field(gt=0)
    sender_address: str
    encrypted_note: str
    recipient_address: str
    encrypted_memo: str = ""
    auto_withdraw: bool = False


def get_db():
    import psycopg2

    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database=os.getenv("DB_NAME", "zion_db"),
        user=os.getenv("DB_USER", "zion_user"),
        password=os.getenv("DB_PASSWORD", ""),
    )


async def _sui_rpc(method: str, params: list) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            SUI_RPC_URL,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        resp.raise_for_status()
        payload = resp.json()
    if payload.get("error"):
        raise HTTPException(
            status_code=400,
            detail=payload["error"].get("message", "Sui RPC error"),
        )
    return payload.get("result") or {}


def _owner_address(owner: object) -> str | None:
    if not isinstance(owner, dict):
        return None
    if "AddressOwner" in owner:
        return str(owner["AddressOwner"]).lower()
    return None


async def verify_funding_transaction(
    digest: str,
    sender_address: str,
    amount_mist: int,
    relayer_address: str = RELAYER_ADDRESS,
) -> None:
    tx = await _sui_rpc(
        "sui_getTransactionBlock",
        [
            digest,
            {"showBalanceChanges": True, "showEffects": True},
        ],
    )

    status = (tx.get("effects") or {}).get("status") or {}
    if status.get("status") != "success":
        raise HTTPException(
            status_code=400,
            detail=f"Funding transaction failed: {status.get('error', 'unknown')}",
        )

    relayer_lower = relayer_address.lower()
    sender_lower = sender_address.lower()
    relayer_received = 0
    sender_sent = 0

    for change in tx.get("balanceChanges") or []:
        coin_type = str(change.get("coinType", ""))
        if not coin_type.endswith("sui::SUI"):
            continue
        addr = _owner_address(change.get("owner"))
        if not addr:
            continue
        amount = int(change.get("amount", 0))
        if addr == relayer_lower and amount > 0:
            relayer_received += amount
        if addr == sender_lower and amount < 0:
            sender_sent += -amount

    if relayer_received < amount_mist:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Relayer received {relayer_received} mist, expected at least {amount_mist}"
            ),
        )
    if sender_sent < amount_mist:
        raise HTTPException(
            status_code=400,
            detail=f"Sender transferred {sender_sent} mist, expected at least {amount_mist}",
        )


async def execute_relayer_pool_deposit(
    amount_mist: int,
    commitment_hash: str,
    nullifier: str,
    encrypted_memo: str,
) -> dict:
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{ZK_SERVER_URL}/stealth-relayer-deposit",
            json={
                "amount_mist": amount_mist,
                "commitment_hash": commitment_hash,
                "nullifier": nullifier,
                "encrypted_memo_hex": encrypted_memo or "",
                "package_id": STEALTH_PACKAGE,
                "pool_id": STEALTH_POOL,
            },
        )
        data = resp.json()
    if not data.get("success"):
        raise HTTPException(
            status_code=500,
            detail=data.get("error") or "Relayer deposit transaction failed",
        )
    return data


def _save_encrypted_note(req: DepositRequest) -> int | None:
    scheduled_at = None
    if req.auto_withdraw:
        delay_minutes = random.randint(5, 30)
        scheduled_at = datetime.utcnow() + timedelta(minutes=delay_minutes)

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(
            """
            INSERT INTO encrypted_notes
            (commitment_hash, encrypted_note, recipient_address, sender_address,
             coin_type, status, scheduled_at, auto_withdraw, encrypted_memo)
            VALUES (%s, %s, %s, %s, 'SUI', 'pending', %s, %s, %s)
            ON CONFLICT (commitment_hash) DO NOTHING
            RETURNING id
            """,
            (
                req.commitment_hash,
                req.encrypted_note,
                req.recipient_address,
                req.sender_address,
                scheduled_at,
                req.auto_withdraw,
                req.encrypted_memo or None,
            ),
        )
        row = cur.fetchone()
        conn.commit()
        return row["id"] if row else None
    except Exception as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        cur.close()
        conn.close()


@router.post("/stealth/deposit")
async def stealth_deposit(req: DepositRequest):
    from api import _log_compliance_check, check_sanctions

    if not all(
        [
            req.funding_tx_digest,
            req.commitment_hash,
            req.nullifier,
            req.encrypted_note,
            req.recipient_address,
            req.sender_address,
        ]
    ):
        raise HTTPException(status_code=400, detail="Missing required fields")

    allowed_amounts = {100_000_000, 1_000_000_000, 10_000_000_000}
    if req.amount_mist not in allowed_amounts:
        raise HTTPException(
            status_code=400,
            detail=f"amount_mist must be one of {sorted(allowed_amounts)}",
        )

    is_sanctioned = await check_sanctions(req.sender_address)
    _log_compliance_check(
        req.sender_address, "stealth_deposit", "blocked" if is_sanctioned else "passed"
    )
    if is_sanctioned:
        raise HTTPException(status_code=403, detail="Address restricted by compliance policy")

    await verify_funding_transaction(
        req.funding_tx_digest,
        req.sender_address,
        req.amount_mist,
    )

    deposit_result = await execute_relayer_pool_deposit(
        req.amount_mist,
        req.commitment_hash,
        req.nullifier,
        req.encrypted_memo,
    )

    note_id = _save_encrypted_note(req)

    return {
        "success": True,
        "funding_digest": req.funding_tx_digest,
        "deposit_digest": deposit_result.get("digest"),
        "note_id": note_id,
        "relayer": deposit_result.get("relayer", RELAYER_ADDRESS),
    }
