/**
 * AgendaView - Vista de agenda y citas
 * Ruta: /agenda
 */
class AgendaView {
    constructor() {
        this.mainContent = document.getElementById('mainContent');
    }

    async render() {
        const appointments = agendaManager.getAll();

        this.mainContent.innerHTML = `
            <h1>Agenda</h1>
            <div class="card">
                <div class="agenda-header">
                    <button class="view-btn" onclick="navigateTo('/agenda')">📋 Lista</button>
                    <button class="view-btn create-btn" onclick="agendaView.createCita()">➕ Crear cita</button>
                </div>
                <div class="appointments-list">
                    ${appointments.map((apt, idx) => {
                        const patient = patientManager.getById(apt.pacienteId);
                        return UIComponents.createAppointmentItem(apt, idx, patient);
                    }).join('')}
                </div>
            </div>
        `;

        this.updateActiveMenuItem('/agenda');
    }

    async createCita() {
        const patients = patientManager.getAll();
        const form = `
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">👤</span><span>Paciente</span></label>
                <select name="pacienteId" class="modern-select">
                    ${patients.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📅</span><span>Fecha</span></label>
                <input name="fecha" type="date" class="modern-input">
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">🕐</span><span>Hora</span></label>
                <input name="hora" type="time" class="modern-input">
            </div>
        `;

        const data = await UIComponents.modalForm('Nueva cita', form);
        if (!data) return;

        agendaManager.create(data);
        UIComponents.showAlert('✅ Cita creada', 'success');
        this.render();
    }

    updateActiveMenuItem(route) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            const href = item.getAttribute('data-href');
            if (href === route) item.classList.add('active');
        });
    }
}

const agendaView = new AgendaView();
