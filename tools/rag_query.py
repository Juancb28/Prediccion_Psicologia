#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
from typing import Any, Dict, List, Tuple

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
import google.generativeai as genai


def _json_out(obj: Dict[str, Any]) -> None:
    print(json.dumps(obj, ensure_ascii=False))


def _safe_str(e: BaseException) -> str:
    try:
        return str(e)
    except Exception:
        return repr(e)


def list_collection_names(qclient: QdrantClient) -> List[str]:
    try:
        cols = qclient.get_collections()
        # qdrant-client returns an object with .collections (list of CollectionDescription)
        items = getattr(cols, "collections", None) or []
        names: List[str] = []
        for c in items:
            n = getattr(c, "name", None)
            if n:
                names.append(str(n))
        return sorted(set(names))
    except Exception:
        return []


def payload_to_text_and_meta(payload: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    if not payload:
        return "", {}

    text = payload.get("page_content") or payload.get("text") or payload.get("content") or ""

    meta = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else None
    if not meta:
        meta = {k: v for k, v in payload.items() if k not in ("page_content", "text", "content")}

    return str(text).strip(), (meta or {})


def format_context(docs: List[Dict[str, Any]]) -> str:
    blocks: List[str] = []
    for i, d in enumerate(docs, 1):
        meta = d.get("metadata") or {}
        src = meta.get("source_pdf", "?")
        page = meta.get("page", "?")
        cat = meta.get("category", "?")
        blocks.append(f"[{i}] Fuente: {src} | p.{page} | {cat}\n{d.get('page_content','')}")
    return "\n\n".join(blocks)


def main() -> int:
    raw_in = sys.stdin.read()
    try:
        req = json.loads(raw_in) if raw_in.strip() else {}
    except Exception as e:
        _json_out({"ok": False, "error": "bad_json_in", "detail": _safe_str(e)})
        return 2

    collection = (req.get("collection") or "").strip()
    query = (req.get("query") or "").strip()
    k = int(req.get("k") or 6)
    top_n = int(req.get("top_n") or 25)

    if not collection or not query:
        _json_out({"ok": False, "error": "missing_collection_or_query"})
        return 2

    qdrant_url = os.environ.get("QDRANT_URL")
    qdrant_api_key = os.environ.get("QDRANT_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY")

    if not qdrant_url or not qdrant_api_key:
        _json_out({"ok": False, "error": "missing_qdrant_env"})
        return 2

    if not gemini_key:
        _json_out({"ok": False, "error": "missing_gemini_api_key"})
        return 2

    embed_model = os.environ.get("RAG_EMBED_MODEL", "intfloat/multilingual-e5-base")
    llm_model = os.environ.get("RAG_GEMINI_MODEL", "models/gemini-2.5-flash")

    try:
        embedder = SentenceTransformer(embed_model)
        qvec = embedder.encode([query], normalize_embeddings=True)[0].tolist()
    except Exception as e:
        _json_out({
            "ok": False,
            "error": "embedder_failed",
            "model": embed_model,
            "detail": _safe_str(e),
        })
        return 5

    qclient = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=120)

    # Validate collection exists to avoid opaque 500s like: "Collection `...` doesn't exist!"
    available = list_collection_names(qclient)
    if available and collection not in available:
        _json_out({
            "ok": False,
            "error": "collection_not_found",
            "collection": collection,
            "available_collections": available,
            "hint": "Revisa que QDRANT_URL/QDRANT_API_KEY apunten al mismo Qdrant donde cargaste los PDFs."
        })
        return 3

    # qdrant-client API differs by version. Your environment exposes query_points/query.
    # Support both older/newer clients.
    try:
        points = []
        if hasattr(qclient, "query_points"):
            # Newer API: returns QueryResponse with .points
            qr = qclient.query_points(
                collection_name=collection,
                query=qvec,
                limit=top_n,
                with_payload=True,
            )
            points = getattr(qr, "points", None) or []
        elif hasattr(qclient, "query"):
            # Some versions offer .query(...)
            qr = qclient.query(
                collection_name=collection,
                query_vector=qvec,
                limit=top_n,
                with_payload=True,
            )
            points = getattr(qr, "points", None) or getattr(qr, "result", None) or []
        elif hasattr(qclient, "search"):
            # Older API
            points = qclient.search(
                collection_name=collection,
                query_vector=qvec,
                limit=top_n,
                with_payload=True,
            )
        else:
            raise RuntimeError("Unsupported qdrant-client: no query_points/query/search method")
    except Exception as e:
        msg = _safe_str(e)
        # If Qdrant says the collection doesn't exist but list_collections failed,
        # return a clear error anyway.
        if "doesn't exist" in msg or "does not exist" in msg:
            _json_out({
                "ok": False,
                "error": "collection_not_found",
                "collection": collection,
                "available_collections": available,
                "detail": msg,
            })
            return 3
        _json_out({
            "ok": False,
            "error": "qdrant_query_failed",
            "collection": collection,
            "detail": msg,
        })
        return 4

    candidates: List[Dict[str, Any]] = []
    for h in points:
        payload = getattr(h, "payload", None) or {}
        text, meta = payload_to_text_and_meta(payload)
        if not text:
            continue
        candidates.append({
            "page_content": text,
            "metadata": meta,
            "score": float(getattr(h, "score", 0.0) or 0.0),
        })

    top_docs = candidates[:k]
    context = format_context(top_docs)

    try:
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel(llm_model)
    except Exception as e:
        _json_out({
            "ok": False,
            "error": "gemini_init_failed",
            "model": llm_model,
            "detail": _safe_str(e),
            "hint": "Revisa GEMINI_API_KEY en .env y reinicia node server.js",
        })
        return 6

    prompt = f"""Eres un asistente de apoyo para psicólogos.
Usa SOLO el contexto proporcionado (libros).
No emitas diagnósticos definitivos; formula hipótesis y sugerencias clínicas.
Si el contexto no alcanza para responder, dilo explícitamente.
Incluye referencias a los fragmentos con [n].

CONSULTA:
{query}

CONTEXTO:
{context}

RESPUESTA:
"""

    try:
        resp = model.generate_content(prompt)
        answer = (getattr(resp, "text", "") or "").strip()
    except Exception as e:
        msg = _safe_str(e)
        err_name = "gemini_failed"
        if "API key" in msg or "api key" in msg or "key not valid" in msg or "invalid api key" in msg.lower():
            err_name = "invalid_gemini_api_key"

        _json_out({
            "ok": False,
            "error": err_name,
            "model": llm_model,
            "detail": msg,
            "hint": "Tu GEMINI_API_KEY parece inválida o no autorizada. Genera una nueva en Google AI Studio, actualiza .env y reinicia el servidor.",
        })
        return 7

    _json_out({
        "ok": True,
        "collection": collection,
        "k": k,
        "answer": answer,
        "sources": [
            {
                "source_pdf": (d.get("metadata") or {}).get("source_pdf"),
                "page": (d.get("metadata") or {}).get("page"),
                "category": (d.get("metadata") or {}).get("category"),
            }
            for d in top_docs
        ],
    })

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
