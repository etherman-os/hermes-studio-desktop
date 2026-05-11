"""Abstract base class for studio backends."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from hermes_adapter.artifact_repository import ArtifactRepository
from hermes_adapter.kanban_repository import KanbanRepository
from hermes_adapter.run_ledger_repository import RunLedgerRepository


class StudioBackend(ABC):
    """Abstract backend interface for Hermes Desktop Studio.

    Implementations:
    - MockBackend: fake in-memory data for development
    - HermesBackend: real Hermes Agent API integration
    """

    @abstractmethod
    async def health(self) -> dict[str, Any]:
        """Return backend health status."""
        ...

    @abstractmethod
    async def bootstrap(self) -> dict[str, Any]:
        """Return initial bootstrap payload for the UI."""
        ...

    @abstractmethod
    async def list_profiles(self) -> list[dict[str, Any]]:
        """Return available profiles."""
        ...

    async def get_active_profile(self) -> dict[str, Any] | None:
        """Return the active profile metadata. Override in subclasses."""
        return None

    async def activate_profile(self, profile_id: str) -> dict[str, Any]:
        """Activate a profile. Returns {status, message}."""
        return {"status": "not_implemented", "message": "Profile switching not yet implemented"}

    async def respond_to_approval(self, approval_id: str, decision: str) -> dict[str, Any]:
        """Respond to an approval request. Returns {status, approval_id, decision}."""
        return {"status": "not_implemented", "message": "Approval response not yet implemented"}

    @abstractmethod
    async def list_sessions(self) -> dict[str, Any]:
        """Return session list with total count."""
        ...

    @abstractmethod
    async def get_session(self, session_id: str) -> dict[str, Any]:
        """Return session detail with transcript preview."""
        ...

    @abstractmethod
    async def start_run(
        self,
        session_id: str,
        prompt: str,
        profile: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Start a new run. Returns {run_id, status}."""
        ...

    @abstractmethod
    def stream_run_events(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        """Yield normalized StudioEvent envelopes for a run."""
        ...

    @abstractmethod
    async def stop_run(self, run_id: str) -> dict[str, Any]:
        """Stop an active run. Returns {run_id, status}."""
        ...

    async def get_recent_runs(self, limit: int = 50) -> dict[str, Any]:
        """Return recent Studio-owned run ledger records."""
        return RunLedgerRepository().get_recent_runs(limit=limit)

    async def get_run(self, run_id: str) -> dict[str, Any]:
        """Return a Studio-owned run ledger record."""
        return RunLedgerRepository().get_run(run_id)

    async def get_run_ledger(self, run_id: str) -> dict[str, Any]:
        """Return a Studio-owned run ledger record and its persisted event timeline."""
        return RunLedgerRepository().get_ledger(run_id)

    @abstractmethod
    async def get_logs(self, source: str | None = None, tail: int = 100) -> dict[str, Any]:
        """Return recent log lines."""
        ...

    @abstractmethod
    def stream_logs(self, source: str | None = None) -> AsyncIterator[dict[str, Any]]:
        """Yield normalized log.line StudioEvent envelopes."""
        ...

    @abstractmethod
    async def list_themes(self) -> dict[str, Any]:
        """Return installed themes and active theme ID."""
        ...

    async def get_theme(self, theme_id: str) -> dict[str, Any]:
        """Return a specific theme by ID. Override in subclasses."""
        raise ValueError(f"Theme '{theme_id}' not found")

    async def get_active_theme(self) -> dict[str, Any]:
        """Return the active theme data. Override in subclasses."""
        return {}

    @abstractmethod
    async def activate_theme(self, theme_id: str) -> dict[str, Any]:
        """Activate a theme. Returns theme info."""
        ...

    async def reload_themes(self) -> dict[str, Any]:
        """Reload theme packs from disk. Override in subclasses."""
        return {"reloaded": False, "count": 0}

    @abstractmethod
    async def get_config(self) -> dict[str, Any]:
        """Return current configuration."""
        ...

    async def get_model_config(self) -> dict[str, Any]:
        """Return normalized model/provider config. Override in subclasses."""
        return {
            "provider": "unknown",
            "model": "unknown",
            "api_key_configured": False,
            "config_source": "unavailable",
            "warnings": ["Model config not available in this backend"],
        }

    async def list_available_models(self) -> list[dict[str, Any]]:
        """Return available model options with provider metadata."""
        config = await self.get_model_config()
        models = config.get("available_models", [])
        return models if isinstance(models, list) else []

    async def patch_model_config(self, updates: dict[str, Any]) -> dict[str, Any]:
        """Safely update model/provider config if the backend owns a write path."""
        return {
            "status": "not_implemented",
            "message": "Model config mutation is not supported by this backend",
            "updates": updates,
        }

    @abstractmethod
    async def patch_config(self, key: str, value: Any) -> dict[str, Any]:
        """Update a config key. Returns updated config."""
        ...

    async def get_kanban_boards(self) -> dict[str, Any]:
        """Return persistent Studio-owned Kanban board summaries."""
        return {"boards": KanbanRepository().get_boards()}

    async def get_default_kanban_board(self) -> dict[str, Any]:
        """Return the persistent default Studio-owned Kanban board."""
        return KanbanRepository().get_default_board()

    async def get_kanban_board(self, board_id: str) -> dict[str, Any]:
        """Return a persistent Studio-owned Kanban board by ID."""
        return KanbanRepository().get_board(board_id)

    async def create_kanban_card(self, input_data: dict[str, Any]) -> dict[str, Any]:
        """Create a persistent Studio-owned Kanban card."""
        return KanbanRepository().create_card(input_data)

    async def update_kanban_card(self, card_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
        """Update a persistent Studio-owned Kanban card."""
        return KanbanRepository().update_card(card_id, input_data)

    async def move_kanban_card(self, card_id: str, column_id: str, position: int) -> dict[str, Any]:
        """Move a persistent Studio-owned Kanban card."""
        return KanbanRepository().move_card(card_id, column_id, position)

    async def archive_kanban_card(self, card_id: str) -> dict[str, Any]:
        """Archive a persistent Studio-owned Kanban card."""
        return KanbanRepository().archive_card(card_id)

    async def link_kanban_card_to_session(self, card_id: str, session_id: str) -> dict[str, Any]:
        """Link a persistent Studio-owned Kanban card to a Hermes session ID."""
        return KanbanRepository().link_card_to_session(card_id, session_id)

    async def link_kanban_card_to_run(self, card_id: str, run_id: str) -> dict[str, Any]:
        """Link a persistent Studio-owned Kanban card to a Hermes run ID."""
        return KanbanRepository().link_card_to_run(card_id, run_id)

    async def list_artifacts(self, filters: dict[str, Any]) -> dict[str, Any]:
        """Return persistent Studio-owned artifact summaries."""
        return ArtifactRepository().list_artifacts(**filters)

    async def get_artifact(self, artifact_id: str) -> dict[str, Any]:
        """Return a persistent Studio-owned artifact detail."""
        return ArtifactRepository().get_artifact(artifact_id)

    async def create_artifact(self, input_data: dict[str, Any]) -> dict[str, Any]:
        """Create a persistent Studio-owned artifact."""
        return ArtifactRepository().create_artifact(input_data)

    async def update_artifact(self, artifact_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
        """Update a persistent Studio-owned artifact."""
        return ArtifactRepository().update_artifact(artifact_id, input_data)

    async def list_artifact_revisions(self, artifact_id: str, *, include_content: bool = False) -> dict[str, Any]:
        """Return Studio-owned artifact revision history."""
        return ArtifactRepository().list_revisions(artifact_id, include_content=include_content)

    async def revert_artifact(self, artifact_id: str, version: int) -> dict[str, Any]:
        """Revert a Studio-owned artifact to a stored revision."""
        return ArtifactRepository().revert_artifact(artifact_id, version)

    async def list_artifact_variant_groups(self, artifact_id: str) -> dict[str, Any]:
        """Return Studio-owned variant groups for an artifact."""
        return ArtifactRepository().list_variant_groups(artifact_id)

    async def create_artifact_variant_group(self, artifact_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
        """Create a Studio-owned A/B variant group for an artifact."""
        return ArtifactRepository().create_variant_group(artifact_id, input_data)

    async def add_artifact_variant(self, group_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
        """Add a Studio-owned variant to an artifact variant group."""
        return ArtifactRepository().add_variant(group_id, input_data)

    async def apply_artifact_variant(self, group_id: str, variant_id: str) -> dict[str, Any]:
        """Apply a Studio-owned variant to its source artifact."""
        return ArtifactRepository().apply_variant(group_id, variant_id)

    async def archive_artifact(self, artifact_id: str) -> dict[str, Any]:
        """Archive a persistent Studio-owned artifact."""
        return ArtifactRepository().archive_artifact(artifact_id)

    async def link_artifact_to_run(self, artifact_id: str, run_id: str) -> dict[str, Any]:
        """Link a persistent Studio-owned artifact to a Hermes run ID."""
        return ArtifactRepository().link_artifact_to_run(artifact_id, run_id)

    async def link_artifact_to_session(self, artifact_id: str, session_id: str) -> dict[str, Any]:
        """Link a persistent Studio-owned artifact to a Hermes session ID."""
        return ArtifactRepository().link_artifact_to_session(artifact_id, session_id)

    async def link_artifact_to_card(self, artifact_id: str, card_id: str) -> dict[str, Any]:
        """Link a persistent Studio-owned artifact to a Studio Kanban card ID."""
        return ArtifactRepository().link_artifact_to_card(artifact_id, card_id)
