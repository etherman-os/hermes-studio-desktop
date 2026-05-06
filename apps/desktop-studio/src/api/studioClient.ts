const ADAPTER_URL = "http://127.0.0.1:39191";

interface AdapterConfig {
  baseUrl: string;
  token: string | null;
}

const config: AdapterConfig = {
  baseUrl: ADAPTER_URL,
  token: null,
};

export function setAdapterToken(token: string) {
  config.token = token;
}

export function getAdapterUrl() {
  return config.baseUrl;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }
  const res = await fetch(`${config.baseUrl}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Adapter request failed: ${res.status}`);
  }
  return res.json();
}

export async function checkAdapterHealth(): Promise<boolean> {
  try {
    let res = await fetch(`${config.baseUrl}/studio/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return true;
    res = await fetch(`${config.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
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
  backend_status?: {
    backend_mode?: string;
    active_backend?: string;
    hermes_connected?: boolean;
    hermes_url?: string;
    fallback_reason?: string;
  };
}

export async function checkAdapterHealthDetailed(): Promise<HealthResponse> {
  let res = await fetch(`${config.baseUrl}/studio/health`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) {
    res = await fetch(`${config.baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
  }
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function getBootstrap() {
  return request<BootstrapResponse>("/studio/bootstrap");
}

export async function getProfiles() {
  return request<ProfileInfo[]>("/studio/profiles");
}

export async function getSessions() {
  return request<{ sessions: SessionSummary[]; total: number; source?: string }>("/studio/sessions");
}

export async function getSession(sessionId: string) {
  return request<SessionDetail>(`/studio/sessions/${sessionId}`);
}

export async function startRun(input: { session_id: string; prompt: string; profile?: string }) {
  return request<{ run_id: string; status: string }>("/studio/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function stopRun(runId: string) {
  return request<{ run_id: string; status: string }>(`/studio/runs/${runId}/stop`, {
    method: "POST",
  });
}

export async function getLogs() {
  return request<{ source: string; lines: string[]; total: number }>("/studio/logs");
}

export async function getThemes() {
  return request<{ themes: ThemeInfo[]; active: string }>("/studio/themes");
}

export async function activateTheme(themeId: string) {
  return request<ThemeInfo>("/studio/themes/activate", {
    method: "POST",
    body: JSON.stringify({ theme_id: themeId }),
  });
}

export async function getConfig() {
  return request<{ config: Record<string, unknown> }>("/studio/config");
}

export async function patchConfig(input: { key: string; value: unknown }) {
  return request<{ config: Record<string, unknown> }>("/studio/config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export interface BootstrapResponse {
  adapter_version: string;
  hermes_version: string;
  active_profile: string | null;
  capabilities: string[];
  recent_sessions: SessionSummary[];
  active_theme: ThemeInfo | null;
  available_models: { id: string; name: string; provider: string }[];
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

export interface ThemeInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
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
  id?: string;
  type: StudioEventType;
  run_id?: string;
  session_id?: string;
  timestamp?: string;
  source?: string;
  payload: T;
}

export interface RunEventHandlers {
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
  onKanbanUpdated?: (payload: { board_id: string; action: string; task_id?: string }) => void;
  onMemoryUpdated?: (payload: { session_id?: string; action: string }) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

export function streamRunEvents(runId: string, handlers: RunEventHandlers): AbortController {
  const ac = new AbortController();

  (async () => {
    try {
      const headers: Record<string, string> = {};
      if (config.token) headers["Authorization"] = `Bearer ${config.token}`;

      const res = await fetch(`${config.baseUrl}/studio/runs/${runId}/events`, {
        headers,
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        handlers.onError?.(new Error(`SSE request failed: ${res.status}`));
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
                handlers.onKanbanUpdated?.(event.payload as { board_id: string; action: string; task_id?: string });
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

export function streamLogs(handlers: LogEventHandlers): AbortController {
  const ac = new AbortController();

  (async () => {
    try {
      const headers: Record<string, string> = {};
      if (config.token) headers["Authorization"] = `Bearer ${config.token}`;

      const res = await fetch(`${config.baseUrl}/studio/logs/stream`, {
        headers,
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        handlers.onError?.(new Error(`Log stream failed: ${res.status}`));
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
