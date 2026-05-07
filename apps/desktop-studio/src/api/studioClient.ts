import { invoke } from "@tauri-apps/api/core";
import type { RunLedgerRecentResponse, RunLedgerResponse, RunLedgerRun } from "@hermes-studio/shared-types";

export type { RunLedgerRecentResponse, RunLedgerResponse, RunLedgerRun } from "@hermes-studio/shared-types";

const ADAPTER_URL = "http://127.0.0.1:39191";
const TOKEN_UNAVAILABLE_MESSAGE =
  "Adapter auth token is unavailable. Start the adapter and launch the Tauri app, or set VITE_HERMES_STUDIO_ADAPTER_TOKEN for browser dev.";

interface AdapterConfig {
  baseUrl: string;
  token: string | null;
}

const config: AdapterConfig = {
  baseUrl: ADAPTER_URL,
  token: null,
};

let authBootstrapPromise: Promise<AuthBootstrapResult> | null = null;

export interface AuthBootstrapResult {
  authenticated: boolean;
  source: "memory" | "env" | "tauri" | "unavailable";
  error?: string;
}

export interface AdapterErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    source?: string;
    hint?: string;
  };
  detail?: unknown;
}

export function setAdapterToken(token: string | null) {
  const trimmed = token?.trim();
  config.token = trimmed ? trimmed : null;
}

export function clearAdapterToken() {
  config.token = null;
  authBootstrapPromise = null;
}

export function hasAdapterToken() {
  return Boolean(config.token);
}

export function getAdapterUrl() {
  return config.baseUrl;
}

