const state = {
  socket: null,
  audioContext: null,
  mediaStream: null,
  sourceNode: null,
  processorNode: null,
  mutedNode: null,
  isCapturing: false,
  showSourceText: true,
  koreanLines: [],
  englishLines: [],
};

const ui = {
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  statusText: document.getElementById("status-text"),
  koreanTranscript: document.getElementById("korean-transcript"),
  englishTranscript: document.getElementById("english-transcript"),
  copyKoreanButton: document.getElementById("copy-korean-button"),
  copyEnglishButton: document.getElementById("copy-english-button"),
  clearTranscriptButton: document.getElementById("clear-transcript-button"),
  latencyText: document.getElementById("latency-text"),
  audioText: document.getElementById("audio-text"),
  connectionPill: document.getElementById("connection-pill"),
  statePill: document.getElementById("state-pill"),
  modelPill: document.getElementById("model-pill"),
};

ui.startButton.addEventListener("click", startCapture);
ui.stopButton.addEventListener("click", stopCapture);
ui.copyKoreanButton.addEventListener("click", () => copyTranscript("korean"));
ui.copyEnglishButton.addEventListener("click", () => copyTranscript("english"));
ui.clearTranscriptButton.addEventListener("click", clearTranscript);

boot().catch((error) => {
  setStatus(`Startup error: ${error.message}`);
  console.error(error);
});

async function boot() {
  renderAllTranscripts();
  await fetchHealth();
  connectSocket();
  updateMicrophoneHint();
}

async function fetchHealth() {
  const response = await fetch("/api/health");
  const data = await response.json();
  applyRuntime(data.runtime);
}

function connectSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws`;
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    setConnection("Connected");
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    handleServerEvent(payload);
  });

  socket.addEventListener("close", () => {
    setConnection("Disconnected");
    if (state.isCapturing) {
      setStatus("Connection lost. Stop and restart the session.");
    }
  });

  socket.addEventListener("error", () => {
    setConnection("Error");
  });

  state.socket = socket;
}

async function startCapture() {
  if (state.isCapturing) {
    return;
  }

  try {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      connectSocket();
      await waitForSocket();
    }

    setStatus("Waiting for browser microphone permission.");

    const stream = await requestMicrophoneStream();

    await startAudioPipeline(stream);
  } catch (error) {
    setState("Mic Blocked");
    setStatus(`Microphone could not start: ${error.message}`);
  }
}

function updateMicrophoneHint() {
  if (canRequestMicrophone()) {
    return;
  }

  setStatus(microphoneUnavailableMessage());
}

async function requestMicrophoneStream() {
  if (!window.isSecureContext) {
    throw new Error(
      "browser microphone access requires HTTPS or localhost. On this host PC use http://127.0.0.1:8000. From another laptop, set up HTTPS and open https://192.168.0.20:8443."
    );
  }

  if (!canRequestMicrophone()) {
    throw new Error(
      "this browser did not expose microphone access for this page. Use Chrome or Edge over localhost or HTTPS."
    );
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

function canRequestMicrophone() {
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function setMicrophoneAwareStatus(text) {
  if (canRequestMicrophone()) {
    setStatus(text);
    return;
  }

  updateMicrophoneHint();
}

function microphoneUnavailableMessage() {
  if (!window.isSecureContext) {
    return "Microphone access is blocked because this page is not HTTPS or localhost. Use http://127.0.0.1:8000 on the host PC, or use HTTPS for another laptop.";
  }

  return "Microphone access is not available in this browser. Use Chrome or Edge over localhost or HTTPS.";
}

async function startAudioPipeline(stream) {
  const audioContext = new AudioContext();
  const sourceNode = audioContext.createMediaStreamSource(stream);
  const processorNode = audioContext.createScriptProcessor(2048, 1, 1);
  const mutedNode = audioContext.createGain();
  mutedNode.gain.value = 0;

  processorNode.onaudioprocess = (event) => {
    const output = event.outputBuffer.getChannelData(0);
    output.fill(0);

    if (!state.isCapturing || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const channelData = event.inputBuffer.getChannelData(0);
    const pcm16 = downsampleTo16BitPcm(channelData, audioContext.sampleRate, 16000);
    if (pcm16.length > 0) {
      state.socket.send(pcm16.buffer);
    }
  };

  sourceNode.connect(processorNode);
  processorNode.connect(mutedNode);
  mutedNode.connect(audioContext.destination);

  state.audioContext = audioContext;
  state.mediaStream = stream;
  state.sourceNode = sourceNode;
  state.processorNode = processorNode;
  state.mutedNode = mutedNode;
  state.isCapturing = true;

  ui.startButton.disabled = true;
  ui.stopButton.disabled = false;
  setState("Listening");
  setStatus("Listening for Korean speech.");
}

async function stopCapture() {
  if (!state.isCapturing) {
    return;
  }

  state.isCapturing = false;
  ui.startButton.disabled = false;
  ui.stopButton.disabled = true;

  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: "flush" }));
  }

  if (state.processorNode) {
    state.processorNode.disconnect();
  }
  if (state.sourceNode) {
    state.sourceNode.disconnect();
  }
  if (state.mutedNode) {
    state.mutedNode.disconnect();
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
  }
  if (state.audioContext) {
    await state.audioContext.close();
  }

  state.audioContext = null;
  state.mediaStream = null;
  state.sourceNode = null;
  state.processorNode = null;
  state.mutedNode = null;

  setState("Idle");
  setStatus("Microphone stopped.");
}

function handleServerEvent(payload) {
  if (payload.runtime) {
    applyRuntime(payload.runtime);
  }

  if (payload.type === "hello") {
    setMicrophoneAwareStatus(payload.message);
    return;
  }

  if (payload.type === "ready") {
    setState("Ready");
    setMicrophoneAwareStatus("Model is ready. You can start talking.");
    return;
  }

  if (payload.type === "status") {
    const stateName = payload.state ?? "Working";
    setState(toTitleCase(stateName));
    if (stateName === "warming_up") {
      setMicrophoneAwareStatus("Loading the local model. The first launch can take a while.");
    } else if (stateName === "translating") {
      setStatus("Translating the latest utterance.");
    } else if (stateName === "listening") {
      setMicrophoneAwareStatus("Listening for Korean speech.");
    }
    return;
  }

  if (payload.type === "translation") {
    appendTranscript(payload);
    ui.latencyText.textContent = `Latency: ${payload.latency_seconds}s`;
    ui.audioText.textContent = `Audio: ${payload.audio_seconds}s`;
    return;
  }

  if (payload.type === "error") {
    setState("Error");
    setStatus(payload.message);
  }
}

function appendTranscript(payload) {
  const koreanText =
    payload.source_text ||
    "Korean transcript unavailable. Set SHOW_SOURCE_TEXT=true on the host PC.";
  const englishText = payload.english_text || "";

  state.koreanLines.push(koreanText);
  state.englishLines.push(englishText);
  renderAllTranscripts();
  scrollTranscriptToBottom(ui.koreanTranscript);
  scrollTranscriptToBottom(ui.englishTranscript);
}

function renderAllTranscripts() {
  renderTranscriptBox(
    ui.koreanTranscript,
    state.koreanLines,
    koreanEmptyText()
  );
  renderTranscriptBox(
    ui.englishTranscript,
    state.englishLines,
    "English translation will appear here."
  );
}

function koreanEmptyText() {
  if (!state.showSourceText) {
    return "Korean transcript is disabled on this backend. Set SHOW_SOURCE_TEXT=true to show source lines.";
  }

  return "Korean transcript will appear here after you start listening.";
}

function renderTranscriptBox(container, lines, emptyText) {
  container.innerHTML = "";

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  lines.forEach((line, index) => {
    const item = document.createElement("p");
    item.className = "transcript-line";
    if (index === lines.length - 1) {
      item.classList.add("latest");
    }
    item.textContent = line;
    container.appendChild(item);
  });
}

function scrollTranscriptToBottom(container) {
  container.scrollTop = container.scrollHeight;
}

async function copyTranscript(language) {
  const isKorean = language === "korean";
  const lines = isKorean ? state.koreanLines : state.englishLines;
  const label = isKorean ? "Korean" : "English";
  const text = lines.join("\n").trim();

  if (!text) {
    setStatus(`${label} text box is empty.`);
    return;
  }

  try {
    await writeClipboard(text);
    setStatus(`${label} transcript copied to clipboard.`);
  } catch (error) {
    setStatus(`Could not copy ${label.toLowerCase()} transcript: ${error.message}`);
  }
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy command was blocked by the browser.");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function clearTranscript() {
  state.koreanLines = [];
  state.englishLines = [];
  ui.latencyText.textContent = "Latency: -";
  ui.audioText.textContent = "Audio: -";
  renderAllTranscripts();
  setStatus("Transcript cleared.");
}

function applyRuntime(runtime) {
  const device = runtime.device ?? "auto";
  const computeType = runtime.compute_type ?? "auto";
  ui.modelPill.textContent = `Model: ${runtime.model} · ${device} · ${computeType}`;
  state.showSourceText = Boolean(runtime.show_source_text);
  if (state.koreanLines.length === 0) {
    renderAllTranscripts();
  }
}

function setConnection(text) {
  ui.connectionPill.textContent = text;
}

function setState(text) {
  ui.statePill.textContent = text;
}

function setStatus(text) {
  ui.statusText.textContent = text;
}

function waitForSocket() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        window.clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - start > 10000) {
        window.clearInterval(timer);
        reject(new Error("WebSocket connection timed out."));
      }
    }, 100);
  });
}

function downsampleTo16BitPcm(float32Array, inputSampleRate, outputSampleRate) {
  if (outputSampleRate > inputSampleRate) {
    throw new Error("Output sample rate must be less than input sample rate.");
  }

  if (outputSampleRate === inputSampleRate) {
    return floatTo16BitPcm(float32Array);
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(float32Array.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accumulator = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i += 1) {
      accumulator += float32Array[i];
      count += 1;
    }

    const sample = count > 0 ? accumulator / count : 0;
    result[offsetResult] = clamp16(sample);
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function floatTo16BitPcm(float32Array) {
  const result = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i += 1) {
    result[i] = clamp16(float32Array[i]);
  }
  return result;
}

function clamp16(value) {
  const sample = Math.max(-1, Math.min(1, value));
  return sample < 0 ? sample * 0x8000 : sample * 0x7fff;
}

function toTitleCase(text) {
  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
