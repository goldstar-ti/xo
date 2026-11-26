"""Print a fresh SECRET_KEY and a VAPID key pair as .env lines.

Run once:  python scripts/gen_keys.py >> .env
Changing the VAPID keys later means every device has to turn notifications on again.
"""

import base64
import secrets

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64url(data: bytes) -> str:
    """Encode bytes as unpadded URL-safe base64."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


key = ec.generate_private_key(ec.SECP256R1())
private = key.private_numbers().private_value.to_bytes(32, "big")
public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)

print(f"SECRET_KEY={secrets.token_urlsafe(32)}")
print(f"VAPID_PRIVATE_KEY={b64url(private)}")
print(f"VAPID_PUBLIC_KEY={b64url(public)}")
