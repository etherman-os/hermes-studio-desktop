# Theme Packs

Theme packs (concept packs) are the core theming system of Hermes Desktop Studio.
They allow users to completely change the visual language of the app — not just colors, but labels, icons, panel names, and terminology.

## What Is a Theme Pack?

A theme pack is a directory containing a `theme.toml` file. It can override:

- Colors (palette)
- Typography (font sizes, weights)
- Borders (style, radius)
- Icons (emoji/glyph per semantic slot)
- Labels (display text per semantic slot)
- Empty state messages
- Onboarding copy
- Kanban styling
- Message styles
- Accessibility defaults
- Decorative assets

## Semantic Slots

The core app uses stable semantic keys. Themes provide the user-visible text:

| Semantic Key | Default | Minecraft | Minions | LOTR |
|-------------|---------|-----------|---------|------|
| `profiles` | Profiles | Worlds | Villains | Realms |
| `sessions` | Sessions | Ender Chest | Missions | Journeys |
| `chat` | Chat | Crafting Table | Briefing Room | Council |
| `kanban` | Kanban | Task Board | Master Plan | Quest Board |
| `tools` | Tools | Inventory | Gadgets | Weapons |
| `memory` | Memory | Chest | Vault | Archives |
| `logs` | Logs | Server Logs | Surveillance | Palantír |
| `command_palette` | Command Palette | Command Block | Blueprint | Spellbook |

No concept is hardcoded into the core app. Components use semantic slots internally.

## Theme Pack Format

```toml
[meta]
id = "my-theme"
name = "My Theme"
version = "1.0.0"
author = "me"
description = "A custom theme"
extends = "default-dark"  # optional inheritance

[palette]
bg = "#0f1117"
surface = "#161b22"
accent = "#58a6ff"
# ... more colors

[icons]
profile = "👤"
session = "💬"
tools = "🔧"
# ... more icons

[labels]
profiles = "Profiles"
sessions = "Sessions"
tools = "Tools"
# ... more labels

[empty_states]
sessions = "No sessions yet"
chat = "Start a conversation"

[kanban]
card_density = "comfortable"

[message_styles]
assistant = "bubble"
user = "compact-card"

[accessibility]
high_contrast = false
font_scale = 1.0
```

## Inheritance

Themes can extend other themes:

```toml
[meta]
id = "my-custom-dark"
extends = "default-dark"

[palette]
accent = "#ff6600"  # only override accent
```

Rules:
- Base theme loads first
- Child overrides only provided fields
- Missing fields fall back to base
- Invalid `extends` produces warning, falls back to `default-dark`

## Search Paths

Themes are discovered from:

1. **Built-in**: `themes/` directory in the repo
2. **User**: `~/.config/hermes-desktop-studio/themes/` (or `HERMES_STUDIO_THEMES_DIR`)

Each theme must be a directory containing `theme.toml`.

## Activation

- Active theme persists in `~/.config/hermes-desktop-studio/config.json`
- Does NOT write to Hermes `config.yaml`
- Theme activation is instant via CSS variable swap
- Theme activation also updates the animated ThemeWorld companion and ambient motifs through semantic world classes (`studio`, `block`, `archive`, `lab`, `paper`).

## Creating a Custom Theme

1. Create a directory: `~/.config/hermes-desktop-studio/themes/my-theme/`
2. Add `theme.toml` with your overrides
3. Restart the adapter or use "Reload Themes" in the UI
4. Select your theme from the Theme Gallery

## Built-in Example Themes

| Theme | Description |
|-------|-------------|
| `default-dark` | Professional dark theme with blue accent |
| `minimal-light` | Clean light theme for bright environments |
| `minecraft-overworld` | Grass and stone tones (parody example) |
| `example-minions` | Yellow and blue villain theme (parody example) |
| `example-lotr` | Middle-earth earth and gold tones (parody example) |

All example themes use simple emojis and labels only. No copyrighted assets.

## Safety

- Theme packs are data-only (TOML)
- No executable code in theme packs
- No JavaScript, Python, or shell scripts
- Invalid themes produce warnings, not crashes
- Theme validation runs on load
