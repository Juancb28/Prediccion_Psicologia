const fs = require('fs');
const path = require('path');

const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '..', 'data.sqlite');
const dataFile = path.join(__dirname, '..', 'data.json');

function readData(){ try{ return JSON.parse(fs.readFileSync(dataFile,'utf8')); }catch(e){ return null; } }

(async function(){
    const data = readData() || {};
    const agenda = data.agenda || [];
    if (!agenda.length) { console.log('No agenda entries found in data.json'); process.exit(0); }

    const db = new sqlite3.Database(dbPath);
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS citas (
            id INTEGER PRIMARY KEY,
            paciente_id INTEGER,
            fecha TEXT,
            hora TEXT,
            estado TEXT,
            psicologo_id INTEGER,
            created_at TEXT
        )`);

        const insertStmt = db.prepare('INSERT INTO citas (paciente_id, fecha, hora, estado, psicologo_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        let imported = 0;
        for (const a of agenda) {
            try {
                const paciente_id = a.paciente_id || a.pacienteId || null;
                const fecha = a.fecha || a.date || null;
                const hora = a.hora || a.time || null;
                const estado = a.estado || a.status || 'pendiente';
                const psicologo_id = a.psicologo_id || a.psicologoId || null;
                const created_at = a.created_at || (new Date()).toISOString();
                insertStmt.run([paciente_id, fecha, hora, estado, psicologo_id, created_at]);
                imported++;
            } catch (e) { console.warn('failed to insert', a, e && e.message); }
        }
        insertStmt.finalize(() => {
            console.log('Imported', imported, 'agenda items into', dbPath);
            db.close();
        });
    });
})();
