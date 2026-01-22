const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

// Load .env if present (optional). Install dotenv if you want to use a .env file.
try{
    require('dotenv').config();
}catch(e){ /* dotenv not installed; ignore */ }

// If dotenv isn't installed (or didn't load), try a minimal .env parser so
// the server can pick up HUGGINGFACE_TOKEN when running via node directly.
try{
    if(!process.env.HUGGINGFACE_TOKEN){
        const envPath = path.join(__dirname, '.env');
        if(fs.existsSync(envPath)){
            const raw = fs.readFileSync(envPath, 'utf8');
            raw.split(/\r?\n/).forEach(line => {
                const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
                if(m){
                    let key = m[1];
                    let val = m[2] || '';
                    // strip surrounding quotes
                    if((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))){
                        val = val.slice(1, -1);
                    }
                    if(!process.env[key]) process.env[key] = val;
                }
            });
        }
    }
}catch(e){ /* ignore parsing errors */ }

// Extra: robust .env loader that always attempts to set HUGGINGFACE_TOKEN and logs masked value
function loadDotenvAndLog(){
    try{
        const envPath = path.join(__dirname, '.env');
        if(fs.existsSync(envPath)){
            const raw = fs.readFileSync(envPath, 'utf8');
            raw.split(/\r?\n/).forEach(line => {
                const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
                if(m){
                    let key = m[1];
                    let val = m[2] || '';
                    if((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))){
                        val = val.slice(1, -1);
                    }
                    if(!process.env[key]) process.env[key] = val;
                }
            });
        }
    }catch(e){ /* ignore */ }

    // Log masked token presence (never print full token)
    try{
        const t = process.env.HUGGINGFACE_TOKEN;
        if(t && typeof t === 'string' && t.length > 8){
            console.log('[info] HUGGINGFACE_TOKEN loaded from env/.env —', t.slice(0,6) + '...' + t.slice(-4));
        } else if(t){
            console.log('[info] HUGGINGFACE_TOKEN loaded from env/.env (short token)');
        } else {
            console.log('[info] No HUGGINGFACE_TOKEN found in environment or .env');
        }
    }catch(e){ /* ignore logging errors */ }
}

