const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

// Load .env if present (optional). Install dotenv if you want to use a .env file.
try {
    require('dotenv').config();
} catch (e) { /* dotenv not installed; ignore */ }

// If dotenv isn't installed (or didn't load), try a minimal .env parser so
// the server can pick up HUGGINGFACE_TOKEN when running via node directly.
try {
    if (!process.env.HUGGINGFACE_TOKEN) {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const raw = fs.readFileSync(envPath, 'utf8');
            raw.split(/\r?\n/).forEach(line => {
                const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
                if (m) {
                    let key = m[1];
                    let val = m[2] || '';
                    // strip surrounding quotes
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!process.env[key]) process.env[key] = val;
                }
            });
        }
    }
} catch (e) { /* ignore parsing errors */ }

// Extra: robust .env loader that always attempts to set HUGGINGFACE_TOKEN and logs masked value
function loadDotenvAndLog() {
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const raw = fs.readFileSync(envPath, 'utf8');
            raw.split(/\r?\n/).forEach(line => {
                const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
                if (m) {
                    let key = m[1];
                    let val = m[2] || '';
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!process.env[key]) process.env[key] = val;
                }
            });
        } else {
            console.warn('[warn] .env no encontrado en', envPath);
        }
    } catch (e) { /* ignore */ }

    // Log masked token presence (never print full token)
    try {
        const t = process.env.HUGGINGFACE_TOKEN;
        if (t && typeof t === 'string' && t.length > 8) {
            console.log('[info] HUGGINGFACE_TOKEN loaded from env/.env —', t.slice(0, 6) + '...' + t.slice(-4));
        } else if (t) {
            console.log('[info] HUGGINGFACE_TOKEN loaded from env/.env (short token)');
        } else {
            console.log('[info] No HUGGINGFACE_TOKEN found in environment or .env');
        }
    } catch (e) { /* ignore logging errors */ }

    // Log required RAG env presence (masked)
    try {
        const qurl = process.env.QDRANT_URL;
        const qkey = process.env.QDRANT_API_KEY;
        const gkey = process.env.GEMINI_API_KEY;

        const missing = [];
        if (!qurl) missing.push('QDRANT_URL');
        if (!qkey) missing.push('QDRANT_API_KEY');
        if (!gkey) missing.push('GEMINI_API_KEY');

        const qurlShort = qurl ? String(qurl).slice(0, 32) + '...' : '(missing)';
        const qkeyMasked = qkey && String(qkey).length > 8 ? String(qkey).slice(0, 4) + '...' + String(qkey).slice(-4) : (qkey ? '(set)' : '(missing)');
        const gkeyMasked = gkey && String(gkey).length > 8 ? String(gkey).slice(0, 4) + '...' + String(gkey).slice(-4) : (gkey ? '(set)' : '(missing)');

        console.log('[info] RAG env check:');
        console.log('  - QDRANT_URL:', qurlShort);
        console.log('  - QDRANT_API_KEY:', qkeyMasked);
        console.log('  - GEMINI_API_KEY:', gkeyMasked);
        if (missing.length) {
            console.warn('[warn] Missing env vars for RAG:', missing.join(', '));
        }
    } catch (e) { /* ignore */ }
}

loadDotenvAndLog();

const app = express();
const PORT = process.env.PORT || 3000;

const { execFile } = require('child_process');

function pythonExecutable() {
    // Prefer project venv python, fallback to system python
    // On Windows venv is usually in .venv/Scripts/python.exe
    const venvPath = path.join(__dirname, '.venv', 'Scripts', process.platform === 'win32' ? 'python.exe' : 'python');
    const exe = fs.existsSync(venvPath) ? venvPath : 'python';
    console.log('[info] Python Detection:');
    console.log('  - Checking path:', venvPath);
    console.log('  - Exists?', fs.existsSync(venvPath));
    console.log('  - Final selected exe:', exe);
    return exe;
}

// --- SQLite initialization for pacientes storage ---
let sqliteAvailable = false;
let db = null;
try {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'data.sqlite');
    db = new sqlite3.Database(dbPath);
    sqliteAvailable = true;

    // Create table for pacientes if not exists
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS pacientes (
            id INTEGER PRIMARY KEY,
            nombre TEXT,
            edad INTEGER,
            telefono TEXT,
            email TEXT,
            direccion TEXT,
            fechaNacimiento TEXT,
            genero TEXT,
            ocupacion TEXT,
            motivoConsulta TEXT
        )`);
        // Transcriptions table: one transcription per patient session
        db.run(`CREATE TABLE IF NOT EXISTS transcripciones (
            id INTEGER PRIMARY KEY,
            paciente_id INTEGER,
            session_index INTEGER,
            transcription_text TEXT,
            transcription_path TEXT,
            last_updated TEXT,
            UNIQUE(paciente_id, session_index),
            FOREIGN KEY(paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
        )`);
        // Citas (appointments) table: link paciente <-> agenda
        db.run(`CREATE TABLE IF NOT EXISTS citas (
            id INTEGER PRIMARY KEY,
            paciente_id INTEGER,
            fecha TEXT,
            hora TEXT,
            estado TEXT,
            psicologo_id INTEGER,
            created_at TEXT,
            FOREIGN KEY(paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
        )`);
        // Sesiones table: store clinical sessions per patient
        db.run(`CREATE TABLE IF NOT EXISTS sesiones (
            id INTEGER PRIMARY KEY,
            paciente_id INTEGER,
            fecha TEXT,
            notas TEXT,
            soap TEXT,
            duracion INTEGER,
            recording_path TEXT,
            estado TEXT,
            created_at TEXT,
            FOREIGN KEY(paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
        )`);
    });
    console.log('[info] SQLite DB initialized at', dbPath);
} catch (e) {
    console.warn('[warn] sqlite3 not available. Install with `npm install sqlite3` to enable DB persistence.');
    sqliteAvailable = false;
}

// Helper wrappers for sqlite operations (use Promises)
function getPacienteByIdAsync(id) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve(null);
        db.get('SELECT * FROM pacientes WHERE id = ?', [id], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

function getAllPacientesAsync() {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve([]);
        db.all('SELECT * FROM pacientes ORDER BY id ASC', [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function createPacienteAsync(p) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve(null);
        const stmt = db.prepare(`INSERT INTO pacientes (nombre, edad, telefono, email, direccion, fechaNacimiento, genero, ocupacion, motivoConsulta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run([
            p.nombre || '',
            p.edad || 0,
            p.telefono || '',
            p.email || '',
            p.direccion || '',
            p.fechaNacimiento || '',
            p.genero || '',
            p.ocupacion || '',
            p.motivoConsulta || p.motivo || ''
        ], function (err) {
            stmt.finalize();
            if (err) return reject(err);
            // return the new row id
            resolve(this.lastID);
        });
    });
}

// Transcription helpers
function getTranscriptionAsync(pacienteId, sessionIndex) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve(null);
        db.get('SELECT * FROM transcripciones WHERE paciente_id = ? AND session_index = ?', [pacienteId, sessionIndex], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

function upsertTranscriptionAsync(pacienteId, sessionIndex, text, transcriptionPath) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve(null);
        const now = (new Date()).toISOString();
        // Try update first
        db.run('UPDATE transcripciones SET transcription_text = ?, transcription_path = ?, last_updated = ? WHERE paciente_id = ? AND session_index = ?', [text, transcriptionPath || '', now, pacienteId, sessionIndex], function (err) {
            if (err) return reject(err);
            if (this && this.changes && this.changes > 0) return resolve({ updated: true });
            // Insert if not updated
            const stmt = db.prepare('INSERT INTO transcripciones (paciente_id, session_index, transcription_text, transcription_path, last_updated) VALUES (?, ?, ?, ?, ?)');
            stmt.run([pacienteId, sessionIndex, text || '', transcriptionPath || '', now], function (err2) {
                stmt.finalize();
                if (err2) return reject(err2);
                resolve({ insertedId: this.lastID });
            });
        });
    });
}

