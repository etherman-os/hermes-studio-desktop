"""Tests for htg_status.py — HoldTheGoblin read-only status probe."""

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, Mock, patch

import pytest


class TestGetHtgCliPath:
    """Tests for get_htg_cli_path()."""

    def test_returns_none_when_not_available(self) -> None:
        """When neither local checkout nor PATH binary exists, return None."""
        with patch.object(Path, "exists", return_value=False):
            with patch.object(shutil, "which", return_value=None):
                from hermes_adapter.htg_status import get_htg_cli_path
                result = get_htg_cli_path()
        assert result is None

    def test_returns_local_path_when_built(self, tmp_path: Path) -> None:
        """When local checkout htg_cli.js exists, return node path."""
        dist_cli = tmp_path / "htg_cli.js"
        dist_cli.write_text("// built")
        with patch.object(Path, "exists", return_value=True):
            with patch.object(shutil, "which", return_value=None):
                # Import fresh — module is already cached so this re-reads get_htg_cli_path
                # which uses HTG_CLI_LOCAL.exists() (patched True) and returns the constant
                from hermes_adapter.htg_status import get_htg_cli_path

                result = get_htg_cli_path()
        # get_htg_cli_path returns f"node {HTG_CLI_LOCAL}" where HTG_CLI_LOCAL is the
        # module-level constant. Patch.object(Path, "exists") makes the return value
        # f"node /root/projects/HoldTheGoblin/dist/src/cli.js" when that path exists.
        assert result is not None
        assert "node" in result

    def test_returns_which_path_when_found(self) -> None:
        """When local checkout doesn't exist but holdthegoblin is on PATH."""
        with patch.object(Path, "exists", return_value=False):
            with patch.object(shutil, "which", return_value="/usr/bin/holdthegoblin") as mock_which:
                from hermes_adapter.htg_status import get_htg_cli_path
                result = get_htg_cli_path()
        assert result == "/usr/bin/holdthegoblin"
        mock_which.assert_called_once()


class TestCallHtgTool:
    """Tests for _call_htg_tool()."""

    @pytest.mark.asyncio
    async def test_returns_ok_false_when_cli_not_found(self) -> None:
        """FileNotFoundError from _run_htg returns ok=False."""
        with patch("hermes_adapter.htg_status.get_htg_cli_path", return_value=None):
            from hermes_adapter.htg_status import _call_htg_tool

            result = await _call_htg_tool("doctor")
        assert result["ok"] is False
        assert "not available" in result["error"]

    @pytest.mark.asyncio
    async def test_returns_ok_false_on_timeout(self, tmp_path: Path) -> None:
        """TimeoutExpired returns ok=False."""
        dist_cli = tmp_path / "htg_cli.js"
        dist_cli.write_text("// built")

        async def mock_proc(*args: Any, **kwargs: Any) -> Any:
            async def mock_communicate() -> tuple[bytes, bytes]:
                raise asyncio.TimeoutError()

            mock = AsyncMock()
            mock.communicate = mock_communicate
            mock.kill = Mock()  # type: ignore[assignment]
            mock.wait = AsyncMock(return_value=None)  # type: ignore[assignment]
            return mock

        with patch("hermes_adapter.htg_status.get_htg_cli_path", return_value=f"node {dist_cli}"):
            with patch("asyncio.create_subprocess_exec", mock_proc):
                from hermes_adapter.htg_status import _call_htg_tool

                result = await _call_htg_tool("doctor", timeout=0.1)
        assert result["ok"] is False
        assert "timed out" in result["error"]

    @pytest.mark.asyncio
    async def test_parses_json_data_on_success(self, tmp_path: Path) -> None:
        """JSON stdout is extracted as data field."""
        dist_cli = tmp_path / "htg_cli.js"
        dist_cli.write_text("// built")

        async def mock_proc(*args: Any, **kwargs: Any) -> Any:
            async def mock_communicate() -> tuple[bytes, bytes]:
                return json.dumps({"mode": "all", "root": "/test"}).encode(), b""

            mock = AsyncMock()
            mock.communicate = mock_communicate
            mock.returncode = 0
            return mock

        with patch("hermes_adapter.htg_status.get_htg_cli_path", return_value=f"node {dist_cli}"):
            with patch("asyncio.create_subprocess_exec", mock_proc):
                from hermes_adapter.htg_status import _call_htg_tool

                result = await _call_htg_tool("doctor")
        assert result["ok"] is True
        assert result["data"] == {"mode": "all", "root": "/test"}

    @pytest.mark.asyncio
    async def test_returns_error_on_non_zero_exit(self, tmp_path: Path) -> None:
        """Non-zero exit code returns ok=False with stderr excerpt."""
        dist_cli = tmp_path / "htg_cli.js"
        dist_cli.write_text("// built")

        async def mock_proc(*args: Any, **kwargs: Any) -> Any:
            async def mock_communicate() -> tuple[bytes, bytes]:
                return b"", "doctor failed: config not found".encode()

            mock = AsyncMock()
            mock.communicate = mock_communicate
            mock.returncode = 1
            return mock

        with patch("hermes_adapter.htg_status.get_htg_cli_path", return_value=f"node {dist_cli}"):
            with patch("asyncio.create_subprocess_exec", mock_proc):
                from hermes_adapter.htg_status import _call_htg_tool

                result = await _call_htg_tool("doctor")
        assert result["ok"] is False
        assert "not found" in result["error"]


