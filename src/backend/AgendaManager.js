/**
 * AgendaManager - Gestión de agenda y citas
 */
class AgendaManager {
    constructor() {
        this.appointments = [];
        this.loadFromStorage();
    }

    /**
     * Obtener todas las citas
     */
    getAll() {
        return this.appointments;
    }

    /**
     * Obtener citas por fecha
     */
    getByDate(date) {
        return this.appointments.filter(a => a.fecha === date);
    }

    /**
     * Obtener citas por paciente
     */
    getByPatientId(patientId) {
        return this.appointments.filter(a => a.pacienteId === parseInt(patientId));
    }

    /**
     * Obtener citas por estado
     */
    getByStatus(estado) {
        return this.appointments.filter(a => a.estado === estado);
    }

    /**
     * Obtener citas de hoy
     */
    getToday() {
        const today = new Date().toISOString().slice(0, 10);
        return this.getByDate(today);
    }

    /**
     * Obtener citas de la semana actual
     */
    getThisWeek() {
        const today = new Date();
        const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        
        return this.appointments.filter(a => {
            const appointmentDate = new Date(a.fecha);
            return appointmentDate >= weekStart && appointmentDate < weekEnd;
        });
    }

    /**
     * Obtener citas del mes actual
     */
    getThisMonth() {
        const today = new Date();
        return this.appointments.filter(a => {
            const appointmentDate = new Date(a.fecha);
            return appointmentDate.getMonth() === today.getMonth() && 
                   appointmentDate.getFullYear() === today.getFullYear();
        });
    }

    /**
     * Crear una nueva cita
     */
    create(appointmentData) {
        const newAppointment = {
            pacienteId: parseInt(appointmentData.pacienteId),
            fecha: appointmentData.fecha,
            hora: appointmentData.hora,
            estado: appointmentData.estado || 'Pendiente',
            ...appointmentData
        };

        this.appointments.push(newAppointment);
        this.saveToStorage();
        return newAppointment;
    }

    /**
     * Actualizar una cita
     */
    update(index, appointmentData) {
        const appointment = this.appointments[index];
        if (!appointment) {
            throw new Error(`Cita en índice ${index} no encontrada`);
        }

        Object.assign(appointment, appointmentData);
        this.saveToStorage();
        return appointment;
    }

    /**
     * Cambiar estado de una cita
     */
    updateStatus(index, estado) {
        const appointment = this.appointments[index];
        if (!appointment) {
            throw new Error(`Cita en índice ${index} no encontrada`);
        }

        appointment.estado = estado;
        this.saveToStorage();
        return appointment;
    }

    /**
     * Eliminar una cita
     */
    delete(index) {
        if (index < 0 || index >= this.appointments.length) {
            throw new Error(`Índice de cita ${index} inválido`);
        }

        this.appointments.splice(index, 1);
        this.saveToStorage();
        return true;
    }

    /**
     * Obtener estadísticas
     */
    getStats() {
        return {
            total: this.appointments.length,
            pendientes: this.getByStatus('Pendiente').length,
            confirmadas: this.getByStatus('Confirmada').length,
            finalizadas: this.getByStatus('Finalizada').length,
            anuladas: this.getByStatus('Anulada').length,
            hoy: this.getToday().length,
            semana: this.getThisWeek().length,
            mes: this.getThisMonth().length
        };
    }

    /**
     * Guardar en localStorage
     */
    saveToStorage() {
        try {
            localStorage.setItem('pp_agenda', JSON.stringify(this.appointments));
        } catch (e) {
            console.error('Error saving agenda to storage:', e);
        }
    }

    /**
     * Cargar desde localStorage
     */
    loadFromStorage() {
        try {
            const data = localStorage.getItem('pp_agenda');
            if (data) {
                this.appointments = JSON.parse(data);
            } else {
                // Datos mock iniciales
                this.appointments = [
                    { fecha: "2025-11-19", hora: "10:00", pacienteId: 1, estado: 'Confirmada' },
                    { fecha: "2025-11-19", hora: "12:00", pacienteId: 2, estado: 'Pendiente' }
                ];
            }
        } catch (e) {
            console.error('Error loading agenda from storage:', e);
            this.appointments = [];
        }
    }
}

// Exportar instancia única
const agendaManager = new AgendaManager();