function getAllTranscriptionsAsync() {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve([]);
        db.all('SELECT * FROM transcripciones ORDER BY paciente_id ASC, session_index ASC', [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}


// Citas (appointments) helpers
function getAllCitasAsync() {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve([]);
        db.all('SELECT * FROM citas ORDER BY fecha ASC, hora ASC', [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function createCitaAsync(cita) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve(null);
        const stmt = db.prepare('INSERT INTO citas (paciente_id, fecha, hora, estado, psicologo_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        const now = (new Date()).toISOString();
        stmt.run([cita.paciente_id || null, cita.fecha || null, cita.hora || null, cita.estado || 'pendiente', cita.psicologo_id || null, now], function (err) {
            stmt.finalize();
            if (err) return reject(err);
            resolve({ id: this.lastID, paciente_id: cita.paciente_id, fecha: cita.fecha, hora: cita.hora, estado: cita.estado || 'pendiente', psicologo_id: cita.psicologo_id || null, created_at: now });
        });
    });
}

function deleteCitaAsync(id) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve({ changes: 0 });
        db.run('DELETE FROM citas WHERE id = ?', [id], function (err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    });
}

// Sesiones helpers
function getAllSesionesAsync(pacienteId) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve([]);
        if (pacienteId) {
            db.all('SELECT * FROM sesiones WHERE paciente_id = ? ORDER BY fecha DESC', [pacienteId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        } else {
            db.all('SELECT * FROM sesiones ORDER BY fecha DESC', [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        }
    });
}

function getSesionByIdAsync(id) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve(null);
        db.get('SELECT * FROM sesiones WHERE id = ?', [id], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

function createSesionAsync(s) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve(null);
        const stmt = db.prepare('INSERT INTO sesiones (paciente_id, fecha, notas, soap, duracion, recording_path, estado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        const now = (new Date()).toISOString();
        stmt.run([
            s.paciente_id || s.pacienteId || null,
            s.fecha || null,
            s.notas || s.notes || '',
            (s.soap && typeof s.soap === 'object') ? JSON.stringify(s.soap) : (s.soap || null),
            s.duracion || s.duration || null,
            s.recording_path || s.recordingPath || null,
            s.estado || s.status || 'finalizada',
            now
        ], function (err) {
            stmt.finalize();
            if (err) return reject(err);
            resolve({ id: this.lastID, paciente_id: s.paciente_id || s.pacienteId || null, fecha: s.fecha || null, notas: s.notas || '', created_at: now });
        });
    });
}

function updateSesionAsync(id, s) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve({ changes: 0 });
        const soapVal = (s.soap && typeof s.soap === 'object') ? JSON.stringify(s.soap) : (s.soap || null);
        db.run('UPDATE sesiones SET fecha = ?, notas = ?, soap = ?, duracion = ?, recording_path = ?, estado = ? WHERE id = ?', [s.fecha || null, s.notas || '', soapVal, s.duracion || null, s.recording_path || s.recordingPath || null, s.estado || s.status || null, id], function (err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    });
}

function deleteSesionAsync(id) {
    return new Promise((resolve, reject) => {
        if (!sqliteAvailable) return resolve({ changes: 0 });
        db.run('DELETE FROM sesiones WHERE id = ?', [id], function (err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    });
}

// --- API endpoints for sesiones ---
// Get sesiones (optionally filter by paciente_id)
app.get('/api/sesiones', async (req, res) => {
    try {
        const pacienteId = req.query.paciente_id || req.query.pacienteId || null;
        const list = await getAllSesionesAsync(pacienteId ? Number(pacienteId) : null);
        return res.json({ sesiones: list });
    } catch (e) {
        console.error('GET /api/sesiones error', e);
        return res.status(500).json({ error: 'server_error', detail: String(e && e.message) });
    }
});

// Get single sesion by id
app.get('/api/sesiones/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const s = await getSesionByIdAsync(id);
        if (!s) return res.status(404).json({ error: 'not_found' });
        return res.json({ sesion: s });
    } catch (e) {
        console.error('GET /api/sesiones/:id error', e);
        return res.status(500).json({ error: 'server_error' });
    }
});

// Create sesion
app.post('/api/sesiones', express.json(), async (req, res) => {
    try {
        const payload = req.body || {};
        const created = await createSesionAsync(payload);
        return res.json({ ok: true, sesion: created });
    } catch (e) {
        console.error('POST /api/sesiones error', e);
        return res.status(500).json({ ok: false, error: 'server_error', detail: String(e && e.message) });
    }
});

// Update sesion
app.put('/api/sesiones/:id', express.json(), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const payload = req.body || {};
        const result = await updateSesionAsync(id, payload);
        return res.json({ ok: true, result });
    } catch (e) {
        console.error('PUT /api/sesiones/:id error', e);
        return res.status(500).json({ ok: false, error: 'server_error', detail: String(e && e.message) });
    }
});

// Delete sesion
app.delete('/api/sesiones/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await deleteSesionAsync(id);
        return res.json({ ok: true, result });
    } catch (e) {
        console.error('DELETE /api/sesiones/:id error', e);
        return res.status(500).json({ ok: false, error: 'server_error', detail: String(e && e.message) });
    }
});

// Migration endpoint: import sesiones from data.json (if present)
app.post('/api/migrate-sesiones', async (req, res) => {
    try {
        const dataPath = path.join(__dirname, 'data.json');
        if (!fs.existsSync(dataPath)) return res.status(400).json({ ok: false, error: 'data.json_not_found' });
        const raw = fs.readFileSync(dataPath, 'utf8');
        let j = null;
        try { j = JSON.parse(raw); } catch (e) { return res.status(400).json({ ok: false, error: 'bad_json', detail: String(e && e.message) }); }
        const sesiones = Array.isArray(j.sesiones) ? j.sesiones : (j.sessions || []);
        let imported = 0;
        for (const s of sesiones) {
            try {
                await createSesionAsync(s);
                imported++;
            } catch (e) { /* ignore per-item errors */ }
        }
        return res.json({ ok: true, imported });
    } catch (e) {
        console.error('POST /api/migrate-sesiones error', e);
        return res.status(500).json({ ok: false, error: 'server_error', detail: String(e && e.message) });
    }
});

// Generate genogram by note: checks sessions for 'árbol' and generates if found
app.post('/api/generate-genogram', express.json(), async (req, res) => {
    try {
        const patientId = req.body.patient_id || req.body.patientId || null;
        const patientFolder = req.body.patient_folder || req.body.paciente || req.body.patient || null;

        if (!patientId || !patientFolder) {
            return res.status(400).json({ ok: false, error: 'missing_patient_info', detail: 'Se requiere patient_id y patient_folder' });
        }

        // Buscar sesiones del paciente en la base de datos
        const sessions = await getAllSesionesAsync(patientId);

        // Función helper para normalizar texto (sin acentos, mayúsculas, espacios extra)
        function normalizeText(text) {
            return String(text || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')  // Remover acentos
                .toLowerCase()
                .trim()
                .replace(/\s+/g, ' ');
        }

        // Buscar sesión con título "Árbol Genealógico"
        const targetTitle = normalizeText('arbol genealogico');
        const genogramSession = sessions.find(s => {
            const sessionTitle = normalizeText(s.notas || '');
            return sessionTitle === targetTitle || sessionTitle.includes(targetTitle);
        });

        if (!genogramSession) {
            return res.status(404).json({
                ok: false,
                error: 'no_genogram_session',
                detail: 'No se encontró una sesión con el título "Árbol Genealógico". Por favor, crea una sesión con ese título exacto para generar el genograma.'
            });
        }

        // Obtener el índice de la sesión (posición en el array de sesiones del paciente)
        const sessionIndex = sessions.indexOf(genogramSession);
        console.log(`[genogram] Found session "${genogramSession.notas}" at index ${sessionIndex} for patient ${patientId}`);

        const py = pythonExecutable();
        const script = path.join(__dirname, 'genograms', 'run_generate_by_note.py');
        const args = [script, patientFolder, String(sessionIndex + 1)];

        // Force venv Scripts into PATH for dependency resolution
        const childEnv = { ...process.env };
        const venvDir = path.dirname(py);
        if (process.platform === 'win32') {
            childEnv['Path'] = `${venvDir}${path.delimiter}${childEnv['Path'] || ''}`;
            childEnv['PATH'] = `${venvDir}${path.delimiter}${childEnv['PATH'] || ''}`;
        } else {
            childEnv['PATH'] = `${venvDir}${path.delimiter}${childEnv['PATH'] || ''}`;
        }
        const child = execFile(py, args, { env: childEnv, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err && err.code === 2) {
                return res.status(400).json({ ok: false, error: 'missing_patient_folder' });
            }
            if (err && err.code === 1) {
                // script crashed
                let detail = stderr || String(err.message || 'error');
                try { detail = JSON.parse(stdout).detail || detail; } catch (e) { }
                return res.status(500).json({ ok: false, error: 'script_exception', detail });
            }

            // Parse stdout as JSON result - robustly find JSON block
            let result = null;
            try {
                const jsonMatch = (stdout || '').match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : (stdout || '{}');
                result = JSON.parse(jsonStr);
            } catch (e) {
                console.error('[genogram] Failed to parse Python output:', stdout);
                result = { ok: false, error: 'bad_json', raw: stdout };
            }

            if (result && result.ok) {
                // El script devuelve la ruta absoluta. La normalizamos para el cliente.
                const relativePath = path.relative(path.join(__dirname, 'outputs'), result.output);
                return res.json({ ok: true, output: result.output, relativePath: relativePath });
            }
            // Not ok: e.g., no session with note
            return res.json({ ok: false, error: result && result.error ? result.error : 'unknown' });
        });

        // Safety: after 60s, kill child
        const timeout = setTimeout(() => {
            try { child.kill(); } catch (e) { }
        }, 60000);
        child.on('exit', () => clearTimeout(timeout));

    } catch (error) {
        console.error('[genogram] Error:', error);
        res.status(500).json({ ok: false, error: 'internal_server_error' });
    }
});

