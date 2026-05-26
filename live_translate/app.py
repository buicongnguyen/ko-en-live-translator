from __future__ import annotations

import asyncio
import json
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
from .session import TranslationSession
from .translator import WhisperTranslator

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
settings = load_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth_manager = AuthManager(settings)
    translator = WhisperTranslator(settings)
    app.state.settings = settings
    app.state.auth_manager = auth_manager
    app.state.translator = translator
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
    return JSONResponse(
        {
            "app": "live-speech-translator",
            "status": "ok",
            "auth": {
                **auth_manager.describe(),
                "user": user.public_dict() if user else None,
            },
            "runtime": translator.describe(),
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

    translator: WhisperTranslator = app.state.translator
    session = TranslationSession(translator, app.state.settings)
    session.start()

    await websocket.send_json(
        {
            "type": "hello",
            "message": "Connected to the live translator.",
            "auth": {
                **auth_manager.describe(),
                "user": user.public_dict() if user else None,
            },
            "runtime": translator.describe(),
        }
    )

    sender_task = asyncio.create_task(_forward_session_events(websocket, session))

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            if message.get("bytes") is not None:
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
                session.set_languages(
                    source_language=payload.get("source_language"),
                    target_language=payload.get("target_language"),
                )
            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        session.stop()
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

    await websocket.send_json(
        {
            "type": "auth",
            "status": "approved",
            "user": user.public_dict() if user else None,
        }
    )
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
