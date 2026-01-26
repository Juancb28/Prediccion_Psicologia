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
        await UIComponents.openNewPatientModal();
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
