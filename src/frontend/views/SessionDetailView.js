/**
 * SessionDetailView - Vista de detalle de una sesión
 * Ruta: /pacientes/:patientId/sesiones/:sessionIndex
 */
class SessionDetailView {
    constructor() {
        this.mainContent = document.getElementById('mainContent');
    }

    async render(patientId, sessionIndex) {
        const patient = patientManager.getById(patientId);
        const patientSessions = sessionManager.getByPatientId(patientId);
        const session = patientSessions[sessionIndex];

        if (!patient || !session) {
            UIComponents.showAlert('Sesión no encontrada', 'error');
            navigateTo('/pacientes');
            return;
        }

        this.mainContent.innerHTML = `
            <div style="padding: 24px;">
                <h1>Sesión: ${session.fecha}</h1>
                <h2>Paciente: ${patient.nombre}</h2>
                <div class="card">
                    <p><strong>Notas:</strong> ${session.notas}</p>
                    <p><strong>Enfoque:</strong> ${session.enfoque || 'No definido'}</p>
                    <p><strong>SOAP:</strong> ${session.soap ? JSON.stringify(session.soap) : 'No disponible'}</p>
                </div>
                <button onclick="navigateTo('/pacientes/${patientId}')" class="btn">← Volver al paciente</button>
            </div>
        `;

        this.updateActiveMenuItem('/sesiones');
    }

    updateActiveMenuItem(route) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            const href = item.getAttribute('data-href');
            if (href === route || route.startsWith('/pacientes')) {
                item.classList.add('active');
            }
        });
    }
}

const sessionDetailView = new SessionDetailView();
