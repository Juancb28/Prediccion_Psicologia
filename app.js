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
// API base (backend server).
// - If the app is served by our Node server (e.g. http://localhost:3000 or :3001), use same-origin.
// - If the app is served by Live Server (typically :55xx), default to http://localhost:3000.
// - You can always override with `window.API_BASE_URL = 'http://localhost:3001'` BEFORE app.js loads.
const API_BASE = (() => {
    try{
        if(window.API_BASE_URL) return String(window.API_BASE_URL);
        const loc = window.location;
        const origin = (loc && loc.origin) ? String(loc.origin) : '';
        const port = (loc && loc.port) ? String(loc.port) : '';
        const protocol = (loc && loc.protocol) ? String(loc.protocol) : '';

        // If opened via file:// or some non-http origin, fall back to default backend port.
        if(!origin || origin === 'null' || !protocol.startsWith('http')) return 'http://localhost:3000';

        // Live Server commonly runs on 5500/5501/etc (55xx). In that case, backend is separate.
        if(port && /^55\d\d$/.test(port)) return 'http://localhost:3000';

        // Otherwise assume same-origin backend.
        return origin;
    }catch(e){
        return 'http://localhost:3000';
    }
})();

function enfoqueLabelToCollection(enfoqueLabel){
    const s = String(enfoqueLabel || '').toLowerCase();
    if(s.startsWith('rag_')) return String(enfoqueLabel);
    if(s.includes('psicoanal')) return 'rag_psicoanalitico';
    if(s.includes('conduct')) return 'rag_conductista';
    if(s.includes('cognit')) return 'rag_cognitivo';
    if(s.includes('human')) return 'rag_humanista';
    if(s.includes('gestalt')) return 'rag_gestalt';
    // Colección real en Qdrant: rag_biopsicologico
    // (antes se usó 'rag_biopicologico', pero la disponible es con 's')
    if(s.includes('biopsicol') || s.includes('neurocien') || s.includes('biopicolog')) return 'rag_biopsicologico';
    if(s.includes('sociocult') || s.includes('cultural')) return 'rag_sociocultural';
    if(s.includes('evolucion')) return 'rag_evolucionista';
    return '';
}

// Pick the closest existing collection name based on a small available list.
// This helps when the UI mapping differs slightly from the actual Qdrant collection.
function pickClosestCollection(requested, available){
    const req = String(requested || '').trim();
    if(!req || !Array.isArray(available) || available.length === 0) return '';
    if(available.includes(req)) return req;

    const lowerMap = new Map();
    available.forEach(a => lowerMap.set(String(a).toLowerCase(), String(a)));
    const exactLower = lowerMap.get(req.toLowerCase());
    if(exactLower) return exactLower;

    // Tiny Levenshtein implementation (strings are short; lists are small)
    function levenshtein(a, b){
        a = String(a); b = String(b);
        const m = a.length, n = b.length;
        const dp = Array.from({length: m+1}, ()=>Array(n+1).fill(0));
        for(let i=0;i<=m;i++) dp[i][0] = i;
        for(let j=0;j<=n;j++) dp[0][j] = j;
        for(let i=1;i<=m;i++){
            for(let j=1;j<=n;j++){
                const cost = a[i-1] === b[j-1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i-1][j] + 1,
                    dp[i][j-1] + 1,
                    dp[i-1][j-1] + cost
                );
            }
        }
        return dp[m][n];
    }

    let best = '';
    let bestDist = Infinity;
    for(const cand of available){
        const d = levenshtein(req.toLowerCase(), String(cand).toLowerCase());
        if(d < bestDist){ bestDist = d; best = String(cand); }
    }

    // Only accept very small differences to avoid surprising mismatches.
    return bestDist <= 3 ? best : '';
}
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
        const moduleName = item.getAttribute("data-module");
        navigateToModule(moduleName);
    });
});

// Función para navegar con cambio de URL
function navigateToModule(moduleName, params = {}, addToHistory = true) {
    console.log('🧭 navigateToModule called:', { moduleName, params, addToHistory });
    
    // Construir URL con parámetros
    let url = `/${moduleName}`;
    
    // Convertir ID a slug si es paciente, pero NO para agenda (mantener índice numérico)
    if (params.id !== undefined) {
        let slug = params.id;
        
        if (moduleName === 'pacientes') {
            const patient = getPatientById(params.id);
            slug = patient ? nameToSlug(patient.nombre) : params.id;
        }
        // Para agenda, mantener el índice numérico sin convertir a slug
        
        url += `/${slug}`;
    }
    
    if (params.action) {
        url += `/${params.action}`;
    }
    
    // Actualizar estado activo en el menú
    document.querySelector(".active")?.classList.remove("active");
    const baseModule = moduleName.split('/')[0];
    const activeItem = document.querySelector(`[data-module="${baseModule}"]`);
    if (activeItem) {
        activeItem.classList.add("active");
    }

    // Cambiar URL sin recargar
    if (addToHistory) {
        // Guardar params, solo convertir pacientes a slug
        const stateParams = {...params};
        if (stateParams.id !== undefined && typeof stateParams.id === 'number') {
            if (moduleName === 'pacientes') {
                const patient = getPatientById(stateParams.id);
                if (patient) {
                    stateParams.id = nameToSlug(patient.nombre);
                }
            }
            // Para agenda, mantener el índice numérico
        }
        console.log('💾 Pushing state:', { module: moduleName, params: stateParams, url });
        window.history.pushState({ module: moduleName, params: stateParams }, '', url);
    }

    // Cargar el módulo
    loadModule(moduleName, params);
}

// Manejar botones atrás/adelante del navegador
window.addEventListener('popstate', (event) => {
    console.log('⏮️ popstate event:', { hasState: !!(event.state && event.state.module), state: event.state, url: window.location.pathname });
    
    if (event.state && event.state.module) {
        console.log('Using saved state:', event.state);
        navigateToModule(event.state.module, event.state.params || {}, false);
    } else {
        console.log('Parsing URL:', window.location.pathname);
        // Si no hay estado, determinar desde la URL
        const path = window.location.pathname;
        const pathParts = path.substring(1).split('/').filter(p => p);
        const moduleName = pathParts[0] || 'dashboard';
        const params = {};
        
        // Manejar diferentes patrones de URL
        if (pathParts[1]) {
            // Si el segundo segmento es 'nueva', es una acción sin ID
            if (pathParts[1] === 'nueva') {
                params.action = 'nueva';
            } else {
                // De lo contrario, es un slug - pasar directamente sin convertir
                const slug = pathParts[1];
                console.log('📍 URL slug detected:', slug);
                
                if (moduleName === 'pacientes') {
                    const patient = getPatientBySlug(slug);
                    params.id = patient ? patient.id : slug;
                } else if (moduleName === 'agenda') {
                    // Pasar el slug directamente, loadModule lo convertirá
                    params.id = slug;
                } else {
                    params.id = slug;
                }
            }
        }
        if (pathParts[2]) params.action = pathParts[2];
        
        console.log('Parsed params:', params);
        navigateToModule(moduleName, params, false);
    }
});

// Inicializar con la URL actual
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const pathParts = path.substring(1).split('/').filter(p => p);
    const moduleName = pathParts[0] || 'dashboard';
    const params = {};
    
    // Manejar diferentes patrones de URL
    if (pathParts[1]) {
        // Si el segundo segmento es 'nueva', es una acción sin ID
        if (pathParts[1] === 'nueva') {
            params.action = 'nueva';
        } else {
            // De lo contrario, es un slug - pasar directamente sin convertir
            const slug = pathParts[1];
            console.log('🏁 Initial load, slug detected:', slug);
            
            if (moduleName === 'pacientes') {
                const patient = getPatientBySlug(slug);
                params.id = patient ? patient.id : slug;
            } else if (moduleName === 'agenda') {
                // Pasar el slug directamente, loadModule lo convertirá
                params.id = slug;
            } else {
                params.id = slug;
            }
        }
    }
    if (pathParts[2]) params.action = pathParts[2];
    
    navigateToModule(moduleName, params, false);
});

// ---------------------
// RENDERIZADO DE MÓDULOS
// ---------------------

