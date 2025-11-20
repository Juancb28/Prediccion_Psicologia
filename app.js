// ---------------------
// VALORES MOCK (extendidos)
// ---------------------

const mockPacientes = [
    {
        id: 1,
        nombre: "Juan Pérez",
        edad: 32,
        motivo: "Ansiedad",
        contacto: "juan@example.com",
        direccion: "Calle Falsa 123",
        antecedentes: "No alergias. Antecedentes familiares de ansiedad.",
        consents: [],
        recordingPin: '1234'
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
        recordingPin: '0000'
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
        recordingPin: '9999'
    }
];

const mockAgenda = [
    { fecha: "2025-11-19", hora: "10:00", pacienteId: 1, estado: 'Confirmada' },
    { fecha: "2025-11-19", hora: "12:00", pacienteId: 2, estado: 'Pendiente' }
];

const mockSesiones = [
    { pacienteId: 1, fecha: "2025-10-11", notas: "Primera sesión, evaluación inicial.", soap: null },
    { pacienteId: 2, fecha: "2025-10-15", notas: "Plan de intervención inicial.", soap: null }
];

const mockReportes = [
    { titulo: "Reporte Mensual", descripcion: "Total de sesiones realizadas: 12" },
    { titulo: "Reporte por paciente", descripcion: "Juan Pérez: 4 sesiones" }
];

const mockGenograma = {
    familia: "Familia Pérez",
    miembros: ["Padre", "Madre", "Juan", "Hermana"]
};

let activePatientId = null;


// ---------------------
// MANEJO DE MÓDULOS
// ---------------------

const mainContent = document.getElementById("mainContent");
const menuItems = document.querySelectorAll(".menu-item");

// Cambiar módulo al hacer clic
menuItems.forEach(item => {
    item.addEventListener("click", () => {
        document.querySelector(".active").classList.remove("active");
        item.classList.add("active");

        const moduleName = item.getAttribute("data-module");
        loadModule(moduleName);
    });
});

// ---------------------
// RENDERIZADO DE MÓDULOS
// ---------------------

function loadModule(module) {
    switch (module) {
        case 'dashboard':
            renderDashboard();
            break;

        case 'pacientes':
            renderPacientes();
            break;

        case 'agenda':
            renderAgenda();
            break;

        case 'sesiones':
            renderSesiones();
            break;

        case 'reportes':
            mainContent.innerHTML = `
                <h1>Reportes</h1>
                <div class="card">
                    <h3>Resumen</h3>
                    ${mockReportes.map(r => `
                        <div class="patient-item">
                            <strong>${r.titulo}</strong><br>
                            ${r.descripcion}
                        </div>
                    `).join('')}
                </div>
            `;
            break;

        case 'genograma':
            mainContent.innerHTML = `
                <h1>Genograma</h1>
                <div class="card">
                    <h3>Familia: ${mockGenograma.familia}</h3>
                    Miembros:<br>
                    <ul>
                        ${mockGenograma.miembros.map(m => `<li>${m}</li>`).join('')}
                    </ul>
                </div>
            `;
            break;
    }
}

// Render functions
function renderDashboard() {
    const today = new Date().toISOString().slice(0,10);
    const citasHoy = mockAgenda.filter(a => a.fecha === today);

    mainContent.innerHTML = `
        <h1>Panel Principal</h1>
        <div class="dashboard-grid">
            <div class="card dashboard-calendar-card">
                <h3>📅 Calendario del Mes</h3>
                ${renderCalendarView()}
            </div>

            <div class="card">
                <h3>Próximas citas del día</h3>
                ${citasHoy.length ? citasHoy.map(c => {
                    const p = mockPacientes.find(x=>x.id===c.pacienteId);
                    return `<div class="patient-item"><strong>${c.hora}</strong> - ${p? p.nombre : '—'} <br><small>${c.estado}</small></div>`;
                }).join('') : '<div>No hay citas para hoy</div>'}
            </div>

            <div class="card">
                <h3>Alertas</h3>
                ${mockAgenda.some(a=>a.estado==='Pendiente') ? `<div class="alert">Tienes citas pendientes por confirmar.</div>` : '<div>No hay alertas</div>'}
            </div>

            <div class="card">
                <h3>Acceso rápido</h3>
                <div class="quick-actions">
                    <button onclick="quickRegisterSession()">Registrar sesión</button>
                    <button onclick="loadModule('pacientes')">Ver paciente</button>
                    <button onclick="quickCreateCita()">Crear cita</button>
                    <button onclick="loadModule('sesiones')">Historial clínico</button>
                </div>
            </div>

            <div class="card">
                <h3>Resumen</h3>
                <div>Total pacientes: ${mockPacientes.length}</div>
                <div>Total sesiones: ${mockSesiones.length}</div>
            </div>
        </div>
    `;
}

