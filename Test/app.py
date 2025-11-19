```python
"""
Flask app to receive audio from a browser recorder, run ASR + diarization pipeline
(using the functions in transcribe_and_diarize.py if present) and return a
speaker-attributed transcription to be displayed in the front-end.

Usage:
  1. Put transcribe_and_diarize.py (from the earlier message) in the same folder.
  2. Install system dependency ffmpeg and Python packages from requirements.txt.
  3. Optionally set HUGGINGFACE_TOKEN env var for pyannote diarization:
     export HUGGINGFACE_TOKEN="hf_..."
  4. Run: python app.py
  5. Open http://127.0.0.1:5000/

Notes:
 - If pyannote or enrollment functionality is not available the server will
   fallback to a simple Whisper transcription (single-speaker label).
 - Keep sensitive recordings private and only use with informed consent.
"""

import os
import uuid
import shutil
import traceback
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, render_template, abort

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
STATIC_DIR = Path("static")

app = Flask(__name__, static_folder=str(STATIC_DIR), template_folder=str(STATIC_DIR))

# Try to import the pipeline from transcribe_and_diarize.py (user should place that file next to this app)
try:
    from transcribe_and_diarize import run_pipeline, transcribe_whisper
    _HAS_PIPELINE = True
except Exception:
    # We'll fall back to a minimal local whisper-only function if transcribe_whisper is available
    try:
        from transcribe_and_diarize import transcribe_whisper
        _HAS_PIPELINE = False
    except Exception:
        transcribe_whisper = None
        _HAS_PIPELINE = False

# Ensure ffmpeg present (used by pydub/whisper)
def check_ffmpeg():
    from shutil import which
    return which("ffmpeg") is not None

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/upload", methods=["POST"])
def upload_audio():
    if not check_ffmpeg():
        return jsonify({"error": "ffmpeg not found on server. Install ffmpeg and restart."}), 500

    if "audio" not in request.files:
        return jsonify({"error": "No audio file uploaded (field name must be 'audio')."}), 400

    f = request.files["audio"]
    if f.filename == "":
        return jsonify({"error": "Empty filename."}), 400

    # Save uploaded file with unique name
    uid = uuid.uuid4().hex
    raw_path = UPLOAD_DIR / f"{uid}_{secure_filename(f.filename)}"
    f.save(raw_path)

    # Optionally convert to WAV 16k mono via pydub to ensure compatibility
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(raw_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        wav_path = UPLOAD_DIR / f"{uid}.wav"
        audio.export(wav_path, format="wav")
    except Exception as e:
        # If conversion fails, try to use the uploaded file directly
        wav_path = raw_path

    try:
        if _HAS_PIPELINE:
            # run full pipeline (diarization + whisper + optional enrollment)
            # Note: you can pass hf_token via env var HUGGINGFACE_TOKEN or through request args if you extend the endpoint.
            hf_token = os.environ.get("HUGGINGFACE_TOKEN", None)
            res = run_pipeline(str(wav_path), model_name="small", hf_token=hf_token, enrollment_files=None, language="es")
            # Return formatted transcript and other details to frontend
            out = {
                "formatted_transcript": res.get("formatted_transcript", ""),
                "merged_segments": res.get("merged_segments", []),
                "speaker_mapping": res.get("speaker_mapping", {}),
            }
            return jsonify(out)
        else:
            # Fallback: do only Whisper transcription (no diarization)
            if transcribe_whisper is None:
                return jsonify({"error": "No transcription pipeline available. Place transcribe_and_diarize.py next to this file."}), 500
            segments = transcribe_whisper(str(wav_path), model_name="small", language="es")
            # Map all segments to a single speaker "Person"
            assigned = []
            for seg in segments:
                assigned.append({"start": seg["start"], "end": seg["end"], "text": seg["text"], "speaker": "Person"})
            # Merge contiguous
            merged = []
            if assigned:
                cur = assigned[0].copy()
                for seg in assigned[1:]:
                    if seg["speaker"] == cur["speaker"] and abs(seg["start"] - cur["end"]) <= 1.0:
                        cur["end"] = seg["end"]
                        cur["text"] = (cur["text"] + " " + seg["text"]).strip()
                    else:
                        merged.append(cur)
                        cur = seg.copy()
                merged.append(cur)
            pretty = "\n".join([f'{m["speaker"]}: {m["text"]}' for m in merged])
            return jsonify({"formatted_transcript": pretty, "merged_segments": merged, "speaker_mapping": {}})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Processing error", "details": str(e)}), 500
    finally:
        # Optionally remove raw files to save disk; comment out if you want to keep uploads
        try:
            if raw_path.exists():
                raw_path.unlink()
        except Exception:
            pass
        try:
            if wav_path.exists() and wav_path != raw_path:
                wav_path.unlink()
        except Exception:
            pass

# Simple helper (werkzeug secure filename) to avoid user filenames causing issues
def secure_filename(fn: str) -> str:
    import re
    fn = os.path.basename(fn)
    # allow letters, numbers, dash, underscore, dot
    fn = re.sub(r'[^A-Za-z0-9._-]', '_', fn)
    return fn

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=5000, type=int)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()
    app.run(host=args.host, port=args.port, debug=args.debug)