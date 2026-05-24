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
  koreanLines: [],
  englishLines: [],
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
  koreanTranscript: document.getElementById("korean-transcript"),
  englishTranscript: document.getElementById("english-transcript"),
  copyKoreanButton: document.getElementById("copy-korean-button"),
  copyEnglishButton: document.getElementById("copy-english-button"),
  clearTranscriptButton: document.getElementById("clear-transcript-button"),
  latencyText: document.getElementById("latency-text"),
  audioText: document.getElementById("audio-text"),
  connectionPill: document.getElementById("connection-pill"),
  backendPill: document.getElementById("backend-pill"),
  statePill: document.getElementById("state-pill"),
};

ui.demoButton.addEventListener("click", playDemo);
ui.resetButton.addEventListener("click", resetShowcase);
ui.connectButton.addEventListener("click", connectBackend);
ui.disconnectButton.addEventListener("click", disconnectBackend);
ui.startButton.addEventListener("click", startCapture);
ui.stopButton.addEventListener("click", stopCapture);
ui.backendOrigin.addEventListener("input", updateEndpointPreview);
ui.copyKoreanButton.addEventListener("click", () => copyTranscript("korean"));
ui.copyEnglishButton.addEventListener("click", () => copyTranscript("english"));
ui.clearTranscriptButton.addEventListener("click", clearTranscript);

boot();

function boot() {
  renderAllTranscripts();
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
  state.isDemoPlaying = true;
  refreshControls();

  setConnection("Demo Running");
  setBackendStatus("Backend Optional");
  setState("Simulating");
  setStatus("Running the GitHub Pages subtitle demo.");

  clearTranscript({ silent: true });

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
  }
  clearTranscript({ silent: true });
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
  if (state.koreanLines.length === 0) {
    renderAllTranscripts();
  }
  setBackendStatus(backendLabel());
}

function publishTranslation(payload) {
  appendTranscript(payload);
  ui.latencyText.textContent = `Latency: ${payload.latency_seconds}s`;
  ui.audioText.textContent = `Audio: ${payload.audio_seconds}s`;
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
  renderTranscriptBox(ui.koreanTranscript, state.koreanLines, koreanEmptyText());
  renderTranscriptBox(
    ui.englishTranscript,
    state.englishLines,
    "Press “Play Demo” to see the English translation here."
  );
}

function koreanEmptyText() {
  if (!state.showSourceText) {
    return "Korean transcript is disabled on this backend. Set SHOW_SOURCE_TEXT=true to show source lines.";
  }

  return "안녕하세요. 데모를 실행하면 한국어 원문이 여기에 쌓입니다.";
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

function clearTranscript(options = {}) {
  state.koreanLines = [];
  state.englishLines = [];
  renderAllTranscripts();

  if (!options.silent) {
    ui.latencyText.textContent = state.backendConnected ? "Latency: -" : "Latency: demo";
    ui.audioText.textContent = state.backendConnected ? "Audio: -" : "Audio: demo";
    setStatus("Transcript cleared.");
  }
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
