import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Paths;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class AgentePsicologoRESTClient {
    
    private static final String API_BASE_URL = "http://localhost:5000/api";
    
    public String analizarSesionDesdeArchivo(String rutaArchivo) {
        try {
            String contenido = new String(Files.readAllBytes(Paths.get(rutaArchivo)));
            String formato = rutaArchivo.toLowerCase().endsWith(".json") ? "json" : "txt";
            
            System.out.println("[Cliente] Analizando: " + rutaArchivo);
            System.out.println("[Cliente] Formato: " + formato);
            System.out.println("[Cliente] Tamaño: " + contenido.length() + " caracteres");
            
            return analizarSesion(contenido, formato);
        } catch (IOException e) {
            return "Error al leer archivo: " + e.getMessage();
        }
    }
    
    @SuppressWarnings("deprecation")
    public String analizarSesion(String transcripcion, String formato) {
        try {
            URL url = new URL(API_BASE_URL + "/analizar-sesion");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; utf-8");
            conn.setDoOutput(true);
            conn.setReadTimeout(120000);
            
            JsonObject request = new JsonObject();
            request.addProperty("transcripcion", transcripcion);
            request.addProperty("formato", formato);
            
            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = request.toString().getBytes("utf-8");
                os.write(input, 0, input.length);
            }
            
            if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), "utf-8")
                );
                StringBuilder response = new StringBuilder();
                String line;
                
                while ((line = br.readLine()) != null) {
                    response.append(line.trim());
                }
                
                JsonObject resultado = JsonParser.parseString(response.toString()).getAsJsonObject();
                if (resultado.get("status").getAsString().equals("success")) {
                    return resultado.get("analisis").getAsString();
                } else {
                    return "Error: " + resultado.get("error").getAsString();
                }
            } else {
                return "Error HTTP: " + conn.getResponseCode();
            }
        } catch (Exception e) {
            return "Error de conexión: " + e.getMessage();
        }
    }
    
    @SuppressWarnings("deprecation")
    public boolean verificarConexion() {
        try {
            URL url = new URL(API_BASE_URL + "/health");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3000);
            
            if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                System.out.println("[Cliente] ✅ Servicio conectado");
                return true;
            }
            return false;
        } catch (Exception e) {
            System.err.println("[Cliente] ❌ Error: " + e.getMessage());
            return false;
        }
    }
    
    public void guardarAnalisis(String analisis, String rutaSalida) {
        try {
            Files.write(Paths.get(rutaSalida), analisis.getBytes("utf-8"));
            System.out.println("[Cliente] ✅ Guardado en: " + rutaSalida);
        } catch (IOException e) {
            System.err.println("[Cliente] ❌ Error al guardar: " + e.getMessage());
        }
    }
}