/**
 * UIComponents - Componentes reutilizables de interfaz
 */
class UIComponents {
    /**
     * Crear modal
     */
    static createModal(html) {
        const root = document.getElementById('modalRoot');
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `<div class="modal">${html}</div>`;
        
        backdrop.style.position = 'fixed';
        backdrop.style.inset = '0';
        backdrop.style.display = 'flex';
        backdrop.style.alignItems = 'center';
        backdrop.style.justifyContent = 'center';
        backdrop.style.padding = '24px';
        backdrop.style.boxSizing = 'border-box';
        backdrop.style.background = 'rgba(0,0,0,0.35)';
        backdrop.style.zIndex = '9999';
        backdrop.style.overflowX = 'hidden';
        
        const prevBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        
        root.appendChild(backdrop);
        
        const modalEl = backdrop.querySelector('.modal');
        if (modalEl) {
            modalEl.style.maxHeight = '92vh';
            modalEl.style.maxWidth = '1400px';
            modalEl.style.width = 'min(96vw, 1400px)';
            modalEl.style.minWidth = '560px';
            modalEl.style.minHeight = '320px';
            modalEl.style.overflow = 'auto';
            modalEl.style.boxSizing = 'border-box';
            modalEl.style.position = 'relative';
            modalEl.style.resize = 'none';
            modalEl.style.background = 'white';
            modalEl.style.borderRadius = '12px';
            modalEl.style.boxShadow = '0 12px 40px rgba(0,0,0,0.25)';
            modalEl.style.padding = '32px';
            modalEl.style.overflowX = 'hidden';
        }
        
        return {
            backdrop,
            close: () => {
                try { root.removeChild(backdrop); } catch (e) {}
                try { document.body.style.overflow = prevBodyOverflow; } catch (e) {}
            }
        };
    }

    /**
     * Modal de confirmación
     */
    static async modalConfirm(message) {
        return new Promise(resolve => {
            const m = this.createModal(`
                <h3>${message}</h3>
                <div class="actions">
                    <button class="btn ghost" id="_m_no">No</button>
                    <button class="btn primary" id="_m_yes">Sí</button>
                </div>
            `);
            m.backdrop.querySelector('#_m_no').onclick = () => { m.close(); resolve(false); };
            m.backdrop.querySelector('#_m_yes').onclick = () => { m.close(); resolve(true); };
        });
    }

