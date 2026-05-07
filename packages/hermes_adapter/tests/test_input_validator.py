"""Tests for the input_validator module."""

from __future__ import annotations

from pathlib import Path

import pytest

from hermes_adapter.input_validator import (
    ValidationError,
    check_request_size,
    sanitize_file_path,
    validate_id,
    validate_json_payload,
    validate_optional_string,
    validate_string_field,
)


class TestValidateId:
    def test_accepts_valid_id(self) -> None:
        assert validate_id("abc-123_def.test") == "abc-123_def.test"

    def test_rejects_empty(self) -> None:
        with pytest.raises(ValidationError, match="non-empty"):
            validate_id("")

    def test_rejects_too_long(self) -> None:
        with pytest.raises(ValidationError, match="max length"):
            validate_id("a" * 300)

    def test_rejects_special_chars(self) -> None:
        with pytest.raises(ValidationError, match="invalid characters"):
            validate_id("hello world!")

    def test_accepts_slashes_and_colons(self) -> None:
        assert validate_id("run/123:sub") == "run/123:sub"


class TestValidateStringField:
    def test_accepts_normal_string(self) -> None:
        assert validate_string_field("hello") == "hello"

    def test_rejects_non_string(self) -> None:
        with pytest.raises(ValidationError, match="must be a string"):
            validate_string_field(123)  # type: ignore[arg-type]

    def test_rejects_too_long(self) -> None:
        with pytest.raises(ValidationError, match="max length"):
            validate_string_field("a" * 200_000)


class TestValidateOptionalString:
    def test_returns_none_for_none(self) -> None:
        assert validate_optional_string(None) is None

    def test_validates_string(self) -> None:
        assert validate_optional_string("hello") == "hello"


class TestSanitizeFilePath:
    def test_rejects_empty(self) -> None:
        with pytest.raises(ValidationError, match="non-empty"):
            sanitize_file_path("")

    def test_rejects_null_byte(self) -> None:
        with pytest.raises(ValidationError, match="null byte"):
            sanitize_file_path("/path/\x00file")

    def test_rejects_traversal(self) -> None:
        with pytest.raises(ValidationError, match="traversal"):
            sanitize_file_path("/tmp/../etc/passwd")

    def test_accepts_clean_path(self) -> None:
        result = sanitize_file_path("/tmp/test.txt")
        assert result == Path("/tmp/test.txt")

    def test_enforces_base_dir(self, tmp_path: Path) -> None:
        with pytest.raises(ValidationError, match="outside"):
            sanitize_file_path("/etc/passwd", base_dir=tmp_path)

    def test_accepts_path_inside_base(self, tmp_path: Path) -> None:
        result = sanitize_file_path(str(tmp_path / "file.txt"), base_dir=tmp_path)
        assert result == tmp_path / "file.txt"


class TestValidateJsonPayload:
    def test_rejects_non_dict(self) -> None:
        with pytest.raises(ValidationError, match="JSON object"):
            validate_json_payload("not a dict")  # type: ignore[arg-type]

    def test_checks_required_keys(self) -> None:
        with pytest.raises(ValidationError, match="Missing required keys"):
            validate_json_payload({"a": 1}, required_keys={"a", "b"})

    def test_checks_optional_keys(self) -> None:
        with pytest.raises(ValidationError, match="Unexpected keys"):
            validate_json_payload(
                {"a": 1, "bad": 2},
                required_keys={"a"},
                optional_keys={"b"},
            )

    def test_accepts_valid_payload(self) -> None:
        result = validate_json_payload(
            {"a": 1, "b": "hello"},
            required_keys={"a"},
            optional_keys={"b"},
        )
        assert result == {"a": 1, "b": "hello"}

    def test_rejects_oversized_payload(self) -> None:
        with pytest.raises(ValidationError, match="exceeds limit"):
            validate_json_payload({"data": "x" * 100}, max_total_bytes=10)


class TestCheckRequestSize:
    def test_accepts_small_body(self) -> None:
        check_request_size(b"hello")

    def test_rejects_large_body(self) -> None:
        with pytest.raises(ValidationError, match="exceeds limit"):
            check_request_size(b"x" * 100, max_bytes=10)
