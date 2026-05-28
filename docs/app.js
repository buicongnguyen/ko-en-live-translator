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

const DEFAULT_BACKEND_ORIGIN = "https://alone-catalog-rejoice.ngrok-free.dev";
const THEME_STORAGE_KEY = "translator-theme";

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
  connectionStatus: "Demo Mode",
  showSourceText: true,
  runtime: null,
  backendUser: null,
  auth: {
    available: false,
    app: null,
    auth: null,
    providers: {},
    user: null,
    token: "",
  },
  sourceLanguage: "ko",
  targetLanguage: "en",
  sourceLines: [],
  targetLines: [],
  conversationLines: [],
};

const ui = {
  demoButton: document.getElementById("demo-button"),
  resetButton: document.getElementById("reset-button"),
  connectButton: document.getElementById("connect-button"),
  disconnectButton: document.getElementById("disconnect-button"),
  googleLoginButton: document.getElementById("google-login-button"),
  facebookLoginButton: document.getElementById("facebook-login-button"),
  signOutButton: document.getElementById("sign-out-button"),
  authStatus: document.getElementById("auth-status"),
  userCard: document.getElementById("user-card"),
  adminPanel: document.getElementById("admin-panel"),
  adminSessions: document.getElementById("admin-sessions"),
  adminUsers: document.getElementById("admin-users"),
  refreshUsersButton: document.getElementById("refresh-users-button"),
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  sourceLanguage: document.getElementById("source-language"),
  targetLanguage: document.getElementById("target-language"),
  sourceLanguageBadge: document.getElementById("source-language-badge"),
  targetLanguageBadge: document.getElementById("target-language-badge"),
  sourceLanguageLabel: document.getElementById("source-language-label"),
  targetLanguageLabel: document.getElementById("target-language-label"),
  backendOrigin: document.getElementById("backend-origin"),
  endpointPreview: document.getElementById("endpoint-preview"),
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
  backendSummaryLabel: document.getElementById("backend-summary-label"),
  backendSummaryStatus: document.getElementById("backend-summary-status"),
  themeToggleButton: document.getElementById("theme-toggle-button"),
  backendDrawer: document.querySelector(".backend-drawer"),
};

ui.demoButton.addEventListener("click", playDemo);
ui.resetButton.addEventListener("click", resetShowcase);
ui.connectButton.addEventListener("click", connectBackend);
ui.disconnectButton.addEventListener("click", disconnectBackend);
ui.googleLoginButton.addEventListener("click", signInWithGoogle);
ui.facebookLoginButton.addEventListener("click", signInWithFacebook);
ui.signOutButton.addEventListener("click", signOutUser);
ui.refreshUsersButton.addEventListener("click", loadAdminUsers);
ui.startButton.addEventListener("click", startCapture);
ui.stopButton.addEventListener("click", stopCapture);
ui.backendOrigin.addEventListener("input", updateEndpointPreview);
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
  const params = new URLSearchParams(window.location.search);
  const storedOrigin = window.localStorage.getItem("backend-origin") ?? "";
  const initialOrigin =
    params.get("backend") ??
    (shouldUseDefaultBackendOrigin(storedOrigin)
      ? DEFAULT_BACKEND_ORIGIN
      : storedOrigin);
  if (initialOrigin) {
    ui.backendOrigin.value = initialOrigin;
  }
  updateEndpointPreview();
  updateMicrophoneHint();
  await initializeAuth();
  updateBackendSummaryStatus();
  refreshControls();
}

function shouldUseDefaultBackendOrigin(storedOrigin) {
  if (!storedOrigin) {
    return true;
  }

  try {
    const origin = new URL(storedOrigin).origin;
    return (
      origin === "http://127.0.0.1:8000" ||
      origin === "http://localhost:8000" ||
      origin === "https://127.0.0.1:8443" ||
      origin === "https://localhost:8443"
    );
  } catch {
    return true;
  }
}

