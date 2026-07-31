"""Disk-based session manager for desk research.

Each session gets a directory under ``desk_research_data/<session_id>/`` with:
- ``session.json`` — metadata sidecar
- ``originals/``   — uploaded files (kept for re-processing)
- ``processed/``   — one ``<doc_id>.json`` per processed document
- ``images/``      — extracted figure images

No database tables are needed — everything is self-contained on disk.
"""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.core.text_normalization import repair_encoding
from app.schemas.desk_research import (
    DocumentSummary,
    ProcessedDocument,
    SessionInfo,
    StoredChatMessage,
)

logger = logging.getLogger(__name__)

# Root of all session data — relative to the backend working directory.
_DATA_ROOT = Path("desk_research_data")

MAX_FILES_PER_SESSION = 10
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _session_dir(session_id: str) -> Path:
    return _DATA_ROOT / session_id


def _originals_dir(session_id: str) -> Path:
    return _session_dir(session_id) / "originals"


def _processed_dir(session_id: str) -> Path:
    return _session_dir(session_id) / "processed"


def _images_dir(session_id: str, doc_id: str) -> Path:
    return _session_dir(session_id) / "images" / doc_id


def _meta_path(session_id: str) -> Path:
    return _session_dir(session_id) / "session.json"


def _chat_path(session_id: str) -> Path:
    return _session_dir(session_id) / "chat.json"


# Cap stored history so a long-lived session's chat.json can't grow without bound.
_MAX_STORED_MESSAGES = 200


def load_chat(session_id: str) -> list[StoredChatMessage]:
    """Load the persisted chat history for a session (empty if none)."""
    path = _chat_path(session_id)
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return [StoredChatMessage(**m) for m in raw]
    except Exception:
        logger.warning("Could not read chat history for %s", session_id, exc_info=True)
        return []