loadDotenvAndLog();

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON even if stdout contains extra logs (e.g., Python warnings).
function parsePossiblyNoisyJson(raw){
    if(!raw) return null;
    const s = String(raw).trim();
    if(!s) return null;
    try{ return JSON.parse(s); }catch(e){ /* fallthrough */ }

    // Try to extract the last JSON object in the output.
    try{
        const matches = s.match(/\{[\s\S]*\}/g);
        if(matches && matches.length){
            for(let i = matches.length - 1; i >= 0; i--){
                const chunk = matches[i];
                try{ return JSON.parse(chunk); }catch(e){ /* continue */ }
            }
        }
    }catch(e){ /* ignore */ }
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
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Ensure recordings dir (organized by patient and session)
const recordingsDir = path.join(__dirname, 'recordings');
if(!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

// Ensure outputs dir (organized by patient and session)
const outputsDir = path.join(__dirname, 'outputs');
if(!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

// Ensure refs dir for psychologist voice samples
const refsDir = path.join(__dirname, 'refs');
if(!fs.existsSync(refsDir)) fs.mkdirSync(refsDir);

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
    if(!fs.existsSync(patientDir)) {
        fs.mkdirSync(patientDir, { recursive: true });
    }
    return patientDir;
}

// Helper: Get session directory path
function getSessionDir(patientDir, sessionIndex) {
    const sessionDir = path.join(patientDir, `sesion_${sessionIndex + 1}`);
    if(!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadsDir); },
    filename: function (req, file, cb) { const safe = Date.now() + '-' + file.originalname.replace(/\s+/g,'_'); cb(null, safe); }
});
const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({ error: 'No file' });
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
    if(PSY_PIN){
        if(!pin) {
            // Clean up uploaded file if PIN validation fails
            if(req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch(e) {}
            }
            return res.status(400).json({ error: 'PIN required' });
        }
        if(String(pin) !== String(PSY_PIN)) {
            // Clean up uploaded file if PIN is invalid
            if(req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch(e) {}
            }
            return res.status(403).json({ error: 'Invalid PIN' });
        }
    }
    
    if(!req.file) return res.status(400).json({ error: 'No voice sample uploaded' });
    
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
    
    if(!pid) return res.status(400).json({ error: 'patientId required' });
    if(!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Create patient directory and session subdirectory
    const patientDir = getPatientDir(recordingsDir, patientName);
    const sessionDir = getSessionDir(patientDir, sessionIndex);
    
    const sanitizedName = sanitizePatientName(patientName);
    const filename = `patient_${sanitizedName}_sesion${sessionIndex + 1}.wav`;
    const targetPath = path.join(sessionDir, filename);

    // If a recording already exists for this session, remove the uploaded temp and refuse
    if(fs.existsSync(targetPath)){
        try{
            // remove temp upload
            if(req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }catch(e){ console.warn('Could not remove temp upload', e); }
        return res.status(409).json({ ok:false, error: 'Recording already exists for this session' });
    }

    // Move temp upload into session directory
    try{
        fs.renameSync(req.file.path, targetPath);
        const relUrl = `/recordings/patient_${sanitizedName}/sesion_${sessionIndex + 1}/${filename}`;
        return res.json({ ok: true, path: relUrl });
    }catch(e){
        console.error('Failed to move uploaded recording', e);
        // cleanup temp
        try{ if(req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); }catch(_){}
        return res.status(500).json({ ok:false, error: e.message });
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
    
    if(fs.existsSync(filePath)){
        return res.json({ exists: true, path: `/recordings/patient_${sanitizedName}/sesion_${sessionIndex + 1}/${filename}` });
    }
    return res.json({ exists: false });
});

// Delete a recording — requires psychologist PIN in body: { patientId, patientName, sessionIndex, pin }
app.post('/api/delete-recording', (req, res) => {
    const { patientId, patientName, sessionIndex, pin } = req.body || {};
    if(!patientId) return res.status(400).json({ error: 'patientId required' });

    // If PSY_PIN is configured, require and validate the provided pin.
    if(PSY_PIN){
        if(!pin) return res.status(400).json({ error: 'pin required' });
        if(String(pin) !== String(PSY_PIN)) return res.status(403).json({ error: 'Invalid PIN' });
    }

    const sanitizedName = sanitizePatientName(patientName || `patient_${patientId}`);
    const sessionIdx = parseInt(sessionIndex || '0', 10);
    const sessionDirPath = path.join(recordingsDir, `patient_${sanitizedName}`, `sesion_${sessionIdx + 1}`);
    const filename = `patient_${sanitizedName}_sesion${sessionIdx + 1}.wav`;
    const filePath = path.join(sessionDirPath, filename);
    if(fs.existsSync(filePath)){
        try{
            fs.unlinkSync(filePath);
            // Also remove any outputs produced for this patient
            try{
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
                    try{ if(fs.existsSync(p)){ fs.unlinkSync(p); removed.push(fn); } }catch(e){ /* ignore individual errors */ }
                });
                return res.json({ ok: true, removed_outputs: removed });
            }catch(e){
                return res.json({ ok: true, removed_outputs: [], warning: 'could_not_cleanup_outputs', detail: String(e && e.message) });
            }
        }catch(e){ return res.status(500).json({ error: e.message }); }
    }
    return res.status(404).json({ error: 'Recording not found' });
});

