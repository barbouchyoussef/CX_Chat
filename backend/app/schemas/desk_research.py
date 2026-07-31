"""Pydantic schemas for the Desk Research document processing pipeline."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class DocumentBlock(BaseModel):
    """A single content block extracted from a document."""

    type: Literal["heading", "paragraph", "table", "image", "list", "code"]
    level: int | None = None
    text: str | None = None
    table_data: list[dict] | None = None
    image_path: str | None = None
    image_caption: str | None = None
    page_number: int | None = None
    source_sheet: str | None = None


class ProcessedDocument(BaseModel):
    """Full structured output from processing one document."""

    doc_id: str
    filename: str
    format: str
    status: Literal["success", "partial", "failed"]
    page_count: int | None = None
    language_hints: list[str] = []
    blocks: list[DocumentBlock] = []
    markdown: str = ""
    errors: list[str] = []
    processed_at: str


class DocumentSummary(BaseModel):
    """Lightweight summary of a processed document (no blocks/markdown)."""

    doc_id: str
    filename: str
    format: str
    status: str
    page_count: int | None = None
    block_count: int = 0


class StoredChatMessage(BaseModel):
    """One persisted chat turn, so the conversation survives a page reload."""

    id: str
    role: str  # "user" | "assistant"
    text: str
    sources: list[str] = []
    ts: float | None = None


class SessionInfo(BaseModel):
    """Metadata about a desk research session.

    Persisted to ``session.json`` so a session -- its documents, the goal the user typed, and
    the last generated report -- survives a page reload instead of living only in the browser.
    """

    session_id: str
    created_at: str
    title: str | None = None
    # The focus/goal the user entered for the report, kept so it is restored on reload.
    user_context: str | None = None
    # Last generated report. Omitted from the lightweight session list (see has_report).
    report_markdown: str | None = None
    report_generated_at: str | None = None
    has_report: bool = False
    document_count: int = 0
    documents: list[DocumentSummary] = []
    # Persisted chat history (empty in the lightweight session list).
    messages: list[StoredChatMessage] = []


class UploadResponse(BaseModel):
    """Response after uploading files to a session."""

    session_id: str
    results: list[DocumentSummary] = []
    errors: list[str] = []