async function initializeAuth() {
  const config = window.TRANSLATOR_FIREBASE_CONFIG;
  if (!config) {
    setAuthStatus(
      "Firebase login is not configured yet. You can still connect to an unprotected backend; protected RTX access needs Firebase variables in GitHub Actions."
    );
    refreshAuthUi();
    return;
  }

  try {
    const [{ initializeApp }, firebaseAuth] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
    ]);

    const {
      FacebookAuthProvider,
      GoogleAuthProvider,
      getAuth,
      onAuthStateChanged,
      signInWithPopup,
      signOut,
    } = firebaseAuth;

    state.auth.available = true;
    state.auth.signInWithPopup = signInWithPopup;
    state.auth.signOut = signOut;
    state.auth.app = initializeApp(config);
    state.auth.auth = getAuth(state.auth.app);
    state.auth.providers.google = new GoogleAuthProvider();
    state.auth.providers.google.setCustomParameters({ prompt: "select_account" });
    state.auth.providers.facebook = new FacebookAuthProvider();

    onAuthStateChanged(state.auth.auth, async (user) => {
      state.auth.user = user;
      state.auth.token = user ? await user.getIdToken() : "";
      state.backendUser = null;
      if (state.backendConnected) {
        await disconnectBackend();
      }
      refreshAuthUi();
    });

    setAuthStatus("Sign in before connecting to a protected backend.");
  } catch (error) {
    state.auth.available = false;
    setAuthStatus(`Firebase login could not load: ${error.message}`);
  }

  refreshAuthUi();
}

async function signInWithGoogle() {
  await signInWithProvider("google");
}

async function signInWithFacebook() {
  await signInWithProvider("facebook");
}

async function signInWithProvider(providerName) {
  if (!state.auth.available) {
    setAuthStatus("Firebase login is not configured yet.");
    return;
  }

  try {
    setAuthStatus(`Opening ${providerName} sign-in.`);
    await state.auth.signInWithPopup(
      state.auth.auth,
      state.auth.providers[providerName]
    );
  } catch (error) {
    setAuthStatus(`Sign-in failed: ${error.message}`);
  }
}

async function signOutUser() {
  if (!state.auth.available || !state.auth.auth) {
    return;
  }
  await state.auth.signOut(state.auth.auth);
  setAuthStatus("Signed out.");
}

function refreshAuthUi() {
  const signedIn = Boolean(state.auth.user);
  ui.googleLoginButton.disabled = !state.auth.available || signedIn;
  ui.facebookLoginButton.disabled = !state.auth.available || signedIn;
  ui.signOutButton.disabled = !signedIn;

  if (!state.auth.available) {
    ui.userCard.hidden = true;
    return;
  }

  if (!signedIn) {
    ui.userCard.hidden = true;
    setAuthStatus("Sign in with Google or Facebook before using a protected GPU backend.");
    return;
  }

  ui.userCard.hidden = false;
  ui.userCard.textContent = `Signed in: ${state.auth.user.email}`;
  setAuthStatus("Signed in. Connect to the backend to check approval.");
}

function setAuthStatus(text) {
  ui.authStatus.textContent = text;
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
      : "Demo ready."
  );
  setConnection(state.backendConnected ? "Backend Ready" : "Demo Mode");
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
  setStatus("Checking the backend health endpoint.");

  const healthUrl = new URL("/api/health", origin).toString();
  const socketUrl = toWebSocketUrl(origin);

  try {
    const token = await currentAuthToken();
    const response = await fetch(healthUrl, {
      headers: authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(await readableHttpError(response));
    }

    const payload = await response.json();
    if (payload.runtime) {
      applyRuntime(payload.runtime);
    }
    applyBackendAuth(payload.auth);

    await openSocket(socketUrl, token);
    sendLanguageSetting();
    state.backendConnected = true;
    state.isDemoPlaying = false;
    window.localStorage.setItem("backend-origin", origin);
    setConnection("Backend Ready");
    ui.latencyText.textContent = "Latency: -";
    ui.audioText.textContent = "Audio: -";
    setStatus("Backend connected. Starting microphone capture.");
    refreshControls();
    returnToConversationView();
    await loadAdminUsers();
    await startCapture();
  } catch (error) {
    state.backendConnected = false;
    state.runtime = null;
    state.backendUser = null;
    state.showSourceText = true;
    closeSocket();
    renderAdminPanel();
    setConnection("Demo Mode");
    setStatus(`Backend connection failed: ${error.message}`);
  }

  refreshControls();
}

