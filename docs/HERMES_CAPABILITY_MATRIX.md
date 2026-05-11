# Hermes Capability Matrix

This is the working execution map for turning Hermes Desktop Studio into a complete local-first studio on top of Hermes Agent. The rule is simple: every Hermes capability must have a clear Studio contract, a UI surface, a safe mutation boundary, and verification coverage before the final UI/UX redesign.

## Execution Loop

Map the Hermes capability and decide the source of truth. Add or adjust `/studio/*` adapter contract. Update OpenAPI and frontend types or store. Add the smallest useful UI surface. Add route, store, and unit tests and run checks. Record remaining gaps here before moving to the next slice.

## Source Of Truth

| Area | Source Of Truth | Studio Storage | Mutation Rule |
| --- | --- | --- | --- |
| Provider/model/fallback config | Hermes config/API/CLI | none | Use official Hermes CLI/API only |
| Profiles | Hermes profile system | none | Read-only unless Hermes exposes safe switch path |
| Sessions | Hermes state/session history | linked metadata only | Read Hermes, do not mutate `state.db` |
| Runs | Hermes execution plus Studio run ledger | run ledger/events | Studio starts/streams runs through adapter |
| Kanban | Studio `studio.db` for Studio board | full board state | Studio-owned, can link Hermes run/session IDs |
| Artifacts/revisions/variants | Studio `studio.db` | full artifact state | Studio-owned, bounded/redacted content |
| Approvals | Hermes live stream plus Studio history | approval visibility/history | Resolve through verified Hermes path when available |
| Checkpoints | Hermes checkpoint store | metadata only | Use Hermes checkpoint commands/API |
| Skills/tools/MCP | Hermes install/config/catalog | none | Read inventory; mutate only through Hermes commands |
| Browser evidence | Studio artifact workflow | screenshot/report artifacts | Local tool execution via adapter, sanitized inputs |

## Capability Status

| Capability | Current Studio Coverage | Next Work |
| --- | --- | --- |
| Local Hermes detection | health, inventory, CLI capabilities, doctor diagnostics, browser cache diagnostics, release/update check | deeper per-provider auth remediation flows |
| Multi-provider model catalog | provider/model selector, model list, active config | provider detail drawer, credential status hints |
| Fallback providers | read-only fallback chain in inventory | safe add/remove once Hermes exposes non-interactive path |
| Profiles | list active/profile inventory, safe CLI-backed profile switch, metadata-preserving UI state | profile creation/editing only if Hermes exposes a safe path |
| Runs | start, stream, stop, ledger, artifact extraction, extended Hermes run option forwarding, run compare | run replay and stronger cancellation states |
| Skills | inventory, recipe launcher, check/update/install through Hermes CLI | skill source detail and registry browse/search |
| Toolsets/MCP | inventory, recipe launcher, MCP server probes, Hermes CLI-backed toolset enable/disable | richer MCP tool inventory and per-tool selection |
| Kanban | persistent board, run/session/artifact links, thumbnails | dependency graph and card-to-run automation |
| Artifacts | shelf, HTML preview, visual edit prompts, variants, revision diff | richer visual diff and artifact marketplace |
| Browser-in-loop | browser evidence report/screenshot | full local UI test runner with pass/fail gates |
| Design Canvas | import artifact and handoff prompt | image/file import and canvas edit model |
| Context Inspector | workspace/session/run/artifact context | context budget controls and pinning |
| Approvals | pending/history and decisions | visual diff approval flows |
| Checkpoints | status, timeline surfaces, rollback-plan handoff, Hermes checkpoint-store prune | direct restore only if Hermes exposes a non-interactive rollback API |
| Cron/hooks/webhooks | partial panels | harden contracts and UX |
| ACP/dashboard | detected via CLI | decide whether to launch/manage from Studio |

## Redesign Gate

The full UI/UX redesign should start only when the capability matrix rows above have real adapter, store, and UI coverage or are explicitly deferred, no UI button depends on a fake or undocumented Hermes behavior, `/studio/*` OpenAPI matches implemented routes, core checks pass including `pnpm run check:types`, frontend tests, Python checks, and Tauri `cargo check`, and browser smoke tooling is documented so agents do not reinstall browsers repeatedly.
