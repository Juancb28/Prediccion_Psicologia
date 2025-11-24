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

// Outputs dir (transcriptions, labeled, logs)
const outputsDir = path.join(__dirname, 'outputs');
if(!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir);

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
            // Also remove any generated outputs for this patient (transcription, diarization, labeled, logs)
            const stem = path.parse(filename).name; // e.g. patient_1
            const filesToRemove = [
                path.join(outputsDir, `${stem}_transcription.json`),
                path.join(outputsDir, `${stem}_transcription.txt`),
                path.join(outputsDir, `${stem}_diarization.txt`),
                path.join(outputsDir, `${stem}_labeled.json`),
                path.join(outputsDir, `${stem}_labeled.txt`),
                path.join(outputsDir, `process_${stem}.log`)
            ];
            const removed = [];
            filesToRemove.forEach(f => {
                try{
                    if(fs.existsSync(f)){
                        fs.unlinkSync(f);
                        removed.push(path.basename(f));
                    }
                }catch(e){ /* ignore individual removal errors */ }
            });
            return res.json({ ok: true, removed_outputs: removed });
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

// Serve outputs (transcriptions, labeled files). Strip Range header to avoid RangeNotSatisfiable errors
app.use('/outputs', (req, res, next) => {
    try{
        if(req.headers && req.headers.range){
            // remove range to avoid partial-range serving issues for small files
            delete req.headers.range;
        }
    }catch(e){ /* ignore */ }
    next();
}, express.static(outputsDir, {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

// Transcribe a recording for a patient by running the Python transcription CLI
const { spawn } = require('child_process');
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
        // Ensure outputs dir exists
        const outDir = path.join(__dirname, 'outputs');
        if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        // Create a per-patient log file for debugging the background process
        const stem = path.parse(filename).name; // patient_1
        const logPath = path.join(outDir, `process_${stem}.log`);
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        logStream.write(`\n\n===== PROCESS_START ${new Date().toISOString()} =====\n`);

        // Attempt to autodetect a local pyannote pipeline snapshot in HF cache
        // so child processes run fully offline without HF auth.
        let childEnv = Object.assign({}, process.env);
        try{
            const hfHome = process.env.HF_HOME || path.join(require('os').homedir(), '.cache', 'huggingface');
            const snapshotsDir = path.join(hfHome, 'hub', 'models--pyannote--speaker-diarization', 'snapshots');
            if(fs.existsSync(snapshotsDir)){
                const entries = fs.readdirSync(snapshotsDir).map(d => ({ d, p: path.join(snapshotsDir, d) }));
                const dirs = entries.filter(x => fs.existsSync(x.p) && fs.statSync(x.p).isDirectory());
                if(dirs.length){
                    dirs.sort((a,b)=> fs.statSync(a.p).mtimeMs - fs.statSync(b.p).mtimeMs);
                    const picked = dirs[dirs.length-1].p;
                    childEnv.PYANNOTE_LOCAL_PIPELINE = picked;
                    console.log('[info] Autodetected PYANNOTE_LOCAL_PIPELINE ->', picked);
                }
            }
        }catch(e){ console.warn('[warn] could not autodetect pyannote cache', e); }

        // Ensure Python prints/IO use UTF-8 to avoid UnicodeEncodeError on Windows consoles
        try{ childEnv.PYTHONIOENCODING = childEnv.PYTHONIOENCODING || 'utf-8'; }catch(e){}
        try{ childEnv.PYTHONUTF8 = childEnv.PYTHONUTF8 || '1'; }catch(e){}
        try{ childEnv.LANG = childEnv.LANG || 'en_US.UTF-8'; }catch(e){}

        const child = spawn(pyExec, [script, filePath, 'small', 'es', 'refs', String(process.env.PYANNOTE_THRESHOLD || 0.75), outDir], { env: childEnv, cwd: __dirname, detached: true, stdio: ['ignore','pipe','pipe'] });

        if(child.stdout){
            child.stdout.on('data', (c)=>{ try{ logStream.write(c.toString()); }catch(e){} });
        }
        if(child.stderr){
            child.stderr.on('data', (c)=>{ try{ logStream.write(c.toString()); }catch(e){} });
        }
        child.on('error', (e)=>{ try{ logStream.write('\n[child_error] ' + String(e && e.message) + '\n'); }catch(_){} });
        child.on('close', (code)=>{ try{ logStream.write('\n===== PROCESS_EXIT ' + code + ' ' + new Date().toISOString() + ' =====\n'); }catch(_){}; try{ logStream.end(); }catch(_){} });

        try{ child.unref(); }catch(e){ /* ignore */ }
        console.log('[info] Launched background process_all for', filePath, 'logs->', logPath);
        // update todo list status
        return res.json({ ok:true, processing: true, message: 'processing_started', log: `/outputs/${path.basename(logPath)}` });
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

// Return already-processed transcription/label outputs for a patient if available.
// Order of preference: labeled JSON/text -> transcription JSON/text
app.get('/api/processed/:patientId', (req, res) => {
    const pid = req.params.patientId;
    if(!pid) return res.status(400).json({ ok:false, error: 'patientId required' });
    console.log('[debug] /api/processed request for patientId=', pid);
    try{
        const outDir = path.join(__dirname, 'outputs');
        const stem = `patient_${String(pid).replace(/[^0-9a-zA-Z_-]/g,'_')}`;
        console.log('[debug] resolved stem =', stem, 'looking in', outDir);
        const candidates = [
            { type: 'labeled', json: path.join(outDir, `${stem}_labeled.json`), txt: path.join(outDir, `${stem}_labeled.txt`) },
            { type: 'transcription', json: path.join(outDir, `${stem}_transcription.json`), txt: path.join(outDir, `${stem}_transcription.txt`) }
        ];

        for(const c of candidates){
            if(fs.existsSync(c.json)){
                try{
                    const j = JSON.parse(fs.readFileSync(c.json, 'utf8'));
                    // try to extract a human-friendly text field
                    let text = '';
                    if(j){
                        if(j.labeled_text) text = j.labeled_text;
                        else if(j.text) text = j.text;
                        else if(j.transcription) text = j.transcription;
                        else if(j.result) text = j.result;
                        else if(j.output) text = j.output;
                        else if(Array.isArray(j)){
                            // assume array of segments [{start,end,speaker,text},...]
                            text = j.map(seg => (seg.speaker ? (seg.speaker + ': ') : '') + (seg.text || '')).join('\n');
                        } else if(j.segments && Array.isArray(j.segments)){
                            text = j.segments.map(seg => (seg.speaker ? (seg.speaker + ': ') : '') + (seg.text || '')).join('\n');
                        } else if(typeof j === 'object'){
                            // try to find arrays under common keys
                            const maybe = j.labeled || j.segments || j.output || j.items || null;
                            if(Array.isArray(maybe)) text = maybe.map(seg => (seg.speaker ? (seg.speaker + ': ') : '') + (seg.text || '')).join('\n');
                        }
                    }
                    // fallback: if text still empty, stringify minimal representation
                    if(!text){
                        try{ text = JSON.stringify(j).slice(0, 2000); }catch(e){ text = '' }
                    }
                    return res.json({ ok:true, stage: c.type, text, json_path: `/outputs/${path.basename(c.json)}`, raw: j });
                }catch(e){
                    // fallthrough to return raw file content as text
                    const raw = fs.readFileSync(c.json, 'utf8');
                    return res.json({ ok:true, stage: c.type, text: raw, json_path: `/outputs/${path.basename(c.json)}` });
                }
            }
            if(fs.existsSync(c.txt)){
                try{
                    const raw = fs.readFileSync(c.txt, 'utf8');
                    return res.json({ ok:true, stage: c.type, text: raw, txt_path: `/outputs/${path.basename(c.txt)}` });
                }catch(e){ /* ignore */ }
            }
        }

        return res.status(404).json({ ok:false, error: 'processed_not_found' });
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
