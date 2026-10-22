"""PDF manipulation tools: merge, split, rotate, compress, numbers, watermark, reorder."""
from __future__ import annotations

import re
from pathlib import Path
import zipfile

import fitz

from app.core.errors import ConversionError, ValidationAppError
from app.services.base import ConversionContext, ConversionResult
from app.services.capabilities import ocr_available
from app.services.ocr import ocr_pdf_page

MAX_PAGES = 2000


def _open_pdf(path: Path) -> fitz.Document:
    try:
        doc = fitz.open(path)
    except Exception as exc:
        raise ConversionError("The PDF could not be opened. It may be damaged or encrypted.") from exc
    if doc.needs_pass:
        doc.close()
        raise ConversionError("Password-protected PDFs are not supported.")
    if doc.page_count == 0:
        doc.close()
        raise ConversionError("The PDF contains no pages.")
    if doc.page_count > MAX_PAGES:
        doc.close()
        raise ConversionError(f"The PDF has more than {MAX_PAGES} pages, which exceeds the limit.")
    return doc


def parse_page_numbers(spec: str | None, total: int) -> list[int]:
    """Parse '1,3-5' into zero-based page indices. Raises on invalid input."""
    spec = (spec or "").strip().lower()
    if spec in ("", "all", "*"):
        return list(range(total))
    pages: list[int] = []
    for part in re.split(r"[,\s]+", spec):
        if not part:
            continue
        if "-" in part:
            match = re.fullmatch(r"(\d+)-(\d+)", part)
            if not match:
                raise ValidationAppError(f"Invalid page range '{part}'.")
            start, end = int(match.group(1)), int(match.group(2))
            if start > end:
                start, end = end, start
            pages.extend(range(start, end + 1))
        else:
            if not part.isdigit():
                raise ValidationAppError(f"Invalid page number '{part}'.")
            pages.append(int(part))
    unique: list[int] = []
    for page in pages:
        if page < 1 or page > total:
            raise ValidationAppError(f"Page {page} is out of range (document has {total} pages).")
        if page - 1 not in unique:
            unique.append(page - 1)
    if not unique:
        raise ValidationAppError("No valid pages were selected.")
    return unique


def _save(doc: fitz.Document, path: Path) -> None:
    doc.save(path, garbage=4, deflate=True)
    doc.close()


def merge_pdfs(ctx: ConversionContext) -> ConversionResult:
    if len(ctx.inputs) < 2:
        raise ValidationAppError("Select at least two PDF files to merge.")
    merged = fitz.open()
    try:
        for path in ctx.inputs:
            doc = _open_pdf(path)
            merged.insert_pdf(doc)
            doc.close()
    except Exception:
        merged.close()
        raise
    output = ctx.workdir / "merged.pdf"
    _save(merged, output)
    return ConversionResult(output, "merged.pdf", "application/pdf")


