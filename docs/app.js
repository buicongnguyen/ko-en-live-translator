const demoScript = [
  {
    ko: "안녕하세요. 오늘 회의는 세 시에 시작합니다.",
    en: "Hello. Today's meeting starts at three o'clock.",
    audio: 2.5,
    latency: 0.74,
  },
  {
    ko: "지금 화면에 보이는 자료를 같이 봐 주세요.",
    en: "Please take a look at the material shown on the screen.",
    audio: 2.2,
    latency: 0.68,
  },
  {
    ko: "질문이 있으면 언제든지 편하게 말씀해 주세요.",
    en: "If you have any questions, please feel free to ask at any time.",
    audio: 2.8,
    latency: 0.81,
  },
  {
    ko: "이 모델은 노트북 GPU에서도 실시간에 가깝게 동작할 수 있습니다.",
    en: "This model can run close to real time even on a laptop GPU.",
    audio: 3.1,
    latency: 0.92,
  },
];

const state = {
  socket: null,
  audioContext: null,
  mediaStream: null,
  sourceNode: null,
  processorNode: null,
  mutedNode: null,
  isCapturing: false,
  isDemoPlaying: false,
  backendConnected: false,
  showSourceText: true,
  runtime: null,
};

const ui = {
  demoButton: document.getElementById("demo-button"),
  resetButton: document.getElementById("reset-button"),
  connectButton: document.getElementById("connect-button"),
  disconnectButton: document.getElementById("disconnect-button"),
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  backendOrigin: document.getElementById("backend-origin"),
  endpointPreview: document.getElementById("endpoint-preview"),
  statusText: document.getElementById("status-text"),
  latestEnglish: document.getElementById("latest-english"),
  latestSource: document.getElementById("latest-source"),
  latencyText: document.getElementById("latency-text"),
  audioText: document.getElementById("audio-text"),
  history: document.getElementById("history"),
  connectionPill: document.getElementById("connection-pill"),
  backendPill: document.getElementById("backend-pill"),
  statePill: document.getElementById("state-pill"),
  sourcePanel: document.getElementById("source-panel"),
};

ui.demoButton.addEventListener("click", playDemo);
ui.resetButton.addEventListener("click", resetShowcase);
ui.connectButton.addEventListener("click", connectBackend);
ui.disconnectButton.addEventListener("click", disconnectBackend);
ui.startButton.addEventListener("click", startCapture);
ui.stopButton.addEventListener("click", stopCapture);
ui.backendOrigin.addEventListener("input", updateEndpointPreview);

boot();

function boot() {
  const params = new URLSearchParams(window.location.search);
  const storedOrigin = window.localStorage.getItem("backend-origin") ?? "";
  const initialOrigin = params.get("backend") ?? storedOrigin;
  if (initialOrigin) {
    ui.backendOrigin.value = initialOrigin;
  }
  updateEndpointPreview();
  updateMicrophoneHint();
  refreshControls();
}

async function playDemo() {
  if (state.isDemoPlaying) {
    return;
  }

  await stopCapture();
  closeSocket();
  state.backendConnected = false;
  state.runtime = null;
  state.showSourceText = true;
  ui.sourcePanel.hidden = false;
  state.isDemoPlaying = true;
  refreshControls();

  setConnection("Demo Running");
  setBackendStatus("Backend Optional");
  setState("Simulating");
  setStatus("Running the GitHub Pages subtitle demo.");

  clearHistory();

  for (const line of demoScript) {
    if (!state.isDemoPlaying) {
      break;
    }
    publishTranslation({
      english_text: line.en,
      source_text: line.ko,
      audio_seconds: line.audio,
      latency_seconds: line.latency,
      created_at: timeStamp(),
    });
    await sleep(1600);
  }

  if (state.isDemoPlaying) {
    setConnection("Demo Mode");
    setState("Showcase Ready");
    setStatus("Demo finished. Connect a backend to enable live microphone translation.");
  }

  state.isDemoPlaying = false;
  refreshControls();
}

