"""PowerPoint tools. Rendering requires LibreOffice, which is checked at runtime."""
from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import fitz
from pptx import Presentation

from app.core.errors import ConversionError
from app.services.base import ConversionContext, ConversionResult
from app.services.office_ops import convert_with_soffice

PDF_MIME = "application/pdf"


def _validate(path: Path) -> None:
    try:
        Presentation(str(path))
    except Exception as exc:
        raise ConversionError("The PowerPoint file could not be opened. It may be damaged.") from exc


def pptx_to_pdf(ctx: ConversionContext) -> ConversionResult:
    _validate(ctx.input)
    output = convert_with_soffice(ctx.input, "pdf", ctx.workdir)
    filename = f"{Path(ctx.original_name).stem or 'presentation'}.pdf"
    return ConversionResult(output, filename, PDF_MIME)


def pptx_to_images(ctx: ConversionContext) -> ConversionResult:
    _validate(ctx.input)
    dpi = max(72, min(300, int(ctx.options.get("dpi", 120) or 120)))
    pdf_path = convert_with_soffice(ctx.input, "pdf", ctx.workdir)
    zip_path = ctx.workdir / "slides.zip"
    doc = fitz.open(pdf_path)
    try:
        with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
            for index, page in enumerate(doc):
                pixmap = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
                archive.writestr(f"slide-{index + 1:03d}.png", pixmap.tobytes("png"))
    finally:
        doc.close()
    return ConversionResult(zip_path, "slides.zip", "application/zip")
