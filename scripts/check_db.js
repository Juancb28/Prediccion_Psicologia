const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.get('SELECT COUNT(1) AS cnt FROM pacientes', (e, r) => { if (e) console.error(e); else console.log('pacientes:', r.cnt); });
    db.get('SELECT COUNT(1) AS cnt FROM transcripciones', (e, r) => { if (e) console.error(e); else console.log('transcripciones:', r.cnt); });
    db.all('SELECT paciente_id, session_index, substr(transcription_path, -80) as path FROM transcripciones ORDER BY paciente_id LIMIT 10', (e, rows) => { if (e) console.error(e); else { console.log('sample transcripciones:'); console.table(rows); } db.close(); });
});
