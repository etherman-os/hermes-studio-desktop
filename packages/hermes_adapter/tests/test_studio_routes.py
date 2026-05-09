"""Tests for /studio/* adapter endpoints."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from hermes_adapter import studio_routes
from hermes_adapter.mock_backend import MockBackend
from hermes_adapter.security import set_auth_token
from hermes_adapter.server import create_app


@pytest.fixture(autouse=True)
def _set_token() -> None:
    """Set a test token so auth succeeds."""
    set_auth_token("test-token")


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("HERMES_STUDIO_BACKEND", "mock")
    return TestClient(create_app())


HEADERS = {"Authorization": "Bearer test-token"}


class TestHealthEndpoints:
    def test_root_health(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "adapter_version" in data
        assert "hermes_connected" in data
        assert data["storage"]["available"] is True

    def test_studio_health(self, client: TestClient) -> None:
        resp = client.get("/studio/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["storage"]["schema_version"] == 10

    def test_health_no_auth_required(self, client: TestClient) -> None:
        resp = client.get("/studio/health")
        assert resp.status_code == 200

    def test_root_health_is_dev_adapter_health(self, client: TestClient) -> None:
        resp = client.get("/health")
        assert resp.status_code == 200


class TestBootstrap:
    def test_bootstrap_shape(self, client: TestClient) -> None:
        resp = client.get("/studio/bootstrap", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "adapter_version" in data
        assert "hermes_version" in data
        assert "active_profile" in data
        assert "capabilities" in data
        assert isinstance(data["capabilities"], list)
        assert "recent_sessions" in data
        assert isinstance(data["recent_sessions"], list)
        assert "active_theme" in data
        assert "available_models" in data
        assert data["storage"]["available"] is True

    def test_missing_auth_uses_error_envelope(self, client: TestClient) -> None:
        resp = client.get("/studio/bootstrap")
        assert resp.status_code == 401
        data = resp.json()
        assert data["error"]["code"] == "auth_missing"
        assert data["error"]["source"] == "adapter"
        assert data["error"]["retryable"] is False


class TestProfiles:
    def test_list_profiles(self, client: TestClient) -> None:
        resp = client.get("/studio/profiles", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert "name" in data[0]
        assert "path" in data[0]

    def test_get_active_profile(self, client: TestClient) -> None:
        resp = client.get("/studio/profiles/active", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"]
        assert "path" in data


class TestSessions:
    def test_list_sessions(self, client: TestClient) -> None:
        resp = client.get("/studio/sessions", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "sessions" in data
        assert "total" in data
        assert isinstance(data["sessions"], list)
        assert data["total"] >= 1

    def test_get_session(self, client: TestClient) -> None:
        resp = client.get("/studio/sessions/s-1", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "s-1"
        assert "transcript_preview" in data

    def test_get_session_not_found(self, client: TestClient) -> None:
        resp = client.get("/studio/sessions/nonexistent", headers=HEADERS)
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "not_found"
        assert "not found" in data["error"]["message"]


class TestRuns:
    def test_start_run(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "hello"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "run_id" in data
        assert data["status"] == "started"

    def test_stop_run(self, client: TestClient) -> None:
        # Start a run first
        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "test"},
        )
        run_id = resp.json()["run_id"]

        # Stop it
        resp = client.post(f"/studio/runs/{run_id}/stop", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == run_id
        assert data["status"] == "cancelled"

    def test_sse_stream_emits_events(self, client: TestClient) -> None:
        # Start a run
        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "hello"},
        )
        run_id = resp.json()["run_id"]

        # Stream events — collect all lines until stream closes
        with client.stream("GET", f"/studio/runs/{run_id}/events", headers=HEADERS) as stream:
            events = []
            for line in stream.iter_lines():
                if line.startswith("event: "):
                    events.append(line.split("event: ", 1)[1])

        # Should have received all events in sequence
        assert "run.started" in events
        assert "assistant.delta" in events
        assert "tool.started" in events
        assert "tool.completed" in events
        assert "run.completed" in events

    def test_recent_runs_route_is_not_captured_by_dynamic_run_route(self, client: TestClient) -> None:
        resp = client.get("/studio/runs/recent", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert "runs" in data
        assert data["history_available"] is True

    def test_compare_runs_route_is_not_captured_by_dynamic_run_route(self, client: TestClient) -> None:
        run_ids: list[str] = []
        for prompt in ("left run", "right run"):
            resp = client.post(
                "/studio/runs",
                headers=HEADERS,
                json={"session_id": "s-1", "prompt": prompt},
            )
            run_id = resp.json()["run_id"]
            run_ids.append(run_id)
            with client.stream("GET", f"/studio/runs/{run_id}/events", headers=HEADERS) as stream:
                for _line in stream.iter_lines():
                    pass

        resp = client.get(
            "/studio/runs/compare",
            headers=HEADERS,
            params={"left_run_id": run_ids[0], "right_run_id": run_ids[1]},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["left"]["run_id"] == run_ids[0]
        assert data["right"]["run_id"] == run_ids[1]
        assert data["history_available"] is True
        assert "event_count_delta" in data["delta"]

    def test_run_persists_after_streaming(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "persist me", "workspace_path": "/tmp/project"},
        )
        run_id = resp.json()["run_id"]

        with client.stream("GET", f"/studio/runs/{run_id}/events", headers=HEADERS) as stream:
            for _line in stream.iter_lines():
                pass

        recent = client.get("/studio/runs/recent", headers=HEADERS)
        ledger = client.get(f"/studio/runs/{run_id}/ledger", headers=HEADERS)

        assert recent.status_code == 200
        assert run_id in {run["id"] for run in recent.json()["runs"]}
        assert ledger.status_code == 200
        data = ledger.json()
        assert data["run"]["id"] == run_id
        assert data["run"]["status"] == "completed"
        assert data["run"]["workspace_path"] == "/tmp/project"
        assert "assistant.delta" in {event["type"] for event in data["events"]}

    def test_streaming_continues_when_run_persistence_unavailable(
        self,
        client: TestClient,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        monkeypatch.setenv("HERMES_STUDIO_DB_PATH", str(hermes_home / "state.db"))

        resp = client.post(
            "/studio/runs",
            headers=HEADERS,
            json={"session_id": "s-1", "prompt": "history unavailable"},
        )
        run_id = resp.json()["run_id"]

        with client.stream("GET", f"/studio/runs/{run_id}/events", headers=HEADERS) as stream:
            events = [
                line.split("event: ", 1)[1]
                for line in stream.iter_lines()
                if line.startswith("event: ")
            ]

        assert "assistant.delta" in events
        assert "run.completed" in events
        assert "adapter.warning" in events


class TestThemes:
    def test_list_themes(self, client: TestClient) -> None:
        resp = client.get("/studio/themes", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "themes" in data
        assert "active" in data
        assert len(data["themes"]) >= 1

    def test_activate_theme(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/themes/activate",
            headers=HEADERS,
            json={"theme_id": "minecraft-overworld"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "minecraft-overworld"

    def test_activate_theme_not_found(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/themes/activate",
            headers=HEADERS,
            json={"theme_id": "nonexistent"},
        )
        assert resp.status_code == 404

    def test_get_active_theme(self, client: TestClient) -> None:
        resp = client.get("/studio/themes/active", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "meta" in data
        assert "palette" in data
        assert "labels" in data

    def test_get_theme_by_id(self, client: TestClient) -> None:
        resp = client.get("/studio/themes/default-dark", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["meta"]["id"] == "default-dark"

    def test_get_theme_not_found(self, client: TestClient) -> None:
        resp = client.get("/studio/themes/nonexistent", headers=HEADERS)
        assert resp.status_code == 404

    def test_reload_themes(self, client: TestClient) -> None:
        resp = client.post("/studio/themes/reload", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["reloaded"] is True
        assert data["count"] >= 1

    def test_active_not_captured_by_dynamic_route(self, client: TestClient) -> None:
        """Verify /themes/active is not treated as theme_id='active'."""
        resp = client.get("/studio/themes/active", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        # Should return normalized theme, not theme info for id "active"
        assert "meta" in data
        assert data["meta"]["id"] != "active"


class TestConfig:
    def test_get_config(self, client: TestClient) -> None:
        resp = client.get("/studio/config", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "config" in data

    def test_patch_config(self, client: TestClient) -> None:
        resp = client.patch(
            "/studio/config",
            headers=HEADERS,
            json={"key": "test_key", "value": "test_value"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["config"]["test_key"] == "test_value"


class TestModelConfig:
    def test_get_model_config_includes_provider_on_available_models(self, client: TestClient) -> None:
        resp = client.get("/studio/model-config", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert data["available_models"]
        assert all("provider" in model for model in data["available_models"])

    def test_list_available_models(self, client: TestClient) -> None:
        resp = client.get("/studio/model-config/models", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert "models" in data
        assert {"id", "name", "provider"} <= set(data["models"][0])

    def test_patch_model_config_updates_mock_backend(self, client: TestClient) -> None:
        resp = client.patch(
            "/studio/model-config",
            headers=HEADERS,
            json={"provider": "openai", "model": "gpt-4o", "temperature": 0.3},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "openai"
        assert data["model"] == "gpt-4o"
        assert data["temperature"] == 0.3

    def test_patch_model_config_auto_fallback_uses_local_hermes_cli(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        async def fake_patch(body: dict[str, object]) -> dict[str, object]:
            return {
                "provider": body["provider"],
                "model": body["model"],
                "status": "updated",
                "write_source": "hermes_cli",
                "active_backend": "hermes_cli",
            }

        monkeypatch.setattr(studio_routes, "_backend", MockBackend())
        monkeypatch.setattr(studio_routes, "_backend_status", {"backend_mode": "auto", "active_backend": "mock"})
        monkeypatch.setattr(studio_routes, "_patch_model_config_via_local_hermes", fake_patch)

        resp = client.patch(
            "/studio/model-config",
            headers=HEADERS,
            json={"provider": "glm", "model": "glm-5"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "glm"
        assert data["model"] == "glm-5"
        assert data["write_source"] == "hermes_cli"
        assert data["active_backend"] == "hermes_cli"

    def test_patch_model_config_rejects_unknown_keys(self, client: TestClient) -> None:
        resp = client.patch(
            "/studio/model-config",
            headers=HEADERS,
            json={"api_key": "sk-secret"},
        )

        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "model_config_error"

    def test_patch_model_config_returns_501_when_backend_has_no_safe_write_path(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        class ReadOnlyModelBackend(MockBackend):
            async def patch_model_config(self, updates: dict[str, object]) -> dict[str, object]:
                return {"status": "not_implemented", "message": "No safe public API for model config mutation"}

        monkeypatch.setattr(studio_routes, "_backend", ReadOnlyModelBackend())
        monkeypatch.setattr(studio_routes, "_backend_status", {"backend_mode": "hermes", "active_backend": "hermes"})

        resp = client.patch(
            "/studio/model-config",
            headers=HEADERS,
            json={"model": "gpt-4o"},
        )

        assert resp.status_code == 501
        error = resp.json()["error"]
        assert error["code"] == "not_implemented"
        assert error["hint"]


class TestHermesDiagnostics:
    def test_hermes_doctor_route_parses_and_redacts_cli_output(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        async def fake_run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
            assert args == ["doctor"]
            assert timeout == 90
            return subprocess.CompletedProcess(
                args,
                0,
                stdout="◆ Auth Providers\n  ✓ GLM configured\n  ⚠ MiniMax token sk-secretvalue missing\n",
                stderr="",
            )

        monkeypatch.setattr(studio_routes, "_run_local_hermes", fake_run_local_hermes)

        resp = client.get("/studio/hermes/doctor", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok_count"] == 1
        assert data["warning_count"] == 1
        assert data["checks"][0]["section"] == "Auth Providers"
        assert "sk-secretvalue" not in "\n".join(data["lines"])

    def test_hermes_release_route_checks_version_and_update_status(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        async def fake_run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
            if args == ["version"]:
                assert timeout == 30
                return subprocess.CompletedProcess(args, 0, stdout="Hermes Agent v0.13.0 (2026.5.7)\nUp to date\n", stderr="")
            assert args == ["update", "--check"]
            assert timeout == 60
            return subprocess.CompletedProcess(args, 0, stdout="Update available: 27 commits behind upstream/main.\n", stderr="")

        monkeypatch.setattr(studio_routes, "_run_local_hermes", fake_run_local_hermes)

        resp = client.get("/studio/hermes/release", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == "0.13.0"
        assert data["update_available"] is True
        assert data["behind_count"] == 27

    def test_browser_cache_route_reports_playwright_and_puppeteer_cache_dirs(self, client: TestClient) -> None:
        resp = client.get("/studio/hermes/browser-cache", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert data["playwright_cache_dir"].endswith(".cache/ms-playwright")
        assert data["puppeteer_cache_dir"].endswith(".cache/puppeteer")
        assert isinstance(data["playwright_browsers"], list)
        assert isinstance(data["puppeteer_browsers"], list)

    def test_checkpoint_prune_route_uses_hermes_checkpoint_cli(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        calls: list[list[str]] = []

        async def fake_run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
            calls.append(args)
            if args[0:2] == ["checkpoints", "prune"]:
                assert args == ["checkpoints", "prune", "--retention-days", "3", "--max-size-mb", "200", "--keep-orphans"]
                assert timeout == 120
                return subprocess.CompletedProcess(args, 0, stdout="Pruning checkpoint store...\nDone\n", stderr="")
            assert args == ["checkpoints", "status"]
            return subprocess.CompletedProcess(args, 0, stdout="Checkpoint base: /tmp/checkpoints\nProjects:        0\n", stderr="")

        monkeypatch.setattr(studio_routes, "_run_local_hermes", fake_run_local_hermes)

        resp = client.post(
            "/studio/hermes/checkpoints/prune",
            headers=HEADERS,
            json={"retention_days": 3, "max_size_mb": 200, "keep_orphans": True},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "prune"
        assert data["ok"] is True
        assert data["status"]["available"] is True
        assert calls[0][0:2] == ["checkpoints", "prune"]

    def test_checkpoint_prune_route_validates_options(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/hermes/checkpoints/prune",
            headers=HEADERS,
            json={"retention_days": 0},
        )

        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "invalid_checkpoint_prune_options"

    def test_skill_check_route_uses_hermes_skills_cli(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        async def fake_run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
            assert args == ["skills", "check"]
            assert timeout == 45
            return subprocess.CompletedProcess(args, 0, stdout="No hub-installed skills to check.\n", stderr="")

        monkeypatch.setattr(studio_routes, "_run_local_hermes", fake_run_local_hermes)

        resp = client.post("/studio/hermes/skills/check", headers=HEADERS, json={})

        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "check"
        assert data["ok"] is True
        assert data["message"] == "No hub-installed skills to check."

    def test_skill_install_route_uses_noninteractive_hermes_cli(
        self,
        client: TestClient,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        monkeypatch.setenv("HERMES_HOME", str(hermes_home))

        async def fake_run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
            assert args == [
                "skills",
                "install",
                "--yes",
                "--category",
                "coding",
                "--name",
                "skill-creator",
                "openai/skills/skill-creator",
            ]
            assert timeout == 120
            return subprocess.CompletedProcess(args, 0, stdout="Installed skill-creator\n", stderr="")

        monkeypatch.setattr(studio_routes, "_run_local_hermes", fake_run_local_hermes)

        resp = client.post(
            "/studio/hermes/skills/install",
            headers=HEADERS,
            json={"identifier": "openai/skills/skill-creator", "category": "coding", "name": "skill-creator"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "install"
        assert data["ok"] is True
        assert data["skills"] == []

    def test_skill_install_rejects_control_characters(self, client: TestClient) -> None:
        resp = client.post(
            "/studio/hermes/skills/install",
            headers=HEADERS,
            json={"identifier": "openai/skills/foo\nbar"},
        )

        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "invalid_cli_identifier"

    def test_mcp_probe_route_uses_configured_server_and_detects_cli_failure(
        self,
        client: TestClient,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        (hermes_home / "config.yaml").write_text(
            "mcp_servers:\n"
            "  fetch:\n"
            "    command: uvx\n"
            "    args: [mcp-server-fetch]\n",
            encoding="utf-8",
        )
        monkeypatch.setenv("HERMES_HOME", str(hermes_home))

        async def fake_run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
            assert args == ["mcp", "test", "fetch"]
            assert timeout == 45
            return subprocess.CompletedProcess(
                args,
                0,
                stdout="Testing 'fetch'...\n✗ Connection failed: sk-secretvalue missing\n",
                stderr="",
            )

        monkeypatch.setattr(studio_routes, "_run_local_hermes", fake_run_local_hermes)

        resp = client.post("/studio/hermes/mcp-servers/fetch/test", headers=HEADERS)

        assert resp.status_code == 200
        data = resp.json()
        assert data["server_id"] == "fetch"
        assert data["ok"] is False
        assert data["status"] == "error"
        assert "sk-secretvalue" not in "\n".join(data["lines"])

    def test_mcp_probe_route_rejects_unknown_server(self, client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        (hermes_home / "config.yaml").write_text("mcp_servers: {}\n", encoding="utf-8")
        monkeypatch.setenv("HERMES_HOME", str(hermes_home))

        resp = client.post("/studio/hermes/mcp-servers/unknown/test", headers=HEADERS)

        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "mcp_server_not_found"

    def test_configure_toolset_route_uses_hermes_tools_cli(
        self,
        client: TestClient,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        (hermes_home / "config.yaml").write_text("platform_toolsets:\n  cli: [browser]\n", encoding="utf-8")
        monkeypatch.setenv("HERMES_HOME", str(hermes_home))

        async def fake_run_local_hermes(args: list[str], *, timeout: int = 15) -> subprocess.CompletedProcess[str]:
            assert args == ["tools", "disable", "--platform", "cli", "browser"]
            assert timeout == 20
            return subprocess.CompletedProcess(args, 0, stdout="Disabled: browser\n", stderr="")

        monkeypatch.setattr(studio_routes, "_run_local_hermes", fake_run_local_hermes)

        resp = client.post(
            "/studio/hermes/toolsets/configure",
            headers=HEADERS,
            json={"id": "browser", "platform": "cli", "enabled": False},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "configured"
        assert data["id"] == "browser"
        assert data["enabled"] is False

    def test_configure_toolset_route_rejects_unknown_toolset(
        self,
        client: TestClient,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        hermes_home = tmp_path / ".hermes"
        hermes_home.mkdir()
        (hermes_home / "config.yaml").write_text("platform_toolsets:\n  cli: [file]\n", encoding="utf-8")
        monkeypatch.setenv("HERMES_HOME", str(hermes_home))

        resp = client.post(
            "/studio/hermes/toolsets/configure",
            headers=HEADERS,
            json={"id": "definitely-not-a-toolset", "platform": "cli", "enabled": True},
        )

        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "toolset_not_found"


class TestLogs:
    def test_get_logs(self, client: TestClient) -> None:
        resp = client.get("/studio/logs", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "source" in data
        assert "lines" in data
        assert "total" in data


class TestDelegations:
    def test_list_delegations_empty(self, client: TestClient) -> None:
        resp = client.get("/studio/delegations", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "delegations" in data
        assert "total" in data
        assert isinstance(data["delegations"], list)

    def test_list_delegations_with_limit(self, client: TestClient) -> None:
        resp = client.get("/studio/delegations?limit=10", headers=HEADERS)
        assert resp.status_code == 200

    def test_get_delegation_not_found(self, client: TestClient) -> None:
        resp = client.get("/studio/delegations/nonexistent:id", headers=HEADERS)
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "delegation_error"

    def test_delegations_require_auth(self, client: TestClient) -> None:
        resp = client.get("/studio/delegations")
        assert resp.status_code == 401


class TestCronJobs:
    def test_list_cron_jobs(self, client: TestClient) -> None:
        resp = client.get("/studio/cron-jobs", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "jobs" in data
        assert "total" in data
        assert isinstance(data["jobs"], list)

    def test_list_cron_jobs_with_limit(self, client: TestClient) -> None:
        resp = client.get("/studio/cron-jobs?limit=50", headers=HEADERS)
        assert resp.status_code == 200

    def test_get_cron_job_not_found(self, client: TestClient) -> None:
        resp = client.get("/studio/cron-jobs/nonexistent-job", headers=HEADERS)
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "cron_error"

    def test_cron_jobs_require_auth(self, client: TestClient) -> None:
        resp = client.get("/studio/cron-jobs")
        assert resp.status_code == 401
