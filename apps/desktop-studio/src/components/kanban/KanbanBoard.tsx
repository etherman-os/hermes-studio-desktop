import React from "react";
import { getArtifact, type ArtifactDetail, type KanbanCard, type KanbanColumn } from "../../api/studioClient";
import { useArtifactStore } from "../../stores/artifactStore";
import { useContextStore } from "../../stores/contextStore";
import { useKanbanStore } from "../../stores/kanbanStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useThemeStore } from "../../stores/themeStore";
import { useUiStore } from "../../stores/uiStore";

type CardPriority = "low" | "medium" | "high" | "urgent";
type EditorMode = "create" | "edit";

const PRIORITIES: CardPriority[] = ["low", "medium", "high", "urgent"];
const MAX_CARD_ARTIFACT_PREVIEWS = 2;

interface CardEditorState {
  title: string;
  description: string;
  priority: CardPriority;
  columnId: string;
  sessionId: string;
  runId: string;
}

interface CardEditorProps {
  mode: EditorMode;
  card: KanbanCard | null;
  columns: KanbanColumn[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (state: CardEditorState) => Promise<void>;
}

function defaultColumn(columns: KanbanColumn[]) {
  return columns.find((column) => column.semantic_status === "inbox") ?? columns[0] ?? null;
}

function columnStatus(columns: KanbanColumn[], columnId: string) {
  return columns.find((column) => column.id === columnId)?.semantic_status ?? "";
}

function normalizePriority(value: string | null | undefined): CardPriority {
  return PRIORITIES.includes(value as CardPriority) ? value as CardPriority : "medium";
}

function formatUpdated(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function sanitizedPreviewDoc(content: string) {
  if (typeof window === "undefined") return content;
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  doc.querySelectorAll("script, form, iframe, object, embed").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    }
  });
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