function renderPacientes() {
    mainContent.innerHTML = `
        <h1>Gestión de Pacientes</h1>
        <div class="card">
            <h3>Lista de Pacientes</h3>
            ${mockPacientes.map(p => `
                <div class="patient-item" data-id="${p.id}">
                    <strong>${p.nombre}</strong><br>
                    Edad: ${p.edad}<br>
                    Motivo: ${p.motivo}
                </div>
            `).join('')}
        </div>
    `;

    // add click handlers to open detail
    document.querySelectorAll('.patient-item').forEach(el=>{
        el.addEventListener('click', ()=>{
            const id = parseInt(el.getAttribute('data-id'));
            showPatient(id);
        });
    });
}

let agendaView = 'list';

function setAgendaView(v){ agendaView = v; renderAgenda(); }

function renderAgenda() {
    const controls = `<div class="agenda-controls"><button class="view-btn" onclick="setAgendaView('list')">Lista</button><button class="view-btn" onclick="setAgendaView('calendar')">Calendario</button><button class="view-btn" onclick="setAgendaView('week')">Semanal</button><button class="view-btn" onclick="setAgendaView('month')">Mensual</button><button class="view-btn" onclick="quickCreateCita()">Crear cita</button></div>`;
    let body = '';
    
    if(agendaView === 'calendar'){
        body = renderCalendarView();
    } else if(agendaView === 'list'){
        body = mockAgenda.map((e, idx) => `
            <div class="patient-item" onclick="editCita(${idx})">
                <strong>${e.fecha} ${e.hora}</strong><br>
                Paciente: ${mockPacientes.find(p=>p.id===e.pacienteId)?.nombre || '—'}<br>
                Estado: ${e.estado}
            </div>
        `).join('');
    } else if(agendaView === 'week'){
        // simple weekly grouping
        const today = new Date();
        const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);
        const items = mockAgenda.filter(a=> new Date(a.fecha) >= weekStart && new Date(a.fecha) < weekEnd);
        body = items.length ? items.map((e, idx)=>`<div class="patient-item" onclick="editCita(${mockAgenda.indexOf(e)})"><strong>${e.fecha} ${e.hora}</strong> - ${mockPacientes.find(p=>p.id===e.pacienteId)?.nombre || '—'}</div>`).join('') : '<div>No hay citas esta semana</div>';
    } else {
        // month view
        const today = new Date();
        const monthItems = mockAgenda.filter(a=>{ const d=new Date(a.fecha); return d.getMonth()===today.getMonth() && d.getFullYear()===today.getFullYear(); });
        body = monthItems.length ? monthItems.map((e)=>`<div class="patient-item" onclick="editCita(${mockAgenda.indexOf(e)})"><strong>${e.fecha} ${e.hora}</strong> - ${mockPacientes.find(p=>p.id===e.pacienteId)?.nombre || '—'}</div>`).join('') : '<div>No hay citas este mes</div>';
    }

    mainContent.innerHTML = `
        <h1>Agenda</h1>
        ${controls}
        <div class="card">
            <h3>Vista: ${agendaView === 'calendar' ? 'Calendario' : agendaView}</h3>
            ${body}
        </div>
    `;
}

