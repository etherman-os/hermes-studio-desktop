"""Studio-owned persistent artifact repository.

Artifacts are metadata and small text outputs stored in Studio-owned studio.db.
This module never reads or writes Hermes Agent state.db and never executes
artifact content.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from hermes_adapter.studio_storage import StudioStorage, StudioStorageError

_ARTIFACT_TYPES = {
    "markdown",
    "text",
    "log_snapshot",
    "test_result",
    "report",
    "html",
    "screenshot",
    "file_reference",
    "json",
    "unknown",
}
_MAX_CONTENT_CHARS = 200_000
_MAX_TITLE_CHARS = 200
_MAX_DESCRIPTION_CHARS = 5000
_MAX_PATH_CHARS = 2000
_MAX_MIME_CHARS = 128
_MAX_REVISION_VERSION = 100_000
_MAX_VARIANTS_PER_GROUP = 12
_MAX_VARIANT_LABEL_CHARS = 40
_MAX_VARIANT_RATIONALE_CHARS = 5000
_VARIANT_GROUP_STATUSES = {"draft", "ready", "applied", "archived"}
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_SECRET_KEY_RE = re.compile(r"(?i)(api[_-]?key|token|secret|password|auth|bearer)")
_SECRET_VALUE_PATTERNS = (
    re.compile(r"Bearer\s+[A-Za-z0-9._:-]+", re.IGNORECASE),
    re.compile(r"(?i)\b(sk-|xai-|tvly-)[a-zA-Z0-9._-]+"),
    re.compile(r"(?i)\b(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^'\"\\s]+"),
    re.compile(r"\b[a-f0-9]{32,}\b", re.IGNORECASE),
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _redact_text(value: str) -> str:
    redacted = value
    for pattern in _SECRET_VALUE_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


def _clean_text(value: Any, field: str, *, max_length: int, required: bool = False) -> str:
    if value is None:
        if required:
            raise ValueError(f"{field} is required")
        return ""
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    cleaned = _CONTROL_RE.sub("", value).strip()
    if required and not cleaned:
        raise ValueError(f"{field} is required")
    if len(cleaned) > max_length:
        raise ValueError(f"{field} must be {max_length} characters or less")
    return _redact_text(cleaned)


def _clean_optional_text(value: Any, field: str, *, max_length: int) -> str | None:
    cleaned = _clean_text(value, field, max_length=max_length)
    return cleaned if cleaned else None


def _clean_content(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("content_text must be a string")
    cleaned = _CONTROL_RE.sub("", value)
    if len(cleaned) > _MAX_CONTENT_CHARS:
        raise ValueError(f"content_text must be {_MAX_CONTENT_CHARS} characters or less")
    return _redact_text(cleaned)


def _clean_optional_id(value: Any, field: str) -> str | None:
    if value is None or value == "":
        return None
    text = _clean_text(value, field, max_length=128, required=True)
    if not _ID_RE.match(text):
        raise ValueError(f"{field} has invalid characters")
    return text


def _clean_artifact_type(value: Any) -> str:
    artifact_type = _clean_text(value or "unknown", "type", max_length=64) or "unknown"
    return artifact_type if artifact_type in _ARTIFACT_TYPES else "unknown"


def _clean_source(value: Any) -> str:
    source = _clean_text(value or "manual", "source", max_length=64) or "manual"
    if _SECRET_KEY_RE.search(source):
        raise StudioStorageError("artifact source refuses secret-like values")
    return source


def _clean_size_bytes(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("size_bytes must be an integer")
    if value < 0:
        raise ValueError("size_bytes must be non-negative")
    return int(value)


def _clean_revision_version(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("version must be an integer")
    if value < 1 or value > _MAX_REVISION_VERSION:
        raise ValueError(f"version must be between 1 and {_MAX_REVISION_VERSION}")
    return int(value)


def _clean_variant_status(value: Any) -> str:
    status = _clean_text(value or "draft", "status", max_length=32) or "draft"
    if status not in _VARIANT_GROUP_STATUSES:
        raise ValueError("status must be draft, ready, applied, or archived")
    return status


def _clean_variant_score(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("score must be an integer")
    if value < 0 or value > 100:
        raise ValueError("score must be between 0 and 100")
    return int(value)


def _display_path(path: str | None) -> str | None:
    if not path:
        return None
    return Path(path).name or path


def _clean_payload_value(value: Any, field: str) -> Any:
    if isinstance(value, str):
        return _clean_text(value, field, max_length=1000)
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_clean_payload_value(item, field) for item in value]
    if isinstance(value, dict):
        return _validate_payload(value)
    raise ValueError("payload values must be JSON-serializable")


def _validate_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in payload.items():
        clean_key = _clean_text(key, "payload key", max_length=64, required=True)
        if _SECRET_KEY_RE.search(clean_key):
            raise StudioStorageError("artifact event refuses secret-like fields")
        result[clean_key] = _clean_payload_value(value, clean_key)
    return result


class ArtifactRepository:
    """Persistent artifact operations backed by StudioStorage."""

    def __init__(self, storage: StudioStorage | None = None) -> None:
        self._storage = storage or StudioStorage()

    def list_artifacts(
        self,
        *,
        artifact_type: str | None = None,
        source: str | None = None,
        run_id: str | None = None,
        session_id: str | None = None,
        card_id: str | None = None,
        search: str | None = None,
        include_archived: bool = False,
        limit: int = 100,
    ) -> dict[str, Any]:
        filters: list[str] = []
        params: list[Any] = []
        if not include_archived:
            filters.append("archived_at IS NULL")
        if artifact_type:
            filters.append("type = ?")
            params.append(_clean_artifact_type(artifact_type))
        if source:
            filters.append("source = ?")
            params.append(_clean_source(source))
        if run_id:
            filters.append("run_id = ?")
            params.append(_clean_optional_id(run_id, "run_id"))
        if session_id:
            filters.append("session_id = ?")
            params.append(_clean_optional_id(session_id, "session_id"))
        if card_id:
            filters.append("kanban_card_id = ?")
            params.append(_clean_optional_id(card_id, "kanban_card_id"))
        if search:
            cleaned_search = _clean_text(search, "search", max_length=200)
            if cleaned_search:
                filters.append("(title LIKE ? OR COALESCE(description, '') LIKE ?)")
                pattern = f"%{cleaned_search}%"
                params.extend([pattern, pattern])

        safe_limit = min(max(limit, 1), 250)
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        with self._storage.connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM artifacts
                {where}
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,  # noqa: S608
                (*params, safe_limit),
            ).fetchall()
            return {
                "artifacts": [self._artifact_dict(row, include_content=False) for row in rows],
                "total": len(rows),
            }

    def get_artifact(self, artifact_id: str) -> dict[str, Any]:
        with self._storage.connect() as conn:
            return self._artifact_detail(conn, artifact_id, include_archived=True)

    def create_artifact(self, input_data: Mapping[str, Any]) -> dict[str, Any]:
        title = _clean_text(input_data.get("title"), "title", max_length=_MAX_TITLE_CHARS, required=True)
        artifact_type = _clean_artifact_type(input_data.get("type"))
        description = _clean_optional_text(input_data.get("description"), "description", max_length=_MAX_DESCRIPTION_CHARS)
        content_text = _clean_content(input_data.get("content_text"))
        file_path = _clean_optional_text(input_data.get("file_path"), "file_path", max_length=_MAX_PATH_CHARS)
        mime_type = _clean_optional_text(input_data.get("mime_type"), "mime_type", max_length=_MAX_MIME_CHARS)
        size_bytes = _clean_size_bytes(input_data.get("size_bytes"))
        run_id = _clean_optional_id(input_data.get("run_id"), "run_id")
        session_id = _clean_optional_id(input_data.get("session_id"), "session_id")
        card_id = _clean_optional_id(input_data.get("kanban_card_id"), "kanban_card_id")
        source = _clean_source(input_data.get("source"))
        if artifact_type == "file_reference" and not file_path:
            raise ValueError("file_path is required for file_reference artifacts")
        artifact_id = _new_id("artifact")
        now = _now_iso()
        with self._storage.connect() as conn:
            conn.execute(
                """
                INSERT INTO artifacts (
                  id, title, type, description, content_text, file_path, mime_type, size_bytes,
                  run_id, session_id, kanban_card_id, source, created_at, updated_at, archived_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    artifact_id,
                    title,
                    artifact_type,
                    description,
                    content_text,
                    file_path,
                    mime_type,
                    size_bytes,
                    run_id,
                    session_id,
                    card_id,
                    source,
                    now,
                    now,
                ),
            )
            self._add_artifact_event(conn, artifact_id, "artifact.created", {"title": title, "type": artifact_type})
            artifact = self._require_artifact(conn, artifact_id, include_content=True)
            self._add_artifact_revision(conn, artifact, "artifact.created")
            return self._artifact_detail(conn, artifact_id)

    def update_artifact(self, artifact_id: str, input_data: Mapping[str, Any]) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        updates: dict[str, Any] = {}
        if "title" in input_data:
            updates["title"] = _clean_text(input_data["title"], "title", max_length=_MAX_TITLE_CHARS, required=True)
        if "type" in input_data:
            updates["type"] = _clean_artifact_type(input_data["type"])
        if "description" in input_data:
            updates["description"] = _clean_optional_text(input_data["description"], "description", max_length=_MAX_DESCRIPTION_CHARS)
        if "content_text" in input_data:
            updates["content_text"] = _clean_content(input_data["content_text"])
        if "file_path" in input_data:
            updates["file_path"] = _clean_optional_text(input_data["file_path"], "file_path", max_length=_MAX_PATH_CHARS)
        if "mime_type" in input_data:
            updates["mime_type"] = _clean_optional_text(input_data["mime_type"], "mime_type", max_length=_MAX_MIME_CHARS)
        if "size_bytes" in input_data:
            updates["size_bytes"] = _clean_size_bytes(input_data["size_bytes"])
        if "source" in input_data:
            updates["source"] = _clean_source(input_data["source"])
        with self._storage.connect() as conn:
            self._require_artifact(conn, clean_artifact_id)
            if updates:
                now = _now_iso()
                assignments = ", ".join(f"{key} = ?" for key in updates)
                conn.execute(
                    f"UPDATE artifacts SET {assignments}, updated_at = ? WHERE id = ?",  # noqa: S608
                    (*updates.values(), now, clean_artifact_id),
                )
                updated = self._require_artifact(conn, clean_artifact_id, include_content=True)
                revision = self._add_artifact_revision(conn, updated, "artifact.updated")
                self._add_artifact_event(
                    conn,
                    clean_artifact_id,
                    "artifact.updated",
                    {"fields": sorted(updates), "version": revision["version"]},
                )
            return self._artifact_detail(conn, clean_artifact_id)

    def list_revisions(self, artifact_id: str, *, include_content: bool = False) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        with self._storage.connect() as conn:
            self._require_artifact(conn, clean_artifact_id, include_archived=True)
            revisions = self._list_revision_rows(conn, clean_artifact_id, include_content=include_content)
            return {"artifact_id": clean_artifact_id, "revisions": revisions, "total": len(revisions)}

    def revert_artifact(self, artifact_id: str, version: int) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        clean_version = _clean_revision_version(version)
        with self._storage.connect() as conn:
            self._require_artifact(conn, clean_artifact_id)
            revision = self._require_revision(conn, clean_artifact_id, clean_version, include_content=True)
            now = _now_iso()
            conn.execute(
                """
                UPDATE artifacts
                SET title = ?, type = ?, description = ?, content_text = ?, file_path = ?,
                    mime_type = ?, size_bytes = ?, source = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    revision["title"],
                    revision["type"],
                    revision["description"],
                    revision.get("content_text"),
                    revision["file_path"],
                    revision["mime_type"],
                    revision["size_bytes"],
                    revision["source"],
                    now,
                    clean_artifact_id,
                ),
            )
            updated = self._require_artifact(conn, clean_artifact_id, include_content=True)
            new_revision = self._add_artifact_revision(conn, updated, "artifact.reverted")
            self._add_artifact_event(
                conn,
                clean_artifact_id,
                "artifact.reverted",
                {"from_version": clean_version, "version": new_revision["version"]},
            )
            return self._artifact_detail(conn, clean_artifact_id)

    def list_variant_groups(self, artifact_id: str) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        with self._storage.connect() as conn:
            self._require_artifact(conn, clean_artifact_id, include_archived=True)
            groups = self._list_variant_groups_for_artifact(conn, clean_artifact_id, include_content=True)
            return {"artifact_id": clean_artifact_id, "groups": groups, "total": len(groups)}

    def create_variant_group(self, artifact_id: str, input_data: Mapping[str, Any]) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        with self._storage.connect() as conn:
            source = self._require_artifact(conn, clean_artifact_id, include_content=True)
            default_title = f"Variant study - {source['title']}"[:_MAX_TITLE_CHARS]
            title = _clean_text(input_data.get("title") or default_title, "title", max_length=_MAX_TITLE_CHARS, required=True)
            brief = _clean_optional_text(input_data.get("brief"), "brief", max_length=_MAX_DESCRIPTION_CHARS)
            status = _clean_variant_status(input_data.get("status") or "draft")
            variants_input = input_data.get("variants") or []
            if not isinstance(variants_input, list):
                raise ValueError("variants must be a list")
            if len(variants_input) + 1 > _MAX_VARIANTS_PER_GROUP:
                raise ValueError(f"variant groups support at most {_MAX_VARIANTS_PER_GROUP} variants")
            if variants_input and status == "draft":
                status = "ready"

            group_id = _new_id("artifact_variant_group")
            now = _now_iso()
            conn.execute(
                """
                INSERT INTO artifact_variant_groups (
                  id, source_artifact_id, title, brief, status, winner_variant_id, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
                """,
                (group_id, clean_artifact_id, title, brief, status, now, now),
            )
            self._insert_variant(
                conn,
                group_id,
                {
                    "label": "Source",
                    "title": source["title"],
                    "content_text": source.get("content_text"),
                    "file_path": source.get("file_path"),
                    "mime_type": source.get("mime_type"),
                    "size_bytes": source.get("size_bytes"),
                    "rationale": "Baseline snapshot of the source artifact before A/B work.",
                },
                index=0,
            )
            for index, variant_input in enumerate(variants_input, start=1):
                if not isinstance(variant_input, Mapping):
                    raise ValueError("variants must contain objects")
                self._insert_variant(conn, group_id, variant_input, index=index)
            self._add_artifact_event(
                conn,
                clean_artifact_id,
                "artifact.variant_group_created",
                {"group_id": group_id, "variants": len(variants_input) + 1},
            )
            return self._require_variant_group(conn, group_id, include_content=True)

    def add_variant(self, group_id: str, input_data: Mapping[str, Any]) -> dict[str, Any]:
        clean_group_id = self._clean_artifact_id(group_id)
        with self._storage.connect() as conn:
            group = self._require_variant_group(conn, clean_group_id, include_content=False)
            count = conn.execute(
                "SELECT COUNT(*) AS count FROM artifact_variants WHERE group_id = ?",
                (clean_group_id,),
            ).fetchone()
            variant_count = int(count["count"] if count else 0)
            if variant_count >= _MAX_VARIANTS_PER_GROUP:
                raise ValueError(f"variant groups support at most {_MAX_VARIANTS_PER_GROUP} variants")
            variant = self._insert_variant(conn, clean_group_id, input_data, index=variant_count)
            now = _now_iso()
            conn.execute(
                "UPDATE artifact_variant_groups SET status = ?, updated_at = ? WHERE id = ?",
                ("ready", now, clean_group_id),
            )
            self._add_artifact_event(
                conn,
                group["source_artifact_id"],
                "artifact.variant_created",
                {"group_id": clean_group_id, "variant_id": variant["id"], "label": variant["label"]},
            )
            return self._require_variant_group(conn, clean_group_id, include_content=True)

    def apply_variant(self, group_id: str, variant_id: str) -> dict[str, Any]:
        clean_group_id = self._clean_artifact_id(group_id)
        clean_variant_id = self._clean_artifact_id(variant_id)
        with self._storage.connect() as conn:
            group = self._require_variant_group(conn, clean_group_id, include_content=False)
            source = self._require_artifact(conn, group["source_artifact_id"], include_content=True)
            variant = self._require_variant(conn, clean_group_id, clean_variant_id, include_content=True)
            if not variant.get("content_text") and not variant.get("file_path"):
                raise ValueError("variant must include content_text or file_path before it can be applied")
            now = _now_iso()
            conn.execute(
                """
                UPDATE artifacts
                SET content_text = ?, file_path = ?, mime_type = ?, size_bytes = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    variant.get("content_text"),
                    variant.get("file_path"),
                    variant.get("mime_type"),
                    variant.get("size_bytes"),
                    now,
                    source["id"],
                ),
            )
            updated = self._require_artifact(conn, source["id"], include_content=True)
            revision = self._add_artifact_revision(conn, updated, "artifact.variant_applied")
            conn.execute(
                """
                UPDATE artifact_variant_groups
                SET status = ?, winner_variant_id = ?, updated_at = ?
                WHERE id = ?
                """,
                ("applied", clean_variant_id, now, clean_group_id),
            )
            self._add_artifact_event(
                conn,
                source["id"],
                "artifact.variant_applied",
                {
                    "group_id": clean_group_id,
                    "variant_id": clean_variant_id,
                    "variant_label": variant["label"],
                    "version": revision["version"],
                },
            )
            return self._artifact_detail(conn, source["id"])

    def archive_artifact(self, artifact_id: str) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        with self._storage.connect() as conn:
            artifact = self._require_artifact(conn, clean_artifact_id, include_archived=True)
            if not artifact.get("archived_at"):
                archived_at = _now_iso()
                conn.execute(
                    "UPDATE artifacts SET archived_at = ?, updated_at = ? WHERE id = ?",
                    (archived_at, archived_at, clean_artifact_id),
                )
                self._add_artifact_event(conn, clean_artifact_id, "artifact.archived", {})
            return self._require_artifact(conn, clean_artifact_id, include_archived=True, include_content=True)

    def link_artifact_to_run(self, artifact_id: str, run_id: str) -> dict[str, Any]:
        return self._link_artifact(artifact_id, "run_id", run_id, "artifact.linked_run")

    def link_artifact_to_session(self, artifact_id: str, session_id: str) -> dict[str, Any]:
        return self._link_artifact(artifact_id, "session_id", session_id, "artifact.linked_session")

    def link_artifact_to_card(self, artifact_id: str, card_id: str) -> dict[str, Any]:
        return self._link_artifact(artifact_id, "kanban_card_id", card_id, "artifact.linked_card")

    def _link_artifact(self, artifact_id: str, field: str, value: str, event_type: str) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        clean_value = _clean_optional_id(value, field)
        if not clean_value:
            raise ValueError(f"{field} is required")
        with self._storage.connect() as conn:
            self._require_artifact(conn, clean_artifact_id)
            conn.execute(
                f"UPDATE artifacts SET {field} = ?, updated_at = ? WHERE id = ?",  # noqa: S608
                (clean_value, _now_iso(), clean_artifact_id),
            )
            self._add_artifact_event(conn, clean_artifact_id, event_type, {field: clean_value})
            return self._require_artifact(conn, clean_artifact_id, include_content=True)

    def _artifact_detail(
        self,
        conn: sqlite3.Connection,
        artifact_id: str,
        *,
        include_archived: bool = False,
    ) -> dict[str, Any]:
        artifact = self._require_artifact(
            conn,
            artifact_id,
            include_archived=include_archived,
            include_content=True,
        )
        events = conn.execute(
            "SELECT * FROM artifact_events WHERE artifact_id = ? ORDER BY created_at, id",
            (artifact["id"],),
        ).fetchall()
        artifact["events"] = [self._event_dict(row) for row in events]
        artifact["revisions"] = self._list_revision_rows(conn, artifact["id"], include_content=False)
        artifact["variant_groups"] = self._list_variant_groups_for_artifact(
            conn,
            artifact["id"],
            include_content=True,
        )
        return artifact

    @staticmethod
    def _artifact_dict(row: sqlite3.Row, *, include_content: bool) -> dict[str, Any]:
        artifact = {
            "id": row["id"],
            "title": row["title"],
            "type": row["type"],
            "description": row["description"],
            "file_path": row["file_path"],
            "file_name": _display_path(row["file_path"]),
            "mime_type": row["mime_type"],
            "size_bytes": row["size_bytes"],
            "run_id": row["run_id"],
            "session_id": row["session_id"],
            "kanban_card_id": row["kanban_card_id"],
            "source": row["source"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "archived_at": row["archived_at"],
            "has_content": bool(row["content_text"]),
        }
        if include_content:
            artifact["content_text"] = row["content_text"]
        return artifact

    @staticmethod
    def _event_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "artifact_id": row["artifact_id"],
            "type": row["type"],
            "payload": json.loads(row["payload_json"]),
            "created_at": row["created_at"],
        }

    @staticmethod
    def _revision_dict(row: sqlite3.Row, *, include_content: bool) -> dict[str, Any]:
        revision = {
            "id": row["id"],
            "artifact_id": row["artifact_id"],
            "version": row["version"],
            "title": row["title"],
            "type": row["type"],
            "description": row["description"],
            "file_path": row["file_path"],
            "file_name": _display_path(row["file_path"]),
            "mime_type": row["mime_type"],
            "size_bytes": row["size_bytes"],
            "source": row["source"],
            "event_type": row["event_type"],
            "created_at": row["created_at"],
            "has_content": bool(row["content_text"]),
        }
        if include_content:
            revision["content_text"] = row["content_text"]
        return revision

    @staticmethod
    def _variant_dict(row: sqlite3.Row, *, include_content: bool) -> dict[str, Any]:
        variant = {
            "id": row["id"],
            "group_id": row["group_id"],
            "label": row["label"],
            "title": row["title"],
            "file_path": row["file_path"],
            "file_name": _display_path(row["file_path"]),
            "mime_type": row["mime_type"],
            "size_bytes": row["size_bytes"],
            "rationale": row["rationale"],
            "score": row["score"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "has_content": bool(row["content_text"]),
        }
        if include_content:
            variant["content_text"] = row["content_text"]
        return variant

    def _variant_group_dict(
        self,
        conn: sqlite3.Connection,
        row: sqlite3.Row,
        *,
        include_content: bool,
    ) -> dict[str, Any]:
        group = {
            "id": row["id"],
            "source_artifact_id": row["source_artifact_id"],
            "title": row["title"],
            "brief": row["brief"],
            "status": row["status"],
            "winner_variant_id": row["winner_variant_id"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "variants": self._list_variants_for_group(conn, row["id"], include_content=include_content),
        }
        return group

    def _list_revision_rows(
        self,
        conn: sqlite3.Connection,
        artifact_id: str,
        *,
        include_content: bool,
    ) -> list[dict[str, Any]]:
        rows = conn.execute(
            "SELECT * FROM artifact_revisions WHERE artifact_id = ? ORDER BY version DESC",
            (artifact_id,),
        ).fetchall()
        return [self._revision_dict(row, include_content=include_content) for row in rows]

    def _list_variant_groups_for_artifact(
        self,
        conn: sqlite3.Connection,
        artifact_id: str,
        *,
        include_content: bool,
    ) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT * FROM artifact_variant_groups
            WHERE source_artifact_id = ?
            ORDER BY updated_at DESC, created_at DESC, id DESC
            """,
            (artifact_id,),
        ).fetchall()
        return [self._variant_group_dict(conn, row, include_content=include_content) for row in rows]

    def _list_variants_for_group(
        self,
        conn: sqlite3.Connection,
        group_id: str,
        *,
        include_content: bool,
    ) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT * FROM artifact_variants
            WHERE group_id = ?
            ORDER BY created_at, id
            """,
            (group_id,),
        ).fetchall()
        return [self._variant_dict(row, include_content=include_content) for row in rows]

    def _require_artifact(
        self,
        conn: sqlite3.Connection,
        artifact_id: str,
        *,
        include_archived: bool = False,
        include_content: bool = False,
    ) -> dict[str, Any]:
        clean_artifact_id = self._clean_artifact_id(artifact_id)
        sql = "SELECT * FROM artifacts WHERE id = ?"
        if not include_archived:
            sql += " AND archived_at IS NULL"
        row = conn.execute(sql, (clean_artifact_id,)).fetchone()
        if not row:
            raise ValueError(f"Artifact '{artifact_id}' not found")
        return self._artifact_dict(row, include_content=include_content)

    def _require_revision(
        self,
        conn: sqlite3.Connection,
        artifact_id: str,
        version: int,
        *,
        include_content: bool,
    ) -> dict[str, Any]:
        row = conn.execute(
            "SELECT * FROM artifact_revisions WHERE artifact_id = ? AND version = ?",
            (artifact_id, version),
        ).fetchone()
        if not row:
            raise ValueError(f"Artifact revision '{version}' not found")
        return self._revision_dict(row, include_content=include_content)

    def _require_variant_group(
        self,
        conn: sqlite3.Connection,
        group_id: str,
        *,
        include_content: bool,
    ) -> dict[str, Any]:
        clean_group_id = self._clean_artifact_id(group_id)
        row = conn.execute("SELECT * FROM artifact_variant_groups WHERE id = ?", (clean_group_id,)).fetchone()
        if not row:
            raise ValueError(f"Artifact variant group '{group_id}' not found")
        return self._variant_group_dict(conn, row, include_content=include_content)

    def _require_variant(
        self,
        conn: sqlite3.Connection,
        group_id: str,
        variant_id: str,
        *,
        include_content: bool,
    ) -> dict[str, Any]:
        row = conn.execute(
            "SELECT * FROM artifact_variants WHERE group_id = ? AND id = ?",
            (group_id, variant_id),
        ).fetchone()
        if not row:
            raise ValueError(f"Artifact variant '{variant_id}' not found")
        return self._variant_dict(row, include_content=include_content)

    def _insert_variant(
        self,
        conn: sqlite3.Connection,
        group_id: str,
        input_data: Mapping[str, Any],
        *,
        index: int,
    ) -> dict[str, Any]:
        label_default = "Source" if index == 0 else chr(ord("A") + max(index - 1, 0))
        label = _clean_text(input_data.get("label") or label_default, "label", max_length=_MAX_VARIANT_LABEL_CHARS, required=True)
        title = _clean_text(input_data.get("title") or label, "title", max_length=_MAX_TITLE_CHARS, required=True)
        content_text = _clean_content(input_data.get("content_text"))
        file_path = _clean_optional_text(input_data.get("file_path"), "file_path", max_length=_MAX_PATH_CHARS)
        mime_type = _clean_optional_text(input_data.get("mime_type"), "mime_type", max_length=_MAX_MIME_CHARS)
        size_bytes = _clean_size_bytes(input_data.get("size_bytes"))
        rationale = _clean_optional_text(input_data.get("rationale"), "rationale", max_length=_MAX_VARIANT_RATIONALE_CHARS)
        score = _clean_variant_score(input_data.get("score"))
        variant_id = _new_id("artifact_variant")
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO artifact_variants (
              id, group_id, label, title, content_text, file_path, mime_type,
              size_bytes, rationale, score, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                variant_id,
                group_id,
                label,
                title,
                content_text,
                file_path,
                mime_type,
                size_bytes,
                rationale,
                score,
                now,
                now,
            ),
        )
        return self._require_variant(conn, group_id, variant_id, include_content=True)

    def _add_artifact_revision(
        self,
        conn: sqlite3.Connection,
        artifact: Mapping[str, Any],
        event_type: str,
    ) -> dict[str, Any]:
        artifact_id = self._clean_artifact_id(str(artifact.get("id") or ""))
        row = conn.execute(
            "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM artifact_revisions WHERE artifact_id = ?",
            (artifact_id,),
        ).fetchone()
        version = int(row["next_version"] if row else 1)
        revision_id = _new_id("artifact_rev")
        created_at = _now_iso()
        conn.execute(
            """
            INSERT INTO artifact_revisions (
              id, artifact_id, version, title, type, description, content_text, file_path,
              mime_type, size_bytes, source, event_type, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                revision_id,
                artifact_id,
                version,
                artifact["title"],
                artifact["type"],
                artifact.get("description"),
                artifact.get("content_text"),
                artifact.get("file_path"),
                artifact.get("mime_type"),
                artifact.get("size_bytes"),
                artifact["source"],
                event_type,
                created_at,
            ),
        )
        return self._require_revision(conn, artifact_id, version, include_content=False)

    def _add_artifact_event(
        self,
        conn: sqlite3.Connection,
        artifact_id: str,
        event_type: str,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        clean_payload = _validate_payload(payload)
        event_id = _new_id("artifact_evt")
        created_at = _now_iso()
        conn.execute(
            """
            INSERT INTO artifact_events (id, artifact_id, type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                event_id,
                artifact_id,
                event_type,
                json.dumps(clean_payload, sort_keys=True, ensure_ascii=False),
                created_at,
            ),
        )
        row = conn.execute("SELECT * FROM artifact_events WHERE id = ?", (event_id,)).fetchone()
        if not row:
            raise RuntimeError(f"Artifact event '{event_id}' was not persisted")
        return self._event_dict(row)

    @staticmethod
    def _clean_artifact_id(artifact_id: str) -> str:
        clean_artifact_id = _clean_optional_id(artifact_id, "artifact_id")
        if not clean_artifact_id:
            raise ValueError("artifact_id is required")
        return clean_artifact_id
