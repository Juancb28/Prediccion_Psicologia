#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
import re
from typing import Any, Dict, List, Tuple

from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer
import google.generativeai as genai


DEFAULT_COLLECTION = "rag_ics_enfermedadesmundiales"


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
        src = meta.get("source_pdf") or meta.get("source") or "?"
        code = meta.get("code") or meta.get("icd11_code") or meta.get("id") or ""
        cat = meta.get("category") or meta.get("area") or "?"
        header = f"[{i}]"
        if code:
            header += f" Código: {code}"
        header += f" | Fuente: {src} | {cat}"
        blocks.append(f"{header}\n{d.get('page_content','')}")
    return "\n\n".join(blocks)


def _extract_json_obj(text: str) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}

    # Try strict parse first
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try to extract first JSON object
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


def _normalize_scores(top: Any, limit: int = 5) -> List[Dict[str, Any]]:
    if not isinstance(top, list):
        return []

    out: List[Dict[str, Any]] = []
    for item in top:
        if not isinstance(item, dict):
            continue
        nombre = str(item.get("nombre") or item.get("name") or "").strip()
        if not nombre:
            continue
        score = item.get("score")
        try:
            score_f = float(score)
        except Exception:
            score_f = 0.0
        score_f = max(0.0, min(100.0, score_f))

        code = item.get("codigo") or item.get("code") or ""
        ev = item.get("evidencia") or item.get("evidence") or []
        if not isinstance(ev, list):
            ev = []
        ev_norm = []
        for x in ev:
            try:
                xi = int(x)
                if xi >= 1:
                    ev_norm.append(xi)
            except Exception:
                continue

        out.append({
            "nombre": nombre,
            "codigo": str(code).strip() if code else "",
            "score": score_f,
            "evidencia": ev_norm[:6],
        })

    out.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    return out[: max(1, int(limit))]


def main() -> int:
    raw_in = sys.stdin.read()
    try:
        req = json.loads(raw_in) if raw_in.strip() else {}
    except Exception as e:
        _json_out({"ok": False, "error": "bad_json_in", "detail": _safe_str(e)})
        return 2

    collection = (req.get("collection") or DEFAULT_COLLECTION).strip() or DEFAULT_COLLECTION
    clinical_text = (req.get("clinical_text") or "").strip()
    search_query = (req.get("search_query") or clinical_text).strip()

    k = int(req.get("k") or 8)
    top_n = int(req.get("top_n") or 40)
    out_top = int(req.get("out_top") or 5)

    if not clinical_text:
        _json_out({"ok": False, "error": "missing_clinical_text"})
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
        qvec = embedder.encode([search_query], normalize_embeddings=True)[0].tolist()
    except Exception as e:
        _json_out({
            "ok": False,
            "error": "embedder_failed",
            "model": embed_model,
            "detail": _safe_str(e),
        })
        return 5

    qclient = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=120)

    available = list_collection_names(qclient)
    if available and collection not in available:
        _json_out({
            "ok": False,
            "error": "collection_not_found",
            "collection": collection,
            "available_collections": available,
            "hint": "Revisa que QDRANT_URL/QDRANT_API_KEY apunten al mismo Qdrant donde cargaste las colecciones.",
        })
        return 3

    try:
        points = []
        if hasattr(qclient, "query_points"):
            qr = qclient.query_points(
                collection_name=collection,
                query=qvec,
                limit=top_n,
                with_payload=True,
            )
            points = getattr(qr, "points", None) or []
        elif hasattr(qclient, "query"):
            qr = qclient.query(
                collection_name=collection,
                query_vector=qvec,
                limit=top_n,
                with_payload=True,
            )
            points = getattr(qr, "points", None) or getattr(qr, "result", None) or []
        elif hasattr(qclient, "search"):
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

    top_docs = candidates[: max(1, k)]
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
        })
        return 6

    prompt = f"""Eres un asistente de apoyo para psicólogos.
Tu tarea NO es diagnosticar. Solo orientar con hipótesis basadas en ICD-11.
Usa SOLO el CONTEXTO ICD-11 proporcionado (RAG). Si el contexto no basta, baja los scores.

Devuelve SOLO JSON válido (sin markdown) con este esquema exacto:
{{
  \"top\": [{{\"nombre\":\"...\", \"codigo\":\"...\", \"score\": 0, \"evidencia\": [1] }}],
  \"nota\": \"...\"
}}

REGLAS:
- score en 0..100.
- evidencia son índices de fragmentos [n] usados.
- máximo {out_top} items en top.

TEXTO CLÍNICO:
{clinical_text}

CONTEXTO ICD-11:
{context}
"""

    try:
        resp = model.generate_content(prompt)
        raw_answer = (getattr(resp, "text", "") or "").strip()
    except Exception as e:
        msg = _safe_str(e)
        err_name = "gemini_failed"
        if "api key" in msg.lower() or "invalid" in msg.lower():
            err_name = "invalid_gemini_api_key"
        _json_out({
            "ok": False,
            "error": err_name,
            "model": llm_model,
            "detail": msg,
            "hint": "Revisa GEMINI_API_KEY y reinicia el servidor.",
        })
        return 7

    parsed = _extract_json_obj(raw_answer)
    top = _normalize_scores(parsed.get("top"), limit=out_top) if isinstance(parsed, dict) else []
    note = ""
    if isinstance(parsed, dict):
        note = str(parsed.get("nota") or parsed.get("note") or "").strip()

    _json_out({
        "ok": True,
        "collection": collection,
        "k": k,
        "scores": top,
        "note": note,
        "parse_ok": bool(top) or bool(note),
        "raw_answer": raw_answer,
        "sources": [
            {
                "source": (d.get("metadata") or {}).get("source_pdf") or (d.get("metadata") or {}).get("source"),
                "page": (d.get("metadata") or {}).get("page"),
                "category": (d.get("metadata") or {}).get("category") or (d.get("metadata") or {}).get("area"),
                "code": (d.get("metadata") or {}).get("code") or (d.get("metadata") or {}).get("icd11_code"),
            }
            for d in top_docs
        ],
    })

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
