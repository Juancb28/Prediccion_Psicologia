const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

// Load .env if present (optional). Install dotenv if you want to use a .env file.
try{
    require('dotenv').config();
}catch(e){ /* dotenv not installed; ignore */ }

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