function envToken(): string | null {
  const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
  const token = env.VITE_HERMES_STUDIO_ADAPTER_TOKEN ?? env.VITE_HERMES_STUDIO_TOKEN;
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

function hasTauriBridge() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function initializeAdapterAuth(force = false): Promise<AuthBootstrapResult> {
  if (!force && config.token) {
    return { authenticated: true, source: "memory" };
  }

  if (!force && authBootstrapPromise) {
    return authBootstrapPromise;
  }

  authBootstrapPromise = (async () => {
    const tokenFromEnv = envToken();
    if (tokenFromEnv) {
      setAdapterToken(tokenFromEnv);
      return { authenticated: true, source: "env" as const };
    }

    if (hasTauriBridge()) {
      try {
        const tokenFromTauri = await invoke<string>("get_adapter_auth_token");
        setAdapterToken(tokenFromTauri);
        return { authenticated: true, source: "tauri" as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          authenticated: false,
          source: "unavailable" as const,
          error: `${TOKEN_UNAVAILABLE_MESSAGE} ${message}`,
        };
      }
    }

    return {
      authenticated: false,
      source: "unavailable" as const,
      error: TOKEN_UNAVAILABLE_MESSAGE,
    };
  })();

  const result = await authBootstrapPromise;
  if (!result.authenticated) {
    authBootstrapPromise = null;
  }
  return result;
}

function requireAdapterToken() {
  if (!config.token) {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
}

export function adapterErrorMessage(body: AdapterErrorEnvelope | null, status: number, fallback?: string): string {
  const direct = body?.error?.message;
  if (direct) return direct;

  const detail = body?.detail;
  if (typeof detail === "object" && detail !== null && "error" in detail) {
    const nested = (detail as AdapterErrorEnvelope).error?.message;
    if (nested) return nested;
  }
  if (typeof detail === "string") return detail;

  return fallback ?? `Adapter request failed: ${status}`;
}

async function responseError(res: Response, fallback?: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as AdapterErrorEnvelope | null;
  return new Error(adapterErrorMessage(body, res.status, fallback));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  requireAdapterToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  headers["Authorization"] = `Bearer ${config.token}`;
  const res = await fetch(`${config.baseUrl}${path}`, { ...options, headers });
  if (!res.ok) {
    throw await responseError(res);
  }
  return res.json();
}

export async function checkAdapterHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${config.baseUrl}/studio/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface HealthResponse {
  status: string;
  adapter_version: string;
  hermes_connected: boolean;
  backend_mode: string;
  storage?: StorageStatus;
  backend_status?: {
    backend_mode?: string;
    active_backend?: string;
    hermes_connected?: boolean;
    hermes_url?: string;
    fallback_reason?: string;
  };
}

export interface StorageStatus {
  available: boolean;
  schema_version: number;
  data_dir: string;
  db_path: string;
  last_error: string | null;
}

export async function checkAdapterHealthDetailed(): Promise<HealthResponse> {
  const res = await fetch(`${config.baseUrl}/studio/health`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw await responseError(res, `Health check failed: ${res.status}`);
  return res.json();
}

export async function getBootstrap() {
  return request<BootstrapResponse>("/studio/bootstrap");
}

export async function getProfiles() {
  return request<ProfileInfo[]>("/studio/profiles");
}

export async function getActiveProfile() {
  return request<ProfileInfo>("/studio/profiles/active");
}

export async function activateProfile(profileId: string) {
  return request<ActivateProfileResponse>("/studio/profiles/activate", {
    method: "POST",
    body: JSON.stringify({ profile_id: profileId }),
  });
}

export async function getSessions() {
  return request<SessionsResponse>("/studio/sessions");
}

export async function getSession(sessionId: string) {
  return request<SessionDetail>(`/studio/sessions/${sessionId}`);
}

export async function startRun(input: { session_id: string; prompt: string; profile?: string; workspace_path?: string | null; context?: Record<string, unknown> }) {
  return request<RunResponse>("/studio/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function stopRun(runId: string) {
  return request<RunResponse>(`/studio/runs/${runId}/stop`, {
    method: "POST",
  });
}

export async function getRecentRuns(limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<RunLedgerRecentResponse>(`/studio/runs/recent?${params.toString()}`);
}

export async function getRun(runId: string) {
  return request<RunLedgerRun>(`/studio/runs/${runId}`);
}

export async function getRunLedger(runId: string) {
  return request<RunLedgerResponse>(`/studio/runs/${runId}/ledger`);
}

export async function getLogs(source?: string, tail?: number) {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (tail) params.set("tail", String(tail));
  const qs = params.toString();
  return request<LogsResponse>(`/studio/logs${qs ? `?${qs}` : ""}`);
}

export interface ModelConfig {
  provider: string;
  model: string;
  base_url?: string;
  api_key_configured: boolean;
  api_key_source?: string;
  config_source: string;
  temperature?: number;
  max_tokens?: number;
  context_window?: number;
  capabilities_available?: boolean;
  available_models?: { id: string; name: string }[];
  available_model_count?: number;
  warnings?: string[];
}

export async function getModelConfig() {
  return request<ModelConfig>("/studio/model-config");
}

export async function getThemes() {
  return request<ThemesResponse>("/studio/themes");
}

export interface ThemeData {
  meta?: { id?: string; name?: string; version?: string; author?: string; description?: string; extends?: string };
  palette?: Record<string, string>;
  typography?: Record<string, string>;
  borders?: Record<string, string>;
  icons?: Record<string, string>;
  labels?: Record<string, string>;
  empty_states?: Record<string, string>;
  onboarding?: Record<string, string>;
  kanban?: Record<string, unknown>;
  message_styles?: Record<string, string>;
  accessibility?: Record<string, unknown>;
  assets?: Record<string, string>;
}

export async function getTheme(themeId: string) {
  return request<ThemeData>(`/studio/themes/${themeId}`);
}

export async function getActiveTheme() {
  return request<ThemeData>("/studio/themes/active");
}

export async function activateTheme(themeId: string) {
  return request<ThemeInfo>("/studio/themes/activate", {
    method: "POST",
    body: JSON.stringify({ theme_id: themeId }),
  });
}

export async function reloadThemes() {
  return request<ThemeReloadResponse>("/studio/themes/reload", {
    method: "POST",
  });
}

export async function getConfig() {
  return request<ConfigResponse>("/studio/config");
}

export async function patchConfig(input: { key: string; value: unknown }) {
  return request<ConfigResponse>("/studio/config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getKanbanBoards() {
  return request<KanbanBoardsResponse>("/studio/kanban/boards");
}

export async function getDefaultKanbanBoard() {
  return request<KanbanBoard>("/studio/kanban/boards/default");
}

export async function getKanbanBoard(boardId: string) {
  return request<KanbanBoard>(`/studio/kanban/boards/${boardId}`);
}

export async function createKanbanCard(input: KanbanCreateCardRequest) {
  return request<KanbanCard>("/studio/kanban/cards", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateKanbanCard(cardId: string, input: KanbanUpdateCardRequest) {
  return request<KanbanCard>(`/studio/kanban/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function moveKanbanCard(cardId: string, input: KanbanMoveCardRequest) {
  return request<KanbanCard>(`/studio/kanban/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function archiveKanbanCard(cardId: string) {
  return request<KanbanCard>(`/studio/kanban/cards/${cardId}/archive`, {
    method: "POST",
  });
}

export async function linkKanbanCardToSession(cardId: string, sessionId: string) {
  return request<KanbanCard>(`/studio/kanban/cards/${cardId}/link-session`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId } satisfies KanbanLinkSessionRequest),
  });
}

export async function linkKanbanCardToRun(cardId: string, runId: string) {
  return request<KanbanCard>(`/studio/kanban/cards/${cardId}/link-run`, {
    method: "POST",
    body: JSON.stringify({ run_id: runId } satisfies KanbanLinkRunRequest),
  });
}

export interface ActivateProfileResponse {
  status: string;
  message?: string;
}

export interface BootstrapResponse {
  adapter_version: string;
  hermes_version: string;
  active_profile: string | null;
  capabilities: string[];
  recent_sessions: SessionSummary[];
  active_theme: ThemeInfo | null;
  available_models: { id: string; name: string; provider: string }[];
  storage?: StorageStatus;
}

export interface ProfileInfo {
  name: string;
  path: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface SessionDetail extends SessionSummary {
  transcript_preview: { role: string; content: string }[];
}

export interface SessionsResponse {
  sessions: SessionSummary[];
  total: number;
  source?: string;
}

export interface RunResponse {
  run_id: string;
  status: string;
}

export interface LogsResponse {
  source: string;
  lines: string[];
  total: number;
}

export interface ThemeInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
}

export interface ThemesResponse {
  themes: ThemeInfo[];
  active: string;
}

export interface ThemeReloadResponse {
  reloaded: boolean;
  count: number;
}

export interface ConfigResponse {
  config: Record<string, unknown>;
}

export interface KanbanBoardSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface KanbanBoard extends KanbanBoardSummary {
  columns: KanbanColumn[];
  card_count: number;
}

export interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  semantic_status: string;
  position: number;
  created_at: string;
  updated_at: string;
  cards: KanbanCard[];
}

export interface KanbanCard {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  position: number;
  session_id: string | null;
  run_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface KanbanBoardsResponse {
  boards: KanbanBoardSummary[];
}

export interface KanbanCreateCardRequest {
  board_id?: string;
  column_id?: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  position?: number;
  session_id?: string | null;
  run_id?: string | null;
}

export interface KanbanUpdateCardRequest {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
}

export interface KanbanMoveCardRequest {
  column_id: string;
  position: number;
}

export interface KanbanLinkSessionRequest {
  session_id: string;
}

export interface KanbanLinkRunRequest {
  run_id: string;
}

export interface KanbanUpdatedPayload {
  board_id: string;
  action: string;
  card_id?: string;
  column_id?: string;
  position?: number;
  task_id?: string;
}

export type StudioEventType =
  | "run.started"
  | "assistant.delta"
  | "assistant.completed"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "approval.requested"
  | "approval.resolved"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "log.line"
  | "adapter.warning"
  | "kanban.updated"
  | "memory.updated";

export interface StudioEvent<T = Record<string, unknown>> {
  id: string;
  type: StudioEventType;
  run_id?: string;
  session_id?: string;
  timestamp: string;
  source: "adapter" | "hermes" | "studio";
  payload: T;
}

export interface RunEventHandlers {
  onEvent?: (event: StudioEvent) => void;
  onRunStarted?: (payload: { run_id: string; session_id: string }) => void;
  onAssistantDelta?: (payload: { text: string }) => void;
  onAssistantCompleted?: (payload: { model?: string; total_tokens?: number; duration_ms?: number }) => void;
  onToolStarted?: (payload: { tool: string; tool_call_id?: string }) => void;
  onToolProgress?: (payload: { tool: string; progress?: number; message?: string }) => void;
  onToolCompleted?: (payload: { tool: string; success: boolean; duration_ms?: number }) => void;
  onApprovalRequested?: (payload: { approval_id: string; tool: string; action: string }) => void;
  onRunCompleted?: (payload: { run_id: string; total_tokens?: number; duration_ms?: number }) => void;
  onRunFailed?: (payload: { run_id: string; message: string }) => void;
  onRunCancelled?: (payload: { run_id: string; reason?: string }) => void;
  onKanbanUpdated?: (payload: KanbanUpdatedPayload) => void;
  onMemoryUpdated?: (payload: { session_id?: string; action: string }) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

export function streamRunEvents(runId: string, handlers: RunEventHandlers): AbortController {
  const ac = new AbortController();

  (async () => {
    try {
      requireAdapterToken();
      const headers: Record<string, string> = {};
      headers["Authorization"] = `Bearer ${config.token}`;

      const res = await fetch(`${config.baseUrl}/studio/runs/${runId}/events`, {
        headers,
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        handlers.onError?.(await responseError(res, `SSE request failed: ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const lines = block.split("\n");
          let eventType = "";
          let data = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) data = line.slice(6);
          }

          if (!eventType || !data) continue;

          try {
            const event = JSON.parse(data) as StudioEvent;
            handlers.onEvent?.(event);

            switch (event.type) {
              case "run.started":
                handlers.onRunStarted?.(event.payload as { run_id: string; session_id: string });
                break;
              case "assistant.delta":
                handlers.onAssistantDelta?.(event.payload as { text: string });
                break;
              case "assistant.completed":
                handlers.onAssistantCompleted?.(event.payload as { model?: string; total_tokens?: number; duration_ms?: number });
                break;
              case "tool.started":
                handlers.onToolStarted?.(event.payload as { tool: string; tool_call_id?: string });
                break;
              case "tool.progress":
                handlers.onToolProgress?.(event.payload as { tool: string; progress?: number; message?: string });
                break;
              case "tool.completed":
                handlers.onToolCompleted?.(event.payload as { tool: string; success: boolean; duration_ms?: number });
                break;
              case "approval.requested":
                handlers.onApprovalRequested?.(event.payload as { approval_id: string; tool: string; action: string });
                break;
              case "run.completed":
                handlers.onRunCompleted?.(event.payload as { run_id: string; total_tokens?: number; duration_ms?: number });
                handlers.onDone?.();
                return;
              case "run.failed":
                handlers.onRunFailed?.(event.payload as { run_id: string; message: string });
                handlers.onDone?.();
                return;
              case "run.cancelled":
                handlers.onRunCancelled?.(event.payload as { run_id: string; reason?: string });
                handlers.onDone?.();
                return;
              case "kanban.updated":
                handlers.onKanbanUpdated?.(event.payload as unknown as KanbanUpdatedPayload);
                break;
              case "memory.updated":
                handlers.onMemoryUpdated?.(event.payload as { session_id?: string; action: string });
                break;
            }
          } catch {
            // skip malformed events
          }
        }
      }
      handlers.onDone?.();
    } catch (err) {
      if (!ac.signal.aborted) {
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return ac;
}

export interface LogEventHandlers {
  onLogLine?: (payload: { source: string; level: string; message: string; timestamp?: string }) => void;
  onError?: (error: Error) => void;
}

export function streamLogs(handlers: LogEventHandlers, source?: string): AbortController {
  const ac = new AbortController();

  (async () => {
    try {
      requireAdapterToken();
      const headers: Record<string, string> = {};
      headers["Authorization"] = `Bearer ${config.token}`;
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      const qs = params.toString();

      const res = await fetch(`${config.baseUrl}/studio/logs/stream${qs ? `?${qs}` : ""}`, {
        headers,
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        handlers.onError?.(await responseError(res, `Log stream failed: ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const lines = block.split("\n");
          let data = "";

          for (const line of lines) {
            if (line.startsWith("data: ")) data = line.slice(6);
          }

          if (!data) continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "log.line") {
              handlers.onLogLine?.(event.payload);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return ac;
}
