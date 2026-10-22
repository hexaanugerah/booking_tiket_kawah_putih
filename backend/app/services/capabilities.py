"""Detect optional external tools (LibreOffice, Tesseract, RapidOCR) at runtime."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import importlib.util
import os
from pathlib import Path
import shutil
import sys

from app.core.config import settings


@dataclass(frozen=True)
class OcrEngine:
    name: str
    description: str
    languages: tuple[str, ...]


def find_soffice() -> str | None:
    candidates: list[str] = []
    if settings.libreoffice_path:
        candidates.append(settings.libreoffice_path)
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        candidates.append(found)
    if sys.platform.startswith("win"):
        for base in (os.environ.get("ProgramFiles", r"C:\Program Files"),
                     os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")):
            candidates.append(str(Path(base) / "LibreOffice" / "program" / "soffice.exe"))
    elif sys.platform == "darwin":
        candidates.append("/Applications/LibreOffice.app/Contents/MacOS/soffice")
    else:
        candidates.extend(["/usr/bin/soffice", "/usr/local/bin/soffice"])

    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


@lru_cache
def libreoffice_available() -> bool:
    return find_soffice() is not None


def _find_tesseract() -> str | None:
    if settings.tesseract_cmd and Path(settings.tesseract_cmd).is_file():
        return settings.tesseract_cmd
    found = shutil.which("tesseract")
    if found:
        return found
    if sys.platform.startswith("win"):
        candidate = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Tesseract-OCR" / "tesseract.exe"
        if candidate.is_file():
            return str(candidate)
    return None


@lru_cache
def get_ocr_engine() -> OcrEngine | None:
    tesseract = _find_tesseract()
    if tesseract:
        try:
            import pytesseract

            pytesseract.pytesseract.tesseract_cmd = tesseract
            try:
                langs = tuple(pytesseract.get_languages(config=""))
            except Exception:  # pragma: no cover - tesseract reporting issue
                langs = ("eng",)
            return OcrEngine("tesseract", "Tesseract OCR", langs or ("eng",))
        except Exception:  # pragma: no cover
            pass

    if importlib.util.find_spec("rapidocr_onnxruntime") is not None:
        return OcrEngine(
            "rapidocr",
            "RapidOCR (ONNX)",
            ("eng", "ind", "ch", "ja", "ko", "fr", "de", "es", "ru", "pt"),
        )
    return None


def ocr_available() -> bool:
    return get_ocr_engine() is not None


@lru_cache
def library_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for module_name, label in (
        ("fitz", "PyMuPDF"),
        ("pdfplumber", "pdfplumber"),
        ("docx", "python-docx"),
        ("openpyxl", "openpyxl"),
        ("pptx", "python-pptx"),
        ("PIL", "Pillow"),
    ):
        try:
            module = importlib.import_module(module_name)
            versions[label] = getattr(module, "__version__", None) or getattr(module, "VersionBind", "unknown")
        except Exception:  # pragma: no cover
            versions[label] = "unavailable"
    return versions


def capabilities_snapshot() -> dict:
    engine = get_ocr_engine()
    return {
        "libreoffice": {
            "available": libreoffice_available(),
            "path": find_soffice(),
            "used_for": ["docx/xlsx/pptx -> PDF (high fidelity)", "pptx -> images"],
        },
        "ocr": {
            "available": engine is not None,
            "engine": engine.name if engine else None,
            "languages": list(engine.languages) if engine else [],
        },
        "libraries": library_versions(),
        "limits": {
            "max_upload_mb": settings.max_upload_mb,
            "max_files_per_job": settings.max_files_per_job,
            "result_ttl_hours": settings.result_ttl_hours,
        },
    }
