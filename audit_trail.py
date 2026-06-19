import json
import hashlib
import secrets
import base64
import subprocess
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def generate_view_key() -> dict:
    """Generate a View Key pair for audit trail encryption"""
    # Generate random 32-byte secret
    secret = secrets.token_bytes(32)
    secret_hex = secret.hex()

    # Generate salt
    salt = secrets.token_bytes(16)
    salt_hex = salt.hex()

    # Derive encryption key from secret
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret))

    # View key ID (public identifier)
    view_key_id = hashlib.sha256(secret).hexdigest()[:16]

    return {
        "view_key_id": view_key_id,
        "view_key_secret": secret_hex,  # keep private
        "salt": salt_hex,
        "encryption_key": key.decode(),  # derived key for encryption
        "created_at": datetime.utcnow().isoformat()
    }


def encrypt_audit_trail(trail_data: dict, view_key: dict) -> str:
    """Encrypt audit trail with view key"""
    f = Fernet(view_key["encryption_key"].encode())
    trail_json = json.dumps(trail_data).encode()
    encrypted = f.encrypt(trail_json)
    return encrypted.decode()


def decrypt_audit_trail(encrypted_data: str, view_key_secret: str, salt: str) -> dict:
    """Decrypt audit trail with view key secret"""
    # Re-derive encryption key
    secret = bytes.fromhex(view_key_secret)
    salt_bytes = bytes.fromhex(salt)

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt_bytes,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret))

    f = Fernet(key)
    decrypted = f.decrypt(encrypted_data.encode())
    return json.loads(decrypted)


def create_audit_trail(
    sender_address: str,
    recipient_address: str,
    amount: float,
    coin_type: str,
    relayer_path: list,
    tx_digest: str,
    commitment_hash: str
) -> dict:
    """Create full audit trail for a stealth transaction"""
    return {
        "type": "STEALTH_AUDIT_TRAIL",
        "version": "1.0",
        "transaction": {
            "digest": tx_digest,
            "commitment_hash": commitment_hash,
            "amount": amount,
            "coin_type": coin_type,
            "timestamp": datetime.utcnow().isoformat()
        },
        "participants": {
            "sender": sender_address,
            "recipient": recipient_address,
            "relayer_path": relayer_path
        },
        "privacy_proof": {
            "sender_recipient_link_broken": True,
            "relayer_count": len(relayer_path),
            "ofac_checked": True
        },
        "compliance": {
            "view_key_required": True,
            "audit_available": True,
            "note": "Full transaction details available to authorized auditors with View Key"
        }
    }


async def save_audit_trail_to_walrus(
    encrypted_trail: str,
    view_key_id: str,
    tx_digest: str
) -> str:
    """Save encrypted audit trail to Walrus"""
    payload = {
        "type": "ZION_AUDIT_TRAIL",
        "view_key_id": view_key_id,
        "tx_digest": tx_digest,
        "encrypted_data": encrypted_trail,
        "timestamp": datetime.utcnow().isoformat()
    }

    result = subprocess.run([
        "curl", "-X", "PUT",
        "https://publisher.walrus-testnet.walrus.space/v1/blobs",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload)
    ], capture_output=True, text=True, timeout=30)

    if result.returncode == 0:
        import re
        blob_match = re.search(r'"blobId":"([^"]+)"', result.stdout)
        if blob_match:
            return blob_match.group(1)
    return None
