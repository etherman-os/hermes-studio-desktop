# Design Canvas

Design Canvas is the Studio handoff surface for visual production work.

It accepts design inputs, stores them as Studio-owned artifacts, and can hand the imported context to Hermes with design-oriented skills and toolsets selected from the local Hermes inventory.

## Import Types

Design Canvas supports HTML or React output pasted as text, screenshot notes, local URLs or file paths, Figma URLs, JSON design specs, and markdown briefs. Imports are stored through `/studio/artifacts` in Studio-owned `studio.db` — they are not written to Hermes `state.db`.

## Hermes Handoff

`Import + Generate` creates the artifact, switches to Chat, and sends Hermes a structured prompt containing:

- imported artifact id/title/type
- source kind
- local file or URL reference when present
- bounded source excerpt when present
- production brief
- Figma-specific instruction to use a configured local Figma MCP/tool when available, otherwise fall back to browser/vision inspection
- selected workspace path
- `mode: design`
- locally discovered design skills and toolsets

The run goes through the same `/studio/runs` adapter route as any other Hermes run. In default local mode, Studio calls the installed Hermes CLI with selected provider/model/skills/toolsets/checkpoint options. In gateway mode, HermesBackend forwards optional context fields to Hermes when supported and retries with the minimal payload if the installed gateway rejects them.

## Preview Rules

HTML design artifacts are shown in sandboxed iframes without script permissions. Artifact Studio can also show the HTML source beside a sanitized preview, persist source edits through Studio-owned artifact storage, and capture CSS selectors from preview clicks for Hermes-targeted visual edits. Model output remains untrusted.

## Future Layers

Future layers can add screenshot OCR/vision extraction, Figma MCP metadata extraction, visual diff thumbnails for artifact variant comparison, and checkpoint-backed design revisions.
