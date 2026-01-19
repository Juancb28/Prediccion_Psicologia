/**
 * App Main - Punto de entrada de la aplicación
 * Inicializa el router y registra todas las rutas
 */

// Configurar rutas
function setupRoutes() {
    // Dashboard
    router.register('/dashboard', async () => {
        await dashboardView.render();
    });

    // Lista de pacientes
    router.register('/pacientes', async () => {
        await pacientesView.render();
    });

    // Detalle de paciente
    router.register('/pacientes/:id', async (params) => {
        await patientDetailView.render(parseInt(params.id));
    });

    // Sesión de paciente
    router.register('/pacientes/:patientId/sesiones/:sessionIndex', async (params) => {
        await sessionDetailView.render(parseInt(params.patientId), parseInt(params.sessionIndex));
    });

    // Agenda
    router.register('/agenda', async () => {
        await agendaView.render();
    });

    // Sesiones generales
    router.register('/sesiones', async () => {
        await sessionsView.render();
    });

    // Perfil del psicólogo
    router.register('/perfil-psicologo', async () => {
        await psychologistProfileView.render();
    });

    // Ruta por defecto
    router.register('/', async () => {
        router.navigate('/dashboard');
    });
}

// Inicializar aplicación
function initApp() {
    console.log('🚀 Iniciando MindCare Sistema Clínico...');
    
    // Cargar datos persistidos
    try {
        patientManager.loadFromStorage();
        sessionManager.loadFromStorage();
        agendaManager.loadFromStorage();
    } catch (error) {
        console.error('Error cargando datos:', error);
    }

    // Configurar rutas
    setupRoutes();

    // Iniciar router
    router.start();

    console.log('✅ Aplicación iniciada correctamente');
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Exportar funciones globales necesarias
window.navigateTo = (path) => router.navigate(path);
window.patientManager = patientManager;
window.sessionManager = sessionManager;
window.agendaManager = agendaManager;
window.recordingManager = recordingManager;
