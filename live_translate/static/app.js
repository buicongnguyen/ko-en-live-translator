const state = {
  socket: null,
  audioContext: null,
  mediaStream: null,
  sourceNode: null,
  processorNode: null,
  mutedNode: null,
  isCapturing: false,
  showSourceText: false,
};

const ui = {
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  statusText: document.getElementById("status-text"),
  latestEnglish: document.getElementById("latest-english"),
  latestSource: document.getElementById("latest-source"),
  latencyText: document.getElementById("latency-text"),
  audioText: document.getElementById("audio-text"),
  history: document.getElementById("history"),
  connectionPill: document.getElementById("connection-pill"),
  statePill: document.getElementById("state-pill"),
  modelPill: document.getElementById("model-pill"),
  sourcePanel: document.getElementById("source-panel"),
};

ui.startButton.addEventListener("click", startCapture);
ui.stopButton.addEventListener("click", stopCapture);

boot().catch((error) => {
  setStatus(`Startup error: ${error.message}`);
  console.error(error);
});

async function boot() {
  await fetchHealth();
  connectSocket();
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

  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    connectSocket();
    await waitForSocket();
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

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
    setStatus(payload.message);
    return;
  }

  if (payload.type === "ready") {
    setState("Ready");
    setStatus("Model is ready. You can start talking.");
    return;
  }

  if (payload.type === "status") {
    const stateName = payload.state ?? "Working";
    setState(toTitleCase(stateName));
    if (stateName === "warming_up") {
      setStatus("Loading the local model. The first launch can take a while.");
    } else if (stateName === "translating") {
      setStatus("Translating the latest utterance.");
    } else if (stateName === "listening") {
      setStatus("Listening for Korean speech.");
    }
    return;
  }

  if (payload.type === "translation") {
    ui.latestEnglish.textContent = payload.english_text;
    ui.latencyText.textContent = `Latency: ${payload.latency_seconds}s`;
    ui.audioText.textContent = `Audio: ${payload.audio_seconds}s`;
    if (state.showSourceText && payload.source_text) {
      ui.latestSource.textContent = payload.source_text;
    }
    prependHistory(payload);
    return;
  }

  if (payload.type === "error") {
    setState("Error");
    setStatus(payload.message);
  }
}

function prependHistory(payload) {
  const item = document.createElement("article");
  item.className = "history-item";

  const english = document.createElement("div");
  english.className = "history-english";
  english.textContent = payload.english_text;
  item.appendChild(english);

  if (state.showSourceText && payload.source_text) {
    const source = document.createElement("div");
    source.className = "history-source";
    source.textContent = payload.source_text;
    item.appendChild(source);
  }

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

function applyRuntime(runtime) {
  const device = runtime.device ?? "auto";
  const computeType = runtime.compute_type ?? "auto";
  ui.modelPill.textContent = `Model: ${runtime.model} · ${device} · ${computeType}`;
  state.showSourceText = Boolean(runtime.show_source_text);
  ui.sourcePanel.hidden = !state.showSourceText;
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
