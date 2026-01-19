/**
 * PsychologistProfileView - Vista de perfil del psicólogo
 * Ruta: /perfil-psicologo
 */
class PsychologistProfileView {
    constructor() {
        this.mainContent = document.getElementById('mainContent');
        this.profile = this.loadProfile();
    }

    loadProfile() {
        const saved = localStorage.getItem('psychologist_profile');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error loading profile:', e);
            }
        }
        return {
            nombre: 'Dr. Psicólogo',
            especialidad: 'Psicología Clínica',
            cedula: '12345678',
            email: 'psicologo@example.com',
            telefono: '+57 300 123 4567',
            pin: '123456'
        };
    }

    saveProfile() {
        localStorage.setItem('psychologist_profile', JSON.stringify(this.profile));
    }

    async render() {
        this.mainContent.innerHTML = `
            <div class="patient-detail-header">
                <div class="patient-detail-title">
                    <div class="patient-avatar-large">
                        <span class="avatar-icon-large">👨‍⚕️</span>
                    </div>
                    <div>
                        <h1 class="patient-detail-name">${this.profile.nombre}</h1>
                        <p class="patient-detail-subtitle">${this.profile.especialidad}</p>
                    </div>
                </div>
                <button onclick="psychologistProfileView.editProfile()" class="create-session-btn">
                    <span>✏️</span>
                    <span>Editar Perfil</span>
                </button>
            </div>

            <div class="patient-detail-grid">
                <div class="card patient-info-card">
                    <div class="card-header-modern">
                        <h3>📋 Información Profesional</h3>
                    </div>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-icon">🎓</span>
                            <div class="info-content">
                                <span class="info-label">Especialidad</span>
                                <span class="info-value">${this.profile.especialidad}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <span class="info-icon">🎫</span>
                            <div class="info-content">
                                <span class="info-label">Cédula Profesional</span>
                                <span class="info-value">${this.profile.cedula}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <span class="info-icon">📧</span>
                            <div class="info-content">
                                <span class="info-label">Email</span>
                                <span class="info-value">${this.profile.email}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <span class="info-icon">📞</span>
                            <div class="info-content">
                                <span class="info-label">Teléfono</span>
                                <span class="info-value">${this.profile.telefono}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header-modern">
                        <h3>🔒 Seguridad</h3>
                    </div>
                    <div class="security-section">
                        <div class="security-item">
                            <div class="security-icon">🔑</div>
                            <div class="security-content">
                                <h4>PIN de Seguridad</h4>
                                <p>PIN actual configurado. Usado para autorizar acciones sensibles.</p>
                            </div>
                            <button class="security-btn" onclick="psychologistProfileView.changePin()">
                                <span>🔄</span>
                                <span>Cambiar PIN</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.updateActiveMenuItem('/perfil-psicologo');
    }

    async editProfile() {
        const form = `
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">👤</span><span>Nombre completo</span></label>
                <input name="nombre" value="${this.profile.nombre}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">🎓</span><span>Especialidad</span></label>
                <input name="especialidad" value="${this.profile.especialidad}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">🎫</span><span>Cédula Profesional</span></label>
                <input name="cedula" value="${this.profile.cedula}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📧</span><span>Email</span></label>
                <input name="email" type="email" value="${this.profile.email}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📞</span><span>Teléfono</span></label>
                <input name="telefono" value="${this.profile.telefono}" class="modern-input" required>
            </div>
        `;

        const data = await UIComponents.modalForm('Editar Perfil Profesional', form);
        if (!data) return;

        const pin = await UIComponents.modalPrompt('Ingrese su PIN para confirmar los cambios', '', { isPin: true });
        if (!pin) return;

        const okPin = await recordingManager.validatePin(pin);
        if (!okPin) {
            UIComponents.showAlert('PIN incorrecto', 'error');
            return;
        }

        Object.assign(this.profile, data);
        this.saveProfile();
        UIComponents.showAlert('✅ Perfil actualizado correctamente', 'success');
        this.render();
    }

    async changePin() {
        const currentPin = await UIComponents.modalPrompt('Ingrese su PIN actual', '', { isPin: true });
        if (!currentPin) return;

        const okPin = await recordingManager.validatePin(currentPin);
        if (!okPin) {
            UIComponents.showAlert('PIN incorrecto', 'error');
            return;
        }

        const newPin = await UIComponents.modalPrompt('Ingrese su nuevo PIN (6 dígitos)', '', { isPin: true });
        if (!newPin || newPin.length !== 6) {
            UIComponents.showAlert('PIN inválido', 'error');
            return;
        }

        const confirmPin = await UIComponents.modalPrompt('Confirme su nuevo PIN', '', { isPin: true });
        if (newPin !== confirmPin) {
            UIComponents.showAlert('Los PINs no coinciden', 'error');
            return;
        }

        this.profile.pin = newPin;
        this.saveProfile();
        UIComponents.showAlert('✅ PIN actualizado correctamente', 'success');
    }

    updateActiveMenuItem(route) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
    }
}

const psychologistProfileView = new PsychologistProfileView();
