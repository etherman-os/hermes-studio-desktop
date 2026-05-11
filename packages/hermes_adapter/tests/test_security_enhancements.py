"""Tests for enhanced security.py features."""

from __future__ import annotations

import time
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
import pytest

from hermes_adapter.security import (
    DEFAULT_TOKEN_EXPIRY_SECONDS,
    generate_token,
    is_token_expired,
    require_token,
    rotate_token,
    set_auth_token,
)


class TestTokenExpiry:
    def test_fresh_token_not_expired(self) -> None:
        set_auth_token(generate_token())
        assert is_token_expired() is False

    def test_no_token_is_expired(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        import hermes_adapter.security as sec
        monkeypatch.setattr(sec, "get_token_path", lambda: tmp_path / "missing-token")
        set_auth_token(None)
        assert is_token_expired() is True

    def test_token_expired_after_max_age(self) -> None:
        set_auth_token(generate_token())
        import hermes_adapter.security as sec
        sec._token_created_at = time.monotonic() - DEFAULT_TOKEN_EXPIRY_SECONDS - 1
        assert is_token_expired() is True

    def test_require_token_rejects_expired_token(self) -> None:
        import hermes_adapter.security as sec
        sec._auth_failures.clear()

        test_app = FastAPI()

        @test_app.get("/protected", dependencies=[Depends(require_token)])
        async def protected():
            return {"ok": True}

        set_auth_token("correct-token")
        sec._token_created_at = time.monotonic() - DEFAULT_TOKEN_EXPIRY_SECONDS - 1
        client = TestClient(test_app, raise_server_exceptions=False)

        resp = client.get("/protected", headers={"Authorization": "Bearer correct-token"})

        assert resp.status_code == 401
        assert resp.json()["detail"]["error"]["code"] == "auth_expired"


class TestTokenRotation:
    def test_rotate_generates_new_token(self) -> None:
        set_auth_token("old-token")
        new = rotate_token()
        assert new != "old-token"
        assert len(new) == 64  # 32 bytes hex

    def test_rotated_token_is_active(self) -> None:
        new = rotate_token()
        assert new is not None


class TestRateLimiting:
    def test_rate_limits_after_max_failures(self) -> None:
        import hermes_adapter.security as sec
        sec._auth_failures.clear()

        test_app = FastAPI()

        @test_app.get("/protected", dependencies=[Depends(require_token)])
        async def protected():
            return {"ok": True}

        client = TestClient(test_app, raise_server_exceptions=False)
        set_auth_token("correct-token")

        for _ in range(10):
            client.get("/protected", headers={"Authorization": "Bearer wrong"})

        resp = client.get("/protected", headers={"Authorization": "Bearer wrong"})
        assert resp.status_code == 429

    def test_successful_auth_after_failures(self) -> None:
        import hermes_adapter.security as sec
        sec._auth_failures.clear()

        test_app = FastAPI()

        @test_app.get("/protected", dependencies=[Depends(require_token)])
        async def protected():
            return {"ok": True}

        set_auth_token("correct-token")
        client = TestClient(test_app, raise_server_exceptions=False)

        for _ in range(3):
            client.get("/protected", headers={"Authorization": "Bearer wrong"})

        resp = client.get("/protected", headers={"Authorization": "Bearer correct-token"})
        assert resp.status_code == 200
