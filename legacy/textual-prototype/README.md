# Legacy Textual Prototype

This directory contains the original terminal/TUI prototype of Hermes Local Studio, built with [Textual](https://textual.textualize.io/) and Rich.

## Why is this here?

The first prototype was a terminal-based Textual TUI. This served as a research and validation prototype, but the product direction has changed to a **Tauri v2 + React desktop workbench**.

The Textual code is preserved here as reference for:
- Adapter integration patterns
- Event handling and SSE streaming logic
- Theme TOML loading and inheritance design
- Widget interaction patterns

## What changed?

See `docs/ADR-0001-desktop-first.md` for the full decision record.

**Key point:** The main product is no longer a terminal TUI. It is a desktop workbench similar to VS Code or Warp. Terminal mode may return as an alt-panel or fallback in the future.

## Can I still run this?

The prototype may still work if you install the Python dependencies and run the adapter. However, it is not maintained and will not receive updates. All new development happens under `apps/desktop-studio/`.
