/**
 * RecordingManager - Gestión de grabaciones de sesiones
 */
class RecordingManager {
    constructor() {
        this.activeRecordings = new Map();
        this.processingIntervals = new Map();
        this.API_BASE = window.API_BASE_URL || 'http://localhost:3000';
    }

    /**
     * Agregar grabación a una sesión
     */
    addRecording(sessionIndex, recordingData) {
        const session = sessionManager.getByIndex(sessionIndex);
        if (!session) {
            throw new Error(`Sesión en índice ${sessionIndex} no encontrada`);
        }

        if (!session.grabacion) {
            session.grabacion = [];
        }

        session.grabacion.push({
            fecha: new Date().toISOString(),
            audio: recordingData.audio,
            duracion: recordingData.duracion || 0,
            remote: recordingData.remote || false,
            processing: recordingData.processing || false,
            transcripcion: recordingData.transcripcion || null
        });

        sessionManager.saveToStorage();
        return session;
    }

    /**
     * Actualizar grabación de una sesión
     */
    updateRecording(sessionIndex, recordingIndex, recordingData) {
        const session = sessionManager.getByIndex(sessionIndex);
        if (!session || !session.grabacion || !session.grabacion[recordingIndex]) {
            throw new Error('Grabación no encontrada');
        }

        Object.assign(session.grabacion[recordingIndex], recordingData);
        sessionManager.saveToStorage();
        return session;
    }

    /**
     * Eliminar grabación de una sesión
     */
    async deleteRecording(patientId, sessionIndex, pin) {
        // Validar PIN
        const isValid = await this.validatePin(pin);
        if (!isValid) {
            throw new Error('PIN incorrecto');
        }

        const patient = patientManager.getById(patientId);
        if (!patient) {
            throw new Error('Paciente no encontrado');
        }

        // Encontrar la sesión global
        const patientSessions = sessionManager.getByPatientId(patientId);
        const session = patientSessions[sessionIndex];
        
        if (!session) {
            throw new Error('Sesión no encontrada');
        }

        const globalIndex = sessionManager.getGlobalIndex(session);

        try {
            // Eliminar del servidor
            const response = await fetch(`${this.API_BASE}/api/delete-recording`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientId,
                    patientName: patient.nombre,
                    sessionIndex,
                    pin
                })
            });

            if (response.status === 404) {
                // Archivo no existe en servidor, solo limpiar referencia local
                console.warn('Grabación no encontrada en servidor, limpiando referencia local');
            } else if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Error al eliminar grabación del servidor');
            }

            // Limpiar referencia local
            if (session.grabacion) {
                session.grabacion = [];
                sessionManager.saveToStorage();
            }

            // Limpiar intervalo de polling si existe
            this.stopPolling(patientId);

            return true;
        } catch (error) {
            console.error('Error eliminando grabación:', error);
            throw error;
        }
    }

    /**
     * Verificar si existe grabación en el servidor
     */
    async checkRecordingExists(patientId, patientName, sessionIndex) {
        try {
            const url = `${this.API_BASE}/api/recording/${patientId}?patientName=${encodeURIComponent(patientName)}&sessionIndex=${sessionIndex}`;
            const response = await fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                return data.exists;
            }
            return false;
        } catch (error) {
            console.error('Error verificando grabación:', error);
            return false;
        }
    }

    /**
     * Convertir Blob a WAV
     */
    async blobToWavBlob(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100 * 40, 44100);
        
        const decoded = await new Promise((resolve, reject) => {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            ctx.decodeAudioData(arrayBuffer, res => resolve(res), err => reject(err));
        });

        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            decoded.numberOfChannels,
            decoded.length,
            decoded.sampleRate
        );
        
        const bufferSource = offlineCtx.createBufferSource();
        bufferSource.buffer = decoded;
        bufferSource.connect(offlineCtx.destination);
        bufferSource.start(0);
        const rendered = await offlineCtx.startRendering();

        const channelData = [];
        for (let i = 0; i < rendered.numberOfChannels; i++) {
            channelData.push(rendered.getChannelData(i));
        }
        
        const interleaved = new Float32Array(rendered.length * rendered.numberOfChannels);
        
        if (rendered.numberOfChannels === 1) {
            interleaved.set(channelData[0]);
        } else {
            let idx = 0;
            for (let i = 0; i < rendered.length; i++) {
                for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
                    interleaved[idx++] = channelData[ch][i];
                }
            }
        }

        const wavBuffer = new ArrayBuffer(44 + interleaved.length * 2);
        const view = new DataView(wavBuffer);
        
        function writeString(view, offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + interleaved.length * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, rendered.numberOfChannels, true);
        view.setUint32(24, rendered.sampleRate, true);
        view.setUint32(28, rendered.sampleRate * rendered.numberOfChannels * 2, true);
        view.setUint16(32, rendered.numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, interleaved.length * 2, true);

        let offset = 44;
        for (let i = 0; i < interleaved.length; i++) {
            let s = Math.max(-1, Math.min(1, interleaved[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    /**
     * Validar PIN del psicólogo
     */
    async validatePin(pin) {
        try {
            const response = await fetch(`${this.API_BASE}/api/validate-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });

            if (!response.ok) return false;

            const data = await response.json();
            return data && data.ok === true;
        } catch (error) {
            console.error('Error validando PIN:', error);
            return false;
        }
    }

    /**
     * Iniciar polling para transcripción procesada
     */
    startPolling(patientId, patientName, sessionIndex, sessionGlobalIndex, maxAttempts = 40) {
        // Evitar duplicados
        if (this.processingIntervals.has(patientId)) {
            return;
        }

        let attempts = 0;
        const delayMs = 3000;

        const timer = setInterval(async () => {
            attempts++;
            
            try {
                const url = `${this.API_BASE}/api/processed/${patientId}?patientName=${encodeURIComponent(patientName)}&sessionIndex=${sessionIndex}`;
                const response = await fetch(url, { cache: 'no-store' });
                
                if (response && response.ok) {
                    const data = await response.json();
                    
                    if (data && (data.stage === 'labeled' || data.stage === 'done' || data.text || data.raw)) {
                        const text = this.extractProcessedText(data);
                        
                        if (text) {
                            this.updateRecording(sessionGlobalIndex, 0, {
                                transcripcion: text,
                                processing: false
                            });
                        }
                        
                        this.stopPolling(patientId);
                        return;
                    }
                }
            } catch (error) {
                console.warn('Polling error:', error);
            }

            if (attempts >= maxAttempts) {
                this.stopPolling(patientId);
            }
        }, delayMs);

        this.processingIntervals.set(patientId, { timer, attempts: 0 });
    }

    /**
     * Detener polling
     */
    stopPolling(patientId) {
        const interval = this.processingIntervals.get(patientId);
        if (interval) {
            clearInterval(interval.timer);
            this.processingIntervals.delete(patientId);
        }
    }

    /**
     * Extraer texto procesado de la respuesta
     */
    extractProcessedText(data) {
        if (!data) return '';
        
        if (typeof data.text === 'string' && data.text.trim()) {
            return data.text.trim();
        }
        
        if (Array.isArray(data.raw) && data.raw.length) {
            let out = '';
            let curSpeaker = null;
            
            for (const seg of data.raw) {
                const speaker = (seg && seg.speaker) ? seg.speaker : 'UNKNOWN';
                if (speaker !== curSpeaker) {
                    if (curSpeaker !== null) out += '\n\n';
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
}

// Exportar instancia única
const recordingManager = new RecordingManager();
