const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (the frontend)
app.use(express.static(path.join(__dirname)));

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

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
