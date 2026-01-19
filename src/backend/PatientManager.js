/**
 * PatientManager - Gestión de pacientes
 */
class PatientManager {
    constructor() {
        this.patients = [];
        this.loadFromStorage();
    }

    /**
     * Obtener todos los pacientes
     */
    getAll() {
        return this.patients;
    }

    /**
     * Obtener un paciente por ID
     */
    getById(id) {
        return this.patients.find(p => p.id === parseInt(id));
    }

    /**
     * Crear un nuevo paciente
     */
    create(patientData) {
        const newPatient = {
            id: this.generateId(),
            nombre: patientData.nombre || '',
            edad: parseInt(patientData.edad) || 0,
            motivo: patientData.motivo || '',
            contacto: patientData.contacto || '',
            direccion: patientData.direccion || '',
            antecedentes: patientData.antecedentes || '',
            consents: [],
            genogramaHtml: null,
            ...patientData
        };

        this.patients.push(newPatient);
        this.saveToStorage();
        return newPatient;
    }

    /**
     * Actualizar un paciente
     */
    update(id, patientData) {
        const patient = this.getById(id);
        if (!patient) {
            throw new Error(`Paciente con ID ${id} no encontrado`);
        }

        Object.assign(patient, patientData);
        this.saveToStorage();
        return patient;
    }

    /**
     * Eliminar un paciente
     */
    delete(id) {
        const index = this.patients.findIndex(p => p.id === parseInt(id));
        if (index === -1) {
            throw new Error(`Paciente con ID ${id} no encontrado`);
        }

        this.patients.splice(index, 1);
        this.saveToStorage();
        return true;
    }

    /**
     * Agregar consentimiento a un paciente
     */
    addConsent(patientId, consentData) {
        const patient = this.getById(patientId);
        if (!patient) {
            throw new Error(`Paciente con ID ${patientId} no encontrado`);
        }

        if (!patient.consents) {
            patient.consents = [];
        }

        patient.consents.push({
            tipo: consentData.tipo || 'Consentimiento informado',
            file: consentData.file || null,
            grabacionAutorizada: consentData.grabacionAutorizada || false,
            fecha: new Date().toISOString()
        });

        this.saveToStorage();
        return patient;
    }

    /**
     * Actualizar consentimiento
     */
    updateConsent(patientId, consentIndex, consentData) {
        const patient = this.getById(patientId);
        if (!patient || !patient.consents || !patient.consents[consentIndex]) {
            throw new Error('Consentimiento no encontrado');
        }

        Object.assign(patient.consents[consentIndex], consentData);
        this.saveToStorage();
        return patient;
    }

    /**
     * Verificar si un paciente tiene autorización para grabación
     */
    hasRecordingAuthorization(patientId) {
        const patient = this.getById(patientId);
        if (!patient || !patient.consents) {
            return false;
        }

        return patient.consents.some(c => c.file && c.grabacionAutorizada);
    }

    /**
     * Guardar genograma
     */
    saveGenogram(patientId, genogramaHtml) {
        const patient = this.getById(patientId);
        if (!patient) {
            throw new Error(`Paciente con ID ${patientId} no encontrado`);
        }

        patient.genogramaHtml = genogramaHtml;
        this.saveToStorage();
        return patient;
    }

    /**
     * Generar ID único
     */
    generateId() {
        if (this.patients.length === 0) {
            return 1;
        }
        return Math.max(...this.patients.map(p => p.id)) + 1;
    }

    /**
     * Guardar en localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('pp_patients', JSON.stringify(this.patients));
        } catch (e) {
            console.error('Error saving patients to storage:', e);
        }
    }

    /**
     * Cargar desde localStorage
     */
    loadFromStorage() {
        try {
            const data = localStorage.getItem('pp_patients');
            if (data) {
                this.patients = JSON.parse(data);
            } else {
                // Datos mock iniciales
                this.patients = [
                    {
                        id: 1,
                        nombre: "Juan Pérez",
                        edad: 32,
                        motivo: "Ansiedad",
                        contacto: "juan@example.com",
                        direccion: "Calle Falsa 123",
                        antecedentes: "No alergias. Antecedentes familiares de ansiedad.",
                        consents: [],
                        genogramaHtml: null
                    },
                    {
                        id: 2,
                        nombre: "María López",
                        edad: 27,
                        motivo: "Depresión",
                        contacto: "maria@example.com",
                        direccion: "Av. Siempreviva 742",
                        antecedentes: "Tratamiento previo con ISRS.",
                        consents: [],
                        genogramaHtml: null
                    },
                    {
                        id: 3,
                        nombre: "Carlos Ruiz",
                        edad: 45,
                        motivo: "Estrés laboral",
                        contacto: "carlos@example.com",
                        direccion: "Paseo del Prado 10",
                        antecedentes: "Hipertensión controlada.",
                        consents: [],
                        genogramaHtml: null
                    }
                ];
            }
        } catch (e) {
            console.error('Error loading patients from storage:', e);
            this.patients = [];
        }
    }
}

// Exportar instancia única
const patientManager = new PatientManager();
