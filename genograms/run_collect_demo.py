import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from genograms.genogram_model import GenogramGenerator

if __name__ == "__main__":
    g = GenogramGenerator()
    print("Running process_patient_sessions for patient_elisa...")
    try:
        out = g.process_patient_sessions('patient_elisa', 'outputs/genograma_from_patient_elisa_runner')
        print('Generated:', out)
    except Exception as e:
        import traceback
        traceback.print_exc()
