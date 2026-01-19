/**
 * SessionsView - Vista de sesiones generales
 * Ruta: /sesiones
 */
class SessionsView {
    constructor() {
        this.mainContent = document.getElementById('mainContent');
    }

    async render() {
        const sessions = sessionManager.getAll();

        this.mainContent.innerHTML = `
            <h1>Sesiones</h1>
            <div class="card">
                <h3>Lista de sesiones</h3>
                ${sessions.map((s, idx) => {
                    const patient = patientManager.getById(s.pacienteId);
                    return `
                        <div class="session-item" onclick="navigateTo('/pacientes/${s.pacienteId}/sesiones/${sessionManager.getPatientSessionIndex(s.pacienteId, idx)}')">
                            <div class="session-header">
                                <div class="session-title">
                                    <span class="session-patient-name">${patient?.nombre || '—'}</span>
                                    <span class="session-date">📅 ${s.fecha}</span>
                                </div>
                                <div class="session-notes">${s.notas}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        this.updateActiveMenuItem('/sesiones');
    }

    updateActiveMenuItem(route) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            const href = item.getAttribute('data-href');
            if (href === route) item.classList.add('active');
        });
    }
}

const sessionsView = new SessionsView();
