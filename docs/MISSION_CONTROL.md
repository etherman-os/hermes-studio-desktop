# Mission Control

Mission Control is the default desktop surface for Hermes Desktop Studio.

It exists because a local Hermes install has more moving pieces than a chat box: local CLI availability, optional gateway reachability, provider/model config, skills, MCP servers, toolsets, approvals, runs, delegations, and long-running local processes.

## What It Shows

- adapter connection state
- backend mode and active backend
- Hermes local CLI and optional gateway reachability
- active provider/model
- recent Run Ledger records
- pending approvals
- managed Studio/Hermes processes
- recent delegations
- Hermes provider, model, skill, MCP, and toolset counts
- Hermes CLI command/flag discovery from `hermes --help` and `hermes chat --help`
- Hermes v0.13 checkpoint store status from `hermes checkpoints status`
- local run presets for implementation, review, debugging, design polish, browser verification, multi-agent orchestration, Kanban swarm planning, video generation, and Studio memory extraction

## Hermes Runtime Control

The default local mode runs Hermes directly through CLI and does not require gateway.

Mission Control's primary action is a local Hermes run. Presets prefill the New Run launcher with the appropriate Hermes skills, toolsets, checkpoint behavior, max-turn budget, and worktree/session flags. The adapter then maps those options to public `hermes chat --query` flags.

Hermes Arsenal extends this with Capability Recipes: users can select multiple installed Hermes skills plus enabled toolsets/MCP surfaces and launch a single checkpointed local run. This keeps the full local Hermes capability set usable from desktop without editing Hermes core.

Mission Control can also start the optional Hermes gateway bridge through the managed process template:

```bash
hermes gateway --accept-hooks run
```

The process is owned by Studio's Process Cockpit and can be inspected or stopped there. Studio does not modify Hermes core code. Gateway bridge mode is useful for richer API/SSE workflows and remote-style control, not as a requirement for local desktop use.

## Auto Fallback

When `HERMES_STUDIO_BACKEND=auto`, Studio tries local CLI first, then gateway, then Studio simulation. Mission Control must show the active backend and fallback reason clearly.

Local Hermes discovery still works in this state. Provider/model/skill/MCP/toolset inventory comes from the installed local Hermes files, and safe model/provider writes still use official Hermes CLI commands.

## Boundaries

- Do not hide mock or fallback state.
- Do not write to Hermes `state.db`.
- Do not edit Hermes config files directly.
- Use Hermes API or CLI surfaces for Hermes-owned actions.
- Keep Studio workflow state in Studio-owned `studio.db`.
