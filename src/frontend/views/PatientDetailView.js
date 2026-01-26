/**
 * PatientDetailView - Vista de detalle de un paciente
 * Ruta: /pacientes/:id
 */
class PatientDetailView {
    constructor() {
        this.mainContent = document.getElementById('mainContent');
    }

    async render(patientId) {
        const patient = patientManager.getById(patientId);
        if (!patient) {
            UIComponents.showAlert('Paciente no encontrado', 'error');
            navigateTo('/pacientes');
            return;
        }

        const patientSessions = sessionManager.getByPatientId(patientId);
        const hasAuthorizedRecording = patientManager.hasRecordingAuthorization(patientId);

        this.mainContent.innerHTML = `
            <div class="patient-detail-header">
                <div class="patient-detail-title">
                    <div class="patient-avatar-large">
                        <span class="avatar-icon-large">👤</span>
                    </div>
                    <div>
                        <h1 class="patient-detail-name">${patient.nombre}</h1>
                        <p class="patient-detail-subtitle">ID: ${patient.id} • Paciente activo</p>
                    </div>
                </div>
                <button onclick="patientDetailView.createNewSession(${patient.id})" class="create-session-btn">
                    <span>➕</span>
                    <span>Crear nueva sesión</span>
                </button>
            </div>

            <div class="patient-detail-grid">
                <div class="card patient-info-card">
                    <div class="card-header-modern">
                        <h3>📋 Ficha del paciente</h3>
                        <button class="edit-patient-btn" onclick="patientDetailView.editPatient(${patient.id})">
                            <span>✏️</span>
                            <span>Editar</span>
                        </button>
                    </div>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-icon">🎂</span>
                            <div class="info-content">
                                <span class="info-label">Edad</span>
                                <span class="info-value">${patient.edad} años</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <span class="info-icon">📝</span>
                            <div class="info-content">
                                <span class="info-label">Motivo</span>
                                <span class="info-value">${patient.motivo}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <span class="info-icon">📞</span>
                            <div class="info-content">
                                <span class="info-label">Contacto</span>
                                <span class="info-value">${patient.contacto}</span>
                            </div>
                        </div>
                        <div class="info-item">
                            <span class="info-icon">📍</span>
                            <div class="info-content">
                                <span class="info-label">Dirección</span>
                                <span class="info-value">${patient.direccion}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card genogram-card" id="genogramContainer">
                    <div class="card-header-modern">
                        <h3>🌳 Genograma Familiar</h3>
                        <div id="genogramHeaderActions">
                             <!-- Se cargará botón de generar si no existe -->
                        </div>
                    </div>
                    <div class="genogram-preview-container" id="genogramPreviewArea">
                        <div class="loading-genogram">
                            <p>Buscando genograma...</p>
                        </div>
                    </div>
                </div>

                <div class="card patient-history-card">
                    <div class="card-header-modern">
                        <h3>📚 Historial</h3>
                    </div>
                    <div class="history-section">
                        <div class="history-item">
                            <h4 class="history-subtitle">Antecedentes</h4>
                            <p class="history-text">${patient.antecedentes || 'Sin antecedentes registrados'}</p>
                        </div>
                        
                        <div class="history-item">
                            <h4 class="history-subtitle">Consentimiento</h4>
                            <div class="consent-list">
                                ${patient.consents && patient.consents.length ? patient.consents.map((c, idx) => `
                                    <div class="modern-consent-item ${c.file ? 'has-file' : ''}">
                                        <div class="consent-content">
                                            <span class="consent-icon">📄</span>
                                            <span class="consent-type">${c.tipo}</span>
                                            ${c.file ? `<a href="${c.file}" target="_blank" class="consent-link">ver archivo</a>` : ''}
                                        </div>
                                        ${c.file && c.grabacionAutorizada ? `
                                            <span class="consent-badge authorized">
                                                ✅ Autorizado para grabación
                                            </span>
                                        ` : ''}
                                    </div>
                                `).join('') : '<div class="empty-consent">No hay consentimiento cargado.</div>'}
                            </div>
                            <div class="consent-actions">
                                <button class="consent-btn add-btn" onclick="patientDetailView.manageConsent(${patient.id})">
                                    <span>${patient.consents && patient.consents.length ? '✏️' : '➕'}</span>
                                    <span>${patient.consents && patient.consents.length ? 'Editar' : 'Agregar'} consentimiento</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card sessions-card">
                <div class="card-header-modern">
                    <h3>💼 Sesiones del paciente</h3>
                    <span class="sessions-count">${patientSessions.length} sesiones</span>
                </div>
                <div class="sessions-list">
                    ${patientSessions.length ? patientSessions.map((s, idx) => {
            const globalIndex = sessionManager.getGlobalIndex(s);
            return `
                            <div class="session-list-item">
                                <div class="session-item-content" onclick="navigateTo('/pacientes/${patient.id}/sesiones/${idx}')">
                                    <div class="session-date-badge">
                                        <span class="date-icon">📅</span>
                                        <span class="date-text">${s.fecha}</span>
                                    </div>
                                    <div class="session-notes">${s.notas}</div>
                                    <span class="session-arrow">→</span>
                                </div>
                                <button class="delete-session-btn" onclick="event.stopPropagation(); patientDetailView.deleteSession(${globalIndex}, ${patient.id})">
                                    <span>🗑️</span>
                                </button>
                            </div>
                        `;
        }).join('') : '<div class="empty-sessions">No hay sesiones registradas</div>'}
                </div>
            </div>
        `;

        this.updateActiveMenuItem('/pacientes');
        this.checkExistingGenogram(patient);
    }

