const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const repoRoot = path.join(__dirname, '..');
const dataPath = path.join(repoRoot, 'data.json');
const dbPath = path.join(repoRoot, 'data.sqlite');

if (!fs.existsSync(dataPath)) {
    console.error('data.json not found at', dataPath);
    process.exit(1);
}

const raw = fs.readFileSync(dataPath, 'utf8');
let j = null;
try { j = JSON.parse(raw); } catch (e) { console.error('Invalid JSON in data.json', e); process.exit(2); }
const sesiones = Array.isArray(j.sesiones) ? j.sesiones : (j.sessions || []);
if (!sesiones.length) {
    console.log('No sesiones found to import');
    process.exit(0);
}

const db = new sqlite3.Database(dbPath);
let imported = 0;

function insertOne(s, cb) {
    const now = (new Date()).toISOString();
    const soapVal = (s.soap && typeof s.soap === 'object') ? JSON.stringify(s.soap) : (s.soap || null);
    db.run('INSERT INTO sesiones (paciente_id, fecha, notas, soap, duracion, recording_path, estado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        s.pacienteId || s.paciente_id || null,
        s.fecha || null,
        s.notas || s.notes || '',
        soapVal,
        s.duracion || s.duration || null,
        s.recording_path || s.recordingPath || null,
        s.estado || s.status || 'finalizada',
        now
    ], function(err) {
        if (err) return cb(err);
        imported++;
        cb(null);
    });
}

let i = 0;
function next() {
    if (i >= sesiones.length) {
        console.log('Imported', imported, 'sesiones');
        db.close();
        return;
    }
    insertOne(sesiones[i], (err) => {
        if (err) console.warn('Failed to import item', i, err && err.message);
        i++;
        setImmediate(next);
    });
}

next();