function CardEditor({ mode, card, columns, saving, onCancel, onSubmit }: CardEditorProps) {
  const initialColumn = card?.column_id ?? defaultColumn(columns)?.id ?? "";
  const [state, setState] = React.useState<CardEditorState>({
    title: card?.title ?? "",
    description: card?.description ?? "",
    priority: normalizePriority(card?.priority),
    columnId: initialColumn,
    sessionId: card?.session_id ?? "",
    runId: card?.run_id ?? "",
  });
  const [validation, setValidation] = React.useState<string | null>(null);

  function update<K extends keyof CardEditorState>(key: K, value: CardEditorState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!state.title.trim()) {
      setValidation("Title is required");
      return;
    }
    if (!PRIORITIES.includes(state.priority)) {
      setValidation("Priority must be low, medium, high, or urgent");
      return;
    }
    if (!columns.some((column) => column.id === state.columnId)) {
      setValidation("Select a valid column");
      return;
    }
    setValidation(null);
    await onSubmit({
      ...state,
      title: state.title.trim(),
      description: state.description.trim(),
      sessionId: state.sessionId.trim(),
      runId: state.runId.trim(),
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <form className="studio-modal kanban-card-modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-header">
          <div>
            <div className="workbench-eyebrow">Board Card</div>
            <h2>{mode === "create" ? "Create Kanban Card" : "Edit Kanban Card"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Close">x</button>
        </div>
        <div className="modal-body kanban-editor-grid">
          <div className="new-run-main">
            <label className="field-label" htmlFor="kanban-card-title">Title</label>
            <input
              id="kanban-card-title"
              className="studio-input"
              value={state.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="Follow-up task, review, fix, or investigation"
              autoFocus
            />

            <label className="field-label" htmlFor="kanban-card-desc">Description</label>
            <textarea
              id="kanban-card-desc"
              className="studio-textarea kanban-editor-description"
              value={state.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="What should this card preserve from the run or session?"
            />
          </div>
          <div className="new-run-side">
            <label className="field-label" htmlFor="kanban-card-priority">Priority</label>
            <select
              id="kanban-card-priority"
              className="studio-select"
              value={state.priority}
              onChange={(event) => update("priority", normalizePriority(event.target.value))}
            >
              {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>

            <label className="field-label" htmlFor="kanban-card-column">Column</label>
            <select
              id="kanban-card-column"
              className="studio-select"
              value={state.columnId}
              onChange={(event) => update("columnId", event.target.value)}
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>{column.name}</option>
              ))}
            </select>

            <label className="field-label" htmlFor="kanban-card-session">Linked session ID</label>
            <input
              id="kanban-card-session"
              className="studio-input"
              value={state.sessionId}
              onChange={(event) => update("sessionId", event.target.value)}
              placeholder="Optional"
            />

            <label className="field-label" htmlFor="kanban-card-run">Linked run ID</label>
            <input
              id="kanban-card-run"
              className="studio-input"
              value={state.runId}
              onChange={(event) => update("runId", event.target.value)}
              placeholder="Optional"
            />

            {validation && <div className="inline-warning">{validation}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="tool-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving || !state.title.trim()}>
            {saving ? "Saving" : mode === "create" ? "Create Card" : "Save Card"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function KanbanBoard() {
  const board = useKanbanStore((s) => s.activeBoard);
  const loading = useKanbanStore((s) => s.loading);
  const saving = useKanbanStore((s) => s.saving);
  const error = useKanbanStore((s) => s.error);
  const actionMessage = useKanbanStore((s) => s.actionMessage);
  const lastLoadedAt = useKanbanStore((s) => s.lastLoadedAt);
  const loadDefaultBoard = useKanbanStore((s) => s.loadDefaultBoard);
  const refreshBoard = useKanbanStore((s) => s.refreshBoard);
  const createCard = useKanbanStore((s) => s.createCard);
  const updateCard = useKanbanStore((s) => s.updateCard);
  const moveCard = useKanbanStore((s) => s.moveCard);
  const archiveCard = useKanbanStore((s) => s.archiveCard);
  const linkCardToSession = useKanbanStore((s) => s.linkCardToSession);
  const linkCardToRun = useKanbanStore((s) => s.linkCardToRun);
  const artifacts = useArtifactStore((s) => s.artifacts);
  const loadArtifacts = useArtifactStore((s) => s.loadArtifacts);
  const selectArtifact = useArtifactStore((s) => s.selectArtifact);
  const createArtifact = useArtifactStore((s) => s.createArtifact);
  const artifactSaving = useArtifactStore((s) => s.saving);
  const loadRunContext = useContextStore((s) => s.loadRunContext);
  const loadSessionContext = useContextStore((s) => s.loadSessionContext);
  const setSidebarSection = useLayoutStore((s) => s.setSidebarSection);
  const setActiveTab = useLayoutStore((s) => s.setActiveTab);
  const showSidebar = useLayoutStore((s) => s.showSidebar);
  const label = useThemeStore((s) => s.label);
  const icon = useThemeStore((s) => s.icon);
  const openNewRun = useUiStore((s) => s.openNewRun);

  const [editor, setEditor] = React.useState<{ mode: EditorMode; card: KanbanCard | null } | null>(null);
  const [artifactDetails, setArtifactDetails] = React.useState<Record<string, ArtifactDetail>>({});
  const requestedInitialLoad = React.useRef(false);
  const requestedArtifactDetails = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (board || requestedInitialLoad.current) return;
    requestedInitialLoad.current = true;
    void loadDefaultBoard();
  }, [board, loadDefaultBoard]);

  React.useEffect(() => {
    void loadArtifacts({ limit: 250 });
  }, [loadArtifacts]);

  const columns = board?.columns ?? [];
  const activeCards = columns.flatMap((column) => column.cards).filter((card) => !card.archived_at);
  const inboxColumn = defaultColumn(columns);
  const artifactsByCardId = React.useMemo(() => {
    const grouped = new Map<string, typeof artifacts>();
    for (const artifact of artifacts) {
      if (!artifact.kanban_card_id) continue;
      const existing = grouped.get(artifact.kanban_card_id) ?? [];
      existing.push(artifact);
      grouped.set(artifact.kanban_card_id, existing);
    }
    return grouped;
  }, [artifacts]);

  React.useEffect(() => {
    const previewCandidates = artifacts
      .filter((artifact) => artifact.kanban_card_id && artifact.has_content)
      .filter((artifact) => !artifactDetails[artifact.id])
      .filter((artifact) => !requestedArtifactDetails.current.has(artifact.id))
      .slice(0, 24);
    if (previewCandidates.length === 0) return;
    previewCandidates.forEach((artifact) => requestedArtifactDetails.current.add(artifact.id));
    let cancelled = false;
    void Promise.all(previewCandidates.map((artifact) => getArtifact(artifact.id).catch(() => null))).then((details) => {
      if (cancelled) return;
      if (!details.some(Boolean)) return;
      setArtifactDetails((current) => {
        const next = { ...current };
        for (const detail of details) {
          if (detail) next[detail.id] = detail;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [artifactDetails, artifacts]);

  async function submitEditor(state: CardEditorState) {
    const status = columnStatus(columns, state.columnId);
    if (!status) return;

    if (editor?.mode === "edit" && editor.card) {
      const original = editor.card;
      const updated = await updateCard(original.id, {
        title: state.title,
        description: state.description,
        priority: state.priority,
        status,
      });
      if (!updated) return;
      if (state.columnId !== original.column_id) {
        const targetColumn = columns.find((column) => column.id === state.columnId);
        await moveCard(original.id, {
          column_id: state.columnId,
          position: targetColumn?.cards.length ?? 0,
        });
      }
      if (state.sessionId && state.sessionId !== original.session_id) await linkCardToSession(original.id, state.sessionId);
      if (state.runId && state.runId !== original.run_id) await linkCardToRun(original.id, state.runId);
      setEditor(null);
      return;
    }

    const targetColumn = columns.find((column) => column.id === state.columnId);
    const created = await createCard({
      title: state.title,
      description: state.description,
      priority: state.priority,
      column_id: state.columnId,
      status,
      position: targetColumn?.cards.length ?? 0,
      session_id: state.sessionId || null,
      run_id: state.runId || null,
    });
    if (created) setEditor(null);
  }

  async function moveToColumn(card: KanbanCard, columnId: string) {
    if (!columnId || columnId === card.column_id) return;
    const target = columns.find((column) => column.id === columnId);
    await moveCard(card.id, {
      column_id: columnId,
      position: target?.cards.length ?? 0,
    });
  }

  async function createArtifactFromCard(card: KanbanCard) {
    await createArtifact({
      title: `Card summary: ${card.title}`,
      type: "markdown",
      description: `Created from Kanban card ${card.id}`,
      content_text: [
        "# Kanban Card Summary",
        "",
        `- Card ID: ${card.id}`,
        `- Status: ${card.status}`,
        `- Priority: ${card.priority}`,
        `- Run: ${card.run_id ?? "none"}`,
        `- Session: ${card.session_id ?? "none"}`,
        "",
        "## Description",
        "",
        card.description || "(no description)",
      ].join("\n"),
      run_id: card.run_id,
      session_id: card.session_id,
      kanban_card_id: card.id,
      source: "kanban",
    });
    await loadArtifacts({ limit: 250 });
  }

  async function inspectCardContext(card: KanbanCard) {
    setSidebarSection("context");
    showSidebar();
    if (card.run_id) {
      await loadRunContext(card.run_id);
      return;
    }
    if (card.session_id) {
      await loadSessionContext(card.session_id);
    }
  }

  async function openLinkedArtifact(artifactId: string) {
    await selectArtifact(artifactId);
    setActiveTab("artifacts");
    setSidebarSection("artifacts");
    showSidebar();
  }

  function openKanbanSwarmRun() {
    const boardSnapshot = columns.map((column) => {
      const cards = column.cards
        .filter((card) => !card.archived_at)
        .map((card) => `- ${card.title} [${card.priority}]${card.run_id ? ` run:${card.run_id}` : ""}${card.session_id ? ` session:${card.session_id}` : ""}`)
        .join("\n");
      return `## ${column.name}\n${cards || "- empty"}`;
    }).join("\n\n");
    openNewRun({
      mode: "orchestration",
      prompt: [
        "Use Hermes Kanban and delegation capabilities to turn this Studio board into an executable multi-agent plan.",
        "Create task boundaries, dependencies, suggested profiles, verification checkpoints, and dispatch commands. Keep Hermes core untouched.",
        boardSnapshot ? `Current board:\n${boardSnapshot}` : "",
      ].filter(Boolean).join("\n\n"),
      skills: ["kanban-orchestrator", "kanban-worker", "subagent-driven-development"],
      toolsets: ["delegation", "todo", "terminal", "file", "skills"],
      checkpoints: true,
      maxTurns: 120,
      worktree: true,
      passSessionId: true,
    });
  }

  return (
    <div className="board-surface">
      <div className="surface-header">
        <div>
          <div className="workbench-eyebrow">{icon("kanban")} {label("kanban")}</div>
          <h2>Run and session control surface</h2>
        </div>
        <div className="surface-actions">
          <span className="surface-badge">Studio-owned studio.db</span>
          {lastLoadedAt && <span className="surface-badge">Updated {formatUpdated(lastLoadedAt)}</span>}
          <button className="tool-button" onClick={() => void refreshBoard()}>{loading ? "Refreshing" : "Refresh"}</button>
          <button className="tool-button" disabled={!board} onClick={openKanbanSwarmRun}>Plan Agent Swarm</button>
          <button
            className="primary-button"
            disabled={!inboxColumn || saving}
            onClick={() => setEditor({ mode: "create", card: null })}
          >
            Create Card
          </button>
        </div>
      </div>
      <div className="board-note">
        Board cards persist locally in Studio storage and can link to runs or Hermes sessions. Movement is intentionally a simple command until drag-and-drop earns its keep.
      </div>

      {(error || actionMessage) && (
        <div className={`run-ledger-notice ${error ? "warning" : ""}`}>
          {error ? `Board unavailable: ${error}` : actionMessage}
        </div>
      )}

      {loading && !board && (
        <div className="workbench-empty compact">Loading Studio-owned board...</div>
      )}

      {!loading && !board && (
        <div className="workbench-empty">
          <div className="workbench-empty-title">Kanban board unavailable</div>
          <div className="workbench-empty-copy">
            The adapter may be offline or auth may be missing. Kanban uses only `/studio/kanban/*` and never writes Hermes state.
          </div>
          <button className="tool-button" onClick={() => void loadDefaultBoard()}>Retry</button>
        </div>
      )}

      {board && activeCards.length === 0 && !loading && (
        <div className="workbench-empty compact">
          No workflow cards yet. Create a follow-up here, or create linked cards from Run Ledger and Sessions.
        </div>
      )}

      {board && (
        <div className="kanban-board" aria-label={`${board.name} Kanban board`}>
          {columns.map((col) => (
            <div key={col.id} className={`kanban-column kanban-column-${col.semantic_status}`}>
              <div className="kanban-column-header">
                <span>{col.name}</span>
                <span className="kanban-column-count">{col.cards.filter((card) => !card.archived_at).length}</span>
              </div>
              <div className="kanban-column-cards">
                {col.cards.filter((card) => !card.archived_at).length === 0 && (
                  <div className="kanban-empty-column">No linked work in this lane</div>
                )}
                {col.cards.filter((card) => !card.archived_at).map((card) => {
                  const cardArtifacts = artifactsByCardId.get(card.id) ?? [];
                  return (
                    <article key={card.id} className={`kanban-card priority-edge-${normalizePriority(card.priority)}`}>
                      <div className="kanban-card-main">
                        <div className="kanban-card-title">{card.title}</div>
                        {card.description && <div className="kanban-card-desc">{card.description}</div>}
                      </div>
                      {cardArtifacts.length > 0 && (
                        <div className="kanban-artifact-thumbnails">
                          {cardArtifacts.slice(0, MAX_CARD_ARTIFACT_PREVIEWS).map((artifact) => {
                            const detail = artifactDetails[artifact.id];
                            const previewText = detail?.content_text ?? artifact.description ?? artifact.title;
                            return (
                              <button
                                key={artifact.id}
                                className={`kanban-artifact-thumb artifact-type-${artifact.type}`}
                                type="button"
                                title={artifact.title}
                                onClick={() => void openLinkedArtifact(artifact.id)}
                              >
                                <span>{artifact.type}</span>
                                {artifact.type === "html" && detail?.content_text ? (
                                  <iframe
                                    title={`${artifact.title} thumbnail`}
                                    srcDoc={sanitizedPreviewDoc(detail.content_text)}
                                    sandbox=""
                                  />
                                ) : (
                                  <code>{previewText.slice(0, 180)}</code>
                                )}
                              </button>
                            );
                          })}
                          {cardArtifacts.length > MAX_CARD_ARTIFACT_PREVIEWS && (
                            <button
                              className="kanban-artifact-more"
                              type="button"
                              onClick={() => void openLinkedArtifact(cardArtifacts[MAX_CARD_ARTIFACT_PREVIEWS].id)}
                            >
                              +{cardArtifacts.length - MAX_CARD_ARTIFACT_PREVIEWS}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="kanban-card-meta">
                        <span className={`priority-badge priority-${normalizePriority(card.priority)}`}>{normalizePriority(card.priority)}</span>
                        {card.run_id && <span className="kanban-link-chip">Run {card.run_id}</span>}
                        {card.session_id && <span className="kanban-link-chip">Session {card.session_id}</span>}
                        <span className="kanban-link-chip">
                          {cardArtifacts.length} artifacts
                        </span>
                        <span>Updated {formatUpdated(card.updated_at)}</span>
                      </div>
                      <div className="kanban-card-actions">
                        <button className="tool-button" onClick={() => setEditor({ mode: "edit", card })}>Edit</button>
                        <button className="tool-button" disabled={artifactSaving} onClick={() => void createArtifactFromCard(card)}>Create Artifact</button>
                        {(card.run_id || card.session_id) && <button className="tool-button" onClick={() => void inspectCardContext(card)}>Context</button>}
                        <select
                          className="studio-select kanban-move-select"
                          value=""
                          disabled={saving}
                          aria-label={`Move ${card.title}`}
                          onChange={(event) => void moveToColumn(card, event.target.value)}
                        >
                          <option value="">Move to...</option>
                          {columns.map((column) => (
                            <option key={column.id} value={column.id} disabled={column.id === card.column_id}>
                              {column.name}
                            </option>
                          ))}
                        </select>
                        <button className="tool-button danger" disabled={saving} onClick={() => void archiveCard(card.id)}>Archive</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <CardEditor
          mode={editor.mode}
          card={editor.card}
          columns={columns}
          saving={saving}
          onCancel={() => setEditor(null)}
          onSubmit={submitEditor}
        />
      )}
    </div>
  );
}