function loadModule(module, params = {}) {
    console.log('📦 loadModule called:', { module, params, currentModule, activePatientId });
    currentModule = module; // Track current module
    
    // Manejar rutas anidadas con ID (usar !== undefined para permitir id=0)
    if (params.id !== undefined && params.id !== null) {
        if (module === 'pacientes') {
            console.log('📍 Loading patient with ID:', params.id);
            
            // Convertir slug a ID numérico si es necesario
            let patientId = params.id;
            if (typeof patientId === 'string') {
                const patient = getPatientBySlug(patientId);
                if (patient) {
                    patientId = patient.id;
                    console.log('Converted slug to ID:', patientId);
                } else {
                    // Intentar parsear como número
                    patientId = parseInt(patientId);
                    if (isNaN(patientId)) {
                        console.error('Invalid patient ID/slug:', params.id);
                        renderPacientes();
                        return;
                    }
                }
            }
            
            // Primero mostrar el paciente
            showPatient(patientId, false); // false = no push to history
            
            // Luego manejar la acción si existe
            if (params.action === 'editar') {
                // Esperar a que se renderice el paciente y luego abrir el formulario de edición
                setTimeout(() => editPatientInfo(parseInt(params.id), false), 100);
            } else if (params.action === 'nueva-sesion') {
                // Abrir formulario de nueva sesión
                setTimeout(() => createNewSessionForPatient(parseInt(params.id), false), 100);
            }
            return;
        } else if (module === 'sesiones') {
            showSessionDetail(parseInt(params.id));
            return;
        } else if (module === 'agenda') {
            console.log('📋 Loading agenda module with params:', params);
            
            // Renderizar agenda si venimos de otro módulo
            if (currentModule !== 'agenda') {
                console.log('Rendering agenda (currentModule was:', currentModule + ')');
                renderAgenda();
            }
            
            // Para agenda, si hay ID, es editar una cita
            if (params.action === 'editar') {
                console.log('Action is editar, params.id:', params.id, 'type:', typeof params.id);
                let appointmentIndex = -1;
                
                // Parsear ID: puede ser número o string numérico
                if (typeof params.id === 'number') {
                    appointmentIndex = params.id;
                } else if (typeof params.id === 'string') {
                    // Intentar convertir a número
                    const parsed = parseInt(params.id);
                    if (!isNaN(parsed)) {
                        appointmentIndex = parsed;
                    }
                }
                
                console.log('Appointment index resolved to:', appointmentIndex);
                
                if (appointmentIndex >= 0 && mockAgenda[appointmentIndex]) {
                    const apt = mockAgenda[appointmentIndex];
                    const pat = mockPacientes.find(p => p.id === apt.pacienteId);
                    console.log('✅ Opening editCita modal for:', { index: appointmentIndex, patient: pat?.nombre });
                    // Llamar directamente sin setTimeout para abrir el modal inmediatamente
                    editCita(appointmentIndex, false);
                } else {
                    console.error('❌ Invalid appointment index:', appointmentIndex);
                }
            }
            return;
        }
    }
    
    // Manejar acciones sin ID
    if (params.action) {
        if (module === 'agenda' && params.action === 'nueva') {
            renderAgenda();
            setTimeout(() => quickCreateCita(), 100);
            return;
        }
    }
    
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

        case 'psychologist-profile':
            renderPsychologistProfile();
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
                <h1>📊 Genogramas de Pacientes</h1>
                <div class="card">
                    <p style="margin-bottom:20px; color:#666;">
                        Selecciona un paciente para ver o generar su genograma familiar basado en las transcripciones de sesiones.
                    </p>
                    <div style="display:grid; gap:16px;">
                        ${mockPacientes.map(p => `
                            <div class="patient-card" style="border:2px solid #e5e7eb; border-radius:12px; padding:16px; background:#f9fafb; cursor:pointer; transition:all 0.3s;" onclick="viewGenograma(${p.id})">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <div>
                                        <h3 style="margin:0 0 8px 0; color:#00838f;">${p.nombre}</h3>
                                        <p style="margin:0; color:#666; font-size:14px;">${p.edad} años - ${p.motivo}</p>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        ${p.genogramaHtml ? '<span style="color:#10b981; font-size:12px; font-weight:600;">✓ Generado</span>' : '<span style="color:#f59e0b; font-size:12px; font-weight:600;">⚠ Pendiente</span>'}
                                        <button class="btn primary" style="padding:8px 16px;">
                                            ${p.genogramaHtml ? 'Ver' : 'Generar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            break;
    }
}

// Render functions
function renderDashboard() {
    const today = new Date().toISOString().slice(0,10);
    const citasHoy = mockAgenda.filter(a => a.fecha === today);
    const citasPendientes = mockAgenda.filter(a => a.estado === 'Pendiente').length;

    mainContent.innerHTML = `
        <h1>Panel Principal</h1>
        <div class="dashboard-grid">
            <div class="card dashboard-calendar-card">
                <div class="calendar-card-header">
                    <h3>📅 Calendario del Mes</h3>
                    <button class="calendar-today-btn" onclick="goToToday()">
                        <span>📅</span>
                        <span>Hoy</span>
                    </button>
                </div>
                ${renderCalendarView()}
            </div>

            <div class="card dashboard-appointments-card">
                <div class="dashboard-card-header">
                    <h3>🕐 Próximas citas del día</h3>
                    <span class="appointments-badge">${citasHoy.length}</span>
                </div>
                <div class="appointments-today-list">
                    ${citasHoy.length ? citasHoy.map(c => {
                        const p = mockPacientes.find(x=>x.id===c.pacienteId);
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
                                    <span class="patient-name-today">${p? p.nombre : '—'}</span>
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
                    <button class="quick-action-btn" onclick="quickRegisterSession()">
                        <span class="action-icon">📝</span>
                        <span class="action-label">Registrar sesión</span>
                    </button>
                    <button class="quick-action-btn" onclick="navigateToModule('pacientes', {})">
                        <span class="action-icon">👥</span>
                        <span class="action-label">Ver pacientes</span>
                    </button>
                    <button class="quick-action-btn" onclick="navigateToModule('agenda', { action: 'nueva' })">
                        <span class="action-icon">📅</span>
                        <span class="action-label">Crear cita</span>
                    </button>
                    <button class="quick-action-btn" onclick="navigateToModule('sesiones', {})">
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
                            <span class="stat-value">${mockPacientes.length}</span>
                            <span class="stat-label">Pacientes</span>
                        </div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-icon">💼</div>
                        <div class="stat-content">
                            <span class="stat-value">${mockSesiones.length}</span>
                            <span class="stat-label">Sesiones</span>
                        </div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-icon">📅</div>
                        <div class="stat-content">
                            <span class="stat-value">${mockAgenda.length}</span>
                            <span class="stat-label">Citas totales</span>
                        </div>
                    </div>
                </div>
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
        <div class="patients-header">
            <h1>Gestión de Pacientes</h1>
            <button class="add-patient-btn" onclick="addNewPatient()">
                <span class="btn-icon">➕</span>
                <span>Nuevo Paciente</span>
            </button>
        </div>
        <div class="card">
            <div class="patients-grid">
                ${mockPacientes.map(p => `
                    <div class="patient-card" data-id="${p.id}">
                        <div class="patient-card-header">
                            <div class="patient-avatar">
                                <span class="avatar-icon">👤</span>
                            </div>
                            <div class="patient-info">
                                <h3 class="patient-name">${p.nombre}</h3>
                                <div class="patient-age">
                                    <span class="age-icon">🎂</span>
                                    <span>${p.edad} años</span>
                                </div>
                            </div>
                        </div>
                        <div class="patient-card-body">
                            <div class="patient-reason">
                                <span class="reason-icon">📋</span>
                                <span class="reason-label">Motivo:</span>
                                <span class="reason-text">${p.motivo}</span>
                            </div>
                        </div>
                        <div class="patient-card-footer">
                            <button class="patient-action-btn view-btn">
                                <span>👁️</span>
                                <span>Ver Detalles</span>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // add click handlers to open detail
    document.querySelectorAll('.patient-card').forEach(el=>{
        el.addEventListener('click', ()=>{
            const id = parseInt(el.getAttribute('data-id'));
            navigateToModule('pacientes', { id });
        });
    });
}

let agendaView = 'list';

// Calendar navigation variables
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let currentModule = 'dashboard'; // Track current module

function setAgendaView(v){ agendaView = v; renderAgenda(); }

function changeCalendarMonth(offset) {
    calendarMonth += offset;
    if(calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
    } else if(calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
    }
    // Re-render current module instead of always going to agenda
    if(currentModule === 'dashboard') {
        renderDashboard();
    } else {
        renderAgenda();
    }
}

function goToToday() {
    calendarYear = new Date().getFullYear();
    calendarMonth = new Date().getMonth();
    // Re-render current module instead of always going to agenda
    if(currentModule === 'dashboard') {
        renderDashboard();
    } else {
        renderAgenda();
    }
}

function renderAgenda() {
    currentModule = 'agenda'; // Track current module
    const controls = `
        <div class="agenda-controls">
            <button class="view-btn ${agendaView === 'list' ? 'active-view' : ''}" onclick="setAgendaView('list')">
                <span class="view-icon">📋</span>
                <span>Lista</span>
            </button>
            <button class="view-btn ${agendaView === 'calendar' ? 'active-view' : ''}" onclick="setAgendaView('calendar')">
                <span class="view-icon">📅</span>
                <span>Calendario</span>
            </button>
            <button class="view-btn ${agendaView === 'week' ? 'active-view' : ''}" onclick="setAgendaView('week')">
                <span class="view-icon">📆</span>
                <span>Semanal</span>
            </button>
            <button class="view-btn ${agendaView === 'month' ? 'active-view' : ''}" onclick="setAgendaView('month')">
                <span class="view-icon">🗓️</span>
                <span>Mensual</span>
            </button>
            <button class="view-btn create-btn" onclick="quickCreateCita()">
                <span class="view-icon">➕</span>
                <span>Crear cita</span>
            </button>
        </div>
    `;
    let body = '';
    
    if(agendaView === 'calendar'){
        body = renderCalendarView();
    } else if(agendaView === 'list'){
        body = mockAgenda.map((e, idx) => {
            const patient = mockPacientes.find(p=>p.id===e.pacienteId);
            const statusClass = e.estado === 'Confirmada' ? 'confirmed' : 
                               e.estado === 'Pendiente' ? 'pending' : 
                               e.estado === 'Finalizada' ? 'finished' : 'cancelled';
            return `
                <div class="appointment-item ${statusClass}" data-appointment-index="${idx}">
                    <div class="appointment-header">
                        <div class="appointment-datetime">
                            <span class="appointment-icon">🕐</span>
                            <span class="appointment-date">${e.fecha}</span>
                            <span class="appointment-time">${e.hora}</span>
                        </div>
                        <span class="appointment-status status-${statusClass}">${e.estado}</span>
                    </div>
                    <div class="appointment-patient">
                        <span class="patient-icon">👤</span>
                        <span class="patient-name">${patient?.nombre || '—'}</span>
                    </div>
                    <button class="delete-btn-small" data-delete-index="${idx}" title="Eliminar cita" onclick="event.stopPropagation();">
                        🗑️
                    </button>
                </div>
            `;
        }).join('');
    } else if(agendaView === 'week'){
        const today = new Date();
        const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);
        const items = mockAgenda.filter(a=> new Date(a.fecha) >= weekStart && new Date(a.fecha) < weekEnd);
        body = items.length ? items.map((e, idx)=>{
            const patient = mockPacientes.find(p=>p.id===e.pacienteId);
            const statusClass = e.estado === 'Confirmada' ? 'confirmed' : 
                               e.estado === 'Pendiente' ? 'pending' : 
                               e.estado === 'Finalizada' ? 'finished' : 'cancelled';
            const appointmentIndex = mockAgenda.indexOf(e);
            return `
                <div class="appointment-item ${statusClass}" data-appointment-index="${appointmentIndex}">
                    <div class="appointment-header">
                        <div class="appointment-datetime">
                            <span class="appointment-icon">🕐</span>
                            <span class="appointment-date">${e.fecha}</span>
                            <span class="appointment-time">${e.hora}</span>
                        </div>
                        <span class="appointment-status status-${statusClass}">${e.estado}</span>
                    </div>
                    <div class="appointment-patient">
                        <span class="patient-icon">👤</span>
                        <span class="patient-name">${patient?.nombre || '—'}</span>
                    </div>
                    <button class="delete-btn-small" data-delete-index="${appointmentIndex}" title="Eliminar cita" onclick="event.stopPropagation();">
                        🗑️
                    </button>
                </div>
            `;
        }).join('') : '<div class="empty-state">📭 No hay citas esta semana</div>';
    } else {
        const today = new Date();
        const monthItems = mockAgenda.filter(a=>{ const d=new Date(a.fecha); return d.getMonth()===today.getMonth() && d.getFullYear()===today.getFullYear(); });
        body = monthItems.length ? monthItems.map((e)=>{
            const patient = mockPacientes.find(p=>p.id===e.pacienteId);
            const statusClass = e.estado === 'Confirmada' ? 'confirmed' : 
                               e.estado === 'Pendiente' ? 'pending' : 
                               e.estado === 'Finalizada' ? 'finished' : 'cancelled';
            const appointmentIndex = mockAgenda.indexOf(e);
            return `
                <div class="appointment-item ${statusClass}" data-appointment-index="${appointmentIndex}">
                    <div class="appointment-header">
                        <div class="appointment-datetime">
                            <span class="appointment-icon">🕐</span>
                            <span class="appointment-date">${e.fecha}</span>
                            <span class="appointment-time">${e.hora}</span>
                        </div>
                        <span class="appointment-status status-${statusClass}">${e.estado}</span>
                    </div>
                    <div class="appointment-patient">
                        <span class="patient-icon">👤</span>
                        <span class="patient-name">${patient?.nombre || '—'}</span>
                    </div>
                    <button class="delete-btn-small" data-delete-index="${appointmentIndex}" title="Eliminar cita" onclick="event.stopPropagation();">
                        🗑️
                    </button>
                </div>
            `;
        }).join('') : '<div class="empty-state">📭 No hay citas este mes</div>';
    }

    mainContent.innerHTML = `
        <h1>Agenda</h1>
        ${controls}
        <div class="card">
            ${body}
        </div>
    `;
    
    // Agregar event listeners a las citas
    document.querySelectorAll('.appointment-item[data-appointment-index]').forEach(item => {
        item.addEventListener('click', (e) => {
            // Evitar abrir modal si se hizo click en el botón de eliminar
            if(e.target.closest('.delete-btn-small')) {
                console.log('❌ Click en botón eliminar, no abrir modal');
                return;
            }
            const index = parseInt(item.getAttribute('data-appointment-index'));
            const appointment = mockAgenda[index];
            const patient = mockPacientes.find(p => p.id === appointment?.pacienteId);
            console.log('🖱️ Click en appointment:', { index, patient: patient?.nombre, appointment, mockAgenda });
            console.log('🔄 Llamando navigateToModule con:', { module: 'agenda', id: index, action: 'editar' });
            navigateToModule('agenda', { id: index, action: 'editar' });
        });
    });
    
    // Agregar event listeners a los botones de eliminar
    document.querySelectorAll('.delete-btn-small[data-delete-index]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const index = parseInt(btn.getAttribute('data-delete-index'));
            await deleteCita(index);
        });
    });
}

function renderCalendarView() {
    const today = new Date();
    
    // Get first day of month and total days
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const totalDays = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    
    // Month names
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    // Build calendar header with navigation
    let html = `
        <div class="calendar-header">
            <button class="calendar-nav-btn" onclick="changeCalendarMonth(-1)">
                <span>◀️</span>
                <span>Anterior</span>
            </button>
            <h2 class="calendar-month-title">${monthNames[calendarMonth]} ${calendarYear}</h2>
            <button class="calendar-nav-btn" onclick="changeCalendarMonth(1)">
                <span>Siguiente</span>
                <span>▶️</span>
            </button>
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
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayAppointments = mockAgenda.filter(a => a.fecha === dateStr);
        
        const isToday = day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
        
        let appointmentsHtml = '';
        if(dayAppointments.length > 0) {
            appointmentsHtml = dayAppointments.map((apt, idx) => {
                const patient = mockPacientes.find(p => p.id === apt.pacienteId);
                const statusClass = apt.estado === 'Confirmada' ? 'confirmed' : apt.estado === 'Pendiente' ? 'pending' : apt.estado === 'Finalizada' ? 'finished' : 'cancelled';
                return `<div class="appointment-badge ${statusClass}" onclick="navigateToModule('agenda', {id: ${mockAgenda.indexOf(apt)}, action: 'editar'})" title="${patient?.nombre || '—'} - ${apt.hora}">
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
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">👤</span>
                <span>Paciente</span>
            </label>
            <select name="pid" class="modern-select">
                ${mockPacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
            </select>
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">📅</span>
                <span>Fecha</span>
            </label>
            <input name="fecha" type="date" value="${dateStr}" class="modern-input">
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">🕐</span>
                <span>Hora</span>
            </label>
            <input name="hora" type="time" value="09:00" class="modern-input">
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">📊</span>
                <span>Estado</span>
            </label>
            <select name="estado" class="modern-select">
                <option>Pendiente</option>
                <option>Confirmada</option>
                <option>Finalizada</option>
                <option>Anulada</option>
            </select>
        </div>
        <div class="form-hint">
            <span class="hint-icon">💡</span>
            <span>Creando cita para el ${dateStr}</span>
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
    console.log('Cita creada');
    renderAgenda();
}

async function editCita(index, pushHistory = true){
    console.log('📝 editCita called with index:', index, 'mockAgenda:', mockAgenda);
    const e = mockAgenda[index];
    if(!e) {
        console.error('❌ Cita no encontrada en index:', index);
        return;
    }
    
    console.log('✅ Cita encontrada:', e);
    
    const patient = mockPacientes.find(p => p.id === e.pacienteId);
    console.log('👤 Paciente encontrado:', patient);
    
    const html = `
        <div class="modern-modal-header">
            <h3 class="modal-title">Editar cita</h3>
        </div>
        <div class="modern-modal-body">
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">👤</span>
                    <span>Paciente ID</span>
                </label>
                <input name="pid" value="${e.pacienteId}" class="modern-input" readonly style="background: #f5f5f5;">
                <div class="input-helper">Paciente: ${patient?.nombre || 'Desconocido'}</div>
            </div>
            <div class="modern-form-row">
                <div class="modern-form-group">
                    <label class="modern-label">
                        <span class="label-icon">📅</span>
                        <span>Fecha</span>
                    </label>
                    <input name="fecha" type="date" value="${e.fecha}" class="modern-input">
                </div>
                <div class="modern-form-group">
                    <label class="modern-label">
                        <span class="label-icon">🕐</span>
                        <span>Hora</span>
                    </label>
                    <input name="hora" type="time" value="${e.hora}" class="modern-input">
                </div>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📊</span>
                    <span>Estado</span>
                </label>
                <select name="estado" class="modern-select">
                    <option ${e.estado==='Pendiente'?'selected':''}>Pendiente</option>
                    <option ${e.estado==='Confirmada'?'selected':''}>Confirmada</option>
                    <option ${e.estado==='Finalizada'?'selected':''}>Finalizada</option>
                    <option ${e.estado==='Anulada'?'selected':''}>Anulada</option>
                </select>
            </div>
        </div>
        <div class="modern-modal-footer">
            <button class="modern-btn delete-btn" id="_m_delete" style="margin-right: auto;">
                <span>🗑️</span>
                <span>Eliminar</span>
            </button>
            <button class="modern-btn cancel-btn" id="_m_cancel">
                <span>Cancelar</span>
            </button>
            <button class="modern-btn save-btn" id="_m_save">
                <span>💾</span>
                <span>Guardar</span>
            </button>
        </div>
    `;

    console.log('🎨 Creando modal...');
    const m = createModal(html);
    console.log('✅ Modal creado:', m);
    
    // Close / Cancel
    m.backdrop.querySelector('#_m_cancel').onclick = () => m.close();
    
    // Delete
    m.backdrop.querySelector('#_m_delete').onclick = async () => {
        if(confirm('¿Eliminar esta cita?')){
            mockAgenda.splice(index, 1);
            await saveData();
            m.close();
            renderAgenda();
            console.log('Cita eliminada');
        }
    };
    
    // Save
    m.backdrop.querySelector('#_m_save').onclick = async () => {
        const inputs = m.backdrop.querySelectorAll('input, select');
        const data = {};
        inputs.forEach(i => { if(i.name) data[i.name] = i.value; });
        
        e.pacienteId = parseInt(data.pid);
        e.fecha = data.fecha;
        e.hora = data.hora;
        e.estado = data.estado;
        
        await saveData();
        m.close();
        renderAgenda();
        console.log('Cita actualizada');
    };
}

// Global delete function for agenda list
window.deleteCita = async function(index) {
    if(confirm('¿Seguro que deseas eliminar esta cita?')){
        mockAgenda.splice(index, 1);
        await saveData();
        renderAgenda();
        console.log('Cita eliminada desde lista');
    }
};

function renderSesiones() {
    mainContent.innerHTML = `
        <h1>Sesiones</h1>
        <div class="card">
            <h3>Lista de sesiones</h3>
            ${mockSesiones.map((s, idx) => `
                <div class="session-item">
                    <div class="session-header">
                        <div class="session-title">
                            <span class="session-patient-name">${mockPacientes.find(p=>p.id===s.pacienteId)?.nombre || '—'}</span>
                            <span class="session-date">📅 ${s.fecha}</span>
                        </div>
                        <div class="session-notes">${s.notas}</div>
                    </div>
                    <div class="session-actions">
                        <button class="session-btn soap-btn" onclick="openSoapForm(${idx})">
                            <span class="btn-icon">📋</span>
                            <span class="btn-text">Editar SOAP</span>
                        </button>
                        <button class="session-btn attachment-btn" onclick="uploadAttachment(${idx})">
                            <span class="btn-icon">📎</span>
                            <span class="btn-text">Adjuntos</span>
                        </button>
                        <button class="session-btn genogram-btn" onclick="viewGenograma(${s.pacienteId})">
                            <span class="btn-icon">🌳</span>
                            <span class="btn-text">Genograma</span>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="card">
            <h3>Crear / Iniciar sesión</h3>
            <div class="create-session-container">
                <div class="input-group">
                    <label class="input-label">Seleccionar paciente</label>
                    <select id="sessionPatientSelect" class="modern-select">
                        ${mockPacientes.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('')}
                    </select>
                </div>
                <button class="session-btn start-session-btn" onclick="startSessionPrompt()">
                    <span class="btn-icon">▶️</span>
                    <span class="btn-text">Iniciar sesión</span>
                </button>
            </div>
            <div id="sessionArea"></div>
        </div>
    `;
}

// Utilities
function getPatientById(id){ return mockPacientes.find(p=>p.id===id); }

// Función para convertir nombre a slug URL-friendly
function nameToSlug(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD') // Normalizar caracteres con acentos
        .replace(/[\u0300-\u036f]/g, '') // Eliminar diacríticos
        .replace(/\s+/g, '_') // Espacios a guiones bajos
        .replace(/[^a-z0-9_-]/g, '') // Eliminar caracteres especiales
        .replace(/_+/g, '_') // Múltiples guiones bajos a uno solo
        .replace(/^_+|_+$/g, ''); // Eliminar guiones al inicio/fin
}

// Función para encontrar paciente por slug de nombre
function getPatientBySlug(slug) {
    if (!slug) return null;
    return mockPacientes.find(p => nameToSlug(p.nombre) === slug);
}

// Función para encontrar cita por slug de paciente
function getAppointmentByPatientSlug(slug) {
    const patient = getPatientBySlug(slug);
    if (!patient) return null;
    return mockAgenda.findIndex(a => a.pacienteId === patient.id);
}

// Función para obtener slug de cita (paciente + fecha)
function getAppointmentSlug(appointment) {
    const patient = getPatientById(appointment.pacienteId);
    if (!patient) return null;
    const dateSlug = appointment.fecha.replace(/-/g, '_');
    return `${nameToSlug(patient.nombre)}_${dateSlug}`;
}

// Función para encontrar cita por slug
function getAppointmentBySlug(slug) {
    console.log('🔍 getAppointmentBySlug called with:', slug);
    const parts = slug.split('_');
    console.log('Parts after split:', parts);
    
    if (parts.length < 4) {
        console.log('❌ Parts length < 4, returning -1');
        return -1;
    }
    
    // Extraer fecha (los últimos 3 segmentos)
    const day = parts.pop();
    const month = parts.pop();
    const year = parts.pop();
    const fecha = `${year}-${month}-${day}`;
    console.log('📅 Fecha construida:', fecha);
    
    // El resto es el nombre
    const nameSlug = parts.join('_');
    console.log('👤 Name slug:', nameSlug);
    
    const patient = getPatientBySlug(nameSlug);
    console.log('Patient found:', patient);
    
    if (!patient) {
        console.log('❌ Patient not found, returning -1');
        return -1;
    }
    
    const index = mockAgenda.findIndex(a => 
        a.pacienteId === patient.id && a.fecha === fecha
    );
    console.log('✅ Appointment index found:', index);
    return index;
}

// Función para mostrar detalle de sesión desde ruta
function showSessionDetail(sessionIndex) {
    const session = mockSesiones[sessionIndex];
    if (!session) {
        console.error('Sesión no encontrada');
        navigateToModule('sesiones', {});
        return;
    }
    openSessionDetail(sessionIndex, session.pacienteId);
}

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
    
    // Limpiar cualquier modal anterior que pueda existir
    while(root.firstChild) {
        root.removeChild(root.firstChild);
    }
    
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
            console.log('Cerrando modal...');
            try{ 
                // Remover todos los event listeners del backdrop antes de remover
                const backdropClone = backdrop.cloneNode(false);
                backdrop.parentNode.replaceChild(backdropClone, backdrop);
                backdropClone.remove();
                console.log('Backdrop removido con limpieza de listeners');
            }catch(e){ 
                console.error('Error removiendo backdrop:', e);
                try {
                    root.removeChild(backdrop);
                } catch(e2) {}
            }
            try{ 
                document.body.style.overflow = prevBodyOverflow; 
            }catch(e){}
            
            // Limpiar completamente el modalRoot después de cerrar
            setTimeout(() => {
                while(root.firstChild) {
                    root.removeChild(root.firstChild);
                }
                console.log('ModalRoot limpiado');
            }, 50);
            
            // Al cerrar modal, volver a la ruta del paciente si estamos en una acción
            const currentPath = window.location.pathname;
            const pathParts = currentPath.split('/').filter(p => p);
            
            // Si estamos en una ruta con acción (editar, nueva-sesion), volver al detalle
            if (pathParts.length >= 3 && pathParts[0] === 'pacientes') {
                const patientId = pathParts[1];
                if (pathParts[2] === 'editar' || (pathParts[2] === 'sesiones' && pathParts[3] === 'nueva')) {
                    // Volver a /pacientes/:id
                    window.history.pushState({ module: 'pacientes', params: { id: patientId } }, '', `/pacientes/${patientId}`);
                }
            }
        }
    };
}

function modalPrompt(label, defaultValue='', options={}){
    return new Promise(resolve=>{
        let modalContent;
        
        if(options.isPin){
            // PIN mode: 6 dígitos individuales
            modalContent = `
                <div class="pin-modal-container">
                    <h2 class="pin-title">Ingresa tu PIN</h2>
                    <p class="pin-subtitle">Introduce el código de 6 dígitos</p>
                    <div class="pin-input-container">
                        <input type="text" maxlength="1" class="pin-digit" data-index="0" pattern="[0-9]" inputmode="numeric">
                        <input type="text" maxlength="1" class="pin-digit" data-index="1" pattern="[0-9]" inputmode="numeric">
                        <input type="text" maxlength="1" class="pin-digit" data-index="2" pattern="[0-9]" inputmode="numeric">
                        <input type="text" maxlength="1" class="pin-digit" data-index="3" pattern="[0-9]" inputmode="numeric">
                        <input type="text" maxlength="1" class="pin-digit" data-index="4" pattern="[0-9]" inputmode="numeric">
                        <input type="text" maxlength="1" class="pin-digit" data-index="5" pattern="[0-9]" inputmode="numeric">
                    </div>
                    <div class="pin-actions">
                        <button class="btn ghost" id="_m_cancel">Cancelar</button>
                        <button class="btn primary pin-verify-btn" id="_m_ok">Verificar</button>
                    </div>
                </div>
            `;
        } else {
            // Modo normal
            modalContent = `<h3>${label}</h3><div class="row"><input id="_m_input" type="text" value="${defaultValue}"></div><div class="actions"><button class="btn ghost" id="_m_cancel">Cancelar</button><button class="btn primary" id="_m_ok">Aceptar</button></div>`;
        }
        
        const m = createModal(modalContent);
        
        if(options.isPin){
            // Lógica para PIN de 6 dígitos
            const inputs = m.backdrop.querySelectorAll('.pin-digit');
            
            inputs.forEach((input, index) => {
                // Auto-focus al siguiente campo
                input.addEventListener('input', (e) => {
                    const value = e.target.value;
                    
                    // Solo permitir números
                    if(!/^[0-9]$/.test(value) && value !== ''){
                        e.target.value = '';
                        return;
                    }
                    
                    // Si ingresó un dígito, pasar al siguiente
                    if(value && index < inputs.length - 1){
                        inputs[index + 1].focus();
                    }
                });
                
                // Manejar backspace
                input.addEventListener('keydown', (e) => {
                    if(e.key === 'Backspace' && !e.target.value && index > 0){
                        inputs[index - 1].focus();
                        inputs[index - 1].value = '';
                    }
                });
                
                // Evitar entrada no numérica
                input.addEventListener('keypress', (e) => {
                    if(!/[0-9]/.test(e.key)){
                        e.preventDefault();
                    }
                });
            });
            
            // Botón cancelar
            const cancelBtn = m.backdrop.querySelector('#_m_cancel');
            if(cancelBtn) {
                cancelBtn.onclick = () => {
                    m.close();
                    resolve(null);
                };
            }
            
            // Botón verificar
            m.backdrop.querySelector('#_m_ok').onclick = () => {
                const pin = Array.from(inputs).map(input => input.value).join('');
                if(pin.length === 6){
                    m.close();
                    resolve(pin);
                } else {
                    // Resaltar campos vacíos
                    inputs.forEach(input => {
                        if(!input.value){
                            input.style.borderColor = '#f44336';
                            setTimeout(() => {
                                input.style.borderColor = '';
                            }, 1000);
                        }
                    });
                }
            };
            
            // Permitir cancelar con ESC
            const escHandler = (e) => {
                if(e.key === 'Escape'){
                    m.close();
                    resolve(null);
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
            
            // Focus en el primer campo
            setTimeout(() => inputs[0].focus(), 100);
        } else {
            // Modo normal
            const cancelBtn = m.backdrop.querySelector('#_m_cancel');
            if(cancelBtn) cancelBtn.onclick = ()=>{ m.close(); resolve(null); };
            m.backdrop.querySelector('#_m_ok').onclick = ()=>{ const v = m.backdrop.querySelector('#_m_input').value; m.close(); resolve(v); };
            setTimeout(()=> {
                const input = m.backdrop.querySelector('#_m_input');
                if(input) input.focus();
            }, 50);
        }
    });
}

function modalConfirm(message){
    return new Promise(resolve=>{
        const m = createModal(`<h3>${message}</h3><div class="actions"><button class="btn ghost" id="_m_no">No</button><button class="btn primary" id="_m_yes">Sí</button></div>`);
        m.backdrop.querySelector('#_m_no').onclick = ()=>{ 
            console.log('Usuario seleccionó NO en confirmación');
            m.close(); 
            setTimeout(() => resolve(false), 100);
        };
        m.backdrop.querySelector('#_m_yes').onclick = ()=>{ 
            console.log('Usuario seleccionó SÍ en confirmación');
            m.close(); 
            setTimeout(() => resolve(true), 100);
        };
    });
}

function modalForm(title, innerHtml){
    return new Promise(resolve=>{
        const m = createModal(`
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
        console.log('[saveData] Datos guardados - Sesiones totales:', mockSesiones.length);
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

// Delete recording for a patient session (asks for psychologist PIN via modalPrompt)
async function deleteRecording(patientId, sessionIndex){
    const p = getPatientById(patientId);
    const pin = await modalPrompt('Ingrese PIN del psicólogo para eliminar la grabación', '', {isPin: true});
    if(!pin) return;
    try{
        const payload = { 
            patientId, 
            patientName: p ? p.nombre : `patient_${patientId}`,
            sessionIndex: sessionIndex || 0,
            pin 
        };
        const resp = await fetch(API_BASE + '/api/delete-recording', { 
            method: 'POST', 
            headers: { 'Content-Type':'application/json' }, 
            body: JSON.stringify(payload) 
        });
        let j = null;
        if(resp.ok){ try{ j = await resp.json(); }catch(e){ j = null; } }
        if(!resp.ok) {
            // If server says recording not found, remove local reference
            if(resp.status === 404){
                // Find the correct session by sessionIndex (global index in mockSesiones)
                const allPatientSessions = mockSesiones.map((s, idx) => s.pacienteId === patientId ? idx : -1).filter(idx => idx !== -1);
                const globalIndex = allPatientSessions[sessionIndex] !== undefined ? allPatientSessions[sessionIndex] : sessionIndex;
                const ps = mockSesiones[globalIndex];
                if(ps && ps.grabacion){ ps.grabacion = []; await saveData(); }
                // Refresh the entire session view to clear all warnings
                openSessionDetail(globalIndex, patientId);
                return console.log('Grabación no encontrada en el servidor. Referencia local eliminada.');
            }
            let body = null;
            try{ body = await resp.text(); }catch(e){}
            return console.log('Error al eliminar: ' + (body || resp.status));
        }
        // Remove local reference if present - find correct session by index
        const allPatientSessions = mockSesiones.map((s, idx) => s.pacienteId === patientId ? idx : -1).filter(idx => idx !== -1);
        const globalIndex = allPatientSessions[sessionIndex] !== undefined ? allPatientSessions[sessionIndex] : sessionIndex;
        const ps = mockSesiones[globalIndex];
        if(ps && ps.grabacion){ ps.grabacion = []; await saveData(); }
        console.log('✅ Grabación eliminada');
        // Refresh the entire session view to clear all warnings
        openSessionDetail(globalIndex, patientId);
    }catch(e){ console.error('Delete recording error', e); console.log('Error al eliminar: ' + e.message); }
}

// Validate psychologist PIN via server
async function validatePsyPin(pin){
    if(!pin) return false;
    
    // PIN por defecto para desarrollo/testing (cambiar en producción)
    const DEFAULT_PIN = '098765';
    
    try{
        const resp = await fetch(API_BASE + '/api/validate-pin', { 
            method: 'POST', 
            headers: { 'Content-Type':'application/json' }, 
            body: JSON.stringify({ pin }) 
        });
        if(!resp.ok) {
            console.log('Servidor no disponible, usando validación local');
            return pin === DEFAULT_PIN;
        }
        const j = await resp.json();
        return j && j.ok === true;
    }catch(e){ 
        console.error('validatePsyPin error (usando validación local):', e);
        // Fallback: validar con PIN por defecto si el servidor no está disponible
        return pin === DEFAULT_PIN;
    }
}

// Build the inner HTML for the grabaciones section for a session
function buildGrabacionesHTML(s, p, sessionIndex){
    if(!s || !p) return '';
    
    // Asegurar que grabacion sea un array
    if(!s.grabacion) s.grabacion = [];
    if(!Array.isArray(s.grabacion)) s.grabacion = [];
    
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
                                // Consider the recording "processing" while there is no local transcription
                                // for a remote recording (server-side processing may still be running).
                                const hasLocalText = grab && grab.transcripcion && String(grab.transcripcion).trim().length > 0;
                                const isProcessing = grab && (grab.processing === true || (grab.remote && !hasLocalText));
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
                                const processedUrl = `${API_BASE}/api/processed/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                                const resp = await fetch(processedUrl, { cache: 'no-store' });
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
                                        const processedUrl = `${API_BASE}/api/processed/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                                        const resp = await fetch(processedUrl, { cache: 'no-store' });
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
    if(!s) return console.log('Sesión no encontrada');
    
    // En lugar de abrir un modal, abrimos la vista de sesión detallada
    const patientId = s.pacienteId;
    openSessionDetail(sessionIndex, patientId);
}

// Clean transcription text: remove header and footer, keep only the dialogue
function cleanTranscriptionText(rawText) {
    if (!rawText || !rawText.trim()) return '';
    
    const lines = rawText.split('\n');
    const cleanedLines = [];
    let insideDialogue = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip the header lines
        if (line.includes('TRANSCRIPCIÓN CON HABLANTES IDENTIFICADOS') || 
            line.match(/^=+$/)) {
            insideDialogue = true;
            continue;
        }
        
        // Stop when we reach the footer statistics
        if (line.includes('HABLANTES IDENTIFICADOS:')) {
            break;
        }
        
        // Only include lines after the header
        if (insideDialogue) {
            cleanedLines.push(line);
        }
    }
    
    // Join and trim extra whitespace at start/end
    return cleanedLines.join('\n').trim();
}

// Open transcription modal for a session's recording
async function openTranscriptionModal(sessionIndex, patientId){
    const s = mockSesiones[sessionIndex];
    if(!s) return console.log('Sesión no encontrada');
    if(!s.grabacion || s.grabacion.length === 0) return console.log('No hay grabación para transcribir');
    
    // Get or initialize transcription
    let transcription = s.grabacion[0].transcripcion || '';

    // Prefer the server's labeled text file when available. Do NOT trigger processing here.
    // This ensures the modal only shows the `_labeled.txt` content (speaker-labelled blocks).
    try{
        const p = getPatientById(patientId);
        const processedUrl = `${API_BASE}/api/processed/${patientId}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
        const resp = await fetch(processedUrl, { cache: 'no-store' });
        if(resp && resp.ok){
            const pj = await resp.json();
            const txt = extractProcessedText(pj) || (pj.transcription_text || pj.text || '');
            if(txt && String(txt).trim()){
                transcription = txt;
                // persist locally for UI consistency
                if(!s.grabacion) s.grabacion = [{}];
                s.grabacion[0].transcripcion = txt;
                s.grabacion[0].processing = false;
                try{ await saveData(); }catch(e){}
                try{ refreshGrabacionesUI(s, p, sessionIndex); }catch(e){}
            } else {
                // leave transcription empty — will show 'no transcription available' message
            }
        }
    }catch(e){ console.warn('openTranscriptionModal: error checking /api/processed/', e); }
    
    // Clean the transcription to show only the dialogue
    transcription = cleanTranscriptionText(transcription);
    
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
        // make sure it fills the modal area. Only show labeled transcription blocks.
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
            // If transcription is empty, show a clear message that the labeled file is not ready
            pre.textContent = transcription && String(transcription).trim() ? transcription : '(No hay transcripción etiquetada disponible aún)';
        }

        // Wire the close button (it's inside the modal HTML)
        const closeBtn = modal.backdrop.querySelector('#_trans_close');
        if(closeBtn) closeBtn.onclick = ()=> modal.close();
    }catch(e){ console.error('openTranscriptionModal modal wiring error', e); }
}



// Psychologist profile data
let psychologistProfile = {
    nombre: 'Dr. Psicólogo',
    especialidad: 'Psicología Clínica',
    cedula: '12345678',
    email: 'psicologo@example.com',
    telefono: '+57 300 123 4567',
    voiceSampleRecorded: false,
    pin: '123456' // Default PIN
};

function renderPsychologistProfile() {
    // Load from localStorage if exists
    const saved = localStorage.getItem('psychologist_profile');
    if(saved) {
        try {
            psychologistProfile = JSON.parse(saved);
        } catch(e) { console.warn('Error loading psychologist profile', e); }
    }

    mainContent.innerHTML = `
        <div class="patient-detail-header">
            <div class="patient-detail-title">
                <div class="patient-avatar-large">
                    <span class="avatar-icon-large">👨‍⚕️</span>
                </div>
                <div>
                    <h1 class="patient-detail-name">${psychologistProfile.nombre}</h1>
                    <p class="patient-detail-subtitle">${psychologistProfile.especialidad}</p>
                </div>
            </div>
            <button onclick="editPsychologistProfile()" class="create-session-btn">
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
                            <span class="info-value">${psychologistProfile.especialidad}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">🎫</span>
                        <div class="info-content">
                            <span class="info-label">Cédula Profesional</span>
                            <span class="info-value">${psychologistProfile.cedula}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">📧</span>
                        <div class="info-content">
                            <span class="info-label">Email</span>
                            <span class="info-value">${psychologistProfile.email}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">📞</span>
                        <div class="info-content">
                            <span class="info-label">Teléfono</span>
                            <span class="info-value">${psychologistProfile.telefono}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card patient-history-card">
                <div class="card-header-modern">
                    <h3>🎭 Reconocimiento de Voz</h3>
                </div>
                <div class="voice-training-section">
                    <div class="voice-status ${psychologistProfile.voiceSampleRecorded ? 'voice-recorded' : 'voice-not-recorded'}">
                        <div class="voice-status-icon">
                            ${psychologistProfile.voiceSampleRecorded ? '✅' : '⚠️'}
                        </div>
                        <div class="voice-status-text">
                            <h4>${psychologistProfile.voiceSampleRecorded ? 'Voz registrada' : 'Voz no registrada'}</h4>
                            <p>${psychologistProfile.voiceSampleRecorded ? 
                                'Tu muestra de voz está registrada. Esto ayuda a identificarte en las transcripciones.' : 
                                'Registra tu voz para mejorar la identificación en las transcripciones de sesiones.'}
                            </p>
                        </div>
                    </div>

                    <div class="voice-training-controls">
                        <h4 class="voice-section-title">🎤 Entrenamiento de Voz</h4>
                        <p class="voice-instructions">
                            Lee el siguiente texto en voz alta para registrar tu patrón de voz:
                        </p>
                        <div class="voice-sample-text">
                            "Hola, soy el psicólogo de esta sesión. Este sistema me permite analizar y transcribir las conversaciones con mis pacientes de manera confidencial y profesional."
                        </div>

                        <div class="voice-record-container">
                            <button class="voice-record-btn" id="voiceRecordBtn" onclick="toggleVoiceRecording()">
                                <span class="record-icon" id="recordIcon">🎤</span>
                                <span id="recordText">Iniciar Grabación de Voz</span>
                            </button>
                            <div class="voice-timer" id="voiceTimer" style="display: none;">00:00</div>
                        </div>

                        <div class="voice-playback" id="voicePlayback" style="display: none;">
                            <h4>Vista previa de tu muestra de voz:</h4>
                            <audio id="voiceAudioPreview" controls style="width: 100%;"></audio>
                            <div class="voice-actions">
                                <button class="voice-action-btn retry-btn" onclick="retryVoiceRecording()">
                                    <span>🔄</span>
                                    <span>Volver a grabar</span>
                                </button>
                                <button class="voice-action-btn save-btn" onclick="saveVoiceSample()">
                                    <span>💾</span>
                                    <span>Guardar muestra</span>
                                </button>
                            </div>
                        </div>
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
                    <button class="security-btn" onclick="changePsychologistPIN()">
                        <span>🔄</span>
                        <span>Cambiar PIN</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Voice recording variables
let voiceMediaRecorder = null;
let voiceAudioChunks = [];
let voiceRecordingTimer = null;
let voiceRecordingSeconds = 0;

async function toggleVoiceRecording() {
    const btn = document.getElementById('voiceRecordBtn');
    const icon = document.getElementById('recordIcon');
    const text = document.getElementById('recordText');
    const timer = document.getElementById('voiceTimer');
    
    if(!voiceMediaRecorder || voiceMediaRecorder.state === 'inactive') {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            voiceMediaRecorder = new MediaRecorder(stream);
            voiceAudioChunks = [];
            voiceRecordingSeconds = 0;
            
            voiceMediaRecorder.ondataavailable = (event) => {
                voiceAudioChunks.push(event.data);
            };
            
            voiceMediaRecorder.onstop = () => {
                const audioBlob = new Blob(voiceAudioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                const preview = document.getElementById('voiceAudioPreview');
                if(preview) {
                    preview.src = audioUrl;
                }
                document.getElementById('voicePlayback').style.display = 'block';
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };
            
            voiceMediaRecorder.start();
            btn.classList.add('recording');
            icon.textContent = '⏹️';
            text.textContent = 'Detener Grabación';
            timer.style.display = 'block';
            
            // Start timer
            voiceRecordingTimer = setInterval(() => {
                voiceRecordingSeconds++;
                const mins = Math.floor(voiceRecordingSeconds / 60);
                const secs = voiceRecordingSeconds % 60;
                timer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            }, 1000);
            
        } catch(error) {
            console.error('Error accessing microphone:', error);
            alert('No se pudo acceder al micrófono. Por favor verifica los permisos.');
        }
    } else {
        // Stop recording
        voiceMediaRecorder.stop();
        btn.classList.remove('recording');
        icon.textContent = '🎤';
        text.textContent = 'Iniciar Grabación de Voz';
        clearInterval(voiceRecordingTimer);
    }
}

function retryVoiceRecording() {
    document.getElementById('voicePlayback').style.display = 'none';
    document.getElementById('voiceTimer').textContent = '00:00';
    voiceAudioChunks = [];
}

async function saveVoiceSample() {
    const pin = await modalPrompt('Ingrese su PIN para guardar la muestra de voz', '', {isPin: true});
    if(!pin) return;
    
    const okPin = await validatePsyPin(pin);
    if(!okPin) {
        console.log('PIN incorrecto');
        return;
    }
    
    try {
        // Create blob from recorded chunks
        if(!voiceAudioChunks || voiceAudioChunks.length === 0) {
            console.log('No hay audio grabado');
            return;
        }
        
        const audioBlob = new Blob(voiceAudioChunks, { type: 'audio/webm' });
        
        // Convert to WAV for better compatibility
        const wavBlob = await blobToWavBlob(audioBlob);
        
        // Send to server
        const formData = new FormData();
        formData.append('voiceSample', wavBlob, 'psychologist_voice_sample.wav');
        formData.append('pin', pin);
        
        const resp = await fetch(API_BASE + '/api/save-voice-sample', {
            method: 'POST',
            body: formData
        });
        
        if(!resp.ok) {
            const errorText = await resp.text();
            console.log('Error al guardar muestra de voz: ' + errorText);
            return;
        }
        
        const result = await resp.json();
        
        psychologistProfile.voiceSampleRecorded = true;
        psychologistProfile.voiceSamplePath = result.filePath || '/refs/psychologist_voice.wav';
        localStorage.setItem('psychologist_profile', JSON.stringify(psychologistProfile));
        
        console.log('✅ Muestra de voz guardada correctamente en ' + psychologistProfile.voiceSamplePath);
        renderPsychologistProfile();
        
    } catch(error) {
        console.error('Error al guardar muestra de voz:', error);
        console.log('Error al guardar la muestra de voz');
    }
}

async function editPsychologistProfile() {
    const form = `
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">👤</span>
                <span>Nombre completo</span>
            </label>
            <input name="nombre" value="${psychologistProfile.nombre}" class="modern-input" required>
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">🎓</span>
                <span>Especialidad</span>
            </label>
            <input name="especialidad" value="${psychologistProfile.especialidad}" class="modern-input" required>
        </div>
        <div class="modern-form-row">
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">🎫</span>
                    <span>Cédula Profesional</span>
                </label>
                <input name="cedula" value="${psychologistProfile.cedula}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📞</span>
                    <span>Teléfono</span>
                </label>
                <input name="telefono" value="${psychologistProfile.telefono}" class="modern-input" required>
            </div>
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">📧</span>
                <span>Email</span>
            </label>
            <input name="email" type="email" value="${psychologistProfile.email}" class="modern-input" required>
        </div>
    `;
    
    const data = await modalForm('Editar Perfil Profesional', form);
    if(!data) return;
    
    const pin = await modalPrompt('Ingrese su PIN para confirmar los cambios', '', {isPin: true});
    if(!pin) return;
    
    const okPin = await validatePsyPin(pin);
    if(!okPin) {
        console.log('PIN incorrecto');
        return;
    }
    
    psychologistProfile.nombre = data.nombre;
    psychologistProfile.especialidad = data.especialidad;
    psychologistProfile.cedula = data.cedula;
    psychologistProfile.telefono = data.telefono;
    psychologistProfile.email = data.email;
    
    localStorage.setItem('psychologist_profile', JSON.stringify(psychologistProfile));
    console.log('✅ Perfil actualizado correctamente');
    renderPsychologistProfile();
}

async function changePsychologistPIN() {
    const currentPin = await modalPrompt('Ingrese su PIN actual', '', {isPin: true});
    if(!currentPin) return;
    
    const okPin = await validatePsyPin(currentPin);
    if(!okPin) {
        console.log('PIN incorrecto');
        return;
    }
    
    const newPin = await modalPrompt('Ingrese su nuevo PIN (6 dígitos)', '', {isPin: true});
    if(!newPin || newPin.length !== 6) {
        console.log('PIN inválido');
        return;
    }
    
    const confirmPin = await modalPrompt('Confirme su nuevo PIN', '', {isPin: true});
    if(newPin !== confirmPin) {
        console.log('Los PINs no coinciden');
        return;
    }
    
    psychologistProfile.pin = newPin;
    localStorage.setItem('psychologist_profile', JSON.stringify(psychologistProfile));
    console.log('✅ PIN actualizado correctamente');
}

async function editPatientInfo(patientId, pushHistory = true) {
    const p = getPatientById(patientId);
    if(!p) return;
    
    // Cambiar URL a /pacientes/:id/editar solo si pushHistory es true
    if (pushHistory) {
        window.history.pushState({ module: 'pacientes', params: { id: patientId, action: 'editar' } }, '', `/pacientes/${patientId}/editar`);
    }
    
    const form = `
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">👤</span>
                <span>Nombre completo</span>
            </label>
            <input name="nombre" value="${p.nombre}" class="modern-input" required>
        </div>
        <div class="modern-form-row">
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">🎂</span>
                    <span>Edad</span>
                </label>
                <input name="edad" type="number" value="${p.edad}" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📞</span>
                    <span>Contacto</span>
                </label>
                <input name="contacto" value="${p.contacto}" class="modern-input" required>
            </div>
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">📍</span>
                <span>Dirección</span>
            </label>
            <input name="direccion" value="${p.direccion}" class="modern-input" required>
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">📝</span>
                <span>Motivo de consulta</span>
            </label>
            <input name="motivo" value="${p.motivo}" class="modern-input" required>
        </div>
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">📚</span>
                <span>Antecedentes</span>
            </label>
            <textarea name="antecedentes" class="modern-input" rows="4" required>${p.antecedentes}</textarea>
        </div>
        <div class="form-hint">
            <span class="hint-icon">💡</span>
            <span>Los cambios requerirán validación con PIN del psicólogo</span>
        </div>
    `;
    
    const data = await modalForm('Editar ficha del paciente', form);
    if(!data) return;
    
    // Require PIN for editing patient info
    const pin = await modalPrompt('Ingrese PIN del psicólogo para autorizar los cambios', '', {isPin: true});
    if(!pin) return;
    
    const okPin = await validatePsyPin(pin);
    if(!okPin) {
        console.log('PIN incorrecto');
        return;
    }
    
    // Update patient info
    p.nombre = data.nombre;
    p.edad = parseInt(data.edad);
    p.contacto = data.contacto;
    p.direccion = data.direccion;
    p.motivo = data.motivo;
    p.antecedentes = data.antecedentes;
    
    await saveData();
    console.log('✅ Información del paciente actualizada');
    
    // Refresh patient view
    showPatient(patientId);
}

async function deleteSession(sessionIndex, patientId) {
    const session = mockSesiones[sessionIndex];
    if(!session) {
        console.log('Sesión no encontrada en índice:', sessionIndex);
        alert('Error: Sesión no encontrada');
        return;
    }
    
    console.log('🗑️ Iniciando eliminación de sesión:', sessionIndex);
    console.log('Sesión a eliminar:', session);
    
    const confirm = await modalConfirm(`¿Estás seguro de que deseas eliminar la sesión del ${session.fecha}?`);
    console.log('✅ Confirmación recibida:', confirm);
    
    if(!confirm) {
        console.log('Eliminación cancelada por el usuario');
        return;
    }
    
    // Require PIN for deleting sessions
    console.log('Solicitando PIN...');
    const pin = await modalPrompt('Ingrese PIN del psicólogo para autorizar la eliminación', '', {isPin: true});
    console.log('PIN recibido:', pin ? '(ingresado)' : '(cancelado)');
    if(!pin) {
        console.log('PIN no ingresado, cancelando eliminación');
        return;
    }
    
    console.log('Validando PIN...');
    const okPin = await validatePsyPin(pin);
    console.log('PIN válido:', okPin);
    if(!okPin) {
        alert('❌ PIN incorrecto. El PIN por defecto es: 098765');
        console.log('❌ PIN incorrecto');
        return;
    }
    
    // Delete session by index
    console.log('✅ PIN correcto. Procediendo a eliminar...');
    console.log('Eliminando sesión en índice:', sessionIndex, 'Total sesiones antes:', mockSesiones.length);
    
    mockSesiones.splice(sessionIndex, 1);
    
    console.log('Total sesiones después:', mockSesiones.length);
    
    await saveData();
    console.log('✅ Datos guardados en localStorage');
    
    alert('✅ Sesión eliminada correctamente');
    
    // Refresh patient view
    console.log('Re-renderizando vista del paciente:', patientId);
    showPatient(patientId, false);
}

function showPatient(id, pushHistory = true) {
    console.log('showPatient llamado con id:', id, 'pushHistory:', pushHistory);
    const p = getPatientById(id);
    activePatientId = id;
    if(!p) return;
    
    // Cambiar URL a /pacientes/:id solo si pushHistory es true
    if (pushHistory) {
        window.history.pushState({ module: 'pacientes', params: { id } }, '', `/pacientes/${id}`);
    }

    mainContent.innerHTML = `
        <div class="patient-detail-header">
            <div class="patient-detail-title">
                <div class="patient-avatar-large">
                    <span class="avatar-icon-large">👤</span>
                </div>
                <div>
                    <h1 class="patient-detail-name">${p.nombre}</h1>
                    <p class="patient-detail-subtitle">ID: ${p.id} • Paciente activo</p>
                </div>
            </div>
            <button class="create-session-btn" data-patient-id="${p.id}" data-action="create-session">
                <span>➕</span>
                <span>Crear nueva sesión</span>
            </button>
        </div>

        <div class="patient-detail-grid">
            <div class="card patient-info-card">
                <div class="card-header-modern">
                    <h3>📋 Ficha del paciente</h3>
                    <button class="edit-patient-btn" data-patient-id="${p.id}" data-action="edit-patient">
                        <span>✏️</span>
                        <span>Editar</span>
                    </button>
                </div>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-icon">🎂</span>
                        <div class="info-content">
                            <span class="info-label">Edad</span>
                            <span class="info-value">${p.edad} años</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">📝</span>
                        <div class="info-content">
                            <span class="info-label">Motivo</span>
                            <span class="info-value">${p.motivo}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">📞</span>
                        <div class="info-content">
                            <span class="info-label">Contacto</span>
                            <span class="info-value">${p.contacto}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <span class="info-icon">📍</span>
                        <div class="info-content">
                            <span class="info-label">Dirección</span>
                            <span class="info-value">${p.direccion}</span>
                        </div>
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
                        <p class="history-text">${p.antecedentes}</p>
                    </div>
                    
                    <div class="history-item">
                        <h4 class="history-subtitle">Consentimiento</h4>
                        <div id="consentList" class="consent-list">
                            ${p.consents.length ? p.consents.map((c, idx)=>{
                                const hasFile = c.file ? true : false;
                                const authorized = c.grabacionAutorizada || false;
                                return `
                                    <div class="modern-consent-item ${hasFile ? 'has-file' : ''}">
                                        <div class="consent-content">
                                            <span class="consent-icon">📄</span>
                                            <span class="consent-type">${c.tipo}</span>
                                            ${c.file ? `<a href="${c.file}" target="_blank" class="consent-link">ver archivo</a>` : ''}
                                        </div>
                                        ${hasFile && authorized ? `
                                            <span class="consent-badge authorized">
                                                ✅ Autorizado para grabación
                                            </span>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('') : '<div class="empty-consent">No hay consentimiento cargado.</div>'}
                        </div>
                        <div class="consent-actions">
                            ${p.consents.length === 0 ? 
                                `<button id="addConsentBtn" class="consent-btn add-btn">
                                    <span>➕</span>
                                    <span>Agregar consentimiento</span>
                                </button>` : 
                                `<button id="editConsentBtn" class="consent-btn edit-btn">
                                    <span>✏️</span>
                                    <span>Editar consentimiento</span>
                                </button>`
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header-modern">
                <h3>📊 Genograma Familiar</h3>
            </div>
            <div style="padding:20px;">
                <p style="color:#4b5563; font-size:14px; margin-bottom:16px;">
                    Visualiza el diagrama familiar del paciente basado en las transcripciones de sesiones.
                </p>
                <button onclick="viewGenograma(${p.id})" class="btn primary" style="width:100%; background:linear-gradient(135deg, #00838f 0%, #006064 100%); color:white; padding:12px; border-radius:8px; font-size:14px; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <span>📊</span>
                    <span>${p.genogramaHtml ? 'Ver genograma generado' : 'Generar genograma'}</span>
                </button>
            </div>
        </div>

        <div class="card sessions-card">
            <div class="card-header-modern">
                <h3>💼 Sesiones del paciente</h3>
                <span class="sessions-count">${mockSesiones.filter(s=>s.pacienteId===p.id).length} sesiones</span>
            </div>
            <div class="sessions-list">
                ${mockSesiones.filter(s=>s.pacienteId===p.id).length ? 
                    mockSesiones.map((s, idx)=>s.pacienteId===p.id ? {session: s, index: idx} : null)
                        .filter(item => item !== null)
                        .map((item)=>{
                            console.log('Generando HTML para sesión con índice global:', item.index, 'fecha:', item.session.fecha);
                            return `
                                <div class="session-list-item">
                                    <div class="session-item-content" data-session-index="${item.index}">
                                        <div class="session-date-badge">
                                            <span class="date-icon">📅</span>
                                            <span class="date-text">${item.session.fecha}</span>
                                        </div>
                                        <div class="session-notes">${item.session.notas}</div>
                                        <span class="session-arrow">→</span>
                                    </div>
                                    <button class="delete-session-btn" data-session-index="${item.index}" data-action="delete-session" title="Eliminar sesión">
                                        <span>🗑️</span>
                                    </button>
                                </div>
                            `;
                        }).join('') :
                    '<div class="empty-sessions">No hay sesiones registradas</div>'
                }
            </div>
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
            const pinAuth = await modalPrompt('Ingrese PIN del psicólogo para autorizar este consentimiento', '', {isPin: true});
            if(!pinAuth) return;
            const okPin = await validatePsyPin(pinAuth);
            if(!okPin) return;

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
    
    // Agregar event listeners para botones de paciente
    const createSessionBtn = mainContent.querySelector('[data-action="create-session"]');
    if (createSessionBtn) {
        createSessionBtn.addEventListener('click', () => {
            navigateToModule('pacientes', { id: p.id, action: 'nueva-sesion' });
        });
    }
    
    const editPatientBtn = mainContent.querySelector('[data-action="edit-patient"]');
    if (editPatientBtn) {
        editPatientBtn.addEventListener('click', () => {
            navigateToModule('pacientes', { id: p.id, action: 'editar' });
        });
    }
    
    // Event listeners para items de sesión
    const sessionItems = mainContent.querySelectorAll('.session-item-content[data-session-index]');
    console.log('Aplicando event listeners a', sessionItems.length, 'sesiones');
    sessionItems.forEach((item, idx) => {
        const sessionIndex = parseInt(item.getAttribute('data-session-index'));
        console.log('Listener agregado a sesión índice:', sessionIndex);
        
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en sesión:', sessionIndex);
            openSessionDetail(sessionIndex, p.id);
        });
    });
    
    // Event listeners para botones de eliminar sesión
    const deleteButtons = mainContent.querySelectorAll('.delete-session-btn[data-action="delete-session"]');
    console.log('🔍 Aplicando event listeners a', deleteButtons.length, 'botones de eliminar');
    
    deleteButtons.forEach((btn, idx) => {
        const sessionIndex = parseInt(btn.getAttribute('data-session-index'));
        console.log('🔍 Listener de eliminación agregado a sesión índice:', sessionIndex, 'Botón:', btn);
        
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🗑️🗑️🗑️ CLICK DETECTADO en botón eliminar para sesión:', sessionIndex);
            await deleteSession(sessionIndex, p.id);
        });
    });
}

// Quick actions
async function quickRegisterSession(){
    const pid = await modalPrompt('Ingresa ID del paciente para registrar sesión (ej: 1)');
    if(!pid) return;
    const paciente = getPatientById(parseInt(pid));
    if(!paciente){ console.log('Paciente no encontrado'); return; }
    const notas = await modalPrompt('Notas breves de la sesión');
    mockSesiones.push({ pacienteId: paciente.id, fecha: new Date().toISOString().slice(0,10), notas: notas || 'Registro rápido', soap: null, attachments: [] });
    await saveData();
    console.log('Sesión registrada (mock)');
    loadModule('dashboard');
}

async function quickCreateCita(){
    // Cambiar URL a /agenda/nueva
    window.history.pushState(
        { module: 'agenda', params: { action: 'nueva' } },
        '',
        `/agenda/nueva`
    );
    
    const patientOptions = mockPacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    const form = `
        <div class="modern-form-group">
            <label class="modern-label">
                <span class="label-icon">👤</span>
                <span>Seleccionar paciente</span>
            </label>
            <select name="pid" class="modern-select">
                <option value="">Seleccionar paciente...</option>
                ${patientOptions}
            </select>
        </div>
        <div class="modern-form-row">
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">📅</span>
                    <span>Fecha</span>
                </label>
                <input name="fecha" type="date" class="modern-input" required>
            </div>
            <div class="modern-form-group">
                <label class="modern-label">
                    <span class="label-icon">🕐</span>
                    <span>Hora</span>
                </label>
                <input name="hora" type="time" class="modern-input" required>
            </div>
        </div>
        <div class="form-hint">
            <span class="hint-icon">💡</span>
            <span>La cita se creará con estado "Pendiente"</span>
        </div>
    `;
    const formData = await modalForm('Crear cita', form);
    if(!formData) return;
    if(!formData.pid || !formData.fecha || !formData.hora) return console.log('Datos incompletos');
    mockAgenda.push({ fecha: formData.fecha, hora: formData.hora, pacienteId: parseInt(formData.pid), estado: 'Pendiente' });
    await saveData();
    console.log('✅ Cita creada correctamente');
    loadModule('agenda');
}

// Session / PIN logic for demo
async function promptStartSession(patientId){
    const p = getPatientById(patientId);
    if(!p) return;
    const want = await modalConfirm('¿Desea grabar la sesión? (Si acepta necesitará ingresar PIN)');
    if(!want){ console.log('Sesión iniciada sin grabación (demo)'); return; }
    const pin = await modalPrompt('Ingrese PIN del psicólogo para autorizar grabación');
    if(!pin) return console.log('Operación cancelada');
    const ok = await validatePsyPin(pin);
    if(ok){
        console.log('✅ Grabación habilitada');
        const newSess = { pacienteId: p.id, fecha: new Date().toISOString().slice(0,10), notas: 'Sesión con grabación (mock)', soap: null, attachments: [] };
        mockSesiones.push(newSess);
        await saveData();
        showPatient(p.id);
    }
}

function startSessionPrompt(){
    const sel = document.getElementById('sessionPatientSelect');
    const pid = parseInt(sel.value);
    promptStartSession(pid);
}

async function createNewSessionForPatient(patientId, pushHistory = true){
    const p = getPatientById(patientId);
    if(!p) return console.log('Paciente no encontrado');
    
    // Cambiar URL a /pacientes/:id/sesiones/nueva solo si pushHistory es true
    if (pushHistory) {
        window.history.pushState({ module: 'pacientes', params: { id: patientId, action: 'nueva-sesion' } }, '', `/pacientes/${patientId}/sesiones/nueva`);
    }
    
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
            console.log('❌ No se puede grabar la sesión. Debe subir un consentimiento firmado con autorización de grabación primero.');
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
            console.log('✅ Sesión creada con grabación habilitada');
        } else {
            console.log('✅ Sesión creada exitosamente');
        }
        
        modal.close();
        showPatient(p.id);
    };
}

async function openSessionDetail(sessionIndex, patientId){
    // Prevenir abrir modal si ya hay uno abierto
    const modalRoot = document.getElementById('modalRoot');
    if(modalRoot && modalRoot.firstChild) {
        console.log('⚠️ Ya hay un modal abierto, ignorando click');
        return;
    }
    
    console.log('🔷 Abriendo sesión detail para índice:', sessionIndex, 'paciente:', patientId);
    
    const s = mockSesiones[sessionIndex];
    const p = getPatientById(patientId);
    if(!s || !p) return console.log('Sesión o paciente no encontrado');
    
    // Cambiar URL a /sesiones/:sessionIndex
    window.history.pushState({ module: 'sesiones', params: { id: sessionIndex } }, '', `/sesiones/${sessionIndex}`);
    
    // Inicializar datos de sesión si no existen
    if(!s.enfoque) s.enfoque = '';
    if(!s.analisis) s.analisis = '';
    if(!s.resumen) s.resumen = '';
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
    
    const sessionModalHtml = `
        <div style="background:linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding:24px; margin:-32px -32px 24px -32px; border-radius:12px 12px 0 0; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h2 style="color:white; margin:0; font-size:24px; font-weight:700;">Sesión: ${s.fecha}</h2>
                <p style="color:rgba(255,255,255,0.9); margin:8px 0 0 0; font-size:14px;"><strong>Paciente:</strong> ${p.nombre}</p>
            </div>
            <button id="_start_recording_btn" class="btn" style="background:linear-gradient(135deg, #f44336 0%, #d32f2f 100%); color:white; padding:12px 24px; border-radius:8px; display:flex; align-items:center; gap:10px; font-size:14px; box-shadow:0 4px 12px rgba(244,67,54,0.4); border:none; cursor:pointer;">
                <span style="font-size:20px;">⏺️</span>
                <span style="font-weight:600;">Iniciar grabación</span>
            </button>
        </div>

        <div style="max-height:calc(92vh - 200px); overflow-y:auto; padding:0 4px;">
            <div style="background:linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 50%); padding:12px 16px; border-radius:8px; border-left:4px solid #00bcd4; margin-bottom:24px;">
                <strong style="color:#00838f;">Notas:</strong> <span style="color:#374151;">${s.notas}</span>
            </div>

            <!-- SOAP -->
            <div style="margin-bottom:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="color:#00838f; display:flex; align-items:center; gap:8px; margin:0; font-size:18px;">
                        <span style="font-size:20px;">📋</span> SOAP
                    </h3>
                    <div style="display:flex; gap:8px;">
                        <button id="_edit_soap_btn" class="btn" style="background:linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color:white; padding:8px 16px; font-size:14px; border-radius:8px;">✏️ Editar</button>
                        <button id="_generate_summary_btn" class="btn" style="background:linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%); color:white; padding:8px 16px; font-size:14px; border-radius:8px;">✨ Generar resumen</button>
                    </div>
                </div>
                <div style="display:grid; gap:12px;">
                    <div style="padding:12px; background:#f9fafb; border-radius:8px; border:2px solid #e5e7eb;">
                        <h4 style="color:#00838f; margin:0 0 6px 0; font-size:13px; font-weight:600;">Subjetivo</h4>
                        <p style="margin:0; color:#4b5563; line-height:1.5; font-size:14px;">${s.soap?.s || '<em style="color:#9ca3af;">(Sin datos)</em>'}</p>
                    </div>
                    <div style="padding:12px; background:#f9fafb; border-radius:8px; border:2px solid #e5e7eb;">
                        <h4 style="color:#00838f; margin:0 0 8px 0; font-size:13px; font-weight:600;">Objetivo</h4>
                        ${(() => {
                            const obj = s.soap?.o;
                            if (!obj) return '<p style="margin:0; color:#9ca3af; font-style:italic;">(Sin datos)</p>';
                            if (typeof obj === 'string') return `<p style="margin:0; color:#4b5563; line-height:1.5; font-size:14px;">${obj}</p>`;
                            
                            // Display structured data
                            return `
                                <div style="font-size:13px; line-height:1.6;">
                                    ${obj.apariencia ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Apariencia y conducta:</strong> <span style="color:#6b7280;">${obj.apariencia}</span></div>` : ''}
                                    ${(obj.animo || obj.afecto) ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Ánimo y afecto:</strong> ${obj.animo ? `<span style="color:#6b7280;">Ánimo: ${obj.animo}</span>` : ''} ${obj.afecto ? `<span style="color:#6b7280;"> | Afecto: ${obj.afecto}</span>` : ''}</div>` : ''}
                                    ${(obj.pensamiento_estructura || obj.pensamiento_velocidad || obj.pensamiento_contenido) ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Pensamiento:</strong> ${obj.pensamiento_estructura ? `<span style="color:#6b7280;">Estructura: ${obj.pensamiento_estructura}</span>` : ''} ${obj.pensamiento_velocidad ? `<span style="color:#6b7280;"> | Velocidad: ${obj.pensamiento_velocidad}</span>` : ''} ${obj.pensamiento_contenido ? `<span style="color:#6b7280;"> | Contenido: ${obj.pensamiento_contenido}</span>` : ''}</div>` : ''}
                                    ${obj.motricidad ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Motricidad:</strong> <span style="color:#6b7280;">${obj.motricidad}</span></div>` : ''}
                                    ${obj.insight ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Insight:</strong> <span style="color:#6b7280;">${obj.insight}</span></div>` : ''}
                                    ${(obj.juicio || obj.sentido) ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Juicio y sentido de realidad:</strong> ${obj.juicio ? `<span style="color:#6b7280;">Juicio: ${obj.juicio}</span>` : ''} ${obj.sentido ? `<span style="color:#6b7280;"> | Sentido: ${obj.sentido}</span>` : ''}</div>` : ''}
                                    ${(obj.consciencia_cuantitativa || obj.consciencia_cualitativa || obj.consciencia_sueno) ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Consciencia:</strong> ${obj.consciencia_cuantitativa ? `<span style="color:#6b7280;">Cuant.: ${obj.consciencia_cuantitativa}</span>` : ''} ${obj.consciencia_cualitativa ? `<span style="color:#6b7280;"> | Cual.: ${obj.consciencia_cualitativa}</span>` : ''} ${obj.consciencia_sueno ? `<span style="color:#6b7280;"> | Sueño/vigilia: ${obj.consciencia_sueno}</span>` : ''}</div>` : ''}
                                    ${(obj.orientacion_autopsiquica || obj.orientacion_alopsiquica) ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Orientación:</strong> ${obj.orientacion_autopsiquica ? `<span style="color:#6b7280;">Autopsíquica: ${obj.orientacion_autopsiquica}</span>` : ''} ${obj.orientacion_alopsiquica ? `<span style="color:#6b7280;"> | Alopsíquica: ${obj.orientacion_alopsiquica}</span>` : ''}</div>` : ''}
                                    ${obj.percepcion ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Percepción:</strong> <span style="color:#6b7280;">${obj.percepcion}</span></div>` : ''}
                                    ${obj.cognicion ? `<div style="margin-bottom:6px;"><strong style="color:#374151;">Cognición:</strong> <span style="color:#6b7280;">${obj.cognicion}</span></div>` : ''}
                                </div>
                            `;
                        })()}
                    </div>
                </div>
            </div>

            <!-- ENFOQUE -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px; font-size:18px; margin:0 0 12px 0;">
                    <span style="font-size:20px;">🎯</span> Enfoque Psicológico
                </h3>
                <select id="_enfoque_select" style="width:100%; padding:12px; border:2px solid #e5e7eb; border-radius:8px; font-size:14px; background:#fff; color:#4b5563; cursor:pointer;">
                    <option value="">Seleccionar enfoque...</option>
                    ${enfoques.map(e => `<option value="${e}" ${s.enfoque === e ? 'selected' : ''}>${e}</option>`).join('')}
                </select>
            </div>

            <!-- ANÁLISIS -->
            <div style="margin-bottom:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="color:#00838f; display:flex; align-items:center; gap:8px; margin:0; font-size:18px;">
                        <span style="font-size:20px;">🔍</span> Análisis
                    </h3>
                    <button id="_realizar_analisis_btn" class="btn" style="background:linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color:white; padding:8px 16px; font-size:14px; border-radius:8px;">🔬 Realizar análisis</button>
                </div>
                <div style="padding:12px; background:#f9fafb; border:2px solid #e5e7eb; border-radius:8px; min-height:60px;">
                    <p id="_analisis_output" style="margin:0; color:#4b5563; line-height:1.5; font-size:14px;">${s.analisis || '<em style="color:#9ca3af;">(Sin análisis)</em>'}</p>
                </div>
            </div>

            <!-- RESUMEN -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px; font-size:18px; margin:0 0 12px 0;">
                    <span style="font-size:20px;">📄</span> Resumen
                </h3>
                <div style="padding:12px; background:#f9fafb; border:2px solid #e5e7eb; border-radius:8px; min-height:60px;">
                    <p style="margin:0; color:#4b5563; line-height:1.5; font-size:14px;">${s.resumen || '<em style="color:#9ca3af;">(Sin resumen)</em>'}</p>
                </div>
            </div>

            <!-- PLANIFICACIÓN -->
            <div style="margin-bottom:24px;">
                <h3 style="color:#00838f; display:flex; align-items:center; gap:8px; font-size:18px; margin:0 0 12px 0;">
                    <span style="font-size:20px;">📝</span> Planificación
                </h3>
                <div style="padding:12px; background:#f9fafb; border:2px solid #e5e7eb; border-radius:8px; min-height:60px;">
                    <p style="margin:0; color:#4b5563; line-height:1.5; font-size:14px;">${s.planificacion || '<em style="color:#9ca3af;">(Sin planificación)</em>'}</p>
                </div>
            </div>

            <!-- GRABACIONES -->
            <div id="_grabaciones_container" style="margin-bottom:24px;">
                ${buildGrabacionesHTML(s, p, sessionIndex)}
            </div>
        </div>

        <div style="margin-top:24px; padding-top:20px; border-top:2px solid #e5e7eb; display:flex; gap:8px; justify-content:flex-end;">
            <button id="_session_close" class="btn" style="background:linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color:white; padding:10px 20px; border-radius:8px; font-size:14px;">Cerrar</button>
        </div>
    `;
    
    const modal = createModal(sessionModalHtml);
    
    // Botón realizar análisis
    document.getElementById('_realizar_analisis_btn').onclick = async ()=>{
        const btn = document.getElementById('_realizar_analisis_btn');
        const outEl = document.getElementById('_analisis_output');

        const enfoqueLabel = document.getElementById('_enfoque_select')?.value || s.enfoque || '';
        const collection = enfoqueLabelToCollection(enfoqueLabel);

        if(!collection){
            alert('Selecciona un enfoque antes de realizar el análisis.');
            return;
        }

        const subjetivo = (s.soap && typeof s.soap.s === 'string') ? s.soap.s.trim() : '';
        if(!subjetivo){
            alert('Completa el SOAP Subjetivo antes de realizar el análisis.');
            return;
        }

        const query = [
            'Con base EXCLUSIVAMENTE en el siguiente texto (SOAP Subjetivo), redacta un análisis clínico breve y accionable.',
            'Adapta el análisis al enfoque seleccionado (usa los fragmentos recuperados del libro).',
            'No emitas diagnósticos definitivos; plantea hipótesis y sugerencias de intervención.',
            'Cita el contexto recuperado usando referencias [n].',
            '',
            'SOAP SUBJETIVO:',
            subjetivo
        ].join('\n');

        btn.disabled = true;
        const prev = btn.innerHTML;
        btn.innerHTML = '⏳ Consultando RAG...';
        if(outEl) outEl.innerHTML = '<em style="color:#9ca3af;">(Analizando...)</em>';

        try{
            async function postAsk(selectedCollection){
                const resp = await fetch(`${API_BASE}/api/rag/ask`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ collection: selectedCollection, query, k: 6, top_n: 25 })
                });
                const data = await resp.json().catch(()=>null);
                return { resp, data };
            }

            let { resp, data } = await postAsk(collection);

            // If the backend says the collection doesn't exist, try to auto-pick a close match.
            if((!resp.ok || !data || !data.ok) && data && data.error === 'collection_not_found' && Array.isArray(data.available_collections)){
                const picked = pickClosestCollection(collection, data.available_collections);
                if(picked && picked !== collection){
                    console.warn('RAG: colección no encontrada. Reintentando con:', picked, 'Disponibles:', data.available_collections);
                    ({ resp, data } = await postAsk(picked));
                    // Persist the corrected collection in session state to avoid repeating the issue.
                    try{ s.enfoque = picked; await saveData(); }catch(e){}
                }
            }

            if(!resp.ok || !data || !data.ok){
                console.error('RAG error:', resp.status, data);
                if(data && data.error === 'collection_not_found' && Array.isArray(data.available_collections)){
                    alert(
                        'La colección solicitada no existe en Qdrant.\n\n' +
                        'Colección pedida: ' + (data.collection || collection) + '\n' +
                        'Disponibles: ' + data.available_collections.join(', ') + '\n\n' +
                        'Solución: ajusta QDRANT_URL/QDRANT_API_KEY o el mapeo del enfoque.'
                    );
                } else {
                    alert('No se pudo obtener respuesta del RAG. Revisa consola/servidor.');
                }
                if(outEl) outEl.innerHTML = s.analisis || '<em style="color:#9ca3af;">(Sin análisis)</em>';
                return;
            }

            s.analisis = data.answer || '';
            await saveData();

            if(outEl){
                outEl.textContent = s.analisis || '(Sin análisis)';
            }
            console.log('✅ RAG OK:', data.collection);
        } finally {
            btn.disabled = false;
            btn.innerHTML = prev;
        }
    };
    
    // Botón editar SOAP - abre modal de edición
    document.getElementById('_edit_soap_btn').onclick = async ()=>{
        // Parse existing objective data if it's structured
        let objectiveData = {};
        try {
            if (s.soap?.o && typeof s.soap.o === 'string') {
                if (s.soap.o.startsWith('{')) {
                    objectiveData = JSON.parse(s.soap.o);
                }
            } else if (s.soap?.o && typeof s.soap.o === 'object') {
                objectiveData = s.soap.o;
            }
        } catch(e) {
            // If not structured, leave as is
        }
        
        const editModalHtml = `
            <div style="max-height:70vh; overflow-y:auto; padding:20px;">
                <h3 style="color:#00838f; margin-top:0;">✏️ Editar Sesión</h3>
                
                <!-- SOAP -->
                <div style="margin-bottom:24px;">
                    <h4 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">📋</span> SOAP
                    </h4>
                    
                    <!-- Subjetivo -->
                    <div style="margin-bottom:16px;">
                        <label style="display:block; color:#00838f; font-weight:600; margin-bottom:4px;">Subjetivo</label>
                        <textarea id="_modal_soap_s" style="width:100%; min-height:80px; padding:8px; border:2px solid #b2ebf2; border-radius:4px; font-family:inherit; font-size:14px; resize:vertical;">${s.soap?.s || ''}</textarea>
                    </div>
                    
                    <!-- Objetivo - Structured -->
                    <div style="margin-bottom:16px;">
                        <label style="display:block; color:#00838f; font-weight:600; margin-bottom:8px; font-size:15px;">Objetivo (Examen Mental)</label>
                        
                        <div style="background:#f9fafb; padding:16px; border-radius:8px; border:2px solid #e5e7eb;">
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:4px; font-size:13px;">* Apariencia y conducta:</label>
                                <input type="text" id="_obj_apariencia" value="${objectiveData.apariencia || ''}" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:6px; font-size:13px;">* Ánimo y afecto:</label>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-left:16px;">
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Ánimo:</label>
                                        <input type="text" id="_obj_animo" value="${objectiveData.animo || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Afecto:</label>
                                        <input type="text" id="_obj_afecto" value="${objectiveData.afecto || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                </div>
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:6px; font-size:13px;">* Pensamiento:</label>
                                <div style="margin-left:16px;">
                                    <div style="margin-bottom:6px;">
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Estructura:</label>
                                        <input type="text" id="_obj_pens_estructura" value="${objectiveData.pensamiento_estructura || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                    <div style="margin-bottom:6px;">
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Velocidad:</label>
                                        <input type="text" id="_obj_pens_velocidad" value="${objectiveData.pensamiento_velocidad || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Contenido:</label>
                                        <input type="text" id="_obj_pens_contenido" value="${objectiveData.pensamiento_contenido || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                </div>
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:4px; font-size:13px;">* Motricidad:</label>
                                <input type="text" id="_obj_motricidad" value="${objectiveData.motricidad || ''}" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:4px; font-size:13px;">* Insight:</label>
                                <input type="text" id="_obj_insight" value="${objectiveData.insight || ''}" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:6px; font-size:13px;">* Juicio y sentido de realidad:</label>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-left:16px;">
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Juicio:</label>
                                        <input type="text" id="_obj_juicio" value="${objectiveData.juicio || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Sentido:</label>
                                        <input type="text" id="_obj_sentido" value="${objectiveData.sentido || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                </div>
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:6px; font-size:13px;">* Consciencia:</label>
                                <div style="margin-left:16px;">
                                    <div style="margin-bottom:6px;">
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Cuantitativa:</label>
                                        <input type="text" id="_obj_consc_cuantitativa" value="${objectiveData.consciencia_cuantitativa || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                    <div style="margin-bottom:6px;">
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Cualitativa:</label>
                                        <input type="text" id="_obj_consc_cualitativa" value="${objectiveData.consciencia_cualitativa || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Sueño/vigilia:</label>
                                        <input type="text" id="_obj_consc_sueno" value="${objectiveData.consciencia_sueno || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                </div>
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:6px; font-size:13px;">* Orientación:</label>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-left:16px;">
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Autopsíquica:</label>
                                        <input type="text" id="_obj_orient_auto" value="${objectiveData.orientacion_autopsiquica || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                    <div>
                                        <label style="display:block; color:#6b7280; font-size:12px; margin-bottom:2px;">- Alopsíquica:</label>
                                        <input type="text" id="_obj_orient_alo" value="${objectiveData.orientacion_alopsiquica || ''}" style="width:100%; padding:6px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                                    </div>
                                </div>
                            </div>
                            
                            <div style="margin-bottom:12px;">
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:4px; font-size:13px;">* Percepción:</label>
                                <input type="text" id="_obj_percepcion" value="${objectiveData.percepcion || ''}" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                            </div>
                            
                            <div>
                                <label style="display:block; color:#374151; font-weight:600; margin-bottom:4px; font-size:13px;">* Cognición:</label>
                                <input type="text" id="_obj_cognicion" value="${objectiveData.cognicion || ''}" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:4px; font-size:13px;">
                            </div>
                        </div>
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
                
                <!-- RESUMEN -->
                <div style="margin-bottom:24px;">
                    <h4 style="color:#00838f; display:flex; align-items:center; gap:8px;">
                        <span style="font-size:20px;">📄</span> Resumen
                    </h4>
                    <textarea id="_modal_resumen_text" style="width:100%; min-height:100px; padding:12px; border:2px solid #b2ebf2; border-radius:8px; font-family:inherit; font-size:14px; resize:vertical;" placeholder="Resumen de la sesión...">${s.resumen || ''}</textarea>
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
            // Collect structured objective data
            const objectiveStructured = {
                apariencia: editModal.backdrop.querySelector('#_obj_apariencia').value,
                animo: editModal.backdrop.querySelector('#_obj_animo').value,
                afecto: editModal.backdrop.querySelector('#_obj_afecto').value,
                pensamiento_estructura: editModal.backdrop.querySelector('#_obj_pens_estructura').value,
                pensamiento_velocidad: editModal.backdrop.querySelector('#_obj_pens_velocidad').value,
                pensamiento_contenido: editModal.backdrop.querySelector('#_obj_pens_contenido').value,
                motricidad: editModal.backdrop.querySelector('#_obj_motricidad').value,
                insight: editModal.backdrop.querySelector('#_obj_insight').value,
                juicio: editModal.backdrop.querySelector('#_obj_juicio').value,
                sentido: editModal.backdrop.querySelector('#_obj_sentido').value,
                consciencia_cuantitativa: editModal.backdrop.querySelector('#_obj_consc_cuantitativa').value,
                consciencia_cualitativa: editModal.backdrop.querySelector('#_obj_consc_cualitativa').value,
                consciencia_sueno: editModal.backdrop.querySelector('#_obj_consc_sueno').value,
                orientacion_autopsiquica: editModal.backdrop.querySelector('#_obj_orient_auto').value,
                orientacion_alopsiquica: editModal.backdrop.querySelector('#_obj_orient_alo').value,
                percepcion: editModal.backdrop.querySelector('#_obj_percepcion').value,
                cognicion: editModal.backdrop.querySelector('#_obj_cognicion').value
            };
            
            const soapS = editModal.backdrop.querySelector('#_modal_soap_s').value;
            const enfoque = editModal.backdrop.querySelector('#_modal_enfoque_select').value;
            const analisis = editModal.backdrop.querySelector('#_modal_analisis_text').value;
            const resumen = editModal.backdrop.querySelector('#_modal_resumen_text').value;
            const planificacion = editModal.backdrop.querySelector('#_modal_planificacion_text').value;
            
            if (!s.soap) {
                s.soap = {};
            }
            s.soap.s = soapS;
            s.soap.o = objectiveStructured;
            s.enfoque = enfoque;
            s.analisis = analisis;
            s.resumen = resumen;
            s.planificacion = planificacion;
            
            await saveData();
            console.log('✅ Sesión actualizada correctamente');
            editModal.close();
            
            // Cerrar el modal de sesión y reabrir para refrescar
            modal.close();
            openSessionDetail(sessionIndex, patientId);
        };
    };
    
    // Auto-guardar enfoque cuando cambie
    document.getElementById('_enfoque_select').addEventListener('change', async (e) => {
        s.enfoque = e.target.value;
        await saveData();
        console.log('✅ Enfoque actualizado:', s.enfoque);
    });
    
    document.getElementById('_session_close').onclick = ()=> {
        // Clear any active polling interval for this patient
        try{ if(_pp_active_intervals[p.id]){ clearInterval(_pp_active_intervals[p.id].timer); delete _pp_active_intervals[p.id]; } }catch(e){}
        modal.close();
        // Re-renderizar la vista del paciente después de un pequeño delay para asegurar que el modal se cerró
        setTimeout(() => {
            showPatient(patientId, false);
        }, 150);
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
            const checkUrl = `${API_BASE}/api/recording/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
            console.log('[debug] on openSessionDetail: checking existing recording', checkUrl);
            const chk = await fetch(checkUrl);
            console.log('[debug] on openSessionDetail: check response ok=', chk && chk.ok, 'status=', chk && chk.status);
            if(chk && chk.ok){
                const info = await chk.json();
                if(info.exists){
                    if(recordingBtn){
                        recordingBtn.disabled = true;
                        try{ recordingBtn.querySelector('span').textContent = 'Grabación existente'; }catch(e){}
                        showWarningTooltipForElement(recordingBtn, 'Ya existe una grabación para esta sesión. Elimine la grabación antes de grabar una nueva.');
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
                        const processedUrl = `${API_BASE}/api/processed/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                        const presp = await fetch(processedUrl, { cache: 'no-store' });
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
                    const processedUrl = `${API_BASE}/api/processed/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                    const resp2 = await fetch(processedUrl, { cache: 'no-store' });
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
                        const processedUrl = `${API_BASE}/api/processed/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                        const resp = await fetch(processedUrl, { cache: 'no-store' });
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
                    const checkUrl = `${API_BASE}/api/recording/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                    console.log('[debug] recordingBtn: checking existing recording', checkUrl);
                    const chk = await fetch(checkUrl);
                    console.log('[debug] recordingBtn: check response ok=', chk && chk.ok, 'status=', chk && chk.status);
                    if(chk && chk.ok){
                        const info = await chk.json();
                        if(info.exists){
                            // server has file -> enforce single-recording rule
                            showWarningTooltipForElement(recordingBtn, 'Ya existe una grabación para esta sesión. Elimine la grabación antes de grabar una nueva.');
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
                const pinAuth = await modalPrompt('Ingrese PIN del psicólogo para iniciar la grabación', '', {isPin: true});
                if(!pinAuth) return;
                const okStart = await validatePsyPin(pinAuth);
                if(!okStart) return;

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

                            // Upload to server with patient name and session index
                            const form = new FormData();
                            const sanitizedName = p.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
                            form.append('file', new File([wavBlob], `patient_${sanitizedName}_sesion${sessionIndex + 1}.wav`, { type: 'audio/wav' }));
                            form.append('patientId', String(p.id));
                            form.append('patientName', p.nombre);
                            form.append('sessionIndex', String(sessionIndex));

                                                const uploadUrl = API_BASE + '/api/upload-recording';
                                                console.log('[debug] upload recording: POST', uploadUrl, 'patientId=', p.id, 'sessionIndex=', sessionIndex);
                                                const resp = await fetch(uploadUrl, { method: 'POST', body: form });
                                                console.log('[debug] upload recording: response ok=', resp && resp.ok, 'status=', resp && resp.status);

                                                // If server reports an existing recording, inform user and abort
                                                if(resp.status === 409){
                                                    console.log('❌ Ya existe una grabación en el servidor para esta sesión. Elimine la grabación antes de grabar una nueva.');
                                                    // Refresh UI from server state
                                                    try{ 
                                                        const checkUrl = `${API_BASE}/api/recording/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                                                        const chk = await fetch(checkUrl); 
                                                        if(chk.ok){ 
                                                            const info = await chk.json(); 
                                                            if(info.exists){ 
                                                                s.grabacion = [{ fecha: new Date().toISOString(), audio: info.path, duracion: s.grabacion?.[0]?.duracion || 0, remote:true }]; 
                                                                await saveData(); 
                                                            } 
                                                        } 
                                                    }catch(e){}
                                                    refreshGrabacionesUI(s, p, sessionIndex);
                                                    return;
                                                }

                                                if(!resp.ok){
                                                    // Try to read text or json error safely
                                                    let body = null;
                                                    try{ body = await resp.text(); }catch(e){ body = null; }
                                                    console.error('Upload failed', resp.status, body);
                                                    console.log('❌ No se pudo subir la grabación al servidor (' + resp.status + '). Se guardará localmente como respaldo.');

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
                                                    console.log('❌ Subida completada con respuesta inesperada. Se guardará localmente como respaldo.');

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
                                                console.log('✅ Grabación subida y guardada correctamente');
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
                                                            body: JSON.stringify({ 
                                                                patientId: p.id,
                                                                patientName: p.nombre,
                                                                sessionIndex 
                                                            })
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
                            console.log('❌ Error al procesar la grabación: ' + (err && err.message ? err.message : err));
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
                    console.log('❌ No se pudo acceder al micrófono. Por favor, permite el acceso al micrófono en tu navegador.');
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
    
    // Generate summary button handler - genera resumen basado en la transcripción de ESTA sesión
    const summaryBtn = document.getElementById('_generate_summary_btn');
    
    if(summaryBtn){
        summaryBtn.addEventListener('click', async ()=>{
            // Obtener la transcripción de esta sesión específica
            let transcripcion = '';
            
            // Intentar obtener de la grabación local primero
            if(s.grabacion && s.grabacion.length > 0 && s.grabacion[0].transcripcion){
                transcripcion = s.grabacion[0].transcripcion;
            } else {
                // Si no está local, intentar obtener del servidor
                try {
                    const processedUrl = `${API_BASE}/api/processed/${p.id}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndex}`;
                    const resp = await fetch(processedUrl, { cache: 'no-store' });
                    if(resp && resp.ok){
                        const data = await resp.json();
                        transcripcion = extractProcessedText(data) || '';
                        // Actualizar el estado local con la transcripción obtenida
                        if(transcripcion && s.grabacion && s.grabacion[0]){
                            s.grabacion[0].transcripcion = transcripcion;
                            await saveData();
                        }
                    }
                } catch(e) {
                    console.warn('Error al obtener transcripción del servidor:', e);
                }
            }
            
            // Limpiar la transcripción para mostrar solo el diálogo
            transcripcion = cleanTranscriptionText(transcripcion);
            
            // Validar que exista transcripción
            if(!transcripcion || !transcripcion.trim()){
                alert('No hay transcripción disponible para esta sesión. Primero debe realizar una grabación y esperar a que se procese.');
                return;
            }
            
            summaryBtn.disabled = true;
            const prevHTML = summaryBtn.innerHTML;
            summaryBtn.innerHTML = '⏳ Generando resumen...';
            
            try {
                // Llamar al endpoint de resumen con la transcripción de esta sesión
                const resp = await fetch(`${API_BASE}/api/generate-summary`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        transcription: transcripcion,
                        patientName: p.nombre,
                        sessionDate: s.fecha
                    })
                });
                
                if(!resp.ok){
                    throw new Error(`Error del servidor: ${resp.status}`);
                }
                
                const data = await resp.json();
                
                if(!data.ok || !data.summary){
                    throw new Error('El servidor no devolvió un resumen válido');
                }
                
                // Guardar el resumen en el campo SOAP Subjetivo
                if(!s.soap) s.soap = {};
                s.soap.s = data.summary;
                await saveData();
                
                // Mostrar modal con el resumen generado
                const summaryModal = createModal(`
                    <div style="padding:20px; max-width:800px;">
                        <h3 style="color:#7b1fa2; margin-bottom:16px;">✅ Resumen generado correctamente</h3>
                        <div style="padding:16px; background:#f3e5f5; border-radius:8px; border-left:4px solid #9c27b0; margin-bottom:16px;">
                            <p style="margin:0 0 8px 0; font-weight:600; color:#6a1b9a;">Resumen de la sesión:</p>
                            <p style="margin:0; line-height:1.6; color:#4a148c; white-space:pre-wrap;">${data.summary}</p>
                        </div>
                        <div style="padding:12px; background:#e1f5fe; border-radius:8px; border-left:4px solid #0288d1;">
                            <p style="margin:0; font-size:13px; color:#01579b;">
                                <strong>💡 Nota:</strong> El resumen ha sido guardado en el campo SOAP Subjetivo. 
                                Puede editarlo posteriormente si lo desea.
                            </p>
                        </div>
                        <div class="actions" style="margin-top:16px; display:flex; justify-content:flex-end;">
                            <button class="btn primary" id="_summary_close">Cerrar</button>
                        </div>
                    </div>
                `);
                
                summaryModal.backdrop.querySelector('#_summary_close').onclick = ()=> {
                    summaryModal.close();
                    // Recargar la vista de sesión para mostrar el resumen actualizado
                    modal.close();
                    setTimeout(() => openSessionDetail(sessionIndex, patientId), 100);
                };
                
            } catch(error) {
                console.error('Error al generar resumen:', error);
                alert(`Error al generar el resumen: ${error.message}\n\nAsegúrese de que el servidor esté en ejecución y que el endpoint /api/generate-summary esté disponible.`);
            } finally {
                summaryBtn.disabled = false;
                summaryBtn.innerHTML = prevHTML;
            }
        });
    }
}

async function viewGenograma(patientId){
    const p = getPatientById(patientId);
    if(!p) return console.log('Paciente no encontrado');
    
    // Si ya tiene genograma generado, preguntar si desea ver el existente o regenerar
    if(p.genogramaHtml){
        const shouldRegenerate = await modalConfirm(
            `El paciente ${p.nombre} ya tiene un genograma generado.\n\n¿Desea regenerarlo con las transcripciones actuales?\n\n(Seleccione "Cancelar" para ver el genograma existente)`
        );
        
        if(shouldRegenerate === null) return; // Usuario canceló
        
        if(!shouldRegenerate){
            // Ver el genograma existente
            const modal = createModal(`
                <div style="padding:0; width:95vw; height:90vh; overflow:hidden;">
                    <div style="padding:10px; background:#f5f5f5; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0;">📊 Genograma: ${p.nombre}</h3>
                        <button class="btn secondary" id="_gen_close" style="padding:8px 16px;">Cerrar</button>
                    </div>
                    <iframe id="genogram-iframe" style="width:100%; height:calc(100% - 60px); border:none;"></iframe>
                </div>
            `);
            
            const iframe = modal.backdrop.querySelector('#genogram-iframe');
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(p.genogramaHtml);
            iframeDoc.close();
            
            modal.backdrop.querySelector('#_gen_close').onclick = ()=> modal.close();
            return;
        }
        
        // Si eligió regenerar (shouldRegenerate === true), continuar con el proceso normal
    }
    
    // Obtener todas las transcripciones del paciente
    const patientSessions = mockSesiones.filter(s => s.pacienteId === patientId);
    if(patientSessions.length === 0){
        alert('No hay sesiones registradas para este paciente.');
        return;
    }
    
    // Concatenar todas las transcripciones desde los archivos
    let allTranscriptions = '';
    let transcriptionCount = 0;
    
    for(let i = 0; i < patientSessions.length; i++){
        const session = patientSessions[i];
        // Encontrar el índice real de esta sesión en mockSesiones (índice global)
        const globalIndex = mockSesiones.indexOf(session);
        // Contar cuántas sesiones del mismo paciente hay antes de esta
        const sessionIndexForPatient = mockSesiones.slice(0, globalIndex).filter(s => s.pacienteId === patientId).length;
        
        try {
            // Construir URL con parámetros de la nueva estructura
            const processedUrl = `${API_BASE}/api/processed/${patientId}?patientName=${encodeURIComponent(p.nombre)}&sessionIndex=${sessionIndexForPatient}`;
            console.log(`[genogram] Buscando transcripción sesión ${i} (sessionIndex=${sessionIndexForPatient}): ${processedUrl}`);
            const response = await fetch(processedUrl);
            
            if(response.ok){
                const data = await response.json();
                console.log(`[genogram] Datos recibidos sesión ${i}:`, data);
                if(data.ok && data.text){
                    allTranscriptions += data.text + '\n\n=== FIN DE SESIÓN ===\n\n';
                    transcriptionCount++;
                    console.log(`[genogram] Transcripción ${i} agregada. Total: ${transcriptionCount}`);
                }
            } else {
                console.warn(`[genogram] Sesión ${i} no encontrada, status: ${response.status}`);
            }
        } catch(e) {
            console.warn(`[genogram] Error cargando transcripción de sesión ${i}:`, e);
        }
    }
    
    console.log(`[genogram] Total transcripciones encontradas: ${transcriptionCount}`);
    if(transcriptionCount === 0){
        alert('No hay transcripciones disponibles para generar el genograma.');
        return;
    }
    
    // Mostrar loading
    const loadingModal = createModal(`
        <div style="padding:40px; text-align:center;">
            <div class="spinner" style="margin:0 auto 20px;"></div>
            <h3>Generando genograma...</h3>
            <p>Por favor espera mientras procesamos la información familiar.</p>
        </div>
    `);
    
    try {
        // Llamar al endpoint para generar el genograma
        const response = await fetch(`${API_BASE}/api/genograma/${patientId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcription: allTranscriptions })
        });
        
        const data = await response.json();
        
        loadingModal.close();
        
        if(!data.ok){
            alert(`Error generando genograma: ${data.error}\n${data.detail || ''}`);
            return;
        }
        
        // Guardar el HTML del genograma en el paciente
        p.genogramaHtml = data.genogramHtml;
        await saveData();
        
        // Mostrar el genograma
        const modal = createModal(`
            <div style="padding:0; width:95vw; height:90vh; overflow:hidden;">
                <div style="padding:10px; background:#f5f5f5; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">📊 Genograma: ${p.nombre}</h3>
                    <button class="btn secondary" id="_gen_close" style="padding:8px 16px;">Cerrar</button>
                </div>
                <iframe id="genogram-iframe" style="width:100%; height:calc(100% - 60px); border:none;"></iframe>
            </div>
        `);
        
        const iframe = modal.backdrop.querySelector('#genogram-iframe');
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(data.genogramHtml);
        iframeDoc.close();
        
        modal.backdrop.querySelector('#_gen_close').onclick = ()=> modal.close();
        
    } catch(err){
        loadingModal.close();
        console.error('Error generando genograma:', err);
        alert(`Error: ${err.message}`);
    }
}

async function uploadAttachment(sessionIndex){
    const s = mockSesiones[sessionIndex];
    if(!s) return console.log('Sesión no encontrada');
    const modal = createModal(`<h3>Subir adjunto</h3><div class="row">Archivo: <input id="_att_file" type="file"></div><div class="actions"><button class="btn ghost" id="_a_cancel">Cancelar</button><button class="btn primary" id="_a_save">Subir</button></div>`);
    modal.backdrop.querySelector('#_a_cancel').onclick = ()=> modal.close();
    modal.backdrop.querySelector('#_a_save').onclick = async ()=>{
        const fileInput = modal.backdrop.querySelector('#_att_file');
        if(!(fileInput && fileInput.files && fileInput.files[0])){
            return console.log('Seleccione un archivo para subir');
        }
        try{
            const res = await uploadFile(fileInput.files[0]);
            if(res && res.url){
                if(!s.attachments) s.attachments = [];
                s.attachments.push({ filename: res.filename || ('adjunto_' + Date.now()), url: res.url });
                await saveData();
                modal.close();
                console.log('✅ Archivo adjuntado correctamente');
                // If the session detail is open, refresh the UI where appropriate
                try{ refreshGrabacionesUI(s, getPatientById(s.pacienteId), sessionIndex); }catch(e){}
                return;
            } else {
                console.log('❌ No se pudo subir el archivo');
            }
        }catch(e){
            console.error('uploadAttachment error', e);
            console.log('Error subiendo archivo: ' + (e && e.message ? e.message : e));
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
