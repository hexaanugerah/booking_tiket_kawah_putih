"""OCR extraction. Uses Tesseract when installed, otherwise RapidOCR (ONNX)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image

from app.core.errors import ConversionError
from app.services.capabilities import get_ocr_engine


def _normalize_lang(language: str) -> str:
    language = (language or "eng").strip().lower()
    aliases = {
        "id": "ind",
        "in": "ind",
        "indonesian": "ind",
        "english": "eng",
        "en": "eng",
        "eng+ind": "eng+ind",
    }
    return aliases.get(language, language or "eng")


@lru_cache(maxsize=1)
def _rapidocr_instance():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def _extract_tesseract(image: Image.Image, language: str) -> str:
    import pytesseract
    from pytesseract import TesseractError

    engine = get_ocr_engine()
    requested = _normalize_lang(language)
    if engine and engine.languages:
        parts = [part for part in requested.split("+") if part in engine.languages]
        if not parts:
            parts = ["eng"] if "eng" in engine.languages else [engine.languages[0]]
        requested = "+".join(parts)
    try:
        return pytesseract.image_to_string(image, lang=requested)
    except TesseractError:
        # Requested language data may be missing; fall back to English.
        try:
            return pytesseract.image_to_string(image, lang="eng")
        except Exception as exc:  # pragma: no cover - environment specific
            raise ConversionError(f"OCR failed: {exc}") from exc


def _extract_rapidocr(image: Image.Image) -> str:
    import numpy as np

    engine = _rapidocr_instance()
    result, _elapsed = engine(np.array(image.convert("RGB")))
    if not result:
        return ""
    # RapidOCR returns entries shaped like [box, text, score]
    lines = [str(entry[1]) for entry in result if len(entry) > 1]
    return "\n".join(lines)


def extract_text_from_image(source: Path | Image.Image, language: str = "eng") -> str:
    engine = get_ocr_engine()
    if engine is None:
        raise ConversionError(
            "OCR is not available on this server. Install Tesseract OCR (and its language data) "
            "or the rapidocr-onnxruntime package."
        )

    if isinstance(source, Image.Image):
        image = source
    else:
        try:
            image = Image.open(source)
            image.load()
        except Exception as exc:
            raise ConversionError("The image could not be read for OCR.") from exc

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    # Upscale small scans, which improves recognition for low-resolution input.
    if max(image.size) < 1000:
        scale = 1000 / max(image.size)
        image = image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS)

    if engine.name == "tesseract":
        text = _extract_tesseract(image, language)
    else:
        text = _extract_rapidocr(image)
    return text.strip()


def ocr_pdf_page(page, language: str = "eng", dpi: int = 220) -> str:
    """Render a PyMuPDF page to an image and OCR it."""
    import fitz

    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    return extract_text_from_image(image, language=language)
