"""Per-namespace vector store persisted to disk.

One index per namespace (e.g. ``desk_research:<session_id>``). Small by nature -- a session is
tens to a few hundred chunks -- so a brute-force cosine over a numpy matrix is instant and needs
no vector database. When embeddings are unavailable, ``query_index`` falls back to lexical
(keyword-overlap) scoring over the same stored chunks, so retrieval degrades instead of breaking.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from pathlib import Path

import numpy as np

from app.schemas.rag import RagChunk, RetrievedChunk
from app.services.rag.embeddings import get_embedder

logger = logging.getLogger(__name__)

_RAG_ROOT = Path(os.getenv("RAG_DATA_ROOT", "rag_data"))
_WORD = re.compile(r"\w+", re.UNICODE)  # \w matches Arabic letters too, so lexical works multilingually

# Minimum cosine similarity for a semantic hit to be kept. Default 0.0 = keep top-k regardless:
# e5 scores are compressed (relevant ~0.80-0.88, unrelated ~0.72), so an absolute cutoff is
# brittle -- we favor recall and let the answering prompt decline when context doesn't fit.
# Set RAG_MIN_SCORE (e.g. 0.78) to drop weak matches instead.
_MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.0"))


def _safe(namespace: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", namespace)


def _ns_dir(namespace: str) -> Path:
    return _RAG_ROOT / _safe(namespace)


def build_index(namespace: str, chunks: list[RagChunk]) -> int:
    """(Re)build the index for a namespace: persist chunks and, if possible, their vectors."""
    d = _ns_dir(namespace)
    d.mkdir(parents=True, exist_ok=True)

    (d / "chunks.json").write_text(
        json.dumps([c.model_dump() for c in chunks], ensure_ascii=False),
        encoding="utf-8",
    )

    vecs = get_embedder().embed_passages([c.text for c in chunks]) if chunks else None
    vec_path = d / "vectors.npy"
    if vecs is not None:
        np.save(str(vec_path), vecs)
    elif vec_path.exists():
        vec_path.unlink()  # drop stale vectors so query cleanly falls back to lexical

    logger.info("RAG index built for %s: %d chunks (vectors=%s)", namespace, len(chunks), vecs is not None)
    return len(chunks)


def _load_chunks(namespace: str) -> list[RagChunk]:
    p = _ns_dir(namespace) / "chunks.json"
    if not p.exists():
        return []
    try:
        return [RagChunk(**c) for c in json.loads(p.read_text(encoding="utf-8"))]
    except Exception:
        logger.warning("Could not read RAG chunks for %s", namespace, exc_info=True)
        return []


def has_index(namespace: str) -> bool:
    return (_ns_dir(namespace) / "chunks.json").exists()


def _lexical(chunks: list[RagChunk], query: str, k: int) -> list[RetrievedChunk]:
    q_words = {w.lower() for w in _WORD.findall(query) if len(w) > 2}
    scored: list[tuple[int, RagChunk]] = []
    for c in chunks:
        c_words = {w.lower() for w in _WORD.findall(c.text)}
        s = len(q_words & c_words)
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda t: t[0], reverse=True)
    if not scored:
        # Nothing matched: return the opening chunks so the LLM still has grounding.
        return [RetrievedChunk(chunk=c, score=0.0) for c in chunks[:k]]
    return [RetrievedChunk(chunk=c, score=float(s)) for s, c in scored[:k]]


def query_index(namespace: str, query: str, k: int = 6) -> list[RetrievedChunk]:
    """Return the top-k chunks for a query: semantic cosine when vectors exist, else lexical."""
    chunks = _load_chunks(namespace)
    if not chunks:
        return []

    vec_path = _ns_dir(namespace) / "vectors.npy"
    embedder = get_embedder()
    if vec_path.exists() and embedder.available:
        try:
            vecs = np.load(str(vec_path))
            qv = embedder.embed_query(query)
            if qv is not None and vecs.shape[0] == len(chunks):
                sims = vecs @ qv  # both normalized -> cosine similarity
                top = np.argsort(-sims)[:k]
                hits = [
                    RetrievedChunk(chunk=chunks[int(i)], score=float(sims[int(i)]))
                    for i in top
                    if float(sims[int(i)]) >= _MIN_SCORE
                ]
                return hits
        except Exception:
            logger.warning("Semantic query failed for %s; using lexical.", namespace, exc_info=True)

    return _lexical(chunks, query, k)


def delete_index(namespace: str) -> None:
    d = _ns_dir(namespace)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
