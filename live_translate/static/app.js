const THEME_STORAGE_KEY = "translator-theme";

const state = {
  socket: null,
  audioContext: null,
  mediaStream: null,
  sourceNode: null,
  processorNode: null,
  mutedNode: null,
  isCapturing: false,
  showSourceText: true,
  sourceLanguage: "ko",
  targetLanguage: "en",
  sourceLines: [],
  targetLines: [],
  conversationLines: [],
};

const ui = {
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  sourceLanguage: document.getElementById("source-language"),
  targetLanguage: document.getElementById("target-language"),
  sourceLanguageBadge: document.getElementById("source-language-badge"),
  targetLanguageBadge: document.getElementById("target-language-badge"),
  sourceLanguageLabel: document.getElementById("source-language-label"),
  targetLanguageLabel: document.getElementById("target-language-label"),
  statusText: document.getElementById("status-text"),
  sourceTranscript: document.getElementById("source-transcript"),
  targetTranscript: document.getElementById("target-transcript"),
  conversationTranscript: document.getElementById("conversation-transcript"),
  copySourceButton: document.getElementById("copy-source-button"),
  copyTargetButton: document.getElementById("copy-target-button"),
  copyConversationButton: document.getElementById("copy-conversation-button"),
  clearTranscriptButton: document.getElementById("clear-transcript-button"),
  latencyText: document.getElementById("latency-text"),
  audioText: document.getElementById("audio-text"),
  connectionPill: document.getElementById("connection-pill"),
  statePill: document.getElementById("state-pill"),
  modelPill: document.getElementById("model-pill"),
  themeToggleButton: document.getElementById("theme-toggle-button"),
};

ui.startButton.addEventListener("click", startCapture);
ui.stopButton.addEventListener("click", stopCapture);
ui.sourceLanguage.addEventListener("change", handleSourceLanguageChange);
ui.targetLanguage.addEventListener("change", handleTargetLanguageChange);
ui.copySourceButton.addEventListener("click", () => copyTranscript("source"));
ui.copyTargetButton.addEventListener("click", () => copyTranscript("target"));
ui.copyConversationButton.addEventListener("click", () => copyTranscript("conversation"));
ui.clearTranscriptButton.addEventListener("click", clearTranscript);
ui.themeToggleButton.addEventListener("click", toggleTheme);

boot().catch((error) => {
  setStatus(`Startup error: ${error.message}`);
  console.error(error);
});

async function boot() {
  initializeTheme();
  restoreSourceLanguagePreference();
  restoreTargetLanguagePreference();
  updateLanguageUi();
  renderAllTranscripts();
  await fetchHealth();
  connectSocket();
  updateMicrophoneHint();
}

function initializeTheme() {
  let storedTheme = "";
  try {
    storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) || "";
  } catch {
    storedTheme = "";
  }
  applyTheme(storedTheme === "dark" ? "dark" : "light");
}

function toggleTheme() {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme, { persist: true });
}

function applyTheme(theme, options = {}) {
  const isDark = theme === "dark";
  if (isDark) {
    document.documentElement.dataset.theme = "dark";
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  if (options.persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
    } catch {
      // Theme still changes for this page even if storage is unavailable.
    }
  }

  ui.themeToggleButton.textContent = isDark ? "Light" : "Dark";
  ui.themeToggleButton.setAttribute("aria-pressed", String(isDark));
  ui.themeToggleButton.setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode"
  );
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
    sendLanguageSetting();
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
  setStatus(`Listening: ${sourceLanguageName()} to ${targetLanguageName()}.`);
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
    if (payload.message) {
      setStatus(payload.message);
    } else if (stateName === "warming_up") {
      setMicrophoneAwareStatus("Loading the local model. The first launch can take a while.");
    } else if (stateName === "translating") {
      setStatus(`Translating to ${targetLanguageName()}.`);
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
  const targetText = payload.translated_text || payload.english_text || "";
  const sourceText = payload.source_text || "";

  if (sourceText) {
    state.sourceLines.push(sourceText);
  }
  if (targetText) {
    state.targetLines.push(targetText);
  }
  if (sourceText || targetText) {
    state.conversationLines.push({
      sourceText,
      targetText,
      sourceLabel: languageBadge(state.sourceLanguage),
      targetLabel: languageBadge(state.targetLanguage),
    });
  }
  renderAllTranscripts();
  scrollTranscriptToBottom(ui.sourceTranscript);
  scrollTranscriptToBottom(ui.targetTranscript);
  scrollTranscriptToBottom(ui.conversationTranscript);
}

