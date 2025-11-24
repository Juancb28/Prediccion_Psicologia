import sys
import os
import json
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing_audio_path"}))
        sys.exit(2)
    audio_path = sys.argv[1]
    # allow optional model size and language via env
    model_size = os.environ.get('WHISPER_MODEL', 'small')
    language = os.environ.get('TRANSCRIBE_LANG', 'es')
    out_dir = os.environ.get('TRANSCRIBE_OUT', 'outputs')

    try:
        # Import transcribe_audio by file location to avoid requiring a package __init__.py
        import importlib.util
        script_dir = Path(__file__).resolve().parent
        ta_path = script_dir / 'transcribe_audio.py'
        spec = importlib.util.spec_from_file_location('transcribe_audio', str(ta_path))
        ta = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ta)
        transcribe_audio = getattr(ta, 'transcribe_audio')
    except Exception as e:
        print(json.dumps({"error": "import_failed", "detail": str(e)}))
        sys.exit(3)

    try:
        res = transcribe_audio(audio_path, model_size=model_size, language=language, output_dir=out_dir)
        # compact return
        out = {
            'text': res.get('text', ''),
            'segments': res.get('segments', []),
            'json_path': os.path.join(out_dir, f"{Path(audio_path).stem}_transcription.json"),
            'txt_path': os.path.join(out_dir, f"{Path(audio_path).stem}_transcription.txt")
        }
        print(json.dumps(out, ensure_ascii=False))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": "transcription_failed", "detail": str(e)}))
        sys.exit(4)

if __name__ == '__main__':
    main()
