from __future__ import annotations

import json

from app.models.conversion import ConversionJob
from app.models.user import utcnow
from app.schemas.conversion import ConversionJobOut


def _load_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except (TypeError, ValueError):
        return []
    return [str(item) for item in data] if isinstance(data, list) else []


def _load_dict(value: str | None) -> dict:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _is_expired(job: ConversionJob) -> bool:
    if job.status == "expired":
        return True
    if job.expires_at is None:
        return False
    expires = job.expires_at
    if expires.tzinfo is None:
        from datetime import timezone

        expires = expires.replace(tzinfo=timezone.utc)
    return expires < utcnow()


def job_to_out(job: ConversionJob) -> ConversionJobOut:
    downloadable = job.status == "completed" and bool(job.output_path) and not _is_expired(job)
    return ConversionJobOut(
        id=job.id,
        tool=job.tool,
        original_filename=job.original_filename,
        input_format=job.input_format,
        output_format=job.output_format,
        status=job.status,  # type: ignore[arg-type]
        file_size=job.file_size,
        output_filename=job.output_filename,
        output_size=job.output_size,
        error_message=job.error_message,
        warnings=_load_list(job.warnings_json),
        options=_load_dict(job.options_json),
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        expires_at=job.expires_at,
        download_url=f"/api/v1/conversions/{job.id}/download" if downloadable else None,
    )
