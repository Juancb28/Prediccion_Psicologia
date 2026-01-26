const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data.sqlite');
const fs = require('fs');

if (!fs.existsSync(dbPath)) {
    console.log('No database found at', dbPath); process.exit(0);
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Deleting all transcripciones...');
    db.run('DELETE FROM transcripciones', [], function(err){ if (err) console.error('Error deleting transcripciones', err); else console.log('Deleted transcripciones');
        console.log('Deleting all pacientes...');
        db.run('DELETE FROM pacientes', [], function(err2){ if (err2) console.error('Error deleting pacientes', err2); else console.log('Deleted pacientes');
            db.close();
        });
    });
});
