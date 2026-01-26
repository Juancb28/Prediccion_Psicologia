const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const idToDelete = process.argv[2];
if (!idToDelete) { console.error('Usage: node delete_paciente.js <id>'); process.exit(1); }
const dbPath = path.join(__dirname, '..', 'data.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    db.run('DELETE FROM transcripciones WHERE paciente_id = ?', [idToDelete], function(err){
        if (err) console.error('Error deleting transcripciones', err); else console.log('Deleted transcripciones for paciente', idToDelete);
        db.run('DELETE FROM pacientes WHERE id = ?', [idToDelete], function(err2){
            if (err2) console.error('Error deleting paciente', err2); else console.log('Deleted paciente id', idToDelete, 'changes:', this.changes);
            db.close();
        });
    });
});
