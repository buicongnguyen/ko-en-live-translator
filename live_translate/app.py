from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Thread
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .auth import AuthError, AuthManager
from .config import Settings, load_settings
from .gpu import GpuMonitor
from .languages import normalize_source_language, normalize_target_language
from .session import TranslationSession
from .session_registry import ActiveSessionRegistry, SessionLimitError
from .translator import WhisperTranslator

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
settings = load_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth_manager = AuthManager(settings)
    translator = WhisperTranslator(settings)
    session_registry = ActiveSessionRegistry(settings)
    gpu_monitor = GpuMonitor(settings)
    app.state.settings = settings
    app.state.auth_manager = auth_manager
    app.state.translator = translator
    app.state.session_registry = session_registry
    app.state.gpu_monitor = gpu_monitor
    app.state.translation_sessions = {}
    Thread(target=translator.ensure_model, daemon=True).start()
    yield


app = FastAPI(
    title="Live Speech Translator",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class UserStatusUpdate(BaseModel):
    email: str


def _token_from_request(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        return token.strip()
    return None


def _auth_error_response(error: AuthError) -> JSONResponse:
    return JSONResponse(
        {
            "detail": error.message,
            "auth": {
                "required": settings.auth_required,
                "provider": settings.auth_provider,
            },
        },
        status_code=error.status_code,
    )


def _authenticate_request(request: Request) -> Any | None:
    auth_manager: AuthManager = request.app.state.auth_manager
    try:
        return auth_manager.authenticate_token(_token_from_request(request))
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


def _authenticate_admin_request(request: Request) -> Any:
    auth_manager: AuthManager = request.app.state.auth_manager
    try:
        return auth_manager.authenticate_admin(_token_from_request(request))
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
async def health(request: Request) -> JSONResponse:
    auth_manager: AuthManager = request.app.state.auth_manager
    try:
        user = auth_manager.authenticate_token(_token_from_request(request))
    except AuthError as exc:
        return _auth_error_response(exc)

    translator: WhisperTranslator = app.state.translator
    session_registry: ActiveSessionRegistry = app.state.session_registry
    gpu_monitor: GpuMonitor = app.state.gpu_monitor
    return JSONResponse(
        {
            "app": "live-speech-translator",
            "status": "ok",
            "auth": {
                **auth_manager.describe(),
                "user": user.public_dict() if user else None,
            },
            "runtime": translator.describe(),
            "sessions": session_registry.describe(),
            "gpu": gpu_monitor.snapshot().public_dict(),
        }
    )


@app.get("/api/auth/me")
async def auth_me(request: Request) -> JSONResponse:
    auth_manager: AuthManager = request.app.state.auth_manager
    user = _authenticate_request(request)
    return JSONResponse(
        {
            "auth": {
                **auth_manager.describe(),
                "user": user.public_dict() if user else None,
            }
        }
    )


@app.get("/api/admin/users")
async def admin_users(request: Request) -> JSONResponse:
    _authenticate_admin_request(request)
    auth_manager: AuthManager = request.app.state.auth_manager
    return JSONResponse({"users": auth_manager.store.list_users()})


@app.get("/api/admin/sessions")
async def admin_sessions(request: Request) -> JSONResponse:
    _authenticate_admin_request(request)
    session_registry: ActiveSessionRegistry = request.app.state.session_registry
    gpu_monitor: GpuMonitor = request.app.state.gpu_monitor
    translation_sessions: dict[str, TranslationSession] = request.app.state.translation_sessions
    sessions = session_registry.list_sessions()
    for session_data in sessions:
        session = translation_sessions.get(str(session_data["id"]))
        if session:
            session_data["queue"] = session.stats()

    return JSONResponse(
        {
            "summary": session_registry.describe(),
            "sessions": sessions,
            "gpu": gpu_monitor.snapshot().public_dict(),
        }
    )


@app.post("/api/admin/users/approve")
async def approve_user(update: UserStatusUpdate, request: Request) -> JSONResponse:
    _authenticate_admin_request(request)
    auth_manager: AuthManager = request.app.state.auth_manager
    _set_user_status_or_400(auth_manager, update.email, "approved")
    return JSONResponse({"status": "approved", "email": update.email.strip().lower()})


@app.post("/api/admin/users/block")
async def block_user(update: UserStatusUpdate, request: Request) -> JSONResponse:
    _authenticate_admin_request(request)
    auth_manager: AuthManager = request.app.state.auth_manager
    _set_user_status_or_400(auth_manager, update.email, "blocked")
    return JSONResponse({"status": "blocked", "email": update.email.strip().lower()})


@app.post("/api/admin/users/pending")
async def mark_user_pending(update: UserStatusUpdate, request: Request) -> JSONResponse:
    _authenticate_admin_request(request)
    auth_manager: AuthManager = request.app.state.auth_manager
    _set_user_status_or_400(auth_manager, update.email, "pending")
    return JSONResponse({"status": "pending", "email": update.email.strip().lower()})


def _set_user_status_or_400(auth_manager: AuthManager, email: str, status: str) -> None:
    try:
        auth_manager.store.set_user_status(email, status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    auth_manager: AuthManager = app.state.auth_manager
    user = await _authenticate_websocket(websocket, auth_manager)
    if user is _AUTH_FAILED:
        return

    session_registry: ActiveSessionRegistry = app.state.session_registry
    gpu_monitor: GpuMonitor = app.state.gpu_monitor
    gpu_status = gpu_monitor.snapshot()
    if not gpu_status.safe:
        await websocket.send_json(
            {
                "type": "error",
                "message": (
                    f"{gpu_status.message} New translation sessions are paused "
                    "until the GPU cools down."
                ),
                "gpu": gpu_status.public_dict(),
            }
        )
        await websocket.close(code=1013)
        return

    try:
        session_record = session_registry.acquire(user)
    except SessionLimitError as exc:
        await websocket.send_json(
            {
                "type": "error",
                "message": str(exc),
                "sessions": session_registry.describe(),
            }
        )
        await websocket.close(code=1013)
        return

    translator: WhisperTranslator = app.state.translator
    session = TranslationSession(translator, app.state.settings)
    app.state.translation_sessions[session_record.id] = session
    session.start()

    await websocket.send_json(
        {
            "type": "hello",
            "message": "Connected to the live translator.",
            "session": session_record.public_dict(),
            "auth": {
                **auth_manager.describe(),
                "user": user.public_dict() if user else None,
            },
            "runtime": translator.describe(),
            "sessions": session_registry.describe(),
            "gpu": gpu_status.public_dict(),
        }
    )

    sender_task = asyncio.create_task(_forward_session_events(websocket, session))
    last_audio_at = time.monotonic()

    try:
        while True:
            idle_timeout = app.state.settings.idle_timeout_seconds
            if idle_timeout > 0:
                remaining_idle = max(0.1, idle_timeout - (time.monotonic() - last_audio_at))
                try:
                    message = await asyncio.wait_for(
                        websocket.receive(),
                        timeout=remaining_idle,
                    )
                except asyncio.TimeoutError:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": (
                                "No microphone audio was received for "
                                f"{idle_timeout} seconds, so this session was closed."
                            ),
                        }
                    )
                    await websocket.close(code=1001)
                    break
            else:
                message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if message.get("bytes") is not None:
                last_audio_at = time.monotonic()
                session_registry.touch_audio(session_record.id)
                session.push_audio(message["bytes"])
                continue

            text_message = message.get("text")
            if not text_message:
                continue

            try:
                payload = json.loads(text_message)
            except json.JSONDecodeError:
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "Invalid control message. Expected JSON.",
                    }
                )
                continue

            if not isinstance(payload, dict):
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "Invalid control message. Expected a JSON object.",
                    }
                )
                continue

            message_type = payload.get("type")
            if message_type == "flush":
                session.flush()
            elif message_type == "set_language":
                source_language = normalize_source_language(
                    payload.get("source_language"),
                    app.state.settings.source_language,
                )
                target_language = normalize_target_language(
                    payload.get("target_language"),
                    app.state.settings.target_language,
                )
                session_registry.update_languages(
                    session_record.id,
                    source_language,
                    target_language,
                )
                session.set_languages(
                    source_language=source_language,
                    target_language=target_language,
                )
            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        session.stop()
        app.state.translation_sessions.pop(session_record.id, None)
        session_registry.release(session_record.id)
        await sender_task


_AUTH_FAILED = object()


async def _authenticate_websocket(
    websocket: WebSocket,
    auth_manager: AuthManager,
) -> Any | object | None:
    if not auth_manager.enabled:
        return None

    try:
        message = await asyncio.wait_for(websocket.receive_text(), timeout=10)
        payload = json.loads(message)
        if not isinstance(payload, dict) or payload.get("type") != "auth":
            raise AuthError("Authentication must be the first WebSocket message.", 401)
        user = auth_manager.authenticate_token(payload.get("token"))
    except (asyncio.TimeoutError, json.JSONDecodeError) as exc:
        await websocket.send_json(
            {
                "type": "error",
                "message": "Authentication timed out or was not valid JSON.",
            }
        )
        await websocket.close(code=1008)
        return _AUTH_FAILED
    except AuthError as exc:
        await websocket.send_json({"type": "error", "message": exc.message})
        await websocket.close(code=1008)
        return _AUTH_FAILED

    return user


async def _forward_session_events(websocket: WebSocket, session: TranslationSession) -> None:
    while True:
        event = await asyncio.to_thread(session.result_queue.get)
        if event is None:
            return
        try:
            await websocket.send_json(event)
        except (RuntimeError, WebSocketDisconnect):
            return