function renderAllTranscripts() {
  renderConversationBox(
    ui.conversationTranscript,
    state.conversationLines,
    conversationEmptyText()
  );
  renderTranscriptBox(
    ui.sourceTranscript,
    state.sourceLines,
    sourceEmptyText()
  );
  renderTranscriptBox(
    ui.targetTranscript,
    state.targetLines,
    `${targetLanguageName()} translation will appear here.`
  );
}

function conversationEmptyText() {
  return `Speak to see ${sourceLanguageName()} and ${targetLanguageName()} together.`;
}

function sourceEmptyText() {
  if (!state.showSourceText) {
    return "Source transcript is disabled on this backend. Set SHOW_SOURCE_TEXT=true to show source lines.";
  }

  return "Source transcript will appear here after you start listening.";
}

function renderConversationBox(container, lines, emptyText) {
  container.innerHTML = "";

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  lines.forEach((line, index) => {
    const pair = document.createElement("section");
    pair.className = "conversation-pair";
    if (index === lines.length - 1) {
      pair.classList.add("latest");
    }

    if (line.sourceText) {
      pair.appendChild(
        createConversationLine("source", line.sourceLabel, line.sourceText)
      );
    }
    if (line.targetText) {
      pair.appendChild(
        createConversationLine("target", line.targetLabel, line.targetText)
      );
    }

    container.appendChild(pair);
  });
}

function createConversationLine(kind, label, text) {
  const row = document.createElement("p");
  row.className = `conversation-line ${kind}`;

  const language = document.createElement("span");
  language.className = "conversation-language";
  language.textContent = label;

  const content = document.createElement("span");
  content.className = "conversation-text";
  content.textContent = text;

  row.append(language, content);
  return row;
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
  if (!container) {
    return;
  }

  const scroll = () => {
    container.scrollTop = container.scrollHeight;
  };

  scroll();
  window.requestAnimationFrame(scroll);
}

async function copyTranscript(language) {
  if (language === "conversation") {
    await copyConversationTranscript();
    return;
  }

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

async function copyConversationTranscript() {
  const text = state.conversationLines
    .map((line) =>
      [
        line.sourceText ? `${line.sourceLabel}: ${line.sourceText}` : "",
        line.targetText ? `${line.targetLabel}: ${line.targetText}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!text) {
    setStatus("Conversation text box is empty.");
    return;
  }

  try {
    await writeClipboard(text);
    setStatus("Conversation copied to clipboard.");
  } catch (error) {
    setStatus(`Could not copy conversation: ${error.message}`);
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
  state.sourceLines = [];
  state.targetLines = [];
  state.conversationLines = [];
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
  if (!window.localStorage.getItem("source-language")) {
    applySourceLanguage(runtime.source_language, { persist: false });
  }
  if (!window.localStorage.getItem("target-language")) {
    applyTargetLanguage(runtime.target_language, { persist: false });
  }
  if (state.sourceLines.length === 0) {
    renderAllTranscripts();
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

function languageBadge(languageCode) {
  const badges = {
    auto: "AU",
    ko: "KO",
    vi: "VN",
    en: "EN",
    ja: "JA",
    zh: "ZH",
    es: "ES",
    fr: "FR",
    de: "DE",
    it: "IT",
    pt: "PT",
    ru: "RU",
    ar: "AR",
    hi: "HI",
    th: "TH",
    id: "ID",
    ms: "MS",
    tl: "TL",
    tr: "TR",
    pl: "PL",
    nl: "NL",
    uk: "UK",
  };
  return badges[languageCode] || languageCode.toUpperCase();
}

function updateLanguageUi() {
  const label = state.sourceLanguage === "auto" ? "Source" : sourceLanguageName();
  ui.sourceLanguageBadge.textContent = languageBadge(state.sourceLanguage);
  ui.targetLanguageBadge.textContent = languageBadge(state.targetLanguage);
  ui.sourceLanguageLabel.textContent = label;
  ui.copySourceButton.textContent = `Copy ${label}`;
  ui.targetLanguageLabel.textContent = targetLanguageName();
  ui.copyTargetButton.textContent = `Copy ${targetLanguageName()}`;
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
