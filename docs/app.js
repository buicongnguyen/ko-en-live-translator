const demoSources = {
  ko: [
    "안녕하세요. 오늘 회의는 세 시에 시작합니다.",
    "지금 화면에 보이는 자료를 같이 봐 주세요.",
    "질문이 있으면 언제든지 편하게 말씀해 주세요.",
  ],
  ja: [
    "こんにちは。今日の会議は三時に始まります。",
    "画面に表示されている資料を一緒に見てください。",
    "質問があれば、いつでも気軽に話してください。",
  ],
  zh: [
    "你好。今天的会议三点开始。",
    "请一起看屏幕上显示的资料。",
    "如果有问题，请随时告诉我。",
  ],
  vi: [
    "Xin chào. Cuộc họp hôm nay bắt đầu lúc ba giờ.",
    "Vui lòng cùng xem tài liệu đang hiển thị trên màn hình.",
    "Nếu có câu hỏi, bạn cứ thoải mái nói bất cứ lúc nào.",
  ],
  es: [
    "Hola. La reunión de hoy empieza a las tres.",
    "Por favor, revisen el material que aparece en la pantalla.",
    "Si tienen preguntas, pueden hablar en cualquier momento.",
  ],
  fr: [
    "Bonjour. La réunion d'aujourd'hui commence à trois heures.",
    "Veuillez regarder le document affiché à l'écran.",
    "Si vous avez des questions, vous pouvez parler à tout moment.",
  ],
  de: [
    "Hallo. Die heutige Besprechung beginnt um drei Uhr.",
    "Bitte sehen Sie sich das Material auf dem Bildschirm an.",
    "Wenn Sie Fragen haben, können Sie jederzeit sprechen.",
  ],
  en: [
    "Hello. Today's meeting starts at three o'clock.",
    "Please take a look at the material shown on the screen.",
    "If you have any questions, please feel free to ask at any time.",
  ],
};

const demoTargets = {
  en: demoSources.en,
  vi: [
    "Xin chào. Cuộc họp hôm nay bắt đầu lúc ba giờ.",
    "Vui lòng xem tài liệu đang hiển thị trên màn hình.",
    "Nếu có câu hỏi, bạn cứ thoải mái hỏi bất cứ lúc nào.",
  ],
  ko: [
    "안녕하세요. 오늘 회의는 세 시에 시작합니다.",
    "지금 화면에 보이는 자료를 같이 봐 주세요.",
    "질문이 있으면 언제든지 편하게 말씀해 주세요.",
  ],
  ja: [
    "こんにちは。今日の会議は三時に始まります。",
    "画面に表示されている資料を見てください。",
    "質問があれば、いつでも気軽に聞いてください。",
  ],
  zh: [
    "你好。今天的会议三点开始。",
    "请看屏幕上显示的资料。",
    "如果有问题，请随时提问。",
  ],
  es: [
    "Hola. La reunión de hoy empieza a las tres.",
    "Por favor, revisa el material que aparece en la pantalla.",
    "Si tienes preguntas, no dudes en hacerlas en cualquier momento.",
  ],
  fr: [
    "Bonjour. La réunion d'aujourd'hui commence à trois heures.",
    "Veuillez regarder le document affiché à l'écran.",
    "Si vous avez des questions, n'hésitez pas à les poser à tout moment.",
  ],
  de: [
    "Hallo. Die heutige Besprechung beginnt um drei Uhr.",
    "Bitte sehen Sie sich das Material auf dem Bildschirm an.",
    "Wenn Sie Fragen haben, können Sie sie jederzeit stellen.",
  ],
};

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
  sourceLanguage: "ko",
  targetLanguage: "en",
  sourceLines: [],
  targetLines: [],
};

