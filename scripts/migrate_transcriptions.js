const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const repoRoot = path.join(__dirname, '..');
const dbPath = path.join(repoRoot, 'data.sqlite');
const outputsDir = path.join(repoRoot, 'outputs');

function sanitizePatientName(name) {
    return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .toLowerCase();
}

if (!fs.existsSync(dbPath)) {
    console.error('Database not found at', dbPath);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

function allAsync(sql, params=[]) {
    return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
function getAsync(sql, params=[]) {
    return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function runAsync(sql, params=[]) {
    return new Promise((resolve, reject) => db.run(sql, params, function(err){ if(err) return reject(err); resolve(this); }));
}

(async () => {
    try {
        // ensure transcripciones table exists
        await runAsync(`CREATE TABLE IF NOT EXISTS transcripciones (
            id INTEGER PRIMARY KEY,
            paciente_id INTEGER,
            session_index INTEGER,
            transcription_text TEXT,
            transcription_path TEXT,
            last_updated TEXT,
            UNIQUE(paciente_id, session_index)
        )`);

        const pacientes = await allAsync('SELECT * FROM pacientes');
        const nameToId = new Map();
        pacientes.forEach(p => { const s = sanitizePatientName(p.nombre || ''); if (s) nameToId.set(s, p.id); });

        const foundFiles = [];
        function walk(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.isFile() && /_transcription\.txt$/i.test(e.name)) foundFiles.push(full);
            }
        }
        if (!fs.existsSync(outputsDir)) {
            console.error('Outputs dir not found:', outputsDir);
            process.exit(1);
        }
        walk(outputsDir);

        let imported = 0; let skipped = 0; const problems = [];

        for (const fpath of foundFiles) {
            try {
                const parts = fpath.split(path.sep);
                const patientSeg = parts.find(p => p.startsWith('patient_')) || '';
                const sanitized = patientSeg.replace(/^patient_/, '');
                const sessionSeg = parts.find(p => /^sesion_\d+$/.test(p)) || '';
                const sessionIndex = sessionSeg ? parseInt(sessionSeg.split('_')[1], 10) : null;
                if (!sanitized || !sessionIndex) { skipped++; problems.push({ file: fpath, reason: 'bad_path' }); continue; }

                let pid = nameToId.get(sanitized);
                if (!pid) {
                    const pretty = sanitized.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
                    const res = await runAsync('INSERT INTO pacientes (nombre, edad, telefono, email, direccion, fechaNacimiento, genero, ocupacion, motivoConsulta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [pretty, 0, '', '', '', '', '', '', '']);
                    pid = res.lastID;
                    nameToId.set(sanitized, pid);
                }

                const text = fs.readFileSync(fpath, 'utf8');
                const rel = path.relative(repoRoot, fpath).replace(/\\/g, '/');
                // try update
                const upd = await runAsync('UPDATE transcripciones SET transcription_text = ?, transcription_path = ?, last_updated = ? WHERE paciente_id = ? AND session_index = ?', [text, rel, new Date().toISOString(), pid, sessionIndex]);
                if (upd.changes && upd.changes > 0) { imported++; continue; }
                const ins = await runAsync('INSERT INTO transcripciones (paciente_id, session_index, transcription_text, transcription_path, last_updated) VALUES (?, ?, ?, ?, ?)', [pid, sessionIndex, text, rel, new Date().toISOString()]);
                imported++;
            } catch (e) {
                skipped++; problems.push({ file: fpath, error: String(e && e.message) });
            }
        }

        console.log('Migration finished. imported=', imported, 'skipped=', skipped);
        if (problems.length) console.log('Problems:', problems.slice(0,10));
        process.exit(0);
    } catch (err) {
        console.error('Migration error', err);
        process.exit(2);
    }
})();
