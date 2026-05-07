"""Tests for Studio-owned SQLite persistence foundation."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from hermes_adapter.security import set_auth_token
from hermes_adapter.server import create_app
from hermes_adapter.studio_storage import StudioStorage, resolve_studio_paths


def test_creates_data_dir_and_studio_db(tmp_path: Path) -> None:
    data_dir = tmp_path / "studio-data"
    storage = StudioStorage(data_dir=data_dir)

    status = storage.initialize()

    assert status.available is True
    assert status.schema_version == 8
    assert data_dir.is_dir()
    assert (data_dir / "studio.db").is_file()


def test_migrations_are_idempotent(tmp_path: Path) -> None:
    storage = StudioStorage(data_dir=tmp_path / "studio-data")

    first = storage.initialize()
    second = StudioStorage(data_dir=Path(first.data_dir)).initialize()

    assert first.available is True
    assert second.available is True
    with sqlite3.connect(first.db_path) as conn:
        rows = conn.execute("SELECT version, name FROM migrations").fetchall()

    assert rows == [
        (1, "initial_studio_storage"),
        (2, "persistent_kanban"),
        (3, "persistent_run_ledger"),
        (4, "run_workspace_metadata"),
        (5, "persistent_artifacts"),
        (6, "persistent_approvals"),
        (7, "audit_log_table"),
        (8, "tool_packs"),
    ]


def test_schema_version_is_reported(tmp_path: Path) -> None:
    storage = StudioStorage(data_dir=tmp_path / "studio-data")

    assert storage.initialize().schema_version == 8
    assert storage.get_schema_version() == 8


def test_studio_meta_can_read_write_non_secret_values(tmp_path: Path) -> None:
    storage = StudioStorage(data_dir=tmp_path / "studio-data")

    storage.set_meta("theme_gallery_last_view", "grid")

    assert storage.get_meta("theme_gallery_last_view") == "grid"


def test_studio_meta_rejects_secret_like_values(tmp_path: Path) -> None:
    storage = StudioStorage(data_dir=tmp_path / "studio-data")

    with pytest.raises(RuntimeError, match="secret-like keys"):
        storage.set_meta("api_token", "value")
    with pytest.raises(RuntimeError, match="secret-like values"):
        storage.set_meta("debug_value", "Bearer abc123")


def test_hermes_studio_home_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    studio_home = tmp_path / "custom-studio-home"
    monkeypatch.setenv("HERMES_STUDIO_HOME", str(studio_home))
    monkeypatch.delenv("HERMES_STUDIO_DB_PATH", raising=False)

    data_dir, db_path = resolve_studio_paths()
    status = StudioStorage().initialize()

    assert data_dir == studio_home
    assert db_path == studio_home / "studio.db"
    assert Path(status.data_dir) == studio_home
    assert Path(status.db_path) == studio_home / "studio.db"


def test_hermes_studio_db_path_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    db_path = tmp_path / "custom" / "studio.db"
    monkeypatch.setenv("HERMES_STUDIO_DB_PATH", str(db_path))

    status = StudioStorage().initialize()

    assert status.available is True
    assert Path(status.db_path) == db_path
    assert db_path.is_file()


def test_db_path_guard_rejects_hermes_state_db(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    hermes_db = tmp_path / ".hermes" / "state.db"
    hermes_db.parent.mkdir()
    hermes_db.write_bytes(b"hermes-state")
    monkeypatch.setenv("HERMES_STUDIO_DB_PATH", str(hermes_db))

    status = StudioStorage().initialize()

    assert status.available is False
    assert "Hermes state.db" in (status.last_error or "")
    assert hermes_db.read_bytes() == b"hermes-state"


def test_db_path_guard_requires_studio_db_filename(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("HERMES_STUDIO_DB_PATH", str(tmp_path / "not-studio.sqlite"))

    status = StudioStorage().initialize()

    assert status.available is False
    assert "studio.db" in (status.last_error or "")


def test_corrupt_db_is_reported_without_crashing(tmp_path: Path) -> None:
    data_dir = tmp_path / "studio-data"
    data_dir.mkdir()
    db_path = data_dir / "studio.db"
    db_path.write_text("not a sqlite database", encoding="utf-8")

    status = StudioStorage(data_dir=data_dir, db_path=db_path).initialize()

    assert status.available is False
    assert status.schema_version == 0
    assert status.last_error


def test_health_and_bootstrap_include_storage_metadata(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HERMES_STUDIO_HOME", str(tmp_path / "studio-home"))
    set_auth_token("storage-token")
    client = TestClient(create_app())

    health = client.get("/studio/health").json()
    root_health = client.get("/health").json()
    bootstrap = client.get(
        "/studio/bootstrap",
        headers={"Authorization": "Bearer storage-token"},
    ).json()

    for payload in (health, root_health, bootstrap):
        assert payload["storage"]["available"] is True
        assert payload["storage"]["schema_version"] == 8
        assert payload["storage"]["db_path"].endswith("studio.db")
        assert payload["storage"]["last_error"] is None


def test_studio_storage_does_not_write_to_hermes_state_db(tmp_path: Path) -> None:
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    hermes_db = hermes_home / "state.db"
    with sqlite3.connect(hermes_db) as conn:
        conn.execute("CREATE TABLE hermes_marker (id INTEGER PRIMARY KEY)")
        conn.execute("INSERT INTO hermes_marker (id) VALUES (1)")

    before = hermes_db.read_bytes()
    status = StudioStorage(data_dir=tmp_path / "studio-data").initialize()
    after = hermes_db.read_bytes()

    assert status.available is True
    assert before == after
    with sqlite3.connect(hermes_db) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
    assert tables == {"hermes_marker"}