// Validate psychologist PIN (used by frontend to check before sensitive actions)
app.post('/api/validate-pin', (req, res) => {
    const { pin } = req.body || {};
    // If no server PIN is configured, behave permissively (return ok:true)
    // so the app can run without requiring a PSY_PIN during development.
    if(!PSY_PIN){
        return res.json({ ok: true, notice: 'no_server_pin_configured' });
    }
    if(!pin) return res.status(400).json({ ok: false, error: 'pin required' });
    if(String(pin) === String(PSY_PIN)) return res.json({ ok: true });
    return res.status(403).json({ ok: false, error: 'invalid' });
});

// Serve recordings with explicit headers to help browsers play audio reliably
app.use('/recordings', express.static(recordingsDir, {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        // ensure WAV files are served with correct MIME
        if(path.extname(filePath).toLowerCase() === '.wav'){
            res.setHeader('Content-Type', 'audio/wav');
        }
        // avoid aggressive caching during development
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

// Transcribe a recording for a patient by running the Python transcription CLI
const { spawn } = require('child_process');
// Helper to spawn process_all.py in background for a given filePath/stem
function spawnProcessAll(filePath, stem, sessionOutputDir){
    try{
        // Use provided sessionOutputDir or fallback to default outputs
        const outDir = sessionOutputDir || path.join(__dirname, 'outputs');
        if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const logPath = path.join(outDir, `process_${stem}.log`);
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        logStream.write(`\n\n===== PROCESS_START ${new Date().toISOString()} =====\n`);

        // Determine python executable similar to inline logic
        let pyExec = 'python';
        try{
            const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
            const venvUnix = path.join(__dirname, '.venv', 'bin', 'python');
            if(fs.existsSync(venvWin)){
                pyExec = venvWin;
            } else if(fs.existsSync(venvUnix)){
                pyExec = venvUnix;
            } else if(process.env.PYTHON){
                const candidate = process.env.PYTHON;
                if(fs.existsSync(candidate)) pyExec = candidate;
                else if(fs.existsSync(candidate + '.exe')) pyExec = candidate + '.exe';
            }
        }catch(e){ /* ignore */ }

        const script = path.join(__dirname, 'transciption', 'process_all.py');
        // child env
        let childEnv = Object.assign({}, process.env);
        try{ childEnv.PYTHONIOENCODING = childEnv.PYTHONIOENCODING || 'utf-8'; }catch(e){}
        try{ childEnv.PYTHONUTF8 = childEnv.PYTHONUTF8 || '1'; }catch(e){}
        try{ childEnv.LANG = childEnv.LANG || 'en_US.UTF-8'; }catch(e){}

        const child = spawn(pyExec, [script, filePath, 'small', 'es', 'refs', String(process.env.PYANNOTE_THRESHOLD || 0.75), outDir], { env: childEnv, cwd: __dirname, detached: true, stdio: ['ignore','pipe','pipe'] });

        if(child.stdout){ child.stdout.on('data', (c)=>{ try{ logStream.write(c.toString()); }catch(e){} }); }
        if(child.stderr){ child.stderr.on('data', (c)=>{ try{ logStream.write(c.toString()); }catch(e){} }); }
        child.on('error', (e)=>{ try{ logStream.write('\n[child_error] ' + String(e && e.message) + '\n'); }catch(_){} });
        child.on('close', (code)=>{ try{ logStream.write('\n===== PROCESS_EXIT ' + code + ' ' + new Date().toISOString() + ' =====\n'); }catch(_){}; try{ logStream.end(); }catch(_){} });
        try{ child.unref(); }catch(e){}
        console.log('[info] Launched background process_all for', filePath, 'logs->', logPath);
        const relativeLogPath = path.relative(path.join(__dirname, 'outputs'), logPath).replace(/\\/g, '/');
        return { ok:true, log: `/outputs/${relativeLogPath}` };
    }catch(err){ console.error('spawnProcessAll error', err); return { ok:false, error: String(err && err.message) }; }
}
app.post('/api/transcribe-recording', express.json(), (req, res) => {
    const patientId = req.body && req.body.patientId;
    const patientName = req.body && req.body.patientName || `patient_${patientId}`;
    const sessionIndex = parseInt(req.body && req.body.sessionIndex || '0', 10);
    
    if(!patientId) return res.status(400).json({ ok:false, error: 'patientId required' });
    
    const sanitizedName = sanitizePatientName(patientName);
    const patientDirPath = path.join(recordingsDir, `patient_${sanitizedName}`);
    const sessionDirPath = path.join(patientDirPath, `sesion_${sessionIndex + 1}`);
    const filename = `patient_${sanitizedName}_sesion${sessionIndex + 1}.wav`;
    const filePath = path.join(sessionDirPath, filename);
    if(!fs.existsSync(filePath)) return res.status(404).json({ ok:false, error: 'recording_not_found' });

    console.log('[debug] /api/transcribe-recording (process_all) request for patientId=', patientId, 'file=', filePath);

    // If a labeled output already exists, return it immediately.
    try{
        const outDir = path.join(__dirname, 'outputs');
        const stem = path.parse(filename).name; // patient_1
        const labeledTxt = path.join(outDir, `${stem}_labeled.txt`);
        const transcriptionJson = path.join(outDir, `${stem}_transcription.json`);
        if(fs.existsSync(labeledTxt)){
            const txt = fs.readFileSync(labeledTxt, 'utf8');
            return res.json({ ok:true, stage: 'labeled', text: txt, txt_path: `/outputs/${path.basename(labeledTxt)}` });
        }
        if(fs.existsSync(transcriptionJson)){
            try{ const j = JSON.parse(fs.readFileSync(transcriptionJson, 'utf8')); return res.json({ ok:true, stage: 'transcription', text: j.text || '', json_path: `/outputs/${path.basename(transcriptionJson)}` }); }catch(e){}
        }
    }catch(e){ console.warn('Error checking existing outputs', e); }

    // Otherwise launch full local pipeline (process_all.py) in background and return immediately.
    function resolvePythonCandidate(envVal){
        if(!envVal) return null;
        let candidate = envVal.toString().trim();
        if((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))){ candidate = candidate.slice(1, -1); }
        try{ if(fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()){ const pexe = path.join(candidate, 'Scripts', 'python.exe'); if(fs.existsSync(pexe)) return pexe; const pbin = path.join(candidate, 'bin', 'python'); if(fs.existsSync(pbin)) return pbin; } }catch(e){}
        try{ if(fs.existsSync(candidate)) return candidate; }catch(e){}
        try{ if(fs.existsSync(candidate + '.exe')) return candidate + '.exe'; }catch(e){}
        return null;
    }

    // Prefer project-local .venv python if it exists (Windows/Unix paths)
    let pyExec = 'python';
    try{
        const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
        const venvUnix = path.join(__dirname, '.venv', 'bin', 'python');
        if(fs.existsSync(venvWin)){
            pyExec = venvWin;
            console.log('[info] Using .venv python:', pyExec);
        } else if(fs.existsSync(venvUnix)){
            pyExec = venvUnix;
            console.log('[info] Using .venv python:', pyExec);
        } else if(process.env.PYTHON){ const r = resolvePythonCandidate(process.env.PYTHON); if(r) { pyExec = r; console.log('[info] Using PYTHON env:', pyExec); } }
    }catch(e){ console.warn('Could not resolve .venv python, falling back to python on PATH', e); }

    const script = path.join(__dirname, 'transciption', 'process_all.py');
    try{
        const stem = path.parse(filename).name; // patient_juan_perez_sesion1
        
        // Create session output directory
        const sessionOutputDir = path.join(outputsDir, `patient_${sanitizedName}`, `sesion_${sessionIndex + 1}`);
        if(!fs.existsSync(sessionOutputDir)) fs.mkdirSync(sessionOutputDir, { recursive: true });
        
        const result = spawnProcessAll(filePath, stem, sessionOutputDir);
        if(result && result.ok){
            return res.json({ ok:true, processing: true, message: 'processing_started', log: result.log });
        } else {
            return res.status(500).json({ ok:false, error: 'spawn_failed', detail: result && result.error });
        }
    }catch(err){
        console.error('Failed to spawn process_all', err);
        return res.status(500).json({ ok:false, error: 'spawn_failed', detail: String(err && err.message) });
    }
});

// RAG endpoint: query Qdrant (already populated) and generate answer
app.post('/api/rag/ask', express.json({ limit: '1mb' }), (req, res) => {
    try{
        const { collection, query, k, top_n } = req.body || {};
        if(!collection || !query){
            return res.status(400).json({ ok:false, error: 'missing_collection_or_query' });
        }

        // Prefer project-local .venv python if it exists (Windows/Unix paths)
        let pyExec = process.env.PYTHON_PATH || process.env.PYTHON || 'python';
        try{
            const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
            const venvUnix = path.join(__dirname, '.venv', 'bin', 'python');
            if(fs.existsSync(venvWin)) pyExec = venvWin;
            else if(fs.existsSync(venvUnix)) pyExec = venvUnix;
        }catch(e){ /* ignore */ }

        const scriptPath = path.join(__dirname, 'tools', 'rag_query.py');
        const childEnv = Object.assign({}, process.env);
        try{ childEnv.PYTHONIOENCODING = childEnv.PYTHONIOENCODING || 'utf-8'; }catch(e){}
        try{ childEnv.PYTHONUTF8 = childEnv.PYTHONUTF8 || '1'; }catch(e){}

        const child = spawn(pyExec, [scriptPath], { env: childEnv, cwd: __dirname });

        let out = '';
        let err = '';
        if(child.stdout) child.stdout.on('data', (d)=>{ out += d.toString(); });
        if(child.stderr) child.stderr.on('data', (d)=>{ err += d.toString(); });
        child.on('error', (e)=>{
            return res.status(500).json({ ok:false, error: 'rag_spawn_error', detail: String(e && e.message) });
        });
        child.on('close', (code)=>{
            // Always try to parse JSON (even on non-zero exit codes) so we can return
            // structured errors from Python instead of opaque rag_failed messages.
            let parsed = null;
            parsed = parsePossiblyNoisyJson(out);

            if(parsed && typeof parsed === 'object'){
                // Choose status codes that help debugging and avoid generic 500s when it's a bad request.
                const isOk = parsed.ok === true;
                if(isOk) return res.json(parsed);

                const errCode = String(parsed.error || 'rag_error');
                const clientErrors = new Set([
                    'missing_collection_or_query',
                    'bad_json_in',
                    'collection_not_found'
                ]);
                const status = clientErrors.has(errCode) ? 400 : 500;
                return res.status(status).json(Object.assign({ ok:false, code, stderr: (err || '').slice(0, 8000) }, parsed));
            }

            if(code !== 0){
                return res.status(500).json({ ok:false, error: 'rag_failed', code, detail: err || out || `exit_${code}` });
            }
            try{
                return res.json(JSON.parse(out));
            }catch(e){
                return res.status(500).json({ ok:false, error: 'bad_python_json', detail: String(e && e.message), raw: out, stderr: (err || '').slice(0, 8000) });
            }
        });

        child.stdin.write(JSON.stringify({ collection, query, k, top_n }));
        child.stdin.end();
    }catch(e){
        return res.status(500).json({ ok:false, error: 'server_error', detail: String(e && e.message) });
    }
});

// ICD-11 scoring endpoint: query ICD-11 collection in Qdrant and return normalized scores (JSON)
app.post('/api/icd11/score', express.json({ limit: '1mb' }), (req, res) => {
    try{
        const {
            clinical_text,
            search_query,
            k,
            top_n,
            out_top,
            collection,
        } = req.body || {};

        if(!clinical_text || !String(clinical_text).trim()){
            return res.status(400).json({ ok:false, error: 'missing_clinical_text' });
        }

        // Prefer project-local .venv python if it exists (Windows/Unix paths)
        let pyExec = process.env.PYTHON_PATH || process.env.PYTHON || 'python';
        try{
            const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
            const venvUnix = path.join(__dirname, '.venv', 'bin', 'python');
            if(fs.existsSync(venvWin)) pyExec = venvWin;
            else if(fs.existsSync(venvUnix)) pyExec = venvUnix;
        }catch(e){ /* ignore */ }

        const scriptPath = path.join(__dirname, 'tools', 'icd11_score.py');
        const childEnv = Object.assign({}, process.env);
        try{ childEnv.PYTHONIOENCODING = childEnv.PYTHONIOENCODING || 'utf-8'; }catch(e){}
        try{ childEnv.PYTHONUTF8 = childEnv.PYTHONUTF8 || '1'; }catch(e){}

        const child = spawn(pyExec, [scriptPath], { env: childEnv, cwd: __dirname });

        let out = '';
        let err = '';
        if(child.stdout) child.stdout.on('data', (d)=>{ out += d.toString(); });
        if(child.stderr) child.stderr.on('data', (d)=>{ err += d.toString(); });
        child.on('error', (e)=>{
            return res.status(500).json({ ok:false, error: 'icd11_spawn_error', detail: String(e && e.message) });
        });
        child.on('close', (code)=>{
            let parsed = null;
            parsed = parsePossiblyNoisyJson(out);

            if(parsed && typeof parsed === 'object'){
                const isOk = parsed.ok === true;
                if(isOk) return res.json(parsed);

                const errCode = String(parsed.error || 'icd11_error');
                const clientErrors = new Set([
                    'missing_clinical_text',
                    'bad_json_in',
                    'collection_not_found',
                    'missing_qdrant_env',
                    'missing_gemini_api_key'
                ]);
                const status = clientErrors.has(errCode) ? 400 : 500;
                return res.status(status).json(Object.assign({ ok:false, code, stderr: (err || '').slice(0, 8000) }, parsed));
            }

            if(code !== 0){
                return res.status(500).json({ ok:false, error: 'icd11_failed', code, detail: err || out || `exit_${code}` });
            }
            return res.status(500).json({ ok:false, error: 'bad_python_json', code, raw: out, stderr: (err || '').slice(0, 8000) });
        });

        child.stdin.write(JSON.stringify({
            clinical_text,
            search_query,
            k,
            top_n,
            out_top,
            collection,
        }));
        child.stdin.end();
    }catch(e){
        return res.status(500).json({ ok:false, error: 'server_error', detail: String(e && e.message) });
    }
});

// Data endpoints
const dataFile = path.join(__dirname, 'data.json');

function readData(){
    try{ const raw = fs.readFileSync(dataFile,'utf8'); return JSON.parse(raw); }catch(e){ return null; }
}

function writeData(obj){ fs.writeFileSync(dataFile, JSON.stringify(obj, null, 2), 'utf8'); }

app.get('/api/data', (req, res) => {
    const d = readData();
    if(!d) return res.status(404).json({});
    res.json(d);
});

// Return already-processed LABELLED transcription for a patient if available.
// IMPORTANT: this endpoint now only returns `*_labeled.txt` / `*_labeled.json`.
// Do NOT fall back to other transcription files; the UI must display only labeled outputs.
app.get('/api/processed/:patientId', (req, res) => {
    const pid = req.params.patientId;
    const patientName = req.query.patientName || `patient_${pid}`;
    const sessionIndex = parseInt(req.query.sessionIndex || '0', 10);
    
    if(!pid) return res.status(400).json({ ok:false, error: 'patientId required' });
    try{
        const sanitizedName = sanitizePatientName(patientName);
        
        // Try new structure first (patient_name/sesion_X/)
        const patientDirPath = path.join(outputsDir, `patient_${sanitizedName}`);
        const sessionDirPath = path.join(patientDirPath, `sesion_${sessionIndex + 1}`);
        const stem = `patient_${sanitizedName}_sesion${sessionIndex + 1}`;
        
        let labeledTxt = path.join(sessionDirPath, `${stem}_labeled.txt`);
        let labeledJson = path.join(sessionDirPath, `${stem}_labeled.json`);
        
        // Fallback to old structure if new doesn't exist
        if(!fs.existsSync(labeledTxt) && !fs.existsSync(labeledJson)){
            const oldStem = `patient_${String(pid).replace(/[^0-9a-zA-Z_-]/g,'_')}`;
            labeledTxt = path.join(outputsDir, `${oldStem}_labeled.txt`);
            labeledJson = path.join(outputsDir, `${oldStem}_labeled.json`);
        }

        if(fs.existsSync(labeledTxt)){
            try{
                const raw = fs.readFileSync(labeledTxt, 'utf8');
                const relativePath = path.relative(outputsDir, labeledTxt).replace(/\\/g, '/');
                return res.json({ ok:true, stage: 'labeled', text: raw, txt_path: `/outputs/${relativePath}` });
            }catch(e){ /* fallthrough to json */ }
        }

        if(fs.existsSync(labeledJson)){
            try{
                const j = JSON.parse(fs.readFileSync(labeledJson, 'utf8'));
                // prefer a labeled_text field if present
                const text = j && (j.labeled_text || j.text || '');
                const relativePath = path.relative(outputsDir, labeledJson).replace(/\\/g, '/');
                return res.json({ ok:true, stage: 'labeled', text, json_path: `/outputs/${relativePath}`, raw: j });
            }catch(e){ /* ignore */ }
        }

        return res.status(404).json({ ok:false, error: 'labeled_not_found' });
    }catch(err){
        console.error('Error in /api/processed', err);
        return res.status(500).json({ ok:false, error: 'server_error', detail: String(err && err.message) });
    }
});

app.post('/api/data', (req, res) => {
    const body = req.body;
    try{ writeData(body); res.json({ ok:true }); }catch(e){ res.status(500).json({ error: e.message }); }
});

// Endpoint para generar genograma
app.post('/api/genograma/:patientId', async (req, res) => {
    try {
        const { patientId } = req.params;
        const { transcription } = req.body;
        
        if (!transcription) {
            return res.status(400).json({ ok: false, error: 'No se proporcionó transcripción' });
        }
        
        console.log(`Generando genograma para paciente ${patientId}...`);
        
        // Ejecutar script Python
        const { spawn } = require('child_process');
        const pythonPath = process.env.PYTHON_PATH || 'python';
        const scriptPath = path.join(__dirname, 'genograms', 'generate_genogram.py');
        
        // Crear archivo temporal con la transcripción
        const tempTranscriptionPath = path.join(__dirname, 'outputs', `temp_transcription_${patientId}.txt`);
        fs.writeFileSync(tempTranscriptionPath, transcription, 'utf-8');
        
        // Ruta de salida para el HTML
        const outputPath = path.join(__dirname, 'outputs', `genogram_${patientId}`);
        
        const pythonProcess = spawn(pythonPath, [
            scriptPath,
            tempTranscriptionPath,
            outputPath
        ]);
        
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
            try { fs.unlinkSync(tempTranscriptionPath); } catch(e) {}
            
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

const server = app.listen(PORT, ()=> console.log(`Dev server running at http://localhost:${PORT}`));
server.on('error', (err) => {
    // Common cause: port already in use (php.exe, another node, etc)
    console.error('[fatal] Server failed to start:', err && err.stack ? err.stack : err);
    if(err && err.code === 'EADDRINUSE'){
        console.error(`[hint] El puerto ${PORT} ya está ocupado. Ejecuta: netstat -ano | findstr :${PORT} y luego taskkill /PID <PID> /F`);
        console.error('[hint] Alternativa rápida: set PORT=3001 (PowerShell: $env:PORT=3001) y vuelve a correr node server.js');
    }
    process.exitCode = 1;
});