function renderCalendarView() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Get first day of month and total days
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const totalDays = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    
    // Month names
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    // Build calendar header
    let html = `
        <div class="calendar-header">
            <h2>${monthNames[currentMonth]} ${currentYear}</h2>
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
    
    // Add empty cells for days before month starts
    for(let i = 0; i < startDayOfWeek; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }
    
    // Add days of month
    for(let day = 1; day <= totalDays; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayAppointments = mockAgenda.filter(a => a.fecha === dateStr);
        
        const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
        
        let appointmentsHtml = '';
        if(dayAppointments.length > 0) {
            appointmentsHtml = dayAppointments.map((apt, idx) => {
                const patient = mockPacientes.find(p => p.id === apt.pacienteId);
                const statusClass = apt.estado === 'Confirmada' ? 'confirmed' : apt.estado === 'Pendiente' ? 'pending' : apt.estado === 'Finalizada' ? 'finished' : 'cancelled';
                return `<div class="appointment-badge ${statusClass}" onclick="editCita(${mockAgenda.indexOf(apt)})" title="${patient?.nombre || '—'} - ${apt.hora}">
                    ${apt.hora} ${patient?.nombre?.split(' ')[0] || '?'}
                </div>`;
            }).join('');
        }
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${dayAppointments.length > 0 ? 'has-appointments' : ''}" onclick="quickCreateCitaForDate('${dateStr}')">
                <div class="day-number">${day}</div>
                <div class="appointments">
                    ${appointmentsHtml}
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
    return html;
}

async function quickCreateCitaForDate(dateStr) {
    const form = `
        <div class="row">
            <label>Paciente</label>
            <select name="pid">
                ${mockPacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
            </select>
        </div>
        <div class="row">
            <label>Fecha</label>
            <input name="fecha" type="date" value="${dateStr}">
        </div>
        <div class="row">
            <label>Hora</label>
            <input name="hora" type="time" value="09:00">
        </div>
        <div class="row">
            <label>Estado</label>
            <select name="estado">
                <option>Pendiente</option>
                <option>Confirmada</option>
                <option>Finalizada</option>
                <option>Anulada</option>
            </select>
        </div>
    `;
    
    const data = await modalForm('Nueva cita', form);
    if(!data) return;
    
    mockAgenda.push({
        pacienteId: parseInt(data.pid),
        fecha: data.fecha,
        hora: data.hora,
        estado: data.estado
    });
    
    await saveData();
    alert('Cita creada');
    renderAgenda();
}

async function editCita(index){
    const e = mockAgenda[index];
    if(!e) return alert('Cita no encontrada');
    const form = `<div class="row"><label>Paciente ID</label><input name="pid" value="${e.pacienteId}"></div><div class="row"><label>Fecha</label><input name="fecha" type="date" value="${e.fecha}"></div><div class="row"><label>Hora</label><input name="hora" type="time" value="${e.hora}"></div><div class="row"><label>Estado</label><select name="estado"><option ${e.estado==='Pendiente'?'selected':''}>Pendiente</option><option ${e.estado==='Confirmada'?'selected':''}>Confirmada</option><option ${e.estado==='Finalizada'?'selected':''}>Finalizada</option><option ${e.estado==='Anulada'?'selected':''}>Anulada</option></select></div>`;
    const data = await modalForm('Editar cita', form);
    if(!data) return;
    e.pacienteId = parseInt(data.pid);
    e.fecha = data.fecha;
    e.hora = data.hora;
    e.estado = data.estado;
    await saveData();
    alert('Cita actualizada');
    renderAgenda();
}

function renderSesiones() {
    mainContent.innerHTML = `
        <h1>Sesiones</h1>
        <div class="card">
            <h3>Lista de sesiones</h3>
            ${mockSesiones.map((s, idx) => `
                <div class="patient-item">
                    <strong>${mockPacientes.find(p=>p.id===s.pacienteId)?.nombre || '—'}</strong><br>
                    Fecha: ${s.fecha}<br>
                    Notas: ${s.notas}<br>
                    <button onclick="openSoapForm(${idx})">Editar SOAP</button>
                    <button onclick="uploadAttachment(${idx})">Adjuntos</button>
                    <button onclick="viewGenograma(${s.pacienteId})">Ver genograma</button>
                </div>
            `).join('')}
        </div>
        <div class="card">
            <h3>Crear / Iniciar sesión (demostración)</h3>
            <label>Paciente: <select id="sessionPatientSelect">${mockPacientes.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('')}</select></label>
            <div style="margin-top:10px;">
                <button onclick="startSessionPrompt()">Iniciar sesión</button>
            </div>
            <div id="sessionArea"></div>
        </div>
    `;
}

// Utilities
function getPatientById(id){ return mockPacientes.find(p=>p.id===id); }

// Toggle recording authorization
function toggleRecordingAuth(patientId, consentIndex){
    const p = getPatientById(patientId);
    if(!p || !p.consents[consentIndex]) return;
    
    const consent = p.consents[consentIndex];
    consent.grabacionAutorizada = !consent.grabacionAutorizada;
    
    saveData();
    showPatient(patientId);
}

// Modal helpers (return Promises)
function createModal(html){
    const root = document.getElementById('modalRoot');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal">${html}</div>`;
    root.appendChild(backdrop);
    return {
        backdrop,
        close: ()=>{ root.removeChild(backdrop); }
    };
}

function modalPrompt(label, defaultValue=''){
    return new Promise(resolve=>{
        const m = createModal(`<h3>${label}</h3><div class="row"><input id="_m_input" type="text" value="${defaultValue}"></div><div class="actions"><button class="btn ghost" id="_m_cancel">Cancelar</button><button class="btn primary" id="_m_ok">Aceptar</button></div>`);
        m.backdrop.querySelector('#_m_cancel').onclick = ()=>{ m.close(); resolve(null); };
        m.backdrop.querySelector('#_m_ok').onclick = ()=>{ const v = m.backdrop.querySelector('#_m_input').value; m.close(); resolve(v); };
        setTimeout(()=> m.backdrop.querySelector('#_m_input').focus(),50);
    });
}

function modalConfirm(message){
    return new Promise(resolve=>{
        const m = createModal(`<h3>${message}</h3><div class="actions"><button class="btn ghost" id="_m_no">No</button><button class="btn primary" id="_m_yes">Sí</button></div>`);
        m.backdrop.querySelector('#_m_no').onclick = ()=>{ m.close(); resolve(false); };
        m.backdrop.querySelector('#_m_yes').onclick = ()=>{ m.close(); resolve(true); };
    });
}

function modalForm(title, innerHtml){
    return new Promise(resolve=>{
        const m = createModal(`<h3>${title}</h3>${innerHtml}<div class="actions"><button class="btn ghost" id="_m_cancel">Cancelar</button><button class="btn primary" id="_m_save">Guardar</button></div>`);
        m.backdrop.querySelector('#_m_cancel').onclick = ()=>{ m.close(); resolve(null); };
        m.backdrop.querySelector('#_m_save').onclick = ()=>{
            const inputs = m.backdrop.querySelectorAll('input, textarea, select');
            const data = {};
            inputs.forEach(i=>{ if(i.name) data[i.name]=i.value; });
            m.close(); resolve(data);
        };
    });
}

