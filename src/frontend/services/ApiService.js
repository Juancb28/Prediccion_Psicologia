/**
 * ApiService - Centraliza todas las llamadas al backend
 */
class ApiService {
    constructor() {
        this.baseURL = window.API_BASE_URL || 'http://localhost:3000';
    }

    /**
     * Realizar petición HTTP
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok && response.status !== 404) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Intentar parsear JSON, si falla devolver texto
            try {
                return await response.json();
            } catch (e) {
                return await response.text();
            }
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // ===== PACIENTES =====
    async getPacientes() {
        return this.request('/api/pacientes');
    }

    async getPaciente(id) {
        return this.request(`/api/pacientes/${id}`);
    }

    async createPaciente(data) {
        return this.request('/api/pacientes', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updatePaciente(id, data) {
        return this.request(`/api/pacientes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deletePaciente(id) {
        return this.request(`/api/pacientes/${id}`, {
            method: 'DELETE'
        });
    }

    // ===== SESIONES =====
    async getSesiones(patientId = null) {
        const endpoint = patientId ? `/api/sesiones?patientId=${patientId}` : '/api/sesiones';
        return this.request(endpoint);
    }

    async getSesion(id) {
        return this.request(`/api/sesiones/${id}`);
    }

    async createSesion(data) {
        return this.request('/api/sesiones', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateSesion(id, data) {
        return this.request(`/api/sesiones/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteSesion(id) {
        return this.request(`/api/sesiones/${id}`, {
            method: 'DELETE'
        });
    }

    // ===== AGENDA =====
    async getAgenda() {
        return this.request('/api/agenda');
    }

    async createCita(data) {
        return this.request('/api/agenda', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateCita(id, data) {
        return this.request(`/api/agenda/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteCita(id) {
        return this.request(`/api/agenda/${id}`, {
            method: 'DELETE'
        });
    }

    // ===== GRABACIONES =====
    async uploadRecording(formData) {
        return this.request('/api/upload-recording', {
            method: 'POST',
            headers: {}, // No establecer Content-Type para FormData
            body: formData
        });
    }

    async checkRecording(patientId, patientName, sessionIndex) {
        return this.request(`/api/recording/${patientId}?patientName=${encodeURIComponent(patientName)}&sessionIndex=${sessionIndex}`);
    }

    async deleteRecording(patientId, patientName, sessionIndex, pin) {
        return this.request('/api/delete-recording', {
            method: 'POST',
            body: JSON.stringify({ patientId, patientName, sessionIndex, pin })
        });
    }

    async transcribeRecording(patientId, patientName, sessionIndex) {
        return this.request('/api/transcribe-recording', {
            method: 'POST',
            body: JSON.stringify({ patientId, patientName, sessionIndex })
        });
    }

    async getProcessedTranscription(patientId, patientName, sessionIndex) {
        return this.request(`/api/processed/${patientId}?patientName=${encodeURIComponent(patientName)}&sessionIndex=${sessionIndex}`, {
            cache: 'no-store'
        });
    }

    // ===== GENOGRAMA =====
    async generateGenograma(patientId, transcription) {
        return this.request(`/api/genograma/${patientId}`, {
            method: 'POST',
            body: JSON.stringify({ transcription })
        });
    }

    // ===== PSICÓLOGO =====
    async validatePin(pin) {
        return this.request('/api/validate-pin', {
            method: 'POST',
            body: JSON.stringify({ pin })
        });
    }

    async saveVoiceSample(formData) {
        return this.request('/api/save-voice-sample', {
            method: 'POST',
            headers: {},
            body: formData
        });
    }

    // ===== ARCHIVOS =====
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        return this.request('/upload', {
            method: 'POST',
            headers: {},
            body: formData
        });
    }
}

// Exportar instancia única
const apiService = new ApiService();
