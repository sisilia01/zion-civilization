from fastapi import APIRouter, Request
from pydantic import BaseModel
import httpx

router = APIRouter()

class ZKTransferRequest(BaseModel):
    amount: float
    recipient: str
    coin: str = "SUI"


class ConfDepositRequest(BaseModel):
    amount: float
    recipient: str | None = None
    coin: str | None = None
    coin_type: str | None = None

@router.post("/zk-transfer")
async def zk_transfer(req: ZKTransferRequest):
    try:
        recipient = req.recipient.strip()
        if not recipient.startswith('0x'):
            recipient = '0x' + recipient
        if len(recipient) < 66:  # 0x + 64 hex chars
            return {"success": False, "error": f"Invalid address length: {len(recipient)}/66"}

        amount_mist = int(req.amount * 1_000_000_000)
        if amount_mist < 1000000:
            return {"success": False, "error": "Minimum 0.001 SUI"}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "http://localhost:3001/zk-prove",
                json={"amount_mist": amount_mist, "recipient": recipient, "coin": req.coin}
            )
            return response.json()
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}

@router.post("/zk-stealth-transfer")
async def zk_stealth_transfer(req: ZKTransferRequest):
    return await zk_transfer(req)

@router.post("/zk-prove-only")
async def zk_prove_only(req: ZKTransferRequest):
    try:
        amount_mist = int(req.amount * 1_000_000_000)
        if amount_mist < 1000000:
            return {"success": False, "error": "Minimum 0.001 SUI"}
        recipient = req.recipient.strip()
        if not recipient.startswith('0x'):
            recipient = '0x' + recipient
        if len(recipient) < 66:
            return {"success": False, "error": f"Invalid address: {len(recipient)}/66"}
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "http://localhost:3001/zk-prove-only",
                json={"amount_mist": amount_mist, "recipient": recipient}
            )
            return response.json()
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}

@router.post("/conf-deposit-prove-only")
async def conf_deposit_prove(req: ConfDepositRequest):
    try:
        coin = (req.coin_type or req.coin or "SUI").upper()
        amount_mist = int(req.amount * 1_000_000_000) if coin == "SUI" else int(req.amount * 1_000_000)
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "http://localhost:3001/conf-deposit-prove-only",
                json={"amount_mist": amount_mist, "coin_type": coin}
            )
            return response.json()
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}

@router.post("/conf-withdraw-prove-only")
async def conf_withdraw_prove(req: Request):
    try:
        body = await req.json()
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "http://localhost:3001/conf-withdraw-prove-only",
                json=body
            )
            return response.json()
    except Exception as e:
        return {"success": False, "error": str(e)[:200]}
