"""Transforms a docling ``DoclingDocument`` into our own ``ProcessedDocument`` schema.

This module walks the docling document tree and produces a flat list of
``DocumentBlock`` items (headings, paragraphs, tables, images) together with
the full-document markdown export.

Every step is individually guarded — a crash in one element (e.g. a table that
can't be exported to a DataFrame) never prevents the rest of the document from
being extracted.
"""

from __future__ import annotations

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

# Images smaller than this in BOTH dimensions are decorative (icons, bullets, dividers) --
# not worth a vision call and only noise in the report.
_MIN_IMAGE_DIM = 100
# Bounded concurrency for figure captioning. Kept small so a free-tier VLM's rate limit is
# not tripped; the client rotates keys and backs off on 429 within this.
_VLM_MAX_WORKERS = 4

if TYPE_CHECKING:
    from docling.datamodel.document import ConversionResult

from app.schemas.desk_research import DocumentBlock, ProcessedDocument

logger = logging.getLogger(__name__)


def _safe_table_to_dicts(table_item, doc) -> list[dict] | None:
    """Export a docling ``TableItem`` to a list of row-dicts, or ``None``."""
    try:
        df = table_item.export_to_dataframe(doc)
        return df.to_dict(orient="records")
    except Exception:
        logger.warning("Could not export table to DataFrame", exc_info=True)
        return None



def _extension_to_format(filename: str) -> str:
    """Map a filename extension to a short format label."""
    ext = Path(filename).suffix.lower()
    mapping = {
        ".pdf": "pdf",
        ".docx": "docx",
        ".doc": "docx",
        ".pptx": "pptx",
        ".ppt": "pptx",
        ".xlsx": "xlsx",
        ".xls": "xlsx",
        ".png": "image",
        ".jpg": "image",
        ".jpeg": "image",
        ".tiff": "image",
        ".tif": "image",
        ".bmp": "image",
        ".webp": "image",
    }
    return mapping.get(ext, "unknown")


def _image_hash(pil_img) -> str:
    """Content hash of an image, so the same logo repeated on 20 slides is captioned once."""
    try:
        return hashlib.md5(pil_img.tobytes()).hexdigest()
    except Exception:
        return ""


def _is_decorative(pil_img) -> bool:
    """True for icons / bullets / dividers -- tiny in both dimensions, no informational value."""
    try:
        w, h = pil_img.size
        return max(w, h) < _MIN_IMAGE_DIM
    except Exception:
        return False


def _caption_unique_images(to_caption: dict[str, object]) -> dict[str, str | None]:
    """Caption a set of unique images (keyed by content hash) concurrently: VLM, then OCR.

    Bounded concurrency keeps a free-tier VLM's rate limit from tripping; the client rotates
    keys and backs off on 429 within this pool.
    """
    captions_by_hash: dict[str, str | None] = {}
    if not to_caption:
        return captions_by_hash

    from app.services.desk_research.gemini_vlm import get_vlm_client

    vlm = get_vlm_client()

    def _caption_one(pil_img) -> str | None:
        try:
            text = vlm.describe_image(pil_img)
        except Exception:
            text = None
        if not text or not text.strip():
            text = _ocr_image_text(pil_img)
        return text

    items = list(to_caption.items())
    with ThreadPoolExecutor(max_workers=min(_VLM_MAX_WORKERS, len(items))) as pool:
        for h, text in zip(
            (k for k, _ in items),
            pool.map(lambda kv: _caption_one(kv[1]), items),
        ):
            captions_by_hash[h] = text
    return captions_by_hash


