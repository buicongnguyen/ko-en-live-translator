from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass
from threading import Lock
from typing import Any

from .auth import AuthenticatedUser
from .config import Settings


class SessionLimitError(Exception):
    pass


@dataclass(slots=True)
class ActiveSession:
    id: str
    email: str
    name: str
    role: str
    provider: str
    connected_at: dt.datetime
    last_audio_at: dt.datetime | None
    source_language: str
    target_language: str

    def public_dict(self) -> dict[str, str | None]:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "provider": self.provider,
            "connected_at": self.connected_at.isoformat(),
            "last_audio_at": self.last_audio_at.isoformat()
            if self.last_audio_at
            else None,
            "source_language": self.source_language,
            "target_language": self.target_language,
        }


class ActiveSessionRegistry:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._sessions: dict[str, ActiveSession] = {}
        self._lock = Lock()

    def acquire(self, user: AuthenticatedUser | None) -> ActiveSession:
        with self._lock:
            max_sessions = self.settings.max_active_sessions
            if max_sessions > 0 and len(self._sessions) >= max_sessions:
                raise SessionLimitError(
                    f"The translator is busy. Maximum active sessions is {max_sessions}."
                )

            now = _utc_now()
            session = ActiveSession(
                id=uuid.uuid4().hex[:12],
                email=user.email if user else "anonymous",
                name=user.name if user else "",
                role=user.role if user else "guest",
                provider=user.provider if user else "none",
                connected_at=now,
                last_audio_at=None,
                source_language=self.settings.source_language,
                target_language=self.settings.target_language,
            )
            self._sessions[session.id] = session
            return session

    def release(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def touch_audio(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.last_audio_at = _utc_now()

    def update_languages(
        self,
        session_id: str,
        source_language: str,
        target_language: str,
    ) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.source_language = source_language
                session.target_language = target_language

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._lock:
            sessions = [session.public_dict() for session in self._sessions.values()]

        sessions.sort(key=lambda item: item["connected_at"] or "")
        return sessions

    def describe(self) -> dict[str, int]:
        with self._lock:
            active = len(self._sessions)
        return {
            "active": active,
            "max_active": self.settings.max_active_sessions,
            "idle_timeout_seconds": self.settings.idle_timeout_seconds,
        }


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC).replace(microsecond=0)
