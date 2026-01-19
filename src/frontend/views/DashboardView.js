/**
 * DashboardView - Vista del panel principal
 */
class DashboardView {
    constructor() {
        this.mainContent = document.getElementById('mainContent');
    }

    async render() {
        const today = new Date().toISOString().slice(0, 10);
        const appointments = agendaManager.getAll();
        const citasHoy = appointments.filter(a => a.fecha === today);
        const citasPendientes = agendaManager.getByStatus('Pendiente').length;
        const patients = patientManager.getAll();
        const sessions = sessionManager.getAll();

        this.mainContent.innerHTML = `
            <h1>Panel Principal</h1>
            <div class="dashboard-grid">
                <div class="card dashboard-calendar-card">
                    <div class="calendar-card-header">
                        <h3>📅 Calendario del Mes</h3>
                        <button class="calendar-today-btn" onclick="dashboardView.goToToday()">
                            <span>📅</span>
                            <span>Hoy</span>
                        </button>
                    </div>
                    ${this.renderCalendar()}
                </div>

                <div class="card dashboard-appointments-card">
                    <div class="dashboard-card-header">
                        <h3>🕐 Próximas citas del día</h3>
                        <span class="appointments-badge">${citasHoy.length}</span>
                    </div>
                    <div class="appointments-today-list">
                        ${citasHoy.length ? citasHoy.map(c => {
                            const p = patientManager.getById(c.pacienteId);
                            const statusClass = c.estado === 'Confirmada' ? 'confirmed' : 
                                               c.estado === 'Pendiente' ? 'pending' : 
                                               c.estado === 'Finalizada' ? 'finished' : 'cancelled';
                            return `
                                <div class="today-appointment-item ${statusClass}">
                                    <div class="appointment-time-badge">
                                        <span>🕐</span>
                                        <span>${c.hora}</span>
                                    </div>
                                    <div class="appointment-patient-info">
                                        <span class="patient-name-today">${p ? p.nombre : '—'}</span>
                                        <span class="appointment-status-mini status-${statusClass}">${c.estado}</span>
                                    </div>
                                </div>
                            `;
                        }).join('') : '<div class="empty-appointments">📭 No hay citas programadas para hoy</div>'}
                    </div>
                </div>

                <div class="card dashboard-alerts-card">
                    <div class="dashboard-card-header">
                        <h3>⚠️ Alertas</h3>
                        ${citasPendientes > 0 ? `<span class="alert-count">${citasPendientes}</span>` : ''}
                    </div>
                    <div class="alerts-list">
                        ${citasPendientes > 0 ? `
                            <div class="alert-item warning">
                                <div class="alert-icon">⚠️</div>
                                <div class="alert-content">
                                    <span class="alert-title">Citas pendientes</span>
                                    <span class="alert-text">Tienes ${citasPendientes} cita${citasPendientes > 1 ? 's' : ''} pendiente${citasPendientes > 1 ? 's' : ''} por confirmar</span>
                                </div>
                            </div>
                        ` : `
                            <div class="alert-item success">
                                <div class="alert-icon">✅</div>
                                <div class="alert-content">
                                    <span class="alert-title">Todo en orden</span>
                                    <span class="alert-text">No hay alertas pendientes</span>
                                </div>
                            </div>
                        `}
                    </div>
                </div>

                <div class="card dashboard-quick-actions-card">
                    <div class="dashboard-card-header">
                        <h3>⚡ Acceso rápido</h3>
                    </div>
                    <div class="quick-actions-grid">
                        <button class="quick-action-btn" onclick="navigateTo('/sesiones')">
                            <span class="action-icon">📝</span>
                            <span class="action-label">Registrar sesión</span>
                        </button>
                        <button class="quick-action-btn" onclick="navigateTo('/pacientes')">
                            <span class="action-icon">👥</span>
                            <span class="action-label">Ver pacientes</span>
                        </button>
                        <button class="quick-action-btn" onclick="dashboardView.quickCreateCita()">
                            <span class="action-icon">📅</span>
                            <span class="action-label">Crear cita</span>
                        </button>
                        <button class="quick-action-btn" onclick="navigateTo('/sesiones')">
                            <span class="action-icon">📋</span>
                            <span class="action-label">Historial clínico</span>
                        </button>
                    </div>
                </div>

                <div class="card dashboard-summary-card">
                    <div class="dashboard-card-header">
                        <h3>📊 Resumen</h3>
                    </div>
                    <div class="summary-stats">
                        <div class="stat-item">
                            <div class="stat-icon">👥</div>
                            <div class="stat-content">
                                <span class="stat-value">${patients.length}</span>
                                <span class="stat-label">Pacientes</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-icon">💼</div>
                            <div class="stat-content">
                                <span class="stat-value">${sessions.length}</span>
                                <span class="stat-label">Sesiones</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-icon">📅</div>
                            <div class="stat-content">
                                <span class="stat-value">${appointments.length}</span>
                                <span class="stat-label">Citas totales</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.updateActiveMenuItem('/dashboard');
    }

    renderCalendar() {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const totalDays = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();
        
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                           'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        
        let html = `
            <div class="calendar-header">
                <h2 class="calendar-month-title">${monthNames[month]} ${year}</h2>
            </div>
            <div class="calendar-grid">
                <div class="calendar-day-header">Dom</div>
                <div class="calendar-day-header">Lun</div>
                <div class="calendar-day-header">Mar</div>
                <div class="calendar-day-header">Mié</div>
                <div class="calendar-day-header">Jue</div>
                <div class="calendar-day-header">Vie</div>
                <div class="calendar-day-header">Sáb</div>
        `;
        
        for (let i = 0; i < startDayOfWeek; i++) {
            html += `<div class="calendar-day empty"></div>`;
        }
        
        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayAppointments = agendaManager.getByDate(dateStr);
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            
            html += `
                <div class="calendar-day ${isToday ? 'today' : ''} ${dayAppointments.length > 0 ? 'has-appointments' : ''}">
                    <div class="day-number">${day}</div>
                    <div class="appointments">
                        ${dayAppointments.slice(0, 2).map(apt => {
                            const patient = patientManager.getById(apt.pacienteId);
                            return `<div class="appointment-badge">${apt.hora} ${patient?.nombre?.split(' ')[0] || '?'}</div>`;
                        }).join('')}
                        ${dayAppointments.length > 2 ? `<div class="more-appointments">+${dayAppointments.length - 2}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        return html;
    }

    goToToday() {
        this.render();
    }

    async quickCreateCita() {
        const patients = patientManager.getAll();
        const form = `
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">👤</span>
                    <span>Paciente</span>
                </label>
                <select name="pacienteId" class="modern-select">
                    ${patients.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
                </select>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📅</span>
                    <span>Fecha</span>
                </label>
                <input name="fecha" type="date" value="${new Date().toISOString().slice(0, 10)}" class="modern-input">
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">🕐</span>
                    <span>Hora</span>
                </label>
                <input name="hora" type="time" value="09:00" class="modern-input">
            </div>
        `;
        
        const data = await UIComponents.modalForm('Nueva cita', form);
        if (!data) return;
        
        agendaManager.create({
            pacienteId: parseInt(data.pacienteId),
            fecha: data.fecha,
            hora: data.hora,
            estado: 'Pendiente'
        });
        
        UIComponents.showAlert('✅ Cita creada correctamente', 'success');
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
const dashboardView = new DashboardView();
