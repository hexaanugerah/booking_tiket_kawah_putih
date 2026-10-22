"""Small in-memory sliding-window rate limiter.

Suitable for a single-process deployment. With multiple workers, replace with a
shared store (for example Redis) so limits apply across processes.
"""
from collections import defaultdict, deque
from threading import Lock
import time

from fastapi import Request

from app.core.config import settings
from app.core.errors import RateLimitError

_WINDOW_SECONDS = 60
_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = Lock()


def client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request) -> None:
    if settings.rate_limit_per_minute <= 0:
        return
    key = client_key(request)
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        while bucket and now - bucket[0] > _WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= settings.rate_limit_per_minute:
            raise RateLimitError("Too many requests. Please wait a moment and try again.")
        bucket.append(now)
