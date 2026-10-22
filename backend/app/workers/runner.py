"""Background job execution and file retention cleanup.

Jobs run in a worker thread with a hard timeout. This is an in-process queue:
adequate for a single-node deployment, and replaceable with Celery/RQ + Redis
for horizontal scaling without changing the API contract.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import timedelta
import json
import logging
import shutil

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.errors import AppError
from app.core.storage import (
    job_input_dir,
    job_output_dir,
    job_temp_dir,
    remove_job_files,
    sanitize_filename,
)
from app.models.conversion import ConversionJob
from app.models.user import utcnow
from app.repositories.conversions import add_log, set_warnings
from app.services.base import ConversionContext
from app.services.registry import get_tool

logger = logging.getLogger("docuconvert.worker")

ACTIVE_STATUSES = ("queued", "processing")


def _fail(db, job: ConversionJob, message: str, log_message: str | None = None) -> None:
    job.status = "failed"
    job.error_message = message[:1000]
    job.completed_at = utcnow()
    job.expires_at = utcnow() + timedelta(hours=settings.result_ttl_hours)
    add_log(db, job.id, "failed", log_message or message)
    db.commit()


def run_conversion_job(job_id: str) -> None:
    db = SessionLocal()
    job: ConversionJob | None = None
    try:
        job = db.get(ConversionJob, job_id)
        if job is None or job.status not in ACTIVE_STATUSES:
            return

        job.status = "processing"
        job.started_at = utcnow()
        add_log(db, job.id, "started", f"Tool '{job.tool}' started.")
        db.commit()

        tool = get_tool(job.tool)
        available, reason = tool.availability()
        if not available:
            _fail(db, job, reason or "This tool is unavailable.", "Tool unavailable at execution time.")
            return

        input_dir = job_input_dir(job.id)
        inputs = sorted(path for path in input_dir.iterdir() if path.is_file())
        if not inputs:
            _fail(db, job, "The uploaded file is no longer available. Please upload it again.")
            return

        options = json.loads(job.options_json or "{}")
        workdir = job_temp_dir(job.id)
        context = ConversionContext(
            inputs=inputs,
            original_names=[job.original_filename],
            options=options,
            workdir=workdir,
        )

        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"convert-{job.id[:8]}")
        future = executor.submit(tool.handler, context)
        try:
            result = future.result(timeout=settings.conversion_timeout_seconds)
        except FutureTimeout:
            future.cancel()
            executor.shutdown(wait=False, cancel_futures=True)
            _fail(db, job, "The conversion took too long and was stopped. Try a smaller file.")
            remove_job_files(job.id)
            return
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

        if not result.path.exists() or result.path.stat().st_size == 0:
            _fail(db, job, "The converter produced an empty result.")
            remove_job_files(job.id)
            return

        filename = sanitize_filename(result.filename)
        if not filename:
            filename = f"result.{tool.output}"
        output_dir = job_output_dir(job.id)
        target = output_dir / filename
        shutil.move(str(result.path), target)

        job.output_filename = filename
        job.output_path = str(target)
        job.output_size = target.stat().st_size
        job.status = "completed"
        job.completed_at = utcnow()
        job.expires_at = utcnow() + timedelta(hours=settings.result_ttl_hours)
        set_warnings(job, result.warnings)
        add_log(db, job.id, "completed", f"Conversion finished ({job.output_size} bytes).")
        db.commit()

        shutil.rmtree(input_dir, ignore_errors=True)
        shutil.rmtree(workdir, ignore_errors=True)
    except AppError as exc:
        if job is not None:
            _fail(db, job, exc.message)
    except Exception:
        logger.exception("Conversion job %s failed unexpectedly", job_id)
        if job is not None:
            db.rollback()
            try:
                job = db.get(ConversionJob, job_id)
                if job is not None:
                    _fail(
                        db,
                        job,
                        "The conversion failed unexpectedly. The file may be damaged or use unsupported features.",
                    )
            except Exception:  # pragma: no cover
                logger.exception("Could not record failure for job %s", job_id)
        remove_job_files(job_id)
    finally:
        db.close()


def cleanup_expired_jobs() -> int:
    """Mark expired jobs and delete their stored files."""
    db = SessionLocal()
    removed = 0
    try:
        now = utcnow()
        jobs = list(
            db.scalars(
                select(ConversionJob).where(
                    ConversionJob.expires_at.is_not(None),
                    ConversionJob.expires_at < now,
                    ConversionJob.status != "expired",
                )
            ).all()
        )
        for job in jobs:
            remove_job_files(job.id)
            job.status = "expired"
            job.output_path = None
            job.output_size = None
            add_log(db, job.id, "expired", "Files were deleted according to the retention policy.")
            removed += 1
        if jobs:
            db.commit()
    except Exception:  # pragma: no cover
        logger.exception("Cleanup failed")
        db.rollback()
    finally:
        db.close()
    return removed


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(max(60, settings.cleanup_interval_minutes * 60))
        try:
            count = await asyncio.to_thread(cleanup_expired_jobs)
            if count:
                logger.info("Cleaned up %s expired conversion job(s)", count)
        except Exception:  # pragma: no cover
            logger.exception("Expired job cleanup iteration failed")
