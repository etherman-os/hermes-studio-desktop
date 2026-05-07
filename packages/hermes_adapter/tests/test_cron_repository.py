"""Tests for Studio-owned cron job repository."""

from __future__ import annotations

import json
from pathlib import Path

from hermes_adapter.cron_repository import CronRepository


def _write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def test_empty_cron_dir(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    repo = CronRepository(hermes_home=tmp_path)
    assert repo.available is True

    result = repo.list_jobs()
    assert result["jobs"] == []
    assert result["total"] == 0
    assert result["source"] == "cron_dir"


def test_missing_cron_dir(tmp_path: Path) -> None:
    repo = CronRepository(hermes_home=tmp_path)
    assert repo.available is False

    result = repo.list_jobs()
    assert result["jobs"] == []
    assert result["source"] == "unavailable"


def test_load_json_cron_job(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    _write_json(cron_dir / "backup.json", {
        "id": "backup-job",
        "name": "Nightly Backup",
        "schedule": "0 2 * * *",
        "command": "hermes run backup",
        "description": "Back up the workspace",
        "status": "active",
    })

    repo = CronRepository(hermes_home=tmp_path)
    result = repo.list_jobs()

    assert result["total"] == 1
    job = result["jobs"][0]
    assert job["id"] == "backup-job"
    assert job["name"] == "Nightly Backup"
    assert job["schedule"] == "0 2 * * *"
    assert job["schedule_human"] == "Daily at 02:00"
    assert job["command"] == "hermes run backup"
    assert job["status"] == "active"


def test_get_cron_job_by_id(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    _write_json(cron_dir / "test.json", {
        "id": "test-job",
        "name": "Test Job",
        "schedule": "*/5 * * * *",
        "command": "echo test",
    })

    repo = CronRepository(hermes_home=tmp_path)
    job = repo.get_job("test-job")

    assert job["id"] == "test-job"
    assert job["schedule_human"] == "Every 5 minutes"


def test_get_cron_job_not_found(tmp_path: Path) -> None:
    import pytest

    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()

    repo = CronRepository(hermes_home=tmp_path)
    with pytest.raises(ValueError, match="not found"):
        repo.get_job("nonexistent")


def test_schedule_human_readable_hourly(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    _write_json(cron_dir / "hourly.json", {
        "id": "hourly",
        "name": "Hourly Check",
        "schedule": "30 * * * *",
        "command": "check",
    })

    repo = CronRepository(hermes_home=tmp_path)
    job = repo.get_job("hourly")
    assert job["schedule_human"] == "Every hour at :30"


def test_schedule_human_readable_weekly(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    _write_json(cron_dir / "weekly.json", {
        "id": "weekly",
        "name": "Weekly Report",
        "schedule": "0 9 * * 1",
        "command": "report",
    })

    repo = CronRepository(hermes_home=tmp_path)
    job = repo.get_job("weekly")
    assert job["schedule_human"] == "Every Monday at 09:00"


def test_schedule_human_readable_monthly(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    _write_json(cron_dir / "monthly.json", {
        "id": "monthly",
        "name": "Monthly Cleanup",
        "schedule": "0 0 1 * *",
        "command": "cleanup",
    })

    repo = CronRepository(hermes_home=tmp_path)
    job = repo.get_job("monthly")
    assert job["schedule_human"] == "Monthly on day 1 at 00:00"


def test_get_status(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    _write_json(cron_dir / "a.json", {"id": "a", "name": "A", "schedule": "* * * * *", "command": "a"})
    _write_json(cron_dir / "b.json", {"id": "b", "name": "B", "schedule": "0 * * * *", "command": "b"})

    repo = CronRepository(hermes_home=tmp_path)
    status = repo.get_status()

    assert status["available"] is True
    assert status["job_count"] == 2


def test_malformed_json_skipped(tmp_path: Path) -> None:
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir()
    (cron_dir / "bad.json").write_text("not json{{", encoding="utf-8")
    _write_json(cron_dir / "good.json", {"id": "good", "name": "Good", "schedule": "* * * * *", "command": "ok"})

    repo = CronRepository(hermes_home=tmp_path)
    result = repo.list_jobs()
    assert result["total"] == 1
    assert result["jobs"][0]["id"] == "good"
