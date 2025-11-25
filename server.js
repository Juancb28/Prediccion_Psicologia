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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Enable CORS for frontend running on different port (e.g. live-server:5500)
app.use(cors());

// Serve static files (the frontend)
app.use(express.static(path.join(__dirname)));

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Ensure recordings dir (one file per patient)
const recordingsDir = path.join(__dirname, 'recordings');
if(!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

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
    if(!pid) return res.status(400).json({ error: 'patientId required' });
    if(!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filename = `patient_${String(pid).replace(/[^0-9a-zA-Z_-]/g,'_')}.wav`;
    const targetPath = path.join(recordingsDir, filename);

    // If a recording already exists for this patient, remove the uploaded temp and refuse
    if(fs.existsSync(targetPath)){
        try{
            // remove temp upload
            if(req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }catch(e){ console.warn('Could not remove temp upload', e); }
        return res.status(409).json({ ok:false, error: 'Recording already exists for this patient' });
    }

    // Move temp upload into recordings directory
    try{
        fs.renameSync(req.file.path, targetPath);
        const relUrl = `/recordings/${filename}`;
        // After successfully storing the recording, DO NOT automatically launch
        // the labeling/transcription pipeline. The UI should only show the
        // `*_labeled.txt` when it exists. If automatic processing is desired
        // it can be triggered explicitly via `/api/transcribe-recording`.
        return res.json({ ok: true, path: relUrl });
    }catch(e){
        console.error('Failed to move uploaded recording', e);
        // cleanup temp
        try{ if(req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); }catch(_){}
        return res.status(500).json({ ok:false, error: e.message });
    }
});

// Check if a recording exists for a patient
app.get('/api/recording/:patientId', (req, res) => {
    const pid = req.params.patientId;
    const filename = `patient_${String(pid).replace(/[^0-9a-zA-Z_-]/g,'_')}.wav`;
    const filePath = path.join(recordingsDir, filename);
    if(fs.existsSync(filePath)){
        return res.json({ exists: true, path: `/recordings/${filename}` });
    }
    return res.json({ exists: false });
});

// Delete a recording — requires psychologist PIN in body: { patientId, pin }
app.post('/api/delete-recording', (req, res) => {
    const { patientId, pin } = req.body || {};
    if(!patientId) return res.status(400).json({ error: 'patientId required' });

    // If PSY_PIN is configured, require and validate the provided pin.
    if(PSY_PIN){
        if(!pin) return res.status(400).json({ error: 'pin required' });
        if(String(pin) !== String(PSY_PIN)) return res.status(403).json({ error: 'Invalid PIN' });
    }

    const filename = `patient_${String(patientId).replace(/[^0-9a-zA-Z_-]/g,'_')}.wav`;
    const filePath = path.join(recordingsDir, filename);
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
function spawnProcessAll(filePath, stem){
    try{
        const outDir = path.join(__dirname, 'outputs');
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
        return { ok:true, log: `/outputs/${path.basename(logPath)}` };
    }catch(err){ console.error('spawnProcessAll error', err); return { ok:false, error: String(err && err.message) }; }
}
app.post('/api/transcribe-recording', express.json(), (req, res) => {
    const patientId = req.body && req.body.patientId;
    if(!patientId) return res.status(400).json({ ok:false, error: 'patientId required' });
    const filename = `patient_${String(patientId).replace(/[^0-9a-zA-Z_-]/g,'_')}.wav`;
    const filePath = path.join(recordingsDir, filename);
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
        const stem = path.parse(filename).name; // patient_1
        const result = spawnProcessAll(filePath, stem);
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
    if(!pid) return res.status(400).json({ ok:false, error: 'patientId required' });
    try{
        const outDir = path.join(__dirname, 'outputs');
        const stem = `patient_${String(pid).replace(/[^0-9a-zA-Z_-]/g,'_')}`;
        const labeledTxt = path.join(outDir, `${stem}_labeled.txt`);
        const labeledJson = path.join(outDir, `${stem}_labeled.json`);

        if(fs.existsSync(labeledTxt)){
            try{
                const raw = fs.readFileSync(labeledTxt, 'utf8');
                return res.json({ ok:true, stage: 'labeled', text: raw, txt_path: `/outputs/${path.basename(labeledTxt)}` });
            }catch(e){ /* fallthrough to json */ }
        }

        if(fs.existsSync(labeledJson)){
            try{
                const j = JSON.parse(fs.readFileSync(labeledJson, 'utf8'));
                // prefer a labeled_text field if present
                const text = j && (j.labeled_text || j.text || '');
                return res.json({ ok:true, stage: 'labeled', text, json_path: `/outputs/${path.basename(labeledJson)}`, raw: j });
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

// Serve uploads
app.use('/uploads', express.static(uploadsDir));

app.listen(PORT, ()=> console.log(`Dev server running at http://localhost:${PORT}`));
