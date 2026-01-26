const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'data.sqlite'));

db.all('SELECT id, nombre FROM pacientes', [], (err, rows) => {
    if (err) { console.error('ERR', err); process.exit(2); }
    console.log('pacientes:');
    rows.forEach(r => console.log(r.id, '|', r.nombre));
    db.close();
});