// File upload helper (POST to /upload) — server must accept multipart/form-data
async function uploadFile(file){
    if(!file) return null;
    // Convert file to Data URL and store inline (localStorage-friendly)
    return new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onload = ()=>{
            resolve({ filename: file.name, url: reader.result });
        };
        reader.onerror = (e)=>{ console.warn('File read error', e); reject(e); };
        reader.readAsDataURL(file);
    });
}

// Persistence using localStorage
async function saveData(){
    const payload = { pacientes: mockPacientes, agenda: mockAgenda, sesiones: mockSesiones, reportes: mockReportes, genograma: mockGenograma };
    try{
        localStorage.setItem('pp_data', JSON.stringify(payload));
    }catch(e){ console.warn('No se pudo guardar en localStorage:', e); }
}

async function loadData(){
    try{
        const raw = localStorage.getItem('pp_data');
        if(!raw) return;
        const d = JSON.parse(raw);
        if(d.pacientes) { mockPacientes.length=0; d.pacientes.forEach(x=>mockPacientes.push(x)); }
        if(d.agenda) { mockAgenda.length=0; d.agenda.forEach(x=>mockAgenda.push(x)); }
        if(d.sesiones) { mockSesiones.length=0; d.sesiones.forEach(x=>mockSesiones.push(x)); }
        if(d.reportes) { mockReportes.length=0; d.reportes.forEach(x=>mockReportes.push(x)); }
        if(d.genograma) { Object.assign(mockGenograma, d.genograma); }
    }catch(e){ console.warn('No se pudo cargar data desde localStorage:', e); }
}

// SOAP form: open modal to edit SOAP for a session
async function openSoapForm(sessionIndex){
    const s = mockSesiones[sessionIndex];
    if(!s) return alert('Sesión no encontrada');
    const html = `
        <div class="row"><label>Subjetivo</label><textarea name="s">${s.soap?.s || ''}</textarea></div>
        <div class="row"><label>Objetivo</label><textarea name="o">${s.soap?.o || ''}</textarea></div>
        <div class="row"><label>Análisis</label><textarea name="a">${s.soap?.a || ''}</textarea></div>
        <div class="row"><label>Plan</label><textarea name="p">${s.soap?.p || ''}</textarea></div>
    `;
    const data = await modalForm('Formulario SOAP', html);
    if(!data) return;
    s.soap = { s: data.s || '', o: data.o || '', a: data.a || '', p: data.p || '' };
    await saveData();
    alert('SOAP guardado (mock)');
    loadModule('sesiones');
}

