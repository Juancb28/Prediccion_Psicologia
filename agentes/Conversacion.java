import jade.core.AID;
import jade.core.Agent;
import jade.lang.acl.ACLMessage;

public class Conversacion {

    /**
     * Envía un mensaje ACL a otro agente
     * 
     * @param mensaje     Contenido del mensaje
     * @param receptor    Nombre local del agente receptor
     * @param emisor      Agente que envía el mensaje
     * @param tipoMensaje Tipo de mensaje ACL (ej: ACLMessage.INFORM,
     *                    ACLMessage.REQUEST)
     */
    public static void empezarConversacion(String mensaje, String receptor, Agent emisor, int tipoMensaje) {
        ACLMessage acl = new ACLMessage(tipoMensaje);

        acl.setSender(emisor.getAID());

        AID idReceptor = new AID();
        idReceptor.setLocalName(receptor);
        acl.addReceiver(idReceptor);
        acl.setContent(mensaje);
        acl.setLanguage("fipa-sl");
        emisor.send(acl);
    }

    /**
     * Envía un mensaje a múltiples receptores
     * 
     * @param mensaje     Contenido del mensaje
     * @param receptores  Array de nombres de agentes receptores
     * @param emisor      Agente que envía el mensaje
     * @param tipoMensaje Tipo de mensaje ACL
     */
    public static void empezarConversacionMultiple(String mensaje, String[] receptores, Agent emisor, int tipoMensaje) {
        ACLMessage acl = new ACLMessage(tipoMensaje);
        acl.setSender(emisor.getAID());

        for (String receptor : receptores) {
            AID idReceptor = new AID();
            idReceptor.setLocalName(receptor);
            acl.addReceiver(idReceptor);
        }

        acl.setContent(mensaje);
        acl.setLanguage("fipa-sl");

        emisor.send(acl);
    }

    public static void responder(ACLMessage mensajeOriginal, String respuesta, Agent emisor) {
        ACLMessage reply = mensajeOriginal.createReply();
        reply.setContent(respuesta);
        reply.setPerformative(ACLMessage.INFORM);
        emisor.send(reply);
    }
}