def split_pdf(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    mode = str(ctx.options.get("mode", "each"))
    zip_path = ctx.workdir / "split-pages.zip"
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
            if mode == "ranges":
                raw = str(ctx.options.get("ranges", "")).strip()
                if not raw:
                    raise ValidationAppError("Enter at least one page range, for example 1-3, 4-6.")
                groups = []
                for chunk in raw.split(","):
                    chunk = chunk.strip()
                    if chunk:
                        groups.append(parse_page_numbers(chunk, doc.page_count))
                for index, group in enumerate(groups, start=1):
                    part = fitz.open()
                    for page_index in group:
                        part.insert_pdf(doc, from_page=page_index, to_page=page_index)
                    data = part.tobytes(garbage=4, deflate=True)
                    part.close()
                    archive.writestr(f"part-{index:02d}.pdf", data)
            else:
                for page_index in range(doc.page_count):
                    part = fitz.open()
                    part.insert_pdf(doc, from_page=page_index, to_page=page_index)
                    data = part.tobytes(garbage=4, deflate=True)
                    part.close()
                    archive.writestr(f"page-{page_index + 1:03d}.pdf", data)
    finally:
        doc.close()
    return ConversionResult(zip_path, "split-pages.zip", "application/zip")


def rotate_pdf(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    angle = int(ctx.options.get("angle", 90) or 90)
    if angle not in (90, 180, 270):
        doc.close()
        raise ValidationAppError("Rotation angle must be 90, 180 or 270 degrees.")
    pages = parse_page_numbers(str(ctx.options.get("pages", "all")), doc.page_count)
    for page_index in pages:
        page = doc[page_index]
        page.set_rotation((page.rotation + angle) % 360)
    output = ctx.workdir / "rotated.pdf"
    _save(doc, output)
    return ConversionResult(output, "rotated.pdf", "application/pdf")


def compress_pdf(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    output = ctx.workdir / "compressed.pdf"
    try:
        doc.subset_fonts()
        doc.save(
            output,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            clean=True,
        )
    finally:
        doc.close()

    original = ctx.input.stat().st_size
    compressed = output.stat().st_size
    warnings = []
    if compressed >= original:
        warnings.append(
            "This PDF is already tightly packed, so the optimized copy is not smaller. "
            "Recompressing images is not performed automatically."
        )
    return ConversionResult(output, "compressed.pdf", "application/pdf", warnings)


def extract_text(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    chunks: list[str] = []
    empty_pages: list[int] = []
    try:
        for index, page in enumerate(doc):
            text = page.get_text("text").strip()
            if not text:
                if ocr_available():
                    try:
                        text = ocr_pdf_page(page, str(ctx.options.get("language", "eng")))
                    except Exception:
                        text = ""
                if not text:
                    empty_pages.append(index + 1)
            chunks.append(f"--- Page {index + 1} ---\n{text}")
        total_pages = doc.page_count
    finally:
        doc.close()

    output = ctx.workdir / "extracted-text.txt"
    output.write_text("\n\n".join(chunks), encoding="utf-8")
    warnings = []
    if empty_pages:
        warnings.append(
            "No text layer was found on page(s) "
            + ", ".join(str(page) for page in empty_pages[:20])
            + (". Those pages may need OCR." if not ocr_available() else ".")
        )
    return ConversionResult(output, "extracted-text.txt", "text/plain; charset=utf-8", warnings)


def pdf_to_images(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    fmt = str(ctx.options.get("format", "png")).lower()
    if fmt not in ("png", "jpg"):
        fmt = "png"
    dpi = max(72, min(400, int(ctx.options.get("dpi", 150) or 150)))
    zip_path = ctx.workdir / "pages.zip"
    warnings: list[str] = []
    try:
        if doc.page_count > 300:
            warnings.append("Only the first 300 pages were rendered.")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for index in range(min(doc.page_count, 300)):
                page = doc[index]
                pixmap = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
                if fmt == "jpg":
                    data = pixmap.tobytes("jpg", jpg_quality=90)
                else:
                    data = pixmap.tobytes("png")
                archive.writestr(f"page-{index + 1:03d}.{fmt}", data)
    finally:
        doc.close()
    return ConversionResult(zip_path, f"pdf-pages-{fmt}.zip", "application/zip", warnings)


def add_page_numbers(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    position = str(ctx.options.get("position", "bottom-center"))
    start_at = max(1, int(ctx.options.get("start_at", 1) or 1))
    template = str(ctx.options.get("format", "{n}") or "{n}")
    total = doc.page_count
    output = ctx.workdir / "numbered.pdf"
    try:
        for index, page in enumerate(doc):
            number = start_at + index
            label = template.replace("{n}", str(number)).replace("{total}", str(total))
            width = page.rect.width
            height = page.rect.height
            font_size = max(8.0, min(14.0, width * 0.022))
            text_width = fitz.get_text_length(label, fontname="helv", fontsize=font_size)
            margin = height * 0.035
            if position == "top-center":
                point = fitz.Point((width - text_width) / 2, margin + font_size)
            elif position == "bottom-right":
                point = fitz.Point(width - margin - text_width, height - margin)
            else:
                point = fitz.Point((width - text_width) / 2, height - margin)
            page.insert_text(point, label, fontname="helv", fontsize=font_size, color=(0.35, 0.35, 0.35))
        doc.save(output, garbage=4, deflate=True)
    finally:
        doc.close()
    return ConversionResult(output, "numbered.pdf", "application/pdf")


def add_watermark(ctx: ConversionContext) -> ConversionResult:
    text = str(ctx.options.get("text") or "CONFIDENTIAL")[:120]
    opacity = max(0.05, min(0.8, float(ctx.options.get("opacity", 15) or 15) / 100))
    font_size = max(12, min(120, int(ctx.options.get("font_size", 48) or 48)))
    doc = _open_pdf(ctx.input)
    output = ctx.workdir / "watermarked.pdf"
    try:
        for page in doc:
            width = page.rect.width
            height = page.rect.height
            text_width = fitz.get_text_length(text, fontname="helv", fontsize=font_size)
            point = fitz.Point((width - text_width) / 2, height / 2)
            try:
                pivot = fitz.Point(width / 2, height / 2)
                matrix = fitz.Matrix(45)
                page.insert_text(
                    point,
                    text,
                    fontname="helv",
                    fontsize=font_size,
                    color=(0.6, 0.6, 0.6),
                    fill_opacity=opacity,
                    morph=(pivot, matrix),
                )
            except Exception:
                page.insert_text(
                    point,
                    text,
                    fontname="helv",
                    fontsize=font_size,
                    color=(0.6, 0.6, 0.6),
                    fill_opacity=opacity,
                )
        doc.save(output, garbage=4, deflate=True)
    finally:
        doc.close()
    return ConversionResult(output, "watermarked.pdf", "application/pdf")


def remove_pages(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    try:
        remove = set(parse_page_numbers(str(ctx.options.get("pages", "")), doc.page_count))
        keep = [index for index in range(doc.page_count) if index not in remove]
        if not keep:
            raise ValidationAppError("You cannot remove every page of the document.")
        doc.select(keep)
        output = ctx.workdir / "removed-pages.pdf"
        doc.save(output, garbage=4, deflate=True)
    finally:
        doc.close()
    return ConversionResult(output, "removed-pages.pdf", "application/pdf")


def reorder_pdf(ctx: ConversionContext) -> ConversionResult:
    doc = _open_pdf(ctx.input)
    try:
        order = parse_page_numbers(str(ctx.options.get("order", "")), doc.page_count)
        if len(order) != doc.page_count or len(set(order)) != doc.page_count:
            raise ValidationAppError(
                f"Provide every page exactly once (the document has {doc.page_count} pages)."
            )
        doc.select(order)
        output = ctx.workdir / "reordered.pdf"
        doc.save(output, garbage=4, deflate=True)
    finally:
        doc.close()
    return ConversionResult(output, "reordered.pdf", "application/pdf")
