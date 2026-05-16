"""HoldTheGoblin read-only status routes for Studio adapter.

Exposes GET /studio/htg/status — delegates to htg_status.probe_htg_status().
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from hermes_adapter.htg_status import probe_htg_status
from hermes_adapter.security import require_token

router = APIRouter(prefix="/studio")


@router.get("/htg/status")
async def get_htg_status(_token: None = Depends(require_token)) -> dict[str, Any]:
    """Return HoldTheGoblin read-only status: availability, project info, events.

    Calls only read-only/safe HTG tools:
    - doctor: project detection and scanner configuration
    - events --limit 20: recent event log
    - checkpoint_list: existing checkpoints (read-only)
    - config_validate: HTG config schema validation

    Does NOT call (hard rule for this pilot):
    - checkpoint_create / checkpoint_rollback
    - deploy_run
    - verify
    - readiness with runVerify=true
    - policy_evaluate / risk_assess
    """
    status = await probe_htg_status()
    return {"htg": status, "summary": {"available": status.get("available", False)}}