def _build_image_blocks(entries: list[dict], images_dir: Path | None, filename: str) -> list[DocumentBlock]:
    """Turn raw image entries into captioned image blocks, cheaply.

    Shared by both extraction paths -- docling pictures and natively-harvested embedded
    images. Each entry is ``{"pil_img": PIL|None, "caption": str|None, "page_num": int|None}``.
    Three things keep this from making one vision-model call per image (a deck can hold 70+):
      - decorative images (logos, icons, bullets) are dropped, not described;
      - identical images (the logo on every slide) are hashed and described ONCE;
      - the surviving unique figures are captioned concurrently, bounded for a free-tier VLM.
    """
    records: list[dict] = []
    to_caption: dict[str, object] = {}  # hash -> pil_img, unique figures needing a caption

    for idx, entry in enumerate(entries):
        pil_img = entry.get("pil_img")
        caption = entry.get("caption")
        page_num = entry.get("page_num")

        image_path = None
        if images_dir is not None and pil_img is not None:
            try:
                images_dir.mkdir(parents=True, exist_ok=True)
                img_filename = f"figure_{idx:03d}.png"
                pil_img.save(str(images_dir / img_filename))
                image_path = img_filename
            except Exception:
                logger.warning("Could not save image %d from %s", idx, filename)

        decorative = pil_img is not None and _is_decorative(pil_img)
        img_hash = _image_hash(pil_img) if (pil_img is not None and not decorative) else ""
        has_caption = bool(caption and caption.strip())
        if pil_img is not None and not decorative and not has_caption and img_hash and img_hash not in to_caption:
            to_caption[img_hash] = pil_img

        records.append({
            "caption": caption,
            "image_path": image_path,
            "page_num": page_num,
            "hash": img_hash,
            "decorative": decorative,
        })

    captions_by_hash = _caption_unique_images(to_caption)

    # Assemble blocks. A decorative image with no caption is noise -- drop it entirely.
    blocks: list[DocumentBlock] = []
    for rec in records:
        caption = rec["caption"]
        if (not caption or not caption.strip()) and rec["hash"]:
            caption = captions_by_hash.get(rec["hash"])
        if rec["decorative"] and not (caption and caption.strip()):
            continue
        blocks.append(
            DocumentBlock(
                type="image",
                image_path=rec["image_path"],
                image_caption=caption,
                page_number=rec["page_num"],
            )
        )
    return blocks


def _extract_pictures(doc, images_dir: Path | None, filename: str) -> list[DocumentBlock]:
    """Turn a docling document's pictures into captioned image blocks.

    Reads each picture's PIL image and any docling-provided caption, then hands the set to
    the shared :func:`_build_image_blocks` (filter → dedup → concurrent VLM→OCR).
    """
    if not hasattr(doc, "pictures"):
        return []

    entries: list[dict] = []
    for picture in doc.pictures:
        caption = None
        if hasattr(picture, "annotations"):
            for ann in picture.annotations:
                if getattr(ann, "text", None):
                    caption = ann.text
                    break
        if not caption and hasattr(picture, "caption_text"):
            try:
                caption = picture.caption_text(doc)
            except Exception:
                caption = None

        page_num = None
        if getattr(picture, "prov", None):
            page_num = getattr(picture.prov[0], "page_no", None)

        pil_img = None
        if images_dir:
            try:
                pil_img = picture.get_image(doc) if hasattr(picture, "get_image") else getattr(picture, "image", None)
            except Exception:
                pil_img = None

        entries.append({"pil_img": pil_img, "caption": caption, "page_num": page_num})

    return _build_image_blocks(entries, images_dir, filename)


# Bound on embedded images harvested from a single digital PDF: a cost/latency ceiling for the
# VLM on an image-heavy file (dedup happens after, so this caps *decoded* images, not captions).
_MAX_HARVEST_IMAGES = 60