def append_chat(session_id: str, messages: list[StoredChatMessage]) -> None:
    """Append turns to a session's chat history (heals mojibake, keeps the last N)."""
    if not messages:
        return
    existing = load_chat(session_id)
    for m in messages:
        m.text = repair_encoding(m.text)
        m.sources = [repair_encoding(s) for s in m.sources]
    combined = (existing + messages)[-_MAX_STORED_MESSAGES:]
    path = _chat_path(session_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([m.model_dump() for m in combined], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def clear_chat(session_id: str) -> None:
    """Delete a session's chat history."""
    path = _chat_path(session_id)
    if path.exists():
        path.unlink()


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------

def create_session(title: str | None = None) -> SessionInfo:
    """Create a new empty session and return its metadata."""
    session_id = uuid4().hex[:16]
    now = datetime.now(timezone.utc).isoformat()

    _originals_dir(session_id).mkdir(parents=True, exist_ok=True)
    _processed_dir(session_id).mkdir(parents=True, exist_ok=True)

    info = SessionInfo(session_id=session_id, created_at=now, title=title)
    _write_meta(session_id, info)
    logger.info("Created desk-research session %s", session_id)
    return info


def rename_session(session_id: str, title: str) -> bool:
    """Set a session's display title. Returns False if the session does not exist."""
    if not _meta_path(session_id).exists():
        return False
    info = _read_meta(session_id)
    info.title = (title or "").strip() or None
    _write_meta(session_id, info)
    logger.info("Renamed session %s to %r", session_id, info.title)
    return True


def save_report(session_id: str, markdown: str, user_context: str | None = None,
                title: str | None = None) -> None:
    """Persist a generated report onto the session so it survives reloads."""
    if not _meta_path(session_id).exists():
        return
    info = _read_meta(session_id)
    info.report_markdown = markdown
    info.report_generated_at = datetime.now(timezone.utc).isoformat()
    info.has_report = True
    if user_context is not None:
        info.user_context = user_context
    if title:
        info.title = title
    _write_meta(session_id, info)
    logger.info("Saved report onto session %s", session_id)


def get_session(session_id: str) -> SessionInfo | None:
    """Load session metadata and document summaries, or ``None``."""
    meta_path = _meta_path(session_id)
    if not meta_path.exists():
        return None

    info = _read_meta(session_id)

    # Rebuild document list from processed/ directory
    docs: list[DocumentSummary] = []
    processed = _processed_dir(session_id)
    if processed.exists():
        for json_file in sorted(processed.glob("*.json")):
            try:
                doc = ProcessedDocument.model_validate_json(json_file.read_text(encoding="utf-8"))
                docs.append(
                    DocumentSummary(
                        doc_id=doc.doc_id,
                        # Heal any mojibake filename saved before the ingestion fix.
                        filename=repair_encoding(doc.filename),
                        format=doc.format,
                        status=doc.status,
                        page_count=doc.page_count,
                        block_count=len(doc.blocks),
                    )
                )
            except Exception:
                logger.warning("Could not read processed doc %s", json_file.name)

    info.documents = docs
    info.document_count = len(docs)
    # Heal older reports/titles that were stored with mojibake (no-op on clean text).
    info.report_markdown = repair_encoding(info.report_markdown) if info.report_markdown else info.report_markdown
    info.title = repair_encoding(info.title) if info.title else info.title
    info.has_report = bool(info.report_markdown)
    info.messages = load_chat(session_id)
    return info


def delete_session(session_id: str) -> bool:
    """Remove a session and all its files.  Returns True if it existed."""
    session_dir = _session_dir(session_id)
    if not session_dir.exists():
        return False
    shutil.rmtree(session_dir, ignore_errors=True)
    logger.info("Deleted desk-research session %s", session_id)
    return True


def list_sessions() -> list[SessionInfo]:
    """List all existing sessions (lightweight — no document details)."""
    sessions: list[SessionInfo] = []
    if not _DATA_ROOT.exists():
        return sessions
    for entry in _DATA_ROOT.iterdir():
        if entry.is_dir() and (_meta_path(entry.name)).exists():
            info = _read_meta(entry.name)
            info.document_count = len(list(_processed_dir(entry.name).glob("*.json")))
            # Keep the list lightweight: report presence as a flag, not the full markdown.
            info.has_report = bool(info.report_markdown)
            info.report_markdown = None
            info.documents = []
            sessions.append(info)
    # Newest first, so the sidebar opens on the most recent work.
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return sessions


# ---------------------------------------------------------------------------
# File storage
# ---------------------------------------------------------------------------

def save_original(session_id: str, filename: str, content: bytes) -> Path:
    """Save an uploaded file to the session's ``originals/`` directory.

    Returns the full path to the saved file.

    Raises
    ------
    ValueError
        If the session has reached its file limit or the file is too large.
    """
    # Size check
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"File '{filename}' is {len(content) / 1024 / 1024:.1f} MB — "
            f"max allowed is {MAX_FILE_SIZE_BYTES / 1024 / 1024:.0f} MB."
        )

    # Count check
    originals = _originals_dir(session_id)
    existing = list(originals.glob("*"))
    if len(existing) >= MAX_FILES_PER_SESSION:
        raise ValueError(
            f"Session already has {len(existing)} files — "
            f"max is {MAX_FILES_PER_SESSION}."
        )

    # Sanitise filename — keep only the basename, replace weird chars
    safe_name = Path(filename).name.replace(" ", "_")
    originals.mkdir(parents=True, exist_ok=True)
    dest = originals / safe_name


    # Avoid overwriting — append a short suffix if needed
    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        safe_name = f"{stem}_{uuid4().hex[:6]}{suffix}"
        dest = originals / safe_name

    dest.write_bytes(content)
    logger.info("Saved original %s → %s", filename, dest)
    return dest


def save_processed(session_id: str, doc: ProcessedDocument) -> Path:
    """Persist a ``ProcessedDocument`` as JSON in the session's processed dir."""
    processed_dir = _processed_dir(session_id)
    processed_dir.mkdir(parents=True, exist_ok=True)
    dest = processed_dir / f"{doc.doc_id}.json"
    dest.write_text(doc.model_dump_json(indent=2), encoding="utf-8")

    logger.info("Saved processed doc %s → %s", doc.doc_id, dest)
    return dest


def delete_document(session_id: str, doc_id: str) -> bool:
    """Remove one processed document (its JSON + extracted images). True if it existed."""
    path = _processed_dir(session_id) / f"{doc_id}.json"
    existed = path.exists()
    if existed:
        try:
            path.unlink()
        except OSError:
            logger.warning("Could not delete processed doc %s", path)
            return False
    images = _images_dir(session_id, doc_id)
    if images.exists():
        shutil.rmtree(images, ignore_errors=True)
    return existed


def load_processed(session_id: str, doc_id: str) -> ProcessedDocument | None:
    """Load a single processed document, or ``None`` if not found."""
    path = _processed_dir(session_id) / f"{doc_id}.json"
    if not path.exists():
        return None
    try:
        return ProcessedDocument.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Could not parse processed doc %s", path)
        return None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _write_meta(session_id: str, info: SessionInfo) -> None:
    path = _meta_path(session_id)
    path.write_text(info.model_dump_json(indent=2), encoding="utf-8")


def _read_meta(session_id: str) -> SessionInfo:
    path = _meta_path(session_id)
    return SessionInfo.model_validate_json(path.read_text(encoding="utf-8"))
