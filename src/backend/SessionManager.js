/**
 * SessionManager - Gestión de sesiones clínicas
 */
class SessionManager {
    constructor() {
        this.sessions = [];
        this.loadFromStorage();
    }

    /**
     * Obtener todas las sesiones
     */
    getAll() {
        return this.sessions;
    }

    /**
     * Obtener sesiones de un paciente
     */
    getByPatientId(patientId) {
        return this.sessions.filter(s => s.pacienteId === parseInt(patientId));
    }

    /**
     * Obtener una sesión por índice
     */
    getByIndex(index) {
        return this.sessions[index];
    }

    /**
     * Obtener el índice global de una sesión
     */
    getGlobalIndex(session) {
        return this.sessions.indexOf(session);
    }

    /**
     * Obtener el índice de sesión relativo al paciente
     */
    getPatientSessionIndex(patientId, globalIndex) {
        const patientSessions = this.sessions
            .slice(0, globalIndex)
            .filter(s => s.pacienteId === parseInt(patientId));
        return patientSessions.length;
    }

    /**
     * Crear una nueva sesión
     */
    create(sessionData) {
        const newSession = {
            pacienteId: parseInt(sessionData.pacienteId),
            fecha: sessionData.fecha || new Date().toISOString().slice(0, 10),
            notas: sessionData.notas || '',
            soap: null,
            attachments: [],
            grabacion: [],
            enfoque: '',
            analisis: '',
            resumen: '',
            planificacion: '',
            ...sessionData
        };

        this.sessions.push(newSession);
        this.saveToStorage();
        return newSession;
    }

    /**
     * Actualizar una sesión
     */
    update(index, sessionData) {
        const session = this.sessions[index];
        if (!session) {
            throw new Error(`Sesión en índice ${index} no encontrada`);
        }

        Object.assign(session, sessionData);
        this.saveToStorage();
        return session;
    }

    /**
     * Actualizar SOAP de una sesión
     */
    updateSOAP(index, soapData) {
        const session = this.sessions[index];
        if (!session) {
            throw new Error(`Sesión en índice ${index} no encontrada`);
        }

        if (!session.soap) {
            session.soap = {};
        }

        Object.assign(session.soap, soapData);
        this.saveToStorage();
        return session;
    }

    /**
     * Actualizar enfoque psicológico
     */
    updateEnfoque(index, enfoque) {
        const session = this.sessions[index];
        if (!session) {
            throw new Error(`Sesión en índice ${index} no encontrada`);
        }

        session.enfoque = enfoque;
        this.saveToStorage();
        return session;
    }

    /**
     * Actualizar análisis
     */
    updateAnalisis(index, analisis) {
        const session = this.sessions[index];
        if (!session) {
            throw new Error(`Sesión en índice ${index} no encontrada`);
        }

        session.analisis = analisis;
        this.saveToStorage();
        return session;
    }

    /**
     * Actualizar resumen
     */
    updateResumen(index, resumen) {
        const session = this.sessions[index];
        if (!session) {
            throw new Error(`Sesión en índice ${index} no encontrada`);
        }

        session.resumen = resumen;
        this.saveToStorage();
        return session;
    }

    /**
     * Actualizar planificación
     */
    updatePlanificacion(index, planificacion) {
        const session = this.sessions[index];
        if (!session) {
            throw new Error(`Sesión en índice ${index} no encontrada`);
        }

        session.planificacion = planificacion;
        this.saveToStorage();
        return session;
    }

    /**
     * Agregar adjunto a una sesión
     */
    addAttachment(index, attachment) {
        const session = this.sessions[index];
        if (!session) {
            throw new Error(`Sesión en índice ${index} no encontrada`);
        }

        if (!session.attachments) {
            session.attachments = [];
        }

        session.attachments.push(attachment);
        this.saveToStorage();
        return session;
    }

    /**
     * Eliminar una sesión
     */
    delete(index) {
        if (index < 0 || index >= this.sessions.length) {
            throw new Error(`Índice de sesión ${index} inválido`);
        }

        this.sessions.splice(index, 1);
        this.saveToStorage();
        return true;
    }

    /**
     * Guardar en localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('pp_sessions', JSON.stringify(this.sessions));
            console.log('[SessionManager] Sesiones guardadas:', this.sessions.length);
        } catch (e) {
            console.error('Error saving sessions to storage:', e);
        }
    }

    /**
     * Cargar desde localStorage
     */
    loadFromStorage() {
        try {
            const data = localStorage.getItem('pp_sessions');
            if (data) {
                this.sessions = JSON.parse(data);
            } else {
                // Datos mock iniciales
                this.sessions = [
                    { 
                        pacienteId: 1, 
                        fecha: "2025-10-11", 
                        notas: "Primera sesión, evaluación inicial.", 
                        soap: null,
                        attachments: [],
                        grabacion: [],
                        enfoque: '',
                        analisis: '',
                        resumen: '',
                        planificacion: ''
                    },
                    { 
                        pacienteId: 2, 
                        fecha: "2025-10-15", 
                        notas: "Plan de intervención inicial.", 
                        soap: null,
                        attachments: [],
                        grabacion: [],
                        enfoque: '',
                        analisis: '',
                        resumen: '',
                        planificacion: ''
                    }
                ];
            }
        } catch (e) {
            console.error('Error loading sessions from storage:', e);
            this.sessions = [];
        }
    }
}

// Exportar instancia única
const sessionManager = new SessionManager();
