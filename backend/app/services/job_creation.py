"""Shared job creation used by every upload endpoint."""
from __future__ import annotations

from datetime import timedelta
import json

from fastapi import Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AuthError, UnsupportedFormatError, ValidationAppError
from app.core.security import get_or_create_guest_id
from app.core.storage import extension_of, job_input_dir, job_temp_dir, remove_job_files, save_upload, stored_name
from app.models.conversion import ConversionJob
from app.models.user import User, utcnow
from app.services.registry import ToolSpec, get_tool, require_available


def validate_options(tool: ToolSpec, raw: dict) -> dict:
    """Keep only declared options and coerce/validate their values."""
    resolved: dict = {}
    for option in tool.options:
        if option.name not in raw or raw[option.name] is None:
            resolved[option.name] = option.default
            continue
        value = raw[option.name]
        if option.type == "checkbox":
            resolved[option.name] = bool(value)
        elif option.type == "number":
            try:
                number = int(float(value))
            except (TypeError, ValueError):
                raise ValidationAppError(f"Option '{option.label}' must be a number.")
            if option.min is not None:
                number = max(option.min, number)
            if option.max is not None:
                number = min(option.max, number)
            resolved[option.name] = number
        elif option.type == "select":
            allowed = {choice["value"] for choice in option.choices}
            resolved[option.name] = value if value in allowed else option.default
        else:
            resolved[option.name] = str(value)[:2000]
    return resolved


async def create_job(
    *,
    request: Request,
    response: Response,
    db: Session,
    user: User | None,
    tool_id: str,
    uploads: list[UploadFile],
    raw_options: dict | None = None,
) -> ConversionJob:
    tool = get_tool(tool_id)
    require_available(tool)

    if not uploads:
        raise ValidationAppError("Select at least one file to convert.")
    if user is None and not settings.allow_anonymous:
        raise AuthError("Sign in to start a conversion.")

    max_files = min(tool.max_files, settings.max_files_per_job)
    if len(uploads) > max_files:
        raise ValidationAppError(f"'{tool.label}' accepts at most {max_files} files per job.")
    if len(uploads) < tool.min_files:
        raise ValidationAppError(f"'{tool.label}' requires at least {tool.min_files} files.")

    options = validate_options(tool, raw_options or {})
    guest_id = None if user else get_or_create_guest_id(request, response)
    if user is None and guest_id is None:
        raise AuthError("Sign in to start a conversion.")

    job = ConversionJob(
        user_id=user.id if user else None,
        guest_id=guest_id,
        tool=tool.id,
        original_filename="",
        input_format="",
        output_format=tool.output,
        status="queued",
        options_json=json.dumps(options),
        expires_at=utcnow() + timedelta(hours=settings.result_ttl_hours),
    )
    db.add(job)
    db.flush()

    names: list[str] = []
    total_size = 0
    try:
        input_dir = job_input_dir(job.id)
        for upload in uploads:
            ext = extension_of(upload.filename)
            if ext not in tool.inputs:
                raise UnsupportedFormatError(
                    f"'{tool.label}' does not accept {ext or 'this'} files. "
                    f"Accepted: {', '.join(tool.inputs)}."
                )
            destination = input_dir / stored_name(upload.filename)
            total_size += await save_upload(upload, destination)
            names.append(destination.name)
        if not names:
            raise ValidationAppError("No files were uploaded.")
        job.original_filename = ", ".join(sorted({upload.filename or "file" for upload in uploads}))[:255]
        job.input_format = extension_of(uploads[0].filename).lstrip(".")
        job.file_size = total_size
        job_temp_dir(job.id)
        db.commit()
    except Exception:
        db.rollback()
        remove_job_files(job.id)
        raise

    db.refresh(job)
    return job
