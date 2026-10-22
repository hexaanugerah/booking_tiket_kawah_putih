"""Image tools: format conversion, image-to-PDF and OCR."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps

from app.core.errors import ConversionError, ValidationAppError
from app.services.base import ConversionContext, ConversionResult
from app.services.ocr import extract_text_from_image

MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}

PAGE_SIZES = {
    "a4": (1240, 1754),      # 150 DPI
    "letter": (1275, 1650),  # 150 DPI
}
PAGE_DPI = 150


def _load(path: Path) -> Image.Image:
    try:
        image = Image.open(path)
        image.load()
    except Exception as exc:
        raise ConversionError("The image could not be read. It may be damaged or in an unsupported format.") from exc
    return ImageOps.exif_transpose(image)


def _flatten(image: Image.Image, background: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, background)
        canvas.paste(rgba, mask=rgba.split()[-1])
        return canvas
    return image.convert("RGB")


def images_to_pdf(ctx: ConversionContext) -> ConversionResult:
    page_size = str(ctx.options.get("page_size", "a4")).lower()
    orientation = str(ctx.options.get("orientation", "auto")).lower()
    pages: list[Image.Image] = []

    for path in ctx.inputs:
        image = _load(path)
        if page_size == "image":
            pages.append(_flatten(image))
            continue

        width, height = PAGE_SIZES.get(page_size, PAGE_SIZES["a4"])
        is_landscape = orientation == "landscape" or (
            orientation == "auto" and image.width > image.height
        )
        if is_landscape:
            width, height = height, width
        page = Image.new("RGB", (width, height), (255, 255, 255))
        margin = int(min(width, height) * 0.05)
        image = _flatten(image)
        ratio = min((width - 2 * margin) / image.width, (height - 2 * margin) / image.height)
        resized = image.resize(
            (max(1, int(image.width * ratio)), max(1, int(image.height * ratio))),
            Image.LANCZOS,
        )
        page.paste(resized, ((width - resized.width) // 2, (height - resized.height) // 2))
        pages.append(page)

    if not pages:
        raise ValidationAppError("No images were provided.")

    output = ctx.workdir / "images.pdf"
    try:
        pages[0].save(
            output,
            format="PDF",
            save_all=True,
            append_images=pages[1:],
            resolution=PAGE_DPI,
        )
    except Exception as exc:
        raise ConversionError("Failed to build the PDF from the images.") from exc
    return ConversionResult(output, "images.pdf", "application/pdf")


def convert_image(ctx: ConversionContext) -> ConversionResult:
    target = str(ctx.options.get("target", "png")).lower()
    if target not in ("png", "jpg", "webp"):
        raise ValidationAppError("Target format must be PNG, JPG or WebP.")
    quality = max(40, min(100, int(ctx.options.get("quality", 88) or 88)))
    image = _load(ctx.input)

    output = ctx.workdir / f"image.{target}"
    warnings: list[str] = []
    if target == "jpg":
        image = _flatten(image)
        image.save(output, format="JPEG", quality=quality, optimize=True, progressive=True)
        if ctx.input.suffix.lower() in (".png", ".webp", ".gif") and _has_alpha(ctx.input):
            warnings.append("Transparent areas were filled with white for JPG output.")
    elif target == "webp":
        has_alpha = _has_alpha(ctx.input)
        image = image.convert("RGBA") if has_alpha else image.convert("RGB")
        image.save(output, format="WEBP", quality=quality, method=4)
    else:
        image.save(output, format="PNG", optimize=True)

    stem = Path(ctx.original_name).stem or "image"
    return ConversionResult(output, f"{stem}.{target}", MIME[target], warnings)


def _has_alpha(path: Path) -> bool:
    try:
        with Image.open(path) as image:
            return image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    except Exception:
        return False


def image_to_text(ctx: ConversionContext) -> ConversionResult:
    try:
        image = _load(ctx.input)
    except ConversionError:
        raise

    rotate = int(ctx.options.get("rotate", 0) or 0)
    if rotate in (90, 180, 270):
        image = image.rotate(-rotate, expand=True)
    if bool(ctx.options.get("grayscale", True)):
        image = ImageOps.autocontrast(image.convert("L"))

    text = extract_text_from_image(image, language=str(ctx.options.get("language", "eng")))
    if not text:
        raise ConversionError(
            "No readable text was found in the image. Try a clearer scan or rotate the image before OCR."
        )
    output = ctx.workdir / "ocr-text.txt"
    output.write_text(text, encoding="utf-8")
    return ConversionResult(output, "ocr-text.txt", "text/plain; charset=utf-8")