function showPatient(id) {
    const p = getPatientById(id);
    activePatientId = id;
    if(!p) return;

    mainContent.innerHTML = `
        <h1>${p.nombre}</h1>
        <div class="detail-row">
            <div class="card patient-meta">
                <h3>Ficha del paciente</h3>
                <div><strong>Edad:</strong> ${p.edad}</div>
                <div><strong>Motivo:</strong> ${p.motivo}</div>
                <div><strong>Contacto:</strong> ${p.contacto}</div>
                <div><strong>Dirección:</strong> ${p.direccion}</div>
                <div style="margin-top:8px;">
                    <button onclick="createNewSessionForPatient(${p.id})" class="btn primary">Crear nueva sesión</button>
                </div>
            </div>

            <div class="card" style="flex:1;">
                <h3>Historial</h3>
                <div><strong>Antecedentes:</strong><br>${p.antecedentes}</div>
                <h4 style="margin-top:12px;">Consentimiento</h4>
                <div id="consentList">
                    ${p.consents.length ? p.consents.map((c, idx)=>{
                        const hasFile = c.file ? true : false;
                        const authorized = c.grabacionAutorizada || false;
                        return `
                            <div class="consent-item" style="display:flex; align-items:center; justify-content:space-between; padding:10px; background:${hasFile ? '#e0f7fa' : '#f9f9f9'}; border-radius:8px; margin-bottom:8px; border-left:4px solid ${hasFile ? '#00bcd4' : '#ddd'};">
                                <div>
                                    📄 ${c.tipo} ${c.file?`(<a href="${c.file}" target="_blank" style="color:#00838f;">ver archivo</a>)`:''}
                                </div>
                                ${hasFile && authorized ? `
                                    <span style="font-size:12px; color:#00838f; font-weight:600; background:#b2ebf2; padding:6px 12px; border-radius:20px;">
                                        ✅ Autorizado para grabación
                                    </span>
                                ` : ''}
                            </div>
                        `;
                    }).join('') : '<div>No hay consentimiento cargado.</div>'}
                </div>
                <div style="margin-top:8px;">
                    ${p.consents.length === 0 ? `<button id="addConsentBtn">Agregar consentimiento</button>` : `<button id="editConsentBtn" style="background:#0097a7;">Editar consentimiento</button>`}
                </div>
            </div>
        </div>

        <div class="card">
            <h3>Sesiones del paciente</h3>
            ${mockSesiones.filter(s=>s.pacienteId===p.id).map((s)=>{
                const idx = mockSesiones.indexOf(s);
                return `<div class="patient-item" onclick="openSessionDetail(${idx}, ${p.id})" style="cursor:pointer;"><strong>${s.fecha}</strong><br>${s.notas}</div>`;
            }).join('')}
        </div>
    `;

    // add/edit consent upload handler
    const addBtn = document.getElementById('addConsentBtn');
    const editBtn = document.getElementById('editConsentBtn');
    
    const openConsentModal = (isEdit = false) => {
        const existingConsent = isEdit && p.consents.length > 0 ? p.consents[0] : null;
        
        const modalHtml = `
            <h3>${isEdit ? 'Editar' : 'Agregar'} consentimiento</h3>
            <div class="row">
                <input id="_consent_type" placeholder="Tipo de consentimiento" value="${existingConsent ? existingConsent.tipo : 'Consentimiento informado'}">
            </div>
            <div class="row">
                <label>Archivo:</label>
                <input id="_consent_file" type="file" accept=".pdf,.doc,.docx,.jpg,.png">
                ${existingConsent && existingConsent.file ? `<div style="margin-top:8px; font-size:12px; color:#666;">Archivo actual: <a href="${existingConsent.file}" target="_blank" style="color:#00838f;">ver archivo</a></div>` : ''}
            </div>
            <div id="_toggle_section" style="display:${existingConsent && existingConsent.file ? 'block' : 'none'}; margin-top:16px; padding:12px; background:#e0f7fa; border-radius:8px; border-left:4px solid #00bcd4;">
                <label class="toggle-container" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                    <span style="font-weight:500; color:#00838f;">Autoriza grabación de sesiones</span>
                    <div class="toggle-switch" id="_toggle_switch">
                        <span class="toggle-slider ${existingConsent && existingConsent.grabacionAutorizada ? 'active' : ''}" id="_toggle_slider"></span>
                    </div>
                </label>
            </div>
            <div class="actions">
                <button class="btn ghost" id="_c_cancel">Cancelar</button>
                <button class="btn primary" id="_c_save">${isEdit ? 'Actualizar' : 'Subir'}</button>
            </div>
        `;
        
        const modal = createModal(modalHtml);
        
        const fileInput = modal.backdrop.querySelector('#_consent_file');
        const toggleSection = modal.backdrop.querySelector('#_toggle_section');
        const toggleSwitch = modal.backdrop.querySelector('#_toggle_switch');
        const toggleSlider = modal.backdrop.querySelector('#_toggle_slider');
        let authRecording = existingConsent ? existingConsent.grabacionAutorizada : false;
        
        // Detectar cuando se carga archivo y activar toggle automáticamente
        fileInput.addEventListener('change', (e)=>{
            if(e.target.files && e.target.files[0]){
                toggleSection.style.display = 'block';
                // Activar automáticamente el toggle cuando se carga el archivo
                authRecording = true;
                toggleSlider.classList.add('active');
            } else if(!existingConsent || !existingConsent.file){
                toggleSection.style.display = 'none';
                authRecording = false;
                toggleSlider.classList.remove('active');
            }
        });
        
        // Toggle click handler
        toggleSwitch.addEventListener('click', ()=>{
            authRecording = !authRecording;
            if(authRecording){
                toggleSlider.classList.add('active');
            } else {
                toggleSlider.classList.remove('active');
            }
        });
        
        modal.backdrop.querySelector('#_c_cancel').onclick = ()=> modal.close();
        modal.backdrop.querySelector('#_c_save').onclick = async ()=>{
            const tipo = modal.backdrop.querySelector('#_consent_type')?.value || 'Consentimiento';
            let fileUrl = existingConsent ? existingConsent.file : null;
            
            if(fileInput && fileInput.files && fileInput.files[0]){
                const res = await uploadFile(fileInput.files[0]);
                if(res && res.url) fileUrl = res.url;
            }
            
            const newConsent = { 
                tipo: tipo, 
                file: fileUrl,
                grabacionAutorizada: fileUrl ? authRecording : false
            };
            
            if(isEdit){
                p.consents[0] = newConsent;
            } else {
                p.consents.push(newConsent);
            }
            
            await saveData();
            modal.close();
            showPatient(p.id);
        };
    };
    
    if(addBtn){
        addBtn.addEventListener('click', () => openConsentModal(false));
    }
    
    if(editBtn){
        editBtn.addEventListener('click', () => openConsentModal(true));
    }
}

// Quick actions
async function quickRegisterSession(){
    const pid = await modalPrompt('Ingresa ID del paciente para registrar sesión (ej: 1)');
    if(!pid) return;
    const paciente = getPatientById(parseInt(pid));
    if(!paciente){ alert('Paciente no encontrado'); return; }
    const notas = await modalPrompt('Notas breves de la sesión');
    mockSesiones.push({ pacienteId: paciente.id, fecha: new Date().toISOString().slice(0,10), notas: notas || 'Registro rápido', soap: null, attachments: [] });
    await saveData();
    alert('Sesión registrada (mock)');
    loadModule('dashboard');
}