// Check if genogram exists for patient
app.get('/api/check-genogram/:patientFolder', async (req, res) => {
    try {
        const patientFolder = req.params.patientFolder;
        const genogramPath = path.join(__dirname, 'outputs', patientFolder, 'genograma.html');

        if (fs.existsSync(genogramPath)) {
            return res.json({ ok: true, exists: true, path: `/outputs/${patientFolder}/genograma.html` });
        } else {
            return res.json({ ok: true, exists: false });
        }
    } catch (error) {
        res.status(500).json({ ok: false, error: 'error_checking_genogram' });
    }
});


// Parse JSON even if stdout contains extra logs (e.g., Python warnings).
function parsePossiblyNoisyJson(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { /* fallthrough */ }

    // Try to extract the last JSON object in the output.
    try {
        const matches = s.match(/\{[\s\S]*\}/g);
        if (matches && matches.length) {
            for (let i = matches.length - 1; i >= 0; i--) {
                const chunk = matches[i];
                try { return JSON.parse(chunk); } catch (e) { /* continue */ }
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

// Make startup failures visible (useful when the process exits immediately)
process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaughtException:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
});
process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandledRejection:', reason);
    process.exitCode = 1;
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Enable CORS for frontend running on different port (e.g. live-server:5500)
app.use(cors());

// Serve static files (CSS, JS, images)
app.use(express.static(path.join(__dirname), {
    index: false  // No servir index.html automáticamente
}));

// Mapeo de rutas limpias a archivos HTML
const routeMap = {
    '/': '/public/dashboard.html',
    '/dashboard': '/public/dashboard.html',
    '/pacientes': '/public/pacientes.html',
    '/pacientes/:id': '/public/paciente-detalle.html',
    '/agenda': '/public/agenda.html',
    '/sesiones': '/public/sesiones.html',
    '/sesiones/:id': '/public/sesion-detalle.html',
    '/perfil': '/public/perfil-psicologo.html',
    '/perfil-psicologo': '/public/perfil-psicologo.html'
};

// Implementar enrutamiento SPA - Servir index.html para todas las rutas de frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pacientes', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pacientes/:slug', (req, res) => {
    // Acepta tanto IDs numéricos como slugs de nombres
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pacientes/:slug/editar', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pacientes/:slug/sesiones/nueva', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pacientes/:id/sesiones/nueva', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/agenda', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/agenda/:slug', (req, res) => {
    // Acepta slugs de paciente_fecha
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/agenda/:slug/editar', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/agenda/nueva', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/sesiones', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/sesiones/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/perfil', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/perfil-psicologo', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Mantener compatibilidad con rutas antiguas /public/*.html
app.get('/public/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', page);

    if (fs.existsSync(filePath) && page.endsWith('.html')) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Página no encontrada');
    }
});

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Ensure recordings dir (organized by patient and session)
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

// Ensure outputs dir (organized by patient and session)
const outputsDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

// Ensure refs dir for psychologist voice samples
const refsDir = path.join(__dirname, 'refs');
if (!fs.existsSync(refsDir)) fs.mkdirSync(refsDir);

// Helper: Sanitize patient name for filesystem
function sanitizePatientName(name) {
    return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .toLowerCase();
}

// Helper: Get patient directory path
function getPatientDir(baseDir, patientName) {
    const sanitized = sanitizePatientName(patientName);
    const patientDir = path.join(baseDir, `patient_${sanitized}`);
    if (!fs.existsSync(patientDir)) {
        fs.mkdirSync(patientDir, { recursive: true });
    }
    return patientDir;
}

// Helper: Get session directory path
function getSessionDir(patientDir, sessionIndex) {
    const sessionDir = path.join(patientDir, `sesion_${sessionIndex + 1}`);
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadsDir); },
    filename: function (req, file, cb) { const safe = Date.now() + '-' + file.originalname.replace(/\s+/g, '_'); cb(null, safe); }
});
const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ filename: req.file.filename, url });
});

// Save psychologist voice sample to refs directory
const voiceSampleStorage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, refsDir); },
    filename: function (req, file, cb) {
        // Always use the same filename to replace previous voice samples
        cb(null, 'psychologist_voice_sample.wav');
    }
});
const uploadVoiceSample = multer({ storage: voiceSampleStorage });

app.post('/api/save-voice-sample', uploadVoiceSample.single('voiceSample'), (req, res) => {
    const { pin } = req.body || {};

    // If PSY_PIN is configured, require and validate the provided pin
    if (PSY_PIN) {
        if (!pin) {
            // Clean up uploaded file if PIN validation fails
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
            return res.status(400).json({ error: 'PIN required' });
        }
        if (String(pin) !== String(PSY_PIN)) {
            // Clean up uploaded file if PIN is invalid
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
            return res.status(403).json({ error: 'Invalid PIN' });
        }
    }

    if (!req.file) return res.status(400).json({ error: 'No voice sample uploaded' });

    const filePath = `/refs/${req.file.filename}`;
    console.log('[info] Psychologist voice sample saved:', filePath);

    res.json({ ok: true, filePath, message: 'Voice sample saved successfully' });
});

// Upload recording for a patient: write to a temporary uploads dir first,
// then move to recordings/ only if a recording for that patient does not already exist.
const recordingStorage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadsDir); },
    filename: function (req, file, cb) {
        const pid = req.body.patientId || req.query.patientId || 'unknown';
        const safePid = String(pid).replace(/[^0-9a-zA-Z_-]/g, '_');
        cb(null, `patient_${safePid}.wav`);
    }
});
const uploadRecording = multer({ storage: recordingStorage });

// Environment variable for psychologist PIN (optional).
// If PSY_PIN is not set the server will operate normally but PIN-protected
// checks will be effectively bypassed to preserve the previous permissive behavior.
const PSY_PIN = process.env.PSY_PIN;