def harvest_pdf_images(pdf_path: str | Path) -> list[dict]:
    """Pull embedded raster images out of a digital PDF WITHOUT rendering any page.

    This is the crucial distinction from docling: extracting an image *object* returns only
    that image's own bitmap (a chart, a screenshot), never a full-page render. So it stays
    memory-cheap and cannot std::bad_alloc the way docling's eager page rendering did. Tiny
    images are skipped by pixel size before they are even decoded.

    Returns a list of ``{"pil_img": PIL.Image, "page_num": int}`` in page order.
    """
    import pypdfium2 as pdfium
    import pypdfium2.raw as praw

    entries: list[dict] = []
    pdf = None
    try:
        pdf = pdfium.PdfDocument(str(pdf_path))
        for i in range(len(pdf)):
            if len(entries) >= _MAX_HARVEST_IMAGES:
                break
            page = pdf[i]
            try:
                for obj in page.get_objects(filter=(praw.FPDF_PAGEOBJ_IMAGE,)):
                    if len(entries) >= _MAX_HARVEST_IMAGES:
                        break
                    pil_img = None
                    try:
                        w, h = obj.get_px_size()
                        if max(w, h) < _MIN_IMAGE_DIM:
                            continue  # decorative (icon/rule); skip before decoding
                        pil_img = obj.get_bitmap(render=False).to_pil()
                    except Exception:
                        pil_img = None
                    if pil_img is not None:
                        entries.append({"pil_img": pil_img, "page_num": i + 1})
            finally:
                page.close()
    except Exception:
        logger.warning("Embedded image harvest failed for %s", pdf_path, exc_info=True)
    finally:
        if pdf is not None:
            pdf.close()
    return entries


def extract_pdf_native(pdf_path: str | Path, filename: str, images_dir: Path | None = None) -> ProcessedDocument:
    """Extract a digital (text-layer) PDF directly with pypdfium2, bypassing docling.

    docling renders every page to a bitmap for its layout/table/OCR models -- that rendering
    is what spiked memory and threw std::bad_alloc on the heavier Arabic pages. A PDF that
    already carries a text layer needs none of it: this reads the text in milliseconds, never
    crashes, and preserves Arabic far better than docling's own extraction did (1264 vs 177
    characters on the test report).

    When ``images_dir`` is given, embedded figures/charts are also harvested (without page
    rendering) and captioned through the same VLM→OCR pipeline docling uses, so a digital PDF
    no longer silently drops its visuals.
    """
    import pypdfium2 as pdfium

    doc_id = uuid4().hex[:12]
    blocks: list[DocumentBlock] = []
    md_parts: list[str] = []
    errors: list[str] = []
    page_count = 0
    pdf = None
    try:
        pdf = pdfium.PdfDocument(str(pdf_path))
        page_count = len(pdf)
        for i in range(page_count):
            try:
                text = pdf[i].get_textpage().get_text_range().strip()
            except Exception:
                text = ""
            if text:
                md_parts.append(f"### Page {i + 1}\n{text}")
                blocks.append(DocumentBlock(type="paragraph", text=text, page_number=i + 1))
    except Exception as exc:
        logger.exception("Native PDF extraction failed for %s", filename)
        errors.append(f"Native extraction error: {exc}")
    finally:
        if pdf is not None:
            pdf.close()

    # ── Harvest and caption embedded figures/charts (no page rendering) ──
    if images_dir is not None:
        try:
            harvested = harvest_pdf_images(pdf_path)
            img_blocks = _build_image_blocks(harvested, images_dir, filename)
            blocks.extend(img_blocks)
            cap_lines = [
                f"**[Figure, p{b.page_number}]:** {b.image_caption}"
                for b in img_blocks
                if b.image_caption and b.image_caption.strip()
            ]
            if cap_lines:
                md_parts.append("### Figures\n\n" + "\n\n".join(cap_lines))
        except Exception as exc:
            logger.warning("Image harvest/caption failed for %s", filename, exc_info=True)
            errors.append(f"Image extraction failed: {exc}")

    has_content = bool(blocks)
    markdown = _compact_table_markdown("\n\n".join(md_parts))
    return ProcessedDocument(
        doc_id=doc_id,
        filename=filename,
        format="pdf",
        status="success" if has_content else "failed",
        page_count=page_count or None,
        blocks=blocks,
        markdown=markdown,
        errors=errors if has_content else (errors or ["No extractable text in this PDF."]),
        processed_at=datetime.now(timezone.utc).isoformat(),
    )