const ui = {
  demoButton: document.getElementById("demo-button"),
  resetButton: document.getElementById("reset-button"),
  connectButton: document.getElementById("connect-button"),
  disconnectButton: document.getElementById("disconnect-button"),
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  sourceLanguage: document.getElementById("source-language"),
  targetLanguage: document.getElementById("target-language"),
  sourceLanguageLabel: document.getElementById("source-language-label"),
  targetLanguageLabel: document.getElementById("target-language-label"),
  backendOrigin: document.getElementById("backend-origin"),
  endpointPreview: document.getElementById("endpoint-preview"),
  statusText: document.getElementById("status-text"),
  sourceTranscript: document.getElementById("source-transcript"),
  targetTranscript: document.getElementById("target-transcript"),
  copySourceButton: document.getElementById("copy-source-button"),
  copyTargetButton: document.getElementById("copy-target-button"),
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
ui.sourceLanguage.addEventListener("change", handleSourceLanguageChange);
ui.targetLanguage.addEventListener("change", handleTargetLanguageChange);
ui.copySourceButton.addEventListener("click", () => copyTranscript("source"));
ui.copyTargetButton.addEventListener("click", () => copyTranscript("target"));
ui.clearTranscriptButton.addEventListener("click", clearTranscript);

boot();

function boot() {
  restoreSourceLanguagePreference();
  restoreTargetLanguagePreference();
  updateLanguageUi();
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

  for (const line of selectedDemoScript()) {
    if (!state.isDemoPlaying) {
      break;
    }
    publishTranslation({
      translated_text: line.target,
      english_text: line.target,
      source_text: line.source,
      source_language: state.sourceLanguage,
      target_language: state.targetLanguage,
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
    sendLanguageSetting();
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
    setStatus(`Listening: ${sourceLanguageName()} to ${targetLanguageName()}.`);
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
      setStatus(`Backend is translating to ${targetLanguageName()}.`);
    } else if (stateName === "listening") {
      setMicrophoneAwareStatus(`Listening: ${sourceLanguageName()} to ${targetLanguageName()}.`);
    }
    return;
  }

  if (payload.type === "language") {
    applySourceLanguage(payload.source_language, { persist: false });
    applyTargetLanguage(payload.target_language, { persist: false });
    setMicrophoneAwareStatus(`Language pair set: ${sourceLanguageName()} to ${targetLanguageName()}.`);
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
  if (!window.localStorage.getItem("source-language")) {
    applySourceLanguage(runtime.source_language, { persist: false });
  }
  if (!window.localStorage.getItem("target-language")) {
    applyTargetLanguage(runtime.target_language, { persist: false });
  }
  if (state.sourceLines.length === 0) {
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
  const sourceText =
    payload.source_text ||
    "Source transcript unavailable. Set SHOW_SOURCE_TEXT=true on the host PC.";
  const targetText = payload.translated_text || payload.english_text || "";

  state.sourceLines.push(sourceText);
  state.targetLines.push(targetText);
  renderAllTranscripts();
  scrollTranscriptToBottom(ui.sourceTranscript);
  scrollTranscriptToBottom(ui.targetTranscript);
}

function renderAllTranscripts() {
  renderTranscriptBox(ui.sourceTranscript, state.sourceLines, sourceEmptyText());
  renderTranscriptBox(
    ui.targetTranscript,
    state.targetLines,
    `Press “Play demo” to see ${targetLanguageName()} here.`
  );
}

function sourceEmptyText() {
  if (!state.showSourceText) {
    return "Source transcript is disabled on this backend. Set SHOW_SOURCE_TEXT=true to show source lines.";
  }

  return `${sourceLanguageName()} transcript will appear here.`;
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
  const isSource = language === "source";
  const lines = isSource ? state.sourceLines : state.targetLines;
  const label = isSource ? sourceLanguageName() : targetLanguageName();
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
  state.sourceLines = [];
  state.targetLines = [];
  renderAllTranscripts();

  if (!options.silent) {
    ui.latencyText.textContent = state.backendConnected ? "Latency: -" : "Latency: demo";
    ui.audioText.textContent = state.backendConnected ? "Audio: -" : "Audio: demo";
    setStatus("Transcript cleared.");
  }
}

function handleSourceLanguageChange() {
  state.sourceLanguage = selectedSourceLanguage();
  window.localStorage.setItem("source-language", state.sourceLanguage);
  updateLanguageUi();

  if (state.isCapturing && state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: "flush" }));
  }

  sendLanguageSetting();
  setStatus(`New speech will translate ${sourceLanguageName()} to ${targetLanguageName()}.`);
}

function handleTargetLanguageChange() {
  state.targetLanguage = selectedTargetLanguage();
  window.localStorage.setItem("target-language", state.targetLanguage);
  updateLanguageUi();

  if (state.isCapturing && state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: "flush" }));
  }

  sendLanguageSetting();
  setStatus(`New speech will translate ${sourceLanguageName()} to ${targetLanguageName()}.`);
}

