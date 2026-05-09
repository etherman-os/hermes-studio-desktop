"""Tests for Studio-owned Artifact persistence."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from hermes_adapter.artifact_repository import ArtifactRepository
from hermes_adapter.studio_storage import StudioStorage


def _repo(tmp_path: Path) -> ArtifactRepository:
    return ArtifactRepository(StudioStorage(data_dir=tmp_path / "studio-data"))


def test_create_list_and_get_artifact(tmp_path: Path) -> None:
    repo = _repo(tmp_path)

    created = repo.create_artifact(
        {
            "title": "Run summary",
            "type": "markdown",
            "description": "Summary artifact",
            "content_text": "# Summary\nDone",
            "run_id": "run-1",
            "source": "run",
        }
    )
    listed = repo.list_artifacts()
    detail = repo.get_artifact(created["id"])

    assert created["id"].startswith("artifact_")
    assert listed["total"] == 1
    assert listed["artifacts"][0]["has_content"] is True
    assert "content_text" not in listed["artifacts"][0]
    assert detail["content_text"] == "# Summary\nDone"
    assert detail["events"][0]["type"] == "artifact.created"


def test_update_artifact(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    artifact = repo.create_artifact({"title": "Initial", "type": "text"})

    updated = repo.update_artifact(
        artifact["id"],
        {"title": "Updated", "description": "New detail", "content_text": "Plain text", "type": "report"},
    )

    assert updated["title"] == "Updated"
    assert updated["description"] == "New detail"
    assert updated["content_text"] == "Plain text"
    assert updated["type"] == "report"


def test_artifact_revisions_and_revert(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    artifact = repo.create_artifact({"title": "Initial", "type": "text", "content_text": "v1"})
    repo.update_artifact(artifact["id"], {"title": "Second", "content_text": "v2"})

    revisions = repo.list_revisions(artifact["id"])
    revisions_with_content = repo.list_revisions(artifact["id"], include_content=True)
    reverted = repo.revert_artifact(artifact["id"], 1)
    detail = repo.get_artifact(artifact["id"])

    assert revisions["total"] == 2
    assert [revision["version"] for revision in revisions["revisions"]] == [2, 1]
    assert revisions["revisions"][0]["has_content"] is True
    assert "content_text" not in revisions["revisions"][0]
    assert revisions_with_content["revisions"][0]["content_text"] == "v2"
    assert revisions_with_content["revisions"][1]["content_text"] == "v1"
    assert reverted["title"] == "Initial"
    assert reverted["content_text"] == "v1"
    assert [revision["version"] for revision in detail["revisions"]] == [3, 2, 1]
    assert detail["revisions"][0]["event_type"] == "artifact.reverted"
    assert detail["events"][-1]["type"] == "artifact.reverted"


def test_artifact_variant_groups_and_apply(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    artifact = repo.create_artifact({"title": "Landing", "type": "html", "content_text": "<h1>Original</h1>"})

    group = repo.create_variant_group(
        artifact["id"],
        {
            "title": "Landing variants",
            "brief": "Compare hero treatments",
            "variants": [
                {
                    "label": "A",
                    "title": "Sharper hero",
                    "content_text": "<h1>Sharper</h1>",
                    "mime_type": "text/html",
                    "rationale": "Clearer first viewport.",
                    "score": 91,
                }
            ],
        },
    )
    added = repo.add_variant(
        group["id"],
        {
            "label": "B",
            "title": "Calmer hero",
            "content_text": "<h1>Calmer</h1>",
            "mime_type": "text/html",
            "score": 82,
        },
    )
    applied = repo.apply_variant(group["id"], group["variants"][1]["id"])
    listed = repo.list_variant_groups(artifact["id"])

    assert group["id"].startswith("artifact_variant_group_")
    assert [variant["label"] for variant in group["variants"]] == ["Source", "A"]
    assert added["status"] == "ready"
    assert len(added["variants"]) == 3
    assert applied["content_text"] == "<h1>Sharper</h1>"
    assert applied["revisions"][0]["event_type"] == "artifact.variant_applied"
    assert applied["variant_groups"][0]["status"] == "applied"
    assert applied["variant_groups"][0]["winner_variant_id"] == group["variants"][1]["id"]
    assert listed["total"] == 1


def test_archive_artifact(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    artifact = repo.create_artifact({"title": "Archive me", "type": "text"})

    archived = repo.archive_artifact(artifact["id"])
    listed = repo.list_artifacts()
    listed_with_archived = repo.list_artifacts(include_archived=True)

    assert archived["archived_at"] is not None
    assert listed["total"] == 0
    assert listed_with_archived["total"] == 1


def test_link_run_session_and_card(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    artifact = repo.create_artifact({"title": "Links", "type": "markdown"})

    linked_run = repo.link_artifact_to_run(artifact["id"], "run-1")
    linked_session = repo.link_artifact_to_session(artifact["id"], "session-1")
    linked_card = repo.link_artifact_to_card(artifact["id"], "card-1")

    assert linked_run["run_id"] == "run-1"
    assert linked_session["session_id"] == "session-1"
    assert linked_card["run_id"] == "run-1"
    assert linked_card["session_id"] == "session-1"
    assert linked_card["kanban_card_id"] == "card-1"


def test_file_reference_stores_path_metadata_only(tmp_path: Path) -> None:
    repo = _repo(tmp_path)

    artifact = repo.create_artifact(
        {
            "title": "Report file",
            "type": "file_reference",
            "file_path": str(tmp_path / "private" / "report.md"),
            "mime_type": "text/markdown",
            "size_bytes": 42,
        }
    )

    assert artifact["file_path"].endswith("report.md")
    assert artifact["file_name"] == "report.md"
    assert artifact["content_text"] is None


def test_redacts_secret_like_text(tmp_path: Path) -> None:
    repo = _repo(tmp_path)

    artifact = repo.create_artifact(
        {
            "title": "Secret report",
            "type": "text",
            "content_text": "Authorization: Bearer abc123\napi_key=sk-secretvalue",
        }
    )

    assert "Bearer abc123" not in artifact["content_text"]
    assert "sk-secretvalue" not in artifact["content_text"]
    assert "[REDACTED]" in artifact["content_text"]


def test_large_content_is_rejected(tmp_path: Path) -> None:
    repo = _repo(tmp_path)

    with pytest.raises(ValueError, match="content_text must be"):
        repo.create_artifact({"title": "Too large", "type": "text", "content_text": "x" * 200_001})


def test_rejects_secret_like_event_fields(tmp_path: Path) -> None:
    repo = _repo(tmp_path)
    artifact = repo.create_artifact({"title": "Event safety", "type": "text"})

    with pytest.raises(RuntimeError, match="secret-like fields"):
        repo._add_artifact_event(  # noqa: SLF001 - repository event safety is part of the contract
            sqlite3.connect(":memory:"),
            artifact["id"],
            "unsafe",
            {"api_token": "value"},
        )


def test_artifact_repository_does_not_write_to_hermes_state_db(tmp_path: Path) -> None:
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    hermes_db = hermes_home / "state.db"
    with sqlite3.connect(hermes_db) as conn:
        conn.execute("CREATE TABLE hermes_marker (id INTEGER PRIMARY KEY)")
        conn.execute("INSERT INTO hermes_marker (id) VALUES (1)")

    before = hermes_db.read_bytes()
    repo = ArtifactRepository(StudioStorage(data_dir=tmp_path / "studio-data"))
    repo.create_artifact({"title": "Studio-only artifact", "type": "markdown", "content_text": "# Local"})
    after = hermes_db.read_bytes()

    assert before == after
    with sqlite3.connect(hermes_db) as conn:
        tables = {
            row[0]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
    assert tables == {"hermes_marker"}
