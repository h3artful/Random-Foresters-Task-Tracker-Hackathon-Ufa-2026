from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from .database import get_db
from .models import User, UserRole

PBKDF2_ITERATIONS = 120_000
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "hackathon-dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MINUTES = int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "720"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64_decode(raw: str) -> bytes:
    pad = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + pad)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64_encode(salt)}${_b64_encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_str, salt_b64, digest_b64 = password_hash.split("$", maxsplit=3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    try:
        iterations = int(iterations_str)
    except ValueError:
        return False

    salt = _b64_decode(salt_b64)
    expected_digest = _b64_decode(digest_b64)
    computed_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(computed_digest, expected_digest)


def create_access_token(user: User) -> str:
    expires_at = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def _auth_error(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except InvalidTokenError as error:
        raise _auth_error("Invalid token") from error

    user_id_raw = payload.get("sub")
    if user_id_raw is None:
        raise _auth_error("Invalid token payload")

    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError) as error:
        raise _auth_error("Invalid token payload") from error

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise _auth_error("User not found")
    return user


def require_roles(*roles: UserRole):
    allowed = set(roles)

    def _require(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role permissions")
        return user

    return _require