def extract(
    result: "ConversionResult",
    filename: str,
    images_dir: Path | None = None,
) -> ProcessedDocument:
    """Extract structured content from a docling ``ConversionResult``.

    Parameters
    ----------
    result
        The output of ``converter.convert()``.
    filename
        Original filename (used for metadata).
    images_dir
        If provided, extracted images are saved here and their relative
        paths are stored in the ``DocumentBlock.image_path`` field.

    Returns
    -------
    ProcessedDocument
        Our unified document schema with blocks, markdown, and metadata.
    """
    from docling.datamodel.base_models import ConversionStatus

    doc_id = uuid4().hex[:12]
    errors: list[str] = []
    blocks: list[DocumentBlock] = []

    # ── Status mapping ───────────────────────────────────────────────
    if result.status == ConversionStatus.SUCCESS:
        status = "success"
    elif result.status == ConversionStatus.PARTIAL_SUCCESS:
        status = "partial"
        for err in result.errors or []:
            errors.append(str(err))
    else:
        status = "failed"
        for err in result.errors or []:
            errors.append(str(err))
        return ProcessedDocument(
            doc_id=doc_id,
            filename=filename,
            format=_extension_to_format(filename),
            status=status,
            errors=errors,
            processed_at=datetime.now(timezone.utc).isoformat(),
        )

    doc = result.document

    # ── Full markdown export ─────────────────────────────────────────
    markdown = ""
    try:
        markdown = doc.export_to_markdown()
    except Exception:
        logger.warning("Markdown export failed for %s", filename, exc_info=True)
        errors.append("Full markdown export failed")

    # ── Page count ───────────────────────────────────────────────────
    page_count = None
    try:
        if hasattr(doc, "pages") and doc.pages:
            page_count = len(doc.pages)
    except Exception:
        pass

    # ── Walk the document tree ───────────────────────────────────────
    try:
        _extract_items(doc, blocks, errors, images_dir)
    except Exception:
        logger.exception("Document tree walk failed for %s", filename)
        errors.append("Document tree extraction failed partially")

    # ── Extract tables separately (docling stores them as top-level) ─
    try:
        if hasattr(doc, "tables"):
            for table in doc.tables:
                table_data = _safe_table_to_dicts(table, doc)
                page_num = None
                if hasattr(table, "prov") and table.prov:
                    page_num = getattr(table.prov[0], "page_no", None)
                blocks.append(
                    DocumentBlock(
                        type="table",
                        table_data=table_data,
                        page_number=page_num,
                    )
                )
    except Exception:

        logger.warning("Table extraction failed for %s", filename, exc_info=True)
        errors.append("Some tables could not be extracted")

    # ── Extract pictures (filtered, de-duplicated, captioned concurrently) ──
    try:
        blocks.extend(_extract_pictures(doc, images_dir, filename))
    except Exception:
        logger.warning("Picture extraction failed for %s", filename, exc_info=True)
        errors.append("Some images could not be extracted")

    # ── Post-process Markdown: replace <!-- image --> placeholders with captions ──
    try:
        img_blocks = [b for b in blocks if b.type == "image" and b.image_caption]
        if img_blocks and "<!-- image -->" in markdown:
            for img in img_blocks:
                cap_text = f"**[Image {img.image_path or ''}]:** {img.image_caption}"
                markdown = markdown.replace("<!-- image -->", cap_text, 1)
        
        # ── Rescue passes for PDFs docling under-extracted ──
        # These SUPPLEMENT docling; they must not duplicate it. So the native-text pass only
        # runs when docling's own extraction came up thin, and only for pages docling did not
        # already cover. A normal digital PDF (docling works) touches neither pass.
        if filename.lower().endswith(".pdf"):
            target_pdf = None
            if hasattr(result, "input") and hasattr(result.input, "file") and Path(result.input.file).exists():
                target_pdf = str(result.input.file)
            elif images_dir and (images_dir.parent / "originals" / filename).exists():
                target_pdf = str(images_dir.parent / "originals" / filename)
            elif Path(filename).exists():
                target_pdf = filename

            covered_pages = {b.page_number for b in blocks if b.page_number and (b.text or b.table_data)}
            docling_thin = len(markdown.strip()) < 500

            if target_pdf and docling_thin:
                try:
                    import pypdfium2 as pdfium
                    pdf = pdfium.PdfDocument(target_pdf)
                    pdfium_lines = []
                    for i in range(len(pdf)):
                        page_no = i + 1
                        if page_no in covered_pages:
                            continue  # docling already has this page
                        page_text = pdf[i].get_textpage().get_text_range().strip()
                        if page_text:
                            pdfium_lines.append(f"\n### Page {page_no}\n{page_text}")
                            blocks.append(DocumentBlock(type="paragraph", text=page_text, page_number=page_no))
                            covered_pages.add(page_no)
                    pdf.close()
                    if pdfium_lines:
                        markdown = (markdown + "\n" + "\n".join(pdfium_lines)).strip()
                except Exception as pdf_err:
                    logger.warning("pypdfium2 native text extraction failed: %s", pdf_err)

            # OCR the pages that STILL have no text -- genuinely scanned/image-only pages.
            if target_pdf:
                before = len(blocks)
                _run_pdf_page_ocr_fallback(target_pdf, blocks, page_count)
                ocr_lines = [
                    f"\n### Page {b.page_number}\n{b.text}"
                    for b in blocks[before:]
                    if b.text
                ]
                if ocr_lines:
                    markdown = (markdown + "\n" + "\n".join(ocr_lines)).strip()

        # ── Fast python-pptx Native Text Pass for PPTX ──
        elif filename.lower().endswith(".pptx"):
            target_pptx = None
            if hasattr(result, "input") and hasattr(result.input, "file") and Path(result.input.file).exists():
                target_pptx = str(result.input.file)
            elif images_dir and (images_dir.parent / "originals" / filename).exists():
                target_pptx = str(images_dir.parent / "originals" / filename)
            elif Path(filename).exists():
                target_pptx = filename

            # Only rescue when docling under-extracted the deck; otherwise this duplicates it.
            if target_pptx and len(markdown.strip()) < 500:
                try:
                    from pptx import Presentation
                    prs = Presentation(target_pptx)
                    pptx_slides = []
                    for idx, slide in enumerate(prs.slides, 1):
                        slide_lines = []
                        for shape in slide.shapes:
                            if shape.has_text_frame:
                                for p in shape.text_frame.paragraphs:
                                    t = p.text.strip()
                                    if t:
                                        slide_lines.append(t)
                            elif shape.has_table:
                                for row in shape.table.rows:
                                    row_str = " | ".join(cell.text.strip() for cell in row.cells)
                                    slide_lines.append(row_str)
                        if slide_lines:
                            s_text = "\n".join(slide_lines)
                            pptx_slides.append(f"\n### Slide {idx}\n{s_text}")
                            blocks.append(DocumentBlock(type="paragraph", text=s_text, page_number=idx))

                    if pptx_slides:
                        markdown = (markdown + "\n" + "\n".join(pptx_slides)).strip()
                except Exception as pptx_err:
                    logger.warning("python-pptx native extraction failed: %s", pptx_err)


    except Exception:
        logger.warning("Markdown enrichment failed for %s", filename, exc_info=True)






    # Collapse over-wide sparse tables (spreadsheets especially) so the report context is
    # real data, not thousands of empty cells.
    try:
        markdown = _compact_table_markdown(markdown)
    except Exception:
        logger.warning("Table compaction failed for %s", filename, exc_info=True)

    return ProcessedDocument(
        doc_id=doc_id,
        filename=filename,
        format=_extension_to_format(filename),
        status=status,
        page_count=page_count,
        blocks=blocks,
        markdown=markdown,
        errors=errors,
        processed_at=datetime.now(timezone.utc).isoformat(),
    )


