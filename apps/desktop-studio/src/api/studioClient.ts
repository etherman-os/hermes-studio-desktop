import { invoke } from "@tauri-apps/api/core";
import { parseSSEStream } from "./sseParser";
import type {
  Approval,
  ApprovalDetail,
  ApprovalListResponse,
  ApprovalRiskLevel,
  ApprovalStatus,
  Artifact,
  ArtifactCreateRequest,
  ArtifactDetail,
  ArtifactListResponse,
  ArtifactRevisionListResponse,
  ArtifactVariantCreateRequest,
  ArtifactVariantGroupCreateRequest,
  ArtifactVariantGroupListResponse,
  ArtifactUpdateRequest,
  ContextScope,
  ContextSnapshot,
  CronJob,
  CronJobListResponse,
  Delegation,
  DelegationDetail,
  DelegationListResponse,
  RunLedgerComparison,
  RunLedgerRecentResponse,
  RunLedgerResponse,
  RunLedgerRun,
} from "@hermes-studio/shared-types";

export type {
  Approval,
  ApprovalDetail,
  ApprovalListResponse,
  ApprovalRiskLevel,
  ApprovalStatus,
  Artifact,
  ArtifactCreateRequest,
  ArtifactDetail,
  ArtifactListResponse,
  ArtifactRevision,
  ArtifactRevisionListResponse,
  ArtifactType,
  ArtifactVariant,
  ArtifactVariantCreateRequest,
  ArtifactVariantGroup,
  ArtifactVariantGroupCreateRequest,
  ArtifactVariantGroupListResponse,
  ArtifactUpdateRequest,
  ContextScope,
  ContextSnapshot,
  CronJob,
  CronJobListResponse,
  CronJobStatus,
  Delegation,
  DelegationDetail,
  DelegationListResponse,
  DelegationStatus,
  RunLedgerCompareDelta,
  RunLedgerCompareSummary,
  RunLedgerComparison,
  RunLedgerRecentResponse,
  RunLedgerResponse,
  RunLedgerRun,
} from "@hermes-studio/shared-types";

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

  try {
    const result = await authBootstrapPromise;
    return result;
  } finally {
    authBootstrapPromise = null;
  }
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

export async function compareRuns(leftRunId: string, rightRunId: string) {
  const params = new URLSearchParams({ left_run_id: leftRunId, right_run_id: rightRunId });
  return request<RunLedgerComparison>(`/studio/runs/compare?${params.toString()}`);
}

export interface ApprovalListParams {
  status?: ApprovalStatus | string;
  risk_level?: ApprovalRiskLevel | string;
  run_id?: string;
  session_id?: string;
  limit?: number;
}

