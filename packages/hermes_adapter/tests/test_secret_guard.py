"""Tests for the secret_guard module."""

from __future__ import annotations

from pathlib import Path

import pytest

from hermes_adapter.secret_guard import (
    check_content_size,
    is_secret_key,
    is_secret_value,
    redact_dict,
    redact_text,
    validate_file_path,
)


class TestRedactText:
    def test_redacts_bearer_token(self) -> None:
        result = redact_text("Authorization: Bearer abc123xyz")
        assert "[REDACTED]" in result
        assert "abc123xyz" not in result

    def test_redacts_openai_key(self) -> None:
        result = redact_text("key is sk-abcdefghijklmnopqrstuvwx")
        assert "[REDACTED]" in result
        assert "sk-abcdefghijklmnopqrstuvwx" not in result

    def test_redacts_aws_access_key(self) -> None:
        result = redact_text("AKIAIOSFODNN7EXAMPLE")
        assert "[REDACTED]" in result

    def test_redacts_github_token(self) -> None:
        result = redact_text("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij")
        assert "[REDACTED]" in result

    def test_redacts_github_pat(self) -> None:
        result = redact_text("github_pat_11ABCDEFGH_ABCDEFGHIJKLMNOPQRSTUV")
        assert "[REDACTED]" in result

    def test_redacts_jwt_token(self) -> None:
        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        result = redact_text(f"token: {jwt}")
        assert "[REDACTED]" in result
        assert "eyJhbGciOiJIUzI1NiJ9" not in result

    def test_redacts_pem_private_key(self) -> None:
        result = redact_text("-----BEGIN RSA PRIVATE KEY-----\nMIIEow...")
        assert "[REDACTED]" in result

    def test_redacts_hex_token(self) -> None:
        hex_token = "a" * 40
        result = redact_text(f"hash: {hex_token}")
        assert "[REDACTED]" in result

    def test_redacts_key_value_assignment(self) -> None:
        result = redact_text("api_key=sk-supersecretvalue12345")
        assert "[REDACTED]" in result
        assert "supersecretvalue" not in result

    def test_leaves_clean_text_unchanged(self) -> None:
        clean = "Hello, this is a normal message."
        assert redact_text(clean) == clean

    def test_invokes_audit_callback(self) -> None:
        events: list[dict] = []
        from hermes_adapter.secret_guard import configure
        configure(audit_callback=lambda **kw: events.append(kw))
        try:
            redact_text("Bearer abc123xyz")
            assert len(events) >= 1
            assert events[0]["source"] == "text"
        finally:
            configure(audit_callback=None)


class TestIsSecretKey:
    @pytest.mark.parametrize("key", [
        "api_key", "api-key", "apikey", "API_KEY",
        "token", "secret", "password", "auth",
        "bearer", "credential", "private_key",
        "aws_secret_access_key",
    ])
    def test_detects_sensitive_keys(self, key: str) -> None:
        assert is_secret_key(key) is True

    @pytest.mark.parametrize("key", [
        "name", "description", "theme", "version",
        "provider", "model", "temperature",
    ])
    def test_allows_clean_keys(self, key: str) -> None:
        assert is_secret_key(key) is False


class TestIsSecretValue:
    def test_detects_bearer(self) -> None:
        assert is_secret_value("Bearer abc123") is True

    def test_detects_openai_key(self) -> None:
        assert is_secret_value("sk-abcdefghijklmnopqrstuvwx") is True

    def test_rejects_clean_value(self) -> None:
        assert is_secret_value("hello world") is False


class TestRedactDict:
    def test_redacts_sensitive_keys(self) -> None:
        data = {"api_key": "sk-secret123", "name": "test"}
        result = redact_dict(data)
        assert result["api_key"] == "[REDACTED]"
        assert result["name"] == "test"

    def test_redacts_secret_values(self) -> None:
        data = {"description": "Bearer abc123xyz token"}
        result = redact_dict(data)
        assert "[REDACTED]" in result["description"]

    def test_handles_nested_dicts(self) -> None:
        data = {"config": {"password": "hunter2"}}
        result = redact_dict(data)
        assert result["config"]["password"] == "[REDACTED]"

    def test_empty_value_becomes_empty_string(self) -> None:
        data = {"api_key": ""}
        result = redact_dict(data)
        assert result["api_key"] == ""


class TestValidateFilePath:
    def test_rejects_traversal(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="traversal"):
            validate_file_path(tmp_path / ".." / "etc" / "passwd", base_dir=tmp_path)

    def test_rejects_symlink(self, tmp_path: Path) -> None:
        target = tmp_path / "real.txt"
        target.write_text("x")
        link = tmp_path / "link.txt"
        link.symlink_to(target)
        with pytest.raises(ValueError, match="Symlink"):
            validate_file_path(link)

    def test_accepts_valid_path(self, tmp_path: Path) -> None:
        p = tmp_path / "data" / "file.txt"
        result = validate_file_path(p, base_dir=tmp_path)
        assert result is not None

    def test_enforces_base_dir(self, tmp_path: Path) -> None:
        other = Path("/tmp/outside_test")
        with pytest.raises(ValueError, match="outside"):
            validate_file_path(other, base_dir=tmp_path)


class TestCheckContentSize:
    def test_accepts_small_content(self) -> None:
        check_content_size("hello")  # should not raise

    def test_rejects_oversized_content(self) -> None:
        with pytest.raises(ValueError, match="exceeds limit"):
            check_content_size("x" * 100, max_bytes=10)

    def test_works_with_bytes(self) -> None:
        check_content_size(b"hello", max_bytes=100)

    def test_rejects_oversized_bytes(self) -> None:
        with pytest.raises(ValueError, match="exceeds limit"):
            check_content_size(b"x" * 100, max_bytes=10)
