/**
 * Router - Sistema de enrutamiento basado en URL con rutas jerárquicas
 * Ejemplo de rutas: /dashboard, /pacientes, /pacientes/:id, /pacientes/:id/sesiones/:sessionId
 */
class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.params = {};
        
        // Escuchar cambios en el navegador
        window.addEventListener('popstate', () => this.handleRoute());
        
        // Interceptar todos los clics en enlaces
        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-link]')) {
                e.preventDefault();
                this.navigate(e.target.href || e.target.getAttribute('data-href'));
            }
        });
    }

    /**
     * Registrar una ruta con su manejador
     * @param {string} path - Ruta (soporta parámetros como :id)
     * @param {Function} handler - Función que maneja la ruta
     */
    register(path, handler) {
        this.routes.set(path, handler);
    }

    /**
     * Navegar a una ruta
     * @param {string} path - Ruta destino
     */
    navigate(path) {
        window.history.pushState(null, null, path);
        this.handleRoute();
    }

    /**
     * Reemplazar la ruta actual sin agregar al historial
     * @param {string} path - Ruta destino
     */
    replace(path) {
        window.history.replaceState(null, null, path);
        this.handleRoute();
    }

    /**
     * Retroceder en el historial
     */
    back() {
        window.history.back();
    }

    /**
     * Parsear una ruta y extraer parámetros
     * @param {string} routePattern - Patrón de ruta (/pacientes/:id)
     * @param {string} path - Ruta actual (/pacientes/123)
     * @returns {Object|null} - Objeto con parámetros o null si no coincide
     */
    matchRoute(routePattern, path) {
        const routeParts = routePattern.split('/').filter(Boolean);
        const pathParts = path.split('/').filter(Boolean);

        if (routeParts.length !== pathParts.length) {
            return null;
        }

        const params = {};
        
        for (let i = 0; i < routeParts.length; i++) {
            const routePart = routeParts[i];
            const pathPart = pathParts[i];

            if (routePart.startsWith(':')) {
                // Es un parámetro dinámico
                const paramName = routePart.slice(1);
                params[paramName] = decodeURIComponent(pathPart);
            } else if (routePart !== pathPart) {
                // No coincide
                return null;
            }
        }

        return params;
    }

    /**
     * Manejar el cambio de ruta actual
     */
    async handleRoute() {
        const path = window.location.pathname;
        
        // Buscar la ruta que coincida
        for (const [routePattern, handler] of this.routes) {
            const params = this.matchRoute(routePattern, path);
            
            if (params !== null) {
                this.currentRoute = routePattern;
                this.params = params;
                
                try {
                    await handler(params);
                } catch (error) {
                    console.error('Error al manejar ruta:', error);
                    this.navigate('/dashboard');
                }
                return;
            }
        }

        // Si no se encontró ninguna ruta, redirigir a dashboard
        console.warn('Ruta no encontrada:', path);
        this.navigate('/dashboard');
    }

    /**
     * Obtener los parámetros de la ruta actual
     */
    getParams() {
        return this.params;
    }

    /**
     * Obtener un parámetro específico
     * @param {string} name - Nombre del parámetro
     */
    getParam(name) {
        return this.params[name];
    }

    /**
     * Iniciar el router
     */
    start() {
        this.handleRoute();
    }
}

// Exportar instancia única del router
const router = new Router();

// Función helper para crear enlaces de navegación
function createLink(path, text, className = '') {
    return `<a href="${path}" data-link class="${className}">${text}</a>`;
}

// Función helper para navegar programáticamente
function navigateTo(path) {
    router.navigate(path);
}
