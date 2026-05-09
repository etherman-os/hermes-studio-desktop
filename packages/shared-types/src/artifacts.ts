export type ArtifactType =
  | "markdown"
  | "text"
  | "log_snapshot"
  | "test_result"
  | "report"
  | "html"
  | "screenshot"
  | "file_reference"
  | "json"
  | "unknown";

export interface Artifact {
  id: string;
  title: string;
  type: ArtifactType;
  description: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  run_id: string | null;
  session_id: string | null;
  kanban_card_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  has_content: boolean;
}

export interface ArtifactEvent {
  id: string;
  artifact_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ArtifactRevision {
  id: string;
  artifact_id: string;
  version: number;
  title: string;
  type: ArtifactType;
  description: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source: string;
  event_type: string;
  created_at: string;
  has_content: boolean;
  content_text?: string | null;
}

export interface ArtifactVariant {
  id: string;
  group_id: string;
  label: string;
  title: string;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  rationale: string | null;
  score: number | null;
  created_at: string;
  updated_at: string;
  has_content: boolean;
  content_text?: string | null;
}

export interface ArtifactVariantGroup {
  id: string;
  source_artifact_id: string;
  title: string;
  brief: string | null;
  status: "draft" | "ready" | "applied" | "archived";
  winner_variant_id: string | null;
  created_at: string;
  updated_at: string;
  variants: ArtifactVariant[];
}

export interface ArtifactDetail extends Artifact {
  content_text?: string | null;
  events?: ArtifactEvent[];
  revisions?: ArtifactRevision[];
  variant_groups?: ArtifactVariantGroup[];
}

export interface ArtifactListResponse {
  artifacts: Artifact[];
  total: number;
}

export interface ArtifactRevisionListResponse {
  artifact_id: string;
  revisions: ArtifactRevision[];
  total: number;
}

export interface ArtifactVariantGroupListResponse {
  artifact_id: string;
  groups: ArtifactVariantGroup[];
  total: number;
}

export interface ArtifactCreateRequest {
  title: string;
  type?: ArtifactType;
  description?: string | null;
  content_text?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  run_id?: string | null;
  session_id?: string | null;
  kanban_card_id?: string | null;
  source?: string;
}

export interface ArtifactUpdateRequest {
  title?: string;
  type?: ArtifactType;
  description?: string | null;
  content_text?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  source?: string;
}

export interface ArtifactRevertRequest {
  version: number;
}

export interface ArtifactVariantCreateRequest {
  label?: string;
  title?: string;
  content_text?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  rationale?: string | null;
  score?: number | null;
}

export interface ArtifactVariantGroupCreateRequest {
  title?: string;
  brief?: string | null;
  status?: ArtifactVariantGroup["status"];
  variants?: ArtifactVariantCreateRequest[];
}

export interface ArtifactVariantApplyRequest {
  variant_id: string;
}

export interface ArtifactLinkRunRequest {
  run_id: string;
}

export interface ArtifactLinkSessionRequest {
  session_id: string;
}

export interface ArtifactLinkCardRequest {
  kanban_card_id: string;
}
