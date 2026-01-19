/**
 * PacientesView - Vista de lista de pacientes
 */
class PacientesView {
    constructor() {
        this.mainContent = document.getElementById('mainContent');
    }

    async render() {
        const patients = patientManager.getAll();

        this.mainContent.innerHTML = `
            <div class="patients-header">
                <h1>Gestión de Pacientes</h1>
                <button class="add-patient-btn" onclick="pacientesView.addNewPatient()">
                    <span class="btn-icon">➕</span>
                    <span>Nuevo Paciente</span>
                </button>
            </div>
            <div class="card">
                <div class="patients-grid">
                    ${patients.map(p => UIComponents.createPatientCard(p)).join('')}
                </div>
            </div>
        `;

        this.updateActiveMenuItem('/pacientes');
    }

    async addNewPatient() {
        const form = `
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">👤</span>
                    <span>Nombre completo</span>
                </label>
                <input name="nombre" class="modern-input" required>
            </div>
            <div class="modern-form-row">
                <div class="modern-form-group">
                    <label class="modern-label">
                        <span class="label-icon">🎂</span>
                        <span>Edad</span>
                    </label>
                    <input name="edad" type="number" class="modern-input" required>
                </div>
                <div class="modern-form-group">
                    <label class="modern-label">
                        <span class="label-icon">📞</span>
                        <span>Contacto</span>
                    </label>
                    <input name="contacto" class="modern-input" required>
                </div>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📍</span>
                    <span>Dirección</span>
                </label>
                <input name="direccion" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📝</span>
                    <span>Motivo de consulta</span>
                </label>
                <input name="motivo" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📚</span>
                    <span>Antecedentes</span>
                </label>
                <textarea name="antecedentes" class="modern-input" rows="4"></textarea>
            </div>
        `;

        const data = await UIComponents.modalForm('Nuevo Paciente', form);
        if (!data) return;

        patientManager.create(data);
        UIComponents.showAlert('✅ Paciente creado correctamente', 'success');
        this.render();
    }

    updateActiveMenuItem(route) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            const href = item.getAttribute('data-href');
            if (href === route || (route.startsWith(href) && href !== '/')) {
                item.classList.add('active');
            }
        });
    }
}

// Instancia global
const pacientesView = new PacientesView();