app.post('/api/upload-recording', uploadRecording.single('file'), (req, res) => {
    const pid = req.body.patientId || req.query.patientId;
    const patientName = req.body.patientName || `patient_${pid}`;
    const sessionIndex = parseInt(req.body.sessionIndex || '0', 10);

    if (!pid) return res.status(400).json({ error: 'patientId required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Create patient directory and session subdirectory
    const patientDir = getPatientDir(recordingsDir, patientName);
    const sessionDir = getSessionDir(patientDir, sessionIndex);

    const sanitizedName = sanitizePatientName(patientName);
    const filename = `patient_${sanitizedName}_sesion${sessionIndex + 1}.wav`;
    const targetPath = path.join(sessionDir, filename);

    // If a recording already exists for this session, remove the uploaded temp and refuse
    if (fs.existsSync(targetPath)) {
        try {
            // remove temp upload
            if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (e) { console.warn('Could not remove temp upload', e); }
        return res.status(409).json({ ok: false, error: 'Recording already exists for this session' });
    }

    // Move temp upload into session directory
    try {
        fs.renameSync(req.file.path, targetPath);
        const relUrl = `/recordings/patient_${sanitizedName}/sesion_${sessionIndex + 1}/${filename}`;
        return res.json({ ok: true, path: relUrl });
    } catch (e) {
        console.error('Failed to move uploaded recording', e);
        // cleanup temp
        try { if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (_) { }
        return res.status(500).json({ ok: false, error: e.message });
    }
});

// Check if a recording exists for a patient session
app.get('/api/recording/:patientId', (req, res) => {
    const pid = req.params.patientId;
    const patientName = req.query.patientName || `patient_${pid}`;
    const sessionIndex = parseInt(req.query.sessionIndex || '0', 10);

    const sanitizedName = sanitizePatientName(patientName);
    const patientDirPath = path.join(recordingsDir, `patient_${sanitizedName}`);
    const sessionDirPath = path.join(patientDirPath, `sesion_${sessionIndex + 1}`);
    const filename = `patient_${sanitizedName}_sesion${sessionIndex + 1}.wav`;
    const filePath = path.join(sessionDirPath, filename);

    if (fs.existsSync(filePath)) {
        return res.json({ exists: true, path: `/recordings/patient_${sanitizedName}/sesion_${sessionIndex + 1}/${filename}` });
    }
    return res.json({ exists: false });
});

// Delete a recording — requires psychologist PIN in body: { patientId, patientName, sessionIndex, pin }
app.post('/api/delete-recording', (req, res) => {
    const { patientId, patientName, sessionIndex, pin } = req.body || {};
    if (!patientId) return res.status(400).json({ error: 'patientId required' });

    // If PSY_PIN is configured, require and validate the provided pin.
    if (PSY_PIN) {
        if (!pin) return res.status(400).json({ error: 'pin required' });
        if (String(pin) !== String(PSY_PIN)) return res.status(403).json({ error: 'Invalid PIN' });
    }

    const sanitizedName = sanitizePatientName(patientName || `patient_${patientId}`);
    const sessionIdx = parseInt(sessionIndex || '0', 10);
    const sessionDirPath = path.join(recordingsDir, `patient_${sanitizedName}`, `sesion_${sessionIdx + 1}`);
    const filename = `patient_${sanitizedName}_sesion${sessionIdx + 1}.wav`;
    const filePath = path.join(sessionDirPath, filename);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            // Also remove any outputs produced for this patient
            try {
                const outDir = path.join(__dirname, 'outputs');
                const stem = path.parse(filename).name; // patient_1
                const candidates = [
                    `${stem}_labeled.txt`,
                    `${stem}_labeled.json`,
                    `${stem}_transcription.txt`,
                    `${stem}_transcription.json`,
                    `process_${stem}.log`,
                    `${stem}_diarization.txt`,
                    `${stem}_diarization.json`
                ];
                const removed = [];
                candidates.forEach(fn => {
                    const p = path.join(outDir, fn);
                    try { if (fs.existsSync(p)) { fs.unlinkSync(p); removed.push(fn); } } catch (e) { /* ignore individual errors */ }
                });
                return res.json({ ok: true, removed_outputs: removed });
            } catch (e) {
                return res.json({ ok: true, removed_outputs: [], warning: 'could_not_cleanup_outputs', detail: String(e && e.message) });
            }
        } catch (e) { return res.status(500).json({ error: e.message }); }
    }
    return res.status(404).json({ error: 'Recording not found' });
});

// Validate psychologist PIN (used by frontend to check before sensitive actions)
app.post('/api/validate-pin', (req, res) => {
    const { pin } = req.body || {};
    // If no server PIN is configured, behave permissively (return ok:true)
    // so the app can run without requiring a PSY_PIN during development.
    if (!PSY_PIN) {
        return res.json({ ok: true, notice: 'no_server_pin_configured' });
    }
    if (!pin) return res.status(400).json({ ok: false, error: 'pin required' });
    if (String(pin) === String(PSY_PIN)) return res.json({ ok: true });
    return res.status(403).json({ ok: false, error: 'invalid' });
});

// Serve recordings with explicit headers to help browsers play audio reliably
app.use('/recordings', express.static(recordingsDir, {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        // ensure WAV files are served with correct MIME
        if (path.extname(filePath).toLowerCase() === '.wav') {
            res.setHeader('Content-Type', 'audio/wav');
        }
        // avoid aggressive caching during development
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

// Transcribe a recording for a patient by running the Python transcription CLI
const { spawn } = require('child_process');
// Helper to spawn process_all.py in background for a given filePath/stem
function spawnProcessAll(filePath, stem, sessionOutputDir) {
    try {
        // Use provided sessionOutputDir or fallback to default outputs
        const outDir = sessionOutputDir || path.join(__dirname, 'outputs');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const logPath = path.join(outDir, `process_${stem}.log`);
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        logStream.write(`\n\n===== PROCESS_START ${new Date().toISOString()} =====\n`);

        // Determine python executable similar to inline logic
        let pyExec = 'python';
        try {
            const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
            const venvUnix = path.join(__dirname, '.venv', 'bin', 'python');
            if (fs.existsSync(venvWin)) {
                pyExec = venvWin;
            } else if (fs.existsSync(venvUnix)) {
                pyExec = venvUnix;
            } else if (process.env.PYTHON) {
                const candidate = process.env.PYTHON;
                if (fs.existsSync(candidate)) pyExec = candidate;
                else if (fs.existsSync(candidate + '.exe')) pyExec = candidate + '.exe';
            }
        } catch (e) { /* ignore */ }

        const script = path.join(__dirname, 'transciption', 'process_all.py');
        // child env
        let childEnv = Object.assign({}, process.env);
        try { childEnv.PYTHONIOENCODING = childEnv.PYTHONIOENCODING || 'utf-8'; } catch (e) { }
        try { childEnv.PYTHONUTF8 = childEnv.PYTHONUTF8 || '1'; } catch (e) { }
        try { childEnv.LANG = childEnv.LANG || 'en_US.UTF-8'; } catch (e) { }

        const child = spawn(pyExec, [script, filePath, 'small', 'es', 'refs', String(process.env.PYANNOTE_THRESHOLD || 0.75), outDir], { env: childEnv, cwd: __dirname, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

        if (child.stdout) { child.stdout.on('data', (c) => { try { logStream.write(c.toString()); } catch (e) { } }); }
        if (child.stderr) { child.stderr.on('data', (c) => { try { logStream.write(c.toString()); } catch (e) { } }); }
        child.on('error', (e) => { try { logStream.write('\n[child_error] ' + String(e && e.message) + '\n'); } catch (_) { } });
        child.on('close', (code) => { try { logStream.write('\n===== PROCESS_EXIT ' + code + ' ' + new Date().toISOString() + ' =====\n'); } catch (_) { }; try { logStream.end(); } catch (_) { } });
        try { child.unref(); } catch (e) { }
        console.log('[info] Launched background process_all for', filePath, 'logs->', logPath);
        const relativeLogPath = path.relative(path.join(__dirname, 'outputs'), logPath).replace(/\\/g, '/');
        return { ok: true, log: `/outputs/${relativeLogPath}` };
    } catch (err) { console.error('spawnProcessAll error', err); return { ok: false, error: String(err && err.message) }; }
}
app.post('/api/transcribe-recording', express.json(), (req, res) => {
    const patientId = req.body && req.body.patientId;
    const patientName = req.body && req.body.patientName || `patient_${patientId}`;
    const sessionIndex = parseInt(req.body && req.body.sessionIndex || '0', 10);

    if (!patientId) return res.status(400).json({ ok: false, error: 'patientId required' });

    const sanitizedName = sanitizePatientName(patientName);
    const patientDirPath = path.join(recordingsDir, `patient_${sanitizedName}`);
    const sessionDirPath = path.join(patientDirPath, `sesion_${sessionIndex + 1}`);
    const filename = `patient_${sanitizedName}_sesion${sessionIndex + 1}.wav`;
    const filePath = path.join(sessionDirPath, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'recording_not_found' });

    console.log('[debug] /api/transcribe-recording (process_all) request for patientId=', patientId, 'file=', filePath);

    // If a labeled output already exists, return it immediately.
    try {
        const outDir = path.join(__dirname, 'outputs');
        const stem = path.parse(filename).name; // patient_1
        const labeledTxt = path.join(outDir, `${stem}_labeled.txt`);
        const transcriptionJson = path.join(outDir, `${stem}_transcription.json`);
        if (fs.existsSync(labeledTxt)) {
            const txt = fs.readFileSync(labeledTxt, 'utf8');
            return res.json({ ok: true, stage: 'labeled', text: txt, txt_path: `/outputs/${path.basename(labeledTxt)}` });
        }
        if (fs.existsSync(transcriptionJson)) {
            try { const j = JSON.parse(fs.readFileSync(transcriptionJson, 'utf8')); return res.json({ ok: true, stage: 'transcription', text: j.text || '', json_path: `/outputs/${path.basename(transcriptionJson)}` }); } catch (e) { }
        }
    } catch (e) { console.warn('Error checking existing outputs', e); }

    // Otherwise launch full local pipeline (process_all.py) in background and return immediately.
    function resolvePythonCandidate(envVal) {
        if (!envVal) return null;
        let candidate = envVal.toString().trim();
        if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))) { candidate = candidate.slice(1, -1); }
        try { if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) { const pexe = path.join(candidate, 'Scripts', 'python.exe'); if (fs.existsSync(pexe)) return pexe; const pbin = path.join(candidate, 'bin', 'python'); if (fs.existsSync(pbin)) return pbin; } } catch (e) { }
        try { if (fs.existsSync(candidate)) return candidate; } catch (e) { }
        try { if (fs.existsSync(candidate + '.exe')) return candidate + '.exe'; } catch (e) { }
        return null;
    }

    // Prefer project-local .venv python if it exists (Windows/Unix paths)
    let pyExec = 'python';
    try {
        const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
        const venvUnix = path.join(__dirname, '.venv', 'bin', 'python');
        if (fs.existsSync(venvWin)) {
            pyExec = venvWin;
            console.log('[info] Using .venv python:', pyExec);
        } else if (fs.existsSync(venvUnix)) {
            pyExec = venvUnix;
            console.log('[info] Using .venv python:', pyExec);
        } else if (process.env.PYTHON) { const r = resolvePythonCandidate(process.env.PYTHON); if (r) { pyExec = r; console.log('[info] Using PYTHON env:', pyExec); } }
    } catch (e) { console.warn('Could not resolve .venv python, falling back to python on PATH', e); }

    const script = path.join(__dirname, 'transciption', 'process_all.py');
    try {
        const stem = path.parse(filename).name; // patient_juan_perez_sesion1

        // Create session output directory
        const sessionOutputDir = path.join(outputsDir, `patient_${sanitizedName}`, `sesion_${sessionIndex + 1}`);
        if (!fs.existsSync(sessionOutputDir)) fs.mkdirSync(sessionOutputDir, { recursive: true });

        const result = spawnProcessAll(filePath, stem, sessionOutputDir);
        if (result && result.ok) {
            return res.json({ ok: true, processing: true, message: 'processing_started', log: result.log });
        } else {
            return res.status(500).json({ ok: false, error: 'spawn_failed', detail: result && result.error });
        }
    } catch (err) {
        console.error('Failed to spawn process_all', err);
        return res.status(500).json({ ok: false, error: 'spawn_failed', detail: String(err && err.message) });
    }
});

// RAG endpoint: query Qdrant (already populated) and generate answer
app.post('/api/rag/ask', express.json({ limit: '1mb' }), (req, res) => {
    try {
        const { collection, query, k, top_n } = req.body || {};
        if (!collection || !query) {
            return res.status(400).json({ ok: false, error: 'missing_collection_or_query' });
        }

        const pyExec = pythonExecutable();
        const scriptPath = path.join(__dirname, 'tools', 'rag_query.py');

        // Force venv Scripts into PATH for dependency resolution
        const childEnv = { ...process.env };
        const venvDir = (pyExec && (pyExec.includes('\\') || pyExec.includes('/'))) ? path.dirname(pyExec) : '';
        const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';

        // NOTE: On Windows, PATH/Path can easily get corrupted if we concatenate without delimiters.
        // Keep both keys consistent and always include the delimiter.
        if (venvDir) {
            childEnv[pathKey] = `${venvDir}${path.delimiter}${childEnv[pathKey] || ''}`;
            if (process.platform === 'win32') {
                childEnv['PATH'] = childEnv['Path'];
            }
        }

        try { childEnv.PYTHONIOENCODING = childEnv.PYTHONIOENCODING || 'utf-8'; } catch (e) { }
        try { childEnv.PYTHONUTF8 = childEnv.PYTHONUTF8 || '1'; } catch (e) { }

        const inputStr = JSON.stringify({ collection, query, k, top_n });

        // Spawn python with fallbacks (common in Windows where only `py` exists).
        const candidates = [];
        candidates.push({ cmd: pyExec, argsPrefix: [], label: String(pyExec) });
        if (process.platform === 'win32') {
            // `py` launcher is common even when `python` isn't on PATH.
            candidates.push({ cmd: 'py', argsPrefix: ['-3'], label: 'py -3' });
            candidates.push({ cmd: 'py', argsPrefix: [], label: 'py' });
        }
        // Some setups use python3 instead of python.
        candidates.push({ cmd: 'python3', argsPrefix: [], label: 'python3' });

        let child = null;
        let out = '';
        let err = '';

        const startCandidate = (idx) => {
            if (res.headersSent) return;
            const c = candidates[idx];

            out = '';
            err = '';

            try {
                child = spawn(c.cmd, [...(c.argsPrefix || []), scriptPath], { env: childEnv, cwd: __dirname });
            } catch (e) {
                if (idx + 1 < candidates.length) return startCandidate(idx + 1);
                return res.status(500).json({
                    ok: false,
                    error: 'rag_spawn_error',
                    detail: String(e && e.message),
                    tried: candidates.map(x => x.label),
                });
            }

            if (child.stdout) child.stdout.on('data', (d) => { out += d.toString(); });
            if (child.stderr) child.stderr.on('data', (d) => { err += d.toString(); });

            child.on('error', (e) => {
                // ENOENT = executable not found. Try next candidate.
                const code = e && e.code;
                if (code === 'ENOENT' && idx + 1 < candidates.length) {
                    return startCandidate(idx + 1);
                }
                if (res.headersSent) return;
                return res.status(500).json({
                    ok: false,
                    error: 'rag_spawn_error',
                    detail: String(e && e.message),
                    spawn_code: code,
                    tried: candidates.map(x => x.label),
                });
            });

            child.on('close', (code) => {
                // Always try to parse JSON (even on non-zero exit codes) so we can return
                // structured errors from Python instead of opaque rag_failed messages.
                let parsed = null;
                parsed = parsePossiblyNoisyJson(out);

                if (parsed && typeof parsed === 'object') {
                    // Choose status codes that help debugging and avoid generic 500s when it's a bad request.
                    const isOk = parsed.ok === true;
                    if (isOk) return res.json(parsed);

                    const errCode = String(parsed.error || 'rag_error');
                    const clientErrors = new Set([
                        'missing_collection_or_query',
                        'bad_json_in',
                        'collection_not_found'
                    ]);
                    const status = clientErrors.has(errCode) ? 400 : 500;
                    return res.status(status).json(Object.assign({ ok: false, code, stderr: (err || '').slice(0, 8000) }, parsed));
                }

                if (code !== 0) {
                    return res.status(500).json({ ok: false, error: 'rag_failed', code, detail: err || out || `exit_${code}` });
                }
                try {
                    return res.json(JSON.parse(out));
                } catch (e) {
                    return res.status(500).json({ ok: false, error: 'bad_python_json', detail: String(e && e.message), raw: out, stderr: (err || '').slice(0, 8000) });
                }
            });

            try {
                child.stdin.write(inputStr);
                child.stdin.end();
            } catch (e) {
                // If stdin write fails, surface it as a spawn failure.
                if (!res.headersSent) {
                    return res.status(500).json({ ok: false, error: 'rag_stdin_error', detail: String(e && e.message) });
                }
            }
        };

        startCandidate(0);
    } catch (e) {
        return res.status(500).json({ ok: false, error: 'server_error', detail: String(e && e.message) });
    }
});

// Diagnostic endpoint to check Python environment
app.get('/api/diag/python', async (req, res) => {
    try {
        const py = pythonExecutable();
        const script = path.join(__dirname, 'genograms', 'env_diag.py');
        const { execFile } = require('child_process');

        const childEnv = { ...process.env };
        const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
        childEnv[pathKey] = `${path.dirname(py)}${path.delimiter}${childEnv[pathKey] || ''}`;

        // On Windows, sometimes both 'Path' and 'PATH' exist. Let's fix both to be safe.
        if (process.platform === 'win32') {
            childEnv['PATH'] = childEnv['Path'];
        }

        execFile(py, [script], { env: childEnv }, (err, stdout, stderr) => {
            res.json({
                ok: !err,
                py,
                stdout,
                stderr,
                platform: process.platform,
                pathKey,
                envPath: childEnv[pathKey]?.substring(0, 200) + '...'
            });
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ICD-11 scoring endpoint: query ICD-11 collection in Qdrant and return normalized scores (JSON)
app.post('/api/icd11/score', express.json({ limit: '1mb' }), (req, res) => {
    try {
        const {
            clinical_text,
            search_query,
            k,
            top_n,
            out_top,
            collection,
        } = req.body || {};

        if (!clinical_text || !String(clinical_text).trim()) {
            return res.status(400).json({ ok: false, error: 'missing_clinical_text' });
        }

        const pyExec = pythonExecutable();
        const scriptPath = path.join(__dirname, 'tools', 'icd11_score.py');

        // Force venv Scripts into PATH
        const childEnv = { ...process.env };
        const venvDir = path.dirname(pyExec);

        // Extremely robust PATH fix for Windows
        if (process.platform === 'win32') {
            childEnv['Path'] = `${venvDir}${path.delimiter}${childEnv['Path'] || ''}`;
            childEnv['PATH'] = `${venvDir}${path.delimiter}${childEnv['PATH'] || ''}`;
        } else {
            childEnv['PATH'] = `${venvDir}${path.delimiter}${childEnv['PATH'] || ''}`;
        }

        try { childEnv.PYTHONIOENCODING = childEnv.PYTHONIOENCODING || 'utf-8'; } catch (e) { }
        try { childEnv.PYTHONUTF8 = childEnv.PYTHONUTF8 || '1'; } catch (e) { }

        const inputStr = JSON.stringify({
            clinical_text,
            search_query,
            k,
            top_n,
            out_top,
            collection,
        });

        const candidates = [];
        candidates.push({ cmd: pyExec, argsPrefix: [], label: String(pyExec) });
        if (process.platform === 'win32') {
            candidates.push({ cmd: 'py', argsPrefix: ['-3'], label: 'py -3' });
            candidates.push({ cmd: 'py', argsPrefix: [], label: 'py' });
        }
        candidates.push({ cmd: 'python3', argsPrefix: [], label: 'python3' });

        let child = null;

        let out = '';
        let err = '';

        const startCandidate = (idx) => {
            if (res.headersSent) return;
            const c = candidates[idx];
            out = '';
            err = '';

            try {
                child = spawn(c.cmd, [...(c.argsPrefix || []), scriptPath], { env: childEnv, cwd: __dirname });
            } catch (e) {
                if (idx + 1 < candidates.length) return startCandidate(idx + 1);
                return res.status(500).json({ ok: false, error: 'icd11_spawn_error', detail: String(e && e.message), tried: candidates.map(x => x.label) });
            }

            if (child.stdout) child.stdout.on('data', (d) => { out += d.toString(); });
            if (child.stderr) child.stderr.on('data', (d) => { err += d.toString(); });

            child.on('error', (e) => {
                const code = e && e.code;
                if (code === 'ENOENT' && idx + 1 < candidates.length) {
                    return startCandidate(idx + 1);
                }
                if (res.headersSent) return;
                return res.status(500).json({ ok: false, error: 'icd11_spawn_error', detail: String(e && e.message), spawn_code: code, tried: candidates.map(x => x.label) });
            });

            child.on('close', (code) => {
            let parsed = null;
            parsed = parsePossiblyNoisyJson(out);

            if (parsed && typeof parsed === 'object') {
                const isOk = parsed.ok === true;
                if (isOk) return res.json(parsed);

                const errCode = String(parsed.error || 'icd11_error');
                const clientErrors = new Set([
                    'missing_clinical_text',
                    'bad_json_in',
                    'collection_not_found',
                    'missing_qdrant_env',
                    'missing_gemini_api_key'
                ]);
                const status = clientErrors.has(errCode) ? 400 : 500;
                return res.status(status).json(Object.assign({ ok: false, code, stderr: (err || '').slice(0, 8000) }, parsed));
            }

            if (code !== 0) {
                return res.status(500).json({ ok: false, error: 'icd11_failed', code, detail: err || out || `exit_${code}` });
            }
            return res.status(500).json({ ok: false, error: 'bad_python_json', code, raw: out, stderr: (err || '').slice(0, 8000) });
            });

            try {
                child.stdin.write(inputStr);
                child.stdin.end();
            } catch (e) {
                if (!res.headersSent) {
                    return res.status(500).json({ ok: false, error: 'icd11_stdin_error', detail: String(e && e.message) });
                }
            }
        };

        startCandidate(0);
    } catch (e) {
        return res.status(500).json({ ok: false, error: 'server_error', detail: String(e && e.message) });
    }
});

// Data endpoints
const dataFile = path.join(__dirname, 'data.json');

function readData() {
    try { const raw = fs.readFileSync(dataFile, 'utf8'); return JSON.parse(raw); } catch (e) { return null; }
}

function writeData(obj) { fs.writeFileSync(dataFile, JSON.stringify(obj, null, 2), 'utf8'); }

app.get('/api/data', (req, res) => {
    const d = readData();
    if (!d) return res.status(404).json({});
    res.json(d);
});

// Return already-processed LABELLED transcription for a patient if available.
// IMPORTANT: this endpoint now only returns `*_labeled.txt` / `*_labeled.json`.
// Do NOT fall back to other transcription files; the UI must display only labeled outputs.
app.get('/api/processed/:patientId', (req, res) => {
    const pid = req.params.patientId;
    const patientName = req.query.patientName || `patient_${pid}`;
    const sessionIndex = parseInt(req.query.sessionIndex || '0', 10);

    if (!pid) return res.status(400).json({ ok: false, error: 'patientId required' });
    try {
        const sanitizedName = sanitizePatientName(patientName);

        // Try new structure first (patient_name/sesion_X/)
        const patientDirPath = path.join(outputsDir, `patient_${sanitizedName}`);
        const sessionDirPath = path.join(patientDirPath, `sesion_${sessionIndex + 1}`);
        const stem = `patient_${sanitizedName}_sesion${sessionIndex + 1}`;

        let labeledTxt = path.join(sessionDirPath, `${stem}_labeled.txt`);
        let labeledJson = path.join(sessionDirPath, `${stem}_labeled.json`);

        // Fallback to old structure if new doesn't exist
        if (!fs.existsSync(labeledTxt) && !fs.existsSync(labeledJson)) {
            const oldStem = `patient_${String(pid).replace(/[^0-9a-zA-Z_-]/g, '_')}`;
            labeledTxt = path.join(outputsDir, `${oldStem}_labeled.txt`);
            labeledJson = path.join(outputsDir, `${oldStem}_labeled.json`);
        }

        if (fs.existsSync(labeledTxt)) {
            try {
                const raw = fs.readFileSync(labeledTxt, 'utf8');
                const relativePath = path.relative(outputsDir, labeledTxt).replace(/\\/g, '/');
                return res.json({ ok: true, stage: 'labeled', text: raw, txt_path: `/outputs/${relativePath}` });
            } catch (e) { /* fallthrough to json */ }
        }

        if (fs.existsSync(labeledJson)) {
            try {
                const j = JSON.parse(fs.readFileSync(labeledJson, 'utf8'));
                // prefer a labeled_text field if present
                const text = j && (j.labeled_text || j.text || '');
                const relativePath = path.relative(outputsDir, labeledJson).replace(/\\/g, '/');
                return res.json({ ok: true, stage: 'labeled', text, json_path: `/outputs/${relativePath}`, raw: j });
            } catch (e) { /* ignore */ }
        }

        return res.status(404).json({ ok: false, error: 'labeled_not_found' });
    } catch (err) {
        console.error('Error in /api/processed', err);
        return res.status(500).json({ ok: false, error: 'server_error', detail: String(err && err.message) });
    }
});

app.post('/api/data', (req, res) => {
    const body = req.body;
    try { writeData(body); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// New CRUD endpoints for pacientes using SQLite (if available)
app.get('/api/pacientes', async (req, res) => {
    try {
        if (sqliteAvailable) {
            const pacientes = await getAllPacientesAsync();
            return res.json({ ok: true, pacientes });
        }
        const d = readData();
        return res.json({ ok: true, pacientes: (d && d.pacientes) || [] });
    } catch (err) {
        console.error('Error fetching pacientes', err);
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

app.get('/api/pacientes/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (sqliteAvailable) {
            const p = await getPacienteByIdAsync(id);
            if (!p) return res.status(404).json({ ok: false, error: 'not_found' });
            return res.json({ ok: true, paciente: p });
        }
        const d = readData();
        const p = d && d.pacientes && d.pacientes.find(x => String(x.id) === String(id));
        if (!p) return res.status(404).json({ ok: false, error: 'not_found' });
        return res.json({ ok: true, paciente: p });
    } catch (err) {
        console.error('Error fetching paciente', err);
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

app.post('/api/pacientes', express.json({ limit: '1mb' }), async (req, res) => {
    try {
        const p = req.body || {};
        if (!p || !p.nombre) return res.status(400).json({ ok: false, error: 'nombre_required' });
        if (sqliteAvailable) {
            const id = await createPacienteAsync(p);
            const paciente = await getPacienteByIdAsync(id);
            return res.json({ ok: true, paciente });
        }
        // fallback: append to data.json
        const data = readData() || { pacientes: [] };
        const newId = data.pacientes && data.pacientes.length ? (Math.max(...data.pacientes.map(x => x.id)) + 1) : 1;
        const paciente = Object.assign({ id: newId }, p);
        data.pacientes = data.pacientes || [];
        data.pacientes.push(paciente);
        writeData(data);
        return res.json({ ok: true, paciente });
    } catch (err) {
        console.error('Error creating paciente', err);
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

// Delete paciente
app.delete('/api/pacientes/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (sqliteAvailable) {
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM pacientes WHERE id = ?', [id], function (err) {
                    if (err) return reject(err);
                    resolve(this.changes);
                });
            });
            return res.json({ ok: true });
        }
        // fallback: remove from data.json
        const data = readData() || { pacientes: [] };
        const origLen = data.pacientes.length;
        data.pacientes = data.pacientes.filter(x => String(x.id) !== String(id));
        if (data.pacientes.length === origLen) return res.status(404).json({ ok: false, error: 'not_found' });
        writeData(data);
        return res.json({ ok: true });
    } catch (err) {
        console.error('Error deleting paciente', err);
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

// Migration helper: import pacientes from data.json into sqlite (safe to call once)
app.post('/api/migrate-pacientes', async (req, res) => {
    if (!sqliteAvailable) return res.status(400).json({ ok: false, error: 'sqlite_not_available' });
    try {
        const data = readData();
        const pacientes = (data && data.pacientes) || [];
        let imported = 0;
        for (const p of pacientes) {
            // skip if exists by id
            const exists = await getPacienteByIdAsync(p.id);
            if (exists) continue;
            // insert with provided id via manual insert
            await new Promise((resolve, reject) => {
                const stmt = db.prepare('INSERT INTO pacientes (id, nombre, edad, telefono, email, direccion, fechaNacimiento, genero, ocupacion, motivoConsulta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                stmt.run([
                    p.id,
                    p.nombre || '',
                    p.edad || 0,
                    p.telefono || '',
                    p.email || '',
                    p.direccion || '',
                    p.fechaNacimiento || '',
                    p.genero || '',
                    p.ocupacion || '',
                    p.motivoConsulta || p.motivo || ''
                ], function (err) { stmt.finalize(); if (err) return reject(err); resolve(); });
            });
            imported++;
        }
        return res.json({ ok: true, imported });
    } catch (err) {
        console.error('Migration error', err);
        res.status(500).json({ ok: false, error: 'migration_failed', detail: String(err) });
    }
});

// Transcriptions migration endpoint: scan outputs/ for transcription files and insert into DB
app.post('/api/transcripciones/migrate', async (req, res) => {
    if (!sqliteAvailable) return res.status(400).json({ ok: false, error: 'sqlite_not_available' });
    try {
        // Ensure pacientes are migrated first if requested
        // Build map of sanitized patient -> id
        const pacientes = await getAllPacientesAsync();
        const nameToId = new Map();
        pacientes.forEach(p => {
            const sanitized = sanitizePatientName(p.nombre || '');
            if (sanitized) nameToId.set(sanitized, p.id);
        });

        // Walk outputsDir for files matching pattern *_transcription.txt
        const foundFiles = [];
        function walk(dir) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.isFile() && /_transcription\.txt$/i.test(e.name)) foundFiles.push(full);
            }
        }
        walk(outputsDir);

        let imported = 0;
        let skipped = 0;
        const problems = [];

        for (const fpath of foundFiles) {
            try {
                // Expect path like outputs/patient_<sanitized>/sesion_<N>/patient_<sanitized>_sesion<N>_transcription.txt
                const parts = fpath.split(path.sep);
                // find the segment that starts with 'patient_'
                const patientSeg = parts.find(p => p.startsWith('patient_')) || '';
                const sanitized = patientSeg.replace(/^patient_/, '');
                // find session segment like sesion_8
                const sessionSeg = parts.find(p => /^sesion_\d+$/.test(p)) || '';
                const sessionIndex = sessionSeg ? parseInt(sessionSeg.split('_')[1], 10) : null;

                if (!sanitized || !sessionIndex) { skipped++; problems.push({ file: fpath, reason: 'bad_path' }); continue; }

                // Map sanitized -> paciente id; if not found, try to create a new paciente with that name
                let pid = nameToId.get(sanitized);
                if (!pid) {
                    // Create a readable name from sanitized: replace _ with space and capitalize
                    const pretty = sanitized.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
                    const newId = await createPacienteAsync({ nombre: pretty });
                    // fetch the created paciente
                    const created = await getPacienteByIdAsync(newId);
                    pid = created.id;
                    nameToId.set(sanitized, pid);
                }

                const text = fs.readFileSync(fpath, 'utf8');
                // use sessionIndex as numeric value (keep as found in folder)
                await upsertTranscriptionAsync(pid, sessionIndex, text, path.relative(__dirname, fpath).replace(/\\/g, '/'));
                imported++;
            } catch (e) {
                skipped++; problems.push({ file: fpath, error: String(e && e.message) });
            }
        }

        return res.json({ ok: true, imported, skipped, problems });
    } catch (err) {
        console.error('transcriptions migration error', err);
        return res.status(500).json({ ok: false, error: 'migration_failed', detail: String(err) });
    }
});

// CRUD endpoints for transcriptions
app.get('/api/transcripciones', async (req, res) => {
    try {
        if (sqliteAvailable) {
            const rows = await getAllTranscriptionsAsync();
            return res.json({ ok: true, transcripciones: rows });
        }
        return res.json({ ok: true, transcripciones: [] });
    } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'server_error' }); }
});

app.get('/api/transcripciones/:pacienteId/:sessionIndex', async (req, res) => {
    try {
        const pid = req.params.pacienteId;
        const si = parseInt(req.params.sessionIndex, 10);
        if (sqliteAvailable) {
            const t = await getTranscriptionAsync(pid, si);
            if (!t) return res.status(404).json({ ok: false, error: 'not_found' });
            return res.json({ ok: true, transcripcion: t });
        }
        return res.status(404).json({ ok: false, error: 'sqlite_not_available' });
    } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'server_error' }); }
});

app.post('/api/transcripciones', express.json({ limit: '2mb' }), async (req, res) => {
    try {
        const { pacienteId, sessionIndex, transcriptionText, transcriptionPath } = req.body || {};
        if (!pacienteId || sessionIndex === undefined) return res.status(400).json({ ok: false, error: 'pacienteId_and_sessionIndex_required' });
        if (sqliteAvailable) {
            const r = await upsertTranscriptionAsync(pacienteId, sessionIndex, transcriptionText || '', transcriptionPath || '');
            return res.json({ ok: true, result: r });
        }
        return res.status(400).json({ ok: false, error: 'sqlite_not_available' });
    } catch (e) { console.error(e); res.status(500).json({ ok: false, error: 'server_error' }); }
});

// --- Citas (appointments) endpoints ---
app.get('/api/citas', async (req, res) => {
    try {
        if (sqliteAvailable) {
            const citas = await getAllCitasAsync();
            return res.json({ ok: true, citas });
        }
        const d = readData() || {};
        return res.json({ ok: true, citas: d.agenda || [] });
    } catch (e) { console.error(e); return res.status(500).json({ ok: false, error: 'server_error' }); }
});

app.post('/api/citas', express.json({ limit: '1mb' }), async (req, res) => {
    try {
        const body = req.body || {};
        // Accept either snake_case or camelCase
        const paciente_id = body.paciente_id || body.pacienteId || body.pacienteId === 0 ? body.paciente_id || body.pacienteId : null;
        const fecha = body.fecha || body.date || null;
        const hora = body.hora || body.time || null;
        const estado = body.estado || body.status || 'pendiente';
        const psicologo_id = body.psicologo_id || body.psicologoId || null;

        if (sqliteAvailable) {
            const created = await createCitaAsync({ paciente_id, fecha, hora, estado, psicologo_id });
            return res.json({ ok: true, cita: created });
        }

        // fallback: append to data.json.agenda
        const data = readData() || {};
        data.agenda = data.agenda || [];
        const newId = data.agenda.length ? (Math.max(...data.agenda.map(x => x.id)) + 1) : 1;
        const cita = { id: newId, paciente_id, fecha, hora, estado, psicologo_id, created_at: (new Date()).toISOString() };
        data.agenda.push(cita);
        writeData(data);
        return res.json({ ok: true, cita });
    } catch (err) { console.error('Error creating cita', err); return res.status(500).json({ ok: false, error: 'server_error' }); }
});

app.delete('/api/citas/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (sqliteAvailable) {
            const r = await deleteCitaAsync(id);
            if (r.changes && r.changes > 0) return res.json({ ok: true });
            return res.status(404).json({ ok: false, error: 'not_found' });
        }
        const data = readData() || {};
        const orig = (data.agenda || []).length;
        data.agenda = (data.agenda || []).filter(x => String(x.id) !== String(id));
        if (data.agenda.length === orig) return res.status(404).json({ ok: false, error: 'not_found' });
        writeData(data);
        return res.json({ ok: true });
    } catch (err) { console.error(err); return res.status(500).json({ ok: false, error: 'server_error' }); }
});