    async checkExistingGenogram(patient) {
        const previewArea = document.getElementById('genogramPreviewArea');
        const headerActions = document.getElementById('genogramHeaderActions');

        try {
            const response = await fetch(`/api/check-genogram/${patient.id_folder || patient.nombre.toLowerCase().replace(/ /g, '_')}`);
            const data = await response.json();

            if (data.ok && data.exists) {
                previewArea.innerHTML = `
                    <div class="genogram-frame-wrapper">
                        <iframe src="${data.path}" class="genogram-iframe-preview"></iframe>
                        <div class="genogram-overlay" onclick="patientDetailView.openGenogramFullscreen('${data.path}')">
                            <button class="expand-genogram-btn">Ampliar Genograma 🔍</button>
                        </div>
                    </div>
                `;
                headerActions.innerHTML = `
                    <button class="header-action-btn refresh" onclick="patientDetailView.generateGenogram(${patient.id}, true)">
                        <span>🔄</span> Actualizar
                    </button>
                `;
            } else {
                previewArea.innerHTML = `
                    <div class="empty-genogram">
                        <p>No se ha generado un genograma para este paciente.</p>
                        <button class="generate-now-btn" onclick="patientDetailView.generateGenogram(${patient.id})">
                            Generar ahora
                        </button>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error al buscar genograma:', error);
            previewArea.innerHTML = '<p class="error-text">Error al cargar genograma</p>';
        }
    }

    async generateGenogram(patientId, isUpdate = false) {
        const patient = patientManager.getById(patientId);
        UIComponents.showLoading(isUpdate ? 'Actualizando genogram...' : 'Generando genograma...');

        try {
            const response = await fetch('/api/generate-genogram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_id: patientId,
                    patient_folder: patient.id_folder || patient.nombre.toLowerCase().replace(/ /g, '_')
                })
            });

            const data = await response.json();
            UIComponents.hideLoading();

            if (data.ok) {
                UIComponents.showAlert('✅ Genograma generado exitosamente', 'success');
                this.checkExistingGenogram(patient);
            } else {
                UIComponents.showAlert('❌ Error: ' + (data.detail || data.error), 'error');
            }
        } catch (error) {
            UIComponents.hideLoading();
            UIComponents.showAlert('Error de conexión', 'error');
        }
    }

    openGenogramFullscreen(path) {
        window.open(path, '_blank');
    }

    async editPatient(patientId) {
        const patient = patientManager.getById(patientId);
        if (!patient) return;

        const form = `
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">👤</span><span>Nombre completo</span></label>
                <input name="nombre" value="${patient.nombre}" class="modern-input" required>
            </div>
            <div class="modern-form-row">
                <div class="modern-form-group">
                    <label class="modern-label"><span class="label-icon">🎂</span><span>Edad</span></label>
                    <input name="edad" type="number" value="${patient.edad}" class="modern-input" required>
                </div>
                <div class="modern-form-group">
                    <label class="modern-label"><span class="label-icon">📞</span><span>Contacto</span></label>
                    <input name="contacto" value="${patient.contacto}" class="modern-input" required>
                </div>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📍</span><span>Dirección</span></label>
                <input name="direccion" value="${patient.direccion}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📝</span><span>Motivo de consulta</span></label>
                <input name="motivo" value="${patient.motivo}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📚</span><span>Antecedentes</span></label>
                <textarea name="antecedentes" class="modern-input" rows="4" required>${patient.antecedentes}</textarea>
            </div>
        `;

        const data = await UIComponents.modalForm('Editar ficha del paciente', form);
        if (!data) return;

        const pin = await UIComponents.modalPrompt('Ingrese PIN del psicólogo para autorizar los cambios', '', { isPin: true });
        if (!pin) return;

        const okPin = await recordingManager.validatePin(pin);
        if (!okPin) {
            UIComponents.showAlert('PIN incorrecto', 'error');
            return;
        }

        patientManager.update(patientId, data);
        UIComponents.showAlert('✅ Información del paciente actualizada', 'success');
        this.render(patientId);
    }

    async manageConsent(patientId) {
        // Implementar gestión de consentimientos
        UIComponents.showAlert('Funcionalidad en desarrollo', 'info');
    }

    async createNewSession(patientId) {
        const patient = patientManager.getById(patientId);
        const hasAuth = patientManager.hasRecordingAuthorization(patientId);

        const form = `
            <div class="row">
                <label>Fecha</label>
                <input name="fecha" type="date" value="${new Date().toISOString().slice(0, 10)}">
            </div>
            <div class="row">
                <label>Notas iniciales</label>
                <textarea name="notas" placeholder="Notas de la sesión"></textarea>
            </div>
            ${hasAuth ? `
                <div class="row" style="background: linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%); padding: 12px; border-radius: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" name="grabar" checked style="width: auto;">
                        <span style="font-weight: 600;">🎥 Grabar esta sesión</span>
                    </label>
                    <small style="color: #00838f;">✅ Paciente autorizado para grabación</small>
                </div>
            ` : ''}
        `;

        const data = await UIComponents.modalForm(`Crear nueva sesión - ${patient.nombre}`, form);
        if (!data) return;

        sessionManager.create({
            pacienteId: patientId,
            fecha: data.fecha,
            notas: data.notas
        });

        UIComponents.showAlert('✅ Sesión creada exitosamente', 'success');
        this.render(patientId);
    }

    async deleteSession(globalIndex, patientId) {
        const confirm = await UIComponents.modalConfirm('¿Estás seguro de que deseas eliminar esta sesión?');
        if (!confirm) return;

        const pin = await UIComponents.modalPrompt('Ingrese PIN del psicólogo para autorizar la eliminación', '', { isPin: true });
        if (!pin) return;

        const okPin = await recordingManager.validatePin(pin);
        if (!okPin) {
            UIComponents.showAlert('PIN incorrecto', 'error');
            return;
        }

        sessionManager.delete(globalIndex);
        UIComponents.showAlert('✅ Sesión eliminada correctamente', 'success');
        this.render(patientId);
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
const patientDetailView = new PatientDetailView();
