# Studio Artifacts

Artifact Shelf stores persistent Studio-owned metadata for useful outputs from runs, sessions, cards, logs, tests, reports, markdown, JSON, screenshots, HTML source, and file references.

Artifacts live in Studio-owned `studio.db`. They are not Hermes Agent state, and Studio must never write them to Hermes `state.db`.

## Storage

Migration `5: persistent_artifacts` creates the `artifacts` and `artifact_events` tables. Migration `9: artifact_revisions` adds `artifact_revisions`. Migration `10: artifact_variants` adds `artifact_variant_groups` and `artifact_variants`. Artifact records can link to `run_id`, `session_id`, or `kanban_card_id`. File artifacts are references only — Studio stores path metadata and a display filename, not the file contents.

## Types

The following artifact types are supported: `markdown`, `text`, `log_snapshot`, `test_result`, `report`, `html`, `screenshot`, `file_reference`, `json`, and `unknown`.

## API

All artifact calls are protected `/studio/*` calls:

- `GET /studio/artifacts`
- `GET /studio/artifacts/{artifact_id}`
- `POST /studio/artifacts`
- `PATCH /studio/artifacts/{artifact_id}`
- `GET /studio/artifacts/{artifact_id}/revisions`
- `POST /studio/artifacts/{artifact_id}/revert`
- `GET /studio/artifacts/{artifact_id}/variant-groups`
- `POST /studio/artifacts/{artifact_id}/variant-groups`
- `POST /studio/artifact-variant-groups/{group_id}/variants`
- `POST /studio/artifact-variant-groups/{group_id}/apply`
- `POST /studio/artifacts/{artifact_id}/archive`
- `POST /studio/artifacts/{artifact_id}/browser-evidence`
- `POST /studio/artifacts/{artifact_id}/link-run`
- `POST /studio/artifacts/{artifact_id}/link-session`
- `POST /studio/artifacts/{artifact_id}/link-card`

The OpenAPI route parity test fails if these paths drift from `packages/protocol/openapi.yaml`.

## Security Rules

- Do not write artifact data to Hermes `state.db`.
- Do not store secrets, tokens, API keys, auth headers, or passwords.
- Redact obvious secret-like values from text artifacts.
- Keep text content small and bounded.
- Store file references as metadata only.
- Do not execute artifact HTML or scripts.
- Render HTML previews only after sanitizer removal of scripts, event-handler attributes, forms, nested iframes, objects, and `javascript:` URLs.
- Use sandboxed iframes without script permissions for inline previews.
- Browser evidence for stored HTML is materialized as a sanitized temporary file with JavaScript disabled. URL/file evidence runs with local Playwright against the referenced target.
- Variant content is treated exactly like artifact content: bounded, redacted, never executed directly, and only applied through a new artifact revision.
- Treat model output as untrusted; persistent artifact creation should come from structured user or app intent.

## Frontend

Artifact Shelf v1 supports listing and searching persisted artifacts, filtering by type, inspecting detail metadata and content, creating artifacts manually, and archiving them. You can create run summary, log snapshot, and markdown report artifacts from the Run Ledger, session summary artifacts from Sessions, and card summary artifacts from Board.

Inspect related run or session context through Context Inspector. HTML artifacts appear in a sanitized sandboxed inline preview. Edit HTML artifact source beside a live sanitized preview and persist revisions through `PATCH /studio/artifacts/{id}`. Click an element inside the sanitized HTML preview to capture a CSS selector for targeted Hermes edits.

Create persisted A/B Variant Studio groups with a baseline source snapshot. Save draft or generated variants with label, rationale, score, and optional preview content. Apply a winning variant back to the source artifact while recording a new revision. Request A/B visual variants through Hermes with the Studio variant group ID in the handoff prompt.

Capture a local Playwright browser evidence artifact with screenshot path, console and runtime findings, basic accessibility and overflow checks, and artifact links. Create a Hermes browser-check request when you want the agent to interpret or fix the evidence. Request a video production brief from any artifact using Hermes video or image generation skills and toolsets. Extract a reusable Design DNA profile proposal from an artifact for future visual edits.

Inspect artifact history events, revision snapshots, and revert an artifact to a previous Studio-owned version.

Markdown renders using safe React text nodes. JSON is pretty printed. Logs and source text remain visible as monospaced text. File references show path metadata and an Open file placeholder.

Context Inspector can show artifacts linked to a selected run or session. This relationship is read-only from the context surface — artifact writes still go only through `/studio/artifacts/*`.

## Future Work

Future layers can add artifact extraction from real run outputs, richer screenshot diffing and viewport matrices, test result parsing, visual diff references for artifact revisions, and richer card, run, and session artifact relationship views. Direct screenshot capture from preview frames and automatic structured import of Hermes-generated variant JSON into existing variant groups are also possible. Those layers should keep the same Studio-owned storage boundary.