// Migration endpoint to import agenda from data.json into SQLite
app.post('/api/migrate-citas', async (req, res) => {
    if (!sqliteAvailable) return res.status(400).json({ ok: false, error: 'sqlite_not_available' });
    try {
        const data = readData() || {};
        const agenda = data.agenda || [];
        let imported = 0;
        for (const a of agenda) {
            try {
                // Ensure paciente exists; if not, create minimal record
                let pid = a.paciente_id || a.pacienteId || null;
                if (pid) {
                    const exists = await getPacienteByIdAsync(pid);
                    if (!exists) {
                        // create placeholder paciente with generic name
                        const createdId = await createPacienteAsync({ nombre: `Paciente_${pid}` });
                        pid = createdId;
                    }
                }
                await createCitaAsync({ paciente_id: pid, fecha: a.fecha || a.date, hora: a.hora || a.time, estado: a.estado || a.status || 'pendiente', psicologo_id: a.psicologo_id || a.psicologoId || null });
                imported++;
            } catch (e) {
                console.warn('Failed to import agenda item', a, e && e.message);
            }
        }
        return res.json({ ok: true, imported });
    } catch (err) { console.error('migrate-citas error', err); return res.status(500).json({ ok: false, error: 'migration_failed', detail: String(err) }); }
});