async function quickCreateCita(){
    const form = `<div class="row"><input name="pid" placeholder="ID paciente (ej:1)"></div><div class="row"><input name="fecha" type="date"></div><div class="row"><input name="hora" type="time"></div>`;
    const data = await modalForm('Crear cita', form);
    if(!data) return;
    if(!data.pid || !data.fecha || !data.hora) return alert('Datos incompletos');
    mockAgenda.push({ fecha: data.fecha, hora: data.hora, pacienteId: parseInt(data.pid), estado: 'Pendiente' });
    await saveData();
    alert('Cita creada (mock)');
    loadModule('dashboard');
}

// Session / PIN logic for demo
async function promptStartSession(patientId){
    const p = getPatientById(patientId);
    if(!p) return;
    const want = await modalConfirm('¿Desea grabar la sesión? (Si acepta necesitará ingresar PIN)');
    if(!want){ alert('Sesión iniciada sin grabación (demo)'); return; }
    const pin = await modalPrompt('Ingrese PIN de consentimiento para grabación');
    if(pin === p.recordingPin){
        alert('PIN correcto. Grabación habilitada (demo).');
        const newSess = { pacienteId: p.id, fecha: new Date().toISOString().slice(0,10), notas: 'Sesión con grabación (mock)', soap: null, attachments: [] };
        mockSesiones.push(newSess);
        await saveData();
        showPatient(p.id);
    } else {
        alert('PIN incorrecto. No se habilita grabación.');
    }
}

function startSessionPrompt(){
    const sel = document.getElementById('sessionPatientSelect');
    const pid = parseInt(sel.value);
    promptStartSession(pid);
}

async function createNewSessionForPatient(patientId){
    const p = getPatientById(patientId);
    if(!p) return alert('Paciente no encontrado');
    
    // Verificar si hay consentimiento con grabación autorizada
    const hasAuthorizedRecording = p.consents.some(c => c.file && c.grabacionAutorizada);
    
    const form = `
        <div class="row">
            <label>Fecha</label>
            <input name="fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="row">
            <label>Notas iniciales</label>
            <textarea name="notas" placeholder="Notas de la sesión"></textarea>
        </div>
        ${hasAuthorizedRecording ? `
            <div class="row" style="margin-top:16px; padding:12px; background:linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%); border-radius:8px; border:2px solid #00bcd4;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" name="grabar" id="grabar_check" style="width:auto;" checked>
                    <span style="font-weight:600; color:#00838f;">🎥 Grabar esta sesión</span>
                </label>
                <small style="display:block; margin-top:8px; color:#00838f; font-weight:500;">✅ Paciente autorizado para grabación (consentimiento firmado)</small>
            </div>
        ` : `
            <div class="row" style="margin-top:16px; padding:12px; background:#fff3e0; border-radius:8px; border-left:4px solid #ff9800;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" name="grabar" id="grabar_check" style="width:auto;">
                    <span>🎥 Grabar esta sesión</span>
                </label>
                <div id="pin_section" style="display:none; margin-top:12px;">
                    <label>PIN de autorización</label>
                    <input name="pin" type="password" placeholder="Ingrese PIN del paciente" maxlength="4">
                    <small style="display:block; margin-top:4px; color:#666;">PIN requerido: ${p.recordingPin}</small>
                </div>
                <small style="display:block; margin-top:8px; color:#f57c00;">⚠️ No hay consentimiento firmado para grabación</small>
            </div>
        `}
    `;
    
    const modalHtml = `
        <h3>Crear nueva sesión - ${p.nombre}</h3>
        ${form}
        <div class="actions">
            <button class="btn ghost" id="_m_cancel">Cancelar</button>
            <button class="btn primary" id="_m_save">Crear sesión</button>
        </div>
    `;
    
    const modal = createModal(modalHtml);
    
    // Toggle PIN section (solo si no está autorizado)
    const grabarCheck = modal.backdrop.querySelector('#grabar_check');
    const pinSection = modal.backdrop.querySelector('#pin_section');
    
    if(pinSection && grabarCheck){
        grabarCheck.addEventListener('change', (e)=>{
            pinSection.style.display = e.target.checked ? 'block' : 'none';
        });
    }
    
    // Cancel handler
    modal.backdrop.querySelector('#_m_cancel').onclick = ()=>{
        modal.close();
    };
    
    // Save handler
    modal.backdrop.querySelector('#_m_save').onclick = async ()=>{
        const inputs = modal.backdrop.querySelectorAll('input, textarea');
        const data = {};
        inputs.forEach(i=>{ if(i.name && i.type !== 'checkbox') data[i.name]=i.value; });
        
        const grabar = modal.backdrop.querySelector('#grabar_check').checked;
        
        // Si hay autorización previa, no pedir PIN
        if(grabar && !hasAuthorizedRecording){
            const pin = data.pin;
            if(!pin){
                alert('⚠️ Debe ingresar el PIN para grabar la sesión');
                return;
            }
            if(pin !== p.recordingPin){
                alert('❌ PIN incorrecto. No se puede grabar la sesión.');
                return;
            }
        }
        
        const newSession = {
            pacienteId: p.id,
            fecha: data.fecha || new Date().toISOString().slice(0,10),
            notas: data.notas || 'Nueva sesión',
            soap: null,
            attachments: [],
            grabacion: grabar ? 'Habilitada' : 'No'
        };
        
        mockSesiones.push(newSession);
        await saveData();
        
        if(grabar){
            alert('✅ Sesión creada con grabación habilitada');
        } else {
            alert('✅ Sesión creada exitosamente');
        }
        
        modal.close();
        showPatient(p.id);
    };
}

