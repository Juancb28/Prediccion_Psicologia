/**
 * Configuración del servidor para la nueva arquitectura
 * Este archivo debe reemplazar o complementar server.js
 */

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde diferentes ubicaciones
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/styles.css', express.static(path.join(__dirname, 'styles.css')));

// Servir otros directorios necesarios
app.use('/genograms', express.static(path.join(__dirname, 'genograms')));
app.use('/recordings', express.static(path.join(__dirname, 'recordings')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ruta principal - Nueva arquitectura
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta legacy - Mantener compatibilidad
app.get('/legacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Todas las rutas del frontend (SPA) redirigen a index.html
const frontendRoutes = [
    '/dashboard',
    '/pacientes',
    '/pacientes/:id',
    '/pacientes/:patientId/sesiones/:sessionIndex',
    '/agenda',
    '/sesiones',
    '/perfil-psicologo'
];

frontendRoutes.forEach(route => {
    app.get(route, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
});

// Aquí van todas las rutas de API que ya existen en server.js
// (Se mantienen sin cambios)

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🧠 MindCare - Sistema Clínico de Psicología        ║
║                                                       ║
║   🚀 Servidor corriendo en:                          ║
║      http://localhost:${PORT}                           ║
║                                                       ║
║   📱 Nueva Arquitectura:                             ║
║      http://localhost:${PORT}/                          ║
║                                                       ║
║   🔄 Versión Legacy:                                 ║
║      http://localhost:${PORT}/legacy                    ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
