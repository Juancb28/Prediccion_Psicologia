
// Frontend logic: record audio in browser and POST to /upload, display returned transcript.

let mediaRecorder;
let audioChunks = [];
const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const transcriptText = document.getElementById("transcriptText");

recordBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Tu navegador no soporta la API de grabación.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstart = () => {
      statusEl.textContent = "Estado: grabando...";
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      transcriptText.textContent = "Grabando... habla ahora.";
    };
    mediaRecorder.onstop = async () => {
      statusEl.textContent = "Estado: subiendo audio y procesando...";
      recordBtn.disabled = false;
      stopBtn.disabled = true;

      const blob = new Blob(audioChunks, { type: "audio/webm" });
      const fd = new FormData();
      // The server accepts field named 'audio'
      fd.append("audio", blob, "recording.webm");

      try {
        const resp = await fetch("/upload", {
          method: "POST",
          body: fd
        });
        if (!resp.ok) {
          const err = await resp.json().catch(()=>null);
          statusEl.textContent = "Error en servidor: " + (err && err.error ? err.error : resp.statusText);
          transcriptText.textContent = (err && err.details) ? err.details : "Error al procesar el audio.";
          return;
        }
        const data = await resp.json();
        document.getElementById("transcriptText").textContent = data.formatted_transcript || "(sin transcripción)";
        statusEl.textContent = "Estado: listo";
      } catch (e) {
        statusEl.textContent = "Error conexión con servidor.";
        transcriptText.textContent = e.toString();
      }
    };

    mediaRecorder.start();
  } catch (err) {
    console.error(err);
    alert("No se pudo acceder al micrófono: " + err.message);
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
});