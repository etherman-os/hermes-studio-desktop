# Hermes model/provider integration

## What is read

| File | Purpose | Mode |
|------|---------|------|
| `~/.hermes/config.yaml` | Provider, model, base_url, temperature, max_tokens | Read through repository; written only through official `hermes config set` |
| `~/.hermes/.env` | API key presence detection | Read-only, values redacted |

## What is shown

The viewer shows provider name (e.g., "openrouter", "anthropic", "openai"), model name (e.g., "nous/hermes-3-llama-3.1-70b"), base URL with redaction if it contains secrets, API key configured status (yes or no — never the actual key), API key source (.env or config.yaml), temperature if configured, context window if configured, available models from Hermes `/v1/models` if reachable, config source (config.yaml, default, or unavailable), and warnings for missing config or parse errors.

## What is NOT shown

Raw API keys, raw `.env` values, full `.env` file content, and secrets from any source are never shown.

## Safe write path

Studio can change model/provider config through the official local Hermes CLI. The adapter runs `hermes config set model.provider`, `hermes config set model.default`, `hermes config set model.base_url`, `hermes config set model.temperature`, `hermes config set model.max_tokens`, and `hermes config set model.context_window`. The adapter does not edit YAML directly. In `local` and `auto` modes, model/provider updates use this CLI path against the installed local Hermes runtime even when the optional gateway bridge is not running.

## What is NOT implemented

API key editing in Studio, raw `.env` editing, provider auth setup wizard, and direct mutation of Hermes files without Hermes CLI are not implemented.

## Environment variables

`HERMES_HOME` defaults to `~/.hermes` and sets the standard Hermes home. `HERMES_STUDIO_HERMES_HOME` overrides the Hermes home when set, useful for testing against a non-standard installation.

## Safety

The config.yaml is opened read-only for display. Model and provider mutations are delegated to official `hermes config set`. The `.env` file is scanned for key presence only — values are never read. All sensitive values are redacted before returning to the frontend. Studio never writes config files directly. Malformed YAML returns warnings, not errors.

## Troubleshooting

### No config.yaml found

Check if `~/.hermes/config.yaml` exists. Run `hermes setup` or create config manually if missing.

### config.yaml has syntax errors

Check YAML syntax with `python3 -c "import yaml; yaml.safe_load(open('~/.hermes/config.yaml'))"` and fix any syntax errors.

### API key not configured

Check if `~/.hermes/.env` contains API key entries. Run `hermes auth` or add the key to .env manually.

### Provider: unknown

The config.yaml may be empty or missing the provider field. Check `cat ~/.hermes/config.yaml | grep provider`.