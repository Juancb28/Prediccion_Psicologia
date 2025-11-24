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
        try{ fs.unlinkSync(filePath); return res.json({ ok: true }); }catch(e){ return res.status(500).json({ error: e.message }); }
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
app.post('/api/transcribe-recording', express.json(), (req, res) => {
    const patientId = req.body && req.body.patientId;
    if(!patientId) return res.status(400).json({ ok:false, error: 'patientId required' });
    const filename = `patient_${String(patientId).replace(/[^0-9a-zA-Z_-]/g,'_')}.wav`;
    const filePath = path.join(recordingsDir, filename);
    if(!fs.existsSync(filePath)) return res.status(404).json({ ok:false, error: 'recording_not_found' });

    console.log('[debug] /api/transcribe-recording request for patientId=', patientId, 'file=', filePath);

    // Build python command: run transciption/run_transcribe.py <filePath>
    const py = process.env.PYTHON || 'python';
    const script = path.join(__dirname, 'transciption', 'run_transcribe.py');

    let child;
    try{
        child = spawn(py, [script, filePath], { env: process.env });
    }catch(spawnErr){
        console.error('Failed to spawn transcription process (sync throw)', spawnErr);
        return res.status(500).json({ ok:false, error: 'spawn_exception', detail: String(spawnErr && spawnErr.message) });
    }

    let stdout = '';
    let stderr = '';
    let responded = false;
    // Safety timeout: if transcription takes too long, kill child and respond
    const killTimeout = setTimeout(()=>{
        try{
            if(child && !child.killed) child.kill('SIGKILL');
        }catch(_){}
        if(!responded){
            responded = true;
            console.error('Transcription process timed out and was killed');
            try{ res.status(504).json({ ok:false, error: 'transcription_timeout' }); }catch(e){}
        }
    }, 120000); // 2 minutes

    child.on('error', (err)=>{
        console.error('Transcription spawn error event', err);
        if(!responded){
            responded = true;
            try{ res.status(500).json({ ok:false, error: 'spawn_error', detail: String(err && err.message) }); }catch(e){}
        }
    });

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    // helper: post audio buffer to Hugging Face inference API using built-in https
    async function hfTranscribe(model, token, buffer){
        return new Promise((resolve, reject)=>{
            try{
                const https = require('https');
                const u = new URL(`https://api-inference.huggingface.co/models/${model}`);
                const opts = {
                    hostname: u.hostname,
                    path: u.pathname,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'audio/wav',
                        'Content-Length': buffer.length
                    }
                };
                const req = https.request(opts, (resp)=>{
                    const chunks = [];
                    resp.on('data', (c)=>chunks.push(c));
                    resp.on('end', ()=>{
                        const body = Buffer.concat(chunks).toString('utf8');
                        // try parse JSON, otherwise return text
                        try{ const j = JSON.parse(body); resolve({ ok: resp.statusCode>=200 && resp.statusCode<300, status: resp.statusCode, body: j }); }
                        catch(e){ resolve({ ok: resp.statusCode>=200 && resp.statusCode<300, status: resp.statusCode, body: body }); }
                    });
                });
                req.on('error', (err)=> reject(err));
                req.write(buffer);
                req.end();
            }catch(e){ reject(e); }
        });
    }

    child.on('close', async (code) => {
        clearTimeout(killTimeout);
        if(code !== 0){
            console.warn('Transcription script failed or not available, falling back to Hugging Face API if token exists', code, stderr);
            // Fallback: if HUGGINGFACE_TOKEN provided, call HF inference API
            try{
                const hfToken = process.env.HUGGINGFACE_TOKEN;
                if(!hfToken){
                    // return original error
                    try{ const parsed = JSON.parse(stdout || '{}'); return res.status(500).json({ ok:false, error: 'transcription_failed', detail: parsed, stderr }); }catch(e){ return res.status(500).json({ ok:false, error: 'transcription_failed', stderr }); }
                }
                // call HF API
                const buffer = fs.readFileSync(filePath);
                const model = process.env.HF_WHISPER_MODEL || 'openai/whisper-small';
                const hfResp = await hfTranscribe(model, hfToken, buffer);
                if(!hfResp.ok){
                    const txt = typeof hfResp.body === 'string' ? hfResp.body : JSON.stringify(hfResp.body);
                    console.error('Hugging Face inference failed', hfResp.status, txt);
                    return res.status(500).json({ ok:false, error: 'hf_inference_failed', status: hfResp.status, detail: txt });
                }
                // HF may return JSON with 'text' or a plain string; normalize
                let text = '';
                if(hfResp && hfResp.body){
                    if(typeof hfResp.body === 'string') text = hfResp.body;
                    else if(hfResp.body.text) text = hfResp.body.text;
                    else text = JSON.stringify(hfResp.body);
                }

                // persist outputs in outputs/
                try{
                    const outDir = path.join(__dirname, 'outputs');
                    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir);
                    const stem = path.parse(filename).name; // patient_1
                    const jsonPath = path.join(outDir, `${stem}_transcription.json`);
                    const txtPath = path.join(outDir, `${stem}_transcription.txt`);
                    fs.writeFileSync(jsonPath, JSON.stringify({ text: text, source: 'huggingface', model }, null, 2), 'utf8');
                    fs.writeFileSync(txtPath, `TRANSCRIPCIÓN (HF)\n\n${text}\n`, 'utf8');
                }catch(e){ console.warn('Could not write outputs files', e); }

                if(!responded){
                    responded = true;
                    return res.json({ ok:true, transcription_text: text, segments: [], json_path: null, txt_path: null });
                }
            }catch(fallbackErr){
                console.error('Fallback transcription failed', fallbackErr);
                if(!responded){
                    responded = true;
                    try{ const parsed = JSON.parse(stdout || '{}'); return res.status(500).json({ ok:false, error: 'transcription_failed', detail: parsed, stderr }); }catch(e){ return res.status(500).json({ ok:false, error: 'transcription_failed', stderr }); }
                }
            }
        }
        try{
            const parsed = JSON.parse(stdout || '{}');
            if(!responded){ responded = true; return res.json({ ok:true, transcription_text: parsed.text || '', segments: parsed.segments || [], json_path: parsed.json_path, txt_path: parsed.txt_path }); }
        }catch(e){
            if(!responded){ responded = true; return res.status(500).json({ ok:false, error: 'invalid_output', stdout, stderr }); }
        }
    });
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

app.post('/api/data', (req, res) => {
    const body = req.body;
    try{ writeData(body); res.json({ ok:true }); }catch(e){ res.status(500).json({ error: e.message }); }
});

// Serve uploads
app.use('/uploads', express.static(uploadsDir));

app.listen(PORT, ()=> console.log(`Dev server running at http://localhost:${PORT}`));
