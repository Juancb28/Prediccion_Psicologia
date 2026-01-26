import sys
from pathlib import Path

# ensure project root is on sys.path so we can import genograms when running this script
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from genograms.genogram_model import GenogramGenerator

# Demo family data to show hierarchy: grandparents -> parents -> patient
family_data = {
    "personas": [
        {"id": "gpl1", "nombre": "Sebastian", "genero": "masculino", "edad": 81},
        {"id": "gpl2", "nombre": "Gloria", "genero": "femenino", "edad": 80},
        {"id": "gpr1", "nombre": "Pepe", "genero": "masculino", "edad": 71},
        {"id": "gpr2", "nombre": "Juana", "genero": "femenino", "edad": 69},
        {"id": "p1", "nombre": "Aaron", "genero": "masculino", "edad": 48},
        {"id": "p2", "nombre": "Maria", "genero": "femenino", "edad": 42},
        {"id": "patient", "nombre": "Lisa", "genero": "femenino", "edad": 19, "condiciones": ["consultante"]}
    ],
    "relaciones": [
        # grandparents -> parents
        {"tipo": "padre-hijo", "persona1_id": "gpl1", "persona2_id": "p1"},
        {"tipo": "padre-hijo", "persona1_id": "gpl2", "persona2_id": "p1"},
        {"tipo": "padre-hijo", "persona1_id": "gpr1", "persona2_id": "p2"},
        {"tipo": "padre-hijo", "persona1_id": "gpr2", "persona2_id": "p2"},
        # parents couple
        {"tipo": "pareja", "persona1_id": "p1", "persona2_id": "p2", "estado_civil": "casados"},
        # parents -> patient
        {"tipo": "padre-hijo", "persona1_id": "p1", "persona2_id": "patient"},
        {"tipo": "padre-hijo", "persona1_id": "p2", "persona2_id": "patient"}
    ]
}

if __name__ == "__main__":
    # API key not needed because we won't call the model in this demo
    gen = GenogramGenerator(api_key="")
    out = gen.create_genogram(family_data, output_file="outputs/genograma_demo")
    print("Generated:", out)