def _is_table_line(line: str) -> bool:
    s = line.strip()
    return len(s) >= 2 and s.startswith("|") and s.endswith("|")


def _table_cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip()[1:-1].split("|")]


def _is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(c and set(c) <= {"-", ":", " "} for c in cells)


def _compact_table_markdown(markdown: str, max_cols: int = 40) -> str:
    """Trim rendered markdown tables to their populated column extent.

    A spreadsheet whose used-range reaches column 370 makes docling emit 370 cells on every
    row, almost all empty -- 1.18M characters for a handful of real columns, which would then
    dominate the report's context. This truncates each table to the rightmost column that
    actually holds data (capped for safety) and drops fully-empty rows, without touching
    non-table text.
    """
    if "|" not in markdown:
        return markdown
    lines = markdown.splitlines()
    out: list[str] = []
    i, n = 0, len(lines)
    while i < n:
        if not _is_table_line(lines[i]):
            out.append(lines[i])
            i += 1
            continue
        # Gather one contiguous table block.
        block = []
        while i < n and _is_table_line(lines[i]):
            block.append(lines[i])
            i += 1
        rows = [_table_cells(l) for l in block]
        rightmost = 0
        for r in rows:
            if _is_separator_row(r):
                continue
            for idx, cell in enumerate(r):
                if cell:
                    rightmost = max(rightmost, idx)
        width = min(rightmost + 1, max_cols)
        for r in rows:
            trimmed = r[:width]
            if not _is_separator_row(trimmed) and not any(trimmed):
                continue  # drop a fully-empty row
            out.append("| " + " | ".join(trimmed) + " |")
    return "\n".join(out)