async function disconnectBackend() {
  state.isDemoPlaying = false;
  await stopCapture();
  state.backendConnected = false;
  state.runtime = null;
  state.backendUser = null;
  state.showSourceText = true;
  closeSocket();
  renderAdminPanel();
  setConnection("Demo Mode");
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

    setStatus(`Listening: ${sourceLanguageName()} to ${targetLanguageName()}.`);
  } catch (error) {
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
    setStatus("Microphone stopped.");
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

async function currentAuthToken() {
  if (!state.auth.user) {
    return "";
  }
  state.auth.token = await state.auth.user.getIdToken();
  return state.auth.token;
}

function authHeaders(token) {
  return {
    // Free ngrok domains show an interstitial HTML warning unless API clients opt out.
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readableHttpError(response) {
  try {
    const payload = await response.json();
    return payload.detail || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

function applyBackendAuth(auth) {
  state.backendUser = auth?.user ?? null;
  if (auth?.required && !state.backendUser) {
    setAuthStatus("Backend requires login. Sign in and ask the admin to approve your email.");
  } else if (state.backendUser) {
    setAuthStatus(
      `Backend approved ${state.backendUser.email} as ${state.backendUser.role}.`
    );
  }
  renderAdminPanel();
}

function renderAdminPanel(users = null, sessionsPayload = null) {
  const isAdmin = state.backendConnected && state.backendUser?.role === "admin";
  ui.adminPanel.hidden = !isAdmin;
  if (!isAdmin) {
    ui.adminSessions.textContent = "Connect as an admin to view active sessions.";
    ui.adminUsers.textContent = "Connect as an admin to manage users.";
    return;
  }

  renderAdminSessions(sessionsPayload);
  renderAdminUsers(users);
}

function renderAdminUsers(users = null) {
  if (!users) {
    ui.adminUsers.textContent = "Use Refresh admin to load pending approvals.";
    return;
  }

  ui.adminUsers.innerHTML = "";
  if (users.length === 0) {
    ui.adminUsers.textContent = "No users have signed in yet.";
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("article");
    row.className = "admin-user-row";

    const meta = document.createElement("div");
    meta.className = "admin-user-meta";

    const email = document.createElement("div");
    email.className = "admin-user-email";
    email.textContent = user.email;

    const detail = document.createElement("div");
    detail.className = "admin-user-detail";
    detail.textContent = `${user.status} · ${user.role} · ${user.provider || "unknown provider"}`;

    meta.append(email, detail);

    const actions = document.createElement("div");
    actions.className = "admin-user-actions";
    actions.append(
      adminActionButton("Approve", user.email, "approve"),
      adminActionButton("Pending", user.email, "pending"),
      adminActionButton("Block", user.email, "block")
    );

    row.append(meta, actions);
    ui.adminUsers.appendChild(row);
  });
}

function renderAdminSessions(payload = null) {
  if (!payload) {
    ui.adminSessions.textContent = "Use Refresh admin to load active sessions.";
    return;
  }

  const sessions = payload.sessions || [];
  const summary = payload.summary || {};
  const gpu = payload.gpu || {};
  ui.adminSessions.innerHTML = "";

  const summaryCard = document.createElement("article");
  summaryCard.className = "admin-session-summary";
  summaryCard.textContent = [
    `Active ${summary.active ?? sessions.length}/${summary.max_active ?? "unlimited"}`,
    `Idle timeout ${formatDuration(summary.idle_timeout_seconds ?? 0)}`,
    gpu.available
      ? `GPU ${gpu.temperature_c ?? "?"}C / ${gpu.max_temperature_c ?? "?"}C`
      : "GPU status unavailable",
  ].join(" · ");
  ui.adminSessions.appendChild(summaryCard);

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-user-detail";
    empty.textContent = "No active live translation sessions.";
    ui.adminSessions.appendChild(empty);
    return;
  }

  sessions.forEach((session) => {
    const row = document.createElement("article");
    row.className = "admin-user-row";

    const meta = document.createElement("div");
    meta.className = "admin-user-meta";

    const email = document.createElement("div");
    email.className = "admin-user-email";
    email.textContent = session.email || "anonymous";

    const detail = document.createElement("div");
    detail.className = "admin-user-detail";
    detail.textContent = [
      `${session.source_language || "?"} to ${session.target_language || "?"}`,
      `connected ${formatTimestamp(session.connected_at)}`,
      `last audio ${formatTimestamp(session.last_audio_at)}`,
      queueSummary(session.queue),
    ]
      .filter(Boolean)
      .join(" · ");

    meta.append(email, detail);
    row.appendChild(meta);
    ui.adminSessions.appendChild(row);
  });
}

function adminActionButton(label, email, action) {
  const button = document.createElement("button");
  button.className = "secondary compact-button";
  button.textContent = label;
  button.addEventListener("click", () => updateUserStatus(email, action));
  return button;
}

async function loadAdminUsers() {
  if (!state.backendConnected || state.backendUser?.role !== "admin") {
    renderAdminPanel();
    return;
  }

  try {
    const token = await currentAuthToken();
    const [usersResponse, sessionsResponse] = await Promise.all([
      fetch(adminUrl("/api/admin/users"), {
        headers: authHeaders(token),
      }),
      fetch(adminUrl("/api/admin/sessions"), {
        headers: authHeaders(token),
      }),
    ]);
    if (!usersResponse.ok) {
      throw new Error(await readableHttpError(usersResponse));
    }
    if (!sessionsResponse.ok) {
      throw new Error(await readableHttpError(sessionsResponse));
    }
    const usersPayload = await usersResponse.json();
    const sessionsPayload = await sessionsResponse.json();
    renderAdminPanel(usersPayload.users || [], sessionsPayload);
  } catch (error) {
    ui.adminSessions.textContent = `Could not load sessions: ${error.message}`;
    ui.adminUsers.textContent = `Could not load users: ${error.message}`;
  }
}

async function updateUserStatus(email, action) {
  if (!state.backendConnected || state.backendUser?.role !== "admin") {
    return;
  }

  try {
    const token = await currentAuthToken();
    const response = await fetch(adminUrl(`/api/admin/users/${action}`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      throw new Error(await readableHttpError(response));
    }
    await loadAdminUsers();
    setStatus(`${email} is now ${action === "approve" ? "approved" : action}.`);
  } catch (error) {
    setStatus(`Admin update failed: ${error.message}`);
  }
}

function adminUrl(path) {
  return new URL(path, normalizeOrigin(ui.backendOrigin.value)).toString();
}

function openSocket(url, token = "") {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.close();
      reject(new Error("WebSocket connection timed out."));
    }, 10000);

    socket.addEventListener(
      "open",
      () => {
        state.socket = socket;
        if (token) {
          socket.send(JSON.stringify({ type: "auth", token }));
        }
      },
      { once: true }
    );

    socket.addEventListener(
      "error",
      () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error("WebSocket connection failed."));
        }
      },
      { once: true }
    );

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (!settled) {
        if (payload.type === "error") {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error(payload.message || "WebSocket authentication failed."));
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        resolve();
      }
      handleServerEvent(payload);
    });

    socket.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error("WebSocket closed before the backend accepted the connection."));
      }
      if (state.socket === socket) {
        state.socket = null;
      }
      if (state.backendConnected && !state.isCapturing) {
        setStatus("The backend connection was closed.");
      } else if (state.isCapturing) {
        setStatus("The backend connection was lost. Reconnect before continuing.");
      }
      state.backendConnected = false;
      state.backendUser = null;
      state.isCapturing = false;
      renderAdminPanel();
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
    applyBackendAuth(payload.auth);
    setMicrophoneAwareStatus(payload.message);
    return;
  }

  if (payload.type === "auth") {
    if (payload.user) {
      state.backendUser = payload.user;
      setAuthStatus(`Backend approved ${payload.user.email}.`);
      renderAdminPanel();
    }
    return;
  }

  if (payload.type === "ready") {
    setConnection("Backend Ready");
    setMicrophoneAwareStatus("Backend model is ready. Start microphone capture when you want.");
    return;
  }

  if (payload.type === "status") {
    const stateName = payload.state ?? "working";

    if (payload.message) {
      setStatus(payload.message);
    } else if (stateName === "warming_up") {
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
  updateBackendSummaryStatus();
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

function returnToConversationView() {
  ui.backendDrawer?.removeAttribute("open");
  window.requestAnimationFrame(() => {
    ui.conversationTranscript?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    ui.conversationTranscript?.focus({ preventScroll: true });
  });
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function publishTranslation(payload) {
  appendTranscript(payload);
  ui.latencyText.textContent = `Latency: ${payload.latency_seconds}s`;
  ui.audioText.textContent = `Audio: ${payload.audio_seconds}s`;
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
      createdAt: payload.created_at || timeStamp(),
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
  renderTranscriptBox(ui.sourceTranscript, state.sourceLines, sourceEmptyText());
  renderTranscriptBox(
    ui.targetTranscript,
    state.targetLines,
    `Press “Demo” to see ${targetLanguageName()} here.`
  );
}

function conversationEmptyText() {
  return `Speak or play the demo to see ${sourceLanguageName()} and ${targetLanguageName()} together.`;
}

function sourceEmptyText() {
  if (!state.showSourceText) {
    return "Source transcript is disabled on this backend. Set SHOW_SOURCE_TEXT=true to show source lines.";
  }

  return `${sourceLanguageName()} transcript will appear here.`;
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

function clearTranscript(options = {}) {
  state.sourceLines = [];
  state.targetLines = [];
  state.conversationLines = [];
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

function formatTimestamp(value) {
  if (!value) {
    return "none yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(seconds) {
  if (!seconds) {
    return "off";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.round(seconds / 60)}m`;
}

function queueSummary(queue) {
  if (!queue) {
    return "";
  }
  const details = [
    `queue ${queue.translation_queue_size ?? 0}/${queue.max_translation_queue_segments ?? "unlimited"}`,
    `dropped ${queue.dropped_translation_segments ?? 0}`,
    `VAD skipped ${queue.vad_rejected_segments ?? 0}`,
    `model skipped ${queue.model_rejected_segments ?? 0}`,
  ];
  if (queue.consecutive_vad_rejects || queue.consecutive_model_rejects) {
    details.push(
      `skip streak VAD ${queue.consecutive_vad_rejects ?? 0} / model ${queue.consecutive_model_rejects ?? 0}`
    );
  }
  if (queue.last_skip_reason) {
    details.push(`last skip: ${queue.last_skip_reason}`);
  }
  return details.join(" · ");
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
  const backendReady = state.backendConnected;
  ui.demoButton.hidden = backendReady;
  ui.demoButton.disabled = state.isDemoPlaying || state.isCapturing;
  ui.resetButton.disabled = state.isCapturing;
  ui.connectButton.disabled = state.isCapturing;
  ui.disconnectButton.disabled = !state.backendConnected && !state.socket;
  ui.refreshUsersButton.disabled = state.backendUser?.role !== "admin";
  ui.startButton.disabled = !state.backendConnected || state.isCapturing;
  ui.stopButton.disabled = !state.isCapturing;
  updateBackendSummaryStatus();
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

function setConnection(text) {
  state.connectionStatus = text;
  updateBackendSummaryStatus();
}

function updateBackendSummaryStatus() {
  if (!ui.backendSummaryStatus) {
    return;
  }

  const label =
    state.backendConnected && state.runtime
      ? `${runtimeSummaryLabel()} · ${state.connectionStatus}`
      : state.connectionStatus;
  ui.backendSummaryLabel.textContent = state.backendConnected ? "Connected" : "Connect";
  ui.backendSummaryStatus.textContent = label;
  ui.backendSummaryStatus.title = label;
  ui.backendSummaryStatus.classList.toggle("online", state.backendConnected);
}

function runtimeSummaryLabel() {
  const model = state.runtime?.model ?? "model";
  const device = state.runtime?.device ?? "auto";
  return `${model} · ${device}`;
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
