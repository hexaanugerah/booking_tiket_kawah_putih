from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import NotFoundError
from app.core.security import GUEST_COOKIE, get_optional_user
from app.models.conversion import ConversionJob
from app.models.user import User
from app.repositories.conversions import can_access, get_job


def current_identity(
    request: Request,
    user: User | None = Depends(get_optional_user),
) -> tuple[str | None, str | None]:
    guest_id = request.cookies.get(GUEST_COOKIE)
    return (user.id if user else None, None if user else guest_id)


def owned_job(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> ConversionJob:
    job = get_job(db, job_id)
    guest_id = request.cookies.get(GUEST_COOKIE)
    if job is None or not can_access(job, user.id if user else None, guest_id):
        # 404 avoids revealing whether another user's job exists.
        raise NotFoundError("Conversion not found.")
    return job