def _extract_items(doc, blocks: list[DocumentBlock], errors: list[str], images_dir: Path | None) -> None:
    """Walk the document body items and build text/heading/list blocks."""
    if not hasattr(doc, "iterate_items"):
        return

    try:
        for item_tuple in doc.iterate_items():
            item = item_tuple[0] if isinstance(item_tuple, tuple) else item_tuple
            level = item_tuple[1] if isinstance(item_tuple, tuple) and len(item_tuple) > 1 else None
            try:
                _process_item(item, level, doc, blocks)
            except Exception:
                continue
    except Exception:
        logger.warning("Error during iterate_items traversal", exc_info=True)


def _item_page(item) -> int | None:
    """Best-effort page number for a docling item, from its provenance."""
    try:
        if getattr(item, "prov", None):
            return getattr(item.prov[0], "page_no", None)
    except Exception:
        pass
    return None


def _process_item(item, level, doc, blocks: list[DocumentBlock]) -> None:
    """Process a single document item into a DocumentBlock."""
    item_type = type(item).__name__

    # Skip table and picture items here (they are handled in dedicated steps)
    if "TableItem" in item_type or "PictureItem" in item_type or "GroupItem" in item_type:
        return

    page = _item_page(item)  # so page-coverage tracking works for the rescue passes

    # Section headers
    if "SectionHeader" in item_type or "Heading" in item_type or "Title" in item_type:
        h_level = getattr(item, "level", level or 1)
        text = _get_text(item, doc)
        if text and text.strip():
            blocks.append(DocumentBlock(type="heading", level=h_level, text=text.strip(), page_number=page))
        return

    # List items
    if "ListItem" in item_type or "List" in item_type:
        text = _get_text(item, doc)
        if text and text.strip():
            blocks.append(DocumentBlock(type="list", text=text.strip(), page_number=page))
        return

    # Code blocks
    if "Code" in item_type:
        text = _get_text(item, doc)
        if text and text.strip():
            blocks.append(DocumentBlock(type="code", text=text.strip(), page_number=page))
        return

    # Text / Paragraph items
    if "TextItem" in item_type or hasattr(item, "text"):
        text = _get_text(item, doc)
        if text and text.strip():
            blocks.append(DocumentBlock(type="paragraph", text=text.strip(), page_number=page))



