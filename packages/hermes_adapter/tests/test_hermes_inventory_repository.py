from __future__ import annotations

import json
from pathlib import Path

from hermes_adapter.hermes_inventory_repository import HermesInventoryRepository


def test_inventory_reads_local_provider_model_skill_and_mcp(tmp_path: Path) -> None:
    home = tmp_path / ".hermes"
    home.mkdir()
    (home / ".env").write_text("OPENAI_API_KEY=secret\n", encoding="utf-8")
    (home / "config.yaml").write_text(
        """
model:
  provider: openai
  default: gpt-5.2
mcp_servers:
  fetch:
    command: uvx
    args: [mcp-server-fetch]
providers:
  custom:
    base_url: https://example.test/v1
fallback_providers:
  - provider: custom
    model: custom-fast
    base_url: https://example.test/v1
platform_toolsets:
  cli: [browser, file]
""",
        encoding="utf-8",
    )
    (home / "models_dev_cache.json").write_text(
        json.dumps({
            "openai": {
                "id": "openai",
                "name": "OpenAI",
                "env": ["OPENAI_API_KEY"],
                "models": {
                    "gpt-5.2": {
                        "id": "gpt-5.2",
                        "name": "GPT-5.2",
                        "reasoning": True,
                        "tool_call": True,
                        "limit": {"context": 400000, "output": 128000},
                    }
                },
            }
        }),
        encoding="utf-8",
    )
    skill_dir = home / "skills" / "software-development" / "tdd"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        """---
name: tdd
description: Test driven development
metadata:
  hermes:
    tags: [testing, code]
---
# TDD
""",
        encoding="utf-8",
    )

    repo = HermesInventoryRepository(home)
    summary = repo.summary()

    assert summary["provider_count"] == 2
    assert summary["model_count"] == 1
    assert summary["installed_skill_count"] == 1
    assert summary["mcp_server_count"] == 1
    assert summary["fallback_provider_count"] == 1
    assert repo.list_providers()[0]["id"] == "openai"
    assert repo.list_providers()[0]["configured"] is True
    assert repo.list_models()[0]["context_window"] == 400000
    assert repo.list_skills()[0]["tags"] == ["testing", "code"]
    assert repo.list_mcp_servers()[0]["id"] == "fetch"
    assert repo.list_fallback_providers()[0]["provider"] == "custom"
    assert repo.list_fallback_providers()[0]["model"] == "custom-fast"


def test_inventory_redacts_mcp_env_values(tmp_path: Path) -> None:
    home = tmp_path / ".hermes"
    home.mkdir()
    (home / "config.yaml").write_text(
        """
mcp_servers:
  github:
    command: npx
    args: ["@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: ghp_secretvalue
""",
        encoding="utf-8",
    )

    server = HermesInventoryRepository(home).list_mcp_servers()[0]

    assert server["env_keys"] == ["GITHUB_PERSONAL_ACCESS_TOKEN"]
    assert "ghp_secretvalue" not in json.dumps(server)


def test_inventory_can_enrich_toolsets_from_hermes_cli(tmp_path: Path, monkeypatch) -> None:
    home = tmp_path / ".hermes"
    home.mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake_hermes = bin_dir / "hermes"
    fake_hermes.write_text(
        """#!/bin/sh
set -eu
if [ "${1:-}" = "tools" ]; then
  printf '%s\n' '
Built-in toolsets (cli):
  + enabled  browser  Browser Automation
  - disabled  video  Video Analysis

MCP servers:
  github  all tools enabled
'
  exit 0
fi
exit 2
""",
        encoding="utf-8",
    )
    fake_hermes.chmod(0o755)
    monkeypatch.setenv("PATH", str(bin_dir))

    toolsets = HermesInventoryRepository(home, enable_cli_probe=True).list_toolsets()

    browser = next(item for item in toolsets if item["id"] == "browser")
    video = next(item for item in toolsets if item["id"] == "video")
    github = next(item for item in toolsets if item["id"] == "github:*")
    assert browser["enabled"] is True
    assert video["enabled"] is False
    assert github["kind"] == "mcp"
