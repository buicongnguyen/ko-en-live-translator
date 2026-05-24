from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Thread

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import Settings, load_settings
from .session import TranslationSession
from .translator import WhisperTranslator

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
settings = load_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    translator = WhisperTranslator(settings)
    app.state.settings = settings
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


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
async def health() -> JSONResponse:
    translator: WhisperTranslator = app.state.translator
    return JSONResponse(
        {
            "app": "live-speech-translator",
            "status": "ok",
            "runtime": translator.describe(),
        }
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    translator: WhisperTranslator = app.state.translator
    session = TranslationSession(translator, app.state.settings)
    session.start()

    await websocket.send_json(
        {
            "type": "hello",
            "message": "Connected to the live translator.",
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

            payload = json.loads(text_message)
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


async def _forward_session_events(websocket: WebSocket, session: TranslationSession) -> None:
    while True:
        event = await asyncio.to_thread(session.result_queue.get)
        if event is None:
            return
        await websocket.send_json(event)
