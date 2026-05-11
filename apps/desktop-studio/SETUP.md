# First-Time Setup Guide

After installing Hermes Desktop Studio, follow this guide to configure your workspace.

## Connecting to Hermes Agent

Hermes Desktop Studio communicates with Hermes Agent through a local adapter.

### 1. Start Hermes Agent

Make sure Hermes Agent is running locally. The Desktop Studio expects it at:

```
http://127.0.0.1:39191
```

### 2. Verify connection

The studio will auto-connect on startup. Check the status bar at the bottom of the window:
- Green dot: Connected
- Orange dot: Connecting
- Red dot: Disconnected

### 3. Manual reconnect

If the connection drops, click the status indicator and select "Reconnect".

## Configuring Model Providers

### Open Settings

Click the gear icon in the sidebar or press `Cmd/Ctrl + ,`

### Add a provider

1. Navigate to **Models** in the settings panel
2. Click **Add Provider**
3. Choose your provider type:
   - **OpenAI** — GPT models
   - **Anthropic** — Claude models
   - **Ollama** — Local models
   - **Custom** — Any OpenAI-compatible API

### Provider settings

For each provider, configure:

| Field | Description |
|-------|-------------|
| Name | Display name (e.g., "GPT-4") |
| Base URL | API endpoint (e.g., `https://api.openai.com/v1`) |
| API Key | Your secret key |
| Model ID | Specific model name (e.g., `gpt-4-turbo`) |

### Set default model

In the **Models** section, click the star icon next to your preferred model.

## Setting Up Skills

Skills extend Hermes Agent's capabilities.

### Browse available skills

1. Open **Settings** > **Skills**
2. Browse the skill library or search
3. Click a skill to see its description and requirements

### Install a skill

1. Click **Install** on the skill you want
2. Some skills require API keys or other configuration
3. Configure the skill's settings after installation

### Create a custom skill

1. Go to **Settings** > **Skills** > **Create New**
2. Define the skill's name, description, and actions
3. Save and enable the skill

## Setting Up MCP Servers

Model Context Protocol (MCP) servers provide additional tools and resources.

### Add an MCP server

1. Open **Settings** > **MCP**
2. Click **Add Server**
3. Enter the server configuration:
   - **Name**: A friendly name
   - **Command**: The command to start the server
   - **Args**: Any required arguments
   - **Env**: Environment variables (if needed)

### Example MCP server configurations

**File system server:**
```
Name: Files
Command: npx
Args: @modelcontextprotocol/server-filesystem /path/to/workspace
```

**Git server:**
```
Name: Git
Command: npx
Args: @modelcontextprotocol/server-git /path/to/repo
```

## Importing Existing Hermes Configuration

If you already use Hermes Agent, you can import your existing setup.

### Export from existing installation

On your current Hermes Agent setup:
```bash
hermes config export > hermes-config.json
```

### Import into Desktop Studio

1. Open **Settings** > **Import/Export**
2. Click **Import Configuration**
3. Select your `hermes-config.json` file
4. Review and confirm the import

### What gets imported

- Model provider configurations
- Skill settings
- MCP server configurations
- Theme preferences
- UI layout preferences

## First Session

After configuration:

1. Click **New Session** in the sidebar
2. Select your preferred model
3. Start chatting with Hermes Agent

The session will appear in the Run Ledger, allowing you to revisit past conversations.

## Theme Customization

Change the look and feel:

1. Open **Settings** > **Appearance**
2. Browse available themes or create your own
3. Click a theme to preview and apply

For creating custom themes, see the theme system documentation in the main README.

## Next Steps

- Check the main [README.md](./README.md) for feature overview
- Visit the [Hermes Agent documentation](https://github.com/NousResearch/hermes-agent) for usage guides
- Join the community for tips and support