async function openSessionDetail(sessionIndex, patientId){
    const s = mockSesiones[sessionIndex];
    const p = getPatientById(patientId);
    if(!s || !p) return alert('Sesión o paciente no encontrado');
    
    // Inicializar datos de sesión si no existen
    if(!s.enfoque) s.enfoque = '';
    if(!s.analisis) s.analisis = '';
    if(!s.planificacion) s.planificacion = '';
    
    const enfoques = [
        'Enfoque Psicoanalítico / Psicodinámico',
        'Enfoque Conductista / Análisis de la conducta',
        'Enfoque Cognitivo / Cognitivista',
        'Enfoque Humanista / Existencial',
        'Enfoque Gestalt',
        'Enfoque Biopsicológico / Neurociencia',
        'Enfoque Sociocultural / Cultural',
        'Enfoque Evolucionista / Psicología Evolutiva'
    ];
    
    const sessionDetailHtml = `
        <div style="max-height:70vh; overflow-y:auto; padding:20px;">
            <h2 style="color:#00838f; margin-bottom:8px;">Sesión: ${s.fecha}</h2>
            <p style="color:#666; margin-bottom:16px;"><strong>Paciente:</strong> ${p.nombre}</p>
            <p style="background:#e0f7fa; padding:12px; border-radius:8px; border-left:4px solid #00bcd4;"><strong>Notas:</strong> ${s.notas}</p>
            <hr style="margin:20px 0; border:none; border-top:2px solid #b2ebf2;">
            
            <!-- GENOGRAMA -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:24px;">📊</span> Genograma
                </h3>
                <div style="margin-top:12px; padding:16px; border:2px solid #b2ebf2; border-radius:12px; background:linear-gradient(135deg, #e0f7fa 0%, #f9f9f9 100%);">
                    <strong style="color:#00838f;">Familia:</strong> ${mockGenograma.familia}<br>
                    <strong style="color:#00838f; margin-top:8px; display:inline-block;">Miembros:</strong>
                    <ul style="margin-top:8px; padding-left:24px;">
                        ${mockGenograma.miembros.map(m => `<li style="margin:4px 0;">${m}</li>`).join('')}
                    </ul>
                    <div style="margin-top:16px; padding:20px; background:white; border-radius:8px; border:1px dashed #00bcd4;">
                        <p style="text-align:center; color:#666;"><em>📈 Diagrama visual del genograma</em></p>
                    </div>
                </div>
            </div>
            
            <!-- SOAP -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:24px;">📋</span> SOAP
                </h3>
                <div style="padding:16px; background:linear-gradient(135deg, #f0f0f0 0%, #fafafa 100%); border-radius:12px; border:2px solid #b2ebf2;">
                    <div style="margin-bottom:12px; padding:10px; background:white; border-radius:6px; border-left:3px solid #00bcd4;">
                        <strong style="color:#00838f;">Subjetivo:</strong> ${s.soap?.s || '<em style="color:#999;">(Sin datos)</em>'}
                    </div>
                    <div style="margin-bottom:12px; padding:10px; background:white; border-radius:6px; border-left:3px solid #0097a7;">
                        <strong style="color:#00838f;">Objetivo:</strong> ${s.soap?.o || '<em style="color:#999;">(Sin datos)</em>'}
                    </div>
                    <div style="margin-bottom:12px; padding:10px; background:white; border-radius:6px; border-left:3px solid #00838f;">
                        <strong style="color:#00838f;">Análisis:</strong> ${s.soap?.a || '<em style="color:#999;">(Sin datos)</em>'}
                    </div>
                    <div style="padding:10px; background:white; border-radius:6px; border-left:3px solid #006b7d;">
                        <strong style="color:#00838f;">Plan:</strong> ${s.soap?.p || '<em style="color:#999;">(Sin datos)</em>'}
                    </div>
                </div>
                <button onclick="openSoapForm(${sessionIndex})" class="btn primary" style="margin-top:12px;">Editar SOAP</button>
            </div>
            
            <!-- ENFOQUE -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:24px;">🎯</span> Enfoque Psicológico
                </h3>
                <select id="_enfoque_select" style="width:100%; padding:12px; border:2px solid #b2ebf2; border-radius:8px; font-size:14px; background:white; color:#333; transition:all 0.3s ease;">
                    <option value="">Seleccionar enfoque...</option>
                    ${enfoques.map(e => `<option value="${e}" ${s.enfoque === e ? 'selected' : ''}>${e}</option>`).join('')}
                </select>
            </div>
            
            <!-- ANÁLISIS -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:24px;">🔍</span> Análisis
                </h3>
                <textarea id="_analisis_text" style="width:100%; min-height:120px; padding:12px; border:2px solid #b2ebf2; border-radius:8px; font-family:'Segoe UI',Arial,sans-serif; font-size:14px; resize:vertical; transition:all 0.3s ease;" placeholder="Resultado del análisis basado en el enfoque seleccionado...">${s.analisis || ''}</textarea>
            </div>
            
            <!-- PLANIFICACIÓN -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:24px;">📝</span> Planificación
                </h3>
                <textarea id="_planificacion_text" style="width:100%; min-height:120px; padding:12px; border:2px solid #b2ebf2; border-radius:8px; font-family:'Segoe UI',Arial,sans-serif; font-size:14px; resize:vertical; transition:all 0.3s ease;" placeholder="Plan de intervención y próximos pasos...">${s.planificacion || ''}</textarea>
            </div>
        </div>
        
        <div class="actions" style="margin-top:16px; padding:0 20px 20px; display:flex; gap:8px;">
            <button class="btn primary" id="_session_save">💾 Guardar cambios</button>
            <button class="btn ghost" id="_session_close">✖️ Cerrar</button>
        </div>
    `;
    
    const modal = createModal(sessionDetailHtml);
    
    // Add focus styles
    const inputs = modal.backdrop.querySelectorAll('select, textarea');
    inputs.forEach(input => {
        input.addEventListener('focus', (e)=>{
            e.target.style.borderColor = '#00bcd4';
            e.target.style.boxShadow = '0 0 0 3px rgba(0, 188, 212, 0.1)';
        });
        input.addEventListener('blur', (e)=>{
            e.target.style.borderColor = '#b2ebf2';
            e.target.style.boxShadow = 'none';
        });
    });
    
    // Save handler
    modal.backdrop.querySelector('#_session_save').onclick = async ()=>{
        const enfoque = modal.backdrop.querySelector('#_enfoque_select').value;
        const analisis = modal.backdrop.querySelector('#_analisis_text').value;
        const planificacion = modal.backdrop.querySelector('#_planificacion_text').value;
        
        s.enfoque = enfoque;
        s.analisis = analisis;
        s.planificacion = planificacion;
        
        await saveData();
        alert('✅ Sesión actualizada correctamente');
        modal.close();
        showPatient(p.id);
    };
    
    modal.backdrop.querySelector('#_session_close').onclick = ()=> modal.close();
}

