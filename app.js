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
// Map to keep active polling intervals per patient while session view is open
const _pp_active_intervals = {};
// API base (backend server). Change `window.API_BASE_URL` to override in dev if needed.
const API_BASE = (window.API_BASE_URL || 'http://localhost:3000');
// Tooltip styles moved to `styles.css`

// Helper: extract a formatted transcription text from the server response.
// Prefer `text` if provided; otherwise, if `raw` is an array of segments,
// rebuild a human-readable block with speaker headings and timestamps.
function extractProcessedText(j){
    if(!j) return '';
    if(typeof j.text === 'string' && j.text.trim()){
        const rawText = j.text.trim();
        // If the server returned a full labeled .txt file (with header/footer),
        // extract only the speaker-labeled blocks and ignore headers, separators and summary.
        // Detect common markers used by the pipeline (e.g. 'TRANSCRIPCIÓN', 'RESUMEN', '=====')
        if(/TRANSCRIPCIÓN|TRANSCRIPCIÓN|RESUMEN|====+/i.test(rawText)){
            const lines = rawText.split(/\r?\n/);
            // Find the first line that looks like a speaker header (e.g. 'SPEAKER_00:' or 'UNKNOWN:')
            let start = -1;
            for(let i=0;i<lines.length;i++){
                if(/^\s*[A-Z0-9_]+:\s*$/.test(lines[i])){ start = i; break; }
            }
            if(start === -1){
                // fall back to returning full text if we can't find speaker blocks
                return rawText;
            }
            // Collect until we hit a separator line (====) or a RESUMEN section
            const outLines = [];
            for(let i=start;i<lines.length;i++){
                const L = lines[i];
                if(/^=+\s*$/.test(L)) break;
                if(/^\s*RESUMEN\b/i.test(L)) break;
                outLines.push(L);
            }
            // Trim leading/trailing blank lines
            while(outLines.length && outLines[0].trim()==='') outLines.shift();
            while(outLines.length && outLines[outLines.length-1].trim()==='') outLines.pop();
            return outLines.join('\n');
        }
        return rawText;
    }
    if(Array.isArray(j.raw) && j.raw.length){
        let out = '';
        let curSpeaker = null;
        for(const seg of j.raw){
            const speaker = (seg && seg.speaker) ? seg.speaker : 'UNKNOWN';
            if(speaker !== curSpeaker){
                if(curSpeaker !== null) out += '\n\n';
                out += speaker + ':\n';
                curSpeaker = speaker;
            }
            const start = (typeof seg.start === 'number') ? seg.start.toFixed(1) : (seg.start || '');
            const end = (typeof seg.end === 'number') ? seg.end.toFixed(1) : (seg.end || '');
            out += `[${start}s - ${end}s] ${seg.text || ''}\n`;
        }
        return out.trim();
    }
    return '';
}


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
    // Ensure no leftover tooltip on the dashboard start recording control (safe: don't access session-specific state here)
    setTimeout(()=>{
        try{
            const startBtnEl = document.getElementById('_start_recording_btn');
            if(startBtnEl){
                removeWarningTooltipForElement(startBtnEl);
            }
        }catch(e){ /* ignore */ }
    }, 0);
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
    // Ensure backdrop covers the viewport and centers the modal
    backdrop.style.position = 'fixed';
    backdrop.style.inset = '0';
    backdrop.style.display = 'flex';
    backdrop.style.alignItems = 'center';
    backdrop.style.justifyContent = 'center';
    backdrop.style.padding = '24px';
    backdrop.style.boxSizing = 'border-box';
    backdrop.style.background = 'rgba(0,0,0,0.35)';
    backdrop.style.zIndex = '9999';
    // Prevent horizontal scroll from appearing on the viewport while modal is open
    backdrop.style.overflowX = 'hidden';
    // Prevent page body from scrolling while modal is open
    const prevBodyOverflow = document.body.style.overflow;
    try{ document.body.style.overflow = 'hidden'; }catch(e){}
    root.appendChild(backdrop);
    // Ensure the inner modal is scrollable and contained
    try{
        const modalEl = backdrop.querySelector('.modal');
        if(modalEl){
            modalEl.style.maxHeight = '92vh';
            // Make modal wider by default and add horizontal padding
            modalEl.style.maxWidth = '1400px';
            modalEl.style.width = 'min(96vw, 1400px)';
            modalEl.style.minWidth = '560px';
            modalEl.style.minHeight = '320px';
            modalEl.style.overflow = 'auto';
            modalEl.style.boxSizing = 'border-box';
            modalEl.style.position = 'relative';
            // Disable user resize (fixed modal size as requested)
            modalEl.style.resize = 'none';
            modalEl.style.background = 'white';
            modalEl.style.borderRadius = modalEl.style.borderRadius || '12px';
            modalEl.style.boxShadow = modalEl.style.boxShadow || '0 12px 40px rgba(0,0,0,0.25)';
            // Add default padding to create space left/right and avoid overflow
            modalEl.style.padding = modalEl.style.padding || '32px';
            // Avoid horizontal overflow inside modal
            modalEl.style.overflowX = 'hidden';
        }
    }catch(e){ /* ignore */ }
    return {
        backdrop,
        close: ()=>{ 
            try{ root.removeChild(backdrop); }catch(e){}
            try{ document.body.style.overflow = prevBodyOverflow; }catch(e){}
        }
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

// Convert an audio Blob (browser webm/ogg) to a WAV Blob (PCM16) using OfflineAudioContext
async function blobToWavBlob(blob){
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100 * 40, 44100);
    const decoded = await new Promise((resolve, reject)=>{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.decodeAudioData(arrayBuffer, res=>{ resolve(res); }, err=>{ reject(err); });
    });

    // render into offline context
    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = decoded;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start(0);
    const rendered = await offlineCtx.startRendering();

    // interleave and convert to 16-bit PCM
    const channelData = [];
    for(let i=0;i<rendered.numberOfChannels;i++) channelData.push(rendered.getChannelData(i));
    const length = rendered.length * rendered.numberOfChannels;
    const interleaved = new Float32Array(rendered.length * rendered.numberOfChannels);
    // simple interleave
    if(rendered.numberOfChannels === 1){
        interleaved.set(channelData[0]);
    } else {
        let idx = 0;
        for(let i=0;i<rendered.length;i++){
            for(let ch=0; ch<rendered.numberOfChannels; ch++){
                interleaved[idx++] = channelData[ch][i];
            }
        }
    }

    // convert float32 to 16-bit PCM
    const wavBuffer = new ArrayBuffer(44 + interleaved.length * 2);
    const view = new DataView(wavBuffer);
    function writeString(view, offset, string){ for(let i=0;i<string.length;i++){ view.setUint8(offset + i, string.charCodeAt(i)); } }
    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + interleaved.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1Size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, rendered.numberOfChannels, true);
    view.setUint32(24, rendered.sampleRate, true);
    view.setUint32(28, rendered.sampleRate * rendered.numberOfChannels * 2, true);
    view.setUint16(32, rendered.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, interleaved.length * 2, true);

    // write PCM samples
    let offset = 44;
    for(let i=0;i<interleaved.length;i++){
        let s = Math.max(-1, Math.min(1, interleaved[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}

// Delete recording for a patient (asks for psychologist PIN via modalPrompt)
async function deleteRecording(patientId, sessionIndex){
    const pin = await modalPrompt('Ingrese PIN del psicólogo para eliminar la grabación');
    if(!pin) return alert('Operación cancelada');
    try{
        const resp = await fetch(API_BASE + '/api/delete-recording', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ patientId, pin }) });
        let j = null;
        if(resp.ok){ try{ j = await resp.json(); }catch(e){ j = null; } }
        if(!resp.ok) {
            // If server says recording not found, attempt to delete by filename parsed from local reference
            if(resp.status === 404){
                const ps = mockSesiones.find(s=>s.pacienteId===patientId);
                // Try to extract alternate id from the stored audio path (e.g. '/recordings/patient_unknown.wav')
                if(ps && ps.grabacion && ps.grabacion.length>0){
                    const audioRef = ps.grabacion[0].audio || '';
                    try{
                        const fname = (typeof audioRef === 'string') ? audioRef.split('/').pop() : null;
                        if(fname && fname.startsWith('patient_') && fname.endsWith('.wav')){
                            const altId = fname.slice('patient_'.length, -'.wav'.length);
                            // Attempt to delete using altId
                            const altResp = await fetch(API_BASE + '/api/delete-recording', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ patientId: altId, pin }) });
                            if(altResp.ok){
                                // deleted the actual file
                                ps.grabacion = [];
                                await saveData();
                                // If in session detail view, refresh completely; otherwise navigate to patient view
                                if(sessionIndex !== undefined){
                                    openSessionDetail(sessionIndex, patientId);
                                } else if(activePatientId === patientId) {
                                    showPatient(patientId);
                                }
                                return alert('✅ Grabación eliminada (archivo encontrado por nombre alternativo).');
                            }
                        }
                    }catch(e){ /* ignore parsing errors */ }

                }
                // fallback: remove local reference to keep UI consistent
                if(ps && ps.grabacion){ ps.grabacion = []; await saveData(); }
                // If in session detail view, refresh completely; otherwise navigate to patient view
                if(sessionIndex !== undefined){
                    openSessionDetail(sessionIndex, patientId);
                } else if(activePatientId === patientId) {
                    showPatient(patientId);
                }
                return alert('Grabación no encontrada en el servidor. Referencia local eliminada.');
            }
            let body = null;
            try{ body = await resp.text(); }catch(e){}
            return alert('Error al eliminar: ' + (body || resp.status));
        }
        // Remove local reference if present
        const ps = mockSesiones.find(s=>s.pacienteId===patientId);
        if(ps && ps.grabacion){ ps.grabacion = []; await saveData(); }
        alert('✅ Grabación eliminada');
        // Refresh view if open: if in session detail view, refresh completely; otherwise navigate to patient view
        if(sessionIndex !== undefined){
            // Refresh the entire session view to clear all warnings
            openSessionDetail(sessionIndex, patientId);
        } else if(activePatientId === patientId) {
            showPatient(patientId);
        }
    }catch(e){ console.error('Delete recording error', e); alert('Error al eliminar: ' + e.message); }
}

