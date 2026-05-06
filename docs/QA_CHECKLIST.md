# QA Checklist — Hermes Desktop Studio

Manual smoke test checklist for verifying the desktop studio works correctly.

## Adapter Connection

- [ ] `pnpm run dev:adapter` starts adapter on `127.0.0.1:39191`
- [ ] `GET /health` returns `{"status":"healthy",...}`
- [ ] `GET /studio/health` returns same shape
- [ ] Desktop app shows green "Adapter: Connected" in status bar
- [ ] Killing adapter shows red "Adapter: Disconnected" in status bar
- [ ] App does not crash when adapter is unavailable

## Chat

- [ ] Typing in composer and pressing Enter sends prompt
- [ ] `POST /studio/runs` returns `run_id`
- [ ] `assistant.delta` text appears progressively in chat
- [ ] `tool.started` shows running tool chip
- [ ] `tool.completed` shows completed tool chip with duration
- [ ] `run.completed` stops streaming, typing indicator disappears
- [ ] Stop button (red) appears during streaming
- [ ] Stop button calls `POST /studio/runs/{id}/stop`
- [ ] `run.cancelled` event stops the stream cleanly
- [ ] No duplicate messages after `run.completed`
- [ ] Composer shows warning border when adapter is disconnected
- [ ] Sending message when adapter offline shows local fallback message

## Tabs

- [ ] Chat tab renders chat surface
- [ ] Kanban tab renders 5-column board with mock cards
- [ ] Artifacts tab shows placeholder
- [ ] Sessions tab shows placeholder
- [ ] Switching tabs during streaming does not break the stream

## Sidebar

- [ ] Sessions section lists sessions from adapter
- [ ] Clicking a session sets it as active
- [ ] Profiles section shows profile list
- [ ] Search section shows search input
- [ ] Theme Gallery shows 5 theme cards
- [ ] Clicking a theme card switches theme
- [ ] Theme switch changes colors, labels, and icons

## Right Panel

- [ ] Tools section shows tool list
- [ ] Memory section shows mock memory entries
- [ ] Inspector section shows model info

## Bottom Panel

- [ ] Activity tab shows recent activity
- [ ] Logs tab shows log lines
- [ ] Tool Events tab shows placeholder

## Command Palette

- [ ] `Ctrl+K` opens command palette
- [ ] Typing filters commands
- [ ] Arrow keys navigate command list
- [ ] Enter executes selected command
- [ ] Escape closes palette
- [ ] "Switch Theme" command opens theme gallery
- [ ] "Toggle Right Panel" hides/shows right panel
- [ ] "Toggle Bottom Panel" hides/shows bottom panel

## Theming

- [ ] Default Dark theme applies on startup
- [ ] Switching to Minecraft Overworld changes all colors and labels
- [ ] Switching to Minimal Light changes to light theme
- [ ] Theme persists during session (not across restarts yet)
- [ ] Theme switch does not break streaming if active

## Status Bar

- [ ] Shows active profile name
- [ ] Shows working directory path
- [ ] Shows model name
- [ ] Shows adapter connection status (green/red dot)
- [ ] Shows active theme name
- [ ] Shows version number

## Edge Cases

- [ ] Rapid prompt sending does not break state
- [ ] Opening command palette during streaming pauses input
- [ ] Closing adapter mid-stream shows error in chat
- [ ] Restarting adapter reconnects on next health check
- [ ] Empty prompt does not send

## Logs

- [ ] Bottom Logs tab shows log lines from adapter
- [ ] Log lines are color-coded by level (info/warn/error)
- [ ] Source selector works (agent.log, errors.log, gateway.log)
- [ ] Empty state when logs unavailable
- [ ] Secrets/API keys are redacted from log output
- [ ] Log stream auto-scrolls (or shows new lines)

## Profiles

- [ ] Left sidebar Profiles section shows profile list
- [ ] Active profile is highlighted
- [ ] Profile count is shown
- [ ] Clicking a profile shows "switching not implemented" notice
- [ ] Status bar shows active profile name
- [ ] Empty state when no profiles found
