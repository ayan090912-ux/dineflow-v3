from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config.settings import get_settings

settings = get_settings()

ph = PasswordHasher(
    time_cost=settings.ARGON2_TIME_COST,
    memory_cost=settings.ARGON2_MEMORY_COST,
    parallelism=settings.ARGON2_PARALLELISM,
    hash_len=32,
    salt_len=16
)


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        ph.verify(password_hash, password)
        return True
    except VerifyMismatchError:
        return False


def check_needs_rehash(password_hash: str) -> bool:
    return ph.check_needs_rehash(password_hash)
