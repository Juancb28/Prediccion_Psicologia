import jade.core.Profile;
import jade.core.ProfileImpl;
import jade.core.Runtime;
import jade.wrapper.AgentContainer;


public class Contenedor {
    
    private AgentContainer mainContainer;
    private Runtime runtime;
    
  
    private void iniciarContenedor() {
        System.out.println("\n" + "=".repeat(70));
        System.out.println(" Iniciando Sistema Multiagente JADE");
        System.out.println("=".repeat(70) + "\n");
        
        // Obtiene la instancia del runtime de JADE
        runtime = Runtime.instance();
        
        // Configura el perfil del contenedor principal
        Profile profile = new ProfileImpl(null, 1099, null);
        profile.setParameter(Profile.MAIN_HOST, "localhost");
        profile.setParameter(Profile.GUI, "false"); // true para ver la GUI de JADE
        
        // Crea el contenedor principal
        mainContainer = runtime.createMainContainer(profile);
        
        System.out.println("Contenedor principal creado");
        System.out.println("Host: localhost");
        System.out.println("Puerto: 1099");
        System.out.println();
    }
    
    /**
     * Inicia los agentes en el contenedor
     */
    public void iniciarAgentes(AgentContainer container) {
        System.out.println("\n" + "=".repeat(70));
        System.out.println("Sistema iniciado correctamente");
        System.out.println("=".repeat(70) + "\n");
    }
    
    /**
     * Detiene el contenedor
     */
    public void detenerContenedor() {
        try {
            if (mainContainer != null) {
                mainContainer.kill();
                System.out.println("\nContenedor detenido correctamente");
            }
        } catch (Exception e) {
            System.err.println("Error al detener contenedor: " + e.getMessage());
        }
    }
    
    /**
     * Método principal
     */
    public static void main(String[] args) {
        Contenedor contenedor = new Contenedor();
        
        try {
            // Inicia el contenedor
            contenedor.iniciarContenedor();
            
            // Inicia los agentes
            contenedor.iniciarAgentes(contenedor.mainContainer);
            
            // Mantiene el sistema corriendo
            System.out.println("Sistema en ejecución...");
            System.out.println("Presiona Ctrl+C para detener\n");
            
            // Espera indefinidamente (hasta Ctrl+C)
            Thread.currentThread().join();
            
        } catch (InterruptedException e) {
            System.out.println("\nSistema interrumpido");
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        } finally {
            contenedor.detenerContenedor();
        }
    }
}