function sendLanguageSetting() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  state.socket.send(
    JSON.stringify({
      type: "set_language",
      source_language: state.sourceLanguage,
      target_language: state.targetLanguage,
    })
  );
}

function restoreSourceLanguagePreference() {
  const storedLanguage = window.localStorage.getItem("source-language");
  applySourceLanguage(storedLanguage || ui.sourceLanguage.value, { persist: false });
}

function restoreTargetLanguagePreference() {
  const storedLanguage = window.localStorage.getItem("target-language");
  applyTargetLanguage(storedLanguage || ui.targetLanguage.value, { persist: false });
}

function applySourceLanguage(sourceLanguage, options = {}) {
  const option = sourceLanguageOption(sourceLanguage) || sourceLanguageOption("ko");
  state.sourceLanguage = option.value;
  ui.sourceLanguage.value = option.value;
  if (options.persist) {
    window.localStorage.setItem("source-language", state.sourceLanguage);
  }
  updateLanguageUi();
}

function applyTargetLanguage(targetLanguage, options = {}) {
  const option = targetLanguageOption(targetLanguage) || targetLanguageOption("en");
  state.targetLanguage = option.value;
  ui.targetLanguage.value = option.value;
  if (options.persist) {
    window.localStorage.setItem("target-language", state.targetLanguage);
  }
  updateLanguageUi();
}

function selectedSourceLanguage() {
  return ui.sourceLanguage.value || "ko";
}

function selectedTargetLanguage() {
  return ui.targetLanguage.value || "en";
}

function sourceLanguageOption(value) {
  return Array.from(ui.sourceLanguage.options).find(
    (option) => option.value === value
  );
}

function targetLanguageOption(value) {
  return Array.from(ui.targetLanguage.options).find(
    (option) => option.value === value
  );
}

function sourceLanguageName() {
  const option = sourceLanguageOption(state.sourceLanguage);
  return option ? option.textContent : "Korean";
}

function targetLanguageName() {
  const option = targetLanguageOption(state.targetLanguage);
  return option ? option.textContent : "English";
}

function updateLanguageUi() {
  const label = state.sourceLanguage === "auto" ? "Source" : sourceLanguageName();
  ui.sourceLanguageLabel.textContent = label;
  ui.copySourceButton.textContent = `Copy ${label}`;
  ui.targetLanguageLabel.textContent = targetLanguageName();
  ui.copyTargetButton.textContent = `Copy ${targetLanguageName()}`;
}

function selectedDemoScript() {
  const sourceRows = demoSources[state.sourceLanguage] || demoSources.ko;
  const targetRows =
    state.sourceLanguage === state.targetLanguage
      ? sourceRows
      : demoTargets[state.targetLanguage] || demoTargets.en;
  return sourceRows.map((source, index) => ({
    source,
    target: targetRows[index] || demoTargets.en[index],
    audio: 2.3 + index * 0.25,
    latency: 0.68 + index * 0.08,
  }));
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
