from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

from .config import Settings


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    email: str
    name: str
    uid: str
    provider: str
    role: str
    status: str

    def public_dict(self) -> dict[str, str]:
        return {
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "status": self.status,
        }


class UserStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._lock = Lock()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    email TEXT PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    uid TEXT NOT NULL DEFAULT '',
                    provider TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'pending',
                    role TEXT NOT NULL DEFAULT 'user',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_seen_at TEXT
                )
                """
            )
            connection.commit()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()

    def bootstrap(self, admin_emails: set[str], approved_emails: set[str]) -> None:
        for email in sorted(admin_emails):
            self.upsert_bootstrap_user(email, role="admin", status="approved")
        for email in sorted(approved_emails - admin_emails):
            self.upsert_bootstrap_user(email, role="user", status="approved")

    def upsert_bootstrap_user(self, email: str, role: str, status: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO users (email, role, status, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET
                    role = excluded.role,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (email, role, status),
            )
            connection.commit()

    def upsert_login_user(
        self,
        *,
        email: str,
        name: str,
        uid: str,
        provider: str,
        default_status: str,
        default_role: str,
    ) -> AuthenticatedUser:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO users (email, name, uid, provider, status, role, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET
                    name = excluded.name,
                    uid = excluded.uid,
                    provider = excluded.provider,
                    last_seen_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (email, name, uid, provider, default_status, default_role),
            )
            connection.commit()
            row = connection.execute(
                "SELECT email, name, uid, provider, role, status FROM users WHERE email = ?",
                (email,),
            ).fetchone()

        return _user_from_row(row)

    def list_users(self) -> list[dict[str, str | None]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT email, name, provider, status, role, created_at, updated_at, last_seen_at
                FROM users
                ORDER BY
                    CASE status
                        WHEN 'pending' THEN 0
                        WHEN 'approved' THEN 1
                        WHEN 'blocked' THEN 2
                        ELSE 3
                    END,
                    updated_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def set_user_status(self, email: str, status: str) -> None:
        normalized_email = normalize_email(email)
        if not normalized_email:
            raise ValueError("Email is required.")
        if status not in {"pending", "approved", "blocked"}:
            raise ValueError("Invalid user status.")

        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO users (email, status, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (normalized_email, status),
            )
            connection.commit()

    def set_user_role(self, email: str, role: str) -> None:
        normalized_email = normalize_email(email)
        if not normalized_email:
            raise ValueError("Email is required.")
        if role not in {"user", "admin"}:
            raise ValueError("Invalid user role.")

        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO users (email, role, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET
                    role = excluded.role,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (normalized_email, role),
            )
            connection.commit()


class AuthManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.enabled = settings.auth_required
        self.admin_emails = parse_email_set(settings.admin_emails)
        self.approved_emails = parse_email_set(settings.approved_emails) | self.admin_emails
        self.store = UserStore(settings.auth_database_path)
        self.store.bootstrap(self.admin_emails, self.approved_emails)
        self._firebase_app: Any | None = None
        self._firebase_auth: Any | None = None

    def describe(self) -> dict[str, Any]:
        return {
            "required": self.enabled,
            "provider": self.settings.auth_provider,
            "admin_configured": bool(self.admin_emails),
            "database": str(self.settings.auth_database_path),
        }

    def authenticate_token(self, token: str | None) -> AuthenticatedUser | None:
        if not self.enabled:
            return None
        if not token:
            raise AuthError("Sign in is required before using this backend.", 401)
        if self.settings.auth_provider != "firebase":
            raise AuthError("Unsupported authentication provider.", 503)

        decoded = self._verify_firebase_token(token)
        email = normalize_email(decoded.get("email", ""))
        if not email:
            raise AuthError("The signed-in account did not provide an email address.", 403)
        if not decoded.get("email_verified", False) and not self.settings.allow_unverified_auth_email:
            raise AuthError("Verify the email address on this account before using the translator.", 403)

        role = "admin" if email in self.admin_emails else "user"
        status = "approved" if email in self.approved_emails else "pending"
        user = self.store.upsert_login_user(
            email=email,
            name=str(decoded.get("name") or decoded.get("firebase", {}).get("sign_in_provider") or ""),
            uid=str(decoded.get("uid") or decoded.get("sub") or ""),
            provider=str(decoded.get("firebase", {}).get("sign_in_provider") or "firebase"),
            default_status=status,
            default_role=role,
        )

        if user.status == "blocked":
            raise AuthError("This account is blocked. Contact the admin if this is a mistake.", 403)
        if user.status != "approved":
            raise AuthError("Access is pending. Contact the admin and ask them to approve your email.", 403)

        return user

    def authenticate_admin(self, token: str | None) -> AuthenticatedUser:
        user = self.authenticate_token(token)
        if user is None:
            raise AuthError("Admin access requires authentication.", 401)
        if user.role != "admin":
            raise AuthError("Admin access is required for this action.", 403)
        return user

    def _verify_firebase_token(self, token: str) -> dict[str, Any]:
        firebase_auth = self._ensure_firebase()
        try:
            return firebase_auth.verify_id_token(token)
        except Exception as exc:  # Firebase raises several provider-specific exceptions.
            raise AuthError(f"Could not verify sign-in token: {exc}", 401) from exc

    def _ensure_firebase(self) -> Any:
        if self._firebase_auth is not None:
            return self._firebase_auth

        try:
            import firebase_admin
            from firebase_admin import auth as firebase_auth
            from firebase_admin import credentials
        except ImportError as exc:
            raise AuthError(
                "AUTH_REQUIRED=true needs firebase-admin. Run: pip install -r requirements.txt",
                503,
            ) from exc

        options = {}
        if self.settings.firebase_project_id:
            options["projectId"] = self.settings.firebase_project_id

        try:
            self._firebase_app = firebase_admin.get_app()
        except ValueError:
            try:
                if self.settings.firebase_credentials_file:
                    credential = credentials.Certificate(str(self.settings.firebase_credentials_file))
                else:
                    credential = credentials.ApplicationDefault()
                self._firebase_app = firebase_admin.initialize_app(credential, options)
            except Exception as exc:
                raise AuthError(f"Could not initialize Firebase Admin credentials: {exc}", 503) from exc
        self._firebase_auth = firebase_auth
        return self._firebase_auth


def parse_email_set(raw: str) -> set[str]:
    return {
        email
        for email in (normalize_email(part) for part in raw.replace(";", ",").split(","))
        if email
    }


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _user_from_row(row: sqlite3.Row | None) -> AuthenticatedUser:
    if row is None:
        raise RuntimeError("User row was not found after update.")
    return AuthenticatedUser(
        email=str(row["email"]),
        name=str(row["name"] or ""),
        uid=str(row["uid"] or ""),
        provider=str(row["provider"] or ""),
        role=str(row["role"] or "user"),
        status=str(row["status"] or "pending"),
    )