    /**
     * Modal de prompt
     */
    static async modalPrompt(label, defaultValue = '', options = {}) {
        return new Promise(resolve => {
            let modalContent;
            
            if (options.isPin) {
                modalContent = `
                    <div class="pin-modal-container">
                        <h2 class="pin-title">Ingresa tu PIN</h2>
                        <p class="pin-subtitle">Introduce el código de 6 dígitos</p>
                        <div class="pin-input-container">
                            ${[0, 1, 2, 3, 4, 5].map(i => 
                                `<input type="text" maxlength="1" class="pin-digit" data-index="${i}" pattern="[0-9]" inputmode="numeric">`
                            ).join('')}
                        </div>
                        <div class="pin-actions">
                            <button class="btn ghost" id="_m_cancel">Cancelar</button>
                            <button class="btn primary pin-verify-btn" id="_m_ok">Verificar</button>
                        </div>
                    </div>
                `;
            } else {
                modalContent = `
                    <h3>${label}</h3>
                    <div class="row">
                        <input id="_m_input" type="text" value="${defaultValue}">
                    </div>
                    <div class="actions">
                        <button class="btn ghost" id="_m_cancel">Cancelar</button>
                        <button class="btn primary" id="_m_ok">Aceptar</button>
                    </div>
                `;
            }
            
            const m = this.createModal(modalContent);
            
            if (options.isPin) {
                const inputs = m.backdrop.querySelectorAll('.pin-digit');
                
                inputs.forEach((input, index) => {
                    input.addEventListener('input', (e) => {
                        const value = e.target.value;
                        if (!/^[0-9]$/.test(value) && value !== '') {
                            e.target.value = '';
                            return;
                        }
                        if (value && index < inputs.length - 1) {
                            inputs[index + 1].focus();
                        }
                    });
                    
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Backspace' && !e.target.value && index > 0) {
                            inputs[index - 1].focus();
                            inputs[index - 1].value = '';
                        }
                    });
                    
                    input.addEventListener('keypress', (e) => {
                        if (!/[0-9]/.test(e.key)) {
                            e.preventDefault();
                        }
                    });
                });
                
                const cancelBtn = m.backdrop.querySelector('#_m_cancel');
                if (cancelBtn) {
                    cancelBtn.onclick = () => { m.close(); resolve(null); };
                }
                
                m.backdrop.querySelector('#_m_ok').onclick = () => {
                    const pin = Array.from(inputs).map(input => input.value).join('');
                    if (pin.length === 6) {
                        m.close();
                        resolve(pin);
                    } else {
                        inputs.forEach(input => {
                            if (!input.value) {
                                input.style.borderColor = '#f44336';
                                setTimeout(() => { input.style.borderColor = ''; }, 1000);
                            }
                        });
                    }
                };
                
                setTimeout(() => inputs[0].focus(), 100);
            } else {
                const cancelBtn = m.backdrop.querySelector('#_m_cancel');
                if (cancelBtn) cancelBtn.onclick = () => { m.close(); resolve(null); };
                m.backdrop.querySelector('#_m_ok').onclick = () => {
                    const v = m.backdrop.querySelector('#_m_input').value;
                    m.close();
                    resolve(v);
                };
                setTimeout(() => {
                    const input = m.backdrop.querySelector('#_m_input');
                    if (input) input.focus();
                }, 50);
            }
        });
    }

    /**
     * Modal de formulario
     */
    static async modalForm(title, innerHtml) {
        return new Promise(resolve => {
            const m = this.createModal(`
                <div class="modern-modal-header">
                    <h3 class="modal-title">${title}</h3>
                </div>
                <div class="modern-modal-body">
                    ${innerHtml}
                </div>
                <div class="modern-modal-footer">
                    <button class="modern-btn cancel-btn" id="_m_cancel">
                        <span>Cancelar</span>
                    </button>
                    <button class="modern-btn save-btn" id="_m_save">
                        <span>💾</span>
                        <span>Guardar</span>
                    </button>
                </div>
            `);
            
            m.backdrop.querySelector('#_m_cancel').onclick = () => { m.close(); resolve(null); };
            m.backdrop.querySelector('#_m_save').onclick = () => {
                const inputs = Array.from(m.backdrop.querySelectorAll('input, textarea, select'));
                // Validación simple: campos con atributo 'required' no pueden estar vacíos
                for (const inp of inputs) {
                    if (inp.hasAttribute('required')) {
                        const v = (inp.value || '').toString().trim();
                        if (!v) {
                            // Mostrar tooltip junto al input y no cerrar el modal
                            UIComponents.showWarningTooltip(inp, 'Este campo es obligatorio.');
                            // Enfocar el input problemático
                            try { inp.focus(); } catch (e) {}
                            return; // no cerrar
                        } else {
                            UIComponents.removeWarningTooltip(inp);
                        }
                    }
                }

                const data = {};
                inputs.forEach(i => { if (i.name) data[i.name] = i.value; });
                m.close();
                resolve(data);
            };
        });
    }

    /**
     * Abre el modal para crear un nuevo paciente (diseño consistente)
     * - Crea el paciente usando `patientManager.create()` si existe (app modular)
     * - Si no existe `patientManager`, usa `mockPacientes` como fallback (app monolítica)
     * - Refresca la vista usando `pacientesView.render()` o `renderPacientes()` según lo disponible
     */
    static async openNewPatientModal() {
        const form = `
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">👤</span><span>Nombre completo</span></label>
                <input name="nombre" class="modern-input" required />
            </div>
            <div class="modern-form-row">
                <div class="modern-form-group">
                    <label class="modern-label"><span class="label-icon">🎂</span><span>Edad</span></label>
                    <input name="edad" type="number" class="modern-input" required />
                </div>
                <div class="modern-form-group">
                    <label class="modern-label"><span class="label-icon">📞</span><span>Contacto</span></label>
                    <input name="contacto" class="modern-input" required />
                </div>
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📍</span><span>Dirección</span></label>
                <input name="direccion" class="modern-input" required />
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📝</span><span>Motivo de consulta</span></label>
                <input name="motivo" class="modern-input" required />
            </div>
            <div class="modern-form-group">
                <label class="modern-label"><span class="label-icon">📚</span><span>Antecedentes</span></label>
                <textarea name="antecedentes" class="modern-input" rows="4"></textarea>
            </div>
        `;

        try {
            const data = await this.modalForm('Nuevo Paciente', form);
            if (!data) return null;

            // Normalize data
            const patientData = {
                nombre: (data.nombre || '').trim(),
                edad: data.edad ? parseInt(data.edad) : 0,
                motivo: data.motivo || '',
                contacto: data.contacto || '',
                direccion: data.direccion || '',
                antecedentes: data.antecedentes || ''
            };

            let created = null;

            // Preferir API/manager global si existe
            if (window.patientManager && typeof window.patientManager.create === 'function') {
                try {
                    created = window.patientManager.create(patientData);
                } catch (e) {
                    console.error('patientManager.create error', e);
                    // intentar fallback
                }
            }

            // Fallback a mock array (app.js)
            if (!created) {
                try {
                    if (!window.mockPacientes) window.mockPacientes = [];
                    const newId = window.mockPacientes.length ? (Math.max(...window.mockPacientes.map(p => p.id)) + 1) : 1;
                    created = Object.assign({ id: newId, consents: [], genogramaHtml: null }, patientData);
                    window.mockPacientes.push(created);
                } catch (e) {
                    console.error('mockPacientes fallback error', e);
                }
            }

            // Refrescar UI: preferir la vista modular
            try {
                if (window.pacientesView && typeof window.pacientesView.render === 'function') {
                    await window.pacientesView.render();
                } else if (typeof window.renderPacientes === 'function') {
                    window.renderPacientes();
                }
            } catch (e) {
                console.warn('Error refreshing patients view', e);
            }

            this.showAlert('✅ Paciente creado correctamente', 'success');
            return created;
        } catch (e) {
            console.error('openNewPatientModal error', e);
            this.showAlert('Error al crear paciente', 'error');
            return null;
        }
    }

    /**
     * Mostrar notificación/alerta
     */
    static showAlert(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
        `;
        
        document.body.appendChild(alert);
        
        setTimeout(() => {
            alert.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => document.body.removeChild(alert), 300);
        }, 3000);
    }

    /**
     * Crear tooltip de advertencia
     */
    static showWarningTooltip(element, message) {
        if (!element) return;
        
        this.removeWarningTooltip(element);
        
        const root = document.createElement('span');
        root.className = 'pp-warning-tooltip-root';
        root.style.position = 'relative';
        
        const parent = element.parentNode;
        if (!parent) return;
        
        parent.replaceChild(root, element);
        root.appendChild(element);
        
        const sentences = message.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || [];
        let formatted = '';
        
        if (sentences.length >= 2) {
            formatted = sentences.join('<br>');
        } else if (sentences.length === 1) {
            const words = sentences[0].split(/\s+/).filter(Boolean);
            if (words.length <= 8) {
                formatted = sentences[0];
            } else {
                const mid = Math.ceil(words.length / 2);
                const first = words.slice(0, mid).join(' ');
                const second = words.slice(mid).join(' ');
                formatted = first + '<br>' + second;
            }
        } else {
            formatted = message;
        }
        
        const tip = document.createElement('div');
        tip.className = 'pp-warning-tooltip';
        tip.setAttribute('role', 'alert');
        tip.innerHTML = `<div class="pp-warning-bubble">${formatted}</div>`;
        
        root.appendChild(tip);
        element.__ppWarningRoot = root;
    }

    /**
     * Remover tooltip de advertencia
     */
    static removeWarningTooltip(element) {
        try {
            const root = element && element.__ppWarningRoot;
            if (root && root.parentNode) {
                const parent = root.parentNode;
                parent.replaceChild(element, root);
                delete element.__ppWarningRoot;
            }
        } catch (e) {}
    }

    /**
     * Crear card de paciente
     */
    static createPatientCard(patient) {
        return `
            <div class="patient-card" data-id="${patient.id}">
                <div class="patient-card-header">
                    <div class="patient-avatar">
                        <span class="avatar-icon">👤</span>
                    </div>
                    <div class="patient-info">
                        <h3 class="patient-name">${patient.nombre}</h3>
                        <div class="patient-age">
                            <span class="age-icon">🎂</span>
                            <span>${patient.edad} años</span>
                        </div>
                    </div>
                </div>
                <div class="patient-card-body">
                    <div class="patient-reason">
                        <span class="reason-icon">📋</span>
                        <span class="reason-label">Motivo:</span>
                        <span class="reason-text">${patient.motivo}</span>
                    </div>
                </div>
                <div class="patient-card-footer">
                    <button class="patient-action-btn view-btn" onclick="navigateTo('/pacientes/${patient.id}')">
                        <span>👁️</span>
                        <span>Ver Detalles</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Crear item de sesión
     */
    static createSessionItem(session, sessionIndex, patient) {
        return `
            <div class="session-list-item">
                <div class="session-item-content" onclick="navigateTo('/pacientes/${patient.id}/sesiones/${sessionIndex}')">
                    <div class="session-date-badge">
                        <span class="date-icon">📅</span>
                        <span class="date-text">${session.fecha}</span>
                    </div>
                    <div class="session-notes">${session.notas}</div>
                    <span class="session-arrow">→</span>
                </div>
            </div>
        `;
    }

    /**
     * Crear item de cita
     */
    static createAppointmentItem(appointment, index, patient) {
        const statusClass = appointment.estado === 'Confirmada' ? 'confirmed' : 
                           appointment.estado === 'Pendiente' ? 'pending' : 
                           appointment.estado === 'Finalizada' ? 'finished' : 'cancelled';
        
        return `
            <div class="appointment-item ${statusClass}" onclick="editarCita(${index})">
                <div class="appointment-header">
                    <div class="appointment-datetime">
                        <span class="appointment-icon">🕐</span>
                        <span class="appointment-date">${appointment.fecha}</span>
                        <span class="appointment-time">${appointment.hora}</span>
                    </div>
                    <span class="appointment-status status-${statusClass}">${appointment.estado}</span>
                </div>
                <div class="appointment-patient">
                    <span class="patient-icon">👤</span>
                    <span class="patient-name">${patient?.nombre || '—'}</span>
                </div>
            </div>
        `;
    }
}

// Exportar clase
window.UIComponents = UIComponents;
