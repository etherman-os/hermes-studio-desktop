# Theme System

## Overview

The theme system is **generic and semantic-slot-based**. It supports arbitrary concept packs — Minecraft, Minions, Lord of the Rings, Cyberpunk, Minimal, Anime, or anything users create. **No concept is hardcoded into the core application.**

The core app uses stable semantic keys (`profiles`, `sessions`, `chat`, `kanban`, `tools`, `memory`, `logs`, `activity`, `inspector`, `command_palette`). Each concept pack maps these semantic keys to its own visual language, labels, icons, and terminology.

## Concepts

The theme system is split into three layers:

| Layer | What it changes | Code required? |
|-------|-----------------|----------------|
| **Theme pack** | Colors, icons, borders, text labels, panel appearance | No |
| **Layout pack** | Left/right panel widths, hidden/visible components, density modes | No |
| **Widget plugin** | New panels or custom visual components | Later |

In MVP, only Theme pack and Layout pack are supported.

## Semantic Slot System

The core application does not use concept-specific terminology. It uses stable semantic keys:

| Semantic Key | Purpose |
|-------------|---------|
| `profiles` | User profile / world selection |
| `sessions` | Conversation session list |
| `chat` | Main chat / transcript area |
| `kanban` | Task board |
| `tools` | Active tools and capabilities |
| `memory` | Agent memory and artifacts |
| `logs` | Log output |
| `activity` | Background activity and running tasks |
| `inspector` | Detail inspector panel |
| `command_palette` | Command palette / quick actions |

Concept packs override the **display labels** for these keys. Examples:

| Semantic Key | Default | Minecraft | LOTR | Minions |
|-------------|---------|-----------|------|---------|
| `profiles` | Profiles | Worlds | Realms | Villains |
| `sessions` | Sessions | Ender Chest | Journeys | Missions |
| `tools` | Tools | Inventory | Artifacts | Gadgets |
| `kanban` | Kanban | Task Board | Quest Board | Master Plan |
| `command_palette` | Command Palette | Command Block | Spellbook | Blueprint |

These are **examples only**. The system is not limited to these concepts.

## Override Order

1. Built-in base theme
2. Selected theme pack
3. Selected layout pack
4. Profile override (`$HERMES_HOME/ui-shell/overrides.toml`)
5. Workspace override (`.hermes-shell.toml`)
6. Runtime ephemeral override (`:theme set` or settings panel)

## Theme Pack Format (TOML)

Below is an example using the Minecraft Overworld concept pack. This is **one example** — the same format applies to any concept pack.

```toml
[meta]
id = "minecraft-overworld"
name = "Minecraft Overworld"
version = "0.1.0"
author = "community"
extends = "default-dark"
description = "..."

[compat]
shell_api = "^1.0"
adapter_api = "^1.0"
min_hermes = "0.11.0"

[palette]
bg = "#1a1d14"
surface = "#2f3b1f"
text = "#eef6d2"
accent = "#7cb342"

[borders]
style = "blocky"
horizontal = "█"
vertical = "█"

[icons]
profile = "🌍"
session = "🧭"
tools = "⛏"

[labels]
profiles = "Dünyalar"
sessions = "Ender Chest"

[chat]
assistant_prefix = "🧙 Hermes"
user_prefix = "🧑 Oyuncu"
tool_prefix = "⛏ Araç"
```

## Layout Pack Format (TOML)

```toml
[layout]
mode = "triple-pane"
left_width = 22
right_width = 26
bottom_height = 4
show_logs_panel = true
show_memory_panel = true
show_tool_activity = true
message_style = "stacked-blocks"
tool_progress_style = "chips"

[panels]
left = ["profiles", "sessions", "themes"]
center = ["chat", "composer"]
right = ["model", "tools", "memory"]
bottom = ["logs", "tool_activity"]
```

## Assets

Each theme pack should include:
- `preview.txt` — ASCII/ANSI preview for theme browser
- (Optional) `screenshot.ansi` or `palette.png`

## Hermes Skin Import

Hermes YAML skins can be imported with a mapping:

| Hermes field | Shell field |
|--------------|-------------|
| `colors.response_border` | `palette.border` |
| `colors.status_bar_bg` | `palette.status_bg` |
| `branding.response_label` | `chat.assistant_prefix` |
| `tool_emojis.*` | `icons.*` |
| `banner_logo` | `assets.banner` |

## Theme API

Theme management is available through the `/studio/themes/*` endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/studio/themes` | GET | List all available themes |
| `/studio/themes/active` | GET | Get the currently active theme |
| `/studio/themes/{theme_id}` | GET | Get a specific theme by ID |
| `/studio/themes/activate` | POST | Activate a theme (body: `{"theme_id": "..."}`) |
| `/studio/themes/reload` | POST | Reload themes from disk |

Theme activation persists in `~/.config/hermes-desktop-studio/config.json`.

Themes are discovered from:
1. Built-in themes in `themes/` directory
2. User-installed themes in the platform data directory
3. Workspace-local themes in `.hermes-shell/`
