"""Headless LibreOffice conversion helper (optional external dependency)."""
from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import uuid

from app.core.errors import ConversionError
from app.services.capabilities import find_soffice

TIMEOUT_SECONDS = 120


def convert_with_soffice(input_path: Path, target: str, workdir: Path) -> Path:
    """Convert a document to `target` (for example 'pdf') in an isolated profile."""
    soffice = find_soffice()
    if not soffice:
        raise ConversionError(
            "LibreOffice is not installed on this server. Install it or use a tool that does not require it."
        )

    profile_dir = workdir / f"lo-profile-{uuid.uuid4().hex[:8]}"
    profile_dir.mkdir(parents=True, exist_ok=True)
    command = [
        soffice,
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--nodefault",
        "--nofirststartwizard",
        f"-env:UserInstallation=file:///{profile_dir.as_posix().lstrip('/') if sys.platform.startswith('win') else profile_dir.as_posix()}",
        "--convert-to",
        target,
        "--outdir",
        str(workdir),
        str(input_path),
    ]
    creationflags = 0x08000000 if sys.platform.startswith("win") else 0
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            creationflags=creationflags,
        )
    except subprocess.TimeoutExpired as exc:
        raise ConversionError("LibreOffice conversion timed out.") from exc
    except OSError as exc:
        raise ConversionError("LibreOffice could not be started.") from exc

    expected_extension = target.split(":")[0]
    output = workdir / f"{input_path.stem}.{expected_extension}"
    if not output.exists():
        # Some filters name the output differently; take the newest matching file.
        candidates = sorted(
            workdir.glob(f"*.{expected_extension}"), key=lambda path: path.stat().st_mtime, reverse=True
        )
        if candidates:
            output = candidates[0]
    if not output.exists():
        detail = (result.stderr or result.stdout or "").strip()[:400]
        raise ConversionError(f"LibreOffice failed to produce a {expected_extension.upper()} file. {detail}")
    return output