// Endpoint para generar resumen de transcripción usando HuggingFace
app.post('/api/generate-summary', express.json({ limit: '2mb' }), async (req, res) => {
    try {
        const { transcription, patientName, sessionDate } = req.body || {};

        if (!transcription || !transcription.trim()) {
            return res.status(400).json({ ok: false, error: 'Transcripción requerida' });
        }

        console.log(`[info] Generando resumen (GenAI) para paciente: ${patientName}, sesión: ${sessionDate}`);

        let cleanedTranscription = transcription
            .replace(/【.*?】/g, '') // Remover marcadores de speaker
            .replace(/\[[\d\.]+ ?s? ?- ?[\d\.]+ ?s?\]/g, '') // Remover timestamps
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Spawn Python script to call Google GenAI
        // Prefer project-local .venv python if it exists (Windows/Unix paths)
        let pyExec = process.env.PYTHON_PATH || process.env.PYTHON || 'python';
        try {
            const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
            const venvUnix = path.join(__dirname, '.venv', 'bin', 'python');
            if (fs.existsSync(venvWin)) pyExec = venvWin;
            else if (fs.existsSync(venvUnix)) pyExec = venvUnix;
        } catch (e) { /* ignore */ }

        const scriptPath = path.join(__dirname, 'API', 'routes', 'genai_summary.py');
        const childEnv = Object.assign({}, process.env);
        // Ensure UTF-8 for python I/O
        childEnv.PYTHONIOENCODING = 'utf-8';
        childEnv.PYTHONUTF8 = '1';

        console.log('[info] Executing Python script:', pyExec, scriptPath);

        // Spawn process
        const child = spawn(pyExec, [scriptPath], {
            env: childEnv,
            cwd: __dirname
        });

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('[python-stderr]', data.toString());
        });

        child.on('close', (code) => {
            if (code !== 0) {
                return res.status(500).json({
                    ok: false,
                    error: 'Error en proceso de resumen (Python)',
                    detail: errorOutput || 'Unknown error'
                });
            }

            try {
                // Parse JSON output from Python script
                const result = JSON.parse(output);

                if (result.ok) {
                    return res.json({
                        ok: true,
                        summary: result.summary,
                        model_used: 'google-gemini'
                    });
                } else {
                    return res.status(500).json({
                        ok: false,
                        error: result.error || 'Error desconocido del modelo'
                    });
                }
            } catch (e) {
                return res.status(500).json({
                    ok: false,
                    error: 'Error al procesar respuesta del modelo',
                    detail: output
                });
            }
        });

        // Send input to Python via stdin
        child.stdin.write(cleanedTranscription);
        child.stdin.end();

    } catch (error) {
        console.error('[error] Error en /api/generate-summary:', error);
        res.status(500).json({
            ok: false,
            error: 'Error del servidor al generar resumen',
            detail: error.message || String(error)
        });
    }
});

