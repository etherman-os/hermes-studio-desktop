export const HEALTH_OK = {
  status: "ok",
  adapter_version: "0.1.0-test",
  hermes_connected: true,
  backend_mode: "mock",
  backend_status: {
    backend_mode: "mock",
    active_backend: "mock",
    hermes_connected: true,
    hermes_url: "http://localhost:8080",
  },
  storage: {
    available: true,
    schema_version: 1,
    data_dir: "/tmp/test",
    db_path: "/tmp/test/state.db",
    last_error: null,
  },
};

export const BOOTSTRAP = {
  adapter_version: "0.1.0-test",
  hermes_version: "0.12.0-test",
  active_profile: "coder",
  capabilities: ["runs", "sessions", "approvals", "artifacts", "kanban"],
  recent_sessions: [
    {
      id: "s-1",
      title: "Map src directory structure",
      created_at: "2026-05-06T10:00:00Z",
      updated_at: "2026-05-06T10:05:00Z",
      message_count: 12,
    },
    {
      id: "s-2",
      title: "Review API endpoint contracts",
      created_at: "2026-05-06T09:00:00Z",
      updated_at: "2026-05-06T09:30:00Z",
      message_count: 24,
    },
  ],
  active_theme: { id: "default-dark", name: "Default Dark", version: "1.0.0", author: "hermes", description: "Dark theme" },
  available_models: [{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet", provider: "anthropic" }],
  storage: HEALTH_OK.storage,
};

export const PROFILES = [
  { name: "coder", path: "/home/user/.hermes-profiles/coder" },
  { name: "research", path: "/home/user/.hermes-profiles/research" },
  { name: "writer", path: "/home/user/.hermes-profiles/writer" },
];

export const ACTIVE_PROFILE = { name: "coder", path: "/home/user/.hermes-profiles/coder" };

export const SESSIONS = {
  sessions: [
    { id: "s-1", title: "Map src directory structure", created_at: "2026-05-06T10:00:00Z", updated_at: "2026-05-06T10:05:00Z", message_count: 12 },
    { id: "s-2", title: "Review API endpoint contracts", created_at: "2026-05-06T09:00:00Z", updated_at: "2026-05-06T09:30:00Z", message_count: 24 },
    { id: "s-3", title: "Theme loader bug investigation", created_at: "2026-05-05T14:00:00Z", updated_at: "2026-05-05T15:20:00Z", message_count: 18 },
  ],
  total: 3,
  source: "adapter",
};

export const SESSION_DETAIL = {
  id: "s-1",
  title: "Map src directory structure",
  created_at: "2026-05-06T10:00:00Z",
  updated_at: "2026-05-06T10:05:00Z",
  message_count: 12,
  transcript_preview: [
    { role: "user", content: "Map the src directory structure" },
    { role: "assistant", content: "Here is the src directory structure..." },
  ],
};

export const RUNS_RECENT = {
  runs: [
    {
      id: "run-abc123",
      session_id: "s-1",
      status: "completed",
      title: "Map src directory structure",
      prompt_preview: "Map src directory structure",
      started_at: "2026-05-06T10:00:00Z",
      completed_at: "2026-05-06T10:01:30Z",
      duration_ms: 90000,
      backend: "mock",
      model: "claude-sonnet-4-20250514",
      error: null,
      workspace_path: "/home/user/project",
    },
    {
      id: "run-def456",
      session_id: "s-2",
      status: "completed",
      title: "Review API endpoint contracts",
      prompt_preview: "Review API endpoint contracts",
      started_at: "2026-05-06T09:00:00Z",
      completed_at: "2026-05-06T09:05:00Z",
      duration_ms: 300000,
      backend: "mock",
      model: "claude-sonnet-4-20250514",
      error: null,
      workspace_path: "/home/user/project",
    },
  ],
  total: 2,
  history_available: true,
};

export const RUN_LEDGER = {
  run: {
    id: "run-abc123",
    session_id: "s-1",
    status: "completed",
    title: "Map src directory structure",
    prompt_preview: "Map src directory structure",
    started_at: "2026-05-06T10:00:00Z",
    completed_at: "2026-05-06T10:01:30Z",
    duration_ms: 90000,
    backend: "mock",
    model: "claude-sonnet-4-20250514",
    error: null,
    workspace_path: "/home/user/project",
  },
  events: [
    { id: "ev-1", type: "run.started", run_id: "run-abc123", session_id: "s-1", timestamp: "2026-05-06T10:00:00Z", source: "adapter", payload: { run_id: "run-abc123", session_id: "s-1" } },
    { id: "ev-2", type: "tool.started", run_id: "run-abc123", session_id: "s-1", timestamp: "2026-05-06T10:00:01Z", source: "hermes", payload: { tool: "file_tree" } },
    { id: "ev-3", type: "tool.completed", run_id: "run-abc123", session_id: "s-1", timestamp: "2026-05-06T10:00:02Z", source: "hermes", payload: { tool: "file_tree", success: true, duration_ms: 1200 } },
    { id: "ev-4", type: "assistant.delta", run_id: "run-abc123", session_id: "s-1", timestamp: "2026-05-06T10:00:03Z", source: "hermes", payload: { text: "Here is the directory structure..." } },
    { id: "ev-5", type: "assistant.completed", run_id: "run-abc123", session_id: "s-1", timestamp: "2026-05-06T10:01:29Z", source: "hermes", payload: { model: "claude-sonnet-4-20250514", total_tokens: 1500, duration_ms: 90000 } },
    { id: "ev-6", type: "run.completed", run_id: "run-abc123", session_id: "s-1", timestamp: "2026-05-06T10:01:30Z", source: "adapter", payload: { run_id: "run-abc123", total_tokens: 1500, duration_ms: 90000 } },
  ],
  history_available: true,
};

export const APPROVALS = {
  approvals: [
    {
      id: "appr-1",
      run_id: "run-abc123",
      session_id: "s-1",
      tool_name: "shell_exec",
      command: "rm -rf /tmp/test",
      risk_level: "high",
      status: "pending",
      reason: null,
      decision: null,
      decided_at: null,
      created_at: "2026-05-06T10:00:10Z",
      updated_at: "2026-05-06T10:00:10Z",
    },
  ],
  total: 1,
};

export const PENDING_APPROVALS = {
  approvals: [
    {
      id: "appr-1",
      run_id: "run-abc123",
      session_id: "s-1",
      tool_name: "shell_exec",
      command: "rm -rf /tmp/test",
      risk_level: "high",
      status: "pending",
      reason: null,
      decision: null,
      decided_at: null,
      created_at: "2026-05-06T10:00:10Z",
      updated_at: "2026-05-06T10:00:10Z",
    },
  ],
  total: 1,
};

export const ARTIFACTS = {
  artifacts: [
    {
      id: "art-1",
      title: "Directory structure map",
      type: "markdown",
      description: "Auto-generated directory tree",
      file_path: null,
      file_name: null,
      mime_type: null,
      size_bytes: null,
      run_id: "run-abc123",
      session_id: "s-1",
      kanban_card_id: null,
      source: "run",
      created_at: "2026-05-06T10:02:00Z",
      updated_at: "2026-05-06T10:02:00Z",
      archived_at: null,
      has_content: true,
    },
    {
      id: "art-2",
      title: "API review notes",
      type: "markdown",
      description: "Notes from API contract review",
      file_path: null,
      file_name: null,
      mime_type: null,
      size_bytes: null,
      run_id: "run-def456",
      session_id: "s-2",
      kanban_card_id: null,
      source: "run",
      created_at: "2026-05-06T09:06:00Z",
      updated_at: "2026-05-06T09:06:00Z",
      archived_at: null,
      has_content: true,
    },
  ],
  total: 2,
};

export const CONTEXT = {
  scope: "current",
  files: [
    { path: "src/main.tsx", content_preview: 'import React from "react"...' },
    { path: "src/App.tsx", content_preview: 'import { AppFrame }...' },
  ],
  env: { workspace: "/home/user/project", profile: "coder" },
};

export const LOGS = {
  source: "adapter",
  lines: [
    "2026-05-06T10:05:32Z INFO Adapter started on 127.0.0.1:39191",
    "2026-05-06T10:05:33Z INFO Bootstrap endpoint registered",
    "2026-05-06T10:06:01Z INFO Run started: run_abc123",
    "2026-05-06T10:06:15Z INFO Run completed: run_abc123",
  ],
  total: 4,
};

export const THEMES = {
  themes: [
    { id: "default-dark", name: "Default Dark", version: "1.0.0", author: "hermes", description: "Dark theme" },
    { id: "default-light", name: "Default Light", version: "1.0.0", author: "hermes", description: "Light theme" },
  ],
  active: "default-dark",
};

export const THEME_DATA = {
  meta: { id: "default-dark", name: "Default Dark", version: "1.0.0", author: "hermes", description: "Dark theme" },
  palette: { bg: "#1e1e2e", fg: "#cdd6f4", accent: "#58a6ff" },
  typography: { font_family: "system-ui", font_size_base: "14px" },
};

export const MODEL_CONFIG = {
  provider: "glm",
  model: "glm-5",
  api_key_configured: true,
  config_source: "profile",
  context_window: 200000,
  available_models: [
    { id: "glm-5", name: "glm-5", provider: "glm", provider_name: "GLM", context_window: 200000, source: "config.yaml" },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet", provider: "anthropic", provider_name: "Anthropic", context_window: 200000, source: "models_dev_cache.json" },
  ],
  available_model_count: 2,
};

export const HERMES_INVENTORY = {
  summary: {
    hermes_home: "/home/user/.hermes",
    config_available: true,
    active_provider: "glm",
    active_model: "glm-5",
    provider_count: 20,
    configured_provider_count: 4,
    model_count: 200,
    skill_count: 115,
    installed_skill_count: 110,
    mcp_server_count: 3,
    toolset_count: 8,
  },
  providers: [
    {
      id: "glm",
      name: "GLM",
      api_base_url: null,
      doc_url: null,
      npm_package: null,
      env_keys: ["GLM_API_KEY"],
      model_count: 1,
      configured: true,
      active: true,
      source: "config.yaml",
    },
    {
      id: "anthropic",
      name: "Anthropic",
      api_base_url: null,
      doc_url: null,
      npm_package: null,
      env_keys: ["ANTHROPIC_API_KEY"],
      model_count: 1,
      configured: true,
      active: false,
      source: "models_dev_cache.json",
    },
  ],
  models: MODEL_CONFIG.available_models,
  skills: [
    {
      id: "browser",
      name: "browser",
      title: "Browser Automation",
      description: "Drive a local browser, capture screenshots, and verify UI flows.",
      category: "automation",
      version: "1.0.0",
      author: "Hermes Agent",
      tags: ["browser", "ui", "testing"],
      related_skills: [],
      prerequisites: {},
      source: "installed",
      installed: true,
      path: "/home/user/.hermes/skills/browser/SKILL.md",
      size_bytes: 2048,
      updated_at: "2026-05-06T10:00:00Z",
    },
    {
      id: "codex",
      name: "codex",
      title: "Codex",
      description: "Local code editing and software engineering workflow skill.",
      category: "coding",
      version: "1.0.0",
      author: "Hermes Agent",
      tags: ["code", "agent"],
      related_skills: [],
      prerequisites: {},
      source: "installed",
      installed: true,
      path: "/home/user/.hermes/skills/codex/SKILL.md",
      size_bytes: 4096,
      updated_at: "2026-05-06T10:00:00Z",
    },
  ],
  mcp_servers: [
    {
      id: "context7",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      env_keys: [],
      env_configured: false,
      enabled: true,
      source: "config.yaml",
    },
    {
      id: "github",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env_keys: ["GITHUB_TOKEN"],
      env_configured: true,
      enabled: true,
      source: "config.yaml",
    },
  ],
  toolsets: [
    { id: "browser", platform: "studio", kind: "toolset", enabled: true, source: "config.yaml" },
    { id: "file", platform: "studio", kind: "toolset", enabled: true, source: "config.yaml" },
    { id: "image_gen", platform: "studio", kind: "toolset", enabled: true, source: "config.yaml" },
  ],
};

export const CONFIG = {
  config: {
    backend_mode: "mock",
    log_level: "info",
    theme: "default-dark",
  },
};

export const KANBAN_BOARDS = {
  boards: [
    { id: "board-1", name: "Default Board", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-06T00:00:00Z" },
  ],
};

export const KANBAN_BOARD = {
  id: "board-1",
  name: "Default Board",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-06T00:00:00Z",
  card_count: 3,
  columns: [
    {
      id: "col-1",
      board_id: "board-1",
      name: "Inbox",
      semantic_status: "inbox",
      position: 0,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      cards: [
        { id: "k-1", board_id: "board-1", column_id: "col-1", title: "Fix theme loader", description: "Deep merge not working", priority: "high", status: "inbox", position: 0, session_id: null, run_id: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", archived_at: null },
      ],
    },
    {
      id: "col-2",
      board_id: "board-1",
      name: "Doing",
      semantic_status: "doing",
      position: 1,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      cards: [],
    },
    {
      id: "col-3",
      board_id: "board-1",
      name: "Done",
      semantic_status: "done",
      position: 2,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      cards: [
        { id: "k-2", board_id: "board-1", column_id: "col-3", title: "Implement command palette", description: "Ctrl+K", priority: "medium", status: "done", position: 0, session_id: null, run_id: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", archived_at: null },
        { id: "k-3", board_id: "board-1", column_id: "col-3", title: "Write shared-types", description: "TS types", priority: "medium", status: "done", position: 1, session_id: null, run_id: null, created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-01T00:00:00Z", archived_at: null },
      ],
    },
  ],
};

export const PROCESSES = {
  processes: [
    {
      id: "proc-1",
      template_id: "dev-server",
      name: "Hermes Dev Server",
      command: "pnpm run dev:desktop",
      status: "running",
      pid: 12345,
      started_at: "2026-05-08T10:00:00Z",
      stopped_at: null,
      exit_code: null,
      log_count: 42,
      error: null,
    },
    {
      id: "proc-2",
      template_id: "adapter",
      name: "Python Adapter",
      command: "pnpm run dev:adapter",
      status: "stopped",
      pid: 12346,
      started_at: "2026-05-08T09:00:00Z",
      stopped_at: "2026-05-08T09:30:00Z",
      exit_code: 0,
      log_count: 100,
      error: null,
    },
  ],
  templates: [
    { id: "dev-server", name: "Hermes Dev Server", command: "pnpm run dev:desktop", description: "Starts the Hermes Desktop Studio Vite dev server" },
    { id: "adapter", name: "Python Adapter", command: "pnpm run dev:adapter", description: "Starts the Python adapter in dev mode" },
    { id: "test-runner", name: "Test Runner", command: "pnpm run test:e2e", description: "Runs end-to-end tests" },
    { id: "build", name: "Build", command: "pnpm run build", description: "Runs the production build" },
  ],
};

export const PROCESS_LOGS = {
  process_id: "proc-1",
  lines: [
    "[10:00:00] Process started: pnpm run dev:desktop",
    "[10:00:00] PID: 12345",
    "[10:00:01] VITE v5.0.0  ready in 300ms",
    "[10:00:01] ➜  Local:   http://localhost:5173/",
  ],
  total: 4,
};
