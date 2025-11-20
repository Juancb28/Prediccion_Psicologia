public class AnalizadorSesion {
    
    public static void main(String[] args) {
        System.out.println("\n" + "=".repeat(70));
        System.out.println(" Analizador de Sesiones Terapéuticas");
        System.out.println("=".repeat(70) + "\n");
        
        if (args.length == 0) {
            System.out.println(" Uso:");
            System.out.println("   java AnalizadorSesion <ruta_archivo>");
            System.out.println("\nEjemplo:");
            System.out.println("   java AnalizadorSesion ../transciption/sesion_001.txt");
            System.out.println("   java AnalizadorSesion ../transciption/sesion_001.json");
            return;
        }
        
        String rutaArchivo = args[0];
        java.io.File archivo = new java.io.File(rutaArchivo);
        
        if (!archivo.exists()) {
            System.err.println("Error: Archivo no existe: " + rutaArchivo);
            return;
        }
        
        System.out.println("Archivo encontrado: " + rutaArchivo);
        System.out.println("Tamaño: " + archivo.length() + " bytes\n");
        
        AgentePsicologoRESTClient cliente = new AgentePsicologoRESTClient();
        
        if (!cliente.verificarConexion()) {
            System.err.println("\nNo se puede conectar al servicio Python");
            System.err.println("   Asegúrate de ejecutar: python agente_psicologo_api.py");
            return;
        }
        
        System.out.println("\nIniciando análisis...\n");
        long inicio = System.currentTimeMillis();
        
        String analisis = cliente.analizarSesionDesdeArchivo(rutaArchivo);
        
        long duracion = System.currentTimeMillis() - inicio;
        
        System.out.println("\n" + "=".repeat(70));
        System.out.println("ANÁLISIS COMPLETADO");
        System.out.println("=".repeat(70));
        System.out.println(analisis);
        System.out.println("\n" + "=".repeat(70));
        System.out.println("Tiempo: " + (duracion / 1000.0) + " segundos");
        System.out.println("=".repeat(70) + "\n");
        
        // Guardar en outputs/
        String nombreArchivo = archivo.getName().replaceAll("\\.(txt|json)$", "_analisis.txt");
        String rutaSalida = "../outputs/" + nombreArchivo;
        cliente.guardarAnalisis(analisis, rutaSalida);
    }
}