class TestProbeHtgStatus:
    """Tests for probe_htg_status()."""

    @pytest.mark.asyncio
    async def test_returns_unavailable_when_cli_not_found(self) -> None:
        """When HTG is not installed, return clean unavailable status."""
        with patch("hermes_adapter.htg_status.get_htg_cli_path", return_value=None):
            from hermes_adapter.htg_status import probe_htg_status

            result = await probe_htg_status()
        assert result["available"] is False
        assert "not found" in result["reason"].lower()
        assert result["cli_path"] is None
        assert result["doctor"] is None
        assert result["events"] is None
        assert result["checkpoints"] is None

    @pytest.mark.asyncio
    async def test_returns_available_with_all_tools(self, tmp_path: Path) -> None:
        """When HTG is available, doctor/events/checkpoint_list/config_validate are called."""
        dist_cli = tmp_path / "htg_cli.js"
        dist_cli.write_text("// built")

        outputs = [
            (json.dumps({"root": "/test", "mode": "all", "kinds": ["node"]}), ""),
            (json.dumps([{"type": "test", "ts": "2026-05-16T00:00:00Z"}]), ""),
            (json.dumps([]), ""),
            (json.dumps({"ok": True}), ""),
        ]
        idx = [-1]

        async def mock_proc(*args: Any, **kwargs: Any) -> Any:
            nonlocal idx
            idx[0] += 1
            out, err = outputs[idx[0] % len(outputs)]

            async def mock_communicate() -> tuple[bytes, bytes]:
                return out.encode(), err.encode()

            mock = AsyncMock()
            mock.communicate = mock_communicate
            mock.returncode = 0
            return mock

        with patch("hermes_adapter.htg_status.get_htg_cli_path", return_value=f"node {dist_cli}"):
            with patch("asyncio.create_subprocess_exec", mock_proc):
                from hermes_adapter.htg_status import probe_htg_status

                result = await probe_htg_status()
        assert result["available"] is True
        assert result["cli_path"] == f"node {dist_cli}"
        assert result["doctor"] == {"root": "/test", "mode": "all", "kinds": ["node"]}
        assert result["events"] == [{"type": "test", "ts": "2026-05-16T00:00:00Z"}]
        assert result["checkpoints"] == []
        assert result["config_valid"] is True

    @pytest.mark.asyncio
    async def test_graceful_degradation_on_tool_failure(self, tmp_path: Path) -> None:
        """When a tool fails, its error is recorded but others still run."""
        dist_cli = tmp_path / "htg_cli.js"
        dist_cli.write_text("// built")

        outputs = [
            (json.dumps({"root": "/test"}), ""),
            ("", "events command failed"),
            (json.dumps([]), ""),
            (json.dumps({"ok": True}), ""),
        ]
        idx = [-1]

        async def mock_proc(*args: Any, **kwargs: Any) -> Any:
            nonlocal idx
            idx[0] += 1
            out, err = outputs[idx[0] % len(outputs)]

            async def mock_communicate() -> tuple[bytes, bytes]:
                return out.encode(), err.encode()

            mock = AsyncMock()
            mock.communicate = mock_communicate
            mock.returncode = 0 if err == "" else 1
            return mock

        with patch("hermes_adapter.htg_status.get_htg_cli_path", return_value=f"node {dist_cli}"):
            with patch("asyncio.create_subprocess_exec", mock_proc):
                from hermes_adapter.htg_status import probe_htg_status

                result = await probe_htg_status()
        assert result["available"] is True
        assert result["doctor"] == {"root": "/test"}
        assert "events_error" in result
        assert "doctor_error" not in result
        assert "checkpoints_error" not in result