// Endpoint para generar genograma
app.post('/api/genograma/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        // transcription from body is now optional/fallback
        let transcription = req.body.transcription || '';

        console.log(`Generando genograma para paciente ${patientId}...`);

        // 1. Obtener nombre del paciente desde SQLite (preferido) o data.json como fallback
        let patientData = null;
        if (sqliteAvailable) {
            try {
                patientData = await getPacienteByIdAsync(patientId);
            } catch (e) {
                console.warn('[warn] Error leyendo paciente desde sqlite:', e && e.message);
                patientData = null;
            }
        }
        if (!patientData) {
            const allData = readData();
            patientData = allData ? allData.pacientes.find(p => String(p.id) === String(patientId)) : null;
        }

        let fullTranscription = '';

        if (patientData) {
            const sanitizedName = sanitizePatientName(patientData.nombre);
            const patientDir = path.join(outputsDir, `patient_${sanitizedName}`);

            if (fs.existsSync(patientDir)) {
                console.log(`Buscando sesiones en: ${patientDir}`);
                const entries = fs.readdirSync(patientDir, { withFileTypes: true });

                // Filtrar y ordenar carpetas de sesión (sesion_1, sesion_2, ...)
                const sessionDirs = entries
                    .filter(e => e.isDirectory() && e.name.startsWith('sesion_'))
                    .sort((a, b) => {
                        const numA = parseInt(a.name.replace('sesion_', '')) || 0;
                        const numB = parseInt(b.name.replace('sesion_', '')) || 0;
                        return numA - numB;
                    });

                // Leer transcripciones de cada sesión
                for (const sessDir of sessionDirs) {
                    const sessPath = path.join(patientDir, sessDir.name);
                    // Fix: Directory is 'sesion_1' but file is '..._sesion1_...' (no underscore)
                    const sessNameFile = sessDir.name.replace('_', ''); // sesion_1 -> sesion1
                    const docStem = `patient_${sanitizedName}_${sessNameFile}`; // e.g. patient_juan_perez_sesion1

                    // Intentar leer labeled.txt (mejor calidad)
                    let textPath = path.join(sessPath, `${docStem}_labeled.txt`);
                    const fallbackPath = path.join(sessPath, `${docStem}_transcription.txt`);

                    console.log(`[debug] Checking sessDir: ${sessDir.name}`);
                    console.log(`[debug] constructed textPath: ${textPath}`);

                    if (!fs.existsSync(textPath)) {
                        console.log(`[debug] labeled.txt not found, checking fallback: ${fallbackPath}`);
                        // Fallback: transcription.txt
                        textPath = fallbackPath;
                    }

                    if (fs.existsSync(textPath)) {
                        try {
                            const sessText = fs.readFileSync(textPath, 'utf8');
                            const dateStr = sessDir.name.replace('sesion_', 'Sesión ');
                            fullTranscription += `\n\n=== ${dateStr} ===\n${sessText}`;
                            console.log(`Agregado texto de ${sessDir.name} (${sessText.length} chars)`);
                        } catch (e) {
                            console.error(`Error leyendo ${textPath}`, e);
                        }
                    } else {
                        console.log(`[debug] No text file found for session ${sessDir.name}`);
                    }
                }
            }
        }

        // Si encontramos texto en las carpetas, usémoslo. Si no, fallback al body.
        if (fullTranscription.trim()) {
            transcription = fullTranscription;
        } else {
            console.log("No se encontraron archivos de sesión, usando transcripción del request (si existe).");
        }

        if (!transcription || !transcription.trim()) {
            return res.status(400).json({ ok: false, error: 'No se encontraron transcripciones para generar el genograma' });
        }

        // Ejecutar script Python
        const { spawn } = require('child_process');
        const pythonPath = pythonExecutable();
        const scriptPath = path.join(__dirname, 'genograms', 'generate_genogram.py');

        // Force venv Scripts into PATH
        const childEnv = { ...process.env };
        const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
        childEnv[pathKey] = `${path.dirname(pythonPath)}${path.delimiter}${childEnv[pathKey]}`;

        // Crear archivo temporal con la transcripción
        const tempTranscriptionPath = path.join(__dirname, 'outputs', `temp_transcription_${patientId}.txt`);
        fs.writeFileSync(tempTranscriptionPath, transcription, 'utf-8');

        // Ruta de salida para el HTML
        const outputPath = path.join(__dirname, 'outputs', `genogram_${patientId}`);

        const pythonProcess = spawn(pythonPath, [
            scriptPath,
            tempTranscriptionPath,
            outputPath
        ], { env: childEnv });

        let pythonOutput = '';
        let pythonError = '';

        pythonProcess.stdout.on('data', (data) => {
            pythonOutput += data.toString();
            console.log(`Python stdout: ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            pythonError += data.toString();
            console.error(`Python stderr: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            // Limpiar archivo temporal
            try { fs.unlinkSync(tempTranscriptionPath); } catch (e) { }

            console.log(`=== Python Process Finished ===`);
            console.log(`Exit code: ${code}`);
            console.log(`Stdout: ${pythonOutput}`);
            console.log(`Stderr: ${pythonError}`);

            if (code !== 0) {
                console.error(`Proceso Python terminó con código ${code}`);
                return res.status(500).json({
                    ok: false,
                    error: 'Error generando genograma',
                    detail: pythonError || pythonOutput || 'Error desconocido'
                });
            }

            // Leer el HTML generado
            const htmlPath = `${outputPath}.html`;
            console.log(`Buscando HTML en: ${htmlPath}`);

            if (!fs.existsSync(htmlPath)) {
                console.error(`Archivo HTML no encontrado: ${htmlPath}`);
                console.log(`Python output: ${pythonOutput}`);
                return res.status(500).json({
                    ok: false,
                    error: 'No se generó el archivo HTML',
                    detail: `Archivo esperado: ${htmlPath}\nPython output: ${pythonOutput}`
                });
            }

            const genogramHtml = fs.readFileSync(htmlPath, 'utf-8');
            console.log(`HTML generado exitosamente, tamaño: ${genogramHtml.length} bytes`);

            res.json({
                ok: true,
                genogramHtml,
                outputPath: htmlPath
            });
        });

    } catch (err) {
        console.error('Error en /api/genograma:', err);
        res.status(500).json({
            ok: false,
            error: 'Error del servidor',
            detail: err.message
        });
    }
});

// Serve uploads
app.use('/uploads', express.static(uploadsDir));

// Serve refs (voice samples)
app.use('/refs', express.static(refsDir));

const server = app.listen(PORT, () => console.log(`Dev server running at http://localhost:${PORT}`));
server.on('error', (err) => {
    // Common cause: port already in use (php.exe, another node, etc)
    console.error('[fatal] Server failed to start:', err && err.stack ? err.stack : err);
    if (err && err.code === 'EADDRINUSE') {
        console.error(`[hint] El puerto ${PORT} ya está ocupado. Ejecuta: netstat -ano | findstr :${PORT} y luego taskkill /PID <PID> /F`);
        console.error('[hint] Alternativa rápida: set PORT=3001 (PowerShell: $env:PORT=3001) y vuelve a correr node server.js');
    }
    process.exitCode = 1;
});
