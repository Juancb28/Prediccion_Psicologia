
// Simplified Mock of the System

class SessionManager {
    constructor() {
        this.sessions = [
            { pacienteId: 1, id: 'A' },
            { pacienteId: 2, id: 'B' }
        ];
    }

    getByPatientId(patientId) {
        return this.sessions.filter(s => s.pacienteId === parseInt(patientId));
    }

    create(sessionData) {
        this.sessions.push({
            pacienteId: parseInt(sessionData.pacienteId),
            id: 'NEW',
            ...sessionData
        });
    }
}

const sessionManager = new SessionManager();

// Simulate PatientDetailView logic
function renderPatientDetail(patientId) {
    console.log(`Rendering Patient ${patientId}`);
    const patientSessions = sessionManager.getByPatientId(patientId);
    console.log('Patient Sessions:', patientSessions);
    
    patientSessions.forEach((s, idx) => {
        console.log(`Rendered Session [${idx}]: Navigate to /pacientes/${patientId}/sesiones/${idx}`);
    });
}

// Simulate SessionDetailView logic
function renderSessionDetail(patientId, sessionIndex) {
    console.log(`Rendering Session Detail for Patient ${patientId}, Index ${sessionIndex}`);
    const patientSessions = sessionManager.getByPatientId(patientId);
    const session = patientSessions[sessionIndex];
    
    if (session) {
        console.log('SUCCESS: Session found:', session);
    } else {
        console.log('FAILURE: Session NOT found');
    }
}

// Scenario
console.log('--- Initial State ---');
renderPatientDetail(1);

console.log('\n--- Creating New Session for Patient 1 ---');
sessionManager.create({ pacienteId: 1, notes: 'New Session' });

console.log('\n--- After Creation ---');
renderPatientDetail(1);

// Simulate clicking the new session (which should be at the last index)
// Based on logs above, we will know the index.
// If patient 1 had 1 session (Index 0), new one should be Index 1.

console.log('\n--- Navigating to New Session (Index 1) ---');
renderSessionDetail(1, 1);