function approvalQuery(params?: ApprovalListParams) {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listApprovals(params?: ApprovalListParams) {
  return request<ApprovalListResponse>(`/studio/approvals${approvalQuery(params)}`);
}

export async function listPendingApprovals() {
  return request<ApprovalListResponse>("/studio/approvals/pending");
}

export async function getApproval(approvalId: string) {
  return request<ApprovalDetail>(`/studio/approvals/${approvalId}`);
}

export async function getRunApprovals(runId: string) {
  return request<ApprovalListResponse>(`/studio/runs/${runId}/approvals`);
}

export async function getSessionApprovals(sessionId: string) {
  return request<ApprovalListResponse>(`/studio/sessions/${sessionId}/approvals`);
}

export async function approveApproval(approvalId: string) {
  return request<ApprovalDetail>(`/studio/approvals/${approvalId}/approve`, { method: "POST" });
}

export async function denyApproval(approvalId: string) {
  return request<ApprovalDetail>(`/studio/approvals/${approvalId}/deny`, { method: "POST" });
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
  available_models?: HermesModel[];
  available_model_count?: number;
  warnings?: string[];
}

export async function getModelConfig() {
  return request<ModelConfig>("/studio/model-config");
}

export async function updateModelConfig(input: { provider?: string; model?: string; base_url?: string; temperature?: number }) {
  return request<ModelConfig>("/studio/model-config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listAvailableModels() {
  return request<{ models: HermesModel[] }>("/studio/model-config/models");
}

export interface HermesInventorySummary {
  hermes_home: string;
  config_available: boolean;
  active_provider?: string | null;
  active_model?: string | null;
  provider_count: number;
  configured_provider_count: number;
  model_count: number;
  skill_count: number;
  installed_skill_count: number;
  mcp_server_count: number;
  toolset_count: number;
  fallback_provider_count?: number;
}

export interface HermesProvider {
  id: string;
  name: string;
  api_base_url?: string | null;
  doc_url?: string | null;
  npm_package?: string | null;
  env_keys: string[];
  model_count: number;
  configured: boolean;
  active: boolean;
  source: string;
}

export interface HermesModel {
  id: string;
  name: string;
  provider: string;
  provider_name?: string;
  family?: string | null;
  context_window?: number | null;
  output_limit?: number | null;
  reasoning?: boolean | null;
  tool_call?: boolean | null;
  structured_output?: boolean | null;
  attachments?: boolean | null;
  open_weights?: boolean | null;
  input_modalities?: string[];
  output_modalities?: string[];
  input_cost?: number | null;
  output_cost?: number | null;
  release_date?: string | null;
  last_updated?: string | null;
  source?: string;
}

export interface HermesSkill {
  id: string;
  name: string;
  title: string;
  description: string;
  category: string;
  version?: string | null;
  author?: string | null;
  tags: string[];
  related_skills: string[];
  prerequisites: Record<string, unknown>;
  source: "installed" | "bundled" | "optional" | string;
  installed: boolean;
  cli_name?: string;
  path: string;
  size_bytes: number;
  updated_at: string;
}

export interface HermesSkillActionResult {
  action: "check" | "update" | "install";
  available: boolean;
  ok: boolean;
  exit_code?: number | null;
  duration_ms: number;
  message?: string | null;
  error?: string | null;
  lines: string[];
  skills?: HermesSkill[];
}

export interface HermesMcpServer {
  id: string;
  command?: string | null;
  args: unknown[];
  env_keys: string[];
  env_configured: boolean;
  enabled: boolean;
  source: string;
}

export interface HermesMcpProbeResult {
  server_id: string;
  available: boolean;
  ok: boolean;
  status: "ok" | "warning" | "error";
  exit_code?: number | null;
  duration_ms: number;
  error?: string | null;
  message?: string | null;
  lines: string[];
}

export interface HermesToolset {
  id: string;
  platform: string;
  kind: string;
  enabled: boolean;
  source: string;
  label?: string;
}

export interface HermesToolsetConfigureResult {
  status: string;
  id: string;
  platform: string;
  enabled: boolean;
  source: string;
  message?: string;
  toolsets: HermesToolset[];
}

export interface HermesFallbackProvider {
  index: number;
  provider: string;
  provider_name?: string | null;
  model?: string | null;
  configured: boolean;
  active: boolean;
  api_base_url?: string | null;
  source: string;
}

export interface HermesInventoryResponse {
  summary: HermesInventorySummary;
  providers: HermesProvider[];
  models: HermesModel[];
  skills: HermesSkill[];
  mcp_servers: HermesMcpServer[];
  toolsets: HermesToolset[];
  fallback_providers?: HermesFallbackProvider[];
}

export async function getHermesInventory() {
  return request<HermesInventoryResponse>("/studio/hermes/inventory");
}

export async function getHermesFallbacks() {
  return request<{ fallback_providers: HermesFallbackProvider[]; total: number; summary: HermesInventorySummary }>("/studio/hermes/fallbacks");
}

export async function checkHermesSkills(name?: string) {
  return request<HermesSkillActionResult>("/studio/hermes/skills/check", {
    method: "POST",
    body: JSON.stringify(name ? { name } : {}),
  });
}

export async function updateHermesSkills(name?: string) {
  return request<HermesSkillActionResult>("/studio/hermes/skills/update", {
    method: "POST",
    body: JSON.stringify(name ? { name } : {}),
  });
}

export async function installHermesSkill(input: { identifier: string; category?: string; name?: string; force?: boolean }) {
  return request<HermesSkillActionResult>("/studio/hermes/skills/install", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface HermesCliStatus {
  available: boolean;
  version?: string;
  transport?: string;
  error?: string;
  commands: Record<string, boolean>;
  chat_flags: Record<string, boolean>;
}

export async function getHermesCliStatus() {
  return request<HermesCliStatus>("/studio/hermes/cli");
}

export interface HermesReleaseStatus {
  available: boolean;
  version?: string | null;
  update_check_available: boolean;
  update_available: boolean;
  up_to_date: boolean;
  behind_count?: number | null;
  lines: string[];
  update_lines: string[];
  error?: string | null;
}

export async function getHermesRelease() {
  return request<HermesReleaseStatus>("/studio/hermes/release");
}

export interface HermesDoctorCheck {
  section: string;
  level: "ok" | "warning" | "error";
  message: string;
}

export interface HermesDoctorStatus {
  available: boolean;
  exit_code?: number;
  error?: string | null;
  lines: string[];
  checks: HermesDoctorCheck[];
  ok_count?: number;
  warning_count?: number;
  error_count?: number;
}

export async function getHermesDoctor() {
  return request<HermesDoctorStatus>("/studio/hermes/doctor");
}

export interface HermesBrowserCacheStatus {
  playwright_cache_dir: string;
  playwright_cache_exists: boolean;
  playwright_browsers: string[];
  playwright_chromium_installed: boolean;
  puppeteer_cache_dir: string;
  puppeteer_cache_exists: boolean;
  puppeteer_browsers: string[];
  puppeteer_chrome_installed: boolean;
  note: string;
}

export async function getHermesBrowserCache() {
  return request<HermesBrowserCacheStatus>("/studio/hermes/browser-cache");
}

export async function testHermesMcpServer(serverId: string) {
  return request<HermesMcpProbeResult>(`/studio/hermes/mcp-servers/${encodeURIComponent(serverId)}/test`, {
    method: "POST",
  });
}

export async function configureHermesToolset(input: { id: string; platform: string; enabled: boolean }) {
  return request<HermesToolsetConfigureResult>("/studio/hermes/toolsets/configure", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface HermesCheckpointStoreStatus {
  available: boolean;
  error?: string;
  lines: string[];
  status?: Record<string, string>;
}

export async function getHermesCheckpointStoreStatus() {
  return request<HermesCheckpointStoreStatus>("/studio/hermes/checkpoints/status");
}

export interface HermesCheckpointPruneResult {
  action: "prune";
  available: boolean;
  ok: boolean;
  exit_code?: number | null;
  duration_ms: number;
  message?: string | null;
  error?: string | null;
  lines: string[];
  status?: HermesCheckpointStoreStatus | null;
}

export async function pruneHermesCheckpointStore(input?: { retention_days?: number; max_size_mb?: number; keep_orphans?: boolean }) {
  return request<HermesCheckpointPruneResult>("/studio/hermes/checkpoints/prune", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function getHermesModels(params?: { provider?: string; query?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.provider) search.set("provider", params.provider);
  if (params?.query) search.set("query", params.query);
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return request<{ models: HermesModel[]; total: number; summary: HermesInventorySummary }>(
    `/studio/hermes/models${qs ? `?${qs}` : ""}`,
  );
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

// ---------------------------------------------------------------------------
// Tool Packs
// ---------------------------------------------------------------------------

export interface ToolPackCommand {
  id: string;
  name: string;
  description: string;
  command: string;
  args?: { name: string; description?: string; required?: boolean; default?: unknown }[];
  env?: Record<string, string>;
}

export interface ToolPackInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  commands: ToolPackCommand[];
  trusted: boolean;
  permissions: string[];
  compat: { min_shell_version?: string; platform?: string[] };
  enabled: boolean;
  valid: boolean;
  warnings: string[];
  compatible: boolean;
  installed_at?: string;
  updated_at?: string;
}

export interface ToolPacksResponse {
  packs: ToolPackInfo[];
}

export async function getToolPacks() {
  return request<ToolPacksResponse>("/studio/tool-packs");
}

export async function getToolPack(packId: string) {
  return request<ToolPackInfo>(`/studio/tool-packs/${packId}`);
}

export async function enableToolPack(packId: string) {
  return request<ToolPackInfo>(`/studio/tool-packs/${packId}/enable`, {
    method: "POST",
  });
}

export async function disableToolPack(packId: string) {
  return request<ToolPackInfo>(`/studio/tool-packs/${packId}/disable`, {
    method: "POST",
  });
}

export async function installToolPack(sourcePath: string) {
  return request<ToolPackInfo>("/studio/tool-packs/install", {
    method: "POST",
    body: JSON.stringify({ path: sourcePath }),
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

export interface ArtifactListParams {
  type?: string;
  source?: string;
  run_id?: string;
  session_id?: string;
  card_id?: string;
  search?: string;
  include_archived?: boolean;
  limit?: number;
}

function artifactQuery(params?: ArtifactListParams) {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listArtifacts(params?: ArtifactListParams) {
  return request<ArtifactListResponse>(`/studio/artifacts${artifactQuery(params)}`);
}

export async function getArtifact(artifactId: string) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}`);
}

export async function createArtifact(input: ArtifactCreateRequest) {
  return request<ArtifactDetail>("/studio/artifacts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateArtifact(artifactId: string, input: ArtifactUpdateRequest) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listArtifactRevisions(artifactId: string, includeContent = false) {
  const query = includeContent ? "?include_content=true" : "";
  return request<ArtifactRevisionListResponse>(`/studio/artifacts/${artifactId}/revisions${query}`);
}

export async function revertArtifact(artifactId: string, version: number) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}/revert`, {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

export async function listArtifactVariantGroups(artifactId: string) {
  return request<ArtifactVariantGroupListResponse>(`/studio/artifacts/${artifactId}/variant-groups`);
}

export async function createArtifactVariantGroup(artifactId: string, input: ArtifactVariantGroupCreateRequest) {
  return request<ArtifactVariantGroupListResponse["groups"][number]>(`/studio/artifacts/${artifactId}/variant-groups`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function addArtifactVariant(groupId: string, input: ArtifactVariantCreateRequest) {
  return request<ArtifactVariantGroupListResponse["groups"][number]>(`/studio/artifact-variant-groups/${groupId}/variants`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function applyArtifactVariant(groupId: string, variantId: string) {
  return request<ArtifactDetail>(`/studio/artifact-variant-groups/${groupId}/apply`, {
    method: "POST",
    body: JSON.stringify({ variant_id: variantId }),
  });
}

export async function archiveArtifact(artifactId: string) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}/archive`, {
    method: "POST",
  });
}

export async function runArtifactBrowserEvidence(artifactId: string) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}/browser-evidence`, {
    method: "POST",
  });
}

export async function linkArtifactToRun(artifactId: string, runId: string) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}/link-run`, {
    method: "POST",
    body: JSON.stringify({ run_id: runId }),
  });
}

export async function linkArtifactToSession(artifactId: string, sessionId: string) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}/link-session`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function linkArtifactToCard(artifactId: string, cardId: string) {
  return request<ArtifactDetail>(`/studio/artifacts/${artifactId}/link-card`, {
    method: "POST",
    body: JSON.stringify({ kanban_card_id: cardId }),
  });
}

// ---------------------------------------------------------------------------
// Delegations (read-only)
// ---------------------------------------------------------------------------

export interface DelegationListParams {
  parent_run_id?: string;
  status?: string;
  limit?: number;
}

function delegationQuery(params?: DelegationListParams) {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listDelegations(params?: DelegationListParams) {
  return request<DelegationListResponse>(`/studio/delegations${delegationQuery(params)}`);
}

export async function getDelegation(delegationId: string) {
  return request<DelegationDetail>(`/studio/delegations/${delegationId}`);
}

// ---------------------------------------------------------------------------
// Cron Jobs (read-only)
// ---------------------------------------------------------------------------

export async function listCronJobs(limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<CronJobListResponse>(`/studio/cron-jobs?${params.toString()}`);
}

export async function getCronJob(jobId: string) {
  return request<CronJob>(`/studio/cron-jobs/${jobId}`);
}

function optionalQuery(params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value);
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function getCurrentContext(workspacePath?: string | null) {
  return request<ContextSnapshot>(`/studio/context/current${optionalQuery({ workspace_path: workspacePath })}`);
}

export async function getRunContext(runId: string) {
  return request<ContextSnapshot>(`/studio/context/runs/${runId}`);
}

export async function getSessionContext(sessionId: string) {
  return request<ContextSnapshot>(`/studio/context/sessions/${sessionId}`);
}

export async function getCurrentWorkspaceContext(workspacePath?: string | null) {
  return request<ContextSnapshot>(`/studio/context/workspaces/current${optionalQuery({ workspace_path: workspacePath })}`);
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
  id?: string;
  name: string;
  path: string;
  active?: boolean;
  is_active?: boolean;
  has_config?: boolean;
  has_state_db?: boolean;
  session_count?: number;
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

// ---------------------------------------------------------------------------
// Process Management
// ---------------------------------------------------------------------------

export interface ProcessInfo {
  id: string;
  template_id: string;
  name: string;
  command: string;
  status: "running" | "stopped" | "error" | "starting";
  pid: number | null;
  started_at: string;
  stopped_at: string | null;
  exit_code: number | null;
  log_count: number;
  error: string | null;
}

export interface ProcessTemplate {
  id: string;
  name: string;
  command: string;
  description: string;
  category?: string;
}

export interface ProcessesResponse {
  processes: ProcessInfo[];
  templates: ProcessTemplate[];
}

export interface ProcessLogsResponse {
  process_id: string;
  lines: string[];
  total: number;
}

export async function listProcesses() {
  return request<ProcessesResponse>("/studio/processes");
}

export async function startProcess(templateId: string, cwd?: string, env?: Record<string, string>) {
  return request<ProcessInfo>("/studio/processes/start", {
    method: "POST",
    body: JSON.stringify({ template_id: templateId, cwd, env }),
  });
}

export async function stopProcess(processId: string) {
  return request<ProcessInfo>(`/studio/processes/${processId}/stop`, {
    method: "POST",
  });
}

export async function getProcessLogs(processId: string, tail = 200) {
  const params = new URLSearchParams({ tail: String(tail) });
  return request<ProcessLogsResponse>(`/studio/processes/${processId}/logs?${params}`);
}

export async function removeProcess(processId: string) {
  return request<{ removed: boolean }>(`/studio/processes/${processId}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Checkpoints (read-only)
// ---------------------------------------------------------------------------

export interface Checkpoint {
  hash: string;
  short_hash: string;
  message: string;
  timestamp: string;
  author: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  is_head: boolean;
}

export interface CheckpointListResponse {
  checkpoints: Checkpoint[];
  total: number;
  workspace: string;
  is_git_repo: boolean;
}

export interface CheckpointDiffResponse {
  hash: string;
  stat: string;
  diff: string;
  files: string[];
  truncated: boolean;
}

export async function listCheckpoints(workspacePath: string, limit = 100) {
  const params = new URLSearchParams({ workspace_path: workspacePath, limit: String(limit) });
  return request<CheckpointListResponse>(`/studio/checkpoints?${params.toString()}`);
}

export async function getCheckpoint(commitHash: string, workspacePath: string) {
  const params = new URLSearchParams({ workspace_path: workspacePath });
  return request<Checkpoint>(`/studio/checkpoints/${commitHash}?${params.toString()}`);
}

export async function getCheckpointDiff(commitHash: string, workspacePath: string) {
  const params = new URLSearchParams({ workspace_path: workspacePath });
  return request<CheckpointDiffResponse>(`/studio/checkpoints/${commitHash}/diff?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

export interface Worktree {
  id: string;
  workspace_path: string;
  worktree_path: string;
  branch: string | null;
  head_hash: string | null;
  status: "main" | "active" | "idle";
  last_used_at: string | null;
  run_count: number;
  created_at: string;
}

export interface WorktreeListResponse {
  worktrees: Worktree[];
  is_git_repo: boolean;
  workspace: string;
}

export async function listWorktrees(workspacePath: string) {
  const params = new URLSearchParams({ workspace_path: workspacePath });
  return request<WorktreeListResponse>(`/studio/worktrees?${params.toString()}`);
}

export async function createWorktree(workspacePath: string, branch: string, newBranch = true) {
  return request<Worktree>("/studio/worktrees", {
    method: "POST",
    body: JSON.stringify({ workspace_path: workspacePath, branch, new_branch: newBranch }),
  });
}

export async function removeWorktree(worktreeId: string) {
  return request<{ removed: boolean; id: string }>(`/studio/worktrees/${worktreeId}`, {
    method: "DELETE",
  });
}

export async function startRunInWorktree(worktreeId: string, input: { prompt: string; session_id?: string; profile?: string }) {
  return request<RunResponse>(`/studio/worktrees/${worktreeId}/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
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
  | "memory.updated"
  | "lint.result";

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
  onApprovalResolved?: (payload: { approval_id: string; decision: string }) => void;
  onRunCompleted?: (payload: { run_id: string; total_tokens?: number; duration_ms?: number }) => void;
  onRunFailed?: (payload: { run_id: string; message: string }) => void;
  onRunCancelled?: (payload: { run_id: string; reason?: string }) => void;
  onKanbanUpdated?: (payload: KanbanUpdatedPayload) => void;
  onMemoryUpdated?: (payload: { session_id?: string; action: string }) => void;
  onLintResult?: (payload: { file: string; linter: string; issues: unknown[]; severity: string; fixable?: boolean }) => void;
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

        const { events, remainder } = parseSSEStream(buffer);
        buffer = remainder;

        for (const parsed of events) {
          try {
            const event = JSON.parse(parsed.data) as StudioEvent;
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
              case "approval.resolved":
                handlers.onApprovalResolved?.(event.payload as { approval_id: string; decision: string });
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
              case "lint.result":
                handlers.onLintResult?.(event.payload as { file: string; linter: string; issues: unknown[]; severity: string; fixable?: boolean });
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

        const { events, remainder } = parseSSEStream(buffer);
        buffer = remainder;

        for (const parsed of events) {
          try {
            const event = JSON.parse(parsed.data);
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