// Validate psychologist PIN via server
async function validatePsyPin(pin){
    if(!pin) return false;
    try{
        const resp = await fetch(API_BASE + '/api/validate-pin', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ pin }) });
        if(!resp.ok) return false;
        const j = await resp.json();
        return j && j.ok === true;
    }catch(e){ console.error('validatePsyPin error', e); return false; }
}

// Build the inner HTML for the grabaciones section for a session
function buildGrabacionesHTML(s, p, sessionIndex){
    if(!s || !p) return '';
    
    return `
        <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
            <span style="font-size:24px;">🎤</span> Grabaciones
        </h3>
        ${!s.grabacion || s.grabacion.length === 0 ? `
            <div style="padding:20px; background:white; border:2px dashed #b2ebf2; border-radius:8px; text-align:center;">
                <p style="margin:0; color:#999; font-style:italic;">🎙️ Sin grabaciones aún</p>
                <p style="margin:8px 0 0 0; color:#bbb; font-size:13px;">Use el botón "Iniciar grabación" para crear una nueva grabación</p>
            </div>
        ` : `
            <div style="display:flex; flex-direction:column; gap:12px;">
                ${s.grabacion.map((grab, idx) => `
                    <div style="padding:12px; background:white; border-radius:8px; border:2px solid #b2ebf2; display:flex; align-items:center; gap:12px;">
                        <span style="font-size:24px;">🎵</span>
                        <div style="flex:1;">
                            <div style="font-weight:600; color:#00838f;">Grabación ${idx + 1}</div>
                            <div style="font-size:12px; color:#666;">
                                ${new Date(grab.fecha).toLocaleString('es-ES')} • ${grab.duracion ? grab.duracion + 's' : 'Duración no disponible'}
                            </div>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            ${(() => {
                                const isProcessing = grab && grab.processing;
                                if(isProcessing){
                                    return `
                                                <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start;">
                                                    <button class="btn" disabled style="background:linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color:white; opacity:0.85; cursor:default;">⏳ Procesando...</button>
                                                </div>
                                            `;
                                } else {
                                    return `<button class="btn" id="_view_trans_btn_${p.id}" onclick="openTranscriptionModal(${sessionIndex}, ${p.id})" style="background:linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color:white;">📝 Ver transcripción</button>`;
                                }
                            })()}
                            <audio controls src="${(typeof grab.audio === 'string' && grab.audio.startsWith('/')) ? (API_BASE + grab.audio) : grab.audio}" style="max-width:300px;"></audio>
                            <button class="btn ghost" onclick="deleteRecording(${p.id}, ${sessionIndex})" title="Eliminar grabación (requiere PIN)">Eliminar</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
    `;
}

// Polling for server-processed outputs has been removed.
// The frontend no longer queries `/api/processed/:patientId`.
// Server-side processing may still run, but the UI will not poll for results.

// Update the grabaciones container and attach audio handlers (no navigation)
function refreshGrabacionesUI(s, p, sessionIndex){
    const container = document.getElementById('_grabaciones_container');
    if(container){
        container.innerHTML = buildGrabacionesHTML(s, p, sessionIndex);
            // Safety fallback: if the UI shows a disabled "Procesando..." button
            // ensure there's an active poll for processed output. This covers
            // cases where openSessionDetail didn't start the interval (state mismatch)
            // and guarantees the UI will update when the server has finished.
            try{
                const procBtn = container.querySelector('button[disabled]');
                const rec = s.grabacion && s.grabacion[0];
                if(procBtn && p && p.id && rec && rec.remote && rec.processing){
                    if(!(_pp_active_intervals[p.id] && _pp_active_intervals[p.id].timer)){
                        const maxAttempts = 40;
                        const delayMs = 3000;
                        let attempts = 0;
                        const timer = setInterval(async ()=>{
                            attempts++;
                            try{
                                console.debug('[debug] safety polling attempt', attempts, 'for', p.id);
                                const resp = await fetch(API_BASE + '/api/processed/' + p.id, { cache: 'no-store' });
                                console.debug('[debug] safety polling status=', resp && resp.status);
                                if(resp && resp.ok){
                                    const j = await resp.json();
                                    if(j && (j.stage === 'labeled' || j.stage === 'done' || j.text)){
                                        const txt = j.text || j.transcription_text || '';
                                        if(!s.grabacion) s.grabacion = [{}];
                                        if(txt) s.grabacion[0].transcripcion = txt;
                                        s.grabacion[0].processing = false;
                                        try{ await saveData(); }catch(e){}
                                        try{ refreshGrabacionesUI(s, p, sessionIndex); }catch(e){}
                                        try{ clearInterval(timer); }catch(e){}
                                        try{ delete _pp_active_intervals[p.id]; }catch(e){}
                                        return;
                                    }
                                }
                            }catch(e){ console.warn('safety polling fetch error', e); }
                            if(attempts >= maxAttempts){
                                try{ clearInterval(timer); }catch(e){}
                                try{ delete _pp_active_intervals[p.id]; }catch(e){}
                            }
                        }, delayMs);
                        _pp_active_intervals[p.id] = { timer, attempts: 0 };
                    }
                }
            }catch(e){ /* ignore safety-poll errors */ }
        // Attach logging and error handlers to the audio element(s)
        try{
            const audios = container.querySelectorAll('audio');
            audios.forEach(aud => {
                // Attach a loadedmetadata handler
                aud.addEventListener('loadedmetadata', ()=>{
                    console.log('Audio metadata loaded:', aud.src, 'duration=', aud.duration);
                });

                // If metadata not available yet (duration 0), proactively try fetch+blob to ensure browser can decode
                (async ()=>{
                    try{
                        // small delay to allow browser to attempt loading first
                        await new Promise(r=>setTimeout(r,100));
                        if(!isFinite(aud.duration) || aud.duration === 0){
                            // only fetch if src is remote or server path
                            const src = aud.getAttribute('src') || aud.src;
                            if(src){
                                try{
                                    const resp = await fetch(src, { cache: 'no-store' });
                                    if(resp.ok){
                                        const blob = await resp.blob();
                                        const objUrl = URL.createObjectURL(blob);
                                        aud.src = objUrl;
                                        try{ aud.load(); }catch(e){}
                                        console.log('Proactive fetch fallback set for audio', src);
                                    }
                                }catch(fe){ /* ignore fetch errors here */ }
                            }
                        }
                    }catch(e){ /* ignore */ }
                })();
                aud.addEventListener('error', async (ev) => {
                    console.error('Audio playback error for', aud.src, ev);
                    // Try a fetch -> blob fallback and set object URL (works around some server mime/CORS issues)
                    try{
                        const resp = await fetch(aud.src);
                        if(resp.ok){
                            const blob = await resp.blob();
                            const objUrl = URL.createObjectURL(blob);
                            aud.src = objUrl;
                            try{ aud.load(); }catch(e){}
                            console.log('Replaced audio src with object URL fallback for', aud.src);
                        } else {
                            console.warn('Fetch fallback failed: HTTP', resp.status, aud.src);
                        }
                    }catch(fe){
                        console.error('Fetch fallback error for audio', aud.src, fe);
                    }
                });
                aud.addEventListener('canplaythrough', ()=>{
                    console.log('Audio ready to play:', aud.src);
                });
                    // When the user presses play, do NOT trigger a new transcription run.
                    // Instead, try to fetch any already-processed (labeled) output and populate the local transcription if available.
                    aud.addEventListener('play', async ()=>{
                        try{
                            const rec = s.grabacion && s.grabacion[0];
                            if(!rec) return;
                            if(rec.transcripcion) return; // already have text locally

                            // One-time fetch: if this recording was uploaded to the server
                            // and marked as processing, try to retrieve any already-processed
                            // transcription once and update local state so the UI reflects
                            // completion without reintroducing continuous polling.
                            if(rec.remote && rec.processing){
                                (async ()=>{
                                    try{
                                        const resp = await fetch(API_BASE + '/api/processed/' + p.id, { cache: 'no-store' });
                                        if(resp && resp.ok){
                                                    const j = await resp.json();
                                                    // server returns labeled/text when ready
                                                    if(j && (j.stage === 'labeled' || j.stage === 'done' || j.text || j.raw)){
                                                        const txt = extractProcessedText(j) || (j.transcription_text || '');
                                                        if(txt){
                                                            s.grabacion[0].transcripcion = txt;
                                                        }
                                                s.grabacion[0].processing = false;
                                                try{ await saveData(); }catch(e){}
                                                // Refresh UI so buttons switch from "Procesando..." to "Ver transcripción"
                                                try{ refreshGrabacionesUI(s, p, sessionIndex); }catch(e){}
                                            }
                                        }
                                    }catch(fe){ /* ignore fetch errors here */ }
                                })();
                            }
                            return;
                        }catch(e){ console.warn('play handler error', e); }
                    });
                // ensure browser parses metadata
                try{ aud.load(); }catch(e){}
            });
        }catch(e){ console.warn('Could not attach audio handlers', e); }
    } else {
        console.warn('No _grabaciones_container found; skipping UI refresh');
    }
}

// Show a styled warning tooltip next to an element (keeps shown until removed)
function showWarningTooltipForElement(el, message){
    if(!el) return;
    removeWarningTooltipForElement(el);
    // ensure root wrapper for positioning
    const root = document.createElement('span');
    root.className = 'pp-warning-tooltip-root';
    root.style.position = 'relative';
    // move the element inside the root
    const parent = el.parentNode;
    if(!parent) return;
    parent.replaceChild(root, el);
    root.appendChild(el);
    // Format message: prefer splitting by sentences into up to two horizontal lines
    const raw = (message || '').toString().trim();
    let formatted = '';
    const sentences = raw.match(/[^.!?]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || [];
    if(sentences.length >= 2){
        // Join sentences each on its own line
        formatted = sentences.join('<br>');
    } else if(sentences.length === 1){
        // Single long sentence: split into two roughly equal parts at a word boundary
        const words = sentences[0].split(/\s+/).filter(Boolean);
        if(words.length <= 8){
            formatted = sentences[0];
        } else {
            const mid = Math.ceil(words.length / 2);
            const first = words.slice(0, mid).join(' ');
            const second = words.slice(mid).join(' ');
            formatted = first + '<br>' + second;
        }
    } else {
        formatted = raw;
    }

    const tip = document.createElement('div');
    tip.className = 'pp-warning-tooltip';
    tip.setAttribute('role','alert');
    // Icon removed per request (no '!') — only show the bubble with formatted text
    tip.innerHTML = `
        <div class="pp-warning-bubble">${formatted}</div>
    `;
    root.appendChild(tip);
    // attach reference for later removal
    el.__ppWarningRoot = root;
}

function removeWarningTooltipForElement(el){
    try{
        const root = el && el.__ppWarningRoot;
        if(root && root.parentNode){
            // move element back to parent position
            const parent = root.parentNode;
            parent.replaceChild(el, root);
            delete el.__ppWarningRoot;
        }
    }catch(e){ /* ignore */ }
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

// Open transcription modal for a session's recording
async function openTranscriptionModal(sessionIndex, patientId){
    const s = mockSesiones[sessionIndex];
    if(!s) return alert('Sesión no encontrada');
    if(!s.grabacion || s.grabacion.length === 0) return alert('No hay grabación para transcribir');
    
    // Get or initialize transcription
    let transcription = s.grabacion[0].transcripcion || '';

    // If there's no local transcription but the recording was uploaded to server, try requesting transcription on demand
    if(!transcription && s.grabacion[0].audio && s.grabacion[0].remote){
        try{
            // show a temporary modal informing user that transcription is being requested
            const busyModal = createModal(`<h3>🕒 Solicitando transcripción</h3><div style="padding:12px;">La transcripción puede tardar. Por favor, espere...</div>`);
            console.log('[debug] openTranscriptionModal: requesting transcription for patientId=', patientId, 'file=', s.grabacion[0].audio);
            const resp = await fetch(API_BASE + '/api/transcribe-recording', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patientId: patientId })
            });
            console.log('[debug] openTranscriptionModal: transcription request finished, resp.ok=', resp && resp.ok, 'status=', resp && resp.status);
            busyModal.close();
            if(!resp.ok){
                try{ const txt = await resp.text(); console.warn('Transcription request failed', resp.status, txt); }catch(e){}
            } else {
                const j = await resp.json();
                const txt = j && (j.transcription_text || j.text || '');
                console.log('[debug] openTranscriptionModal: transcription response json', j);
                if(txt){
                    s.grabacion[0].transcripcion = txt;
                    transcription = txt;
                    await saveData();
                    console.log('[debug] openTranscriptionModal: saved transcription locally, length=', (txt||'').length);
                    // refresh UI so user sees updated state
                    refreshGrabacionesUI(s, getPatientById(patientId), sessionIndex);
                }
            }
        }catch(e){
            console.error('[debug] openTranscriptionModal: error requesting transcription', e);
            console.warn('Error requesting transcription on-demand', e);
        }
    }
    
    // Build a modal that shows the formatted transcription read-only (preserves speakers/timestamps)
    // The transcription is presented in a single <pre> and is NOT editable by design.
    // Increase modal and transcription area size per user request.
    const modalHtml = `
        <div style="width:100%; max-width:1200px; padding:20px; display:flex; flex-direction:column; gap:12px; box-sizing:border-box;">
            <h3 style="margin:0;">📝 Transcripción</h3>

            <!-- Non-resizable transcription container placed immediately under the title -->
            <div id="_trans_wrapper" style="resize:none; overflow:auto; width:100%; height:60vh; min-width:360px; min-height:240px; max-width:100%; box-sizing:border-box; border-radius:8px;">
                <pre id="_server_trans_pre" style="margin:0; white-space:pre-wrap; background:#fafafa; padding:22px; border-radius:8px; border:1px solid #eee; width:100%; height:100%; box-sizing:border-box; font-family: monospace; font-size:15px; line-height:1.45;">${''}</pre>
            </div>

            <div class="actions" style="display:flex; justify-content:flex-end; margin-top:8px;">
                <button class="btn primary" id="_trans_close">Cerrar</button>
            </div>
        </div>
    `;

    const modal = createModal(modalHtml);
    try{
        // Ensure the outer modal element is enlarged so the content area and button
        // are contained within the visible dialog (override CSS if necessary).
        const modalEl = modal.backdrop.querySelector('.modal');
        if(modalEl){
            modalEl.style.width = 'min(96vw, 1400px)';
            modalEl.style.maxWidth = '1400px';
            modalEl.style.padding = '32px';
            modalEl.style.boxSizing = 'border-box';
            modalEl.style.resize = 'none';
        }

        // Set the pre element content via textContent to avoid HTML injection and
        // make sure it fills the modal area.
        const pre = modal.backdrop.querySelector('#_server_trans_pre');
            if(pre){
            pre.style.width = '100%';
            pre.style.maxHeight = '72vh';
            pre.style.boxSizing = 'border-box';
            pre.style.fontSize = '15px';
            pre.style.lineHeight = '1.45';
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.wordBreak = 'break-word';
            pre.style.overflowX = 'hidden';
            pre.style.overflowY = 'auto';
            pre.textContent = transcription && transcription.trim() ? transcription : '(No hay transcripción disponible aún)';
        }

        // Wire the close button (it's inside the modal HTML)
        const closeBtn = modal.backdrop.querySelector('#_trans_close');
        if(closeBtn) closeBtn.onclick = ()=> modal.close();
    }catch(e){ console.error('openTranscriptionModal modal wiring error', e); }
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
            <div id="_toggle_section" style="display:block; margin-top:16px; padding:12px; background:#e0f7fa; border-radius:8px; border-left:4px solid #00bcd4;">
                <label class="toggle-container" style="display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-weight:500; color:#00838f;">Autoriza grabación de sesiones</span>
                    <div class="toggle-switch" style="pointer-events:none;">
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
        const toggleSlider = modal.backdrop.querySelector('#_toggle_slider');
        let authRecording = existingConsent ? existingConsent.grabacionAutorizada : false;
        
        // Detectar cuando se carga archivo y activar toggle automáticamente
        fileInput.addEventListener('change', (e)=>{
            if(e.target.files && e.target.files[0]){
                // Activar automáticamente el toggle cuando se carga el archivo
                authRecording = true;
                toggleSlider.classList.add('active');
            } else {
                // Si quita el archivo, desactivar toggle
                authRecording = false;
                toggleSlider.classList.remove('active');
            }
        });
        
        modal.backdrop.querySelector('#_c_cancel').onclick = ()=> modal.close();
        modal.backdrop.querySelector('#_c_save').onclick = async ()=>{
            // Require psychologist PIN to add/edit consent
            const pinAuth = await modalPrompt('Ingrese PIN del psicólogo para autorizar este consentimiento');
            if(!pinAuth) return alert('Operación cancelada');
            const okPin = await validatePsyPin(pinAuth);
            if(!okPin){ alert('PIN inválido. No se puede guardar el consentimiento.'); return; }

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
    const patientOptions = mockPacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    const form = `
        <div class="row">
            <select name="pid" style="width:100%; padding:8px; border:2px solid #b2ebf2; border-radius:4px; font-size:14px;">
                <option value="">Seleccionar paciente...</option>
                ${patientOptions}
            </select>
        </div>
        <div class="row"><input name="fecha" type="date"></div>
        <div class="row"><input name="hora" type="time"></div>
    `;
    const formData = await modalForm('Crear cita', form);
    if(!formData) return;
    if(!formData.pid || !formData.fecha || !formData.hora) return alert('Datos incompletos');
    mockAgenda.push({ fecha: formData.fecha, hora: formData.hora, pacienteId: parseInt(formData.pid), estado: 'Pendiente' });
    await saveData();
    alert('✅ Cita creada correctamente');
    loadModule('agenda');
}

// Session / PIN logic for demo
async function promptStartSession(patientId){
    const p = getPatientById(patientId);
    if(!p) return;
    const want = await modalConfirm('¿Desea grabar la sesión? (Si acepta necesitará ingresar PIN)');
    if(!want){ alert('Sesión iniciada sin grabación (demo)'); return; }
    const pin = await modalPrompt('Ingrese PIN del psicólogo para autorizar grabación');
    if(!pin) return alert('Operación cancelada');
    const ok = await validatePsyPin(pin);
    if(ok){
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
            <div class="row" style="margin-top:16px; padding:12px; background:#ffebee; border-radius:8px; border:2px solid #f44336;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="color:#d32f2f; font-weight:600;">🚫 Grabación no disponible</span>
                </div>
                <small style="display:block; color:#d32f2f; font-weight:500;">❌ No hay consentimiento firmado con autorización para grabación. Por favor, suba el consentimiento primero.</small>
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
    
    // Cancel handler
    modal.backdrop.querySelector('#_m_cancel').onclick = ()=>{
        modal.close();
    };
    
    // Save handler
    modal.backdrop.querySelector('#_m_save').onclick = async ()=>{
        const inputs = modal.backdrop.querySelectorAll('input, textarea');
        const data = {};
        inputs.forEach(i=>{ if(i.name && i.type !== 'checkbox') data[i.name]=i.value; });
        
        const grabarCheckbox = modal.backdrop.querySelector('#grabar_check');
        const grabar = grabarCheckbox ? grabarCheckbox.checked : false;
        
        // Solo permitir grabación si hay consentimiento autorizado
        if(grabar && !hasAuthorizedRecording){
            alert('❌ No se puede grabar la sesión. Debe subir un consentimiento firmado con autorización de grabación primero.');
            return;
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
    
    // Ocultar el contenedor principal y sidebar
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.content').style.padding = '0';
    
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
    
    mainContent.innerHTML = `
        <div style="min-height:100vh; background:linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%); padding:20px;">
            <div style="max-width:1200px; margin:0 auto; background:white; border-radius:16px; padding:30px; box-shadow:0 8px 32px rgba(0,188,212,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:20px; border-bottom:2px solid #b2ebf2;">
                    <div>
                        <h1 style="color:#00838f; margin:0;">Sesión: ${s.fecha}</h1>
                        <p style="color:#666; margin:4px 0 0 0;"><strong>Paciente:</strong> ${p.nombre}</p>
                    </div>
                    <button id="_start_recording_btn" class="btn" style="background:linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color:white; display:flex; align-items:center; gap:12px; padding:12px 20px; border-radius:12px;">
                        <div style="width:24px; height:24px; border-radius:50%; background:white; border:3px solid #f44336; display:flex; align-items:center; justify-content:center;"></div>
                        <span style="font-weight:600;">Iniciar grabación</span>
                    </button>
                </div>

                <div style="background:#e0f7fa; padding:12px; border-radius:8px; border-left:4px solid #00bcd4; margin-bottom:30px;">
                    <strong>Notas:</strong> ${s.notas}
                </div>

                <!-- SOAP -->
                <div style="margin-bottom:30px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h3 style="color:#00838f; display:flex; align-items:center; gap:8px; margin:0;">
                            <span style="font-size:24px;">📋</span> SOAP
                        </h3>
                        <div style="display:flex; gap:8px;">
                            <button id="_edit_soap_btn" class="btn" style="background:linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color:white;">✏️ Editar</button>
                            <button id="_generate_summary_btn" class="btn" style="background:linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%); color:white;">✨ Generar resumen de sesión</button>
                        </div>
                    </div>
                    <div style="display:grid; gap:12px;">
                        <div style="padding:16px; background:white; border-radius:8px; border:2px solid #b2ebf2;">
                            <h4 style="color:#00838f; margin:0 0 8px 0; font-size:14px;">Subjetivo</h4>
                            <p style="margin:0; color:#666; line-height:1.6;">${s.soap?.s || '<em style="color:#999;">(Sin datos)</em>'}</p>
                        </div>
                        <div style="padding:16px; background:white; border-radius:8px; border:2px solid #b2ebf2;">
                            <h4 style="color:#00838f; margin:0 0 8px 0; font-size:14px;">Objetivo</h4>
                            <p style="margin:0; color:#666; line-height:1.6;">${s.soap?.o || '<em style="color:#999;">(Sin datos)</em>'}</p>
                        </div>
                    </div>
                </div>

                <!-- ENFOQUE -->
                <div style="margin-bottom:30px;">
                    <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:24px;">🎯</span> Enfoque Psicológico
                    </h3>
                    <div style="padding:12px; background:white; border:2px solid #b2ebf2; border-radius:8px;">
                        <p style="margin:0; color:#666;">${s.enfoque || '<em style="color:#999;">(No seleccionado)</em>'}</p>
                    </div>
                </div>

                <!-- ANÁLISIS -->
                <div style="margin-bottom:30px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h3 style="color:#00838f; display:flex; align-items:center; gap:8px; margin:0;">
                            <span style="font-size:24px;">🔍</span> Análisis
                        </h3>
                        <button id="_realizar_analisis_btn" class="btn" style="background:linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color:white;">🔬 Realizar análisis</button>
                    </div>
                    <div style="padding:12px; background:white; border:2px solid #b2ebf2; border-radius:8px; min-height:80px;">
                        <p style="margin:0; color:#666; line-height:1.6;">${s.analisis || '<em style="color:#999;">(Sin análisis)</em>'}</p>
                    </div>
                </div>

                <!-- PLANIFICACIÓN -->
                <div style="margin-bottom:30px;">
                    <h3 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:24px;">📝</span> Planificación
                    </h3>
                    <div style="padding:12px; background:white; border:2px solid #b2ebf2; border-radius:8px; min-height:80px;">
                        <p style="margin:0; color:#666; line-height:1.6;">${s.planificacion || '<em style="color:#999;">(Sin planificación)</em>'}</p>
                    </div>
                </div>

                <!-- GRABACIONES -->
                <div id="_grabaciones_container" style="margin-bottom:30px;">
                    ${buildGrabacionesHTML(s, p, sessionIndex) }
                </div>

                <!-- GENOGRAMA -->
                <div style="margin-bottom:30px;">
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

                <div style="display:flex; gap:12px; padding-top:20px; border-top:2px solid #b2ebf2;">
                    <button id="_session_close" class="btn primary">← Volver</button>
                </div>
            </div>
        </div>
    `;
    
    // Botón realizar análisis
    document.getElementById('_realizar_analisis_btn').onclick = async ()=>{
        const btn = document.getElementById('_realizar_analisis_btn');
        btn.disabled = true;
        btn.innerHTML = '⏳ Analizando...';
        
        // Simular análisis (aquí podrías integrar IA real)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        alert('✨ Análisis completado. Ahora puedes editarlo desde el botón "Editar".');
        
        btn.disabled = false;
        btn.innerHTML = '🔬 Realizar análisis';
    };
    
    // Botón editar SOAP - abre modal de edición
    document.getElementById('_edit_soap_btn').onclick = async ()=>{
        const editModalHtml = `
            <div style="max-height:70vh; overflow-y:auto; padding:20px;">
                <h3 style="color:#00838f; margin-top:0;">✏️ Editar Sesión</h3>
                
                <!-- SOAP -->
                <div style="margin-bottom:24px;">
                    <h4 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">📋</span> SOAP
                    </h4>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; color:#00838f; font-weight:600; margin-bottom:4px;">Subjetivo</label>
                        <textarea id="_modal_soap_s" style="width:100%; min-height:80px; padding:8px; border:2px solid #b2ebf2; border-radius:4px; font-family:inherit; font-size:14px; resize:vertical;">${s.soap?.s || ''}</textarea>
                    </div>
                    <div>
                        <label style="display:block; color:#00838f; font-weight:600; margin-bottom:4px;">Objetivo</label>
                        <textarea id="_modal_soap_o" style="width:100%; min-height:80px; padding:8px; border:2px solid #b2ebf2; border-radius:4px; font-family:inherit; font-size:14px; resize:vertical;">${s.soap?.o || ''}</textarea>
                    </div>
                </div>
                
                <!-- ENFOQUE -->
                <div style="margin-bottom:24px;">
                    <h4 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">🎯</span> Enfoque Psicológico
                    </h4>
                    <select id="_modal_enfoque_select" style="width:100%; padding:12px; border:2px solid #b2ebf2; border-radius:8px; font-size:14px;">
                        <option value="">Seleccionar enfoque...</option>
                        ${enfoques.map(e => `<option value="${e}" ${s.enfoque === e ? 'selected' : ''}>${e}</option>`).join('')}
                    </select>
                </div>
                
                <!-- ANÁLISIS -->
                <div style="margin-bottom:24px;">
                    <h4 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">🔍</span> Análisis
                    </h4>
                    <textarea id="_modal_analisis_text" style="width:100%; min-height:100px; padding:12px; border:2px solid #b2ebf2; border-radius:8px; font-family:inherit; font-size:14px; resize:vertical;" placeholder="Resultado del análisis...">${s.analisis || ''}</textarea>
                </div>
                
                <!-- PLANIFICACIÓN -->
                <div style="margin-bottom:24px;">
                    <h4 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">📝</span> Planificación
                    </h4>
                    <textarea id="_modal_planificacion_text" style="width:100%; min-height:100px; padding:12px; border:2px solid #b2ebf2; border-radius:8px; font-family:inherit; font-size:14px; resize:vertical;" placeholder="Plan de intervención...">${s.planificacion || ''}</textarea>
                </div>
            </div>
            
            <div class="actions" style="margin-top:16px; padding:0 20px 20px; display:flex; gap:8px;">
                <button class="btn primary" id="_modal_save">💾 Guardar cambios</button>
                <button class="btn ghost" id="_modal_cancel">✖️ Cancelar</button>
            </div>
        `;
        
        const editModal = createModal(editModalHtml);
        
        // Cancelar
        editModal.backdrop.querySelector('#_modal_cancel').onclick = ()=> editModal.close();
        
        // Guardar
        editModal.backdrop.querySelector('#_modal_save').onclick = async ()=>{
            const soapS = editModal.backdrop.querySelector('#_modal_soap_s').value;
            const soapO = editModal.backdrop.querySelector('#_modal_soap_o').value;
            const enfoque = editModal.backdrop.querySelector('#_modal_enfoque_select').value;
            const analisis = editModal.backdrop.querySelector('#_modal_analisis_text').value;
            const planificacion = editModal.backdrop.querySelector('#_modal_planificacion_text').value;
            
            if (!s.soap) {
                s.soap = {};
            }
            s.soap.s = soapS;
            s.soap.o = soapO;
            s.enfoque = enfoque;
            s.analisis = analisis;
            s.planificacion = planificacion;
            
            await saveData();
            alert('✅ Sesión actualizada correctamente');
            editModal.close();
            
            // Recargar la vista de sesión
            openSessionDetail(sessionIndex, patientId);
        };
    };
    
    // Save handler (eliminado - ahora todo se edita desde el modal)
    
    document.getElementById('_session_close').onclick = ()=> {
        // Restaurar sidebar y volver a vista de paciente
        document.querySelector('.sidebar').style.display = 'flex';
        document.querySelector('.content').style.padding = '30px';
        // Clear any active polling interval for this patient
        try{ if(_pp_active_intervals[p.id]){ clearInterval(_pp_active_intervals[p.id].timer); delete _pp_active_intervals[p.id]; } }catch(e){}
        showPatient(p.id);
    };
    
    // Recording button handler
    const recordingBtn = document.getElementById('_start_recording_btn');
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];

    // On open, check server state and disable record button if a recording exists
    // Also perform a one-time check for processed transcription output so the UI
    // won't remain stuck on "Procesando..." when the server has already finished.
    (async ()=>{
        try{
            console.log('[debug] on openSessionDetail: checking existing recording for patient', p.id, 'GET', API_BASE + '/api/recording/' + p.id);
            const chk = await fetch(API_BASE + '/api/recording/' + p.id);
            console.log('[debug] on openSessionDetail: check response ok=', chk && chk.ok, 'status=', chk && chk.status);
            if(chk && chk.ok){
                const info = await chk.json();
                if(info.exists){
                    if(recordingBtn){
                        recordingBtn.disabled = true;
                        try{ recordingBtn.querySelector('span').textContent = 'Grabación existente'; }catch(e){}
                        showWarningTooltipForElement(recordingBtn, 'Ya existe una grabación para este paciente. Elimine la grabación antes de grabar una nueva.');
                        recordingBtn.classList.add('disabled');
                    }
                    // sync local state
                    if(!s.grabacion || s.grabacion.length === 0){
                        s.grabacion = [{ fecha: new Date().toISOString(), audio: info.path, duracion: 0, remote:true }];
                        await saveData();
                        refreshGrabacionesUI(s,p,sessionIndex);
                    }

                    // One-time processed check: if the server already has a transcription,
                    // populate local state and clear the processing flag so the UI updates.
                    try{
                        console.debug('[debug] openSessionDetail: one-time processed check (presp) for', p.id);
                        const presp = await fetch(API_BASE + '/api/processed/' + p.id, { cache: 'no-store' });
                        console.debug('[debug] openSessionDetail: presp status=', presp && presp.status);
                        if(presp && presp.ok){
                            const pj = await presp.json();
                            console.debug('[debug] openSessionDetail: presp json=', pj && (typeof pj === 'object' ? Object.keys(pj) : pj));
                            if(pj && (pj.stage === 'labeled' || pj.stage === 'done' || pj.text || pj.raw)){
                                const txt = extractProcessedText(pj) || (pj.transcription_text || '');
                                if(!s.grabacion) s.grabacion = [{}];
                                if(txt) s.grabacion[0].transcripcion = txt;
                                s.grabacion[0].processing = false;
                                try{ await saveData(); }catch(e){}
                                try{ refreshGrabacionesUI(s, p, sessionIndex); }catch(e){}
                            }
                        }
                    }catch(pe){ console.warn('openSessionDetail presp fetch error', pe); }
                }
            }

            // If persisted local state indicates a remote recording that is still
            // marked processing, try a one-time fetch to clear it as well.
            try{
                if(s.grabacion && s.grabacion[0] && s.grabacion[0].remote && s.grabacion[0].processing){
                    console.debug('[debug] openSessionDetail: persisted-state processed check for', p.id);
                    const resp2 = await fetch(API_BASE + '/api/processed/' + p.id, { cache: 'no-store' });
                    console.debug('[debug] openSessionDetail: resp2 status=', resp2 && resp2.status);
                    if(resp2 && resp2.ok){
                        const j2 = await resp2.json();
                        console.debug('[debug] openSessionDetail: resp2 json keys=', j2 && (typeof j2 === 'object' ? Object.keys(j2) : j2));
                        if(j2 && (j2.stage === 'labeled' || j2.stage === 'done' || j2.text || j2.raw)){
                            const t = extractProcessedText(j2) || (j2.transcription_text || '');
                            if(t) s.grabacion[0].transcripcion = t;
                            s.grabacion[0].processing = false;
                            try{ await saveData(); }catch(e){}
                            try{ refreshGrabacionesUI(s, p, sessionIndex); }catch(e){}
                        }
                    }
                }
            }catch(pe2){ console.warn('openSessionDetail resp2 fetch error', pe2); }

        }catch(e){ /* ignore */ }
    })();

    // Start a reliable interval-based poll while the session detail is open.
    // The interval is registered in `_pp_active_intervals` so it can be
    // cleared when the user closes the session view. It checks for processed
    // outputs when there's a remote recording and no local transcription.
    try{
        const rec = s.grabacion && s.grabacion[0];
        if(rec && rec.remote && !rec.transcripcion){
            // avoid creating duplicate intervals for same patient
            if(_pp_active_intervals[p.id] && _pp_active_intervals[p.id].timer) {
                console.debug('[debug] polling already active for', p.id);
            } else {
                const maxAttempts = 40; // allow a longer window (e.g. ~2 minutes)
                const delayMs = 3000;
                let attempts = 0;
                const timer = setInterval(async ()=>{
                    attempts++;
                    try{
                        console.debug('[debug] interval polling attempt', attempts, 'for', p.id);
                        const resp = await fetch(API_BASE + '/api/processed/' + p.id, { cache: 'no-store' });
                        console.debug('[debug] interval polling status=', resp && resp.status);
                        if(resp && resp.ok){
                            const j = await resp.json();
                            console.debug('[debug] interval polling json keys=', j && (typeof j === 'object' ? Object.keys(j) : j));
                            if(j && (j.stage === 'labeled' || j.stage === 'done' || j.text || j.raw)){
                                const txt = extractProcessedText(j) || (j.transcription_text || '');
                                if(!s.grabacion) s.grabacion = [{}];
                                if(txt) s.grabacion[0].transcripcion = txt;
                                s.grabacion[0].processing = false;
                                try{ await saveData(); }catch(e){}
                                try{ refreshGrabacionesUI(s, p, sessionIndex); }catch(e){}
                                // clear interval and cleanup
                                try{ clearInterval(timer); }catch(e){}
                                try{ delete _pp_active_intervals[p.id]; }catch(e){}
                                return;
                            }
                        }
                    }catch(e){ console.warn('interval polling fetch error', e); }
                    if(attempts >= maxAttempts){
                        try{ clearInterval(timer); }catch(e){}
                        try{ delete _pp_active_intervals[p.id]; }catch(e){}
                    }
                }, delayMs);
                _pp_active_intervals[p.id] = { timer, attempts: 0 };
            }
        }
    }catch(e){ console.warn('Could not start interval polling', e); }
    
    if(recordingBtn){
        recordingBtn.addEventListener('click', async ()=>{
            if(!isRecording){
                // Prevent new recording if one already exists for this session/patient
                // Before trusting local state, verify with server whether the recording file actually exists.
                try{
                    console.log('[debug] recordingBtn: checking existing recording for patient', p.id, 'GET', API_BASE + '/api/recording/' + p.id);
                    const chk = await fetch(API_BASE + '/api/recording/' + p.id);
                    console.log('[debug] recordingBtn: check response ok=', chk && chk.ok, 'status=', chk && chk.status);
                    if(chk && chk.ok){
                        const info = await chk.json();
                        if(info.exists){
                            // server has file -> enforce single-recording rule
                            showWarningTooltipForElement(recordingBtn, 'Ya existe una grabación para este paciente. Elimine la grabación antes de grabar una nueva.');
                            return;
                        } else {
                            // server does NOT have file -> cleanup local reference and allow recording
                            if(s && s.grabacion && s.grabacion.length > 0){
                                s.grabacion = [];
                                await saveData();
                            }
                            // remove any leftover tooltip
                            removeWarningTooltipForElement(recordingBtn);
                        }
                    }
                }catch(e){
                    // On network error, fall back to local state (conservative: block if local says exists)
                    console.warn('Recording existence check failed, falling back to local state', e);
                    if(s && s.grabacion && s.grabacion.length > 0){
                        showWarningTooltipForElement(recordingBtn, 'Ya existe una grabación para este paciente. Elimine la grabación antes de grabar una nueva.');
                        return;
                    }
                }
                // Require psychologist PIN to start recording
                const pinAuth = await modalPrompt('Ingrese PIN del psicólogo para iniciar la grabación');
                if(!pinAuth) return alert('Operación cancelada');
                const okStart = await validatePsyPin(pinAuth);
                if(!okStart){ alert('PIN incorrecto. No se inicia la grabación.'); return; }

                // Iniciar grabación
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    
                    mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) {
                            audioChunks.push(event.data);
                        }
                    };
                    
                    mediaRecorder.onstop = async () => {
                        try{
                            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                            // Convert recorded blob (webm/ogg) to WAV (PCM16) in the browser
                            const wavBlob = await blobToWavBlob(audioBlob);

                            // Upload to server as recordings/patient_<id>.wav
                            const form = new FormData();
                            form.append('file', new File([wavBlob], `recording_patient_${p.id}.wav`, { type: 'audio/wav' }));
                            form.append('patientId', String(p.id));

                                                const uploadUrl = API_BASE + '/api/upload-recording';
                                                console.log('[debug] upload recording: POST', uploadUrl, 'patientId=', p.id);
                                                const resp = await fetch(uploadUrl, { method: 'POST', body: form });
                                                console.log('[debug] upload recording: response ok=', resp && resp.ok, 'status=', resp && resp.status);

                                                // If server reports an existing recording, inform user and abort
                                                if(resp.status === 409){
                                                    alert('❌ Ya existe una grabación en el servidor para este paciente. Elimine la grabación antes de grabar una nueva.');
                                                    // Refresh UI from server state
                                                    try{ const chk = await fetch(API_BASE + '/api/recording/' + p.id); if(chk.ok){ const info = await chk.json(); if(info.exists){ s.grabacion = [{ fecha: new Date().toISOString(), audio: info.path, duracion: s.grabacion?.[0]?.duracion || 0, remote:true }]; await saveData(); } } }catch(e){}
                                                    refreshGrabacionesUI(s, p, sessionIndex);
                                                    return;
                                                }

                                                if(!resp.ok){
                                                    // Try to read text or json error safely
                                                    let body = null;
                                                    try{ body = await resp.text(); }catch(e){ body = null; }
                                                    console.error('Upload failed', resp.status, body);
                                                    alert('❌ No se pudo subir la grabación al servidor (' + resp.status + '). Se guardará localmente como respaldo.');

                                                    // Fallback: store base64 locally
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        const base64Audio = reader.result;
                                                        s.grabacion = [{ fecha: new Date().toISOString(), audio: base64Audio, duracion: Math.floor((Date.now() - startTime) / 1000) }];
                                                        saveData();
                                                        refreshGrabacionesUI(s, p, sessionIndex);
                                                    };
                                                    reader.readAsDataURL(wavBlob);
                                                    return;
                                                }

                                                // OK response — parse JSON but guard against empty body
                                                let j = null;
                                                try{ j = await resp.json(); }catch(e){ j = null; }
                                                if(!j || !j.ok){
                                                    console.error('Upload returned unexpected body', j);
                                                    alert('❌ Subida completada con respuesta inesperada. Se guardará localmente como respaldo.');

                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        const base64Audio = reader.result;
                                                        s.grabacion = [{ fecha: new Date().toISOString(), audio: base64Audio, duracion: Math.floor((Date.now() - startTime) / 1000) }];
                                                        saveData();
                                                        refreshGrabacionesUI(s, p, sessionIndex);
                                                    };
                                                    reader.readAsDataURL(wavBlob);
                                                    return;
                                                }

                                                // Success: store the server path (only one recording per patient)
                                                s.grabacion = [{ fecha: new Date().toISOString(), audio: j.path, duracion: Math.floor((Date.now() - startTime) / 1000), remote: true }];
                                                await saveData();
                                                console.log('[debug] upload recording: stored remote path=', j.path);
                                                alert('✅ Grabación subida y guardada correctamente');
                                                refreshGrabacionesUI(s, p, sessionIndex);
                                                // disable the recording button now that a recording exists
                                                try{
                                                    if(recordingBtn){
                                                        recordingBtn.disabled = true;
                                                        try{ recordingBtn.querySelector('span').textContent = 'Grabación existente'; }catch(e){}
                                                        showWarningTooltipForElement(recordingBtn, 'Ya existe una grabación para este paciente. Elimine la grabación antes de grabar una nueva.');
                                                        recordingBtn.classList.add('disabled');
                                                    }
                                                }catch(e){/* ignore */}

                                                // Request server-side processing, mark as processing locally and start polling for labeled output
                                                (async ()=>{
                                                    try{
                                                        const tResp = await fetch(API_BASE + '/api/transcribe-recording', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ patientId: p.id })
                                                        });
                                                        if(tResp && tResp.ok){
                                                            try{
                                                                if(!s.grabacion) s.grabacion = [{}];
                                                                s.grabacion[0].processing = true;
                                                                await saveData();
                                                                refreshGrabacionesUI(s, p, sessionIndex);
                                                                // Note: frontend polling for `/api/processed` was removed —
                                                                // server-side processing may still run, but the UI will not poll for it.
                                                            }catch(e){ console.warn('Could not mark processing locally', e); }
                                                        } else {
                                                            try{ const txt = await tResp.text(); console.warn('Transcription request failed', tResp && tResp.status, txt); }catch(e){}
                                                        }
                                                    }catch(err){
                                                        console.warn('Error requesting transcription', err);
                                                    }
                                                })();

                        }catch(err){
                            console.error('Error processing recording on stop', err);
                            alert('❌ Error al procesar la grabación: ' + (err && err.message ? err.message : err));
                        } finally {
                            // Detener el stream
                            try{ stream.getTracks().forEach(track => track.stop()); }catch(e){}
                        }
                    };
                    
                    const startTime = Date.now();
                    mediaRecorder.start();
                    isRecording = true;
                    
                    recordingBtn.innerHTML = '<div style="width:24px; height:24px; border-radius:50%; background:#f44336; display:flex; align-items:center; justify-content:center;"><div style="width:10px; height:10px; background:white; border-radius:2px;"></div></div><span style="font-weight:600;">Detener grabación</span>';
                    recordingBtn.style.background = 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)';
                    
                } catch (error) {
                    console.error('Error al acceder al micrófono:', error);
                    alert('❌ No se pudo acceder al micrófono. Por favor, permite el acceso al micrófono en tu navegador.');
                }
            } else {
                // Detener grabación
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                    isRecording = false;
                    
                    recordingBtn.innerHTML = '<div style="width:24px; height:24px; border-radius:50%; background:white; border:3px solid #f44336; display:flex; align-items:center; justify-content:center;"></div><span style="font-weight:600;">Iniciar grabación</span>';
                    recordingBtn.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
                }
            }
        });
    }
    
    // Generate summary button handler
    const summaryBtn = document.getElementById('_generate_summary_btn');
    
    if(summaryBtn){
        summaryBtn.addEventListener('click', async ()=>{
            summaryBtn.disabled = true;
            summaryBtn.innerHTML = '⏳ Generando resumen...';
            
            // Simular generación de resumen
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const summary = `
                <div style="padding:20px;">
                    <h3 style="color:#7b1fa2;">📋 Resumen de Sesión</h3>
                    <div style="margin-top:16px; padding:16px; background:#f3e5f5; border-radius:8px; border-left:4px solid #9c27b0;">
                        <p><strong>Paciente:</strong> ${p.nombre}</p>
                        <p><strong>Fecha:</strong> ${s.fecha}</p>
                        <p><strong>Enfoque:</strong> ${s.enfoque || '(No definido)'}</p>
                        <hr style="margin:12px 0; border:none; border-top:1px solid #ce93d8;">
                        <p><strong>Resumen generado:</strong></p>
                        <p style="margin-top:8px; line-height:1.6;">
                            ${s.soap?.s ? 'El paciente reporta: ' + s.soap.s + '. ' : ''}
                            ${s.soap?.o ? 'Se observa: ' + s.soap.o + '. ' : ''}
                            ${s.analisis ? 'Análisis: ' + s.analisis + '. ' : ''}
                            ${s.planificacion ? 'Plan de acción: ' + s.planificacion : ''}
                        </p>
                    </div>
                    <div class="actions" style="margin-top:16px;">
                        <button class="btn primary" id="_summary_close">Cerrar</button>
                        <button class="btn ghost" style="margin-left:8px;">📥 Descargar PDF</button>
                    </div>
                </div>
            `;
            
            const summaryModal = createModal(summary);
            summaryModal.backdrop.querySelector('#_summary_close').onclick = ()=> summaryModal.close();
            
            summaryBtn.disabled = false;
            summaryBtn.innerHTML = '✨ Generar resumen de sesión';
        });
    }
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
        if(!(fileInput && fileInput.files && fileInput.files[0])){
            return alert('Seleccione un archivo para subir');
        }
        try{
            const res = await uploadFile(fileInput.files[0]);
            if(res && res.url){
                if(!s.attachments) s.attachments = [];
                s.attachments.push({ filename: res.filename || ('adjunto_' + Date.now()), url: res.url });
                await saveData();
                modal.close();
                alert('✅ Archivo adjuntado correctamente');
                // If the session detail is open, refresh the UI where appropriate
                try{ refreshGrabacionesUI(s, getPatientById(s.pacienteId), sessionIndex); }catch(e){}
                return;
            } else {
                alert('❌ No se pudo subir el archivo');
            }
        }catch(e){
            console.error('uploadAttachment error', e);
            alert('Error subiendo archivo: ' + (e && e.message ? e.message : e));
        }
    };
}

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
