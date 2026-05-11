# Approval Center

Approval Center is a Studio-owned visibility, audit, and local decision layer for tool approval requests observed in run streams.

It does not bypass Hermes approval mechanisms, modify Hermes config, or write Hermes `state.db`. When the Hermes gateway exposes the local approval response route, Studio forwards approve/deny decisions to Hermes; otherwise it records the local decision for audit.

## Storage

Migration `6: persistent_approvals` creates:

- `approvals`
- `approval_events`

Approval records can link to:

- `run_id`
- `session_id`

Payloads are normalized and redacted before storage. Unknown or incomplete approval payloads are still recorded with `unknown` fields instead of breaking the run stream.

## Status and risk levels

Approval records carry a status field with supported values: `pending`, `approved`, `denied`, `expired`, `cancelled`, or `unknown`. Risk levels help surface high-stakes decisions: `low`, `medium`, `high`, `critical`, or `unknown`.

## API

All Approval Center calls are protected `/studio/*` calls:

- `GET /studio/approvals`
- `GET /studio/approvals/pending`
- `GET /studio/approvals/{approval_id}`
- `GET /studio/runs/{run_id}/approvals`
- `GET /studio/sessions/{session_id}/approvals`

The adapter also exposes decision routes:

- `POST /studio/approvals/{approval_id}/approve`
- `POST /studio/approvals/{approval_id}/deny`

Those routes update the Studio-owned approval record and try to notify Hermes at `/v1/approvals/{approval_id}/respond` when the gateway is reachable. The response includes `hermes_notified` so the UI can distinguish a local audit decision from a decision confirmed by Hermes.

The OpenAPI route parity test fails if these paths drift from `packages/protocol/openapi.yaml`.

## Event capture

When a run stream emits normalized Studio events — `approval.requested` or `approval.resolved` — the adapter records them in `studio.db`. Persistence failure logs a warning and may emit `adapter.warning`, but it must not break live SSE streaming.

## Frontend

The Approval Center UI supports a pending approval list and approval history. Filters let you narrow the view to pending items, approved items, denied items, or high-risk items. The detail panel shows the tool, command or action requested, risk level, reason, run and session links, request payload preview, status, and decision.

Users can approve or deny pending approvals directly from the UI. The activity rail and status bar display a pending approval count badge. Run Ledger includes an action to open approvals scoped to the selected run. Context Inspector shows related approvals for the selected run or session context.

The UI must always show whether Hermes received notification of the decision. A local-only decision is useful for Studio audit history but is not a claim that Hermes accepted the action.

## Security Rules

- Do not write approval data to Hermes `state.db`.
- Do not write Hermes config/profile files.
- Do not store secrets, tokens, API keys, auth headers, or passwords.
- Redact obvious secret-like values from approval payloads.
- Treat model/tool payloads as untrusted.
- Do not implement automatic approval, blanket approval, or approval bypass.

## Future Work

Future layers can add richer diff/evidence previews for risky tool approvals and tighter linking from Approval Center back into the exact run event timeline.