def _get_text(item, doc) -> str | None:
    """Safely extract text from a docling item."""
    # Try export_to_text method first (most reliable)
    if hasattr(item, "export_to_markdown"):
        try:
            return item.export_to_markdown(doc)
        except Exception:
            pass
    if hasattr(item, "text"):
        return item.text
    return str(item) if item else None


_OCR_READER = None

def _ocr_image_text(pil_img) -> str | None:
    """Fallback: extract text inside an image using EasyOCR when VLM description is empty."""
    global _OCR_READER
    try:
        import numpy as np
        import easyocr

        if _OCR_READER is None:
            # Same EasyOCR language constraint as the converter -- reuse its resolved set so
            # Arabic and French are never combined (which throws at reader construction).
            from app.services.desk_research.converter import OCR_LANGS
            _OCR_READER = easyocr.Reader(OCR_LANGS, gpu=False)


        # Scale small images up for clarity, downscale huge images to max 1200px for speed & memory safety
        w, h = pil_img.size
        if w > 1200 or h > 1200:
            scale = 1200.0 / max(w, h)
            scaled_img = pil_img.resize((int(w * scale), int(h * scale)))
        elif w < 600 or h < 600:
            scaled_img = pil_img.resize((w * 2, h * 2))
        else:
            scaled_img = pil_img

        img_np = np.array(scaled_img)
        # canvas_size caps the internal image EasyOCR allocates for detection (default 2560,
        # the source of the std::bad_alloc); batch_size=1 keeps recognition memory flat.
        results = _OCR_READER.readtext(img_np, canvas_size=1280, mag_ratio=1.0, batch_size=1)

        texts = [res[1].strip() for res in results if res[2] > 0.15 and res[1].strip()]
        return " | ".join(texts) if texts else None
    except Exception:
        logger.warning("EasyOCR fallback failed for image", exc_info=True)
        return None


# Rendering a full page to a bitmap for OCR is the most memory-hungry step in the whole
# pipeline (a scanned A4 at scale 2.0 is ~14 MP). On a long scanned PDF -- especially two
# uploaded at once -- that spiked memory enough to abort the conversion (the std::bad_alloc
# seen on the Arabic reports). A lower scale and a page cap keep it bounded.
_OCR_PAGE_RENDER_SCALE = 1.5
_MAX_OCR_FALLBACK_PAGES = 25


def _run_pdf_page_ocr_fallback(pdf_path: str, blocks: list[DocumentBlock], page_count: int | None = None) -> None:
    """Fallback for visual PDFs: OCR the pages that have no text yet, one page at a time,
    releasing each page bitmap before rendering the next so memory stays flat."""
    pdf = None
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(pdf_path)

        covered_pages = {
            b.page_number for b in blocks if b.page_number and (b.text or b.image_caption or b.table_data)
        }
        uncovered = [i for i in range(len(pdf)) if (i + 1) not in covered_pages][:_MAX_OCR_FALLBACK_PAGES]

        for i in uncovered:
            page_no = i + 1
            pil_img = None
            try:
                pil_img = pdf[i].render(scale=_OCR_PAGE_RENDER_SCALE).to_pil()
                ocr_text = _ocr_image_text(pil_img)
                if ocr_text:
                    blocks.append(
                        DocumentBlock(type="paragraph", text=f"[Page {page_no} OCR]: {ocr_text}", page_number=page_no)
                    )
            except Exception:
                # A single page that can't be rendered/OCR'd (e.g. transient OOM) must not
                # abort the whole document -- skip it and keep going.
                logger.warning("Page %d OCR fallback failed for %s", page_no, pdf_path)
            finally:
                if pil_img is not None:
                    pil_img.close()
    except Exception:
        logger.warning("PDF page OCR fallback failed for %s", pdf_path, exc_info=True)
    finally:
        if pdf is not None:
            pdf.close()





