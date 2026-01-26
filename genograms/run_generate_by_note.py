import sys
import json
import warnings
from pathlib import Path

# Silenciar advertencias en stdout para no romper el parser JSON del servidor
warnings.filterwarnings("ignore")

from genogram_model import GenogramGenerator

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "missing_patient_folder"}))
        sys.exit(2)
    
    patient_folder = sys.argv[1]
    session_number = sys.argv[2] if len(sys.argv) > 2 else None
    output_file = sys.argv[3] if len(sys.argv) > 3 else f'genograma_{patient_folder}_by_note'

    g = GenogramGenerator()
    try:
        if session_number:
            # Generar solo con sesión específica
            out = g.generate_genogram_from_specific_session(patient_folder, session_number, output_file=output_file)
        else:
            # Fallback al método anterior (búsqueda por keyword)
            out = g.generate_genogram_from_patient_by_note(patient_folder, note_keyword='árbol', output_file=output_file)
            
        if out:
            # Return relative path
            p = Path(out).resolve()
            print(json.dumps({"ok": True, "output": str(p)}))
            sys.exit(0)
        else:
            print(json.dumps({"ok": False, "error": "no_session_with_note"}))
            sys.exit(0)
    except Exception as e:
        print(json.dumps({"ok": False, "error": "exception", "detail": str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