function resetShowcase() {
  state.isDemoPlaying = false;
  if (!state.backendConnected) {
    state.showSourceText = true;
    ui.sourcePanel.hidden = false;
  }
  clearHistory();
  ui.latestEnglish.textContent =
    "Press “Play Demo” to see the English translation underneath.";
  ui.latestSource.textContent =
    "안녕하세요. 데모를 실행하면 한국어 원문이 먼저 보입니다.";
  ui.latencyText.textContent = "Latency: demo";
  ui.audioText.textContent = "Audio: demo";
  setStatus(
    state.backendConnected
      ? "Backend connected. Start microphone capture when you're ready."
      : "Demo mode works on GitHub Pages without any server."
  );
  setState(state.backendConnected ? "Backend Ready" : "Showcase Ready");
  setConnection(state.backendConnected ? "Backend Connected" : "Demo Mode");
  setBackendStatus(state.backendConnected ? backendLabel() : "Backend Optional");
  refreshControls();
}

async function connectBackend() {
  const origin = normalizeOrigin(ui.backendOrigin.value);
  if (!origin) {
    setStatus("Enter a backend origin such as https://your-backend.example.com.");
    return;
  }

  state.isDemoPlaying = false;
  await stopCapture();
  closeSocket();
  refreshControls();

  setConnection("Connecting");
  setBackendStatus("Checking Backend");
  setState("Connecting");
  setStatus("Checking the backend health endpoint.");

  const healthUrl = new URL("/api/health", origin).toString();
  const socketUrl = toWebSocketUrl(origin);

  try {
    const response = await fetch(healthUrl);
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}.`);
    }

    const payload = await response.json();
    if (payload.runtime) {
      applyRuntime(payload.runtime);
    }

    await openSocket(socketUrl);
    state.backendConnected = true;
    state.isDemoPlaying = false;
    window.localStorage.setItem("backend-origin", origin);
    setConnection("Backend Connected");
    setBackendStatus(backendLabel());
    setState("Backend Ready");
    setStatus("Backend connected. You can now start microphone capture.");
  } catch (error) {
    state.backendConnected = false;
    state.runtime = null;
    state.showSourceText = true;
    ui.sourcePanel.hidden = false;
    closeSocket();
    setConnection("Demo Mode");
    setBackendStatus("Backend Offline");
    setState("Showcase Ready");
    setStatus(`Backend connection failed: ${error.message}`);
  }

  refreshControls();
}

async function disconnectBackend() {
  state.isDemoPlaying = false;
  await stopCapture();
  state.backendConnected = false;
  state.runtime = null;
  state.showSourceText = true;
  ui.sourcePanel.hidden = false;
  closeSocket();
  setConnection("Demo Mode");
  setBackendStatus("Backend Optional");
  setState("Showcase Ready");
  setStatus("Disconnected from the backend. Demo mode is still available.");
  refreshControls();
}

async function startCapture() {
  if (state.isCapturing || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    setStatus("Waiting for browser microphone permission.");

    const stream = await requestMicrophoneStream();

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

    setState("Listening");
    setStatus("Listening for Korean speech through the connected backend.");
  } catch (error) {
    setState("Mic Blocked");
    setStatus(`Microphone could not start: ${error.message}`);
  } finally {
    refreshControls();
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
      "browser microphone access requires HTTPS or localhost. On the host PC use http://127.0.0.1:8000. From another laptop, set up HTTPS and open https://192.168.0.20:8443."
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

async function stopCapture() {
  if (!state.isCapturing) {
    refreshControls();
    return;
  }

  state.isCapturing = false;

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

  if (state.backendConnected) {
    setState("Backend Ready");
    setStatus("Microphone stopped.");
  } else {
    setState("Showcase Ready");
  }

  refreshControls();
}

function updateEndpointPreview() {
  const origin = normalizeOrigin(ui.backendOrigin.value);
  if (!origin) {
    ui.endpointPreview.textContent = "Health: /api/health · Socket: /ws";
    return;
  }

  const healthUrl = new URL("/api/health", origin).toString();
  const socketUrl = toWebSocketUrl(origin);
  ui.endpointPreview.textContent = `Health: ${healthUrl} · Socket: ${socketUrl}`;
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";

    socket.addEventListener(
      "open",
      () => {
        state.socket = socket;
        resolve();
      },
      { once: true }
    );

    socket.addEventListener(
      "error",
      () => {
        reject(new Error("WebSocket connection failed."));
      },
      { once: true }
    );

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      handleServerEvent(payload);
    });

    socket.addEventListener("close", () => {
      if (state.socket === socket) {
        state.socket = null;
      }
      if (state.backendConnected && !state.isCapturing) {
        setStatus("The backend connection was closed.");
      } else if (state.isCapturing) {
        setStatus("The backend connection was lost. Reconnect before continuing.");
      }
      state.backendConnected = false;
      state.isCapturing = false;
      refreshControls();
    });
  });
}

function closeSocket() {
  if (!state.socket) {
    return;
  }
  const socket = state.socket;
  state.socket = null;
  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close();
  }
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
    setState("Backend Ready");
    setMicrophoneAwareStatus("Backend model is ready. Start microphone capture when you want.");
    return;
  }

  if (payload.type === "status") {
    const stateName = payload.state ?? "working";
    setState(toTitleCase(stateName));

    if (stateName === "warming_up") {
      setMicrophoneAwareStatus("Backend is loading the speech model.");
    } else if (stateName === "translating") {
      setStatus("Backend is translating the latest utterance.");
    } else if (stateName === "listening") {
      setMicrophoneAwareStatus("Listening for Korean speech.");
    }
    return;
  }

  if (payload.type === "translation") {
    publishTranslation(payload);
    return;
  }

  if (payload.type === "error") {
    setState("Error");
    setStatus(payload.message);
  }
}

function applyRuntime(runtime) {
  state.runtime = runtime;
  state.showSourceText = Boolean(runtime.show_source_text);
  ui.sourcePanel.hidden = false;
  if (!state.showSourceText) {
    ui.latestSource.textContent =
      "Korean transcript is disabled on this backend. Set SHOW_SOURCE_TEXT=true on the host PC.";
  }
  setBackendStatus(backendLabel());
}

function publishTranslation(payload) {
  ui.latestEnglish.textContent = payload.english_text;
  ui.latencyText.textContent = `Latency: ${payload.latency_seconds}s`;
  ui.audioText.textContent = `Audio: ${payload.audio_seconds}s`;

  if (payload.source_text) {
    ui.latestSource.textContent = payload.source_text;
  } else if (!state.showSourceText) {
    ui.latestSource.textContent =
      "Korean transcript is disabled on this backend. Set SHOW_SOURCE_TEXT=true on the host PC.";
  }

  prependHistory(payload);
}

function prependHistory(payload) {
  const item = document.createElement("article");
  item.className = "sentence-card history-item";

  const sourceBlock = document.createElement("div");
  sourceBlock.className = "sentence-block korean-block";
  item.appendChild(sourceBlock);

  const sourceLabel = document.createElement("div");
  sourceLabel.className = "block-label";
  sourceLabel.textContent = "Korean";
  sourceBlock.appendChild(sourceLabel);

  const source = document.createElement("div");
  source.className = "history-source";
  source.textContent =
    payload.source_text ??
    "Korean transcript unavailable. Enable SHOW_SOURCE_TEXT=true on the host PC.";
  sourceBlock.appendChild(source);

  const englishBlock = document.createElement("div");
  englishBlock.className = "sentence-block english-block";
  item.appendChild(englishBlock);

  const englishLabel = document.createElement("div");
  englishLabel.className = "block-label";
  englishLabel.textContent = "English";
  englishBlock.appendChild(englishLabel);

  const english = document.createElement("div");
  english.className = "history-english";
  english.textContent = payload.english_text;
  englishBlock.appendChild(english);

  const meta = document.createElement("div");
  meta.className = "history-meta";
  meta.innerHTML = `
    <span>${payload.created_at}</span>
    <span>Latency ${payload.latency_seconds}s</span>
    <span>Audio ${payload.audio_seconds}s</span>
  `;
  item.appendChild(meta);

  ui.history.prepend(item);
  while (ui.history.children.length > 18) {
    ui.history.removeChild(ui.history.lastChild);
  }
}

function clearHistory() {
  ui.history.innerHTML = "";
}

function refreshControls() {
  ui.demoButton.disabled = state.isDemoPlaying || state.isCapturing;
  ui.resetButton.disabled = state.isCapturing;
  ui.connectButton.disabled = state.isCapturing;
  ui.disconnectButton.disabled = !state.backendConnected && !state.socket;
  ui.startButton.disabled = !state.backendConnected || state.isCapturing;
  ui.stopButton.disabled = !state.isCapturing;
}

function normalizeOrigin(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function toWebSocketUrl(origin) {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function backendLabel() {
  if (!state.runtime) {
    return "Backend Connected";
  }
  const device = state.runtime.device ?? "auto";
  return `${state.runtime.model} · ${device}`;
}

function setConnection(text) {
  ui.connectionPill.textContent = text;
}

function setBackendStatus(text) {
  ui.backendPill.textContent = text;
}

function setState(text) {
  ui.statePill.textContent = text;
}

function setStatus(text) {
  ui.statusText.textContent = text;
}

function timeStamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
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