async function viewGenograma(patientId){
    const p = getPatientById(patientId);
    if(!p) return alert('Paciente no encontrado');
    
    const genogramaHtml = `
        <div style="padding:20px;">
            <h3>Genograma: ${mockGenograma.familia}</h3>
            <div style="margin-top:16px;">
                <strong>Miembros de la familia:</strong>
                <ul style="margin-top:8px;">
                    ${mockGenograma.miembros.map(m => `<li>${m}</li>`).join('')}
                </ul>
            </div>
            <div style="margin-top:16px;">
                <strong>Paciente:</strong> ${p.nombre}
            </div>
            <div style="margin-top:16px; padding:20px; border:2px solid #ddd; border-radius:8px; background:#f9f9f9;">
                <p><em>Aquí se mostraría el diagrama visual del genograma.</em></p>
                <p style="margin-top:8px;">Información familiar asociada al paciente ${p.nombre}.</p>
            </div>
        </div>
        <div class="actions" style="margin-top:16px;">
            <button class="btn primary" id="_gen_close">Cerrar</button>
        </div>
    `;
    
    const modal = createModal(genogramaHtml);
    modal.backdrop.querySelector('#_gen_close').onclick = ()=> modal.close();
}

async function uploadAttachment(sessionIndex){
    const s = mockSesiones[sessionIndex];
    if(!s) return alert('Sesión no encontrada');
    const modal = createModal(`<h3>Subir adjunto</h3><div class="row">Archivo: <input id="_att_file" type="file"></div><div class="actions"><button class="btn ghost" id="_a_cancel">Cancelar</button><button class="btn primary" id="_a_save">Subir</button></div>`);
    modal.backdrop.querySelector('#_a_cancel').onclick = ()=> modal.close();
    modal.backdrop.querySelector('#_a_save').onclick = async ()=>{
        const fileInput = modal.backdrop.querySelector('#_att_file');
        if(fileInput && fileInput.files && fileInput.files[0]){
            const res = await uploadFile(fileInput.files[0]);
            if(res && res.url){
                s.attachments = s.attachments || [];
                s.attachments.push(res.url);
                await saveData();
                alert('Adjunto subido');
            } else {
                alert('Fallo al subir archivo');
            }
        }
        modal.close();
        loadModule('sesiones');
    };
}

// Limpiar consentimientos múltiples al cargar (migración de datos)
function cleanupConsents() {
    mockPacientes.forEach(p => {
        if (p.consents && p.consents.length > 1) {
            // Mantener solo el último consentimiento con archivo
            const withFile = p.consents.find(c => c.file);
            p.consents = withFile ? [withFile] : [];
        }
    });
}

// Cargar módulo inicial (dashboard) — primero intentar cargar datos persistidos
loadData().then(()=>{ 
    cleanupConsents(); 
    saveData(); 
    loadModule('dashboard'); 
}).catch(()=>{ 
    cleanupConsents(); 
    loadModule('dashboard'); 
});
